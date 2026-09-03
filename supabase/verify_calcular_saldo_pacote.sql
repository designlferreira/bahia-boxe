-- Testes de calcular_saldo_pacote() — os 8 casos do CLAUDE.md, rodáveis direto (mesmos IDs reais
-- já usados em verify_create_package.sql: professor Italo Souza, aluno 4cd0e555-...).
--
-- SEGURO DE RODAR CONTRA PRODUÇÃO: BEGIN/ROLLBACK — nenhum pacote/aula/recorrência de teste
-- sobrevive à transação, mesmo que sejam inseridos de verdade durante ela.
--
-- COMO USAR: rode o arquivo inteiro. Cada caso termina em um RAISE NOTICE comparando
-- total/consumidas/restantes/a_repor obtidos contra o esperado. Procure por "DIVERGIU" no
-- resultado — se não aparecer nenhum, os 8 casos bateram.

begin;

do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := '4cd0e555-728b-47ba-ba3c-073b54d28af3';
  v_recorrencia_id uuid;

  v_pkg uuid;
  v_id1 uuid;
  v_id2 uuid;
  v_saldo record;
begin
  -- Só o GUC, sem `set local role authenticated`: calcular_saldo_pacote é security definer, roda
  -- com o dono da função pra suas próprias queries internas independente do role de quem chama —
  -- só precisa que auth.uid() resolva certo (lê só o GUC, não o role atual). Trocar de role
  -- também arriscaria as inserções de dado de teste abaixo esbarrarem em RLS de packages/bookings
  -- que nunca foi pensada pra permitir insert direto do cliente (só via RPC) — o que não é o que
  -- este script quer testar.
  perform set_config('request.jwt.claims', json_build_object('sub', v_professor_id, 'role', 'authenticated')::text, true);

  insert into public.aluno_recorrencia (aluno_id, dia_semana, horario, duracao, ativo)
  values (v_aluno_id, 1, '18:00', interval '1 hour', true)
  returning id into v_recorrencia_id;

  -- ===========================================================================================
  -- CASO 1 — pacote de 8 aulas, todas AGENDADA (scheduled) → saldo 8
  -- ===========================================================================================
  insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
  values (v_aluno_id, 8, 0, 'active', 'recurrence', 'package', v_recorrencia_id, true)
  returning id into v_pkg;

  insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id)
  select gen_random_uuid(), v_aluno_id, v_professor_id,
         now() + (n || ' days')::interval, now() + (n || ' days')::interval + interval '1 hour',
         'scheduled', 'package', v_pkg, gen_random_uuid()
  from generate_series(1, 8) n;
  -- cada linha inserida acima é raiz (não tem sucessora) — cadeia_id precisa ser o PRÓPRIO id,
  -- não o segundo gen_random_uuid() gerado por linha (não dava pra saber o id antes do insert
  -- terminar). Corrige em lote.
  update public.bookings set cadeia_id = id where pacote_id = v_pkg;

  select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
  if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (8, 0, 8, 0) then
    raise notice 'CASO 1 (8 scheduled): OK — total=%, consumidas=%, restantes=%, a_repor=%', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  else
    raise notice 'CASO 1 (8 scheduled): DIVERGIU — obtido total=%, consumidas=%, restantes=%, a_repor=% | esperado 8,0,8,0', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  end if;

  -- ===========================================================================================
  -- CASO 2 — mesmo pacote do caso 1, 2 dessas 8 viram REALIZADA (completed) → saldo 6
  -- ===========================================================================================
  update public.bookings
  set status = 'completed'
  where id in (select id from public.bookings where pacote_id = v_pkg order by start_time limit 2);

  select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
  if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (8, 2, 6, 0) then
    raise notice 'CASO 2 (2 completed): OK — total=%, consumidas=%, restantes=%, a_repor=%', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  else
    raise notice 'CASO 2 (2 completed): DIVERGIU — obtido total=%, consumidas=%, restantes=%, a_repor=% | esperado 8,2,6,0', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  end if;

  -- ===========================================================================================
  -- CASO 3 — aula remarcada 2x e depois REALIZADA → consome EXATAMENTE 1 crédito (não 3)
  -- ===========================================================================================
  insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
  values (v_aluno_id, 1, 0, 'active', 'recurrence', 'package', v_recorrencia_id, true)
  returning id into v_pkg;

  v_id1 := gen_random_uuid();
  insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id)
  values (v_id1, v_aluno_id, v_professor_id, now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 'rescheduled', 'package', v_pkg, v_id1);

  v_id2 := gen_random_uuid();
  insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id, replacement_for_booking_id, is_replacement)
  values (v_id2, v_aluno_id, v_professor_id, now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'rescheduled', 'package', v_pkg, v_id1, v_id1, true);

  insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id, replacement_for_booking_id, is_replacement)
  values (gen_random_uuid(), v_aluno_id, v_professor_id, now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 'completed', 'package', v_pkg, v_id1, v_id2, true);

  select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
  if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (1, 1, 0, 0) then
    raise notice 'CASO 3 (remarcada 2x + completed): OK — total=%, consumidas=%, restantes=%, a_repor=%', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  else
    raise notice 'CASO 3 (remarcada 2x + completed): DIVERGIU — obtido total=%, consumidas=%, restantes=%, a_repor=% | esperado 1,1,0,0', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  end if;

  -- ===========================================================================================
  -- CASO 4 — FALTA com falta_consome_credito = true → consome
  -- ===========================================================================================
  insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
  values (v_aluno_id, 1, 0, 'active', 'recurrence', 'package', v_recorrencia_id, true)
  returning id into v_pkg;

  v_id1 := gen_random_uuid();
  insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id)
  values (v_id1, v_aluno_id, v_professor_id, now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 'no_show', 'package', v_pkg, v_id1);

  select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
  if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (1, 1, 0, 0) then
    raise notice 'CASO 4 (no_show, falta_consome=true): OK — total=%, consumidas=%, restantes=%, a_repor=%', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  else
    raise notice 'CASO 4 (no_show, falta_consome=true): DIVERGIU — obtido total=%, consumidas=%, restantes=%, a_repor=% | esperado 1,1,0,0', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  end if;

  -- ===========================================================================================
  -- CASO 5 — FALTA com falta_consome_credito = false → não consome, saldo intacto, aguardando reposição
  -- ===========================================================================================
  insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
  values (v_aluno_id, 1, 0, 'active', 'recurrence', 'package', v_recorrencia_id, false)
  returning id into v_pkg;

  v_id1 := gen_random_uuid();
  insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id)
  values (v_id1, v_aluno_id, v_professor_id, now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 'no_show', 'package', v_pkg, v_id1);

  select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
  if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (1, 0, 1, 1) then
    raise notice 'CASO 5 (no_show, falta_consome=false): OK — total=%, consumidas=%, restantes=%, a_repor=%', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  else
    raise notice 'CASO 5 (no_show, falta_consome=false): DIVERGIU — obtido total=%, consumidas=%, restantes=%, a_repor=% | esperado 1,0,1,1', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  end if;

  -- ===========================================================================================
  -- CASO 6 — CANCELADA por PROFESSOR com falta_consome_credito = true → NÃO consome
  -- ===========================================================================================
  insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
  values (v_aluno_id, 1, 0, 'active', 'recurrence', 'package', v_recorrencia_id, true)
  returning id into v_pkg;

  v_id1 := gen_random_uuid();
  insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id, cancelado_por)
  values (v_id1, v_aluno_id, v_professor_id, now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 'cancelled', 'package', v_pkg, v_id1, 'professor');

  select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
  if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (1, 0, 1, 0) then
    raise notice 'CASO 6 (cancelled por professor, falta_consome=true): OK — total=%, consumidas=%, restantes=%, a_repor=%', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  else
    raise notice 'CASO 6 (cancelled por professor, falta_consome=true): DIVERGIU — obtido total=%, consumidas=%, restantes=%, a_repor=% | esperado 1,0,1,0', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  end if;

  -- ===========================================================================================
  -- CASO 7 — CANCELADA por ALUNO com falta_consome_credito = true → consome
  -- ===========================================================================================
  insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
  values (v_aluno_id, 1, 0, 'active', 'recurrence', 'package', v_recorrencia_id, true)
  returning id into v_pkg;

  v_id1 := gen_random_uuid();
  insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id, cancelado_por)
  values (v_id1, v_aluno_id, v_professor_id, now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 'cancelled', 'package', v_pkg, v_id1, 'aluno');

  select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
  if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (1, 1, 0, 0) then
    raise notice 'CASO 7 (cancelled por aluno, falta_consome=true): OK — total=%, consumidas=%, restantes=%, a_repor=%', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  else
    raise notice 'CASO 7 (cancelled por aluno, falta_consome=true): DIVERGIU — obtido total=%, consumidas=%, restantes=%, a_repor=% | esperado 1,1,0,0', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  end if;

  -- ===========================================================================================
  -- CASO 8 — no_show perdoado + reposição REALIZADA → consome 1 no total, a_repor = 0
  -- ===========================================================================================
  insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
  values (v_aluno_id, 1, 0, 'active', 'recurrence', 'package', v_recorrencia_id, false)
  returning id into v_pkg;

  v_id1 := gen_random_uuid();
  insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id)
  values (v_id1, v_aluno_id, v_professor_id, now() - interval '5 days', now() - interval '5 days' + interval '1 hour', 'no_show', 'package', v_pkg, v_id1);

  insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id, replacement_for_booking_id, is_replacement)
  values (gen_random_uuid(), v_aluno_id, v_professor_id, now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 'completed', 'package', v_pkg, v_id1, v_id1, true);

  select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
  if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (1, 1, 0, 0) then
    raise notice 'CASO 8 (no_show perdoado + reposicao completed): OK — total=%, consumidas=%, restantes=%, a_repor=%', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  else
    raise notice 'CASO 8 (no_show perdoado + reposicao completed): DIVERGIU — obtido total=%, consumidas=%, restantes=%, a_repor=% | esperado 1,1,0,0', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  end if;

end;
$$;

rollback;

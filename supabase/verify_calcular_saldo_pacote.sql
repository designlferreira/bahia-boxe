-- Testes de calcular_saldo_pacote() — os 8 casos do CLAUDE.md.
--
-- Aluno de teste dedicado (b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8, criado pela aplicação, não é
-- aluno real) — professor real (Italo Souza, único professor deste banco, só usado como admin_id
-- de referência, nunca escrito).
--
-- ISOLAMENTO ENTRE CASOS: cada caso roda entre SAVEPOINT/ROLLBACK TO SAVEPOINT. O índice
-- ux_packages_one_active_purchase_per_student (descoberto rodando a versão anterior deste script)
-- só permite UM pacote 'active' não-trial por aluno — sem isolar por caso, o caso 2 colidiria com
-- o pacote ainda ativo do caso 1. ROLLBACK TO SAVEPOINT desfaz o que o caso criou (sucesso ou
-- falha) antes do próximo começar, então todos os 8 partem do mesmo estado limpo e a falha de um
-- não contamina os seguintes.
--
-- SAVEPOINT/ROLLBACK TO SAVEPOINT são comandos soltos, fora de qualquer DO — PL/pgSQL não expõe
-- isso como statement interno. Por isso setup + chamada de calcular_saldo_pacote + RAISE NOTICE
-- de cada caso vivem num único DO (não dá pra passar o id do pacote entre blocos DO separados).
--
-- SE UM CASO NÃO APARECER NO OUTPUT: o setup dele lançou um erro inesperado antes de chegar no
-- RAISE NOTICE — o ROLLBACK TO SAVEPOINT ainda roda e recupera a transação pro caso seguinte, mas
-- esse caso específico fica sem veredito aqui (o erro do Postgres aparece acima, no resultado do
-- próprio DO que falhou).
--
-- COMO USAR: rode o arquivo inteiro. Procure por "DIVERGIU" ou "ERRO" no resultado — se não
-- aparecer nenhum e os 8 "OK" aparecerem, os casos bateram.

begin;

do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'; -- aluno de teste dedicado
  v_recorrencia_id uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_professor_id, 'role', 'authenticated')::text, true);

  -- Uma recorrência de teste só, reusada pelos 8 casos (inerte pro que está sendo testado —
  -- calcular_saldo_pacote só checa recorrencia_id is not null, nunca lê o conteúdo da linha).
  -- Fica fora de qualquer SAVEPOINT de caso, então sobrevive aos ROLLBACK TO SAVEPOINT entre eles.
  insert into public.aluno_recorrencia (aluno_id, dia_semana, horario, duracao, ativo)
  values (v_aluno_id, 1, '18:00', interval '1 hour', true)
  returning id into v_recorrencia_id;

  perform set_config('bahia_boxe.test_recorrencia_id', v_recorrencia_id::text, true);
end;
$$;

-- =================================================================================================
-- CASO 1 — pacote de 8 aulas, todas AGENDADA (scheduled) → saldo 8
-- =================================================================================================
savepoint caso_1;
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_saldo record;
begin
  insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
  values (v_aluno_id, 8, 0, 'active', 'recurrence', 'package', v_recorrencia_id, true)
  returning id into v_pkg;

  insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id)
  select gen_random_uuid(), v_aluno_id, v_professor_id,
         now() + (n || ' days')::interval, now() + (n || ' days')::interval + interval '1 hour',
         'scheduled', 'package', v_pkg, gen_random_uuid()
  from generate_series(1, 8) n;
  update public.bookings set cadeia_id = id where pacote_id = v_pkg;

  select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
  if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (8, 0, 8, 0) then
    raise notice 'CASO 1 (8 scheduled): OK — total=%, consumidas=%, restantes=%, a_repor=%', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  else
    raise notice 'CASO 1 (8 scheduled): DIVERGIU — obtido total=%, consumidas=%, restantes=%, a_repor=% | esperado 8,0,8,0', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  end if;
exception when others then
  raise notice 'CASO 1: ERRO INESPERADO — %', sqlerrm;
end;
$$;
rollback to savepoint caso_1;

-- =================================================================================================
-- CASO 2 — pacote de 8 aulas, 2 viram REALIZADA (completed) → saldo 6
-- =================================================================================================
savepoint caso_2;
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_saldo record;
begin
  insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
  values (v_aluno_id, 8, 0, 'active', 'recurrence', 'package', v_recorrencia_id, true)
  returning id into v_pkg;

  insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id)
  select gen_random_uuid(), v_aluno_id, v_professor_id,
         now() + (n || ' days')::interval, now() + (n || ' days')::interval + interval '1 hour',
         case when n <= 2 then 'completed' else 'scheduled' end, 'package', v_pkg, gen_random_uuid()
  from generate_series(1, 8) n;
  update public.bookings set cadeia_id = id where pacote_id = v_pkg;

  select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
  if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (8, 2, 6, 0) then
    raise notice 'CASO 2 (2 completed): OK — total=%, consumidas=%, restantes=%, a_repor=%', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  else
    raise notice 'CASO 2 (2 completed): DIVERGIU — obtido total=%, consumidas=%, restantes=%, a_repor=% | esperado 8,2,6,0', v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor;
  end if;
exception when others then
  raise notice 'CASO 2: ERRO INESPERADO — %', sqlerrm;
end;
$$;
rollback to savepoint caso_2;

-- =================================================================================================
-- CASO 3 — aula remarcada 2x e depois REALIZADA → consome EXATAMENTE 1 crédito (não 3)
-- =================================================================================================
savepoint caso_3;
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_id1 uuid;
  v_id2 uuid;
  v_saldo record;
begin
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
exception when others then
  raise notice 'CASO 3: ERRO INESPERADO — %', sqlerrm;
end;
$$;
rollback to savepoint caso_3;

-- =================================================================================================
-- CASO 4 — FALTA com falta_consome_credito = true → consome
-- =================================================================================================
savepoint caso_4;
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_id1 uuid;
  v_saldo record;
begin
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
exception when others then
  raise notice 'CASO 4: ERRO INESPERADO — %', sqlerrm;
end;
$$;
rollback to savepoint caso_4;

-- =================================================================================================
-- CASO 5 — FALTA com falta_consome_credito = false → não consome, saldo intacto, aguardando reposição
-- =================================================================================================
savepoint caso_5;
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_id1 uuid;
  v_saldo record;
begin
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
exception when others then
  raise notice 'CASO 5: ERRO INESPERADO — %', sqlerrm;
end;
$$;
rollback to savepoint caso_5;

-- =================================================================================================
-- CASO 6 — CANCELADA por PROFESSOR com falta_consome_credito = true → NÃO consome
-- =================================================================================================
savepoint caso_6;
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_id1 uuid;
  v_saldo record;
begin
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
exception when others then
  raise notice 'CASO 6: ERRO INESPERADO — %', sqlerrm;
end;
$$;
rollback to savepoint caso_6;

-- =================================================================================================
-- CASO 7 — CANCELADA por ALUNO com falta_consome_credito = true → consome
-- =================================================================================================
savepoint caso_7;
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_id1 uuid;
  v_saldo record;
begin
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
exception when others then
  raise notice 'CASO 7: ERRO INESPERADO — %', sqlerrm;
end;
$$;
rollback to savepoint caso_7;

-- =================================================================================================
-- CASO 8 — no_show perdoado + reposição REALIZADA → consome 1 no total, a_repor = 0
-- =================================================================================================
savepoint caso_8;
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_id1 uuid;
  v_saldo record;
begin
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
exception when others then
  raise notice 'CASO 8: ERRO INESPERADO — %', sqlerrm;
end;
$$;
rollback to savepoint caso_8;

rollback;

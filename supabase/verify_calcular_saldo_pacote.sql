-- Testes de calcular_saldo_pacote() — os 8 casos do CLAUDE.md.
--
-- Aluno de teste dedicado (b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8, criado pela aplicação, não é
-- aluno real) — professor real (Italo Souza, único professor deste banco, só usado como admin_id
-- de referência, nunca escrito).
--
-- VEREDITOS SAEM COMO RESULTADO DE QUERY, não RAISE NOTICE — o SQL Editor do Supabase não expõe
-- NOTICE na interface. Uma tabela temporária (`resultados`) é criada no início; cada caso insere
-- sua própria linha nela; o SELECT final (antes do ROLLBACK) mostra tudo de uma vez, na aba normal
-- de resultado.
--
-- ISOLAMENTO ENTRE CASOS, sem SAVEPOINT/ROLLBACK TO SAVEPOINT como comando solto: cada caso roda
-- dentro de um bloco BEGIN...EXCEPTION...END aninhado no seu DO (todo bloco desses já é apoiado
-- por um savepoint implícito do PL/pgSQL). Depois de montar pacote/bookings e calcular o veredicto
-- em variáveis locais, o bloco levanta uma exceção DE PROPÓSITO com um SQLSTATE customizado
-- ('BB999') — isso desfaz os dados de teste daquele caso (packages/bookings), mas as variáveis
-- v_veredicto/v_detalhe sobrevivem: PL/pgSQL só desfaz estado do BANCO numa exceção, nunca
-- variáveis locais. Um erro de verdade (não o marcador) cai no mesmo EXCEPTION WHEN OTHERS e vira
-- 'ERRO' na tabela em vez de travar os casos seguintes. Sem isso (por exemplo, tentando guardar o
-- resultado numa "session variable" via set_config com is_local=false antes de desfazer): não
-- funcionaria — set_config com is_local=false só muda o que sobrevive ao COMMIT, não ao ROLLBACK;
-- um ROLLBACK (ou ROLLBACK TO SAVEPOINT) desfaz a mudança de configuração igual desfaz uma linha.
--
-- O índice ux_packages_one_active_purchase_per_student (descoberto testando a versão anterior
-- deste script) só permite UM pacote 'active' não-trial por aluno — é exatamente esse desfazer por
-- caso que evita o caso 2 colidir com o pacote ainda ativo do caso 1.
--
-- Com esse desenho, TODO caso sempre produz exatamente uma linha na tabela de resultados —
-- sucesso, divergência ou erro — nunca "some" do output.
--
-- COMO USAR: rode o arquivo inteiro. O último SELECT mostra as 8 linhas, uma por caso. Procure por
-- "DIVERGIU" ou "ERRO" na coluna veredicto — se só aparecer "OK", os 8 casos bateram.

begin;

create temp table resultados (
  ordem int,
  caso text,
  veredicto text,
  detalhe text
);

do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_professor_id, 'role', 'authenticated')::text, true);

  -- Uma recorrência de teste só, reusada pelos 8 casos (inerte pro que está sendo testado —
  -- calcular_saldo_pacote só checa recorrencia_id is not null, nunca lê o conteúdo da linha).
  -- Criada antes de qualquer caso, então nenhum bloco aninhado de caso a desfaz.
  insert into public.aluno_recorrencia (aluno_id, dia_semana, horario, duracao, ativo)
  values (v_aluno_id, 1, '18:00', interval '1 hour', true)
  returning id into v_recorrencia_id;

  perform set_config('bahia_boxe.test_recorrencia_id', v_recorrencia_id::text, true);
end;
$$;

-- =================================================================================================
-- CASO 1 — pacote de 8 aulas, todas AGENDADA (scheduled) → saldo 8
-- =================================================================================================
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_saldo record;
  v_veredicto text;
  v_detalhe text;
begin
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
      v_veredicto := 'OK';
    else
      v_veredicto := 'DIVERGIU';
    end if;
    v_detalhe := format('obtido total=%s consumidas=%s restantes=%s a_repor=%s | esperado 8,0,8,0',
                         v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor);

    raise exception using errcode = 'BB999', message = 'rollback_setup_teste';
  exception
    when sqlstate 'BB999' then
      null;
    when others then
      v_veredicto := 'ERRO';
      v_detalhe := sqlerrm;
  end;

  insert into resultados (ordem, caso, veredicto, detalhe)
  values (1, 'CASO 1 — 8 scheduled', v_veredicto, v_detalhe);
end;
$$;

-- =================================================================================================
-- CASO 2 — pacote de 8 aulas, 2 viram REALIZADA (completed) → saldo 6
-- =================================================================================================
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_saldo record;
  v_veredicto text;
  v_detalhe text;
begin
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
      v_veredicto := 'OK';
    else
      v_veredicto := 'DIVERGIU';
    end if;
    v_detalhe := format('obtido total=%s consumidas=%s restantes=%s a_repor=%s | esperado 8,2,6,0',
                         v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor);

    raise exception using errcode = 'BB999', message = 'rollback_setup_teste';
  exception
    when sqlstate 'BB999' then
      null;
    when others then
      v_veredicto := 'ERRO';
      v_detalhe := sqlerrm;
  end;

  insert into resultados (ordem, caso, veredicto, detalhe)
  values (2, 'CASO 2 — 2 completed', v_veredicto, v_detalhe);
end;
$$;

-- =================================================================================================
-- CASO 3 — aula remarcada 2x e depois REALIZADA → consome EXATAMENTE 1 crédito (não 3)
-- =================================================================================================
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_id1 uuid;
  v_id2 uuid;
  v_saldo record;
  v_veredicto text;
  v_detalhe text;
begin
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
      v_veredicto := 'OK';
    else
      v_veredicto := 'DIVERGIU';
    end if;
    v_detalhe := format('obtido total=%s consumidas=%s restantes=%s a_repor=%s | esperado 1,1,0,0',
                         v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor);

    raise exception using errcode = 'BB999', message = 'rollback_setup_teste';
  exception
    when sqlstate 'BB999' then
      null;
    when others then
      v_veredicto := 'ERRO';
      v_detalhe := sqlerrm;
  end;

  insert into resultados (ordem, caso, veredicto, detalhe)
  values (3, 'CASO 3 — remarcada 2x + completed', v_veredicto, v_detalhe);
end;
$$;

-- =================================================================================================
-- CASO 4 — FALTA com falta_consome_credito = true → consome
-- =================================================================================================
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_id1 uuid;
  v_saldo record;
  v_veredicto text;
  v_detalhe text;
begin
  begin
    insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
    values (v_aluno_id, 1, 0, 'active', 'recurrence', 'package', v_recorrencia_id, true)
    returning id into v_pkg;

    v_id1 := gen_random_uuid();
    insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id)
    values (v_id1, v_aluno_id, v_professor_id, now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 'no_show', 'package', v_pkg, v_id1);

    select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
    if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (1, 1, 0, 0) then
      v_veredicto := 'OK';
    else
      v_veredicto := 'DIVERGIU';
    end if;
    v_detalhe := format('obtido total=%s consumidas=%s restantes=%s a_repor=%s | esperado 1,1,0,0',
                         v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor);

    raise exception using errcode = 'BB999', message = 'rollback_setup_teste';
  exception
    when sqlstate 'BB999' then
      null;
    when others then
      v_veredicto := 'ERRO';
      v_detalhe := sqlerrm;
  end;

  insert into resultados (ordem, caso, veredicto, detalhe)
  values (4, 'CASO 4 — no_show, falta_consome=true', v_veredicto, v_detalhe);
end;
$$;

-- =================================================================================================
-- CASO 5 — FALTA com falta_consome_credito = false → não consome, saldo intacto, aguardando reposição
-- =================================================================================================
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_id1 uuid;
  v_saldo record;
  v_veredicto text;
  v_detalhe text;
begin
  begin
    insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
    values (v_aluno_id, 1, 0, 'active', 'recurrence', 'package', v_recorrencia_id, false)
    returning id into v_pkg;

    v_id1 := gen_random_uuid();
    insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id)
    values (v_id1, v_aluno_id, v_professor_id, now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 'no_show', 'package', v_pkg, v_id1);

    select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
    if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (1, 0, 1, 1) then
      v_veredicto := 'OK';
    else
      v_veredicto := 'DIVERGIU';
    end if;
    v_detalhe := format('obtido total=%s consumidas=%s restantes=%s a_repor=%s | esperado 1,0,1,1',
                         v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor);

    raise exception using errcode = 'BB999', message = 'rollback_setup_teste';
  exception
    when sqlstate 'BB999' then
      null;
    when others then
      v_veredicto := 'ERRO';
      v_detalhe := sqlerrm;
  end;

  insert into resultados (ordem, caso, veredicto, detalhe)
  values (5, 'CASO 5 — no_show, falta_consome=false', v_veredicto, v_detalhe);
end;
$$;

-- =================================================================================================
-- CASO 6 — CANCELADA por PROFESSOR com falta_consome_credito = true → NÃO consome
-- =================================================================================================
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_id1 uuid;
  v_saldo record;
  v_veredicto text;
  v_detalhe text;
begin
  begin
    insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
    values (v_aluno_id, 1, 0, 'active', 'recurrence', 'package', v_recorrencia_id, true)
    returning id into v_pkg;

    v_id1 := gen_random_uuid();
    insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id, cancelado_por)
    values (v_id1, v_aluno_id, v_professor_id, now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 'cancelled', 'package', v_pkg, v_id1, 'professor');

    select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
    if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (1, 0, 1, 0) then
      v_veredicto := 'OK';
    else
      v_veredicto := 'DIVERGIU';
    end if;
    v_detalhe := format('obtido total=%s consumidas=%s restantes=%s a_repor=%s | esperado 1,0,1,0',
                         v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor);

    raise exception using errcode = 'BB999', message = 'rollback_setup_teste';
  exception
    when sqlstate 'BB999' then
      null;
    when others then
      v_veredicto := 'ERRO';
      v_detalhe := sqlerrm;
  end;

  insert into resultados (ordem, caso, veredicto, detalhe)
  values (6, 'CASO 6 — cancelled por professor, falta_consome=true', v_veredicto, v_detalhe);
end;
$$;

-- =================================================================================================
-- CASO 7 — CANCELADA por ALUNO com falta_consome_credito = true → consome
-- =================================================================================================
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_id1 uuid;
  v_saldo record;
  v_veredicto text;
  v_detalhe text;
begin
  begin
    insert into public.packages (student_id, total_classes, used_classes, status, origin, kind, recorrencia_id, falta_consome_credito)
    values (v_aluno_id, 1, 0, 'active', 'recurrence', 'package', v_recorrencia_id, true)
    returning id into v_pkg;

    v_id1 := gen_random_uuid();
    insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, cadeia_id, cancelado_por)
    values (v_id1, v_aluno_id, v_professor_id, now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 'cancelled', 'package', v_pkg, v_id1, 'aluno');

    select * into v_saldo from public.calcular_saldo_pacote(v_pkg);
    if (v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor) = (1, 1, 0, 0) then
      v_veredicto := 'OK';
    else
      v_veredicto := 'DIVERGIU';
    end if;
    v_detalhe := format('obtido total=%s consumidas=%s restantes=%s a_repor=%s | esperado 1,1,0,0',
                         v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor);

    raise exception using errcode = 'BB999', message = 'rollback_setup_teste';
  exception
    when sqlstate 'BB999' then
      null;
    when others then
      v_veredicto := 'ERRO';
      v_detalhe := sqlerrm;
  end;

  insert into resultados (ordem, caso, veredicto, detalhe)
  values (7, 'CASO 7 — cancelled por aluno, falta_consome=true', v_veredicto, v_detalhe);
end;
$$;

-- =================================================================================================
-- CASO 8 — no_show perdoado + reposição REALIZADA → consome 1 no total, a_repor = 0
-- =================================================================================================
do $$
declare
  v_professor_id uuid := '7da8bf09-a200-4831-9d4c-233ef76fad39';
  v_aluno_id uuid := 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
  v_recorrencia_id uuid := current_setting('bahia_boxe.test_recorrencia_id')::uuid;
  v_pkg uuid;
  v_id1 uuid;
  v_saldo record;
  v_veredicto text;
  v_detalhe text;
begin
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
      v_veredicto := 'OK';
    else
      v_veredicto := 'DIVERGIU';
    end if;
    v_detalhe := format('obtido total=%s consumidas=%s restantes=%s a_repor=%s | esperado 1,1,0,0',
                         v_saldo.total, v_saldo.consumidas, v_saldo.restantes, v_saldo.a_repor);

    raise exception using errcode = 'BB999', message = 'rollback_setup_teste';
  exception
    when sqlstate 'BB999' then
      null;
    when others then
      v_veredicto := 'ERRO';
      v_detalhe := sqlerrm;
  end;

  insert into resultados (ordem, caso, veredicto, detalhe)
  values (8, 'CASO 8 — no_show perdoado + reposicao completed', v_veredicto, v_detalhe);
end;
$$;

select * from resultados order by ordem;

rollback;

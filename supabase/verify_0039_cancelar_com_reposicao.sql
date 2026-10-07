-- Verificação da 0039 — cancelar_aula com reposição automática.
--
-- NÃO destrutivo: transação terminada em `rollback`. As aulas de teste são criadas DENTRO da
-- transação, em horários ~400 dias no futuro (nada real é tocado).
-- COMO USAR: rode a 0039 primeiro (supabase/migrations/0039_cancelar_aula_com_reposicao.sql); depois
-- este arquivo inteiro. Procure "DIVERGIU" ou "ERRO".
-- Precisa de um pacote de recorrência ATIVO no banco (a LK tem um).

begin;

create temp table resultados_0039 (ordem int, caso text, veredicto text, detalhe text);
grant all on resultados_0039 to authenticated;

do $$
declare
  v_pkg uuid; v_student uuid; v_admin uuid; v_rec uuid;
  v_t0 timestamptz := date_trunc('hour', now() + interval '400 days');
  v_a uuid := gen_random_uuid();  -- aula que será cancelada com reposição
  v_b uuid := gen_random_uuid();  -- aula para o caso "sem repor"
  v_c uuid := gen_random_uuid();  -- aula para os casos de erro
  v_antes record; v_depois record;
  v_n int; v_st text; v_por text; v_cad uuid; v_pkg_nova uuid;
begin
  select p.id, p.student_id, s.admin_id, p.recorrencia_id into v_pkg, v_student, v_admin, v_rec
  from public.packages p join public.students s on s.id = p.student_id
  where p.status = 'active' and p.recorrencia_id is not null limit 1;
  if v_pkg is null then
    insert into resultados_0039 values (0, 'setup', 'ERRO', 'nenhum pacote de recorrencia ativo'); return;
  end if;

  insert into public.bookings (id, student_id, admin_id, start_time, end_time, status, billing_kind, pacote_id, recorrencia_id, cadeia_id) values
    (v_a, v_student, v_admin, v_t0,                       v_t0 + interval '1 hour', 'scheduled', 'package', v_pkg, v_rec, v_a),
    (v_b, v_student, v_admin, v_t0 + interval '3 hours',  v_t0 + interval '4 hours', 'scheduled', 'package', v_pkg, v_rec, v_b),
    (v_c, v_student, v_admin, v_t0 + interval '6 hours',  v_t0 + interval '7 hours', 'scheduled', 'package', v_pkg, v_rec, v_c);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';

  select * into v_antes from public.calcular_saldo_pacote(v_pkg);

  -- 1. professor cancela COM reposição: original cancelada/professor + sucessora agendada na mesma cadeia
  begin
    perform public.cancelar_aula(v_a, 'professor', v_t0 + interval '24 hours', v_t0 + interval '25 hours', v_rec);
    select status::text, cancelado_por into v_st, v_por from public.bookings where id = v_a;
    select count(*), max(cadeia_id::text)::uuid into v_n, v_cad
      from public.bookings where replacement_for_booking_id = v_a and status = 'scheduled'
        and pacote_id = v_pkg and start_time = v_t0 + interval '24 hours';
    insert into resultados_0039 values (1, '1. cancela com reposicao cria a aula nova ligada a cancelada',
      case when v_st = 'cancelled' and v_por = 'professor' and v_n = 1 and v_cad = v_a then 'OK' else 'DIVERGIU' end,
      'original=' || v_st || '/' || coalesce(v_por,'null') || ', sucessoras=' || v_n || ', mesma cadeia=' || (v_cad = v_a)::text);
  exception when others then insert into resultados_0039 values (1, '1. cancela com reposicao', 'ERRO', sqlerrm); end;

  -- 2. o saldo NAO muda: a aula nova ocupa o lugar da cancelada (consome igual a antes)
  begin
    select * into v_depois from public.calcular_saldo_pacote(v_pkg);
    insert into resultados_0039 values (2, '2. saldo do pacote nao muda',
      case when v_antes.consumidas = v_depois.consumidas and v_antes.restantes = v_depois.restantes
                and v_antes.a_repor = v_depois.a_repor then 'OK' else 'DIVERGIU' end,
      'antes ' || v_antes.consumidas || '/' || v_antes.restantes || '/' || v_antes.a_repor ||
      ' depois ' || v_depois.consumidas || '/' || v_depois.restantes || '/' || v_depois.a_repor);
  exception when others then insert into resultados_0039 values (2, '2. saldo do pacote nao muda', 'ERRO', sqlerrm); end;

  -- 3. chamada antiga (2 argumentos) continua valendo e cancela SEM repor
  begin
    perform public.cancelar_aula(v_b, 'professor');
    select count(*) into v_n from public.bookings where replacement_for_booking_id = v_b;
    select status::text into v_st from public.bookings where id = v_b;
    insert into resultados_0039 values (3, '3. chamada de 2 argumentos cancela sem repor',
      case when v_st = 'cancelled' and v_n = 0 then 'OK' else 'DIVERGIU' end, 'status=' || v_st || ', sucessoras=' || v_n);
  exception when others then insert into resultados_0039 values (3, '3. chamada de 2 argumentos', 'ERRO', sqlerrm); end;

  -- 4. reposicao junto com cancelamento do ALUNO e recusada, e a aula continua agendada
  begin
    perform public.cancelar_aula(v_c, 'aluno', v_t0 + interval '30 hours', v_t0 + interval '31 hours', v_rec);
    insert into resultados_0039 values (4, '4. reposicao com cancelamento do aluno e recusada', 'DIVERGIU', 'passou');
  exception when others then
    select status::text into v_st from public.bookings where id = v_c;
    insert into resultados_0039 values (4, '4. reposicao com cancelamento do aluno e recusada',
      case when sqlerrm like '%só vale quando o professor cancela%' and v_st = 'scheduled' then 'OK' else 'DIVERGIU' end, sqlerrm || ' | aula=' || v_st);
  end;

  -- 5. horario da aula nova OCUPADO: recusa e o cancelamento NAO fica pela metade
  begin
    perform public.cancelar_aula(v_c, 'professor', v_t0 + interval '24 hours', v_t0 + interval '25 hours', v_rec);
    insert into resultados_0039 values (5, '5. horario ocupado e recusado', 'DIVERGIU', 'passou');
  exception when others then
    select status::text into v_st from public.bookings where id = v_c;
    insert into resultados_0039 values (5, '5. horario ocupado e recusado e a aula segue agendada',
      case when sqlerrm like '%já está ocupado%' and v_st = 'scheduled' then 'OK' else 'DIVERGIU' end, sqlerrm || ' | aula=' || v_st);
  end;

  -- 6. horario da aula nova no PASSADO e recusado
  begin
    perform public.cancelar_aula(v_c, 'professor', now() - interval '1 day', now() - interval '23 hours', v_rec);
    insert into resultados_0039 values (6, '6. horario no passado e recusado', 'DIVERGIU', 'passou');
  exception when others then
    insert into resultados_0039 values (6, '6. horario no passado e recusado',
      case when sqlerrm like '%já passou%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  execute 'reset role';
end;
$$;

select * from resultados_0039 order by ordem;

rollback;

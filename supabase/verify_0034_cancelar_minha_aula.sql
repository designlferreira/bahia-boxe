-- Verificação da 0034 — o aluno cancela a própria aula por RPC, inclusive a pendente.
--
-- NÃO destrutivo: uma transação terminada em `rollback`. Cria, só dentro dela, três aulas do
-- autosserviço (sem pacote) pra um aluno real, bem no futuro às 03:00 UTC (fora da agenda real):
-- uma pendente, uma agendada daqui a ~400 dias e uma agendada daqui a 2 horas.
--
-- COMO USAR: rode a 0034 primeiro. Depois rode este arquivo inteiro. Procure "DIVERGIU" ou "ERRO".

begin;

create temp table resultados_0034 (ordem int, caso text, veredicto text, detalhe text);
grant all on resultados_0034 to authenticated;

do $$
declare
  v_admin uuid;
  v_student uuid;
  v_profile uuid;
  v_pend uuid;
  v_sch uuid;
  v_cedo uuid;
  v_base timestamptz := date_trunc('day', now()) + interval '400 days' + interval '3 hours';
  v_row record;
begin
  select s.id, s.profile_id, s.admin_id into v_student, v_profile, v_admin
  from public.students s where s.profile_id is not null limit 1;
  if v_student is null then
    insert into resultados_0034 values (0, 'setup', 'ERRO', 'nenhum aluno'); return;
  end if;

  begin
    insert into public.bookings (student_id, admin_id, start_time, end_time, status)
    values (v_student, v_admin, v_base, v_base + interval '1 hour', 'pending_confirmation') returning id into v_pend;
    insert into public.bookings (student_id, admin_id, start_time, end_time, status)
    values (v_student, v_admin, v_base + interval '1 day', v_base + interval '1 day 1 hour', 'scheduled') returning id into v_sch;
    -- Daqui a 2h, arredondado pra um minuto qualquer — pode colidir com agenda real; se colidir, o
    -- caso 3 vira AVISO em vez de ERRO.
    begin
      insert into public.bookings (student_id, admin_id, start_time, end_time, status)
      values (v_student, v_admin, now() + interval '2 hours', now() + interval '2 hours 1 minute', 'scheduled') returning id into v_cedo;
    exception when others then
      v_cedo := null;
    end;
  exception when others then
    insert into resultados_0034 values (0, 'setup: dados de teste', 'ERRO', sqlerrm); return;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_profile, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_profile::text, true);
  execute 'set local role authenticated';

  begin
    perform public.cancelar_minha_aula(v_pend);
    select status, cancelado_por into v_row from public.bookings where id = v_pend;
    insert into resultados_0034 values (1, '1. aluno cancela aula PENDENTE',
      case when v_row.status = 'cancelled' and v_row.cancelado_por = 'aluno' then 'OK' else 'DIVERGIU' end,
      format('status=%s cancelado_por=%s', v_row.status, v_row.cancelado_por));
  exception when others then
    insert into resultados_0034 values (1, '1. aluno cancela aula PENDENTE', 'ERRO', sqlerrm);
  end;

  begin
    perform public.cancelar_minha_aula(v_sch);
    select status, cancelado_por into v_row from public.bookings where id = v_sch;
    insert into resultados_0034 values (2, '2. aluno cancela aula agendada (>6h)',
      case when v_row.status = 'cancelled' and v_row.cancelado_por = 'aluno' then 'OK' else 'DIVERGIU' end,
      format('status=%s cancelado_por=%s', v_row.status, v_row.cancelado_por));
  exception when others then
    insert into resultados_0034 values (2, '2. aluno cancela aula agendada', 'ERRO', sqlerrm);
  end;

  if v_cedo is null then
    insert into resultados_0034 values (3, '3. agendada com menos de 6h é recusada', 'AVISO', 'não deu pra criar a aula de teste (horário ocupado)');
  else
    begin
      perform public.cancelar_minha_aula(v_cedo);
      insert into resultados_0034 values (3, '3. agendada com menos de 6h é recusada', 'DIVERGIU', 'passou');
    exception when others then
      insert into resultados_0034 values (3, '3. agendada com menos de 6h é recusada',
        case when sqlerrm like '%too_late%' then 'OK' else 'DIVERGIU' end, sqlerrm);
    end;
  end if;

  begin
    perform public.cancelar_minha_aula(v_pend);
    insert into resultados_0034 values (4, '4. cancelar de novo uma aula já cancelada é recusado', 'DIVERGIU', 'passou');
  exception when others then
    insert into resultados_0034 values (4, '4. cancelar de novo uma aula já cancelada é recusado',
      case when sqlerrm like '%not_cancelable%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  execute 'reset role';
end;
$$;

select * from resultados_0034 order by ordem;

rollback;

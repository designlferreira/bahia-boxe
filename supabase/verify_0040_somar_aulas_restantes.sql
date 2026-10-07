-- Verificação da 0040 — somar as aulas restantes ao trocar de pacote.
--
-- NÃO destrutivo: transação terminada em `rollback`. Usa o aluno que tem pacote de recorrência
-- ATIVO (a LK) e cria, dentro da transação, pacotes/aulas de teste ~400 dias à frente.
-- COMO USAR: rode a 0040 primeiro; depois este arquivo inteiro. Procure "DIVERGIU" ou "ERRO".
-- Precisa de: 1 pacote de recorrência ativo, 1 horário fixo ativo e 1 modelo de pacote ativo.
-- NÃO coberto: `approve_purchase_request` (só repassa o parâmetro para as mesmas funções; exigiria
-- fabricar um pedido, e a tabela `purchase_requests` não está nas migrations deste repo).

begin;

create temp table resultados_0040 (ordem int, caso text, veredicto text, detalhe text);
grant all on resultados_0040 to authenticated;

do $$
declare
  v_pkg uuid; v_student uuid; v_admin uuid; v_rec uuid; v_tpl uuid; v_tpl_total int;
  v_t0 timestamptz := date_trunc('hour', now() + interval '400 days');
  v_n0 int; v_n1 int; v_n2 int;
  v_new uuid; v_total int; v_tr int; v_status text; v_old_status text; v_bk int;
  v_slots jsonb;
begin
  select p.id, p.student_id, s.admin_id into v_pkg, v_student, v_admin
  from public.packages p join public.students s on s.id = p.student_id
  where p.status = 'active' and p.recorrencia_id is not null limit 1;
  select id into v_rec from public.aluno_recorrencia where aluno_id = v_student and ativo limit 1;
  select id, total_classes into v_tpl, v_tpl_total from public.package_templates
  where admin_id = v_admin and is_active limit 1;
  if v_pkg is null or v_rec is null or v_tpl is null then
    insert into resultados_0040 values (0, 'setup', 'ERRO', 'falta pacote de recorrencia ativo, horario fixo ativo ou modelo ativo'); return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';

  -- A. o número que a tela mostraria, nos dois modos
  begin
    v_n0 := public.aulas_transferiveis(v_student, false);
    v_n1 := public.aulas_transferiveis(v_student, true);
    insert into resultados_0040 values (1, '1. aulas_transferiveis (recorrencia): sem data x descartando marcadas',
      case when v_n1 >= v_n0 and v_n1 >= 0 then 'OK' else 'DIVERGIU' end,
      'so sem data=' || v_n0 || ', descartando marcadas=' || v_n1);
  exception when others then insert into resultados_0040 values (1, '1. aulas_transferiveis', 'ERRO', sqlerrm); end;

  -- B. gerar com número DIFERENTE do real é recusado e nada muda
  begin
    v_slots := jsonb_build_array(
      jsonb_build_object('start_time', v_t0, 'end_time', v_t0 + interval '1 hour', 'recorrencia_id', v_rec),
      jsonb_build_object('start_time', v_t0 + interval '24 hours', 'end_time', v_t0 + interval '25 hours', 'recorrencia_id', v_rec),
      jsonb_build_object('start_time', v_t0 + interval '48 hours', 'end_time', v_t0 + interval '49 hours', 'recorrencia_id', v_rec),
      jsonb_build_object('start_time', v_t0 + interval '72 hours', 'end_time', v_t0 + interval '73 hours', 'recorrencia_id', v_rec));
    begin
      perform public.gerar_pacote_recorrencia(v_student, v_slots, v_n1 + 1);
      insert into resultados_0040 values (2, '2. numero desatualizado e recusado', 'DIVERGIU', 'passou');
    exception when others then
      select status::text into v_status from public.packages where id = v_pkg;
      insert into resultados_0040 values (2, '2. numero desatualizado e recusado, pacote segue ativo',
        case when sqlerrm like '%mudaram%' and v_status = 'active' then 'OK' else 'DIVERGIU' end, sqlerrm || ' | pacote=' || v_status);
    end;
  end;

  -- C. gerar somando: pacote novo = quantidade de horarios, com as sobras registradas
  begin
    v_slots := jsonb_build_array(
      jsonb_build_object('start_time', v_t0, 'end_time', v_t0 + interval '1 hour', 'recorrencia_id', v_rec),
      jsonb_build_object('start_time', v_t0 + interval '24 hours', 'end_time', v_t0 + interval '25 hours', 'recorrencia_id', v_rec),
      jsonb_build_object('start_time', v_t0 + interval '48 hours', 'end_time', v_t0 + interval '49 hours', 'recorrencia_id', v_rec),
      jsonb_build_object('start_time', v_t0 + interval '72 hours', 'end_time', v_t0 + interval '73 hours', 'recorrencia_id', v_rec));
    if v_n1 >= 4 then raise exception 'teste precisa de mais horarios (sobras=%)', v_n1; end if;
    v_new := public.gerar_pacote_recorrencia(v_student, v_slots, v_n1);
    select total_classes, aulas_transferidas, status::text into v_total, v_tr, v_status from public.packages where id = v_new;
    select status::text into v_old_status from public.packages where id = v_pkg;
    select count(*) into v_bk from public.bookings where pacote_id = v_new and status = 'scheduled';
    insert into resultados_0040 values (3, '3. gerar somando: total = horarios, sobras registradas, antigo encerrado',
      case when v_total = 4 and v_tr = v_n1 and v_status = 'active' and v_old_status = 'finished' and v_bk = 4 then 'OK' else 'DIVERGIU' end,
      'total=' || v_total || ', transferidas=' || coalesce(v_tr::text, 'null') || ', novo=' || v_status || ', antigo=' || v_old_status || ', aulas=' || v_bk);
  exception when others then insert into resultados_0040 values (3, '3. gerar somando', 'ERRO', sqlerrm); end;

  -- D. atribuir modelo SOMANDO: o pacote ativo agora e de recorrencia com todas as aulas marcadas => 0 sem data
  begin
    v_n2 := public.aulas_transferiveis(v_student, false);
    v_new := public.assign_package_from_template(v_student, v_tpl, true);
    select total_classes, aulas_transferidas into v_total, v_tr from public.packages where id = v_new;
    insert into resultados_0040 values (4, '4. atribuir somando com tudo marcado: soma 0 (as marcadas seguem no pacote antigo)',
      case when v_n2 = 0 and v_total = v_tpl_total and v_tr = 0 then 'OK' else 'DIVERGIU' end,
      'sem data=' || v_n2 || ', total=' || v_total || ' (modelo=' || v_tpl_total || '), transferidas=' || coalesce(v_tr::text, 'null'));
  exception when others then insert into resultados_0040 values (4, '4. atribuir somando', 'ERRO', sqlerrm); end;

  -- E. agora o pacote ativo e comprado (sem recorrencia): TODAS as restantes entram na soma
  begin
    v_n2 := public.aulas_transferiveis(v_student, false);
    v_new := public.assign_package_from_template(v_student, v_tpl, true);
    select total_classes, aulas_transferidas into v_total, v_tr from public.packages where id = v_new;
    insert into resultados_0040 values (5, '5. atribuir somando sobre pacote comprado: soma todas as restantes',
      case when v_n2 = v_tpl_total and v_total = v_tpl_total + v_n2 and v_tr = v_n2 then 'OK' else 'DIVERGIU' end,
      'restantes=' || v_n2 || ', total=' || v_total || ', transferidas=' || coalesce(v_tr::text, 'null'));
  exception when others then insert into resultados_0040 values (5, '5. atribuir somando sobre comprado', 'ERRO', sqlerrm); end;

  -- F. atribuir SEM somar: comportamento antigo (total do modelo, nada registrado)
  begin
    v_new := public.assign_package_from_template(v_student, v_tpl);
    select total_classes, aulas_transferidas into v_total, v_tr from public.packages where id = v_new;
    insert into resultados_0040 values (6, '6. atribuir sem somar continua como antes',
      case when v_total = v_tpl_total and v_tr is null then 'OK' else 'DIVERGIU' end,
      'total=' || v_total || ', transferidas=' || coalesce(v_tr::text, 'null'));
  exception when others then insert into resultados_0040 values (6, '6. atribuir sem somar', 'ERRO', sqlerrm); end;

  execute 'reset role';
end;
$$;

select * from resultados_0040 order by ordem;

rollback;

-- Verificação da 0031 — aprovar aula avulsa preserva a aula experimental.
--
-- NÃO destrutivo: uma transação terminada em `rollback`. Cria, só dentro da transação, um pacote
-- ativo comprado + (se faltar) uma aula experimental ativa pra um aluno real, e um pedido de aula
-- avulsa pendente; aprova como o professor e confere o resultado. Tudo some no rollback.
--
-- COMO USAR: rode a 0031 primeiro. Depois rode este arquivo inteiro. Procure "DIVERGIU" ou "ERRO".

begin;

create temp table resultados_0031 (ordem int, caso text, veredicto text, detalhe text);
grant all on resultados_0031 to authenticated;

do $$
declare
  v_admin uuid;
  v_student uuid;
  v_trial uuid;
  v_bought uuid;
  v_req uuid;
  v_new record;
  v_status text;
begin
  -- Aluno cuja experimental está ATIVA, ou que nunca teve uma (aí criamos). Aluno com experimental
  -- já usada não serve: o índice packages_one_trial_per_student impede uma segunda.
  select s.id, s.admin_id into v_student, v_admin
  from public.students s
  where exists (select 1 from public.packages p where p.student_id = s.id and p.origin = 'trial' and p.status = 'active')
     or not exists (select 1 from public.packages p where p.student_id = s.id and p.origin = 'trial')
  limit 1;

  if v_student is null then
    insert into resultados_0031 values (0, 'setup', 'ERRO', 'nenhum aluno com experimental ativa ou sem experimental');
    return;
  end if;

  begin
    select id into v_trial from public.packages
    where student_id = v_student and origin = 'trial' and status = 'active' limit 1;
    if v_trial is null then
      insert into public.packages (student_id, total_classes, used_classes, status, origin, kind)
      values (v_student, 1, 0, 'active', 'trial', 'single') returning id into v_trial;
    end if;

    -- Pacote comprado ativo (fecha qualquer outro ativo não-trial antes, respeitando o índice de
    -- "um ativo não-trial por vez").
    update public.packages set status = 'finished'
    where student_id = v_student and status = 'active' and origin <> 'trial';
    insert into public.packages (student_id, total_classes, used_classes, status, origin, kind)
    values (v_student, 4, 1, 'active', 'purchase', 'package') returning id into v_bought;

    begin
      insert into public.purchase_requests (student_id, admin_id, kind, status)
      values (v_student, v_admin, 'single_class', 'pending') returning id into v_req;
    exception when check_violation or invalid_text_representation then
      insert into public.purchase_requests (student_id, admin_id, kind, status)
      values (v_student, v_admin, 'single', 'pending') returning id into v_req;
    end;
  exception when others then
    insert into resultados_0031 values (0, 'setup: dados de teste', 'ERRO', sqlerrm);
    return;
  end;

  -- Aprova como o professor.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';
  begin
    perform public.approve_purchase_request(v_req);
  exception when others then
    execute 'reset role';
    insert into resultados_0031 values (1, 'aprovar aula avulsa', 'ERRO', sqlerrm);
    return;
  end;
  execute 'reset role';

  select status into v_status from public.packages where id = v_trial;
  insert into resultados_0031 values (1, '1. aula experimental continua ativa',
    case when v_status = 'active' then 'OK' else 'DIVERGIU' end, format('status=%s', v_status));

  select status into v_status from public.packages where id = v_bought;
  insert into resultados_0031 values (2, '2. pacote comprado anterior foi encerrado',
    case when v_status = 'finished' then 'OK' else 'DIVERGIU' end, format('status=%s', v_status));

  select * into v_new from public.packages
  where student_id = v_student and status = 'active' and origin <> 'trial';
  insert into resultados_0031 values (3, '3. pacote novo de 1 aula (purchase/single)',
    case when v_new.total_classes = 1 and v_new.used_classes = 0 and v_new.origin = 'purchase' and v_new.kind = 'single'
         then 'OK' else 'DIVERGIU' end,
    format('total=%s usadas=%s origin=%s kind=%s', v_new.total_classes, v_new.used_classes, v_new.origin, v_new.kind));

  select status into v_status from public.purchase_requests where id = v_req;
  insert into resultados_0031 values (4, '4. pedido marcado como aprovado',
    case when v_status = 'approved' then 'OK' else 'DIVERGIU' end, format('status=%s', v_status));
end;
$$;

select * from resultados_0031 order by ordem;

rollback;

-- 0031 — Aprovar AULA AVULSA não encerra mais a aula experimental (2026-09-28)
--
-- `approve_purchase_request` não está nas migrations deste repo (já existia no Supabase). O corpo
-- abaixo é o que estava no banco, lido via pg_get_functiondef em 2026-09-28, com UMA mudança: o
-- ramo de aula avulsa.
--
-- Antes, o ramo de aula avulsa fazia por conta própria:
--     update packages set status='finished' where student_id = ... and status='active';
--     insert into packages(student_id, total_classes, used_classes, status, kind) values (..., 1, 0, 'active', 'single');
-- — sem filtro de origem, então encerrava TAMBÉM a aula experimental do aluno. O ramo de pacote
-- (assign_package_from_template -> _create_package) sempre preservou a experimental.
--
-- Decisão do Lucas (2026-09-28): aprovar aula avulsa NÃO encerra a aula experimental. Correção: o
-- ramo de aula avulsa passa por `_create_package(..., 'purchase', 'single')` — o mesmo caminho
-- único de criação de pacote da decisão 6 do CLAUDE.md, que fecha só os ativos não-trial. A linha
-- criada é idêntica à de antes: origin 'purchase' (era o default da coluna), kind 'single',
-- 1 aula, active.
--
-- Idempotente (create or replace). Nenhum dado é alterado.

create or replace function public.approve_purchase_request(p_request_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_req record;
begin
  if not exists (select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception 'only_admin';
  end if;

  select * into v_req
  from public.purchase_requests
  where id = p_request_id
    and admin_id = auth.uid()
    and status = 'pending'
  for update;

  if v_req.id is null then
    raise exception 'request_not_found_or_not_pending';
  end if;

  update public.purchase_requests
  set status='approved', decided_at=now()
  where id = p_request_id;

  if v_req.kind = 'package' then
    perform public.assign_package_from_template(v_req.student_id, v_req.template_id);
  else
    -- 0031: preserva a aula experimental (antes o update aqui não filtrava origem).
    perform public._create_package(v_req.student_id, 1, 'purchase', 'single');
  end if;
end;
$function$;

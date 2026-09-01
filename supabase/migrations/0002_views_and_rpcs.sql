-- Views de leitura (§4.2) e RPCs (§4.3)

-- ---------------------------------------------------------------------------
-- views
-- ---------------------------------------------------------------------------

create view public.admin_student_header as
select s.id as student_id, p.name as student_name, s.created_at as student_since, p.created_at as profile_created_at, s.admin_id
from public.students s
join public.profiles p on p.id = s.id;

create view public.admin_dashboard_kpis as
select
  admin_id,
  count(*) filter (where start_time::date = (now() at time zone 'America/Sao_Paulo')::date) as kpi_today,
  (select count(*) from public.students st where st.admin_id = b.admin_id) as active_students
from public.bookings b
where status <> 'cancelled'
group by admin_id;

create view public.admin_dashboard_upcoming_bookings as
select b.*, p.name as student_name
from public.bookings b
join public.students s on s.id = b.student_id
join public.profiles p on p.id = s.id
where b.status in ('scheduled', 'pending_confirmation') and b.start_time > now()
order by b.start_time asc;

create view public.admin_dashboard_students_at_risk as
select s.id as student_id, s.admin_id, p.name as student_name,
  coalesce(pkg.total_classes - pkg.used_classes, 0) as credits_remaining
from public.students s
join public.profiles p on p.id = s.id
left join public.packages pkg on pkg.student_id = s.id and pkg.status = 'active'
where coalesce(pkg.total_classes - pkg.used_classes, 0) <= 1;

create view public.admin_student_active_package as
select * from public.packages where status = 'active';

create view public.admin_student_kpis as
select
  student_id,
  count(*) filter (where status = 'completed') as completed_count,
  count(*) filter (where status = 'no_show') as no_show_count
from public.bookings
group by student_id;

create view public.admin_student_upcoming_bookings as
select * from public.bookings where status in ('scheduled', 'pending_confirmation') and start_time > now();

create view public.admin_student_recent_bookings as
select * from public.bookings order by start_time desc;

create view public.booking_history_app as
select
  b.*,
  b.start_time at time zone 'America/Sao_Paulo' as start_time_brt,
  b.end_time at time zone 'America/Sao_Paulo' as end_time_brt,
  (b.start_time < now()) as is_past,
  (b.start_time >= now()) as is_future,
  sp.name as student_name,
  ap.name as admin_name
from public.bookings b
join public.students s on s.id = b.student_id
join public.profiles sp on sp.id = s.id
join public.profiles ap on ap.id = b.admin_id;

grant select on public.admin_student_header, public.admin_dashboard_kpis, public.admin_dashboard_upcoming_bookings,
  public.admin_dashboard_students_at_risk, public.admin_student_active_package, public.admin_student_kpis,
  public.admin_student_upcoming_bookings, public.admin_student_recent_bookings, public.booking_history_app
  to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.ensure_student_default_admin(p_admin_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.students (id, admin_id)
  values (auth.uid(), p_admin_id)
  on conflict (id) do nothing;
end;
$$;

-- Nasce pendente (não 'scheduled') — corrige o débito técnico §11.4.
create or replace function public.schedule_booking(p_admin_id uuid, p_start timestamptz, p_end timestamptz)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings;
begin
  if not exists (select 1 from public.students where id = auth.uid() and admin_id = p_admin_id) then
    raise exception 'not a student of this admin';
  end if;

  insert into public.bookings (student_id, admin_id, start_time, end_time, status)
  values (auth.uid(), p_admin_id, p_start, p_end, 'pending_confirmation')
  returning * into v_booking;

  return v_booking;
end;
$$;

create or replace function public.mark_no_show(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings;
  v_consumes boolean;
begin
  select * into v_booking from public.bookings where id = p_booking_id and admin_id = auth.uid();
  if not found then raise exception 'booking not found'; end if;

  update public.bookings set status = 'no_show' where id = p_booking_id;

  select no_show_consumes_class into v_consumes from public.admin_settings where admin_id = v_booking.admin_id;
  if coalesce(v_consumes, true) then
    update public.packages set used_classes = used_classes + 1
    where student_id = v_booking.student_id and status = 'active';
  end if;
end;
$$;

create or replace function public.complete_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id and admin_id = auth.uid();
  if not found then raise exception 'booking not found'; end if;

  update public.bookings set status = 'completed' where id = p_booking_id;
  update public.packages set used_classes = used_classes + 1
  where student_id = v_booking.student_id and status = 'active';
end;
$$;

create or replace function public.reconcile_booking_statuses()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  update public.bookings
  set status = 'completed'
  where admin_id = auth.uid() and status = 'scheduled' and end_time < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.request_package(p_admin_id uuid, p_template_id uuid, p_notes text default null)
returns public.purchase_requests language plpgsql security definer set search_path = public as $$
declare
  v_req public.purchase_requests;
begin
  insert into public.purchase_requests (student_id, admin_id, kind, template_id, notes)
  values (auth.uid(), p_admin_id, 'package', p_template_id, p_notes)
  returning * into v_req;
  return v_req;
end;
$$;

create or replace function public.request_single_class(p_admin_id uuid, p_template_id uuid, p_notes text default null)
returns public.purchase_requests language plpgsql security definer set search_path = public as $$
declare
  v_req public.purchase_requests;
begin
  insert into public.purchase_requests (student_id, admin_id, kind, template_id, notes)
  values (auth.uid(), p_admin_id, 'single_class', p_template_id, p_notes)
  returning * into v_req;
  return v_req;
end;
$$;

create or replace function public.assign_package_from_template(p_student_id uuid, p_template_id uuid)
returns public.packages language plpgsql security definer set search_path = public as $$
declare
  v_template public.package_templates;
  v_pkg public.packages;
begin
  select * into v_template from public.package_templates where id = p_template_id and admin_id = auth.uid();
  if not found then raise exception 'template not found'; end if;

  update public.packages set status = 'finished' where student_id = p_student_id and status = 'active';

  insert into public.packages (student_id, total_classes, template_name, expires_at)
  values (p_student_id, v_template.total_classes, v_template.name, now() + (v_template.validity_days || ' days')::interval)
  returning * into v_pkg;

  return v_pkg;
end;
$$;

create or replace function public.approve_purchase_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_req public.purchase_requests;
begin
  select * into v_req from public.purchase_requests where id = p_request_id and admin_id = auth.uid();
  if not found then raise exception 'request not found'; end if;

  update public.purchase_requests set status = 'approved', decided_at = now() where id = p_request_id;

  if v_req.kind = 'package' then
    perform public.assign_package_from_template(v_req.student_id, v_req.template_id);
  else
    update public.packages set total_classes = total_classes + 1
    where student_id = v_req.student_id and status = 'active';
  end if;
end;
$$;

create or replace function public.reject_purchase_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.purchase_requests set status = 'rejected', decided_at = now()
  where id = p_request_id and admin_id = auth.uid();
end;
$$;

create or replace function public.remove_active_package(p_student_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.packages set status = 'finished'
  where student_id = p_student_id and status = 'active'
    and exists (select 1 from public.students s where s.id = p_student_id and s.admin_id = auth.uid());
end;
$$;

create or replace function public.validate_invite(p_token text)
returns table (admin_id uuid, admin_name text) language sql stable security definer set search_path = public as $$
  select i.admin_id, p.name
  from public.invites i
  join public.profiles p on p.id = i.admin_id
  where i.token = p_token and i.used_at is null;
$$;

create or replace function public.accept_invite(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin_id uuid;
begin
  select admin_id into v_admin_id from public.invites where token = p_token and used_at is null;
  if v_admin_id is null then raise exception 'invalid or used invite'; end if;

  insert into public.students (id, admin_id) values (auth.uid(), v_admin_id)
  on conflict (id) do nothing;

  update public.invites set used_at = now() where token = p_token;
end;
$$;

create or replace function public.get_student_booking_history(p_cursor timestamptz default null, p_limit int default 20)
returns setof public.booking_history_app language sql stable security definer set search_path = public as $$
  select * from public.booking_history_app
  where student_name is not null
    and student_id = auth.uid()
    and (p_cursor is null or start_time < p_cursor)
  order by start_time desc
  limit p_limit;
$$;

create or replace function public.get_admin_booking_history(p_cursor timestamptz default null, p_limit int default 20)
returns setof public.booking_history_app language sql stable security definer set search_path = public as $$
  select * from public.booking_history_app
  where admin_id = auth.uid() and (p_cursor is null or start_time < p_cursor)
  order by start_time desc
  limit p_limit;
$$;

grant execute on all functions in schema public to authenticated;

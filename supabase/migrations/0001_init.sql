-- Bahia Boxe — schema inicial (spec §4)
-- Papéis nunca são lidos de `profiles` para autorização — sempre via user_roles + has_role().

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- tabelas
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('student', 'admin')),
  created_at timestamptz not null default now()
);

-- fonte única de verdade para autorização (nunca `profiles.role`)
create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'admin')),
  primary key (user_id, role)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.package_templates (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  total_classes int not null check (total_classes > 0),
  price_cents int not null check (price_cents >= 0),
  validity_days int not null check (validity_days > 0)
);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  total_classes int not null check (total_classes > 0),
  used_classes int not null default 0 check (used_classes >= 0),
  status text not null default 'active' check (status in ('active', 'finished')),
  template_name text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null check (end_time > start_time)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete cascade,
  slot_id uuid references public.availability_slots(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null check (end_time > start_time),
  status text not null default 'pending_confirmation' check (
    status in ('scheduled', 'completed', 'cancelled', 'no_show', 'pending_confirmation', 'rejected', 'rejected_with_suggestion')
  ),
  cancel_reason text,
  teacher_note text,
  suggested_start_time timestamptz,
  suggested_end_time timestamptz,
  is_makeup boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('package', 'single_class')),
  template_id uuid references public.package_templates(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table public.invites (
  token text primary key default encode(gen_random_bytes(16), 'hex'),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('booking', 'cancel', 'confirm', 'system')),
  title text not null,
  description text not null,
  created_at timestamptz not null default now(),
  read boolean not null default false,
  related_booking_id uuid references public.bookings(id) on delete set null
);

create table public.admin_settings (
  admin_id uuid primary key references public.profiles(id) on delete cascade,
  no_show_consumes_class boolean not null default true
);

-- ---------------------------------------------------------------------------
-- has_role() — security definer, evita recursão de RLS
-- ---------------------------------------------------------------------------

create or replace function public.has_role(p_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = auth.uid() and role = p_role
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.students enable row level security;
alter table public.package_templates enable row level security;
alter table public.packages enable row level security;
alter table public.availability_slots enable row level security;
alter table public.bookings enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.invites enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_settings enable row level security;

create policy "profiles: read own or as admin of own students" on public.profiles
  for select using (
    id = auth.uid()
    or exists (select 1 from public.students s where s.profile_id = profiles.id and s.admin_id = auth.uid())
  );
create policy "profiles: update own" on public.profiles for update using (id = auth.uid());

create policy "user_roles: read own" on public.user_roles for select using (user_id = auth.uid());

create policy "students: student reads own row" on public.students for select using (profile_id = auth.uid());
create policy "students: admin reads own students" on public.students for select using (admin_id = auth.uid());
create policy "students: admin manages own students" on public.students for all using (admin_id = auth.uid());

create policy "package_templates: admin manages own" on public.package_templates for all using (admin_id = auth.uid());
create policy "package_templates: students of admin can read" on public.package_templates for select using (
  exists (select 1 from public.students s where s.admin_id = package_templates.admin_id and s.profile_id = auth.uid())
);

create policy "packages: student reads own" on public.packages for select using (
  exists (select 1 from public.students s where s.id = packages.student_id and s.profile_id = auth.uid())
);
create policy "packages: admin manages students' packages" on public.packages for all using (
  exists (select 1 from public.students s where s.id = packages.student_id and s.admin_id = auth.uid())
);

create policy "availability_slots: admin manages own" on public.availability_slots for all using (admin_id = auth.uid());
create policy "availability_slots: students of admin can read" on public.availability_slots for select using (
  exists (select 1 from public.students s where s.admin_id = availability_slots.admin_id and s.profile_id = auth.uid())
);

create policy "bookings: student manages own" on public.bookings for all using (
  exists (select 1 from public.students s where s.id = bookings.student_id and s.profile_id = auth.uid())
);
create policy "bookings: admin manages own" on public.bookings for all using (admin_id = auth.uid());

create policy "purchase_requests: student manages own" on public.purchase_requests for all using (
  exists (select 1 from public.students s where s.id = purchase_requests.student_id and s.profile_id = auth.uid())
);
create policy "purchase_requests: admin manages own" on public.purchase_requests for all using (admin_id = auth.uid());

create policy "invites: admin manages own" on public.invites for all using (admin_id = auth.uid());
create policy "invites: anyone can read a token to validate it" on public.invites for select using (true);

create policy "notifications: user manages own" on public.notifications for all using (user_id = auth.uid());

create policy "admin_settings: admin manages own" on public.admin_settings for all using (admin_id = auth.uid());
create policy "admin_settings: students of admin can read" on public.admin_settings for select using (
  exists (select 1 from public.students s where s.admin_id = admin_settings.admin_id and s.profile_id = auth.uid())
);

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

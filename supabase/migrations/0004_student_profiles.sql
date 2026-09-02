-- Lote C / Etapa 8 — perfil complementar do aluno (opcional, preenchido progressivamente, nunca
-- no onboarding). Uma linha por aluno, todos os campos nullable — null é "não informado", não um
-- valor sentinela.
--
-- `fighter_profile_result` já entra aqui (jsonb, nullable) para a Etapa 9 ter onde gravar o
-- resultado do teste quando ele existir, sem precisar de outra migration — mas nada escreve nela
-- nesta rodada, o teste em si não foi implementado (sem definição de perguntas/pesos).

create table if not exists public.student_profiles (
  student_id uuid primary key references public.students(id) on delete cascade,
  sex text check (sex in ('female', 'male', 'other')),
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  guard text check (guard in ('orthodox', 'southpaw', 'switch')),
  laterality text check (laterality in ('right', 'left', 'ambidextrous')),
  fighter_profile_result jsonb,
  updated_at timestamptz not null default now()
);

alter table public.student_profiles enable row level security;

-- O aluno vê e edita o próprio perfil.
drop policy if exists student_profiles_self_all on public.student_profiles;
create policy student_profiles_self_all on public.student_profiles
  for all
  using (exists (
    select 1 from public.students s where s.id = student_profiles.student_id and s.profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.students s where s.id = student_profiles.student_id and s.profile_id = auth.uid()
  ));

-- O professor só lê os perfis dos seus próprios alunos — nunca escreve (o dado é do aluno).
drop policy if exists student_profiles_admin_select on public.student_profiles;
create policy student_profiles_admin_select on public.student_profiles
  for select
  using (exists (
    select 1 from public.students s where s.id = student_profiles.student_id and s.admin_id = auth.uid()
  ));

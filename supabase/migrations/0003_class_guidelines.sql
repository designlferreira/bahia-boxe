-- Lote B / Etapa 6 — orientações da aula (configuração padrão do professor).
--
-- Uma linha por professor (chave é admin_id). Guarda endereço + ponto de referência +
-- antecedência recomendada + equipamento (jsonb, formato documentado em
-- src/lib/classGuidelines.ts). Sem override por aula ainda — mas nada aqui impede adicionar
-- depois: o frontend já lê isso através de uma função (getClassGuidelines), não de acesso direto
-- à tabela, então um "override por aula" futuro só muda essa função, não os componentes.

create table if not exists public.class_guidelines (
  admin_id uuid primary key references public.profiles(id) on delete cascade,
  cep text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  reference_point text,
  arrival_minutes int,
  equipment jsonb not null default '{}'::jsonb,
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.class_guidelines enable row level security;

drop policy if exists class_guidelines_admin_all on public.class_guidelines;
create policy class_guidelines_admin_all on public.class_guidelines
  for all
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

drop policy if exists class_guidelines_student_select on public.class_guidelines;
create policy class_guidelines_student_select on public.class_guidelines
  for select
  using (exists (
    select 1 from public.students s
    where s.admin_id = class_guidelines.admin_id and s.profile_id = auth.uid()
  ));

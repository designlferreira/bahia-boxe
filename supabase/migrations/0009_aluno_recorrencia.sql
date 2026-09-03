-- Etapa 2 / RECORRENCIA — tabela aluno_recorrencia: o template persistente de dias/horário fixos
-- que o professor define para um aluno. NÃO gera aulas sozinha — é só a "receita" que a RPC de
-- geração de pacote (Etapa 4) vai ler para materializar linhas concretas em `bookings`.
--
-- Sem `professor_id` próprio: derivado via `aluno_id → students.admin_id`, mesmo raciocínio já
-- aplicado a `pacote` (CLAUDE.md, decisão 5) — evita uma segunda fonte de verdade sobre quem é o
-- professor do aluno, que ficaria desatualizada se o vínculo aluno↔professor mudasse.
--
-- RLS professor-only (CLAUDE.md): o aluno não lê o próprio template aqui — já enxerga a
-- recorrência através das aulas materializadas na agenda dele. Abrir leitura pro aluno depois é só
-- uma policy nova, não uma migration.

create table if not exists public.aluno_recorrencia (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.students(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6),
  horario time not null,
  duracao interval not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists aluno_recorrencia_aluno_idx on public.aluno_recorrencia (aluno_id);

alter table public.aluno_recorrencia enable row level security;

-- Só o professor dono do aluno lê/cria/edita/remove — nunca o aluno, nunca outro professor.
drop policy if exists aluno_recorrencia_professor_all on public.aluno_recorrencia;
create policy aluno_recorrencia_professor_all on public.aluno_recorrencia
  for all
  using (exists (
    select 1 from public.students s where s.id = aluno_recorrencia.aluno_id and s.admin_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.students s where s.id = aluno_recorrencia.aluno_id and s.admin_id = auth.uid()
  ));

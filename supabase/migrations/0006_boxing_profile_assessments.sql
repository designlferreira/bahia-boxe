-- Perfil de Boxe — autoavaliação técnico-tática (questionário de 32 perguntas).
--
-- Não toca em nenhuma tabela existente. `bookings`, `packages`, `credit_transactions`,
-- `students`, `profiles` — nada disso muda. A única relação nova é `student_id`, referenciando
-- `students(id)` no mesmo padrão já usado por `student_profiles`/`bookings`/`packages`.
--
-- RESPOSTAS EM JSONB, NÃO NORMALIZADAS — decisão explícita: o único padrão de consulta real é
-- "carregar as 32 respostas de UMA avaliação ao abrir seu detalhe" (nunca "quais alunos
-- responderam X na questão 7"). Normalizar em 32 colunas ou numa tabela `answers` à parte não
-- traria nenhum ganho de consulta, só custo de escrita (32 inserts por avaliação em vez de 1) e
-- complexidade de leitura. `dimension_scores`/`profile_scores` são jsonb pelo mesmo motivo: por
-- aluno, o número de avaliações é pequeno (uma pessoa não faz esse teste dezenas de vezes), então
-- a agregação para o gráfico de evolução é perfeitamente viável no cliente a partir de poucas
-- linhas — normalizar aqui adicionaria 8+6=14 colunas sem nenhuma consulta que precise disso no
-- nível do banco.
--
-- IMUTÁVEL POR DESIGN — nenhuma policy de UPDATE/DELETE é criada. Uma avaliação concluída é um
-- snapshot histórico: o resultado gravado (dimension_scores/profile_scores/perfis) nunca é
-- recalculado a partir da configuração atual do algoritmo, mesmo que pesos/perguntas mudem depois
-- (por isso o versionamento abaixo). Refazer o teste sempre cria uma linha nova.
--
-- SEM PERSISTÊNCIA DE RASCUNHO NO SUPABASE — o questionário não tem estado "em andamento" salvo
-- aqui; respostas incompletas ficam só no localStorage do dispositivo (mesmo mecanismo já usado
-- pelo sino de notificações), e só a avaliação COMPLETA vira uma linha, numa única inserção
-- atômica ao concluir.
--
-- PREPARADO PARA "coach" NO FUTURO SEM MIGRATION NOVA — `assessment_type` já aceita 'coach' e
-- `assessed_by` já existe para registrar quem preencheu quando não for o próprio aluno. Nesta
-- versão só o fluxo 'self' tem policy de escrita; habilitar o professor a avaliar o aluno depois é
-- só uma policy de INSERT nova, sem mexer no schema.
--
-- SEM ACESSO DO PROFESSOR NESTA VERSÃO — nada na Fase 2-33 pede que o professor leia a
-- autoavaliação do aluno agora (isso é avaliação DELE sobre si mesmo); ampliar RLS sem uma
-- necessidade comprovada vai contra a regra explícita desta tarefa. Se/quando isso for pedido, é
-- uma policy de SELECT a mais, no mesmo padrão de `student_profiles_admin_select`.

create table if not exists public.boxing_profile_assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,

  assessment_type text not null default 'self' check (assessment_type in ('self', 'coach')),
  -- Quem preencheu, quando não for o próprio aluno (reservado para 'coach' — não usado em 'self').
  assessed_by uuid references public.profiles(id),

  questionnaire_version text not null,
  scoring_version text not null,

  -- {"q1": 4, "q2": 3, ..., "q30": "B", ...}
  answers jsonb not null,
  -- {"attack": 71, "defense": 83, ...} — já arredondado, é o snapshot exibido/persistido.
  dimension_scores jsonb not null,
  -- {"out_boxer": 61, "counterpuncher": 82, ...} — os 6, não só o principal.
  profile_scores jsonb not null,

  primary_profile text not null,
  secondary_profile text not null,

  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);

create index if not exists boxing_profile_assessments_student_idx
  on public.boxing_profile_assessments (student_id, completed_at desc);

alter table public.boxing_profile_assessments enable row level security;

-- O aluno cria e vê as próprias avaliações self. Sem policy de update/delete (imutável).
drop policy if exists boxing_profile_assessments_self_select on public.boxing_profile_assessments;
create policy boxing_profile_assessments_self_select on public.boxing_profile_assessments
  for select
  using (exists (
    select 1 from public.students s
    where s.id = boxing_profile_assessments.student_id and s.profile_id = auth.uid()
  ));

drop policy if exists boxing_profile_assessments_self_insert on public.boxing_profile_assessments;
create policy boxing_profile_assessments_self_insert on public.boxing_profile_assessments
  for insert
  with check (
    assessment_type = 'self'
    and exists (
      select 1 from public.students s
      where s.id = boxing_profile_assessments.student_id and s.profile_id = auth.uid()
    )
  );

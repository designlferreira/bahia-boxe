-- Perfil de Boxe v2 — versão curta/completa, escolha forçada com peso maior, âncora física por
-- envergadura. Três colunas novas, nada existente muda de forma (CLAUDE.md, "Reforma do
-- questionário de Perfil de Boxe").
--
-- NÃO RECALCULA NADA: `boxing_profile_assessments` já é imutável por design (migration 0006) —
-- linhas antigas mantêm `scoring_version`/`questionnaire_version` da época e continuam com o
-- resultado já persistido. `assessment_length` default 'full' é só para as linhas existentes
-- (todas foram feitas com o questionário completo de 32 perguntas da v1) fazerem sentido sob o
-- novo campo sem precisar de um valor "desconhecido" — hoje só existe uma variante de qualquer
-- forma.

alter table public.student_profiles
  add column if not exists wingspan_cm numeric(5,1);

alter table public.boxing_profile_assessments
  add column if not exists assessment_length text not null default 'full' check (assessment_length in ('short', 'full')),
  add column if not exists wingspan_index_used numeric(4,3);

comment on column public.boxing_profile_assessments.wingspan_index_used is
  'Envergadura ÷ altura no momento desta avaliação, só quando a âncora física foi aplicada (assessment_length = full e as duas medidas existiam no cadastro). Snapshot, nunca recalculado — o cadastro do aluno pode mudar depois sem afetar avaliações já persistidas.';

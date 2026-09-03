-- Etapa 2 / RECORRENCIA — colunas novas em `bookings`, todas nullable. Nenhuma coluna do rascunho
-- original que se provou redundante (`origem`, `reagendado_de_id`) foi criada — ver CLAUDE.md,
-- decisões 2 e 7.

alter table public.bookings
  add column if not exists pacote_id uuid references public.packages(id),
  add column if not exists recorrencia_id uuid references public.aluno_recorrencia(id),
  add column if not exists cadeia_id uuid,
  add column if not exists cancelado_por text check (cancelado_por in ('professor', 'aluno'));

-- Backfill de cadeia_id — TOPOLÓGICO, não "cadeia_id = id para todas as linhas": uma linha cujo
-- `replacement_for_booking_id` aponta pra outra pertence à MESMA cadeia do antecessor, não a uma
-- cadeia própria (uma aula remarcada 2x tem 3 linhas na mesma cadeia). Resolve a raiz de cada
-- cadeia (`replacement_for_booking_id is null`) e propaga o id da raiz por toda a cadeia via
-- recursive CTE, seguindo `replacement_for_booking_id` até o fim. Sem risco de ciclo: uma linha só
-- passa a apontar pra outra depois que a outra já existe e já está scheduled/no_show/cancelled —
-- o grafo cresce sempre por uma folha nova apontando pra trás, nunca por referência mútua.
with recursive cadeia as (
  -- âncora: raízes (nunca substituíram nada)
  select id, id as raiz_id
  from public.bookings
  where replacement_for_booking_id is null

  union all

  -- passo recursivo: sucessor herda a raiz do antecessor
  select b.id, c.raiz_id
  from public.bookings b
  join cadeia c on c.id = b.replacement_for_booking_id
)
update public.bookings b
set cadeia_id = cadeia.raiz_id
from cadeia
where b.id = cadeia.id
  and b.cadeia_id is distinct from cadeia.raiz_id;

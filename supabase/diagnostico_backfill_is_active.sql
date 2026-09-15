-- Diagnóstico SOMENTE LEITURA para a decisão de backfill em "is_active — Opção B"
-- (CLAUDE.md, "Pontos ainda em aberto"). NÃO escreve, NÃO altera nada — é só SELECT.
--
-- Por quê: depois que `is_active` passar a significar só "publicado", toda linha hoje `false`
-- por causa do vazamento antigo precisa voltar a `true` — mas não dá pra distinguir com certeza,
-- nos dados como estão, "queimado por uma aula" de "desativado de propósito pelo professor". Este
-- diagnóstico não decide isso — só mostra os números pra decisão ser informada:
--   - quantas linhas, de quantos professores;
--   - quantas têm um booking ligado diretamente por `slot_id` (evidência forte de "foi uma aula
--     de AUTOSSERVICO que queimou este horário" — schedule_booking é o único escritor de slot_id);
--   - de quanto tempo é cada uma (start_time no futuro, ou há quantos dias no passado) — uma linha
--     desativada ontem e uma de 6 meses atrás contam histórias diferentes, como o usuário pediu.
--
-- O que este diagnóstico NÃO consegue responder: para uma linha SEM slot_id ligado, não dá pra
-- saber se foi uma aula de RECORRENCIA que coincidiu no horário (recorrência nunca grava slot_id)
-- ou se o professor desativou de propósito — as duas ficam idênticas nos dados. Essas linhas caem
-- na coluna "sem_slot_vinculado" de cada seção; decidir o que fazer com elas é o próprio ponto em
-- aberto (backfill automático vs. mostrar ao professor com botão de reativar).
--
-- Uma única consulta — tudo sai numa tabela só (secao, linha).

with slots_false as (
  select
    s.id,
    s.admin_id,
    s.start_time,
    s.end_time,
    exists (
      select 1 from public.bookings b where b.slot_id = s.id
    ) as tem_slot_vinculado
  from public.availability_slots s
  where s.is_active = false
),

por_professor as (
  select
    admin_id,
    count(*) as total,
    count(*) filter (where tem_slot_vinculado) as com_slot_vinculado,
    count(*) filter (where not tem_slot_vinculado) as sem_slot_vinculado
  from slots_false
  group by admin_id
),

idade as (
  select
    case
      when start_time > now() then '0. futuro (start_time ainda não chegou)'
      when start_time > now() - interval '7 days' then '1. últimos 7 dias'
      when start_time > now() - interval '30 days' then '2. 7-30 dias atrás'
      when start_time > now() - interval '90 days' then '3. 30-90 dias atrás'
      else '4. mais de 90 dias atrás'
    end as faixa,
    tem_slot_vinculado
  from slots_false
)

select 0 as ord, 0 as sub, 'RESUMO' as secao,
  format('total is_active=false: %s | professores distintos: %s | com slot_id vinculado (evidência forte de aula AUTOSSERVICO): %s | sem slot_id vinculado (ambíguo): %s',
    (select count(*) from slots_false),
    (select count(distinct admin_id) from slots_false),
    (select count(*) from slots_false where tem_slot_vinculado),
    (select count(*) from slots_false where not tem_slot_vinculado)
  ) as linha

union all

select 1, row_number() over (order by total desc), 'POR PROFESSOR',
  format('professor %s | total: %s | com slot_id: %s | sem slot_id (ambíguo): %s', admin_id, total, com_slot_vinculado, sem_slot_vinculado)
from por_professor

union all

select 2,
  case faixa
    when '0. futuro (start_time ainda não chegou)' then 0
    when '1. últimos 7 dias' then 1
    when '2. 7-30 dias atrás' then 2
    when '3. 30-90 dias atrás' then 3
    else 4
  end,
  'IDADE (por start_time do slot)',
  format('%s | total: %s | sem slot_id vinculado (ambíguo): %s',
    faixa, count(*), count(*) filter (where not tem_slot_vinculado)
  )
from idade
group by faixa

order by ord, sub;

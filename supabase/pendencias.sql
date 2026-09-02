-- Uma consulta só, mesma ideia do introspect.sql: o SQL Editor mostra apenas o último resultado.
--
-- O introspect cortou os corpos das funções em 900 caracteres, e algumas ficaram sem a parte que
-- interessa: `apply_booking_package_consumption` (o trigger que consome/devolve crédito do
-- pacote), `schedule_booking` (com que status a aula nasce), `complete_booking` e `mark_no_show`
-- (o que exatamente fazem em `packages` ao consumir/preservar crédito). Sem esses trechos não dá
-- para desenhar o ledger nem a regra de estorno/undo com segurança.
--
-- `reconcile_booking_statuses` entrou na lista por outro motivo: antes de decidir o que fazer com
-- ela (Fase 1, decisão N.1), preciso confirmar se algum código dentro do próprio banco já a chama
-- (outra função, outro trigger) — isso apareceria na seção "OUTRAS_CHAMADAS" abaixo.
--
-- O que a seção "OUTRAS_CHAMADAS" NÃO consegue ver: cron (pg_cron) e Edge Functions ficam fora do
-- catalogo de funções SQL. Depois de rodar isto, veja também, direto no Supabase Studio:
--   Database → Cron Jobs   (lista jobs do pg_cron, se houver)
--   Edge Functions          (lista funções serverless, se houver)
--   Database → Webhooks     (dispara Edge Functions a partir de eventos de tabela)
-- Se qualquer uma dessas três telas mostrar algo mencionando "reconcile" ou "booking", me diga
-- antes de eu mexer na função.

with corpos as (
  select 1 as ord, 'CORPO_COMPLETO' as secao,
         p.proname || ' :: ' || pg_get_functiondef(p.oid) as linha,
         p.proname as sub
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'apply_booking_package_consumption',
      'schedule_booking',
      'complete_booking',
      'mark_no_show',
      'reconcile_booking_statuses'
    )
),
outras_chamadas as (
  select 2, 'OUTRAS_CHAMADAS',
         p.proname || ' menciona reconcile_booking_statuses no próprio corpo',
         p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname <> 'reconcile_booking_statuses'
    and p.prosrc ilike '%reconcile_booking_statuses%'
),
extensoes as (
  select 3, 'EXTENSOES_RELEVANTES',
         extname || ' instalada (verifique Database → Cron Jobs se for pg_cron)',
         extname
  from pg_extension
  where extname in ('pg_cron', 'pg_net', 'supabase_functions')
)
select secao, linha
from (
  select * from corpos
  union all select * from outras_chamadas
  union all select * from extensoes
) t(ord, secao, linha, sub)
order by ord, sub;

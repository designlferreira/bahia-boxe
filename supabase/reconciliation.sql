-- Leitura pura, nada é alterado. Mesmo padrão dos outros arquivos: uma consulta só (o SQL Editor
-- só mostra o resultado da última instrução).
--
-- Por quê: `complete_booking` e `mark_no_show` fazem seu próprio `update packages set
-- used_classes = used_classes + 1`, e esse mesmo UPDATE em `bookings.status` também dispara a
-- trigger `apply_booking_package_consumption`, que faz OUTRO incremento independente — para
-- pacotes `kind='package'`. Ou seja, toda aula concluída (ou falta, quando a configuração
-- consome crédito) nesse tipo de pacote pode ter consumido 2 créditos em vez de 1.
--
-- `booking_package_consumptions` NÃO tem esse problema: só a trigger escreve nela (a RPC nunca
-- toca essa tabela), e ela tem `primary key (booking_id)` — no máximo uma linha por aula, sempre.
-- Por isso ela serve como evidência confiável de quantas aulas realmente consumiram crédito.
--
-- Os únicos três lugares que escrevem em `packages.used_classes` em todo o schema são:
--   1. a trigger apply_booking_package_consumption (só pacotes kind='package')
--   2. complete_booking
--   3. mark_no_show
-- (assign_package_from_template / assign_package_to_student / remove_active_package só mexem em
-- status/total_classes; nenhuma outra função toca used_classes.)
--
-- Classificação por pacote, comparando used_classes com a contagem real em
-- booking_package_consumptions:
--   ok                  → used_classes == contagem. Nada a corrigir.
--   duplo_deterministico → used_classes == 2 × contagem (e contagem > 0). Todo consumo desse
--                          pacote passou pela dupla-contagem — correção seria exatamente subtrair
--                          a contagem, sem ambiguidade.
--   sem_evidencia        → used_classes > 0 mas contagem = 0. Não há nenhuma prova em
--                          booking_package_consumptions de que algo foi consumido. Não corrigir
--                          sem entender a causa.
--   ambiguo               → qualquer outro caso (ex.: contagem < used_classes < 2×contagem — só
--                          parte das aulas desse pacote passou pelo caminho que duplica). Não
--                          corrigir sem revisão manual.

with consumo_real as (
  select package_id, count(*) as qtd
  from public.booking_package_consumptions
  group by package_id
),
pacotes as (
  select
    p.id as package_id,
    p.student_id,
    coalesce(pr.name, 'Aluno') as aluno,
    p.kind,
    p.status,
    p.total_classes,
    p.used_classes,
    coalesce(cr.qtd, 0) as consumo_registrado,
    (p.used_classes - coalesce(cr.qtd, 0)) as diferenca
  from public.packages p
  join public.students s on s.id = p.student_id
  left join public.profiles pr on pr.id = s.profile_id
  left join consumo_real cr on cr.package_id = p.id
  where p.kind = 'package'
),
classificados as (
  select *,
    case
      when used_classes = 0 and consumo_registrado = 0 then 'sem_atividade'
      when diferenca = 0 then 'ok'
      when consumo_registrado > 0 and used_classes = 2 * consumo_registrado then 'duplo_deterministico'
      when consumo_registrado = 0 and used_classes > 0 then 'sem_evidencia'
      else 'ambiguo'
    end as classificacao
  from pacotes
),
resumo as (
  select 1 as ord, 'RESUMO' as secao,
         classificacao || ': ' || count(*) || ' pacote(s)'
           || case when classificacao = 'duplo_deterministico'
                    then ' · ' || sum(diferenca) || ' crédito(s) cobrado(s) a mais no total'
                    else '' end as linha,
         classificacao as sub
  from classificados
  group by classificacao
),
detalhe as (
  select 2, 'DETALHE_PACOTES',
         package_id || ' | ' || aluno || ' | status=' || status
           || ' | used_classes=' || used_classes || ' | consumo_registrado=' || consumo_registrado
           || ' | diferenca=' || diferenca || ' | ' || classificacao,
         classificacao || '-' || lpad(diferenca::text, 4, '0')
  from classificados
  where classificacao <> 'sem_atividade'
),
singles_anomalos as (
  select 3, 'SINGLES_ANOMALOS',
         p.id || ' | ' || coalesce(pr.name, 'Aluno') || ' | used_classes=' || p.used_classes
           || ' | total_classes=' || p.total_classes
           || ' | tem_linha_em_booking_package_consumptions='
           || exists(select 1 from public.booking_package_consumptions c where c.package_id = p.id),
         p.id::text
  from public.packages p
  join public.students s on s.id = p.student_id
  left join public.profiles pr on pr.id = s.profile_id
  where p.kind = 'single'
    and (p.used_classes not in (0, 1) or exists(select 1 from public.booking_package_consumptions c where c.package_id = p.id))
),
completed_sem_consumo as (
  select 4, 'COMPLETED_SEM_CONSUMO_REGISTRADO',
         b.id || ' | status=' || b.status || ' | billing_kind=' || b.billing_kind || ' | start_time=' || b.start_time,
         b.id::text
  from public.bookings b
  where b.status in ('completed', 'no_show')
    and b.billing_kind = 'package'
    and not exists (select 1 from public.booking_package_consumptions c where c.booking_id = b.id)
)
select secao, linha
from (
  select * from resumo
  union all select * from detalhe
  union all select * from singles_anomalos
  union all select * from completed_sem_consumo
) t(ord, secao, linha, sub)
order by ord, sub;

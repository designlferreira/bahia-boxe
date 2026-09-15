-- Diagnóstico SOMENTE LEITURA — separa as linhas AMBÍGUAS (is_active=false, sem slot_id
-- vinculado) do resultado anterior (355 total, 9 com slot_id, 346 ambíguas). NÃO escreve, NÃO
-- altera nada — é só SELECT.
--
-- Raciocínio do usuário: se existe ou existiu um booking cobrindo aquele horário (qualquer
-- status, incluindo cancelled/rescheduled), é evidência de queima mesmo sem slot_id —
-- provavelmente recorrência, que nunca preenche slot_id. Se nunca existiu booking nenhum ali, é
-- desativação deliberada do professor.
--
-- Achado ao escrever este diagnóstico, além do que foi pedido: a pergunta "existe booking
-- sobrepondo?" sozinha não separa direito, porque um booking sobreposto pode estar ATIVO agora
-- (scheduled/pending_confirmation) ou não. Se está ativo agora, o horário está genuinamente
-- OCUPADO neste momento — is_active=false está CORRETO, não é vazamento, e oferecer "reativar"
-- pro professor nesse caso seria perigoso (deixaria a tela sugerir liberar um horário que uma
-- aula de recorrência está usando agora). Só interessa como candidato a vazamento o booking que
-- SOBREPÔS no passado mas não está mais ativo. Por isso o corte abaixo é em 4 grupos, não 2.
--
-- Uma única consulta — tudo sai numa tabela só (secao, linha).
--
-- Quatro grupos (A já era conhecido do diagnóstico anterior, refeito aqui só pra as contas baterem):
--   A) tem slot_id vinculado — evidência direta de aula AUTOSSERVICO (já reportado: 9).
--   B) sem slot_id, MAS existe booking sobrepondo AGORA com status scheduled/pending_confirmation
--      — ocupado de verdade neste momento (provável recorrência ativa). NÃO é vazamento;
--      is_active=false está certo. Não deveria aparecer como "reativável" na tela.
--   C) sem slot_id, existe booking sobrepondo em algum momento mas NENHUM ainda ativo (só
--      cancelled/rescheduled/completed/no_show) — o evento que ocupou já terminou; candidato real
--      a vazamento (a hipótese "recorrência que já saiu dali" mora aqui).
--   D) sem slot_id, NUNCA existiu nenhum booking (de nenhum status) sobrepondo esse horário —
--      candidato a desativação deliberada do professor.

with slots_false as (
  select
    s.id,
    s.admin_id,
    s.start_time,
    s.end_time,
    exists (select 1 from public.bookings b where b.slot_id = s.id) as tem_slot_vinculado
  from public.availability_slots s
  where s.is_active = false
),

classificado as (
  select
    sf.*,
    exists (
      select 1 from public.bookings b
      where b.admin_id = sf.admin_id
        and b.status in ('scheduled', 'pending_confirmation')
        and b.start_time < sf.end_time
        and b.end_time > sf.start_time
    ) as tem_booking_ativo_agora,
    exists (
      select 1 from public.bookings b
      where b.admin_id = sf.admin_id
        and b.start_time < sf.end_time
        and b.end_time > sf.start_time
    ) as tem_booking_qualquer_status
  from slots_false sf
),

grupo as (
  select
    *,
    case
      when tem_slot_vinculado then 'A. slot_id vinculado (evidência direta AUTOSSERVICO)'
      when tem_booking_ativo_agora then 'B. ocupado agora (booking ativo sobreposto, sem slot_id — provável recorrência ativa)'
      when tem_booking_qualquer_status then 'C. já foi ocupado, não está mais ativo (candidato real a vazamento)'
      else 'D. nunca teve booking nenhum ali (candidato a desativação deliberada)'
    end as grupo_nome,
    case
      when start_time > now() then '0. futuro'
      when start_time > now() - interval '7 days' then '1. últimos 7 dias'
      when start_time > now() - interval '30 days' then '2. 7-30 dias atrás'
      when start_time > now() - interval '90 days' then '3. 30-90 dias atrás'
      else '4. mais de 90 dias atrás'
    end as faixa_idade
  from classificado
)

select 0 as ord, 0 as sub, 'RESUMO POR GRUPO' as secao,
  format('%s | total: %s | professores distintos: %s', grupo_nome, count(*), count(distinct admin_id))
from grupo
group by grupo_nome

union all

select 1,
  case faixa_idade
    when '0. futuro' then 0 when '1. últimos 7 dias' then 1 when '2. 7-30 dias atrás' then 2
    when '3. 30-90 dias atrás' then 3 else 4
  end * 10 + case grupo_nome when 'B. ocupado agora (booking ativo sobreposto, sem slot_id — provável recorrência ativa)' then 0
    when 'C. já foi ocupado, não está mais ativo (candidato real a vazamento)' then 1
    when 'D. nunca teve booking nenhum ali (candidato a desativação deliberada)' then 2 else 3 end,
  'IDADE x GRUPO (só B/C/D — A já é conhecido)',
  format('%s | %s | total: %s', faixa_idade, grupo_nome, count(*))
from grupo
where grupo_nome <> 'A. slot_id vinculado (evidência direta AUTOSSERVICO)'
group by faixa_idade, grupo_nome

union all

select 2, row_number() over (order by admin_id, start_time), 'AMOSTRA GRUPO C (até 30, candidatos reais a vazamento)',
  format('professor %s | slot %s | %s–%s', admin_id, id, start_time, end_time)
from (
  select * from grupo where grupo_nome = 'C. já foi ocupado, não está mais ativo (candidato real a vazamento)'
  order by admin_id, start_time limit 30
) amostra_c

order by ord, sub;

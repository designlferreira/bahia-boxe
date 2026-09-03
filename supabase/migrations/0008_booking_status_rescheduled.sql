-- Etapa 2 / RECORRENCIA — adiciona 'rescheduled' ao enum booking_status.
--
-- Sozinha nesta migration, de propósito (CLAUDE.md, "Domínio: agendamento", decisão 1): um valor
-- de enum não pode ser usado — em CHECK, em comparação, em qualquer escrita — na MESMA transação
-- em que foi criado, e cada migration roda como uma transação implícita. Qualquer código que passe
-- a gravar/ler 'rescheduled' fica pra uma migration posterior (0016_reagendar_cancelar_aula.sql).
--
-- Reversibilidade é parcial por natureza do Postgres: um valor de enum nunca usado não quebra
-- rollback, mas remover valor de enum não é suportado — aceito, decisão já registrada.
--
-- É o único valor novo que o vocabulário da spec RECORRENCIA precisa: AGENDADA/REALIZADA/FALTA/
-- CANCELADA já têm equivalente direto no enum existente (scheduled/completed/no_show/cancelled).
-- REAGENDADA não tinha — este é ele.

alter type public.booking_status add value if not exists 'rescheduled';

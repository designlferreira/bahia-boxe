-- Etapa 4/5 da migration de "is_active — Opção B" (CLAUDE.md, "Pontos ainda em aberto").
--
-- EXCLUDE USING gist — nenhum professor pode ter dois bookings ATIVOS (`scheduled` ou
-- `pending_confirmation`) com intervalos de tempo sobrepostos. Até aqui esse invariante só era
-- imposto por checagens de aplicação espalhadas (`schedule_booking`, `gerar_pacote_recorrencia`,
-- `reagendar_aula`) — cada uma com sua própria janela de corrida (TOCTOU). Isto é o freio final, no
-- banco, que nenhuma delas pode furar.
--
-- Vem POR ÚLTIMO nesta sequência de 5, de propósito (decisão explícita, resposta à pergunta (a) do
-- usuário): as três funções acima (0025, 0027) já ganharam tratamento de
-- `exclusion_violation` ANTES desta migration existir — o handler fica dormente até aqui. Nesta
-- ordem, a constraint nunca chega a mostrar um erro cru de Postgres pra ninguém, nem por um
-- instante: no momento em que ela passa a existir, a tradução pra mensagem legível já está pronta
-- nos três lugares que inserem em `bookings`. A ordem inversa (constraint primeiro) protegeria a
-- mesma coisa alguns minutos mais cedo, mas abriria uma janela real, ainda que curta, em que uma
-- colisão rejeitada pela constraint apareceria como texto cru do Postgres em vez da mensagem de
-- sempre — exatamente o resultado "confuso" que o usuário queria evitar.
--
-- `btree_gist` é necessário porque `admin_id` (uuid) entra na comparação por IGUALDADE dentro de um
-- índice GiST — GiST nativo só cobre tipos de range/geométricos; a extensão adiciona a classe de
-- operadores de igualdade para tipos escalares comuns (uuid incluso). Nenhuma outra extensão deste
-- projeto faz isso hoje — diferente de `packages_one_trial_per_student`/
-- `ux_packages_one_active_purchase_per_student` (CLAUDE.md), que são índices únicos parciais
-- comuns, sem GiST e sem extensão nenhuma; aquele padrão é o precedente de "regra de negócio
-- imposta no banco, não só em código", não um precedente técnico de sintaxe.
--
-- `tstzrange`, não `tsrange`: `start_time`/`end_time` são `timestamptz` (com fuso), confirmado em
-- toda função desta base que os declara — `tsrange` é para `timestamp` sem fuso e daria erro de
-- tipo. Limite `'[)'` (início incluso, fim excluso) explícito porque é exatamente o predicado que
-- todo overlap-check escrito à mão neste projeto já usa (`a.start < b.end and a.end > b.start`) —
-- manter os dois em sincronia era o ponto desta mudança inteira.
--
-- Diagnóstico `supabase/diagnostico_concorrencia_bookings.sql` rodado e limpo (0 pares sobrepostos,
-- 0 professores afetados) — a constraint pode ser criada sem violar nenhuma linha existente.

create extension if not exists btree_gist;

alter table public.bookings
  add constraint bookings_sem_sobreposicao_por_professor
  exclude using gist (
    admin_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  )
  where (status in ('scheduled', 'pending_confirmation'));

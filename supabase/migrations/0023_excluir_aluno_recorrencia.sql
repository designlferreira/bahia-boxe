-- RECORRENCIA — excluir um dia fixo de `aluno_recorrencia`, não só desativar (CLAUDE.md, "UX da
-- lista de dias fixos" — pendência registrada em 2026-09-08, resolvida aqui).
--
-- Antes desta migration só existia toggle (`ativo`): a lista só crescia, sem forma de remover uma
-- linha criada por engano ou de um ciclo antigo. Exclusão de verdade precisa de uma regra que
-- `ativo=false` sozinho não dá: `bookings.recorrencia_id` e `packages.recorrencia_id` são `NO
-- ACTION` contra esta tabela (confirmado por introspecção real, `diagnostico_limpeza_teste.sql`,
-- 2026-09-09) — nunca CASCADE, então o pior cenário (apagar a recorrência apagaria as aulas que ela
-- gerou) não existe no schema. Mas isso só impede o desastre; não decide QUANDO excluir deveria ser
-- permitido — essa é a decisão de negócio implementada abaixo.
--
-- REGRA: excluir só é permitido quando a recorrência nunca gerou NADA — nenhum `booking` nem
-- `package` com esse `recorrencia_id`, em QUALQUER status (inclusive `cancelled`/`regeneracao`).
-- Rastreabilidade de "por que esta aula existe" vale mesmo pra aula descartada — mesmo raciocínio
-- já aplicado às 24 aulas de regeneração do aluno real LK (CLAUDE.md, "Limpeza de dados de teste").
-- Se já gerou algo, o caminho é desativar (`ativo=false`), nunca excluir. Sem exigir desativar
-- ANTES de poder excluir quando nunca houve uso — duas ações pro mesmo fim seria fricção sem
-- propósito (decisão do usuário).
--
-- IMPRECISÃO CONHECIDA, registrada aqui e no CLAUDE.md — não é bug desta migration, é uma
-- característica de `gerar_pacote_recorrencia` (0019) que afeta a confiabilidade da checagem:
-- `packages.recorrencia_id` grava só o `recorrencia_id` do PRIMEIRO slot do array
-- (`set recorrencia_id = (p_slots->0->>'recorrencia_id')::uuid`). Um pacote que combina dois dias
-- fixos (recorrência A e B) referencia só A no PRÓPRIO pacote — mas cada `booking` individual
-- carrega o `recorrencia_id` CORRETO por linha. Por isso a checagem em `bookings` é a autoritativa;
-- a checagem em `packages` é defesa redundante e, sozinha, incompleta (poderia deixar passar uma
-- recorrência B "combinada" se por algum motivo checássemos só packages). As duas juntas continuam
-- corretas porque `bookings` nunca erra: não corrigir `packages.recorrencia_id` agora (fora do
-- escopo desta migration), só não deixar ninguém depois assumir que esse campo é uma lista completa
-- de "de quais recorrências este pacote veio" quando há mais de um dia fixo envolvido.

create or replace function public.excluir_aluno_recorrencia(p_recorrencia_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_aluno_id uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  select aluno_id into v_aluno_id from public.aluno_recorrencia where id = p_recorrencia_id;

  if v_aluno_id is null then
    raise exception 'Recorrência não encontrada.';
  end if;

  if not exists (select 1 from public.students s where s.id = v_aluno_id and s.admin_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;

  -- Checagem dupla, sem filtro de status (ver nota acima) — bookings autoritativa, packages
  -- redundante/incompleta sozinha.
  if exists (select 1 from public.bookings where recorrencia_id = p_recorrencia_id)
     or exists (select 1 from public.packages where recorrencia_id = p_recorrencia_id)
  then
    raise exception 'Esta recorrência já gerou aula ou pacote — não é possível excluir. Desative em vez de excluir.';
  end if;

  delete from public.aluno_recorrencia where id = p_recorrencia_id;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- RLS: a policy única `aluno_recorrencia_professor_all` (0009, `for all`) aplicava a MESMA
-- checagem de posse pras quatro operações. DELETE agora precisa de uma condição a mais (a mesma
-- regra de negócio de cima) — Postgres não permite USING diferente por comando dentro de uma única
-- `for all`, então ela vira 4 policies. SELECT/INSERT/UPDATE continuam idênticas ao que já era.
--
-- Por quê repetir a checagem aqui em vez de confiar só na RPC: mesmo princípio já registrado no
-- CLAUDE.md pra `_create_package`/pro bloqueio por ação da Etapa 7 — "esconder o botão (ou expor só
-- a RPC) não é a única proteção". Sem isto, `client().from("aluno_recorrencia").delete()` direto
-- (bypassando `excluir_aluno_recorrencia`) ficaria bloqueado só pela FK `NO ACTION` crua — que
-- protegeria os dados, mas sem a mensagem amigável, e pior: deixaria passar em silêncio o caso
-- "nunca usada" que deveria mesmo ser permitido. Com a policy espelhando a regra, o comportamento é
-- idêntico não importa o caminho.
-- ---------------------------------------------------------------------------------------------

drop policy if exists aluno_recorrencia_professor_all on public.aluno_recorrencia;
drop policy if exists aluno_recorrencia_professor_select on public.aluno_recorrencia;
drop policy if exists aluno_recorrencia_professor_insert on public.aluno_recorrencia;
drop policy if exists aluno_recorrencia_professor_update on public.aluno_recorrencia;
drop policy if exists aluno_recorrencia_professor_delete on public.aluno_recorrencia;

create policy aluno_recorrencia_professor_select on public.aluno_recorrencia
  for select
  using (exists (
    select 1 from public.students s where s.id = aluno_recorrencia.aluno_id and s.admin_id = auth.uid()
  ));

create policy aluno_recorrencia_professor_insert on public.aluno_recorrencia
  for insert
  with check (exists (
    select 1 from public.students s where s.id = aluno_recorrencia.aluno_id and s.admin_id = auth.uid()
  ));

create policy aluno_recorrencia_professor_update on public.aluno_recorrencia
  for update
  using (exists (
    select 1 from public.students s where s.id = aluno_recorrencia.aluno_id and s.admin_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.students s where s.id = aluno_recorrencia.aluno_id and s.admin_id = auth.uid()
  ));

create policy aluno_recorrencia_professor_delete on public.aluno_recorrencia
  for delete
  using (
    exists (select 1 from public.students s where s.id = aluno_recorrencia.aluno_id and s.admin_id = auth.uid())
    and not exists (select 1 from public.bookings b where b.recorrencia_id = aluno_recorrencia.id)
    and not exists (select 1 from public.packages p where p.recorrencia_id = aluno_recorrencia.id)
  );

-- Etapa 3 / RECORRENCIA — calcular_saldo_pacote(p_pacote_id) + view de leitura (CLAUDE.md,
-- decisão 4). Única autoridade de saldo: consumo é propriedade da CADEIA, não da linha
-- individual — agrupa bookings por cadeia_id, acha a linha TERMINAL de cada cadeia e aplica a
-- regra de crédito só sobre ela.
--
-- Só vale pra pacotes de recorrência (recorrencia_id is not null) — um pacote AUTOSSERVICO nunca
-- tem bookings com pacote_id preenchido (esse vínculo é novo, decisão 7), então chamar esta função
-- nele devolveria consumidas=0 sempre, silenciosamente errado. Chamar aqui num pacote sem
-- recorrencia_id dá exceção em vez de devolver um saldo que parece certo mas não é — o saldo desse
-- tipo de pacote continua vindo de available_credits_for_student/o ledger, sem mudança.

create or replace function public.calcular_saldo_pacote(p_pacote_id uuid)
returns table (total int, consumidas int, restantes int, a_repor int)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total int;
  v_recorrencia_id uuid;
  v_falta_consome boolean;
begin
  -- Autorização: o próprio aluno dono do pacote, ou o professor dono do aluno — mesmo padrão de
  -- dupla visibilidade já usado em credit_transactions (self + admin select). Não existe nem
  -- não é seu dão a MESMA exceção, de propósito (não vazar se o id existe).
  select p.total_classes, p.recorrencia_id, coalesce(p.falta_consome_credito, pr.no_show_consumes_class)
    into v_total, v_recorrencia_id, v_falta_consome
  from public.packages p
  join public.students s on s.id = p.student_id
  join public.profiles pr on pr.id = s.admin_id
  where p.id = p_pacote_id
    and (s.profile_id = auth.uid() or s.admin_id = auth.uid());

  if v_total is null then
    raise exception 'not_allowed';
  end if;

  if v_recorrencia_id is null then
    raise exception 'not_a_recurrencia_package';
  end if;

  return query
  with cadeias_do_pacote as (
    -- Cadeias que têm ao menos uma linha com pacote_id = este pacote. Pega a cadeia inteira pelo
    -- cadeia_id, não só as linhas com pacote_id preenchido — um sucessor criado por reagendamento
    -- (Etapa 6) pertence à mesma cadeia mesmo que ainda não tenha herdado pacote_id explicitamente.
    select distinct b.cadeia_id
    from public.bookings b
    where b.pacote_id = p_pacote_id
  ),
  linhas as (
    select b.*
    from public.bookings b
    join cadeias_do_pacote c on c.cadeia_id = b.cadeia_id
  ),
  terminais as (
    -- Terminal = linha que nenhuma outra linha da MESMA cadeia aponta via
    -- replacement_for_booking_id. `distinct on` + `order by created_at desc` é defesa contra um
    -- dado anômalo (duas linhas diferentes apontando pro mesmo antecessor, o que a RPC
    -- mark_as_replacement do AUTOSSERVICO não impede hoje) — nunca deixa uma cadeia contribuir
    -- mais de uma vez pro total.
    select distinct on (l.cadeia_id) l.*
    from linhas l
    where not exists (
      select 1 from linhas l2 where l2.replacement_for_booking_id = l.id
    )
    order by l.cadeia_id, l.created_at desc
  ),
  consumo_por_cadeia as (
    select
      case
        when t.status = 'completed' then 1
        when t.status = 'no_show' and v_falta_consome then 1
        when t.status = 'cancelled' and t.cancelado_por = 'aluno' and v_falta_consome then 1
        else 0 -- cancelled+professor nunca consome; rescheduled nunca é terminal de verdade, mas
               -- se aparecer como terminal (dado incompleto) também não consome, por segurança.
      end as consome,
      -- "aguardando reposição": só quando o crédito foi PERDOADO e ainda não foi reposto. Uma vez
      -- que a reposição é registrada (mark_as_replacement herda cadeia_id, decisão 2), o terminal
      -- da cadeia deixa de ser o no_show/cancelled perdoado — contar só terminais atuais já
      -- exclui automaticamente cadeias já repostas, sem precisar de uma subtração à parte
      -- ("faltas_perdoadas − reposicoes_ja_agendadas" cai fora por construção, não por fórmula).
      (t.status = 'no_show' and not v_falta_consome)
        or (t.status = 'cancelled' and t.cancelado_por = 'aluno' and not v_falta_consome)
        as aguardando_reposicao
    from terminais t
  )
  select
    v_total,
    coalesce(sum(consome), 0)::int,
    greatest(0, v_total - coalesce(sum(consome), 0)::int),
    coalesce(sum(case when aguardando_reposicao then 1 else 0 end), 0)::int
  from consumo_por_cadeia;
end;
$function$;

-- View de leitura — evita a UI chamar a função por linha numa lista (decisão 4). Filtra por
-- recorrencia_id ANTES do lateral join (nunca dispara not_a_recurrencia_package numa listagem) e
-- repete a mesma checagem de posse que a função já faz — defesa em profundidade, não depende de
-- packages já ter (ou não) RLS própria configurada fora deste repositório.
create or replace view public.saldo_pacotes as
select
  p.id as pacote_id,
  p.student_id,
  p.recorrencia_id,
  saldo.total,
  saldo.consumidas,
  saldo.restantes,
  saldo.a_repor
from public.packages p
join public.students s on s.id = p.student_id
cross join lateral public.calcular_saldo_pacote(p.id) saldo
where p.recorrencia_id is not null
  and (s.profile_id = auth.uid() or s.admin_id = auth.uid());

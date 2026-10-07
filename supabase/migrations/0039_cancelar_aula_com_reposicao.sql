-- RECORRENCIA — cancelar uma aula de pacote de recorrência pode já MARCAR a aula que a substitui.
--
-- Problema (achado em uso real, 2026-10-07): cancelamento pelo professor nunca consome crédito
-- (decisão 4), então a aula cancelada volta como "restante" no pacote — mas nada marcava uma aula
-- nova, e o pacote ficava com menos aulas marcadas do que o saldo (ex.: "1 aula restante" sem
-- nenhuma aula na agenda). A invariante que o professor espera: o pacote sempre tem todas as aulas
-- marcadas, seguindo os dias/horários fixos do aluno.
--
-- Decisão de desenho: a aula nova é uma SUCESSORA da cancelada — mesmo mecanismo da reposição e da
-- remarcação (decisão 2): `replacement_for_booking_id` = a cancelada, `cadeia_id` herdado. O
-- terminal da cadeia passa a ser a aula nova (`scheduled`, não consome), então o saldo continua
-- correto por construção, sem tocar em `calcular_saldo_pacote`.
--
-- Quem calcula a data é o CLIENTE (próximo horário fixo ativo depois da última aula do pacote),
-- pelo mesmo motivo da decisão 9: a conversão BRT->UTC já vive em `computeRecorrenciaSlots`
-- (`fromZonedTime`), não vale reimplementá-la em PL/pgSQL. A RPC só VALIDA e grava.
--
-- Os três parâmetros novos têm DEFAULT NULL: uma chamada antiga, com dois argumentos, continua
-- funcionando e cancela sem repor. Como o nome é o mesmo, a versão de 2 argumentos da 0020 é
-- REMOVIDA (duas sobrecargas deixariam a chamada ambígua — mesmo cuidado da 0038).
--
-- Reposição automática só vale para cancelamento PELO PROFESSOR: quando o aluno cancela, o crédito
-- consome ou fica a repor pela regra do pacote, e quem decide como repor continua sendo o professor.

drop function if exists public.cancelar_aula(uuid, text);

create or replace function public.cancelar_aula(
  p_booking_id uuid,
  p_cancelado_por text,
  p_repor_inicio timestamptz default null,
  p_repor_fim timestamptz default null,
  p_repor_recorrencia_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_orig record;
  v_saldo record;
  v_cadeia_id uuid;
  v_rec_id uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  if p_cancelado_por is null or p_cancelado_por not in ('professor', 'aluno') then
    raise exception 'Motivo de cancelamento inválido: use "professor" ou "aluno".';
  end if;

  select * into v_orig from public.bookings where id = p_booking_id for update;

  if v_orig.id is null then
    raise exception 'Booking not found';
  end if;
  if v_orig.admin_id <> auth.uid() then
    raise exception 'not_allowed';
  end if;
  if v_orig.status = 'cancelled' then
    return; -- idempotente
  end if;
  if v_orig.status <> 'scheduled' then
    raise exception 'Só uma aula agendada pode ser cancelada.';
  end if;

  if p_repor_inicio is not null or p_repor_fim is not null then
    if p_cancelado_por <> 'professor' then
      raise exception 'A reposição automática só vale quando o professor cancela.';
    end if;
    if v_orig.pacote_id is null then
      raise exception 'Só uma aula de pacote de recorrência pode ser reposta automaticamente.';
    end if;
    if p_repor_inicio is null or p_repor_fim is null or p_repor_fim <= p_repor_inicio then
      raise exception 'Horário inválido para a aula nova: o fim precisa ser depois do início.';
    end if;
    if p_repor_inicio <= now() then
      raise exception 'Não dá para marcar a aula nova em um horário que já passou.';
    end if;

    v_rec_id := v_orig.recorrencia_id;
    if p_repor_recorrencia_id is not null then
      if not exists (
        select 1 from public.aluno_recorrencia r
        where r.id = p_repor_recorrencia_id and r.aluno_id = v_orig.student_id
      ) then
        raise exception 'not_allowed';
      end if;
      v_rec_id := p_repor_recorrencia_id;
    end if;
  end if;

  update public.bookings
  set status = 'cancelled', cancelado_por = p_cancelado_por
  where id = p_booking_id;

  -- Aula nova (sucessora). A checagem de sobreposição roda DEPOIS do update, então a própria
  -- cancelada já não conta; qualquer falha aqui desfaz o cancelamento junto (mesma transação) —
  -- nunca fica "cancelada sem a aula que a repõe" quando o professor pediu a reposição.
  if p_repor_inicio is not null then
    if exists (
      select 1 from public.bookings b
      where b.admin_id = auth.uid()
        and b.status in ('scheduled', 'pending_confirmation')
        and p_repor_inicio < b.end_time
        and p_repor_fim > b.start_time
    ) then
      raise exception 'O próximo horário fixo do aluno já está ocupado. Cancele sem repor e marque a aula na mão.';
    end if;

    v_cadeia_id := coalesce(v_orig.cadeia_id, v_orig.id);
    update public.bookings set cadeia_id = v_cadeia_id where id = p_booking_id;

    begin
      insert into public.bookings (
        student_id, admin_id, start_time, end_time, status, billing_kind,
        pacote_id, recorrencia_id, cadeia_id, replacement_for_booking_id, is_replacement
      ) values (
        v_orig.student_id, v_orig.admin_id, p_repor_inicio, p_repor_fim,
        'scheduled', coalesce(v_orig.billing_kind, 'package'),
        v_orig.pacote_id, v_rec_id, v_cadeia_id, p_booking_id, true
      );
    exception
      when exclusion_violation then
        raise exception 'O próximo horário fixo do aluno já está ocupado. Cancele sem repor e marque a aula na mão.';
    end;
  end if;

  -- Aqui o consumo PODE mudar: cancelada por aluno consome se `falta_consome_credito`; por
  -- professor nunca consome (regra única, decisão 4 — quem aplica é calcular_saldo_pacote).
  if v_orig.pacote_id is not null then
    perform 1 from public.packages where id = v_orig.pacote_id for update;
    select * into v_saldo from public.calcular_saldo_pacote(v_orig.pacote_id);
    update public.packages
    set used_classes = v_saldo.consumidas,
        status = case
          when status <> 'active' then status
          when v_saldo.consumidas >= v_saldo.total then 'finished'
          else 'active'
        end
    where id = v_orig.pacote_id;
  end if;
end;
$function$;

-- Mesmo REVOKE/GRANT que as outras RPCs de professor deste projeto (a função se protege por dentro
-- com `only_admin`; o GRANT só garante que a assinatura nova seja chamável por quem está logado).
revoke execute on function public.cancelar_aula(uuid, text, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.cancelar_aula(uuid, text, timestamptz, timestamptz, uuid) to authenticated;

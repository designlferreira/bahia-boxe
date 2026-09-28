-- 0034 — O aluno cancela a própria aula por RPC (inclusive a ainda pendente) (2026-09-28)
--
-- BUG ANTIGO (anterior a esta sessão), visto ao ler as policies de `bookings` em 2026-09-28:
-- `cancelBooking` fazia UPDATE direto, mas a policy de UPDATE do aluno (`bookings_student_update`)
-- só alcança aula `scheduled`. Uma aula que o aluno agendou no autosserviço e o professor ainda
-- não aprovou está `pending_confirmation` — o UPDATE afetava 0 linhas e o app mostrava "Só é
-- possível cancelar até 6 horas antes", que não era o motivo.
--
-- `cancelar_minha_aula(p_booking_id)`:
--   - aula do aluno logado;
--   - `pending_confirmation` (pedido ainda não aprovado): pode cancelar a qualquer momento antes do
--     início — o professor nem confirmou ainda;
--   - `scheduled`: mantém a regra que a policy já aplicava, até 6h antes do início;
--   - grava `cancelado_por = 'aluno'` (mesmo carimbo que a guarda da 0030 aplica);
--   - aula de recorrência (`pacote_id`): ressincroniza `used_classes` pela regra única
--     (`calcular_saldo_pacote`), como `cancelar_aula` (0020) faz do lado do professor;
--   - se a aula for um PEDIDO DE REMARCAÇÃO (0033: pendente com antecessor), cancelar é desistir
--     do pedido — mesmo efeito de `cancelar_pedido_remarcacao` (sai da cadeia).
--
-- O caminho antigo (UPDATE direto pra `cancelled`) continua aceito pela guarda da 0030 — só deixa
-- de ser usado pelo app. Idempotente: create or replace.

create or replace function public.cancelar_minha_aula(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b public.bookings;
  v_saldo record;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;

  if v_b.id is null or not public._booking_do_aluno_logado(v_b.student_id) then
    raise exception 'not_allowed';
  end if;

  if v_b.status = 'pending_confirmation' and v_b.replacement_for_booking_id is not null then
    perform public._desligar_pedido_da_cadeia(p_booking_id, 'cancelled', null);
    return;
  end if;

  if v_b.status = 'pending_confirmation' then
    if v_b.start_time <= now() then
      raise exception 'already_started';
    end if;
  elsif v_b.status = 'scheduled' then
    if v_b.start_time < now() + interval '6 hours' then
      raise exception 'too_late';
    end if;
  else
    raise exception 'not_cancelable';
  end if;

  update public.bookings
  set status = 'cancelled', cancelado_por = 'aluno'
  where id = p_booking_id;

  if v_b.pacote_id is not null then
    perform 1 from public.packages where id = v_b.pacote_id for update;
    select * into v_saldo from public.calcular_saldo_pacote(v_b.pacote_id);
    update public.packages
    set used_classes = v_saldo.consumidas,
        status = case
          when status <> 'active' then status
          when v_saldo.consumidas >= v_saldo.total then 'finished'
          else 'active'
        end
    where id = v_b.pacote_id;
  end if;
end;
$function$;

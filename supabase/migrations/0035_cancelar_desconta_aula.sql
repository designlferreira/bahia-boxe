-- 0035 — O aluno vê, antes de cancelar, se o cancelamento desconta uma aula (2026-09-29)
--
-- O professor via a consequência ("Pela regra deste pacote, desconta 1 aula"), o aluno cancelava
-- sem saber. `profiles` e `packages.falta_consome_credito` não são legíveis pelo aluno por
-- consulta direta, então uma função devolve só a resposta — mesmo padrão de
-- `whatsapp_do_professor` (0032) e `modo_agendamento_efetivo` (0022).
--
-- `cancelamento_desconta_aula(p_booking_id) returns boolean` — só a aula do aluno logado:
--   - aula de pacote de recorrência (`pacote_id` não nulo): a regra do PACOTE
--     (`falta_consome_credito`), com o padrão do professor quando o pacote não tem a cópia — é
--     exatamente o que `calcular_saldo_pacote` (0013) aplica a "cancelada pelo aluno";
--   - aula sem pacote (autosserviço): cancelar nunca desconta (o ledger só se mexe em concluir e
--     falta — `cancelar_minha_aula`, 0034, não lança nada).
--
-- Idempotente: create or replace. Só leitura.

create or replace function public.cancelamento_desconta_aula(p_booking_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path to 'public'
as $function$
declare
  v_b public.bookings;
  v_snapshot boolean;
  v_padrao boolean;
begin
  select * into v_b from public.bookings where id = p_booking_id;

  if v_b.id is null or not public._booking_do_aluno_logado(v_b.student_id) then
    raise exception 'not_allowed';
  end if;

  if v_b.pacote_id is null then
    return false;
  end if;

  select falta_consome_credito into v_snapshot from public.packages where id = v_b.pacote_id;
  select no_show_consumes_class into v_padrao from public.profiles where id = v_b.admin_id;

  return coalesce(v_snapshot, v_padrao, true);
end;
$function$;

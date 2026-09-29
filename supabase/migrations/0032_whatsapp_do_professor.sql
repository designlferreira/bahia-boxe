-- 0032 — WhatsApp do professor, pro aluno falar com ele a partir do app (2026-09-28)
--
-- Decisão do Lucas (2026-09-28): o canal do aluno com o professor é o WhatsApp. Guardado POR
-- PROFESSOR (não fixo no código): o produto vai ter vários professores, cada um com a própria marca
-- (PRODUCT.md), e cada um edita o seu em Configurações.
--
-- - `profiles.whatsapp`: nullable (professor sem número = o app não oferece o botão), só dígitos
--   com código do país, 10 a 15 dígitos (formato que o link wa.me aceita). O app normaliza antes
--   de gravar; o CHECK é a rede de segurança.
-- - `whatsapp_do_professor(p_professor_id)`: mesmo padrão de `modo_agendamento_efetivo` (0022). O
--   aluno não lê `profiles` do professor (fronteira fechada de propósito — supabase/README.md);
--   a função devolve só este campo, e só pro próprio professor ou pra aluno matriculado com ele.
-- - Preenche o número do professor atual SÓ se houver exatamente um professor no banco e ele ainda
--   não tiver número — é o caso de hoje (um professor só, supabase/README.md). Com mais de um,
--   não adivinha: cada um preenche em Configurações.
--
-- Idempotente: add column if not exists, drop/add constraint nomeado, create or replace, e o
-- UPDATE só toca linha com whatsapp NULL.

alter table public.profiles add column if not exists whatsapp text;

alter table public.profiles drop constraint if exists profiles_whatsapp_check;
alter table public.profiles
  add constraint profiles_whatsapp_check check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$');

create or replace function public.whatsapp_do_professor(p_professor_id uuid)
returns text
language plpgsql
security definer
stable
set search_path to 'public'
as $function$
declare
  v_whatsapp text;
begin
  if p_professor_id <> auth.uid()
     and not exists (
       select 1 from public.students s
       where s.admin_id = p_professor_id and s.profile_id = auth.uid()
     )
  then
    raise exception 'not_allowed';
  end if;

  select whatsapp into v_whatsapp from public.profiles where id = p_professor_id;
  return v_whatsapp;
end;
$function$;

-- Número informado pelo Lucas em 2026-09-28: +55 11 94703-4983.
update public.profiles
set whatsapp = '5511947034983'
where role = 'admin'
  and whatsapp is null
  and (select count(*) from public.profiles where role = 'admin') = 1;

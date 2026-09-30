-- 0038 — O convite guarda o NOME de quem vai receber (2026-09-30)
--
-- A lista de convites em aberto mostrava só a data ("Criado em 29 set"): com vários convites, o professor não sabia qual era de quem.
-- Esta migration acrescenta `invites.nome_convidado` (opcional) e deixa `criar_convite` recebê-lo.
--
-- O que muda:
--   1. `invites.nome_convidado text`, NULLABLE (convites antigos e sem nome ficam NULL), com CHECK de 1 a 80 caracteres quando preenchido.
--      É só um rótulo do professor: `validate_invite` e `accept_invite` NÃO o leem e o aluno não o vê. Não é o nome da conta do aluno.
--   2. `criar_convite(p_nome text default null)`. A versão sem argumento (0037) é REMOVIDA e substituída por esta: como o parâmetro tem
--      DEFAULT, uma chamada sem argumento (`rpc("criar_convite")`, que é o que o app em produção faz até o novo deploy) continua
--      funcionando e cria convite sem nome. Duas sobrecargas (com e sem argumento) deixariam a chamada ambígua.
--   O resto da regra é o da 0037: só professor (`only_admin`), convite de uso único, vale 7 dias, token de 64 hex gerado no servidor.
--   Nome em branco vira NULL; nome com mais de 80 caracteres é recusado (`nome_muito_longo`; a tela já limita a 80).
--
-- Idempotente: add column if not exists, constraint recriada, create or replace + drop if exists + revoke/grant.

alter table public.invites add column if not exists nome_convidado text;

alter table public.invites drop constraint if exists invites_nome_convidado_check;
alter table public.invites
  add constraint invites_nome_convidado_check
  check (nome_convidado is null or char_length(nome_convidado) between 1 and 80);

create or replace function public.criar_convite(p_nome text default null)
returns table(token text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_validade constant interval := interval '7 days';
  v_nome text := nullif(btrim(p_nome), '');
  v_token text;
  v_expira timestamptz;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  if char_length(v_nome) > 80 then
    raise exception 'nome_muito_longo';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expira := now() + v_validade;

  insert into public.invites (admin_id, token, expires_at, used, nome_convidado)
  values (auth.uid(), v_token, v_expira, false, v_nome);

  return query select v_token, v_expira;
end;
$function$;

-- A versão da 0037 (sem argumento) sai: a nova a substitui e aceita a chamada sem argumento.
drop function if exists public.criar_convite();

-- Só quem está logado chama (a checagem de professor é a de dentro).
revoke all on function public.criar_convite(text) from public, anon;
grant execute on function public.criar_convite(text) to authenticated;

-- 0037 — O professor cria o convite de aluno dentro do app (2026-09-30)
--
-- Até aqui o app só VALIDAVA e ACEITAVA convite (`validate_invite`, `accept_invite`); a criação era feita
-- fora do app. A tabela `invites` já existe (admin_id, token, expires_at, used) e o diagnóstico de
-- 2026-09-30 (`supabase/diagnostico_convites.sql`) mostrou: RLS ligada, o professor já pode inserir e ler os
-- próprios convites, e `validate_invite`/`accept_invite` leem exatamente essas colunas. Esta migration NÃO
-- mexe na tabela, nas policies nem nessas duas funções.
--
-- Por que uma função e não um `insert` direto do app (que a policy `invites_admin_insert` já permitiria):
--   1. o token é gerado NO SERVIDOR (2 UUIDs v4 do `gen_random_uuid()` = 64 caracteres hexadecimais, ~244 bits
--      de aleatoriedade), não por código de navegador;
--   2. a policy de insert só confere `admin_id = auth.uid()` — qualquer usuário logado, inclusive um ALUNO,
--      poderia criar convite para si mesmo e vincular outras pessoas como "alunos" dele. A função exige
--      `profiles.role = 'admin'` (mesmo padrão de `email_do_aluno`, 0036).
--   A policy em si NÃO foi mexida (registrado em CLAUDE.md como ponto em aberto de segurança).
--
-- `criar_convite() returns table(token text, expires_at timestamptz)`:
--   - só o PROFESSOR; cria um convite de USO ÚNICO (`used = false`) para o próprio `admin_id = auth.uid()`;
--   - vale 7 dias (`v_validade`, o único lugar para mudar);
--   - devolve só o token e a data de validade. O app monta o link (`<endereço do app>/convite/<token>`).
--
-- Idempotente: create or replace + revoke/grant.

create or replace function public.criar_convite()
returns table(token text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_validade constant interval := interval '7 days';
  v_token text;
  v_expira timestamptz;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expira := now() + v_validade;

  insert into public.invites (admin_id, token, expires_at, used)
  values (auth.uid(), v_token, v_expira, false);

  return query select v_token, v_expira;
end;
$function$;

-- Só quem está logado chama (a checagem de professor é a de dentro).
revoke all on function public.criar_convite() from public, anon;
grant execute on function public.criar_convite() to authenticated;

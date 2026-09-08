-- Etapa 7 / RECORRENCIA — flag `modo_agendamento` (CLAUDE.md).
--
-- Os dois fluxos (AUTOSSERVICO e RECORRENCIA, Etapas 1-6) coexistem hoje sem nenhuma separação de
-- tela: um professor em recorrência ainda vê "Agendar aula" oferecido ao aluno, e nada impede um
-- professor em autosserviço de abrir a tela de recorrência de um aluno. Esta migration só cria a
-- flag e a forma de lê-la — a Etapa 7 não muda nenhuma regra de crédito nem RPC de ciclo de vida
-- da aula; quem lê a flag para decidir navegação é o frontend (ver AdminConfiguracoes.tsx,
-- Agendar.tsx, AlunoRecorrencia.tsx).
--
-- Nome dos valores em minúsculo por consistência com o resto do banco: `booking_status`, `origin`,
-- `kind`, `cancelado_por` são todos lowercase; `AUTOSSERVICO`/`RECORRENCIA` em maiúsculo só existem
-- na prosa do CLAUDE.md e nas constantes TypeScript, nunca no valor gravado.

-- ---------------------------------------------------------------------------------------------
-- 1. Coluna nova, nullable — nenhum professor existente muda de comportamento por esta migration.
--    NULL significa "nunca configurado" e é lido como AUTOSSERVICO (default do fluxo legado-ativo,
--    decisão registrada no CLAUDE.md) por `modo_agendamento_efetivo()` abaixo — nunca por um
--    `default` de coluna, para o coalesce ficar num lugar só.
-- ---------------------------------------------------------------------------------------------

alter table public.profiles
  add column modo_agendamento text check (modo_agendamento in ('autosservico', 'recorrencia'));

-- ---------------------------------------------------------------------------------------------
-- 2. modo_agendamento_efetivo(p_professor_id) — único ponto de leitura da flag por quem NÃO é o
--    próprio professor.
--
--    Por que RPC e não uma policy nova em `profiles`: a tabela é lida por dois grupos hoje —
--    "select own" (qualquer perfil lê o próprio) e `is_admin()` (professor lê os perfis dos
--    próprios alunos). Não existe o sentido inverso — aluno lendo a linha do professor — e é assim
--    de propósito (supabase/README.md: "Aluno não enxerga o perfil do professor"). Abrir uma
--    policy de SELECT nesse sentido só para esta flag reabriria essa fronteira para todo o resto
--    da tabela (RLS não filtra coluna), o que é desproporcional a uma única flag de navegação.
--    Uma função `security definer` que devolve só o campo necessário resolve sem tocar na policy.
--
--    Autorização interna: quem pode perguntar o modo efetivo de um professor é o próprio professor
--    ou um aluno matriculado com ele — mesmo padrão de dupla checagem já usado em
--    `calcular_saldo_pacote` (0013). Não é dado sensível (não é crédito, não é dinheiro), mas
--    também não há razão para deixar qualquer conta autenticada consultar a configuração de
--    qualquer professor por id.
-- ---------------------------------------------------------------------------------------------

create or replace function public.modo_agendamento_efetivo(p_professor_id uuid)
returns text
language plpgsql
security definer
stable
set search_path to 'public'
as $function$
declare
  v_modo text;
begin
  if p_professor_id <> auth.uid()
     and not exists (
       select 1 from public.students s
       where s.admin_id = p_professor_id and s.profile_id = auth.uid()
     )
  then
    raise exception 'not_allowed';
  end if;

  select modo_agendamento into v_modo from public.profiles where id = p_professor_id;
  return coalesce(v_modo, 'autosservico');
end;
$function$;

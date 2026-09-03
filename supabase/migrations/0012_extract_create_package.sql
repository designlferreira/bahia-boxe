-- Etapa 2.5 / RECORRENCIA — extrai o trecho comum de assign_package_from_template e
-- assign_package_to_student (0001:222-291) para uma função interna, antes que a Etapa 4 precise
-- de um terceiro caminho de escrita em `packages`. Refatoração pura (CLAUDE.md, decisão 6):
-- comportamento idêntico ao atual nas duas funções existentes — validar com
-- supabase/verify_create_package.sql RODADO ANTES E DEPOIS desta migration, não só por leitura de
-- código.

create or replace function public._create_package(
  p_student_id uuid,
  p_total_classes int,
  p_origin text,
  p_kind text default 'package'
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new_package_id uuid;
begin
  -- Autorização própria (mesmo formato de erro das outras 10 funções deste arquivo) — camada de
  -- defesa em profundidade, não a única proteção; a outra é o REVOKE abaixo. Nenhuma substitui a
  -- outra: mesmo com o REVOKE em vigor, esta função continua correta se uma chamadora futura
  -- esquecer de autorizar antes de chamar; mesmo sem o REVOKE (por engano futuro), ninguém de fora
  -- consegue criar pacote pra aluno que não é seu.
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  if not exists (select 1 from public.students s where s.id = p_student_id and s.admin_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;

  -- Mesmo invariante das duas chamadoras: no máximo um pacote `active` não-trial por aluno. Não
  -- filtra por origin do pacote sendo fechado — um pacote comprado fecha um de recorrência ativo
  -- e vice-versa, exatamente como já fechava entre comprado e admin_grant antes desta migration.
  update public.packages
  set status = 'finished'
  where student_id = p_student_id and status = 'active' and origin <> 'trial';

  insert into public.packages (student_id, total_classes, used_classes, status, origin, kind)
  values (p_student_id, p_total_classes, 0, 'active', p_origin, p_kind)
  returning id into v_new_package_id;

  return v_new_package_id;
end;
$function$;

-- Primeiro REVOKE deste repositório — as outras 10 funções security definer de 0001 se protegem
-- só por checagem interna, sem GRANT/REVOKE explícito em nenhuma migration. Justificativa
-- específica desta função: ela não valida sozinha o suficiente pra ser exposta como uma RPC
-- pública de "criar pacote genérico" — existe pra ser um passo interno de
-- assign_package_from_template / assign_package_to_student / (Etapa 4) gerar_pacote_recorrencia,
-- que decidem o que passar como p_origin/p_kind. Alcançável via supabase.rpc('_create_package',
-- ...) exporia esse parâmetro direto ao cliente. O REVOKE não impede a chamada interna: uma
-- função security definer chamando outra roda com o current_user já elevado ao dono da função
-- chamadora — só bloqueia quem chega de fora (PostgREST/supabase.rpc, que executa como
-- authenticated/anon).
revoke execute on function public._create_package(uuid, int, text, text) from public, authenticated, anon;


-- -------------------------------------------------------------------------------------------
-- As duas funções existentes passam a chamar _create_package. Comportamento idêntico ao atual:
-- mesma autorização (agora também redundante dentro de _create_package, de propósito), mesma
-- validação de total_classes mantida EM CADA CHAMADORA (não movida pra dentro da função
-- compartilhada — moveria mudaria o comportamento observável de assign_package_from_template,
-- que hoje não tem essa checagem), mesmo fechamento de pacotes ativos, mesmo used_classes=0/
-- status=active, kind='package' agora explícito onde antes dependia do default da coluna (mesmo
-- valor real, `'package'::text` — confirmado via information_schema antes desta migration —,
-- comportamento observável idêntico).
-- -------------------------------------------------------------------------------------------

create or replace function public.assign_package_from_template(p_student_id uuid, p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_template record;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  if not exists (select 1 from public.students s where s.id = p_student_id and s.admin_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;

  select * into v_template
  from public.package_templates
  where id = p_template_id and admin_id = auth.uid() and is_active = true;

  if v_template.id is null then
    raise exception 'template_not_found_or_inactive';
  end if;

  return public._create_package(p_student_id, v_template.total_classes, 'purchase', 'package');
end;
$function$;

create or replace function public.assign_package_to_student(p_student_id uuid, p_total_classes int)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  if not exists (select 1 from public.students s where s.id = p_student_id and s.admin_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;

  if p_total_classes is null or p_total_classes <= 0 then
    raise exception 'invalid_total_classes';
  end if;

  return public._create_package(p_student_id, p_total_classes, 'admin_grant', 'package');
end;
$function$;

-- 0036 — O professor lê o e-mail dos PRÓPRIOS alunos (2026-09-29)
--
-- O detalhe do aluno passou a mostrar o e-mail da conta (contato do aluno). O e-mail fica em
-- `auth.users`, que o cliente não lê, e `profiles` não o guarda — então uma função devolve só
-- essa resposta, no mesmo padrão de `whatsapp_do_professor` (0032) e `modo_agendamento_efetivo`
-- (0022): `security definer`, com a autorização feita por dentro.
--
-- `email_do_aluno(p_student_id) returns text`:
--   - só o PROFESSOR (`profiles.role = 'admin'`) e só de um aluno DELE (`students.admin_id = auth.uid()`);
--   - devolve o e-mail da conta do aluno (`auth.users.email`), ou NULL se não houver;
--   - nunca devolve o e-mail de aluno de outro professor.
--
-- Somente leitura. Idempotente: create or replace + revoke/grant.

create or replace function public.email_do_aluno(p_student_id uuid)
returns text
language plpgsql
security definer
stable
set search_path to 'public'
as $function$
declare
  v_email text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'only_admin';
  end if;

  if not exists (select 1 from public.students s where s.id = p_student_id and s.admin_id = auth.uid()) then
    raise exception 'not_allowed';
  end if;

  select u.email::text into v_email
  from public.students s
  join auth.users u on u.id = s.profile_id
  where s.id = p_student_id;

  return v_email;
end;
$function$;

-- Só quem está logado chama (a checagem de professor/dono é a de dentro).
revoke all on function public.email_do_aluno(uuid) from public, anon;
grant execute on function public.email_do_aluno(uuid) to authenticated;

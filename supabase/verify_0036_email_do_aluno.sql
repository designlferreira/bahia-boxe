-- Verificação da 0036 — o professor lê o e-mail dos próprios alunos.
--
-- NÃO destrutivo: transação terminada em `rollback`; só leitura.
-- COMO USAR: rode a 0036 primeiro (supabase/migrations/0036_email_do_aluno.sql); depois este arquivo
-- inteiro. Procure "DIVERGIU" ou "ERRO".
-- Limite conhecido: só existe um professor neste banco, então "professor lendo aluno de OUTRO
-- professor" não tem dado real para exercitar (o caso 4 usa um id de aluno inexistente, que cai na
-- mesma checagem `not_allowed`).

begin;

create temp table resultados_0036 (ordem int, caso text, veredicto text, detalhe text);
grant all on resultados_0036 to authenticated, anon; -- o caso 3 troca para o papel anon e ainda precisa gravar o resultado

do $$
declare
  v_admin uuid; v_student uuid; v_profile uuid;
  v_esperado text; v_r text;
begin
  select s.id, s.profile_id, s.admin_id into v_student, v_profile, v_admin
  from public.students s where s.profile_id is not null limit 1;
  if v_student is null then
    insert into resultados_0036 values (0, 'setup', 'ERRO', 'nenhum aluno'); return;
  end if;
  select email::text into v_esperado from auth.users where id = v_profile;

  -- 1. o professor dono lê o e-mail do aluno, igual ao de auth.users
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';
  begin
    v_r := public.email_do_aluno(v_student);
    insert into resultados_0036 values (1, '1. professor dono le o e-mail do aluno',
      case when v_r is not null and v_r = v_esperado then 'OK' else 'DIVERGIU' end,
      'devolveu ' || coalesce(left(v_r, 3) || '***', 'null') || ' (' || case when v_r = v_esperado then 'igual' else 'diferente' end || ' ao de auth.users)');
  exception when others then insert into resultados_0036 values (1, '1. professor dono le o e-mail do aluno', 'ERRO', sqlerrm); end;

  -- 2. aluno logado (mesmo o dono do e-mail) NÃO chama: só professor
  perform set_config('request.jwt.claims', json_build_object('sub', v_profile, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_profile::text, true);
  begin
    v_r := public.email_do_aluno(v_student);
    insert into resultados_0036 values (2, '2. aluno logado e recusado', 'DIVERGIU', 'passou');
  exception when others then
    insert into resultados_0036 values (2, '2. aluno logado e recusado', case when sqlerrm like '%only_admin%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  -- 3. sem login (anon) não executa a função (revoke)
  execute 'reset role';
  execute 'set local role anon';
  begin
    v_r := public.email_do_aluno(v_student);
    insert into resultados_0036 values (3, '3. anon nao executa', 'DIVERGIU', 'passou');
  exception when others then
    insert into resultados_0036 values (3, '3. anon nao executa', case when sqlerrm like '%permission denied%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  -- 4. o professor com um id que não é aluno dele é recusado
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';
  begin
    v_r := public.email_do_aluno('00000000-0000-0000-0000-000000000000'::uuid);
    insert into resultados_0036 values (4, '4. aluno que nao e do professor e recusado', 'DIVERGIU', 'passou');
  exception when others then
    insert into resultados_0036 values (4, '4. aluno que nao e do professor e recusado', case when sqlerrm like '%not_allowed%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  execute 'reset role';
end;
$$;

select * from resultados_0036 order by ordem;

rollback;

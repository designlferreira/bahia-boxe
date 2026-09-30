-- Verificação da 0037 — o professor cria convite dentro do app.
--
-- NÃO destrutivo: transação terminada em `rollback`; o convite de teste some junto.
-- COMO USAR: rode a 0037 primeiro (supabase/migrations/0037_criar_convite.sql); depois este arquivo
-- inteiro. Procure "DIVERGIU" ou "ERRO". O resultado NÃO mostra o token inteiro.

begin;

create temp table resultados_0037 (ordem int, caso text, veredicto text, detalhe text);
grant all on resultados_0037 to authenticated, anon;

do $$
declare
  v_admin uuid; v_student_profile uuid;
  v_t1 text; v_t2 text; v_exp timestamptz; v_linhas int; v_valido boolean; v_motivo text;
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  select s.profile_id into v_student_profile from public.students s where s.profile_id is not null limit 1;
  if v_admin is null then
    insert into resultados_0037 values (0, 'setup', 'ERRO', 'nenhum professor'); return;
  end if;

  -- 1. o professor cria: devolve token de 64 caracteres e validade de ~7 dias; a linha existe, é dele e não foi usada
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';
  begin
    select c.token, c.expires_at into v_t1, v_exp from public.criar_convite() c;
    select count(*) into v_linhas from public.invites i
      where i.token = v_t1 and i.admin_id = v_admin and i.used = false;
    insert into resultados_0037 values (1, '1. professor cria convite',
      case when length(v_t1) = 64 and v_linhas = 1
                and v_exp between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
           then 'OK' else 'DIVERGIU' end,
      'token de ' || length(v_t1) || ' caracteres, ' || v_linhas || ' linha(s) dele, expira em ' || to_char(v_exp, 'DD/MM HH24:MI'));
  exception when others then insert into resultados_0037 values (1, '1. professor cria convite', 'ERRO', sqlerrm); end;

  -- 2. dois convites seguidos têm tokens diferentes
  begin
    select c.token into v_t2 from public.criar_convite() c;
    insert into resultados_0037 values (2, '2. tokens diferentes entre convites',
      case when v_t1 <> v_t2 then 'OK' else 'DIVERGIU' end, 'comparados sem mostrar os valores');
  exception when others then insert into resultados_0037 values (2, '2. tokens diferentes entre convites', 'ERRO', sqlerrm); end;

  -- 3. o convite criado passa em validate_invite, chamado SEM login (como quem abre o link)
  execute 'reset role';
  execute 'set local role anon';
  begin
    select v.is_valid, v.reason into v_valido, v_motivo from public.validate_invite(v_t1) v;
    insert into resultados_0037 values (3, '3. validate_invite aceita o convite novo (sem login)',
      case when v_valido and v_motivo = 'valid' then 'OK' else 'DIVERGIU' end, 'is_valid=' || v_valido || ', reason=' || v_motivo);
  exception when others then insert into resultados_0037 values (3, '3. validate_invite aceita o convite novo (sem login)', 'ERRO', sqlerrm); end;

  -- 4. aluno logado NÃO cria convite (só professor)
  execute 'reset role';
  if v_student_profile is null then
    insert into resultados_0037 values (4, '4. aluno logado e recusado', 'AVISO', 'nenhum aluno com login para testar');
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_student_profile, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_student_profile::text, true);
    execute 'set local role authenticated';
    begin
      perform public.criar_convite();
      insert into resultados_0037 values (4, '4. aluno logado e recusado', 'DIVERGIU', 'passou');
    exception when others then
      insert into resultados_0037 values (4, '4. aluno logado e recusado', case when sqlerrm like '%only_admin%' then 'OK' else 'DIVERGIU' end, sqlerrm);
    end;
    execute 'reset role';
  end if;

  -- 5. sem login (anon) não executa a função (revoke)
  execute 'set local role anon';
  begin
    perform public.criar_convite();
    insert into resultados_0037 values (5, '5. anon nao executa', 'DIVERGIU', 'passou');
  exception when others then
    insert into resultados_0037 values (5, '5. anon nao executa', case when sqlerrm like '%permission denied%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  execute 'reset role';
end;
$$;

select * from resultados_0037 order by ordem;

rollback;

-- Verificação da 0038 — o convite guarda o nome de quem vai receber.
--
-- NÃO destrutivo: transação terminada em `rollback`; os convites de teste somem junto.
-- COMO USAR: rode a 0038 primeiro (supabase/migrations/0038_convite_com_nome.sql); depois este arquivo
-- inteiro. Procure "DIVERGIU" ou "ERRO". O resultado NÃO mostra tokens.

begin;

create temp table resultados_0038 (ordem int, caso text, veredicto text, detalhe text);
grant all on resultados_0038 to authenticated, anon;

do $$
declare
  v_admin uuid; v_student_profile uuid;
  v_t text; v_t_ana text; v_nome text; v_n int; v_valido boolean; v_motivo text;
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  select s.profile_id into v_student_profile from public.students s where s.profile_id is not null limit 1;
  if v_admin is null then
    insert into resultados_0038 values (0, 'setup', 'ERRO', 'nenhum professor'); return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';

  -- 1. com nome: grava sem as pontas em branco
  begin
    select c.token into v_t from public.criar_convite('  Ana Beatriz  ') c;
    select i.nome_convidado into v_nome from public.invites i where i.token = v_t;
    v_t_ana := v_t;
    insert into resultados_0038 values (1, '1. nome e gravado sem espacos nas pontas',
      case when v_nome = 'Ana Beatriz' then 'OK' else 'DIVERGIU' end, 'gravou [' || coalesce(v_nome, 'null') || ']');
  exception when others then insert into resultados_0038 values (1, '1. nome e gravado sem espacos nas pontas', 'ERRO', sqlerrm); end;

  -- 2. sem argumento (como o app em producao chama ate o deploy): cria sem nome
  begin
    select c.token into v_t from public.criar_convite() c;
    select i.nome_convidado into v_nome from public.invites i where i.token = v_t;
    insert into resultados_0038 values (2, '2. chamada sem argumento cria convite sem nome',
      case when v_nome is null and length(v_t) = 64 then 'OK' else 'DIVERGIU' end, 'nome=' || coalesce(v_nome, 'null'));
  exception when others then insert into resultados_0038 values (2, '2. chamada sem argumento cria convite sem nome', 'ERRO', sqlerrm); end;

  -- 3. nome em branco vira NULL
  begin
    select c.token into v_t from public.criar_convite('   ') c;
    select i.nome_convidado into v_nome from public.invites i where i.token = v_t;
    insert into resultados_0038 values (3, '3. nome em branco vira null',
      case when v_nome is null then 'OK' else 'DIVERGIU' end, 'nome=' || coalesce(v_nome, 'null'));
  exception when others then insert into resultados_0038 values (3, '3. nome em branco vira null', 'ERRO', sqlerrm); end;

  -- 4. 81 caracteres é recusado
  begin
    perform public.criar_convite(repeat('a', 81));
    insert into resultados_0038 values (4, '4. nome com 81 caracteres e recusado', 'DIVERGIU', 'passou');
  exception when others then
    insert into resultados_0038 values (4, '4. nome com 81 caracteres e recusado', case when sqlerrm like '%nome_muito_longo%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  -- 5. 80 caracteres passa (limite exato)
  begin
    perform public.criar_convite(repeat('a', 80));
    insert into resultados_0038 values (5, '5. nome com 80 caracteres passa', 'OK', 'limite exato aceito');
  exception when others then insert into resultados_0038 values (5, '5. nome com 80 caracteres passa', 'ERRO', sqlerrm); end;

  -- 6. só existe UMA função criar_convite (a da 0037 sem argumento saiu)
  begin
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'criar_convite';
    insert into resultados_0038 values (6, '6. so existe uma funcao criar_convite',
      case when v_n = 1 then 'OK' else 'DIVERGIU' end, v_n || ' funcao(oes)');
  exception when others then insert into resultados_0038 values (6, '6. so existe uma funcao criar_convite', 'ERRO', sqlerrm); end;

  -- 7. validate_invite segue aceitando o convite novo, sem login
  execute 'reset role';
  execute 'set local role anon';
  begin
    select v.is_valid, v.reason into v_valido, v_motivo from public.validate_invite(v_t_ana) v;
    insert into resultados_0038 values (7, '7. validate_invite aceita (sem login)',
      case when v_valido and v_motivo = 'valid' then 'OK' else 'DIVERGIU' end, 'reason=' || coalesce(v_motivo, 'null'));
  exception when others then insert into resultados_0038 values (7, '7. validate_invite aceita (sem login)', 'ERRO', sqlerrm); end;

  -- 8. aluno logado NÃO cria convite
  execute 'reset role';
  if v_student_profile is null then
    insert into resultados_0038 values (8, '8. aluno logado e recusado', 'AVISO', 'nenhum aluno com login para testar');
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_student_profile, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_student_profile::text, true);
    execute 'set local role authenticated';
    begin
      perform public.criar_convite('Teste');
      insert into resultados_0038 values (8, '8. aluno logado e recusado', 'DIVERGIU', 'passou');
    exception when others then
      insert into resultados_0038 values (8, '8. aluno logado e recusado', case when sqlerrm like '%only_admin%' then 'OK' else 'DIVERGIU' end, sqlerrm);
    end;
    execute 'reset role';
  end if;

  -- 9. anon não executa
  execute 'set local role anon';
  begin
    perform public.criar_convite('Teste');
    insert into resultados_0038 values (9, '9. anon nao executa', 'DIVERGIU', 'passou');
  exception when others then
    insert into resultados_0038 values (9, '9. anon nao executa', case when sqlerrm like '%permission denied%' then 'OK' else 'DIVERGIU' end, sqlerrm);
  end;

  execute 'reset role';
end;
$$;

select * from resultados_0038 order by ordem;

rollback;

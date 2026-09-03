-- Verificação de paridade de comportamento pra Etapa 2.5 (extração de _create_package).
--
-- COMO USAR:
--   1. Preencha os três IDs na seção "PARÂMETROS" abaixo com dados reais do seu banco (rode as
--      queries auxiliares logo depois pra achar candidatos).
--   2. Rode o script inteiro AGORA, ANTES de aplicar 0012_extract_create_package.sql. Copie a
--      saída de cada seção (aparecem como resultados numerados, RAISE NOTICE nos logs) — essa é a
--      linha de base.
--   3. Aplique 0012_extract_create_package.sql.
--   4. Rode o script inteiro DE NOVO, com os MESMOS IDs. Compare com a linha de base: precisa
--      sair idêntico (mesmos sucessos, mesmas exceções, mesmo texto de erro).
--   5. Rode a seção "SÓ FAZ SENTIDO DEPOIS DA 0012" no final (uma vez, depois de aplicar).
--
-- SEGURO DE RODAR CONTRA PRODUÇÃO: todo o bloco de teste roda dentro de BEGIN/ROLLBACK — nenhuma
-- escrita é mantida, mesmo que os pacotes de teste realmente sejam inseridos/fechados durante a
-- transação. Nada precisa ser desfeito manualmente depois.

-- ===========================================================================
-- QUERIES AUXILIARES — rode estas ANTES de preencher os parâmetros, se não souber os IDs de cor.
-- ===========================================================================
-- select id as professor_profile_id, name from public.profiles where role = 'admin' limit 5;
-- select id as aluno_student_id, admin_id from public.students limit 5;
-- select id as template_id, admin_id, name, total_classes, is_active from public.package_templates limit 5;

begin;

-- ===========================================================================
-- PARÂMETROS — substitua pelos IDs reais antes de rodar.
-- ===========================================================================
do $$
declare
  v_professor_id uuid := '00000000-0000-0000-0000-000000000000'; -- profiles.id do professor (role='admin')
  v_outro_professor_id uuid := '00000000-0000-0000-0000-000000000000'; -- profiles.id de OUTRO professor, sem vínculo com o aluno abaixo
  v_aluno_id uuid := '00000000-0000-0000-0000-000000000000'; -- students.id, aluno do v_professor_id
  v_aluno_profile_id uuid := '00000000-0000-0000-0000-000000000000'; -- profiles.id do MESMO aluno (pra testar "aluno não é admin")
  v_template_id uuid := '00000000-0000-0000-0000-000000000000'; -- package_templates.id, do v_professor_id, is_active=true
  v_pkg1 uuid;
  v_pkg2 uuid;
begin
  -- 1) Impersona o professor (é assim que o SQL Editor simula auth.uid() vindo de um JWT real).
  perform set_config('request.jwt.claims', json_build_object('sub', v_professor_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 2) assign_package_to_student — caso feliz.
  v_pkg1 := public.assign_package_to_student(v_aluno_id, 8);
  raise notice 'TESTE 1 (assign_package_to_student caso feliz): pacote criado = %', v_pkg1;
  raise notice 'TESTE 1 dados: %', (
    select row_to_json(p) from public.packages p where p.id = v_pkg1
  );

  -- 3) assign_package_from_template — caso feliz. Deve FECHAR o pacote do teste 2 (mesma regra
  --    "1 pacote ativo não-trial por vez").
  v_pkg2 := public.assign_package_from_template(v_aluno_id, v_template_id);
  raise notice 'TESTE 2 (assign_package_from_template caso feliz): pacote criado = %', v_pkg2;
  raise notice 'TESTE 2 dados: %', (
    select row_to_json(p) from public.packages p where p.id = v_pkg2
  );
  raise notice 'TESTE 2 — pacote do teste 1 deveria estar finished agora: %', (
    select status from public.packages where id = v_pkg1
  );

  -- 4) total_classes inválido — deve dar exceção invalid_total_classes.
  begin
    perform public.assign_package_to_student(v_aluno_id, 0);
    raise notice 'TESTE 3 (total_classes invalido): FALHOU — deveria ter dado exceção e não deu';
  exception when others then
    raise notice 'TESTE 3 (total_classes invalido): exceção esperada = %', sqlerrm;
  end;

  -- 5) template inexistente/inativo — deve dar exceção template_not_found_or_inactive.
  begin
    perform public.assign_package_from_template(v_aluno_id, '00000000-0000-0000-0000-000000000000'::uuid);
    raise notice 'TESTE 4 (template invalido): FALHOU — deveria ter dado exceção e não deu';
  exception when others then
    raise notice 'TESTE 4 (template invalido): exceção esperada = %', sqlerrm;
  end;

  -- 6) o próprio aluno (não-admin) tentando — deve dar only_admin.
  perform set_config('request.jwt.claims', json_build_object('sub', v_aluno_profile_id, 'role', 'authenticated')::text, true);
  begin
    perform public.assign_package_to_student(v_aluno_id, 8);
    raise notice 'TESTE 5 (aluno tentando): FALHOU — deveria ter dado exceção e não deu';
  exception when others then
    raise notice 'TESTE 5 (aluno tentando): exceção esperada = %', sqlerrm;
  end;

  -- 7) admin, mas não é o professor deste aluno — deve dar not_allowed.
  perform set_config('request.jwt.claims', json_build_object('sub', v_outro_professor_id, 'role', 'authenticated')::text, true);
  begin
    perform public.assign_package_to_student(v_aluno_id, 8);
    raise notice 'TESTE 6 (professor errado): FALHOU — deveria ter dado exceção e não deu';
  exception when others then
    raise notice 'TESTE 6 (professor errado): exceção esperada = %', sqlerrm;
  end;
end;
$$;

rollback;

-- ===========================================================================
-- SÓ FAZ SENTIDO DEPOIS DA 0012 — _create_package não existe antes dela, então isto dá erro de
-- "função não existe" se rodado antes. Confirma que a função ficou inalcançável do cliente.
-- ===========================================================================
-- begin;
-- select set_config('request.jwt.claims', json_build_object('sub', '<professor_profile_id>', 'role', 'authenticated')::text, true);
-- set local role authenticated;
-- select public._create_package('<aluno_student_id>'::uuid, 5, 'purchase', 'package'); -- espera: permission denied for function _create_package
-- rollback;

-- Verificação de modo_agendamento_efetivo() e da flag profiles.modo_agendamento — Etapa 7
-- (CLAUDE.md). Roteiro combinado com o usuário:
--
--   1. propriedade nullable + coalesce — com a coluna ainda NULL (estado real de todo professor
--      antes desta Etapa), a leitura efetiva tem que dar 'autosservico' pra TODO professor, sem
--      exceção, antes de qualquer escrita.
--   2. virar a flag para 'recorrencia' num professor real e confirmar (a) que a leitura muda e
--      (b) que NENHUM dado de agendamento (bookings/packages) é tocado — a flag é só rótulo de
--      navegação, não migra nada (mesma garantia que a UI de Configurações precisa avisar).
--   3. voltar a flag e confirmar que tudo reaparece exatamente como estava — prova de que o
--      código antigo ficou intacto, só escondido atrás da flag, não removido/alterado.
--
-- NÃO destrutivo por construção: tudo roda dentro de UMA transação explícita, terminada em
-- `rollback` (mesma técnica de verify_calcular_saldo_pacote.sql) — mesmo que a etapa 3 tivesse um
-- bug na hora de restaurar o valor original, o ROLLBACK final garante que o banco sai do script
-- byte-idêntico a como entrou. VEREDITOS SAEM COMO RESULTADO DE QUERY (não RAISE NOTICE — o SQL
-- Editor do Supabase não expõe NOTICE), lidos pelo SELECT final, ANTES do rollback.
--
-- Só existe UM professor neste banco (supabase/README.md: "6 perfis, 5 alunos") — não há como
-- montar o caso negativo "aluno de OUTRO professor tentando ler este" com dado real; não fabricado
-- aqui (fabricar um professor fake só pra este teste seria dado de teste permanente, que o projeto
-- evita — ver comentário de isolamento em verify_calcular_saldo_pacote.sql).
--
-- COMO USAR: rode o arquivo inteiro. O último SELECT mostra uma linha por caso. Procure por
-- "DIVERGIU" ou "ERRO" — se só aparecer "OK" (ou "AVISO", não bloqueante), o roteiro bateu.

begin;

create temp table resultados_modo_agendamento (
  ordem int,
  caso text,
  veredicto text,
  detalhe text
);

do $$
declare
  v_professor_id uuid;
  v_original_modo text;
  v_aluno_profile_id uuid;
  v_efetivo text;
  v_bookings_antes bigint;
  v_bookings_depois bigint;
  v_packages_antes bigint;
  v_packages_depois bigint;
begin
  select id, modo_agendamento into v_professor_id, v_original_modo
  from public.profiles where role = 'admin' order by created_at limit 1;

  if v_professor_id is null then
    insert into resultados_modo_agendamento values (0, 'setup', 'ERRO', 'nenhum profissional (role=admin) encontrado');
    return;
  end if;

  select s.profile_id into v_aluno_profile_id from public.students s where s.admin_id = v_professor_id limit 1;

  select count(*) into v_bookings_antes from public.bookings where admin_id = v_professor_id;
  select count(*) into v_packages_antes
  from public.packages p join public.students s on s.id = p.student_id where s.admin_id = v_professor_id;

  -- ---------------------------------------------------------------------------------------------
  -- PASSO 1 — propriedade: nullable + coalesce = autosservico, antes de qualquer escrita.
  -- ---------------------------------------------------------------------------------------------
  if v_original_modo is not null then
    insert into resultados_modo_agendamento values (
      1, '1. estado inicial é NULL', 'AVISO',
      format('modo_agendamento já não era NULL (%L) antes do teste neste professor — propriedade não observável aqui, mas não é falha do código', v_original_modo)
    );
  else
    insert into resultados_modo_agendamento values (1, '1. estado inicial é NULL', 'OK', 'confirmado');
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_professor_id, 'role', 'authenticated')::text, true);
  v_efetivo := public.modo_agendamento_efetivo(v_professor_id);
  insert into resultados_modo_agendamento values (
    2, '1a. professor lendo o próprio efetivo = autosservico',
    case when v_efetivo = 'autosservico' then 'OK' else 'DIVERGIU' end, v_efetivo
  );

  if v_aluno_profile_id is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_aluno_profile_id, 'role', 'authenticated')::text, true);
    v_efetivo := public.modo_agendamento_efetivo(v_professor_id);
    insert into resultados_modo_agendamento values (
      3, '1b. aluno matriculado lê o mesmo efetivo (RPC atravessa a fronteira de profiles)',
      case when v_efetivo = 'autosservico' then 'OK' else 'DIVERGIU' end, v_efetivo
    );
  else
    insert into resultados_modo_agendamento values (3, '1b. aluno matriculado lê o mesmo efetivo', 'AVISO', 'nenhum aluno encontrado para este professor');
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- PASSO 2 — virar a flag; a leitura muda, o dado de agendamento não.
  -- ---------------------------------------------------------------------------------------------
  update public.profiles set modo_agendamento = 'recorrencia' where id = v_professor_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_professor_id, 'role', 'authenticated')::text, true);
  v_efetivo := public.modo_agendamento_efetivo(v_professor_id);
  insert into resultados_modo_agendamento values (
    4, '2a. efetivo(recorrencia) = recorrencia', case when v_efetivo = 'recorrencia' then 'OK' else 'DIVERGIU' end, v_efetivo
  );

  select count(*) into v_bookings_depois from public.bookings where admin_id = v_professor_id;
  select count(*) into v_packages_depois
  from public.packages p join public.students s on s.id = p.student_id where s.admin_id = v_professor_id;

  insert into resultados_modo_agendamento values (
    5, '2b. bookings intactos (flag não migra nada)', case when v_bookings_depois = v_bookings_antes then 'OK' else 'DIVERGIU' end,
    format('antes=%s depois=%s', v_bookings_antes, v_bookings_depois)
  );
  insert into resultados_modo_agendamento values (
    6, '2c. packages intactos (flag não migra nada)', case when v_packages_depois = v_packages_antes then 'OK' else 'DIVERGIU' end,
    format('antes=%s depois=%s', v_packages_antes, v_packages_depois)
  );

  -- ---------------------------------------------------------------------------------------------
  -- PASSO 3 — voltar a flag: tudo reaparece exatamente como estava.
  -- ---------------------------------------------------------------------------------------------
  update public.profiles set modo_agendamento = v_original_modo where id = v_professor_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_professor_id, 'role', 'authenticated')::text, true);
  v_efetivo := public.modo_agendamento_efetivo(v_professor_id);
  insert into resultados_modo_agendamento values (
    7, '3a. efetivo volta ao original', case when v_efetivo = coalesce(v_original_modo, 'autosservico') then 'OK' else 'DIVERGIU' end, v_efetivo
  );

  select count(*) into v_bookings_depois from public.bookings where admin_id = v_professor_id;
  select count(*) into v_packages_depois
  from public.packages p join public.students s on s.id = p.student_id where s.admin_id = v_professor_id;

  insert into resultados_modo_agendamento values (
    8, '3b. bookings ainda intactos', case when v_bookings_depois = v_bookings_antes then 'OK' else 'DIVERGIU' end,
    format('antes=%s depois=%s', v_bookings_antes, v_bookings_depois)
  );
  insert into resultados_modo_agendamento values (
    9, '3c. packages ainda intactos', case when v_packages_depois = v_packages_antes then 'OK' else 'DIVERGIU' end,
    format('antes=%s depois=%s', v_packages_antes, v_packages_depois)
  );
end;
$$;

select * from resultados_modo_agendamento order by ordem;

rollback;

-- Limpeza do aluno de teste b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8 antes de produção.
-- CLAUDE.md, seção "Limpeza de dados de teste antes de produção" — roteiro decidido e confirmado
-- contra `diagnostico_limpeza_teste.sql` (v3, bloco 0 com as 20 FKs relevantes). NÃO RODAR ESTE
-- ARQUIVO INTEIRO DE UMA VEZ — é o oposto do padrão de `verify_*.sql`/`diagnostico_*.sql` de
-- propósito: aqui cada PASSO é uma consulta ISOLADA, pra rodar uma de cada vez no SQL Editor,
-- conferir o resultado (sempre em tabela — DELETE/UPDATE usam `returning`), e só então colar o
-- próximo passo. Pare nos dois pontos marcados 🛑 abaixo até conferir.
--
-- Cada passo destrutivo já embute a checagem que o protege (guarda dentro do mesmo `do $$`, não
-- uma consulta separada de "confie que já foi checado antes") — se a checagem falhar, o próprio
-- passo aborta com `RAISE EXCEPTION` e NADA é escrito por ele. Isso vale inclusive pra reconferir
-- ao vivo coisas que o diagnóstico já tinha confirmado numa sessão anterior (regra deste projeto:
-- não confiar em fato de banco sem verificar de novo no momento de agir).
--
-- IDs fixos deste roteiro (não os troque por outro aluno sem revisar o arquivo inteiro):
--   aluno de teste (students.id):        b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8
--   profile/login do aluno de teste:     a4ad5883-4ed2-44a2-9cd3-b239b70f9658 (role=student, name=teste)

-- =================================================================================================
-- PASSO 0 (leitura) — rebaseline antes de começar. Compare com o resultado do diagnóstico v3:
-- students=1, packages=3, bookings=10, aluno_recorrencia=3, credit_transactions=2,
-- purchase_requests=1. Se vier diferente, ALGO MUDOU desde o diagnóstico — pare e investigue antes
-- de seguir os próximos passos (eles assumem esses números).
-- =================================================================================================
select 'students' as tabela, count(*) as linhas
  from public.students where id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'packages', count(*) from public.packages where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'bookings', count(*) from public.bookings where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'aluno_recorrencia', count(*) from public.aluno_recorrencia where aluno_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'credit_transactions', count(*) from public.credit_transactions where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'purchase_requests', count(*) from public.purchase_requests where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';


-- =================================================================================================
-- PASSO 1 (escrita) — quebra o vínculo interno 32d4c001 -> 863d420d antes de apagar qualquer uma
-- das duas linhas (bookings.replacement_for_booking_id não tem `on delete`, 0001). `returning`
-- mostra as 10 linhas do aluno de teste com o valor já NULL.
-- Confira: 10 linhas retornadas, `replacement_for_booking_id` NULL em todas.
-- =================================================================================================
update public.bookings
set replacement_for_booking_id = null
where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
returning id, status, start_time, replacement_for_booking_id;


-- =================================================================================================
-- PASSO 2 (escrita, com guarda embutida) — apaga os 2 credit_transactions deste aluno. Guarda:
-- nenhuma transação de OUTRO aluno pode reverter (reverses_transaction_id) uma destas 2 — essa FK
-- também não tem `on delete` (achado na revisão do diagnóstico, fora da lista original de duas).
-- Se a guarda disparar, NADA é apagado (o RAISE aborta o bloco antes do DELETE rodar).
-- Depois de rodar, confira com a consulta de verificação logo abaixo (deve dar 0).
-- =================================================================================================
do $$
declare
  v_reversoes int;
begin
  select count(*) into v_reversoes
  from public.credit_transactions ct_outra
  join public.credit_transactions ct_teste on ct_teste.id = ct_outra.reverses_transaction_id
  where ct_teste.student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
    and ct_outra.student_id <> 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';

  if v_reversoes > 0 then
    raise exception 'ABORTADO (Passo 2): % credit_transaction(s) de OUTRO aluno revertem (reverses_transaction_id) uma transação do aluno de teste — nada foi apagado. Investigar antes de continuar.', v_reversoes;
  end if;

  delete from public.credit_transactions
  where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
end $$;

-- Verificação do Passo 2 (leitura) — espera 0.
select count(*) as credit_transactions_restantes
from public.credit_transactions
where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';


-- =================================================================================================
-- PASSO 3 (escrita, com guarda embutida) — apaga as 10 bookings deste aluno (self-ref já nulo pelo
-- Passo 1). Guarda: nenhuma booking de OUTRO aluno pode apontar (replacement_for_booking_id) pra
-- dentro deste conjunto — reconfere ao vivo o que o diagnóstico já tinha visto zerado.
-- =================================================================================================
do $$
declare
  v_cruzadas int;
begin
  select count(*) into v_cruzadas
  from public.bookings b_outro
  join public.bookings b_teste on b_teste.id = b_outro.replacement_for_booking_id
  where b_teste.student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
    and b_outro.student_id <> 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';

  if v_cruzadas > 0 then
    raise exception 'ABORTADO (Passo 3): % booking(s) de OUTRO aluno referenciam (replacement_for_booking_id) uma aula do aluno de teste — nada foi apagado. Investigar antes de continuar.', v_cruzadas;
  end if;

  delete from public.bookings
  where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
end $$;

-- Verificação do Passo 3 (leitura) — espera 0.
select count(*) as bookings_restantes
from public.bookings
where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';


-- =================================================================================================
-- PASSO 4 (escrita) — apaga os 3 packages deste aluno. Sem guarda extra: depois dos Passos 2-3,
-- nada mais no schema aponta pra um package via `credit_transactions.package_id`/
-- `bookings.pacote_id` (as duas colunas que tinham essa FK sem `on delete`).
-- =================================================================================================
delete from public.packages
where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
returning id, status, origin, total_classes, used_classes, recorrencia_id;


-- =================================================================================================
-- PASSO 5 (escrita, opcional) — purchase_requests e aluno_recorrencia deste aluno. As duas são
-- `on delete cascade` a partir de `students` (confirmado no bloco 0), então o Passo 6 já as remove
-- sozinhas mesmo sem isto — rodar aqui só antecipa a conferência do número antes do passo sem volta.
-- Pode pular direto pro Passo 6 se preferir.
-- =================================================================================================
delete from public.purchase_requests
where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
returning id, status, created_at;

delete from public.aluno_recorrencia
where aluno_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
returning id, dia_semana, horario, ativo;


-- =================================================================================================
-- 🛑 PASSO 6 (escrita, com a guarda pedida — embutida, aborta automaticamente) — apaga a linha de
-- `students`. Guarda: nenhum `credit_transactions.created_by` no sistema (de QUALQUER aluno, não só
-- deste) pode apontar pro profile de teste (a4ad5883...) — essa FK não tem `on delete`, e
-- estruturalmente NÃO deveria ter nenhuma linha (created_by só é gravado por `complete_booking`/
-- `mark_no_show`, que exigem `is_admin()`, e este profile é `role=student`), mas isso nunca foi
-- verificado ao vivo — só inferido. Se a guarda disparar, NADA é apagado.
--
-- PARE DEPOIS DESTE PASSO SE ELE ABORTAR. Se ele passar (sem erro), o `students` já foi apagado —
-- a partir daqui `aluno_recorrencia`/`bookings`/`packages`/`purchase_requests`/`student_profiles`/
-- `boxing_profile_assessments` remanescentes (se você pulou o Passo 5) cascatearam sozinhos. Não há
-- mais como recuperar `students.profile_id` por consulta — é por isso que o Passo 7 (login) só
-- precisa do valor já conhecido: a4ad5883-4ed2-44a2-9cd3-b239b70f9658 (confirmado no diagnóstico).
-- =================================================================================================
do $$
declare
  v_bad_count int;
begin
  select count(*) into v_bad_count
  from public.credit_transactions
  where created_by = 'a4ad5883-4ed2-44a2-9cd3-b239b70f9658';

  if v_bad_count > 0 then
    raise exception 'ABORTADO (Passo 6): % credit_transaction(s) no sistema têm created_by = profile de teste (a4ad5883...) — apagar students/profiles quebraria essa referência. NADA foi apagado. Isto é um achado novo, fora do roteiro original: investigue essas transações antes de decidir o que fazer (não são necessariamente do aluno de teste).', v_bad_count;
  end if;

  delete from public.students where id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';
end $$;

-- Verificação do Passo 6 (leitura) — todas devem dar 0 (as cascades de `students` já resolveram o
-- que sobrou, incluindo o que o Passo 5 tiver pulado).
select 'students' as tabela, count(*) as linhas
  from public.students where id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'aluno_recorrencia', count(*) from public.aluno_recorrencia where aluno_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'purchase_requests', count(*) from public.purchase_requests where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'student_profiles', count(*) from public.student_profiles where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8'
union all
select 'boxing_profile_assessments', count(*) from public.boxing_profile_assessments where student_id = 'b12decb8-2f64-4bd8-b3a9-6c5b8b29d8a8';


-- =================================================================================================
-- 🛑 PASSO 7 (fora de SQL puro — painel do Supabase, não é executável neste arquivo) — só depois de
-- confirmar que o Passo 6 rodou sem abortar e a verificação acima deu tudo 0.
--
-- Supabase Dashboard → Authentication → Users → localizar o usuário com id
-- a4ad5883-4ed2-44a2-9cd3-b239b70f9658 (ou pelo e-mail de teste correspondente) → Delete user.
--
-- `profiles.id -> auth.users` é `on delete cascade` (confirmado no bloco 0 do diagnóstico), então
-- apagar o usuário ali já remove a linha de `profiles` sozinho — não precisa de um DELETE em
-- `profiles` à parte nem antes nem depois.
-- =================================================================================================

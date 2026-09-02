-- Perfil de Boxe — avaliação do professor sobre o aluno ("coach"), Fase 2.
--
-- A migration 0006 deixou `assessment_type`/`assessed_by` prontos pra isso e documentou
-- explicitamente: "ampliar RLS sem uma necessidade comprovada vai contra a regra desta tarefa".
-- Essa necessidade agora existe — o professor passa a poder avaliar o aluno (tipo 'coach'), e a
-- tela de comparação Aluno×Professor precisa que os dois lados consigam ler as duas avaliações.
--
-- Nenhuma tabela/coluna nova, nenhuma policy antiga é removida ou alterada — só duas policies
-- aditivas, no mesmo padrão já usado por `student_profiles_admin_select` (migration 0004):
-- acesso do professor é sempre por posse do aluno (`students.admin_id = auth.uid()`), nunca um
-- papel "admin" genérico.

-- O professor lê as avaliações (self + coach) dos próprios alunos — precisa disso pra montar a
-- comparação e pra ver o histórico antes de decidir reavaliar.
drop policy if exists boxing_profile_assessments_admin_select on public.boxing_profile_assessments;
create policy boxing_profile_assessments_admin_select on public.boxing_profile_assessments
  for select
  using (exists (
    select 1 from public.students s
    where s.id = boxing_profile_assessments.student_id and s.admin_id = auth.uid()
  ));

-- O professor cria avaliações tipo 'coach', só pros próprios alunos, e só se registrando como
-- autor (assessed_by = auth.uid()) — nunca em nome de outro professor, e nunca tipo 'self' (isso
-- continua exclusivo do aluno, via boxing_profile_assessments_self_insert).
drop policy if exists boxing_profile_assessments_admin_insert on public.boxing_profile_assessments;
create policy boxing_profile_assessments_admin_insert on public.boxing_profile_assessments
  for insert
  with check (
    assessment_type = 'coach'
    and assessed_by = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = boxing_profile_assessments.student_id and s.admin_id = auth.uid()
    )
  );

-- Ainda sem UPDATE/DELETE pra 'coach' — mesma imutabilidade da 0006: reavaliar cria linha nova.

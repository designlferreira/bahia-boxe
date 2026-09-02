-- Corrige a coexistência trial + pacote pago (Etapa 4, já aprovada na Fase 1), que a migration
-- 0001 não conseguiu de fato habilitar.
--
-- `ux_packages_one_active_per_student` já existia no banco original — nunca apareceu em
-- introspect.sql porque é um índice único puro (CREATE UNIQUE INDEX, sem ALTER TABLE ... ADD
-- CONSTRAINT), e introspect só consultava pg_constraint. Ele é irrestrito: no máximo um pacote
-- `active` por aluno, sem olhar `origin`. Isso barra exatamente o desenho aprovado (trial +
-- pacote pago simultâneos), e foi a causa do erro
-- "duplicate key value violates unique constraint ux_packages_one_active_per_student" ao atribuir
-- um pacote pago a um aluno que já tinha o trial ativo.
--
-- A troca abaixo restringe a regra a pacotes não-trial — preserva exatamente o invariante que já
-- existia para pacotes pagos/atribuídos pelo admin (no máximo um ativo por vez), só deixando o
-- trial fora dessa contagem, que é o que já estava implementado em
-- assign_package_from_template/assign_package_to_student/remove_active_package desde a 0001.

drop index if exists public.ux_packages_one_active_per_student;

create unique index if not exists ux_packages_one_active_purchase_per_student
  on public.packages (student_id)
  where status = 'active' and origin <> 'trial';

-- Conferência: nenhum aluno deveria ter mais de um pacote não-trial ativo ao mesmo tempo (se
-- aparecer alguma linha aqui, o índice acima teria falhado ao criar — isso é só um sanity check).
select student_id, count(*) as pacotes_pagos_ativos
from public.packages
where status = 'active' and origin <> 'trial'
group by student_id
having count(*) > 1;

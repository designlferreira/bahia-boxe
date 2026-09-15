-- Etapa 5/5 da migration de "is_active — Opção B" (CLAUDE.md, "Pontos ainda em aberto").
--
-- Correção pontual, à mão, decidida pelo usuário (2026-09-15) — não é backfill em massa: das 355
-- linhas `is_active = false`, só esta (grupo C do terceiro diagnóstico:
-- `supabase/diagnostico_ambiguas_is_active.sql`) tinha evidência real de vazamento — um booking
-- sobrepôs esse horário no passado, mas nenhum booking ativo ocupa ele agora. As outras 338
-- (grupo D) ficam como estão: nunca tiveram booking nenhum, são desativação deliberada do
-- professor, e reabri-las republicaria horas de propósito removidas.

update public.availability_slots
set is_active = true
where id = '751d725f-a307-4023-b800-26d7b75892fa';

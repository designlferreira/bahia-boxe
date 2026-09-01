# Supabase — estado atual

## ⚠️ Não rode as migrations deste diretório neste projeto

Os erros ao tentar aplicá-las mostram que o banco **já tem um schema**, e que ele **não é o
destas migrations**:

```
ERROR: 42P07: relation "profiles" already exists
ERROR: 42P07: relation "admin_student_header" already exists
ERROR: 42710: trigger "on_auth_user_created" ... already exists
ERROR: column availability_slots.weekday does not exist   ← o mais revelador
```

Esse último erro é o que fecha o diagnóstico. As migrations daqui criam
`availability_slots` **com** a coluna `weekday`. Se elas tivessem criado a tabela, a coluna
existiria. Ela existir sem `weekday` significa que a tabela veio de outro lugar — muito
provavelmente o schema do app Bahia Boxe original, que a especificação em
`project/uploads/bahia-boxe-especificacao-completa.md` descreve na seção 4.1 como:

> `availability_slots` | `id`, `admin_id`, `start_time`, `end_time` (disponibilidade recorrente/pontual)

Ou seja: sem `weekday`, com horários em timestamp. As views (`admin_student_header`) e o
trigger (`on_auth_user_created`) listados nos erros também aparecem na mesma especificação —
são do app original.

**Conclusão:** este projeto Supabase é o banco de um app que já existe, possivelmente com
dados reais. Forçar as migrations daqui por cima seria destrutivo.

## O que fazer

1. Rode `introspect.sql` no SQL Editor (é só leitura) e cole o resultado no chat.
   É **uma única consulta**, de propósito: o SQL Editor só exibe o resultado da última
   instrução de um script, então um arquivo com vários `select` devolve só o último.
2. Com o schema real em mãos, o cliente em `src/integrations/backend/` é adaptado ao banco
   existente — e não o contrário.

## Sobre os arquivos aqui

`0001_init.sql`, `0002_views_and_rpcs.sql` e `0003_signup_trigger.sql` foram escritos quando a
premissa era um banco **vazio**. Eles continuam versionados como referência do modelo que o
frontend espera hoje, mas **não devem ser aplicados** neste projeto até que a reconciliação
com o schema real seja feita.

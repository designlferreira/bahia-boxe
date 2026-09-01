# Supabase — o banco manda

Este projeto Supabase **já existia** antes deste frontend: é o banco do app Bahia Boxe original,
com dados reais (6 perfis, 5 alunos, 8 aulas, 496 slots de disponibilidade, 5 pacotes, 2 modelos).
As migrations que este repositório tinha foram escritas na premissa de um banco vazio, não batiam
com o schema real e **foram removidas** — o cliente em `src/integrations/backend/` é que se adaptou
ao banco, e não o contrário. Nada aqui altera o banco.

`introspect.sql` continua versionado: é a consulta de leitura que produziu o schema abaixo, e serve
para conferir de novo depois de qualquer mudança feita direto no Supabase.

## O schema, nos pontos que mudam o código

**`students.id` não é `profiles.id`.** São entidades separadas: `auth.users` → `profiles` (conta e
perfil) e `students` (matrícula, com `profile_id` único e `admin_id` apontando para o professor).
Tudo que é do aluno — `bookings.student_id`, `packages.student_id`,
`purchase_requests.student_id` — referencia a linha de `students`. Por isso toda chamada que começa
no id do perfil logado resolve o vínculo antes (`studentIdForProfile()` em `api.ts`).

**`availability_slots` é uma lista de horários concretos, não uma grade semanal.** Cada linha é uma
hora específica (`start_time`/`end_time` timestamptz, `is_active`), com `unique (admin_id,
start_time)`. Os 496 registros são meses de horários, não 7 linhas de recorrência. A tela de
disponibilidade continua mostrando uma grade por dia da semana, mas ela é derivada: lê os slots de
um horizonte de 12 semanas (`HORIZON_WEEKS`), agrupa por dia da semana em BRT e junta horas
consecutivas num intervalo. Ligar/desligar um dia é um `update is_active` em todos os slots
daquele dia; adicionar um intervalo chama `upsert_availability_slots`, que insere o que falta e
reativa o que já existe.

**O cadastro já é automático no banco.** `on_auth_user_created` → `handle_new_user()` cria o
`profiles` com `role = 'student'` e o nome vindo de `raw_user_meta_data->>'name'`; em seguida
`trg_create_student_on_profile` → `handle_new_student_profile()` cria o `students` apontando para o
professor padrão. O frontend só chama `auth.signUp` com `options.data.name` — não cria perfil nem
matrícula, o que também é o certo do ponto de vista de RLS.

**Aluno não enxerga o perfil do professor.** As policies de `profiles` são `select own` e
`is_admin()`. É por isso que existem as views (`student_booking_history`, `booking_history_app`):
elas resolvem `admin_name` do lado do servidor. A tela de detalhe da aula pega o nome por lá, com
"Seu professor" como fallback.

**Preço é `price_cents integer` e aceita null.** Zero é pacote gratuito ("Grátis"), null é preço
nunca preenchido ("Preço a combinar").

## O que a UI perdeu por não ter respaldo no banco

- **Validade do pacote.** `packages` guarda `total_classes`, `used_classes`, `status` e `kind` — não
  há data de expiração. `package_templates.validity_days` existe, mas não é copiado para o pacote.
  A tela mostra "desde <data>" no lugar de "vence em <data>".
- **Nome do modelo no pacote.** `packages` não referencia `package_templates`; o rótulo é derivado
  de `kind` + `total_classes` ("Pacote de 10 aulas" / "Aula avulsa").
- **Reembolsar aula / marcar reposição.** Não existem `bookings.refunded` nem `is_makeup`, e
  `booking_package_consumptions` está com RLS ligada e **sem nenhuma policy** — ou seja, é
  inacessível pelo cliente, só por função `security definer`. Os dois botões foram removidos do
  histórico do admin em vez de ficarem quebrados. Ver "Em aberto" abaixo.
- **Central de notificações.** Não há tabela de notificações. O sino passou a derivar a lista dos
  dados reais (pedidos pendentes, agendamentos aguardando confirmação, recusas, pedidos decididos)
  e guarda lido/dispensado em `localStorage`, por dispositivo. É o que dá para fazer sem tabela.
- **Convite.** `validate_invite` devolve só `(is_valid, reason)`, sem o nome do professor — e quem
  abre o link ainda não está autenticado, então não poderia ler `profiles` mesmo. A tela mostra
  "Seu professor".

## Coisas que parecem bugs no banco (não mexi)

1. **`cancel_active_package`** faz `update packages set status = 'cancelled'`, mas o enum
   `package_status` só tem `'active'` e `'finished'`. Essa função erra sempre que é chamada. O app
   usa `remove_active_package`, que grava `'finished'` corretamente.
2. **Policy `bookings_select_student_own`** compara `student_id = auth.uid()`, ou seja, um
   `students.id` com um id de perfil — nunca casa. É inofensiva porque
   `bookings_student_select` (que passa por `students.profile_id`) cobre o caso, mas está morta.
3. **View `available_slots`** não filtra `is_active`: ela só exclui slots com aula agendada. O
   cliente cruza o resultado dela com `availability_slots` filtrado por `is_active = true` para não
   oferecer horário desativado.

## Em aberto

Rode `pendencias.sql` (também é uma consulta só, também é leitura) e cole o resultado. O introspect
cortou os corpos das funções em 900 caracteres e duas ficaram pela metade:

- **`apply_booking_package_consumption`** — dá para ver o ramo que consome o crédito quando a aula
  vira `completed`/`no_show`, mas não o ramo inverso. Se ele devolve o crédito ao reverter o
  status, "desfazer uma aula concluída" volta a ser possível na tela de histórico, sem precisar de
  coluna nova.
- **`schedule_booking`** — não dá para ver com que status a aula nasce (`scheduled` ou
  `pending_confirmation`). Hoje o app trata os dois, mas os textos ("Aguarde a aprovação do
  professor") dependem da resposta.

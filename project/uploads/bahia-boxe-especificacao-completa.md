# Bahia Boxe — Especificação Completa do Aplicativo
### Documento de replicação + briefing de melhorias visuais e de UX

> Use este documento como contexto/prompt único para reconstruir o app do zero (em Claude ou qualquer agente de código) e, na sequência, evoluí-lo em design e experiência.

---

## 1. Visão do produto

**Bahia Boxe** é um SaaS B2C mobile-first para **professores de boxe sem conhecimento técnico** gerenciarem alunos, pacotes de aulas e agendamentos.

- **Objetivo central:** reduzir a fricção operacional do agendamento (hoje feito por WhatsApp).
- **Dois perfis:** `student` (aluno) e `admin` (professor).
- **Idioma:** pt-BR. **Timezone:** `America/Sao_Paulo`.
- **Plataforma:** PWA instalável, uso primário em celular.

### Personas
| Persona | Contexto de uso | Necessidade principal |
|---|---|---|
| Aluno | Celular, 1–3x por semana, poucos segundos por sessão | Ver saldo de aulas e agendar em ≤ 3 toques |
| Professor | Celular entre aulas, várias vezes ao dia | Ver o dia, aprovar/concluir aulas, controlar pacotes e pagamentos |

---

## 2. Stack técnica

- **React 18 + Vite 5 + TypeScript 5**
- **Tailwind CSS v3** + **shadcn/ui** (Radix)
- **React Router v6**
- **TanStack Query** (provider montado na raiz)
- **Sonner** para toasts (padrão único — não usar `useToast`)
- **date-fns** + **date-fns-tz**
- **lucide-react** para ícones
- **Supabase** (auth email+senha, Postgres com RLS, RPCs e views)

Client: `src/integrations/supabase/client.ts` exporta `supabase` criado com `SUPABASE_URL` + `SUPABASE_ANON_KEY`.

---

## 3. Design system

### 3.1 Tokens (HSL, em `src/index.css`)

```css
--background: 0 0% 7%;        /* quase preto */
--foreground: 0 0% 98%;
--card: 0 0% 10%;
--primary: 0 72% 51%;         /* vermelho boxe */
--secondary: 0 0% 15%;
--muted: 0 0% 18%;
--muted-foreground: 0 0% 60%;
--accent: 45 93% 58%;         /* dourado */
--destructive: 0 84% 60%;
--border: 0 0% 20%;
--input: 0 0% 18%;
--ring: 0 72% 51%;
--radius: 0.75rem;

--gradient-hero: linear-gradient(135deg, hsl(0 72% 51%), hsl(0 72% 35%));
--gradient-gold: linear-gradient(135deg, hsl(45 93% 58%), hsl(35 93% 45%));
--shadow-glow: 0 0 30px hsl(0 72% 51% / 0.3);
--shadow-card: 0 4px 20px hsl(0 0% 0% / 0.4);
```

**Regra inegociável:** nenhum componente usa cor hardcoded (`text-white`, `bg-[#...]`). Tudo via token semântico.

### 3.2 Tipografia
- Display / títulos: **Bebas Neue**, `letter-spacing: 0.05em`, sempre em CAIXA ALTA.
- Corpo: **Inter** (400/500/600/700).

### 3.3 Classes utilitárias globais
`.btn-primary` (vermelho + glow), `.btn-secondary` (cinza + borda), `.btn-accent` (gradiente dourado), `.card-dark`, `.input-dark`, `.page-container`, `.page-title`.
Todos os botões têm `active:scale-95` e `transition-all duration-200`.

---

## 4. Modelo de dados (Supabase)

### 4.1 Tabelas
| Tabela | Campos-chave |
|---|---|
| `profiles` | `id` (= auth.users.id), `name`, `role` (`student` \| `admin`), `created_at` |
| `students` | `id`, `profile_id`, `admin_id`, `created_at` |
| `packages` | `id`, `student_id`, `total_classes`, `used_classes`, `status` (`active` \| `finished`), `created_at` |
| `package_templates` | `id`, `admin_id`, `name`, `description`, `total_classes`, `price_cents`, `validity_days` |
| `bookings` | `id`, `student_id`, `admin_id`, `slot_id`, `start_time`, `end_time`, `status`, `cancel_reason`, `teacher_note`, `suggested_start_time`, `suggested_end_time` |
| `availability_slots` | `id`, `admin_id`, `start_time`, `end_time` (disponibilidade recorrente/pontual) |
| `purchase_requests` | `id`, `student_id`, `admin_id`, `kind` (`package` \| `single_class`), `template_id`, `status`, `notes`, `created_at`, `decided_at` |
| `invites` | token de convite do professor para o aluno |
| configurações do admin | flag `no_show_consumes_class` |

> **Atenção (bug histórico):** a coluna é `kind`, **não** `type`. Ler `req.type` retorna `undefined` e quebra a badge "Pacote" vs "Aula Avulsa".

### 4.2 Views de leitura (preferir sempre às tabelas)
- `admin_dashboard_kpis`, `admin_dashboard_upcoming_bookings`, `admin_dashboard_students_at_risk`
- `admin_student_header` (`student_id`, `student_name`, `student_since`, `profile_created_at`, `admin_id`)
- `admin_student_active_package`, `admin_student_kpis`, `admin_student_upcoming_bookings`, `admin_student_recent_bookings`
- `booking_history_app` (`start_time_brt`, `end_time_brt`, status, flags de passado/futuro, nomes de aluno e professor)

### 4.3 RPCs
`ensure_student_default_admin`, `schedule_booking`, `mark_no_show`, `reconcile_booking_statuses`, `request_package`, `request_single_class`, `approve_purchase_request`, `reject_purchase_request`, `assign_package_from_template`, `remove_active_package`, `validate_invite`, `accept_invite`.

Histórico paginado por cursor: `get_student_booking_history` e `get_admin_booking_history`.

### 4.4 Segurança
- RLS em todas as tabelas; `GRANT` explícito para `authenticated` e `service_role`.
- Papéis **nunca** usados a partir de `profiles` para autorização crítica — usar tabela `user_roles` + função `has_role()` `security definer`.
- Toda consulta admin filtra por `admin_id = auth.uid()`; aluno que não pertence ao professor → tela **"Acesso negado"**.
- Não enviar `student_id`/`admin_id` manualmente nas RPCs: a RLS resolve.

---

## 5. Máquina de estados do agendamento

```text
aluno agenda
     |
     v
pending_confirmation ──aprovar──> scheduled ──fim do horário──> completed (auto)
     |                                 |
     |                                 ├─ professor: Concluir  -> completed
     |                                 ├─ professor: Falta     -> no_show
     |                                 └─ cancelamento         -> cancelled
     |
     ├─ recusar sem sugestão -> rejected
     └─ recusar com horário  -> rejected_with_suggestion
```

### Status, labels e cores (`src/lib/bookingStatus.ts` — fonte única de verdade)
| status | label | cor | ícone |
|---|---|---|---|
| `scheduled` | Agendada | `bg-primary/20 text-primary` | Calendar |
| `completed` | Concluída | `bg-accent/20 text-accent` | CheckCircle |
| `cancelled` | Cancelada | `bg-muted text-muted-foreground` | XCircle |
| `no_show` | Faltou | `bg-destructive/20 text-destructive` | AlertTriangle |
| `pending_confirmation` | Pendente | `bg-amber-500/20 text-amber-500` | Clock |
| `rejected` | Rejeitada | `bg-destructive/20 text-destructive` | XCircle |
| `rejected_with_suggestion` | Sugestão enviada | `bg-amber-500/20 text-amber-500` | AlertTriangle |

`getStatusConfig(status)` sempre retorna fallback — **nunca** indexar o mapa diretamente (causou tela branca: `Cannot read properties of undefined (reading 'icon')`).

### Regras de crédito
- **Disponíveis = (total − usadas) − agendadas futuras.**
- Aula concluída incrementa `used_classes`.
- `no_show` consome crédito apenas se `no_show_consumes_class = true`.
- `reconcile_booking_statuses` roda ao montar o Dashboard do professor, conclui automaticamente aulas vencidas sem ação manual e dispara refetch silencioso (sem skeleton).

---

## 6. Mapa de rotas

### Público
`/` → redirect `/login` · `/login` · `/recuperar-senha` · `/auth/reset-password` · `/convite/:token` · `*` → NotFound

### Aluno (`ProtectedRoute allowedRoles={['student']}`)
| Rota | Tela |
|---|---|
| `/app/home` | Painel: pacote (Concluídas / Agendadas / Disponíveis) + próxima aula |
| `/app/agendar` | Escolha de dia e horário disponível |
| `/app/historico` | Aulas com tabs, filtros e paginação por cursor |
| `/app/aula/:id` | Detalhe da aula (inclui observação e sugestão do professor) |
| `/app/pacotes` | Pacotes e solicitação de pacote / aula avulsa |
| `/app/minha-conta` | Perfil, senha, sair |
| `/app/minhas-aulas` | redirect → `/app/historico` |

### Professor (`allowedRoles={['admin']}`)
| Rota | Tela |
|---|---|
| `/admin/dashboard` | KPIs, próximas aulas, alunos em risco; destino do login admin |
| `/admin/agenda` | Agenda do dia/semana + ações por aula |
| `/admin/alunos` · `/admin/alunos/:studentId` | Lista e "Acompanhamento do aluno" |
| `/admin/historico` | Histórico com busca, filtro de status e ações |
| `/admin/pacotes` · `/admin/solicitacoes` | Templates de pacote e pedidos pendentes |
| `/admin/disponibilidade` · `/admin/configuracoes` · `/admin/minha-conta` | Grade de horários, ajustes, conta |

**Pós-login:** `role === 'admin'` → `/admin/dashboard`; `role === 'student'` → `/app/home`.

---

## 7. Navegação (padrão obrigatório)

Bottom navigation fixa, sem sidebar.

**Aluno (4 itens):** Início `/app/home` · Agendar `/app/agendar` · Aulas `/app/historico` · Conta `/app/minha-conta`
**Professor (6 itens):** Dashboard · Agenda · Alunos · Histórico · Pedidos (badge de pendentes em tempo real via realtime) · Conta

Regras de item ativo: `/admin/alunos` ativo também em `/admin/alunos/:id`; `Conta` ativo também em `/admin/configuracoes`. Páginas com bottom nav usam `pb-24`. Botões de voltar usam `navigate(-1)`, nunca rota fixa.

---

## 8. Componentes reutilizáveis

| Componente | Responsabilidade |
|---|---|
| `PageHeader` | Título display + subtítulo + ação/back opcional |
| `BookingCard` | Card de aula: data/hora, badge de status, ações contextuais (aluno x admin) |
| `RejectBookingModal` | Recusa com `teacher_note` + horário sugerido opcional (define `rejected` vs `rejected_with_suggestion`) |
| `BookingFilters` | Busca por nome + filtro de status |
| `EmptyState` | Ícone + título + descrição + CTA — **único** padrão de vazio |
| `SkeletonCard` | Único padrão de loading |
| `ConfirmDialog` | Confirmação de ações destrutivas |
| `StudentBottomNav` / `AdminBottomNav` | Navegação principal |
| `ProtectedRoute` | Guard por sessão + role |
| `PWAInstallBanner`, `StudentOnboarding` | Instalação e primeiro acesso |

**Utilitários:**
- `lib/dateUtils.ts` — `formatDateTime`, `formatDateShort`, `formatTime`, `formatDate`, `formatNextClass`, constante `TIMEZONE = "America/Sao_Paulo"`.
- `lib/bookingStatus.ts` — mapa de status + `getStatusConfig`.
- `lib/packageUtils.ts` — `calcCreditsAvailable(total, usadas, agendadas)` e `formatCentsToBRL`.

---

## 9. Padrões de UI/estado (Definition of Done de qualquer tela)

1. Estados **loading (skeleton) / vazio (EmptyState) / erro (mensagem + "Tentar novamente")** sempre presentes.
2. Toast apenas via **Sonner** (`toast.success` / `toast.error`).
3. Datas sempre pelos helpers em pt-BR/BRT; campos `*_brt` não são reconvertidos no front.
4. Ações destrutivas passam por `ConfirmDialog`.
5. Alvos de toque ≥ 44px; conteúdo com `pb-24` quando há bottom nav.
6. Máximo 3 níveis de rota.
7. Nenhuma duplicação de tela para a mesma função.

---

## 10. Fluxos principais (para validar a réplica)

**Aluno agenda:** Home → "Agendar" → escolhe dia/horário → confirma → status `pending_confirmation` → mensagem "Aguarde a aprovação do professor" → aparece com badge Pendente.

**Professor aprova/recusa:** Agenda mostra banner "N agendamento(s) aguardando aprovação" → Aprovar (`scheduled`) ou Recusar (modal: observação + horário sugerido opcional).

**Conclusão:** professor marca Concluir/Falta; se não agir, a reconciliação conclui automaticamente após o fim do horário.

**Pacotes:** aluno solicita pacote ou aula avulsa → aparece em `/admin/solicitacoes` com badge correta por `kind` → professor aprova → `assign_package_from_template` cria o pacote ativo.

**Convite:** professor gera link `/convite/:token` → aluno aceita → vínculo em `students.admin_id`.

---

## 11. Débitos técnicos conhecidos (corrigir na réplica)

1. `AdminDisponibilidade.tsx` (1087 linhas) e `AdminAlunoDetails.tsx` (738) precisam ser quebrados em subcomponentes.
2. Empty states inline ainda existem em algumas telas — migrar todos para `EmptyState`.
3. Conclusão de aula usa update direto + incremento manual de `used_classes` (bypass da RPC `complete_booking`, que bloqueava antes do `end_time`). Idealmente a regra volta para o backend.
4. `schedule_booking` cria `scheduled` e o front atualiza para `pending_confirmation` logo depois — deveria nascer pendente no banco.
5. Falta tela do aluno para **aceitar a sugestão de horário** enviada na recusa.
6. `no_show_consumes_class` existe mas não está exposto claramente na UI de configurações.

---

## 12. Briefing de melhorias visuais e de UX

### 12.1 Direção visual
Manter a identidade dark + vermelho boxe + dourado, subindo o nível de acabamento:
- **Hierarquia:** um único elemento dominante por tela (saldo de aulas no aluno; agenda do dia no professor). Reduzir cards de peso igual empilhados.
- **Ritmo tipográfico:** Bebas apenas em títulos de página e números grandes; parar de usar display em rótulos pequenos.
- **Densidade:** espaçamento em escala de 4 (12/16/24), `rounded-xl` consistente, uma só profundidade de sombra.
- **Cor com significado:** vermelho = ação primária e urgência; dourado = conquista/crédito disponível; âmbar = pendência. Nunca dourado decorativo.
- **Emojis (🥊 📦) substituídos por ícones lucide** ou por um jogo de ícones próprio, para acabamento profissional.

### 12.2 Melhorias de experiência prioritárias
| # | Melhoria | Impacto | Esforço |
|---|---|---|---|
| 1 | Home do aluno com **um botão dominante** que muda de rótulo conforme o estado (Agendar / Solicitar pacote / Ver próxima aula) | Alto | Baixo |
| 2 | Agenda do professor em **timeline do dia** com aprovação inline em vez de lista neutra | Alto | Médio |
| 3 | **Tela de aceite da sugestão de horário** pelo aluno, fechando o loop da recusa | Alto | Médio |
| 4 | Barra de progresso do pacote com leitura imediata ("7 de 10 · 3 disponíveis") e alerta ≤ 2 | Médio | Baixo |
| 5 | Feedback otimista + `undo` no toast para Concluir/Falta | Médio | Médio |
| 6 | Ações de **reembolsar aula** e **marcar como reposição** no histórico, independentes do status | Médio | Médio |
| 7 | Skeletons com o mesmo formato do conteúdo final (evita salto de layout) | Médio | Baixo |
| 8 | Onboarding do professor: primeiro acesso guia disponibilidade → templates → convite | Médio | Médio |
| 9 | Estados vazios com ilustração e CTA único | Baixo | Baixo |
| 10 | Acessibilidade: foco visível, contraste AA no cinza `0 0% 60%`, `aria-label` na bottom nav | Médio | Baixo |

### 12.3 Critérios de pronto para a fase de UX
- Agendar uma aula em **≤ 3 toques** a partir da home.
- Professor resolve uma pendência em **≤ 2 toques** a partir do dashboard.
- Zero telas sem os três estados (loading/vazio/erro).
- Zero cores hardcoded; 100% tokens.
- Todas as ações destrutivas confirmadas; ações reversíveis com undo quando possível.

---

## 13. Prompt sugerido para o agente

> Construa um PWA mobile-first em React 18 + Vite + TypeScript + Tailwind + shadcn/ui e Supabase chamado Bahia Boxe, seguindo integralmente esta especificação: tokens de design da seção 3, modelo de dados e RLS da seção 4, máquina de estados da seção 5, rotas da seção 6, navegação da seção 7 e componentes da seção 8. Aplique os padrões da seção 9 em toda tela. Depois implemente as melhorias da seção 12 na ordem de prioridade, respeitando os critérios de pronto.

---

*Documento gerado a partir do código-fonte atual do projeto.*

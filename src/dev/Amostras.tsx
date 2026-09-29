/**
 * Página de amostras — SÓ EM DESENVOLVIMENTO (`npm run dev`, rota /dev/amostras).
 *
 * Renderiza telas e componentes reais com dados inventados, pra revisar o visual de cada situação
 * sem login e sem banco. Nada aqui fala com o Supabase: cada amostra tem seu próprio QueryClient já
 * preenchido com o resultado das consultas, e um perfil falso injetado direto no AuthContext.
 *
 * Fica fora do build de produção: `main.tsx` só importa este arquivo atrás de
 * `import.meta.env.DEV`, que o Vite troca por `false` no build e elimina o import junto.
 */
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { addDays, subDays } from "date-fns";
import { AuthContext } from "@/context/AuthContext";
import { AuthError } from "@/integrations/backend/auth";
import StudentHome from "@/pages/student/Home";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminAlunos from "@/pages/admin/Alunos";
import AdminPedidos from "@/pages/admin/Pedidos";
import AdminAgenda from "@/pages/admin/Agenda";
import StudentAgendar from "@/pages/student/Agendar";
import AdminAulaDetalhe from "@/pages/admin/AulaDetalhe";
import StudentAulaDetalhe from "@/pages/student/AulaDetalhe";
import Login from "@/pages/auth/Login";
import Convite from "@/pages/auth/Convite";
import CriarConta from "@/pages/auth/CriarConta";
import ConfirmarEmail from "@/pages/auth/ConfirmarEmail";
import AdminAlunoRecorrencia from "@/pages/admin/AlunoRecorrencia";
import StudentPerfilLutador from "@/pages/student/PerfilLutador";
import AdminAlunoPerfilBoxe from "@/pages/admin/AlunoPerfilBoxe";
import AdminConfiguracoes from "@/pages/admin/Configuracoes";
import AdminDisponibilidade from "@/pages/admin/Disponibilidade";
import AdminPacotes from "@/pages/admin/Pacotes";
import { ActivePackageCard } from "@/components/ActivePackageCard";
import { BoxingProfileHomeCard } from "@/components/BoxingProfileHomeCard";
import { RemarcacaoSheet } from "@/components/RemarcacaoSheet";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/dateUtils";
import { DIMENSIONS, FIGHTER_PROFILES, SCORING_VERSION, type FighterProfileKey } from "@/lib/boxingProfile";
import type { AppNotification, BoxingProfileAssessment, StudentRecord } from "@/integrations/backend/types";
import type { Booking, PackageRecord, Profile, PurchaseRequest, SaldoPacote } from "@/integrations/backend/types";

const PROFILE: Profile = {
  id: "amostra-aluno",
  name: "Maria Oliveira",
  role: "student",
  email: "amostra@exemplo.invalid",
  createdAt: new Date().toISOString(),
};
const ADMIN_ID = "amostra-professor";

function at(days: number, hour: number) {
  const d = days >= 0 ? addDays(new Date(), days) : subDays(new Date(), -days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function pkg(total: number, used: number, extra: Partial<PackageRecord> = {}): PackageRecord {
  return {
    id: `pkg-${total}-${used}`,
    studentId: "amostra-student",
    totalClasses: total,
    usedClasses: used,
    status: "active",
    kind: "package",
    origin: "purchase",
    templateName: `Pacote ${total} aulas`,
    createdAt: at(-20, 10),
    ...extra,
  };
}

function booking(days: number, status: Booking["status"] = "scheduled", extra: Partial<Booking> = {}): Booking {
  return {
    id: `bk-${days}-${status}`,
    studentId: "amostra-student",
    adminId: ADMIN_ID,
    startTime: at(days, 19),
    endTime: at(days, 20),
    status,
    slotId: null,
    billingKind: "package",
    isReplacement: false,
    replacementForBookingId: null,
    ...extra,
  };
}

function saldo(total: number, consumidas: number, aRepor = 0): SaldoPacote {
  return {
    pacoteId: "pkg-rec",
    studentId: "amostra-student",
    recorrenciaId: "rec-1",
    total,
    consumidas,
    restantes: total - consumidas,
    aRepor,
  };
}

const PEDIDO: PurchaseRequest = {
  id: "pedido-1",
  studentId: "amostra-student",
  adminId: ADMIN_ID,
  kind: "package",
  templateId: "tpl-1",
  status: "pending",
  notes: null,
  createdAt: at(-1, 15),
  decidedAt: null,
};

interface HomeData {
  package: PackageRecord | null;
  lastPackage: PackageRecord | null;
  credits: number;
  recorrenciaSaldo: SaldoPacote | null;
  nextBooking: Booking | null;
  suggestion: Booking | null;
  pendingRequest: PurchaseRequest | null;
}

const base: HomeData = {
  package: null,
  lastPackage: null,
  credits: 0,
  recorrenciaSaldo: null,
  nextBooking: null,
  suggestion: null,
  pendingRequest: null,
};

type Modo = "autosservico" | "recorrencia";

const HOME_CASES: { title: string; note: string; modo: Modo; data: HomeData }[] = [
  {
    title: "Saldo bom",
    note: "10 aulas, 3 usadas, 1 agendada — 6 livres",
    modo: "autosservico",
    data: { ...base, package: pkg(10, 3), credits: 6, nextBooking: booking(2) },
  },
  {
    title: "Poucas aulas",
    note: "2 livres, nenhuma agendada",
    modo: "autosservico",
    data: { ...base, package: pkg(8, 6), credits: 2 },
  },
  {
    title: "Tudo agendado",
    note: "2 restantes, as 2 já marcadas (crédito 0)",
    modo: "autosservico",
    data: { ...base, package: pkg(8, 6), credits: 0, nextBooking: booking(1, "pending_confirmation") },
  },
  {
    title: "Pacote acabou",
    // Como no banco real: usar a última aula muda o pacote pra `finished`, então não há pacote
    // ativo — só o último, encerrado. (A versão antiga desta amostra usava um pacote ATIVO com 0
    // aulas, o que nunca acontece, e escondeu um bug.)
    note: "pacote encerrado (status finished)",
    modo: "autosservico",
    data: { ...base, lastPackage: pkg(4, 4, { status: "finished" }), credits: 0 },
  },
  {
    title: "Sem pacote",
    note: "aluno recém-convidado, nunca teve pacote",
    modo: "autosservico",
    data: base,
  },
  {
    title: "Aula experimental",
    note: "aluno novo com a aula de cortesia",
    modo: "autosservico",
    data: { ...base, package: pkg(1, 0, { origin: "trial", templateName: "Aula experimental" }), credits: 1 },
  },
  {
    title: "Pedido enviado",
    note: "sem aulas, pedido de pacote aguardando o professor",
    modo: "autosservico",
    data: { ...base, pendingRequest: PEDIDO },
  },
  {
    title: "Sugestão de horário",
    note: "professor recusou e sugeriu outro horário",
    modo: "autosservico",
    data: {
      ...base,
      package: pkg(10, 2),
      credits: 7,
      nextBooking: booking(3),
      suggestion: booking(4, "rejected_with_suggestion", { id: "sug", suggestedStartTime: at(5, 18) }),
    },
  },
  {
    title: "Recorrência",
    note: "12 aulas geradas pelo professor, 4 feitas, 1 a repor",
    modo: "recorrencia",
    data: {
      ...base,
      package: pkg(12, 4, { origin: "recurrence", templateName: "Seg e Qua · 19h" }),
      credits: 0,
      recorrenciaSaldo: saldo(12, 4, 1),
      nextBooking: booking(1),
    },
  },
  {
    title: "Recorrência sem aulas",
    note: "professor ainda não gerou o pacote",
    modo: "recorrencia",
    data: base,
  },
];

function Seeded({
  data,
  modo,
  extra = [],
  children,
}: {
  data: HomeData;
  modo: Modo;
  extra?: [unknown[], unknown][];
  children: ReactNode;
}) {
  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: Infinity,
          retry: false,
          // Qualquer consulta que não foi pré-preenchida abaixo falha aqui, sem sair pra rede.
          queryFn: () => Promise.reject(new Error("amostra: consulta não simulada")),
        },
      },
    });
    qc.setQueryData(["student-home", PROFILE.id], data);
    qc.setQueryData(["student-admin-id", PROFILE.id], ADMIN_ID);
    qc.setQueryData(["modo-agendamento-efetivo", ADMIN_ID], modo);
    qc.setQueryData(["whatsapp-professor", ADMIN_ID], "5511947034983");
    qc.setQueryData(["notifications", PROFILE.id], []);
    qc.setQueryData(["my-student-id", PROFILE.id], "amostra-student");
    qc.setQueryData(["boxing-profile-history", "amostra-student"], []);
    for (const [key, value] of extra) qc.setQueryData(key, value);
    return qc;
  });
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider
        value={{
          profile: PROFILE,
          loading: false,
          signIn: () => Promise.reject(new Error("amostra")),
          signOut: async () => {},
          refreshProfile: () => {},
        }}
      >
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

function Frame({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <figure className="w-full max-w-[375px] shrink-0">
      <figcaption className="mb-2 px-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </figcaption>
      <div className="rounded-3xl border border-border bg-background overflow-hidden">{children}</div>
    </figure>
  );
}

function assessment(
  id: string,
  type: "self" | "coach",
  primary: FighterProfileKey,
  secondary: FighterProfileKey,
): BoxingProfileAssessment {
  const profileScores = Object.fromEntries(
    FIGHTER_PROFILES.map((p) => [p, p === primary ? 82 : p === secondary ? 70 : 45]),
  ) as Record<FighterProfileKey, number>;
  // Notas diferentes por dimensão (e diferentes entre aluno e professor) — com tudo igual a 60 a
  // tela de comparação e o radar ficavam sem nada para mostrar.
  const serie = type === "self" ? [78, 58, 66, 52, 72, 80, 44, 70] : [64, 70, 60, 68, 55, 62, 58, 66];
  const dimensionScores = Object.fromEntries(DIMENSIONS.map((d, i) => [d, serie[i % serie.length]])) as BoxingProfileAssessment["dimensionScores"];
  return {
    id,
    assessmentType: type,
    assessedBy: type === "coach" ? ADMIN_ID : null,
    completedAt: at(-3, 10),
    createdAt: at(-3, 10),
    primaryProfile: primary,
    secondaryProfile: secondary,
    dimensionScores,
    profileScores,
    assessmentLength: "full",
    scoringVersion: SCORING_VERSION,
    answers: {},
    questionnaireVersion: "amostra",
    wingspanIndexUsed: null,
  };
}

const SELF = assessment("av-self", "self", "pressure_fighter", "puncher");
const COACH = assessment("av-coach", "coach", "counterpuncher", "boxer_puncher");
const coachNotice = (read: boolean): AppNotification[] => [
  {
    id: `boxing-profile:${COACH.id}`,
    userId: PROFILE.id,
    kind: "system",
    title: "Seu professor te avaliou",
    description: "",
    createdAt: at(-1, 10),
    read,
    entity: { type: "boxing_profile" },
  },
];

const PROFILE_CASES: { title: string; note: string; extra: [unknown[], unknown][] }[] = [
  { title: "Nunca se avaliou", note: "convite pro questionário", extra: [] },
  {
    title: "Só o aluno",
    note: "autoavaliação",
    extra: [[["boxing-profile-history", "amostra-student"], [SELF]]],
  },
  {
    title: "Só o professor, não visto",
    note: "leitura do professor + aviso",
    extra: [
      [["boxing-profile-history", "amostra-student"], [COACH]],
      [["notifications", PROFILE.id], coachNotice(false)],
    ],
  },
  {
    title: "Os dois, combinado",
    note: "aviso já visto",
    extra: [
      [["boxing-profile-history", "amostra-student"], [SELF, COACH]],
      [["boxing-profile-assessment", SELF.id], SELF],
      [["boxing-profile-assessment", COACH.id], COACH],
      [["notifications", PROFILE.id], coachNotice(true)],
    ],
  },
];

const CARD_CASES: { title: string; note: string; props: Parameters<typeof ActivePackageCard>[0] }[] = [
  { title: "Admin · compra", note: "professor vê o selo de origem", props: { pkg: pkg(10, 3), credits: 5 } },
  {
    title: "Admin · recorrência",
    note: "com aulas a repor",
    props: { pkg: pkg(12, 4, { origin: "recurrence" }), credits: 0, saldo: saldo(12, 4, 2) },
  },
  { title: "Admin · pacote grande", note: "40 aulas — vira barra", props: { pkg: pkg(40, 12), credits: 25 } },
  { title: "Admin · experimental", note: "1 aula de cortesia", props: { pkg: pkg(1, 0, { origin: "trial" }), credits: 1 } },
  { title: "Aluno · 1 aula", note: "singular", props: { pkg: pkg(5, 4), credits: 1, audience: "student" } },
  {
    title: "Aluno · nome longo",
    note: "nome do pacote que não cabe",
    props: {
      pkg: pkg(10, 1, { templateName: "Pacote Trimestral Premium com Avaliação" }),
      credits: 9,
      audience: "student",
    },
  },
];

/** Painel de remarcação com horários inventados (dia 3 da lista sem nenhum livre). */
function AmostraRemarcacao() {
  const [open, setOpen] = useState(false);
  const [client] = useState(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    for (let i = 1; i <= 21; i++) {
      const d = addDays(new Date(), i);
      const key = formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
      const horas = i === 3 ? [] : [7, 8, 12, 17, 18, 20].map((h) => new Date(`${key}T${String(h).padStart(2, "0")}:00:00-03:00`).toISOString());
      qc.setQueryData(["horarios-livres-remarcacao", "amostra-aula", key], horas);
    }
    return qc;
  });
  return (
    <QueryClientProvider client={client}>
      <button type="button" className="rounded-xl border border-border px-4 h-11" onClick={() => setOpen(true)}>
        Abrir "Pedir outro horário"
      </button>
      <RemarcacaoSheet open={open} onOpenChange={setOpen} bookingId="amostra-aula" onDone={() => setOpen(false)} onError={() => {}} />
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Painel do professor
// ---------------------------------------------------------------------------

const PROFESSOR: Profile = { id: ADMIN_ID, name: "Lucas Ferreira", role: "admin", email: "prof@exemplo.invalid", createdAt: at(-200, 10) };

function aluno(id: string, name: string): StudentRecord {
  return { id, profileId: `p-${id}`, adminId: ADMIN_ID, name, createdAt: at(-90, 10) };
}
function aulaDe(studentId: string, studentName: string, days: number, hour: number, status: Booking["status"], extra: Partial<Booking> = {}) {
  const start = at(days, hour);
  return {
    ...booking(days, status, { id: `a-${studentId}-${days}-${hour}`, studentId, startTime: start, endTime: at(days, hour + 1), ...extra }),
    studentName,
  };
}

/** Aula de hoje a N minutos de agora (negativo = já passou) — o destaque "em 40 min" depende disso. */
function aulaEm(studentId: string, studentName: string, minutos: number, status: Booking["status"]) {
  const start = new Date(Date.now() + minutos * 60_000);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    ...booking(0, status, { id: `h-${studentId}-${minutos}`, studentId, startTime: start.toISOString(), endTime: end.toISOString() }),
    studentName,
  };
}

const RISCO = [
  { student: aluno("s6", "Helena Costa"), motivo: "Sem aulas no pacote", grave: true },
  { student: aluno("s7", "Igor Nascimento"), motivo: "Restam 2 aulas no pacote · 2 faltas seguidas", grave: false },
  { student: aluno("s9", "Karina Duarte"), motivo: "Resta 1 aula no pacote", grave: false },
  { student: aluno("s10", "Leonardo Prado"), motivo: "2 faltas seguidas", grave: false },
];

const DASH_CASES: { title: string; note: string; data: unknown }[] = [
  {
    title: "Dia movimentado",
    note: "2 pedidos (1 remarcação), 2 aulas sem registro, 1 pedido de aulas, próxima em 40 min",
    data: {
      activeStudents: 12,
      today: [
        aulaEm("s1", "Ana Beatriz Souza", -300, "completed"),
        aulaEm("s3", "Diego Martins", -180, "no_show"),
        aulaEm("s8", "Julia Pereira", -90, "scheduled"),
        aulaEm("s4", "Fernanda Rocha", 40, "scheduled"),
        aulaEm("s5", "Gustavo Alves", 100, "scheduled"),
        aulaEm("s11", "Marina Costa", 160, "pending_confirmation"),
      ],
      nextAfterToday: aulaDe("s1", "Ana Beatriz Souza", 1, 7, "scheduled"),
      pending: [
        { ...aulaDe("s1", "Ana Beatriz Souza", 1, 7, "pending_confirmation"), antecessorInicio: null },
        { ...aulaDe("s2", "Carlos Henrique Lima", 2, 18, "pending_confirmation", { replacementForBookingId: "orig-1" }), antecessorInicio: at(1, 19) },
      ],
      awaitingConfirmation: [aulaDe("s3", "Diego Martins", -1, 19, "scheduled", { pacoteId: "pkg-rec" }), aulaEm("s8", "Julia Pereira", -90, "scheduled")],
      purchaseRequests: 1,
      atRisk: RISCO,
      primeirosPassos: { horarios: true, pacotes: true, whatsapp: true, modo: "autosservico" },
    },
  },
  {
    title: "Fim do dia",
    note: "todas as aulas de hoje registradas; mostra a próxima; WhatsApp não cadastrado",
    data: {
      activeStudents: 8,
      today: [aulaEm("s1", "Ana Beatriz Souza", -240, "completed"), aulaEm("s4", "Fernanda Rocha", -120, "completed")],
      nextAfterToday: aulaDe("s8", "Julia Pereira", 1, 7, "scheduled"),
      pending: [],
      awaitingConfirmation: [],
      purchaseRequests: 0,
      atRisk: RISCO.slice(1, 2),
      primeirosPassos: { horarios: true, pacotes: true, whatsapp: false, modo: "autosservico" },
    },
  },
  {
    title: "Dia livre",
    note: "nenhuma aula hoje, nada pendente",
    data: {
      activeStudents: 8,
      today: [],
      nextAfterToday: aulaDe("s8", "Julia Pereira", 3, 7, "scheduled"),
      pending: [],
      awaitingConfirmation: [],
      purchaseRequests: 0,
      atRisk: [],
      primeirosPassos: { horarios: true, pacotes: true, whatsapp: true, modo: "autosservico" },
    },
  },
  {
    title: "Professor começando",
    note: "nenhum aluno; já publicou horários",
    data: {
      activeStudents: 0,
      today: [],
      nextAfterToday: null,
      pending: [],
      awaitingConfirmation: [],
      purchaseRequests: 0,
      atRisk: [],
      primeirosPassos: { horarios: true, pacotes: false, whatsapp: false, modo: "autosservico" },
    },
  },
];

/**
 * Agenda do professor: 3 semanas (a passada, esta e a próxima) semeadas, cada dia com a mesma chave
 * que a tela usa (`selectedDate.toDateString()`). Hoje tem de tudo; ontem tem aula sem registro;
 * amanhã tem pedido novo e pedido de remarcação; depois de amanhã é dia sem horário publicado.
 */
function semearAgenda(qc: QueryClient) {
  const h0 = Math.min(Math.max(new Date().getHours(), 9), 19); // hora "agora", presa num dia útil
  const aulaNa = (dias: number, hora: number, status: Booking["status"], extra: Partial<Booking> = {}) =>
    booking(dias, status, { id: `ag-${dias}-${hora}`, startTime: at(dias, hora), endTime: at(dias, hora + 1), ...extra });
  const livre = (hora: number) => ({ hour: `${String(hora).padStart(2, "0")}:00`, free: true });
  const aula = (dias: number, hora: number, nome: string, status: Booking["status"], extra: Partial<Booking> = {}, mais = {}) => ({
    hour: `${String(hora).padStart(2, "0")}:00`,
    free: false,
    booking: aulaNa(dias, hora, status, extra),
    studentName: nome,
    vinculo: null,
    antecessorInicio: null,
    ...mais,
  });

  const porDia = new Map<number, unknown[]>();
  porDia.set(0, [
    aula(0, h0 - 3, "Ana Beatriz Souza", "completed"),
    aula(0, h0 - 2, "Diego Martins", "no_show"),
    aula(0, h0 - 1, "Julia Pereira", "scheduled"),
    aula(0, h0 + 1, "Fernanda Rocha", "scheduled"),
    aula(0, h0 + 2, "Carlos Henrique Lima", "pending_confirmation", { replacementForBookingId: "orig" }, {
      vinculo: "pedido_remarcacao",
      antecessorInicio: at(1, 19),
    }),
    livre(h0 + 3),
    aula(0, h0 + 4, "Igor Nascimento", "scheduled", { isReplacement: true, replacementForBookingId: "falta" }, { vinculo: "reposicao" }),
  ]);
  porDia.set(-1, [aula(-1, 18, "Gustavo Alves", "scheduled"), aula(-1, 19, "Helena Costa", "completed"), livre(20)]);
  porDia.set(1, [aula(1, 7, "Marina Costa", "pending_confirmation"), aula(1, 18, "Karina Duarte", "scheduled"), livre(19), livre(20)]);
  porDia.set(2, []);
  for (let d = -21; d <= 21; d++) {
    const dia = addDays(new Date(), d);
    const entradas = porDia.get(d) ?? (d % 2 ? [livre(18), aula(d, 19, "Leonardo Prado", d < 0 ? "completed" : "scheduled"), livre(20)] : [livre(7), livre(8)]);
    qc.setQueryData(["admin-agenda", ADMIN_ID, dia.toDateString()], entradas);
  }
  qc.setQueryData(["awaiting-confirmation-bookings", ADMIN_ID], [aulaNa(-1, 18, "scheduled"), aulaNa(0, h0 - 1, "scheduled")]);
  qc.setQueryData(["agenda-pedidos-pendentes", ADMIN_ID], [aulaNa(0, h0 + 2, "pending_confirmation"), aulaNa(1, 7, "pending_confirmation")]);
}

/**
 * Tela Agendar (aluno): os 7 dias que a tela mostra (amanhã em diante), cada um com a mesma chave da
 * tela. Amanhã: livres e ocupados; depois de amanhã: sem horários; resto: poucos horários.
 */
function horariosAgendar(): [unknown[], unknown][] {
  const semana: Record<string, unknown[]> = {};
  for (let i = 1; i <= 7; i++) {
    const dia = addDays(new Date(), i);
    const slots =
      i === 1
        ? [
            { slotId: `sl-${i}-7`, time: "07:00", status: "free" },
            { slotId: `sl-${i}-8`, time: "08:00", status: "booked" },
            { slotId: `sl-${i}-12`, time: "12:00", status: "free" },
            { slotId: `sl-${i}-18`, time: "18:00", status: "booked" },
            { slotId: `sl-${i}-19`, time: "19:00", status: "free" },
            { slotId: `sl-${i}-20`, time: "20:00", status: "free" },
          ]
        : i === 2
          ? []
          : [
              { slotId: `sl-${i}-18`, time: "18:00", status: "free" },
              { slotId: `sl-${i}-19`, time: "19:00", status: i % 2 ? "booked" : "free" },
            ];
    semana[formatInTimeZone(dia, TIMEZONE, "yyyy-MM-dd")] = slots;
  }
  return [[["available-slots-semana", ADMIN_ID, addDays(new Date(), 1).toDateString()], semana]];
}

/**
 * Detalhe da aula: as telas leem o id da URL (useParams), então cada amostra monta a sua própria
 * rota com `<Routes location=...>` — funciona dentro do BrowserRouter da página, sem mexer na URL.
 */
function ComRota({ path, url, children }: { path: string; url: string; children: ReactNode }) {
  return (
    <Routes location={url}>
      <Route path={path} element={children} />
    </Routes>
  );
}

/** Telas de entrada: sem sessão (profile null) e, no convite, com a validação do link pré-preenchida. */
function SemLogin({ convite, children }: { convite?: { valid: boolean; reason: string }; children: ReactNode }) {
  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false, queryFn: () => Promise.reject(new Error("amostra: consulta não simulada")) } },
    });
    if (convite) qc.setQueryData(["invite", "amostra"], convite);
    return qc;
  });
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider
        value={{
          profile: null,
          loading: false,
          // Amostra do Login: e-mail com "naoconfirmado" simula o erro de e-mail não confirmado.
          signIn: (email: string) =>
            Promise.reject(
              /naoconfirmado/i.test(email)
                ? new AuthError("Seu e-mail ainda não foi confirmado. Abra o link que enviamos para você.", "email_not_confirmed")
                : new Error("amostra"),
            ),
          signOut: async () => {},
          refreshProfile: () => {},
        }}
      >
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

const ORIENTACOES = {
  adminId: ADMIN_ID,
  cep: "40000-000",
  street: "Rua das Laranjeiras",
  number: "120",
  complement: "Sala 2",
  neighborhood: "Pelourinho",
  city: "Salvador",
  state: "BA",
  referencePoint: "Em frente à praça",
  arrivalMinutes: 10,
  equipment: { gloves: { level: "required", sizes: ["12oz", "14oz"] }, wraps: { level: "recommended", lengths: ["3m"] }, mouthguard: true },
  notes: "Traga água e uma toalha.",
};

const DETALHE_PROF: { title: string; note: string; id: string; valor: unknown }[] = [
  {
    title: "Pedido de remarcação",
    note: "aluno pediu pra mudar a aula de amanhã",
    id: "dp-0",
    valor: {
      booking: booking(2, "pending_confirmation", { id: "dp-0", pacoteId: "pkg-rec", replacementForBookingId: "orig" }),
      studentName: "Carlos Henrique Lima",
      remarcacoes: 0,
      vinculo: "pedido_remarcacao",
      antecessorInicio: at(1, 19),
    },
  },
  {
    title: "Sem registro",
    note: "aula de ontem, ainda sem Aconteceu/Faltou",
    id: "dp-1",
    valor: { booking: booking(-1, "scheduled", { id: "dp-1", pacoteId: "pkg-rec" }), studentName: "Diego Martins", remarcacoes: 0, vinculo: null },
  },
  {
    title: "Futura, remarcada 2x",
    note: "aula de recorrência daqui a 3 dias, já remarcada duas vezes",
    id: "dp-2",
    valor: { booking: booking(3, "scheduled", { id: "dp-2", pacoteId: "pkg-rec", isReplacement: true, replacementForBookingId: "x" }), studentName: "Carlos Henrique Lima", remarcacoes: 2, vinculo: "remarcacao" },
  },
  {
    title: "Concluída",
    note: "com botão permanente de desfazer",
    id: "dp-3",
    valor: { booking: booking(-3, "completed", { id: "dp-3" }), studentName: "Ana Beatriz Souza", remarcacoes: 0, vinculo: null },
  },
];

const DETALHE_ALUNO: { title: string; note: string; id: string; valor: unknown; pedido?: unknown }[] = [
  {
    title: "Recorrência, daqui a 3 dias",
    note: "pode pedir outro horário; orientações do professor",
    id: "da-1",
    valor: { booking: booking(3, "scheduled", { id: "da-1", pacoteId: "pkg-rec" }), adminName: "Lucas Ferreira" },
  },
  {
    title: "Pedido de outro horário",
    note: "pedido de remarcação esperando o professor",
    id: "da-2",
    valor: { booking: booking(3, "scheduled", { id: "da-2", pacoteId: "pkg-rec" }), adminName: "Lucas Ferreira" },
    pedido: booking(4, "pending_confirmation", { id: "da-2-pedido", replacementForBookingId: "da-2" }),
  },
  {
    title: "Autosserviço, amanhã",
    note: "aula agendada pelo aluno (menos de 24h)",
    id: "da-3",
    valor: { booking: { ...booking(1, "scheduled", { id: "da-3", slotId: "s" }), startTime: new Date(Date.now() + 5 * 3600_000).toISOString(), endTime: new Date(Date.now() + 6 * 3600_000).toISOString() }, adminName: "Lucas Ferreira" },
  },
  {
    title: "Concluída com recado",
    note: "aula passada com observação do professor",
    id: "da-4",
    valor: { booking: booking(-2, "completed", { id: "da-4", teacherNote: "Ótima evolução no jab. Próxima aula: esquivas." }), adminName: "Lucas Ferreira" },
  },
];

const modelo = (id: string, name: string, totalClasses: number, priceCents: number | null) => ({
  id, adminId: ADMIN_ID, name, description: "", totalClasses, priceCents, validityDays: null, isActive: true,
});
const pedido = (
  id: string,
  kind: "package" | "single",
  student: string,
  template: ReturnType<typeof modelo> | null,
  lost: number,
  recorrenciaRestantes = 0,
  extra: { dias?: number; notes?: string; aulas?: number | null } = {},
) => ({
  request: { id, studentId: `s-${id}`, adminId: ADMIN_ID, kind, templateId: template?.id ?? null, status: "pending" as const, notes: extra.notes ?? null, createdAt: at(-(extra.dias ?? 1), 10), decidedAt: null },
  studentName: student,
  template,
  classesLostOnApprove: lost,
  recorrenciaRestantes,
  aulasRestantes: extra.aulas === undefined ? 0 : extra.aulas,
});
const PEDIDOS_CASOS: { title: string; note: string; lista: unknown[] }[] = [
  {
    title: "Vários pedidos",
    note: "pacote sem perda, encerra 3 aulas, aula avulsa, sem preço, aluno de recorrência (5 marcadas)",
    lista: [
      pedido("r1", "package", "Ana Beatriz Souza", modelo("t1", "Pacote de 8 aulas", 8, 32000), 0, 0, { dias: 1, aulas: null }),
      pedido("r2", "package", "Carlos Henrique Lima", modelo("t2", "Pacote de 12 aulas", 12, 45000), 3, 0, { dias: 4, aulas: 3, notes: "Posso pagar na sexta?" }),
      pedido("r3", "single", "Julia Pereira", modelo("t3", "Aula avulsa", 1, 5000), 0, 0, { dias: 1, aulas: 1 }),
      pedido("r4", "package", "Marina Costa", modelo("t4", "Pacote de 4 aulas", 4, null), 1, 0, { dias: 2, aulas: 1 }),
      pedido("r5", "package", "Igor Nascimento", modelo("t5", "Pacote de 8 aulas", 8, 32000), 0, 5, { dias: 1, aulas: 5 }),
    ],
  },
  { title: "Nenhum pedido", note: "tudo em dia", lista: [] },
];

/** Lista de alunos: 6 alunos, 4 deles em risco (os mesmos do painel). */
function semearAlunos(qc: QueryClient) {
  const nomes = ["Ana Beatriz Souza", "Helena Costa", "Igor Nascimento", "Julia Pereira", "Karina Duarte", "Leonardo Prado"];
  const ids = ["s1", "s6", "s7", "s8", "s9", "s10"];
  qc.setQueryData(
    ["admin-students", ADMIN_ID, ""],
    ids.map((id, i) => ({
      student: aluno(id, nomes[i]),
      restantes: id === "s6" ? null : id === "s9" ? 1 : id === "s7" ? 2 : 3,
      package: id === "s6" ? null : pkg(8, 5),
    })),
  );
  qc.setQueryData(["alunos-em-risco", ADMIN_ID], RISCO);
}

const recDia = (id: string, diaSemana: number, horario: string, ativo: boolean, temUso: boolean) => ({
  id, studentId: "s1", diaSemana, horario, duracaoMinutos: 60, ativo, createdAt: at(-30, 10), temUso,
});
const REC_PKG = pkg(8, 3, { id: "pkg-rec-a", studentId: "s1", origin: "recurrence", templateName: undefined });
const RECORRENCIA_CASOS: { title: string; note: string; modo: "recorrencia" | "autosservico"; recs: ReturnType<typeof recDia>[]; pacote: PackageRecord | null; saldo: SaldoPacote | null; cancelaveis: number }[] = [
  {
    title: "Recorrência em uso",
    note: "professor em Recorrência; pacote ativo, 3 dias fixos (1 inativo), 5 aulas seriam canceladas ao gerar",
    modo: "recorrencia",
    recs: [recDia("r1", 1, "18:00", true, true), recDia("r2", 3, "19:00", true, true), recDia("r3", 5, "07:00", false, false)],
    pacote: REC_PKG,
    saldo: { pacoteId: "pkg-rec-a", studentId: "s1", recorrenciaId: "r1", total: 8, consumidas: 3, restantes: 5, aRepor: 1 },
    cancelaveis: 5,
  },
  {
    title: "Primeira vez",
    note: "professor em Recorrência, aluno sem nenhum dia fixo e sem pacote",
    modo: "recorrencia",
    recs: [],
    pacote: null,
    saldo: null,
    cancelaveis: 0,
  },
  {
    title: "Professor em Autosserviço",
    note: "dias fixos já cadastrados, mas gerar pacote fica desabilitado",
    modo: "autosservico",
    recs: [recDia("r1", 2, "18:00", true, false)],
    pacote: null,
    saldo: null,
    cancelaveis: 0,
  },
];

const PERFIL_PROF_CASOS: { title: string; note: string; lista: BoxingProfileAssessment[] }[] = [
  { title: "Nenhuma avaliação", note: "professor ainda não avaliou e o aluno também não", lista: [] },
  { title: "Só o aluno", note: "autoavaliação feita, professor ainda não", lista: [SELF] },
  { title: "Só o professor", note: "professor avaliou, aluno ainda não", lista: [COACH] },
  { title: "Os dois", note: "comparação e resultado combinado", lista: [SELF, COACH] },
];

const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const intervalo = (weekday: number, ini: number, fim: number, agendadas = 0) => ({
  key: `${weekday}-${ini}-${fim}`,
  weekday,
  startTime: `${String(ini).padStart(2, "0")}:00`,
  endTime: `${String(fim).padStart(2, "0")}:00`,
  slotIds: Array.from({ length: fim - ini }, (_, i) => `s-${weekday}-${ini + i}`),
  bookedCount: agendadas,
});
const semana = (dias: Record<number, { active: boolean; slots: ReturnType<typeof intervalo>[] }>) =>
  NOMES_DIA.map((name, weekday) => ({ weekday, name, active: dias[weekday]?.active ?? false, slots: dias[weekday]?.slots ?? [] }));
const DISPONIBILIDADE_CASOS: { title: string; note: string; dados: ReturnType<typeof semana> | null; modo?: "recorrencia" }[] = [
  {
    title: "Semana em uso",
    note: "dias ativos com aulas marcadas, um dia pausado com horários, dias vazios",
    dados: semana({
      1: { active: true, slots: [intervalo(1, 6, 9, 2), intervalo(1, 18, 21, 3)] },
      2: { active: true, slots: [intervalo(2, 18, 21)] },
      3: { active: false, slots: [intervalo(3, 7, 10, 1)] },
      5: { active: true, slots: [intervalo(5, 6, 9)] },
    }),
  },
  { title: "Nada publicado", note: "primeira vez: nenhum horário em nenhum dia", dados: semana({}) },
  {
    title: "Professor em Recorrência",
    note: "a grade continua editável, mas a faixa explica que os alunos não a usam",
    modo: "recorrencia",
    dados: semana({ 1: { active: true, slots: [intervalo(1, 18, 21, 1)] }, 3: { active: true, slots: [intervalo(3, 18, 21)] } }),
  },
];

const PACOTES_CASOS: { title: string; note: string; lista: unknown[] }[] = [
  {
    title: "Com modelos",
    note: "preço definido, preço a combinar, aula avulsa e um gratuito",
    lista: [
      { ...modelo("m1", "Pacote 8 aulas", 8, 32000), description: "2x por semana · 60 dias", validityDays: 60 },
      { ...modelo("m2", "Pacote 12 aulas", 12, 45000), description: "3x por semana · 90 dias", validityDays: 90 },
      { ...modelo("m3", "Pacote Trimestral Premium com Avaliação Física Completa", 24, null), description: "Preço combinado direto com o aluno", validityDays: 120 },
      { ...modelo("m4", "Aula avulsa", 1, 5000), description: "", validityDays: null },
      { ...modelo("m5", "Aula experimental", 1, 0), description: "Cortesia para quem está começando", validityDays: 30 },
    ],
  },
  { title: "Nenhum modelo", note: "primeira vez", lista: [] },
];

function SeededAdmin({ data, children, seed }: { data: unknown; children: ReactNode; seed?: (qc: QueryClient) => void }) {
  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { staleTime: Infinity, retry: false, queryFn: () => Promise.reject(new Error("amostra: consulta não simulada")) },
      },
    });
    qc.setQueryData(["admin-dashboard", ADMIN_ID], data);
    seed?.(qc);
    // Pra testar pelo console o que acontece quando um item some (ex.: foco depois de resolver):
    // window.__amostrasAdmin[i].setQueryData(["admin-dashboard", "<ADMIN_ID>"], ...).
    const w = window as unknown as { __amostrasAdmin?: QueryClient[] };
    (w.__amostrasAdmin ??= []).push(qc);
    // Professor configurado pra falta NÃO descontar, mas o pacote de recorrência do Diego foi criado
    // quando descontava: a janela de falta tem que seguir o pacote (regra da aula, não a geral).
    if (!qc.getQueryState(["admin-settings", ADMIN_ID])) {
      qc.setQueryData(["admin-settings", ADMIN_ID], { adminId: ADMIN_ID, noShowConsumesClass: false, modoAgendamento: "autosservico", whatsapp: null });
    }
    qc.setQueryData(["regra-consumo", "a-s3--1-19", false], { falta: true, cancelamentoPeloAluno: true, origem: "pacote" });
    qc.setQueryData(["notifications", ADMIN_ID], []);
    return qc;
  });
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider
        value={{ profile: PROFESSOR, loading: false, signIn: () => Promise.reject(new Error("amostra")), signOut: async () => {}, refreshProfile: () => {} }}
      >
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

export default function Amostras() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background text-foreground p-6">
        <h1 className="font-display text-3xl tracking-wide uppercase mb-1">Amostras</h1>
        <p className="text-sm text-muted-foreground mb-8 max-w-prose">
          Só existe em desenvolvimento. Dados inventados, sem login e sem banco. Os botões navegam, mas
          as telas de destino não têm dados simulados.
        </p>

        <h2 className="text-lg font-semibold mb-4">Home do aluno</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          {HOME_CASES.map((c) => (
            <Frame key={c.title} title={c.title} note={c.note}>
              <Seeded data={c.data} modo={c.modo}>
                <StudentHome />
              </Seeded>
            </Frame>
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-4">Painel do professor</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          {DASH_CASES.map((c) => (
            <Frame key={c.title} title={c.title} note={c.note}>
              <SeededAdmin data={c.data}>
                <AdminDashboard />
              </SeededAdmin>
            </Frame>
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-4">Solicitações (professor)</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          {PEDIDOS_CASOS.map((c) => (
            <Frame key={c.title} title={c.title} note={c.note}>
              <SeededAdmin
                data={null}
                seed={(qc) => {
                  qc.setQueryData(["purchase-requests", ADMIN_ID], c.lista);
                  qc.setQueryData(["purchase-requests-decididos", ADMIN_ID], [
                    { request: { ...pedido("d1", "package", "x", null, 0).request, status: "approved", decidedAt: at(-2, 9) }, studentName: "Fernanda Rocha", template: modelo("t9", "Pacote de 8 aulas", 8, 32000) },
                    { request: { ...pedido("d2", "single", "x", null, 0).request, status: "rejected", decidedAt: at(-5, 9) }, studentName: "Gustavo Alves", template: modelo("t8", "Aula avulsa", 1, 5000) },
                  ]);
                }}
              >
                <AdminPedidos />
              </SeededAdmin>
            </Frame>
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-4">Entrada (convite e criar conta)</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          <Frame title="Login" note="tela de entrada de quem já tem conta">
            <SemLogin>
              <ComRota path="/login" url="/login">
                <Login />
              </ComRota>
            </SemLogin>
          </Frame>
          <Frame title="Convite válido" note="link de convite do professor">
            <SemLogin convite={{ valid: true, reason: "ok" }}>
              <ComRota path="/convite/:token" url="/convite/amostra">
                <Convite />
              </ComRota>
            </SemLogin>
          </Frame>
          <Frame title="Convite inválido" note="link expirado ou já usado">
            <SemLogin convite={{ valid: false, reason: "expired" }}>
              <ComRota path="/convite/:token" url="/convite/amostra">
                <Convite />
              </ComRota>
            </SemLogin>
          </Frame>
          <Frame title="Criar conta" note="cadastro por conta própria">
            <SemLogin>
              <ComRota path="/criar-conta" url="/criar-conta">
                <CriarConta />
              </ComRota>
            </SemLogin>
          </Frame>
          <Frame title="Confirme seu e-mail (convite)" note="veio de um convite: conclui sozinho depois de confirmar">
            <SemLogin>
              <ComRota path="/confirmar-email" url="/confirmar-email?email=aluno@exemplo.com&convite=1">
                <ConfirmarEmail />
              </ComRota>
            </SemLogin>
          </Frame>
          <Frame title="Confirme seu e-mail" note="depois de criar a conta">
            <SemLogin>
              <ComRota path="/confirmar-email" url="/confirmar-email?email=aluno@exemplo.com">
                <ConfirmarEmail />
              </ComRota>
            </SemLogin>
          </Frame>
        </div>

        <h2 className="text-lg font-semibold mb-4">Detalhe da aula (professor)</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          {DETALHE_PROF.map((c) => (
            <Frame key={c.id} title={c.title} note={c.note}>
              <SeededAdmin data={null} seed={(qc) => qc.setQueryData(["admin-booking", c.id], c.valor)}>
                <ComRota path="/admin/aula/:id" url={`/admin/aula/${c.id}`}>
                  <AdminAulaDetalhe />
                </ComRota>
              </SeededAdmin>
            </Frame>
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-4">Detalhe da aula (aluno)</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          {DETALHE_ALUNO.map((c) => (
            <Frame key={c.id} title={c.title} note={c.note}>
              <Seeded
                data={base}
                modo="autosservico"
                extra={[
                  [["booking", c.id], c.valor],
                  [["pedido-remarcacao", c.id], c.pedido ?? null],
                  [["class-guidelines", ADMIN_ID], ORIENTACOES],
                ]}
              >
                <ComRota path="/app/aula/:id" url={`/app/aula/${c.id}`}>
                  <StudentAulaDetalhe />
                </ComRota>
              </Seeded>
            </Frame>
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-4">Agendar aula (aluno)</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          <Frame title="Com aulas para agendar" note="6 livres no pacote; amanhã tem livres e ocupados, depois de amanhã sem horários">
            <Seeded data={{ ...base, package: pkg(10, 3), credits: 6 }} modo="autosservico" extra={horariosAgendar()}>
              <StudentAgendar />
            </Seeded>
          </Frame>
          <Frame title="Nada para agendar" note="restantes todas já marcadas (crédito 0)">
            <Seeded data={{ ...base, package: pkg(8, 6), credits: 0, nextBooking: booking(1) }} modo="autosservico" extra={horariosAgendar()}>
              <StudentAgendar />
            </Seeded>
          </Frame>
        </div>

        <h2 className="text-lg font-semibold mb-4">Agenda do professor</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          <Frame title="Agenda" note="abre em hoje; ontem tem aula sem registro, amanhã tem pedidos, depois de amanhã sem horários">
            <SeededAdmin data={null} seed={semearAgenda}>
              <AdminAgenda />
            </SeededAdmin>
          </Frame>
        </div>

        <h2 className="text-lg font-semibold mb-4">Recorrência do aluno (professor)</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          {RECORRENCIA_CASOS.map((c) => (
            <Frame key={c.title} title={c.title} note={c.note}>
              <SeededAdmin
                data={null}
                seed={(qc) => {
                  qc.setQueryData(["admin-settings", ADMIN_ID], { adminId: ADMIN_ID, noShowConsumesClass: false, modoAgendamento: c.modo, whatsapp: null });
                  qc.setQueryData(["admin-student-detail", "s1"], {
                    student: aluno("s1", "Ana Beatriz Souza"),
                    package: c.pacote,
                    credits: 0,
                    history: [],
                    completedCount: 3,
                    noShowCount: 1,
                  });
                  qc.setQueryData(["aluno-recorrencias", "s1"], c.recs);
                  if (c.pacote) qc.setQueryData(["saldo-pacote", c.pacote.id], c.saldo);
                  qc.setQueryData(["aulas-cancelaveis-recorrencia", "s1"], Array.from({ length: c.cancelaveis }, (_, i) => at(1 + i * 2, 18)));
                }}
              >
                <ComRota path="/admin/alunos/:studentId/recorrencia" url="/admin/alunos/s1/recorrencia">
                  <AdminAlunoRecorrencia />
                </ComRota>
              </SeededAdmin>
            </Frame>
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-4">Perfil de Boxe (aluno)</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          {PROFILE_CASES.map((c) => (
            <Frame key={c.title} title={c.title} note={c.note}>
              <Seeded data={base} modo="autosservico" extra={c.extra}>
                <StudentPerfilLutador />
              </Seeded>
            </Frame>
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-4">Perfil de Boxe (professor)</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          {PERFIL_PROF_CASOS.map((c) => (
            <Frame key={c.title} title={c.title} note={c.note}>
              <SeededAdmin
                data={null}
                seed={(qc) => {
                  qc.setQueryData(["admin-student-detail", "s1"], { student: aluno("s1", "Ana Beatriz Souza"), package: null, credits: 0, history: [], completedCount: 0, noShowCount: 0 });
                  qc.setQueryData(["boxing-profile-history", "s1"], c.lista);
                  for (const a of c.lista) qc.setQueryData(["boxing-profile-assessment", a.id], a);
                }}
              >
                <ComRota path="/admin/alunos/:studentId/perfil-lutador" url="/admin/alunos/s1/perfil-lutador">
                  <AdminAlunoPerfilBoxe />
                </ComRota>
              </SeededAdmin>
            </Frame>
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-4">Configurações (professor)</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          {[
            { title: "Autosserviço, com WhatsApp", note: "falta não consome aula; número cadastrado", modo: "autosservico", noShow: false, whatsapp: "5511947034983" },
            { title: "Recorrência, sem WhatsApp", note: "falta consome aula; sem número (alunos não veem o botão)", modo: "recorrencia", noShow: true, whatsapp: null },
            { title: "Não carregou", note: "a busca das configurações falhou", modo: "erro", noShow: true, whatsapp: null },
          ].map((c) => (
            <Frame key={c.title} title={c.title} note={c.note}>
              <SeededAdmin
                data={null}
                seed={(qc) => {
                  if (c.modo === "erro") {
                    qc.fetchQuery({ queryKey: ["admin-settings", ADMIN_ID], queryFn: () => Promise.reject(new Error("amostra")), retry: false }).catch(() => {});
                  } else {
                    qc.setQueryData(["admin-settings", ADMIN_ID], { adminId: ADMIN_ID, noShowConsumesClass: c.noShow, modoAgendamento: c.modo, whatsapp: c.whatsapp });
                  }
                }}
              >
                <AdminConfiguracoes />
              </SeededAdmin>
            </Frame>
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-4">Disponibilidade (professor)</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          {DISPONIBILIDADE_CASOS.map((c) => (
            <Frame key={c.title} title={c.title} note={c.note}>
              <SeededAdmin
                data={null}
                seed={(qc) => {
                  qc.setQueryData(["availability", ADMIN_ID], c.dados);
                  if (c.modo) qc.setQueryData(["admin-settings", ADMIN_ID], { adminId: ADMIN_ID, noShowConsumesClass: false, modoAgendamento: c.modo, whatsapp: null });
                }}
              >
                <AdminDisponibilidade />
              </SeededAdmin>
            </Frame>
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-4">Pacotes (professor)</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          {PACOTES_CASOS.map((c) => (
            <Frame key={c.title} title={c.title} note={c.note}>
              <SeededAdmin
                data={null}
                seed={(qc) => {
                  qc.setQueryData(["package-templates", ADMIN_ID], c.lista);
                  // Pedidos pendentes: 2 para o primeiro modelo, 1 para o segundo.
                  const [m1, m2] = c.lista as ReturnType<typeof modelo>[];
                  qc.setQueryData(["purchase-requests", ADMIN_ID], m1 ? [pedido("pk1", "package", "Ana Beatriz Souza", m1, 0), pedido("pk2", "package", "Carlos Lima", m1, 0), pedido("pk3", "package", "Julia Pereira", m2, 0)] : []);
                }}
              >
                <AdminPacotes />
              </SeededAdmin>
            </Frame>
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-4">Lista de alunos</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          <Frame title="Alunos" note='toque em "Em risco" (ou abra /dev/amostras?filtro=risco)'>
            <SeededAdmin data={null} seed={semearAlunos}>
              <AdminAlunos />
            </SeededAdmin>
          </Frame>
        </div>

        <h2 className="text-lg font-semibold mb-4">Pedido de remarcação (aluno)</h2>
        <div className="mb-12">
          <AmostraRemarcacao />
        </div>

        <h2 className="text-lg font-semibold mb-4">Perfil de Boxe na Home</h2>
        <div className="flex flex-wrap gap-6 mb-12">
          {PROFILE_CASES.map((c) => (
            <Frame key={c.title} title={c.title} note={c.note}>
              <div className="px-4 pb-4">
                <Seeded data={base} modo="autosservico" extra={c.extra}>
                  <BoxingProfileHomeCard />
                </Seeded>
              </div>
            </Frame>
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-4">Cartão de saldo</h2>
        <div className="flex flex-wrap gap-6">
          {CARD_CASES.map((c) => (
            <Frame key={c.title} title={c.title} note={c.note}>
              <div className="p-4">
                <ActivePackageCard {...c.props} />
              </div>
            </Frame>
          ))}
        </div>
      </div>
    </BrowserRouter>
  );
}

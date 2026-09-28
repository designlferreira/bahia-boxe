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
import { BrowserRouter } from "react-router-dom";
import { addDays, subDays } from "date-fns";
import { AuthContext } from "@/context/AuthContext";
import StudentHome from "@/pages/student/Home";
import AdminDashboard from "@/pages/admin/Dashboard";
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
  const dimensionScores = Object.fromEntries(DIMENSIONS.map((d) => [d, 60])) as BoxingProfileAssessment["dimensionScores"];
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
      primeirosPassos: null,
    },
  },
  {
    title: "Fim do dia",
    note: "todas as aulas de hoje registradas; mostra a próxima",
    data: {
      activeStudents: 8,
      today: [aulaEm("s1", "Ana Beatriz Souza", -240, "completed"), aulaEm("s4", "Fernanda Rocha", -120, "completed")],
      nextAfterToday: aulaDe("s8", "Julia Pereira", 1, 7, "scheduled"),
      pending: [],
      awaitingConfirmation: [],
      purchaseRequests: 0,
      atRisk: RISCO.slice(1, 2),
      primeirosPassos: null,
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
      primeirosPassos: null,
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
      primeirosPassos: { horarios: true, pacotes: false, whatsapp: false },
    },
  },
];

function SeededAdmin({ data, children }: { data: unknown; children: ReactNode }) {
  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { staleTime: Infinity, retry: false, queryFn: () => Promise.reject(new Error("amostra: consulta não simulada")) },
      },
    });
    qc.setQueryData(["admin-dashboard", ADMIN_ID], data);
    // Professor configurado pra falta NÃO descontar, mas o pacote de recorrência do Diego foi criado
    // quando descontava: a janela de falta tem que seguir o pacote (regra da aula, não a geral).
    qc.setQueryData(["admin-settings", ADMIN_ID], { adminId: ADMIN_ID, noShowConsumesClass: false, modoAgendamento: "autosservico", whatsapp: null });
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

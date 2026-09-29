import { addDays, addWeeks, format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { TIMEZONE, formatDate, formatTime } from "@/lib/dateUtils";
export { normalizeWhatsapp } from "@/lib/whatsapp";
import { supabase } from "@/integrations/supabase/client";
import type {
  AdminSettings,
  AlunoRecorrencia,
  AppNotification,
  AvailabilityInterval,
  Booking,
  BoxingProfileAssessment,
  BoxingProfileAssessmentSummary,
  Guard,
  Laterality,
  ModoAgendamento,
  PackageRecord,
  PackageTemplate,
  PurchaseRequest,
  SaldoPacote,
  Sex,
  StudentProfile,
  StudentRecord,
} from "./types";
import type { BookingStatus } from "@/lib/bookingStatus";
import type { ClassGuidelines } from "@/lib/classGuidelines";
import {
  computeWingspanIndex,
  FORCED_CHOICE_WEIGHT,
  getQuestions as getBoxingProfileQuestions,
  isComplete as isBoxingProfileComplete,
  QUESTIONNAIRE_VERSION as BOXING_QUESTIONNAIRE_VERSION,
  scoreAssessment as scoreBoxingProfile,
  SCORING_VERSION as BOXING_SCORING_VERSION,
  type Answers as BoxingAnswers,
  type AssessmentLength as BoxingAssessmentLength,
} from "@/lib/boxingProfile";

/**
 * This module talks to the pre-existing Bahia Boxe database (see supabase/README.md). Two of its
 * shapes drive most of the code here:
 *
 * 1. `students.id` is not `profiles.id`. Everything student-scoped (`bookings`, `packages`,
 *    `purchase_requests`) references the students row, so any call that starts from the logged-in
 *    user's profile id has to resolve it first — `studentIdForProfile()`.
 * 2. `availability_slots` holds concrete one-hour datetimes, not a weekly recurrence. The weekly
 *    grid the availability screen shows is derived from the slots inside a planning horizon.
 */

function client() {
  if (!supabase) throw new Error("Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes).");
  return supabase;
}

/** Statuses that hold a place on the professor's calendar. */
const ACTIVE_STATUSES: BookingStatus[] = ["scheduled", "pending_confirmation"];

/**
 * Filtro `.or(...)` para esconder as aulas descartadas por uma regeneração de pacote
 * (`cancelado_por = 'regeneracao'`, migration 0019) — elas nunca chegaram a ser um compromisso com
 * o aluno, então não devem aparecer em lista, contador nem candidata a reposição.
 *
 * É `.or(is.null, neq)` e não `.neq(...)` sozinho de propósito: em SQL, `cancelado_por <>
 * 'regeneracao'` é NULL (não `true`) para as linhas com `cancelado_por` nulo — que é a esmagadora
 * maioria (todo o AUTOSSERVICO). Um `.neq` puro descartaria justamente essas.
 */
const SEM_DESCARTE_DE_REGENERACAO = "cancelado_por.is.null,cancelado_por.neq.regeneracao";

// ---------------------------------------------------------------------------
// row → app-type mappers
// ---------------------------------------------------------------------------

function mapBooking(r: any): Booking {
  return {
    id: r.id,
    studentId: r.student_id,
    adminId: r.admin_id,
    startTime: r.start_time,
    endTime: r.end_time,
    status: r.status,
    slotId: r.slot_id ?? null,
    billingKind: r.billing_kind ?? "package",
    cancelReason: r.cancel_reason,
    teacherNote: r.teacher_note,
    suggestedStartTime: r.suggested_start_time,
    suggestedEndTime: r.suggested_end_time,
    isReplacement: r.is_replacement ?? false,
    replacementForBookingId: r.replacement_for_booking_id ?? null,
    pacoteId: r.pacote_id ?? null,
    recorrenciaId: r.recorrencia_id ?? null,
    cadeiaId: r.cadeia_id ?? null,
    canceladoPor: r.cancelado_por ?? null,
  };
}

/** `packages` stores no template link, so the label is derived from `kind` + `origin` + `total_classes`. */
function mapPackage(r: any): PackageRecord {
  const kind: PackageRecord["kind"] = r.kind === "single" ? "single" : "package";
  const origin: PackageRecord["origin"] =
    r.origin === "trial" || r.origin === "admin_grant" || r.origin === "recurrence" ? r.origin : "purchase";
  return {
    id: r.id,
    studentId: r.student_id,
    totalClasses: r.total_classes,
    usedClasses: r.used_classes,
    status: r.status,
    kind,
    origin,
    templateName:
      origin === "trial"
        ? "Aula experimental"
        : origin === "recurrence"
          ? `Pacote de recorrência · ${r.total_classes} aulas`
          : kind === "single"
            ? "Aula avulsa"
            : `Pacote de ${r.total_classes} aulas`,
    createdAt: r.created_at,
    recorrenciaId: r.recorrencia_id ?? null,
    faltaConsomeCredito: r.falta_consome_credito ?? null,
  };
}

function mapAlunoRecorrencia(r: any, temUso: boolean): AlunoRecorrencia {
  return {
    id: r.id,
    studentId: r.aluno_id,
    diaSemana: r.dia_semana,
    horario: typeof r.horario === "string" ? r.horario.slice(0, 5) : r.horario,
    duracaoMinutos: parseIntervalMinutes(r.duracao),
    ativo: r.ativo,
    createdAt: r.created_at,
    temUso,
  };
}

/** Postgres imprime `interval` (sem dias) como texto "HH:MM:SS" — só o formato que este app grava. */
function parseIntervalMinutes(raw: string): number {
  const match = /^(-?\d+):(\d{2}):(\d{2})/.exec(String(raw ?? ""));
  if (!match) return 60;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function mapSaldoPacote(r: any): SaldoPacote {
  return {
    pacoteId: r.pacote_id,
    studentId: r.student_id,
    recorrenciaId: r.recorrencia_id,
    total: r.total,
    consumidas: r.consumidas,
    restantes: r.restantes,
    aRepor: r.a_repor,
  };
}

function mapTemplate(r: any): PackageTemplate {
  return {
    id: r.id,
    adminId: r.admin_id,
    name: r.name,
    description: r.description ?? "",
    totalClasses: r.total_classes,
    priceCents: r.price_cents ?? null,
    validityDays: r.validity_days ?? null,
    isActive: r.is_active ?? true,
  };
}

function mapRequest(r: any): PurchaseRequest {
  return {
    id: r.id,
    studentId: r.student_id,
    adminId: r.admin_id,
    kind: r.kind,
    templateId: r.template_id,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}

// ---------------------------------------------------------------------------
// identity helpers
// ---------------------------------------------------------------------------

const studentIdByProfile = new Map<string, string>();

/** Resolves `profiles.id` → `students.id`. Cached: the link never changes for a session. */
export async function studentIdForProfile(profileId: string): Promise<string> {
  const cached = studentIdByProfile.get(profileId);
  if (cached) return cached;
  const { data, error } = await client().from("students").select("id").eq("profile_id", profileId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sua conta ainda não está vinculada a um professor.");
  studentIdByProfile.set(profileId, data.id);
  return data.id;
}

/** {profileId: name}. Students can only read their own profile; admins can read every profile. */
async function profileNames(profileIds: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(profileIds)).filter(Boolean);
  if (unique.length === 0) return {};
  const { data, error } = await client().from("profiles").select("id, name").in("id", unique);
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.id] = row.name;
  return map;
}

/** Every student of an admin, with the name resolved from their profile. */
async function adminStudents(adminId: string): Promise<StudentRecord[]> {
  const { data, error } = await client()
    .from("students")
    .select("id, profile_id, admin_id, created_at")
    .eq("admin_id", adminId);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const names = await profileNames(rows.map((r) => r.profile_id));
  return rows.map((r) => ({
    id: r.id,
    profileId: r.profile_id,
    adminId: r.admin_id,
    createdAt: r.created_at,
    name: names[r.profile_id] ?? "Aluno",
  }));
}

// ---------------------------------------------------------------------------
// timezone helpers — the database stores timestamptz, the UI reasons in BRT
// ---------------------------------------------------------------------------

function brt(date: string | Date) {
  return toZonedTime(typeof date === "string" ? new Date(date) : date, TIMEZONE);
}

function brtWeekday(date: string | Date) {
  return brt(date).getDay();
}

function brtHour(date: string | Date) {
  return brt(date).getHours();
}

function brtDateKey(date: Date) {
  return format(brt(date), "yyyy-MM-dd");
}

/** The UTC instants bounding a BRT calendar day. */
function dayBoundsUtcIso(date: Date) {
  const day = brtDateKey(date);
  const next = format(addDays(brt(date), 1), "yyyy-MM-dd");
  return {
    startIso: fromZonedTime(`${day}T00:00:00`, TIMEZONE).toISOString(),
    endIso: fromZonedTime(`${next}T00:00:00`, TIMEZONE).toISOString(),
  };
}

const hhmm = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

// ---------------------------------------------------------------------------
// student · home / pacotes
// ---------------------------------------------------------------------------

async function activePackageForStudentRow(studentId: string): Promise<PackageRecord | null> {
  const { data, error } = await client()
    .from("packages")
    .select("*")
    .eq("student_id", studentId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  return row ? mapPackage(row) : null;
}

/** `studentId` here is a `students.id` (admin screens already hold one). */
export async function activePackageFor(studentId: string): Promise<PackageRecord | null> {
  return activePackageForStudentRow(studentId);
}

/**
 * Única regra canônica de saldo disponível — vive em `available_credits_for_student` no banco
 * (soma de crédito restante de TODOS os pacotes ativos do aluno, trial incluído, menos reservas
 * futuras) para que o frontend nunca reimplemente essa fórmula em paralelo à que as RPCs de
 * agendamento/conclusão já usam.
 */
export async function creditsAvailableFor(studentId: string): Promise<number> {
  const { data, error } = await client().rpc("available_credits_for_student", { p_student_id: studentId });
  if (error) throw new Error(error.message);
  return data ?? 0;
}

export async function getStudentHome(profileId: string) {
  const studentId = await studentIdForProfile(profileId);
  const nowIso = new Date().toISOString();
  const [pkg, credits, upcomingRes, suggestionRes, pendingRequestRes] = await Promise.all([
    activePackageForStudentRow(studentId),
    creditsAvailableFor(studentId),
    client()
      .from("bookings")
      .select("*")
      .eq("student_id", studentId)
      .in("status", ACTIVE_STATUSES)
      .gt("start_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(1),
    client()
      .from("bookings")
      .select("*")
      .eq("student_id", studentId)
      .eq("status", "rejected_with_suggestion")
      // Só sugestões que ainda podem ser aceitas: com horário sugerido e no futuro. Sem isso, a
      // última sugestão já vencida ficava na Home pra sempre, levando a uma aula que não dá mais
      // pra aceitar. A mais próxima primeiro — é a que o aluno precisa decidir antes.
      .not("suggested_start_time", "is", null)
      .gt("suggested_start_time", nowIso)
      .order("suggested_start_time", { ascending: true })
      .limit(1),
    // Pedido de pacote/aula ainda sem decisão do professor. Sem isso, logo depois de pedir o aluno
    // voltava pra Home e lia de novo "suas aulas acabaram, solicite" — como se o pedido não
    // tivesse ido. O mais recente basta: a Home só precisa saber que existe um em espera.
    client()
      .from("purchase_requests")
      .select("*")
      .eq("student_id", studentId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (upcomingRes.error) throw new Error(upcomingRes.error.message);
  if (suggestionRes.error) throw new Error(suggestionRes.error.message);
  if (pendingRequestRes.error) throw new Error(pendingRequestRes.error.message);
  const pendingRequest = (pendingRequestRes.data ?? [])[0];
  const upcoming = (upcomingRes.data ?? [])[0];
  const suggestion = (suggestionRes.data ?? [])[0];

  // RECORRENCIA (CLAUDE.md, 2026-09-08): "crédito disponível" (available_credits_for_student)
  // não faz sentido pra quem não se auto-agenda — as aulas já nascem marcadas, então o número
  // sempre bate em zero por construção (ver diagnóstico registrado no CLAUDE.md). O número certo
  // pra esse aluno é "aulas restantes no pacote", vindo de saldo_pacotes (decisão 4 — única
  // autoridade), não do materializado used_classes. `recorrenciaSaldo` fica null pra qualquer
  // outra origem — `credits` continua exatamente como sempre foi, intocado.
  // Sem pacote ativo, o aluno pode estar num de dois lugares bem diferentes: nunca teve pacote
  // (recém-convidado) ou o pacote acabou — quando a última aula é usada, o banco muda o status pra
  // `finished` (0001:498) e `activePackageForStudentRow` passa a devolver null. Sem distinguir os
  // dois, a Home mostrava "Suas aulas começam em 3 passos" pra aluno veterano. Trial não conta:
  // quem só usou a aula experimental ainda precisa do primeiro pacote.
  let lastPackage: PackageRecord | null = null;
  if (!pkg) {
    const { data: lastRows, error: lastErr } = await client()
      .from("packages")
      .select("*")
      .eq("student_id", studentId)
      .neq("origin", "trial")
      .order("created_at", { ascending: false })
      .limit(1);
    if (lastErr) throw new Error(lastErr.message);
    lastPackage = lastRows?.[0] ? mapPackage(lastRows[0]) : null;
  }

  const isRecorrenciaPkg = pkg?.origin === "recurrence" && pkg.status === "active";
  const recorrenciaSaldo = isRecorrenciaPkg ? await getSaldoPacote(pkg!.id) : null;

  return {
    package: pkg,
    lastPackage,
    credits,
    recorrenciaSaldo,
    nextBooking: upcoming ? mapBooking(upcoming) : null,
    suggestion: suggestion ? mapBooking(suggestion) : null,
    pendingRequest: pendingRequest ? mapRequest(pendingRequest) : null,
  };
}

/** Active templates only — removing a template is a soft delete (`is_active = false`). */
export async function getPackageTemplates(adminId: string): Promise<PackageTemplate[]> {
  const { data, error } = await client()
    .from("package_templates")
    .select("*")
    .eq("admin_id", adminId)
    .eq("is_active", true)
    .order("total_classes");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTemplate);
}

export async function getStudentPackages(profileId: string) {
  const studentId = await studentIdForProfile(profileId);
  const { data, error } = await client()
    .from("packages")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPackage);
}

/** The admin a student belongs to (spec §1: one professor per student). */
export async function getStudentAdminId(profileId: string): Promise<string> {
  const { data, error } = await client()
    .from("students")
    .select("admin_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sua conta ainda não está vinculada a um professor.");
  return data.admin_id;
}

// ---------------------------------------------------------------------------
// student · agendar
// ---------------------------------------------------------------------------

export interface DaySlot {
  slotId: string;
  time: string; // "HH:mm"
  status: "free" | "booked";
}

export async function getAvailableSlotsForDay(adminId: string, date: Date): Promise<DaySlot[]> {
  const { startIso, endIso } = dayBoundsUtcIso(date);
  const nowIso = new Date().toISOString();

  // RLS already narrows this to active, future slots for students; the filters keep the admin
  // (who can read all of their own slots) on the same footing.
  const [slotsRes, freeRes] = await Promise.all([
    client()
      .from("availability_slots")
      .select("id, start_time")
      .eq("admin_id", adminId)
      .eq("is_active", true)
      .gt("start_time", nowIso)
      .gte("start_time", startIso)
      .lt("start_time", endIso)
      .order("start_time"),
    client()
      .from("available_slots")
      .select("slot_id")
      .eq("admin_id", adminId)
      .gte("start_time", startIso)
      .lt("start_time", endIso),
  ]);
  if (slotsRes.error) throw new Error(slotsRes.error.message);
  if (freeRes.error) throw new Error(freeRes.error.message);

  const free = new Set((freeRes.data ?? []).map((r) => r.slot_id));
  return (slotsRes.data ?? []).map((s) => ({
    slotId: s.id,
    time: hhmm(brtHour(s.start_time)),
    status: free.has(s.id) ? "free" : "booked",
  }));
}

/**
 * Os horários de vários dias numa busca só (a tela Agendar mostra 7): a tela precisa saber QUAIS dias
 * têm horário livre pra abrir no primeiro deles e marcar os dias na faixa. Mesma lógica de
 * `getAvailableSlotsForDay`, agrupada por dia (chave "yyyy-MM-dd" no fuso de São Paulo).
 */
export async function getAvailableSlotsForDays(adminId: string, days: Date[]): Promise<Record<string, DaySlot[]>> {
  if (days.length === 0) return {};
  const { startIso } = dayBoundsUtcIso(days[0]);
  const { endIso } = dayBoundsUtcIso(days[days.length - 1]);
  const nowIso = new Date().toISOString();
  const [slotsRes, freeRes] = await Promise.all([
    client()
      .from("availability_slots")
      .select("id, start_time")
      .eq("admin_id", adminId)
      .eq("is_active", true)
      .gt("start_time", nowIso)
      .gte("start_time", startIso)
      .lt("start_time", endIso)
      .order("start_time"),
    client()
      .from("available_slots")
      .select("slot_id")
      .eq("admin_id", adminId)
      .gte("start_time", startIso)
      .lt("start_time", endIso),
  ]);
  if (slotsRes.error) throw new Error(slotsRes.error.message);
  if (freeRes.error) throw new Error(freeRes.error.message);

  const free = new Set((freeRes.data ?? []).map((r) => r.slot_id));
  const out: Record<string, DaySlot[]> = {};
  for (const d of days) out[brtDateKey(d)] = [];
  for (const s of slotsRes.data ?? []) {
    const key = brtDateKey(new Date(s.start_time));
    (out[key] ??= []).push({ slotId: s.id, time: hhmm(brtHour(s.start_time)), status: free.has(s.id) ? "free" : "booked" });
  }
  return out;
}

/** `schedule_booking` validates credits, ownership and slot availability server-side. */
export async function scheduleBooking(slotId: string) {
  const { error } = await client().rpc("schedule_booking", { p_slot_id: slotId });
  if (error) throw new Error(error.message);
}

/** Students may cancel their own scheduled class up to 6h before it starts (RLS enforces it). */
/**
 * O aluno cancela a própria aula por RPC (0034). Antes era UPDATE direto, que a policy do aluno só
 * deixava passar em aula `scheduled`: cancelar uma aula ainda PENDENTE (agendada no autosserviço,
 * sem aprovação) afetava 0 linhas e o app culpava o prazo de 6 horas.
 */
/**
 * Cancelar essa aula desconta uma aula do aluno? (0035) A regra vem do banco — o aluno não lê
 * `profiles` nem a cópia da regra no pacote —, a mesma que `calcular_saldo_pacote` aplica.
 */
export async function getCancelamentoDescontaAula(bookingId: string): Promise<boolean> {
  const { data, error } = await client().rpc("cancelamento_desconta_aula", { p_booking_id: bookingId });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function cancelBooking(bookingId: string) {
  const { error } = await client().rpc("cancelar_minha_aula", { p_booking_id: bookingId });
  if (!error) return;
  const m = error.message ?? "";
  if (m.includes("too_late")) throw new Error("Só é possível cancelar até 6 horas antes do início da aula.");
  if (m.includes("already_started")) throw new Error("Esta aula já começou.");
  if (m.includes("not_cancelable")) throw new Error("Esta aula não pode mais ser cancelada.");
  throw new Error("Não foi possível cancelar a aula. Tente de novo em instantes.");
}

/**
 * O horário que o aluno tentou pegar foi ocupado por outra aula nesse meio-tempo. Separado de um
 * erro genérico pra tela poder oferecer "ver outros horários" em vez de só avisar.
 */
export class SlotTakenError extends Error {
  constructor() {
    super("Esse horário acabou de ser ocupado. Escolha outro horário.");
    this.name = "SlotTakenError";
  }
}

/** Traduz os códigos das RPCs de sugestão (0030) — o app não mostra texto cru do banco. */
function sugestaoError(message: string | undefined, fallback: string): Error {
  const m = message ?? "";
  if (m.includes("slot_taken")) return new SlotTakenError();
  if (m.includes("no_credits")) return new Error("Você não tem aulas restantes para aceitar este horário. Peça mais aulas.");
  if (m.includes("suggestion_expired")) return new Error("O horário sugerido já passou. Escolha outro horário.");
  if (m.includes("suggestion_not_available")) return new Error("Essa sugestão não está mais disponível.");
  return new Error(fallback);
}

/**
 * Aceite, recusa e desfazer da sugestão passam por RPC (0030). Antes eram UPDATE direto em
 * `bookings` e NUNCA funcionaram: a policy de UPDATE do aluno só alcança aula `scheduled`, e uma
 * aula com sugestão está `rejected_with_suggestion` — o UPDATE afetava 0 linhas, sem erro.
 */
export async function acceptSuggestion(bookingId: string) {
  const { error } = await client().rpc("aceitar_sugestao", { p_booking_id: bookingId });
  if (error) throw sugestaoError(error.message, "Não foi possível aceitar o novo horário. Tente de novo em instantes.");
}

/** O aluno diz "não" ao horário sugerido; a aula fica `rejected` e o horário sugerido fica guardado pro desfazer. */
export async function declineSuggestion(bookingId: string) {
  const { error } = await client().rpc("recusar_sugestao", { p_booking_id: bookingId });
  if (error) throw sugestaoError(error.message, "Não foi possível recusar o horário. Tente de novo em instantes.");
}

/** Desfaz a recusa — o banco usa o horário sugerido que já guardou, o cliente não manda nenhum. */
export async function restoreSuggestion(bookingId: string) {
  const { error } = await client().rpc("desfazer_recusa_sugestao", { p_booking_id: bookingId });
  if (error) throw sugestaoError(error.message, "Não foi possível desfazer.");
}

// ---------------------------------------------------------------------------
// student · histórico / detalhe
// ---------------------------------------------------------------------------

export async function getStudentBookingHistory(
  profileId: string,
  tab: "proximas" | "anteriores" | "todas",
): Promise<Booking[]> {
  const studentId = await studentIdForProfile(profileId);
  // "proximas" precisa da mais próxima primeiro (ascendente); "anteriores"/"todas" continuam como
  // sempre foram, mais recente primeiro (descendente) — bug real corrigido aqui (2026-09-08): as
  // três abas reusavam a MESMA ordem descendente, então "proximas" mostrava a aula mais DISTANTE
  // no topo em vez da mais próxima.
  const { data, error } = await client()
    .from("bookings")
    .select("*")
    .eq("student_id", studentId)
    .or(SEM_DESCARTE_DE_REGENERACAO)
    .order("start_time", { ascending: tab === "proximas" });
  if (error) throw new Error(error.message);
  const now = Date.now();
  return (data ?? [])
    .filter((r) => {
      const isFuture = new Date(r.start_time).getTime() > now;
      // "Próximas" é o que ainda vai acontecer: uma aula cancelada não vai. Nas abas de histórico,
      // cancelamento pelo professor CONTINUA aparecendo — é um fato que o aluno viveu; só o
      // descarte por regeneração some (filtrado na query acima), porque nunca foi compromisso.
      if (tab === "proximas") return isFuture && r.status !== "cancelled";
      if (tab === "anteriores") return !isFuture;
      return true;
    })
    .map(mapBooking);
}

/**
 * The professor's name is not readable from `profiles` by a student (RLS), so it comes from the
 * `booking_history_app` view, which joins it server-side. Falls back to the plain row.
 */
/**
 * Mesmo arranjo de `getAdminBookingDetail`: a aula vem da TABELA (a view `booking_history_app` é
 * anterior às colunas de recorrência — ler a aula dali devolvia `pacoteId`/`replacementForBookingId`
 * nulos, e a tela não sabia que era aula de recorrência nem pedido de remarcação). Da view só o nome
 * do professor, que ela resolve server-side (o aluno não lê `profiles` do professor).
 */
export async function getBookingDetail(bookingId: string): Promise<{ booking: Booking; adminName: string | null } | undefined> {
  const [viewRes, rowRes] = await Promise.all([
    client().from("booking_history_app").select("admin_name").eq("id", bookingId).maybeSingle(),
    client().from("bookings").select("*").eq("id", bookingId).maybeSingle(),
  ]);
  if (rowRes.error) throw new Error(rowRes.error.message);
  if (!rowRes.data) return undefined;
  return { booking: mapBooking(rowRes.data), adminName: viewRes.data?.admin_name ?? null };
}

// ---------------------------------------------------------------------------
// student · pedido de remarcação (0033)
// ---------------------------------------------------------------------------

function remarcacaoError(message: string | undefined, fallback: string): Error {
  const m = message ?? "";
  if (m.includes("slot_taken")) return new SlotTakenError();
  if (m.includes("too_late")) return new Error("Só dá para pedir outro horário até 24 horas antes da aula.");
  if (m.includes("request_already_pending")) return new Error("Você já tem um pedido de remarcação esperando o professor.");
  if (m.includes("invalid_time")) return new Error("Escolha uma hora cheia entre 6h e 22h, com pelo menos 24 horas de antecedência.");
  if (m.includes("request_not_pending")) return new Error("Esse pedido não está mais pendente.");
  if (m.includes("original_not_scheduled")) return new Error("A aula original mudou nesse meio-tempo e não pode mais ser remarcada.");
  if (m.includes("not_recurrence") || m.includes("not_scheduled")) return new Error("Esta aula não pode ser remarcada por aqui.");
  return new Error(fallback);
}

/** Horas cheias livres do professor no dia (yyyy-MM-dd, horário de São Paulo), pra remarcar `bookingId`. */
export async function getHorariosLivresRemarcacao(bookingId: string, dia: string): Promise<string[]> {
  const { data, error } = await client().rpc("horarios_livres_remarcacao", { p_booking_id: bookingId, p_dia: dia });
  if (error) throw remarcacaoError(error.message, "Não foi possível carregar os horários.");
  return ((data ?? []) as { inicio: string }[]).map((r) => r.inicio);
}

export async function pedirRemarcacao(bookingId: string, novoInicio: string) {
  const { error } = await client().rpc("pedir_remarcacao", { p_booking_id: bookingId, p_novo_inicio: novoInicio });
  if (error) throw remarcacaoError(error.message, "Não foi possível enviar o pedido.");
}

export async function cancelarPedidoRemarcacao(pedidoId: string) {
  const { error } = await client().rpc("cancelar_pedido_remarcacao", { p_pedido_id: pedidoId });
  if (error) throw remarcacaoError(error.message, "Não foi possível cancelar o pedido.");
}

/** Pedido de remarcação pendente desta aula (no máximo um — regra da 0033), ou null. */
export async function getPedidoRemarcacaoPendente(bookingId: string): Promise<Booking | null> {
  const { data, error } = await client()
    .from("bookings")
    .select("*")
    .eq("replacement_for_booking_id", bookingId)
    .eq("status", "pending_confirmation")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapBooking(data) : null;
}

/** Mesma view, do lado do professor: já traz o nome do aluno resolvido. */
/**
 * O booking vem sempre da TABELA, não da view: `booking_history_app` é anterior às colunas de
 * RECORRENCIA (0011) e não as expõe, então ler dali devolveria `cadeiaId`/`pacoteId` nulos. Da view
 * aproveitamos só o `student_name`, que ela resolve server-side (RLS impede o join no cliente).
 *
 * `remarcacoes` = "quantas vezes esta aula já foi remarcada" = linhas da cadeia menos 1
 * (CLAUDE.md). Uma aula nunca remarcada tem 1 linha na cadeia e devolve 0.
 */
export async function getAdminBookingDetail(
  bookingId: string,
): Promise<
  | { booking: Booking; studentName: string; remarcacoes: number; vinculo: VinculoAula | null; antecessorInicio: string | null }
  | undefined
> {
  const [viewRes, rowRes] = await Promise.all([
    client().from("booking_history_app").select("*").eq("id", bookingId).maybeSingle(),
    client().from("bookings").select("*").eq("id", bookingId).maybeSingle(),
  ]);
  if (rowRes.error) throw new Error(rowRes.error.message);
  if (!rowRes.data) return undefined;

  const studentName = (!viewRes.error && viewRes.data?.student_name) || "Aluno";
  const cadeiaId = rowRes.data.cadeia_id as string | null;
  let remarcacoes = 0;
  if (cadeiaId) {
    // Sem o pedido de remarcação ainda pendente (0033: ele entra na cadeia ao ser pedido): contá-lo
    // mostrava "Remarcada 1x" antes de o professor aprovar qualquer coisa.
    const { count, error } = await client()
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("cadeia_id", cadeiaId)
      .neq("status", "pending_confirmation");
    if (error) throw new Error(error.message);
    remarcacoes = Math.max((count ?? 1) - 1, 0);
  }

  const antecessorId = rowRes.data.replacement_for_booking_id as string | null;
  const antes = antecessorId ? (await antecessores([antecessorId])).get(antecessorId) : undefined;
  const vinculo = antecessorId ? (antes?.vinculo ?? "reposicao") : null;

  // antecessorInicio: num pedido de remarcação, o horário original — pra tela mostrar "de → para".
  return { booking: mapBooking(rowRes.data), studentName, remarcacoes, vinculo, antecessorInicio: antes?.inicio ?? null };
}

/** Etapa 6 — remarcar não edita a aula: marca a original como `rescheduled` e cria a sucessora. */
export async function reagendarAula(bookingId: string, novoInicio: string, novoFim: string): Promise<string> {
  const { data, error } = await client().rpc("reagendar_aula", {
    p_booking_id: bookingId,
    p_novo_inicio: novoInicio,
    p_novo_fim: novoFim,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Etapa 6 — cancelar exige o motivo, porque ele muda o crédito: por aluno consome (se o pacote
 * cobra falta), por professor nunca consome. `'regeneracao'` não é opção — é valor interno da
 * regeneração de pacote, e a própria RPC rejeita.
 */
export async function cancelarAula(bookingId: string, canceladoPor: "professor" | "aluno") {
  const { error } = await client().rpc("cancelar_aula", {
    p_booking_id: bookingId,
    p_cancelado_por: canceladoPor,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// student · solicitações
// ---------------------------------------------------------------------------

export async function requestPackage(templateId: string, notes?: string) {
  const { error } = await client().rpc("request_package", { p_template_id: templateId, p_notes: notes ?? null });
  if (error) throw new Error(error.message);
}

/** A single class has no template: `request_single_class` only records the intent. */
export async function requestSingleClass(notes?: string) {
  const { error } = await client().rpc("request_single_class", { p_notes: notes ?? null });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// admin · dashboard
// ---------------------------------------------------------------------------

/**
 * Não é mais chamada automaticamente (era ela quem auto-completava aulas passadas, sem
 * declaração do professor, e podia travar inteira por causa de uma exceção — ver
 * supabase/README.md). Mantida por enquanto: nada no banco depende dela e ela pode voltar a ser
 * útil como uma ação manual/administrativa no futuro.
 */
export async function reconcileBookingStatuses() {
  const { error } = await client().rpc("reconcile_booking_statuses");
  if (error) throw new Error(error.message);
}

/**
 * Configuração básica do professor. Sem aluno: vira o "Comece por aqui". Com aluno: o que ainda
 * faltar aparece em "Resolver agora" — antes a lista sumia no primeiro aluno, mesmo sem WhatsApp
 * (e sem WhatsApp o aluno não vê o botão "Falar com o professor").
 */
export interface PrimeirosPassos {
  /** Tem horário publicado daqui pra frente (sem isso ninguém agenda no autosserviço). */
  horarios: boolean;
  pacotes: boolean;
  whatsapp: boolean;
  /** Horários e pacotes só importam no autosserviço — na recorrência quem marca é o professor. */
  modo: ModoAgendamento;
}

export async function getAdminDashboard(adminId: string) {
  const nowIso = new Date().toISOString();
  const { startIso, endIso } = dayBoundsUtcIso(new Date());

  const [students, todayRes, pendingRes, nextRes, awaitingRes, pedidosRes] = await Promise.all([
    adminStudents(adminId),
    // A agenda de HOJE inteira (inclusive o que já passou), sem o que não vai acontecer: cancelada,
    // remarcada (a sucessora é que vale) e recusada.
    client()
      .from("bookings")
      .select("*")
      .eq("admin_id", adminId)
      .not("status", "in", "(cancelled,rescheduled,rejected,rejected_with_suggestion)")
      .gte("start_time", startIso)
      .lt("start_time", endIso)
      .order("start_time", { ascending: true }),
    client().from("bookings").select("*").eq("admin_id", adminId).eq("status", "pending_confirmation").order("start_time"),
    // Próxima aula depois de hoje — pro "Dia livre" e pro fim do dia ("Próxima aula: amanhã…").
    client()
      .from("bookings")
      .select("*")
      .eq("admin_id", adminId)
      .in("status", ACTIVE_STATUSES)
      .gte("start_time", endIso)
      .order("start_time", { ascending: true })
      .limit(1),
    // scheduled + horário já passou: não vira "completed" sozinha (ver reconcileBookingStatuses
    // acima) — fica visível aqui até o professor confirmar o que aconteceu.
    client()
      .from("bookings")
      .select("*")
      .eq("admin_id", adminId)
      .eq("status", "scheduled")
      .lt("end_time", nowIso)
      .order("start_time", { ascending: true }),
    client()
      .from("purchase_requests")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", adminId)
      .eq("status", "pending"),
  ]);
  if (todayRes.error) throw new Error(todayRes.error.message);
  if (pendingRes.error) throw new Error(pendingRes.error.message);
  if (nextRes.error) throw new Error(nextRes.error.message);
  if (awaitingRes.error) throw new Error(awaitingRes.error.message);
  if (pedidosRes.error) throw new Error(pedidosRes.error.message);

  const byId = new Map(students.map((s) => [s.id, s]));
  const nameOf = (studentId: string) => byId.get(studentId)?.name ?? "Aluno";
  const comNome = (r: any) => ({ ...mapBooking(r), studentName: nameOf(r.student_id) });
  const [atRisk, antesPendentes, primeirosPassos] = await Promise.all([
    alunosEmRisco(students),
    antecessores((pendingRes.data ?? []).map((r) => r.replacement_for_booking_id)),
    getPrimeirosPassos(adminId),
  ]);

  return {
    activeStudents: students.length,
    today: (todayRes.data ?? []).map(comNome),
    nextAfterToday: nextRes.data?.[0] ? comNome(nextRes.data[0]) : null,
    pending: (pendingRes.data ?? []).map((r) => ({
      ...comNome(r),
      antecessorInicio: r.replacement_for_booking_id ? (antesPendentes.get(r.replacement_for_booking_id)?.inicio ?? null) : null,
    })),
    awaitingConfirmation: (awaitingRes.data ?? []).map(comNome),
    purchaseRequests: pedidosRes.count ?? 0,
    atRisk,
    /** Só quando o professor ainda não tem aluno. */
    primeirosPassos,
  };
}

/** Três checagens baratas (count sem trazer linha) pro "Comece por aqui". */
async function getPrimeirosPassos(adminId: string): Promise<PrimeirosPassos> {
  const [slotsRes, templatesRes, settings] = await Promise.all([
    client()
      .from("availability_slots")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", adminId)
      .eq("is_active", true)
      .gte("start_time", new Date().toISOString()),
    client().from("package_templates").select("id", { count: "exact", head: true }).eq("admin_id", adminId).eq("is_active", true),
    getAdminSettings(adminId),
  ]);
  if (slotsRes.error) throw new Error(slotsRes.error.message);
  if (templatesRes.error) throw new Error(templatesRes.error.message);
  return {
    horarios: (slotsRes.count ?? 0) > 0,
    pacotes: (templatesRes.count ?? 0) > 0,
    whatsapp: !!settings?.whatsapp,
    modo: settings?.modoAgendamento ?? "autosservico",
  };
}

/** Quantas aulas restantes no pacote disparam o alerta (CLAUDE.md: "restarem 2 ou menos"). */
const RISCO_AULAS_RESTANTES = 2;
/** Faltas seguidas, nas aulas mais recentes, que disparam o alerta (decisão do Lucas, 2026-09-28). */
const RISCO_FALTAS_SEGUIDAS = 2;

export interface AlunoEmRisco {
  student: StudentRecord;
  /** Frase pronta pro professor ("Restam 2 aulas no pacote", "2 faltas seguidas"...). */
  motivo: string;
  /** Sem aula nenhuma (ou sem pacote): mais urgente que "restam poucas". */
  grave: boolean;
}

/**
 * "Aluno em risco" (decisão do Lucas, 2026-09-28): pacote acabando OU faltando muito.
 *
 * Pacote acabando = aulas RESTANTES no pacote (total − usadas), não "créditos para agendar". A conta
 * antiga (`creditsByStudent` <= 1) desconta as aulas já marcadas — na recorrência todas as aulas
 * restantes já nascem marcadas, então dava 0 pra TODO aluno de recorrência e o painel pintava
 * todos de vermelho "Sem créditos" (mesmo problema já registrado no CLAUDE.md pro cartão do aluno).
 * Pacote de recorrência lê `saldo_pacotes` (a autoridade — decisão 4), não o `used_classes`
 * materializado. A aula experimental não conta como pacote.
 *
 * Faltando muito = as RISCO_FALTAS_SEGUIDAS aulas mais recentes (concluídas ou faltas) foram faltas.
 */
async function alunosEmRisco(students: StudentRecord[]): Promise<AlunoEmRisco[]> {
  if (students.length === 0) return [];
  const ids = students.map((s) => s.id);
  const desde = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
  const [pkgRes, aulasRes] = await Promise.all([
    client()
      .from("packages")
      .select("id, student_id, total_classes, used_classes, origin")
      .in("student_id", ids)
      .eq("status", "active")
      .neq("origin", "trial"),
    client()
      .from("bookings")
      .select("student_id, status, start_time")
      .in("student_id", ids)
      .in("status", ["completed", "no_show"])
      .gte("start_time", desde)
      .order("start_time", { ascending: false }),
  ]);
  if (pkgRes.error) throw new Error(pkgRes.error.message);
  if (aulasRes.error) throw new Error(aulasRes.error.message);

  const recIds = (pkgRes.data ?? []).filter((p) => p.origin === "recurrence").map((p) => p.id);
  const saldoRes = recIds.length
    ? await client().from("saldo_pacotes").select("pacote_id, restantes").in("pacote_id", recIds)
    : { data: [], error: null };
  if (saldoRes.error) throw new Error(saldoRes.error.message);
  const restantesRec = new Map((saldoRes.data ?? []).map((r) => [r.pacote_id as string, r.restantes as number]));

  const restantes = new Map<string, number>();
  for (const p of pkgRes.data ?? []) {
    const r = p.origin === "recurrence" ? (restantesRec.get(p.id) ?? 0) : Math.max(0, p.total_classes - p.used_classes);
    restantes.set(p.student_id, (restantes.get(p.student_id) ?? 0) + r);
  }

  const ultimas = new Map<string, string[]>();
  for (const a of aulasRes.data ?? []) {
    const list = ultimas.get(a.student_id) ?? [];
    if (list.length < RISCO_FALTAS_SEGUIDAS) ultimas.set(a.student_id, [...list, a.status]);
  }

  const out: AlunoEmRisco[] = [];
  for (const student of students) {
    const motivos: string[] = [];
    let grave = false;
    const r = restantes.get(student.id);
    if (r === undefined) {
      motivos.push("Sem pacote ativo");
      grave = true;
    } else if (r === 0) {
      motivos.push("Sem aulas no pacote");
      grave = true;
    } else if (r <= RISCO_AULAS_RESTANTES) {
      motivos.push(r === 1 ? "Resta 1 aula no pacote" : `Restam ${r} aulas no pacote`);
    }
    const u = ultimas.get(student.id) ?? [];
    if (u.length === RISCO_FALTAS_SEGUIDAS && u.every((s) => s === "no_show")) {
      motivos.push(`${RISCO_FALTAS_SEGUIDAS} faltas seguidas`);
    }
    if (motivos.length) out.push({ student, motivo: motivos.join(" · "), grave });
  }
  // Mais urgente primeiro; dentro do grupo, por nome.
  return out.sort((a, b) => Number(b.grave) - Number(a.grave) || a.student.name.localeCompare(b.student.name));
}

// ---------------------------------------------------------------------------
// admin · agenda (timeline)
// ---------------------------------------------------------------------------

/**
 * Toda aula `scheduled` cujo horário já passou (aguardando confirmação), sem limite de quantos
 * dias atrás — mesma condição de `awaitingRes` em `getAdminDashboard`, extraída pra cá porque a
 * Agenda também precisa dela: marcar visualmente, na semana visível, quais dias têm pendência
 * (CLAUDE.md, "Agenda com navegação livre"), e o banner do Dashboard precisa da mais antiga (`[0]`,
 * já vem ordenada por `start_time` ascendente) pra navegar direto pra ela.
 */
/** Pedidos ainda sem resposta do professor (novo horário ou remarcação) — pra marcar os dias na Agenda. */
export async function getPedidosPendentes(adminId: string): Promise<Booking[]> {
  const { data, error } = await client()
    .from("bookings")
    .select("*")
    .eq("admin_id", adminId)
    .eq("status", "pending_confirmation")
    .order("start_time", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapBooking);
}

export async function getAwaitingConfirmationBookings(adminId: string): Promise<Booking[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await client()
    .from("bookings")
    .select("*")
    .eq("admin_id", adminId)
    .eq("status", "scheduled")
    .lt("end_time", nowIso)
    .order("start_time", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapBooking);
}

export interface TimelineEntry {
  hour: string;
  free: boolean;
  booking?: Booking;
  studentName?: string;
  /** Só quando a aula tem antecessor — ver `antecessores`. */
  vinculo?: VinculoAula | null;
  /** Horário da aula original — mostrado num pedido de remarcação ("de ... para ..."). */
  antecessorInicio?: string | null;
}

/**
 * Remarcação e reposição são o MESMO mecanismo no banco (decisão 2): as duas são "esta linha
 * substitui aquela". O que as distingue é como o ANTECESSOR terminou — `rescheduled` (o professor
 * moveu a aula) ou `no_show`/`cancelled` (o aluno perdeu a aula e esta é a reposição). Antes disso
 * a tela chamava as duas de "Reposição", porque só olhava `is_replacement`.
 */
/**
 * `pedido_remarcacao` (0033): o antecessor ainda está `scheduled` — só acontece quando o aluno pediu
 * pra remarcar e o professor ainda não decidiu (um sucessor "normal" só nasce depois de a original
 * virar rescheduled/no_show/cancelled).
 */
export type VinculoAula = "remarcacao" | "reposicao" | "pedido_remarcacao";

export const VINCULO_LABEL: Record<VinculoAula, string> = {
  remarcacao: "Remarcada",
  reposicao: "Reposição",
  pedido_remarcacao: "Pedido de remarcação",
};

/**
 * Resolve o vínculo de várias aulas de uma vez, indexado pelo id do ANTECESSOR. Uma consulta só
 * para a tela inteira — nunca uma por linha. O antecessor quase nunca está no conjunto já
 * carregado (remarcar é justamente mover a aula para outro dia), então ele precisa ser buscado.
 */
async function antecessores(
  antecessorIds: (string | null | undefined)[],
): Promise<Map<string, { vinculo: VinculoAula; inicio: string }>> {
  const ids = Array.from(new Set(antecessorIds.filter((id): id is string => !!id)));
  const out = new Map<string, { vinculo: VinculoAula; inicio: string }>();
  if (ids.length === 0) return out;
  const { data, error } = await client().from("bookings").select("id, status, start_time").in("id", ids);
  if (error) throw new Error(error.message);
  for (const r of data ?? [])
    out.set(r.id, {
      vinculo: r.status === "rescheduled" ? "remarcacao" : r.status === "scheduled" ? "pedido_remarcacao" : "reposicao",
      inicio: r.start_time,
    });
  return out;
}

export async function getAdminAgendaForDay(adminId: string, date: Date): Promise<TimelineEntry[]> {
  const { startIso, endIso } = dayBoundsUtcIso(date);
  const [slotsRes, bookingsRes, students] = await Promise.all([
    client()
      .from("availability_slots")
      .select("start_time")
      .eq("admin_id", adminId)
      .eq("is_active", true)
      .gte("start_time", startIso)
      .lt("start_time", endIso),
    client()
      .from("bookings")
      .select("*")
      .eq("admin_id", adminId)
      // `rescheduled` sai junto com `cancelled`: a aula foi MOVIDA, não vai acontecer nesse
      // horário — deixá-la aqui mantinha o horário antigo ocupado na agenda do professor depois
      // de remarcar. A linha continua existindo como registro, só não bloqueia mais a hora.
      // Recusadas também saem: o pedido não vai acontecer, e o horário pode ter sido pedido de novo
      // por outro aluno — como a agenda mostra UMA aula por hora, a recusada podia esconder a aula
      // de verdade daquele horário.
      .not("status", "in", "(cancelled,rescheduled,rejected,rejected_with_suggestion)")
      .gte("start_time", startIso)
      .lt("start_time", endIso),
    adminStudents(adminId),
  ]);
  if (slotsRes.error) throw new Error(slotsRes.error.message);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);

  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const bookings = bookingsRes.data ?? [];
  const antes = await antecessores(bookings.map((b) => b.replacement_for_booking_id));

  const hours = new Set<number>();
  for (const s of slotsRes.data ?? []) hours.add(brtHour(s.start_time));
  for (const b of bookings) hours.add(brtHour(b.start_time));

  return Array.from(hours)
    .sort((a, b) => a - b)
    .map((h) => {
      // Se sobrar mais de uma na mesma hora (ex.: uma concluída e outra agendada), a que ainda vai
      // acontecer ou pede ação ganha o lugar.
      const daHora = bookings.filter((b) => brtHour(b.start_time) === h);
      const booking = daHora.find((b) => ACTIVE_STATUSES.includes(b.status)) ?? daHora[0];
      if (!booking) return { hour: hhmm(h), free: true };
      return {
        hour: hhmm(h),
        free: false,
        booking: mapBooking(booking),
        studentName: nameOf.get(booking.student_id) ?? "Aluno",
        vinculo: booking.replacement_for_booking_id
          ? (antes.get(booking.replacement_for_booking_id)?.vinculo ?? "reposicao")
          : null,
        antecessorInicio: booking.replacement_for_booking_id
          ? (antes.get(booking.replacement_for_booking_id)?.inicio ?? null)
          : null,
      };
    });
}

/**
 * Um pendente com antecessor é um PEDIDO DE REMARCAÇÃO do aluno (0033), não um agendamento novo.
 * Aprovar/recusar precisa passar pela RPC: só mudar o status deixaria a aula original E a nova
 * agendadas ao mesmo tempo (aprovar), ou o pedido recusado pendurado na cadeia e o saldo errado
 * (recusar).
 */
async function isPedidoRemarcacao(bookingId: string): Promise<boolean> {
  const { data, error } = await client()
    .from("bookings")
    .select("status, replacement_for_booking_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.status === "pending_confirmation" && !!data.replacement_for_booking_id;
}

export async function approveBooking(bookingId: string) {
  if (await isPedidoRemarcacao(bookingId)) {
    const { error } = await client().rpc("aprovar_remarcacao", { p_pedido_id: bookingId });
    if (error) throw remarcacaoError(error.message, "Não foi possível aprovar a remarcação.");
    return;
  }
  const { data, error } = await client()
    .from("bookings")
    .update({ status: "scheduled" })
    .eq("id", bookingId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapBooking(data);
}

/**
 * Desfaz a aprovação de um agendamento comum (não de remarcação): volta a aula a "aguardando
 * aprovação". Só age se ela continuar `scheduled` e sem antecessor.
 */
export async function devolverParaPendente(bookingId: string) {
  const { data, error } = await client()
    .from("bookings")
    .update({ status: "pending_confirmation" })
    .eq("id", bookingId)
    .eq("status", "scheduled")
    .is("replacement_for_booking_id", null)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("Não foi possível desfazer. A aula já mudou.");
}

export async function rejectBooking(bookingId: string, note: string, suggestedStart?: string | null, suggestedEnd?: string | null) {
  if (await isPedidoRemarcacao(bookingId)) {
    // Num pedido de remarcação não cabe "sugerir outro horário": a aula original continua valendo
    // e o aluno pode pedir outro. A sugestão, se vier, é ignorada; a observação vai junto.
    const { error } = await client().rpc("recusar_remarcacao", { p_pedido_id: bookingId, p_nota: note || null });
    if (error) throw remarcacaoError(error.message, "Não foi possível recusar a remarcação.");
    return;
  }
  const withSuggestion = !!(suggestedStart && suggestedEnd);
  const { data, error } = await client()
    .from("bookings")
    .update({
      status: withSuggestion ? "rejected_with_suggestion" : "rejected",
      teacher_note: note || null,
      suggested_start_time: suggestedStart ?? null,
      suggested_end_time: suggestedEnd ?? null,
    })
    .eq("id", bookingId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapBooking(data);
}

/** Both RPCs consume (or not) a package credit according to `profiles.no_show_consumes_class`. */
export async function completeBooking(bookingId: string) {
  const { error } = await client().rpc("complete_booking", { p_booking_id: bookingId });
  if (error) throw new Error(error.message);
}

export async function markNoShow(bookingId: string) {
  const { error } = await client().rpc("mark_no_show", { p_booking_id: bookingId });
  if (error) throw new Error(error.message);
}

export interface RegraDeConsumo {
  /** Marcar falta desconta 1 aula do aluno? */
  falta: boolean;
  /** Cancelar dizendo que foi o aluno desconta 1 aula? */
  cancelamentoPeloAluno: boolean;
  /** De onde veio a regra — a janela diz isso ao professor. */
  origem: "pacote" | "configuracao" | "reposicao" | "sem_pacote";
}

/**
 * O que a falta (ou o cancelamento pelo aluno) faz com a aula do aluno — a MESMA regra que o banco
 * aplica, pra janela de confirmação não prometer outra coisa. Antes a janela lia só a configuração
 * do professor, mas numa aula de pacote de recorrência quem manda é a regra gravada no pacote no dia
 * em que ele foi criado (decisão 3 do CLAUDE.md) — se o professor mudou a configuração depois, a
 * janela dizia o contrário do que acontecia.
 * - Aula com `pacote_id`: `coalesce(pacote.falta_consome_credito, configuração)` pros dois casos
 *   (`calcular_saldo_pacote`, 0013).
 * - Sem pacote (autosserviço): falta segue a configuração, reposição nunca desconta
 *   (`mark_no_show`, 0020); cancelar nunca desconta (`cancelar_aula` não lança nada no ledger).
 */
export async function getRegraDeConsumo(booking: Booking, padraoDoProfessor: boolean): Promise<RegraDeConsumo> {
  if (booking.pacoteId) {
    const { data, error } = await client()
      .from("packages")
      .select("falta_consome_credito")
      .eq("id", booking.pacoteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const snapshot = data?.falta_consome_credito as boolean | null | undefined;
    const consome = snapshot ?? padraoDoProfessor;
    return { falta: consome, cancelamentoPeloAluno: consome, origem: snapshot == null ? "configuracao" : "pacote" };
  }
  if (booking.isReplacement) return { falta: false, cancelamentoPeloAluno: false, origem: "reposicao" };
  return { falta: padraoDoProfessor, cancelamentoPeloAluno: false, origem: "sem_pacote" };
}

/**
 * Reverte a conclusão/falta mais recente ainda não revertida desta aula: status volta a
 * `scheduled` e, se havia consumido crédito, o ledger recebe um `undo` referenciado à transação
 * original (nunca apaga o histórico). Sem janela de tempo — continua válido enquanto a aula
 * seguir `completed`/`no_show`.
 */
export async function undoLessonAction(bookingId: string) {
  const { error } = await client().rpc("undo_lesson_action", { p_booking_id: bookingId });
  if (error) throw new Error(error.message);
}

/**
 * Marca `bookingId` como reposição de `replacesBookingId`: nunca cobra crédito novo dessa aula, e
 * estorna a cobrança da aula original (se ainda não tiver sido estornada). Aulas do próprio aluno,
 * ainda não marcadas.
 */
export async function markAsReplacement(bookingId: string, replacesBookingId: string) {
  const { error } = await client().rpc("mark_as_replacement", {
    p_booking_id: bookingId,
    p_replaces_booking_id: replacesBookingId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Aulas do aluno que podem ser "a aula original" de uma reposição — canceladas ou faltas, mais
 * recentes primeiro.
 *
 * O filtro é por MOTIVO, não por status: cancelamento real pelo professor É reponível
 * legitimamente (o aluno perdeu uma aula que ia acontecer). O que não pode entrar é a aula
 * descartada por uma regeneração de pacote — ela foi substituída por outra na grade nova, nunca
 * houve o que repor.
 */
export async function getReplaceableBookingsForStudent(studentId: string): Promise<Booking[]> {
  const { data, error } = await client()
    .from("bookings")
    .select("*")
    .eq("student_id", studentId)
    .in("status", ["no_show", "cancelled"])
    .or(SEM_DESCARTE_DE_REGENERACAO)
    .order("start_time", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapBooking);
}

// ---------------------------------------------------------------------------
// admin · alunos
// ---------------------------------------------------------------------------

/** Mesma lista do painel ("Alunos em risco"), completa — pro filtro "Em risco" da lista de alunos. */
export async function getAlunosEmRisco(adminId: string): Promise<AlunoEmRisco[]> {
  return alunosEmRisco(await adminStudents(adminId));
}

/**
 * Lista de alunos do professor. O número de cada aluno é AULAS RESTANTES nos pacotes ativos (total −
 * usadas), não "créditos para agendar": essa conta desconta as aulas já marcadas, e na recorrência
 * todas as restantes nascem marcadas — todo aluno de recorrência aparecia com 0 em vermelho (mesmo
 * problema já corrigido no cartão do aluno e em "Alunos em risco"). Pacote de recorrência lê
 * `saldo_pacotes` (a autoridade, decisão 4), não o `used_classes` materializado.
 */
export async function getAdminStudents(adminId: string, search: string) {
  const students = await adminStudents(adminId);
  const ids = students.map((s) => s.id);
  const pkgRes = ids.length
    ? await client().from("packages").select("*").in("student_id", ids).eq("status", "active")
    : ({ data: [], error: null } as const);
  if (pkgRes.error) throw new Error(pkgRes.error.message);
  const pkgs = pkgRes.data ?? [];

  const recIds = pkgs.filter((p) => p.origin === "recurrence").map((p) => p.id as string);
  const saldoRes = recIds.length
    ? await client().from("saldo_pacotes").select("pacote_id, consumidas, restantes").in("pacote_id", recIds)
    : { data: [], error: null };
  if (saldoRes.error) throw new Error(saldoRes.error.message);
  const saldo = new Map((saldoRes.data ?? []).map((r) => [r.pacote_id as string, r as { consumidas: number; restantes: number }]));

  const restantes = new Map<string, number>();
  const pkgByStudent = new Map<string, PackageRecord>();
  for (const row of pkgs) {
    const s = row.origin === "recurrence" ? saldo.get(row.id) : undefined;
    const r = s ? s.restantes : Math.max(0, row.total_classes - row.used_classes);
    restantes.set(row.student_id, (restantes.get(row.student_id) ?? 0) + r);
    // O pacote que aparece no subtítulo: o pago/recorrência antes da experimental (os dois podem
    // estar ativos juntos). Na recorrência, "usadas" vem do saldo, não da cópia materializada.
    const pkg = { ...mapPackage(row), usedClasses: s ? s.consumidas : row.used_classes };
    const atual = pkgByStudent.get(row.student_id);
    if (!atual || atual.origin === "trial") pkgByStudent.set(row.student_id, pkg);
  }

  const q = search.trim().toLowerCase();
  return students
    .map((student) => ({
      student,
      /** null = sem pacote ativo. */
      restantes: restantes.has(student.id) ? restantes.get(student.id)! : null,
      package: pkgByStudent.get(student.id) ?? null,
    }))
    .filter((e) => !q || e.student.name.toLowerCase().includes(q));
}

export async function getAdminStudentDetail(studentId: string) {
  const { data: row, error } = await client()
    .from("students")
    .select("id, profile_id, admin_id, created_at")
    .eq("id", studentId)
    .single();
  if (error) throw new Error(error.message);

  const agoraIso = new Date().toISOString();
  const [names, pkg, credits, proximasRes, anterioresRes, completedRes, noShowRes] = await Promise.all([
    profileNames([row.profile_id]),
    activePackageForStudentRow(studentId),
    creditsAvailableFor(studentId),
    // Duas janelas de exibição (não base de cálculo — ver os dois counts abaixo): as PRÓXIMAS (que ainda vão
    // acontecer, da mais próxima) e as ANTERIORES (da mais recente). Antes era uma janela só, das 6 mais "novas"
    // por data, que com recorrência era composta só de aulas futuras sob o título "Últimas aulas".
    client()
      .from("bookings")
      .select("*")
      .eq("student_id", studentId)
      .in("status", ["scheduled", "pending_confirmation"])
      .gte("end_time", agoraIso)
      .order("start_time", { ascending: true })
      .limit(3),
    client()
      .from("bookings")
      .select("*")
      .eq("student_id", studentId)
      .or(SEM_DESCARTE_DE_REGENERACAO)
      .lt("end_time", agoraIso)
      .order("start_time", { ascending: false })
      .limit(3),
    // Frequência/faltas contam sobre TODAS as aulas que aconteceram, não sobre a janela de 6:
    // com recorrência, essa janela é composta só de aulas FUTURAS `scheduled` (ordem descendente
    // por start_time), o que zerava a frequência de qualquer aluno em recorrência. `count` com
    // `head: true` não transfere linha nenhuma. Descarte de regeneração é `cancelled`, então não
    // entra em nenhum dos dois filtros de status — não precisa do `.or` aqui.
    client()
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("status", "completed"),
    client()
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("status", "no_show"),
  ]);
  if (proximasRes.error) throw new Error(proximasRes.error.message);
  if (anterioresRes.error) throw new Error(anterioresRes.error.message);
  if (completedRes.error) throw new Error(completedRes.error.message);
  if (noShowRes.error) throw new Error(noShowRes.error.message);

  const student: StudentRecord = {
    id: row.id,
    profileId: row.profile_id,
    adminId: row.admin_id,
    createdAt: row.created_at,
    name: names[row.profile_id] ?? "Aluno",
  };
  return {
    student,
    package: pkg,
    credits,
    proximas: (proximasRes.data ?? []).map(mapBooking),
    anteriores: (anterioresRes.data ?? []).map(mapBooking),
    completedCount: completedRes.count ?? 0,
    noShowCount: noShowRes.count ?? 0,
  };
}

export async function assignPackageFromTemplate(studentId: string, templateId: string) {
  const { error } = await client().rpc("assign_package_from_template", {
    p_student_id: studentId,
    p_template_id: templateId,
  });
  if (error) throw new Error(error.message);
}

export async function removeActivePackage(studentId: string) {
  const { error } = await client().rpc("remove_active_package", { p_student_id: studentId });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// admin · recorrência (RECORRENCIA, Etapa 5 — CLAUDE.md)
// ---------------------------------------------------------------------------

/**
 * `temUso` (CLAUDE.md, "excluir dia fixo de recorrência"): true se existe QUALQUER booking ou
 * package — em qualquer status, inclusive cancelled/regeneracao — com esse recorrencia_id. Sem
 * filtro de status de propósito: rastreabilidade de "por que esta aula existe" vale mesmo pra aula
 * descartada. `bookings` é a checagem autoritativa; `packages` é redundante e sozinha incompleta
 * (packages.recorrencia_id só grava o recorrencia_id do PRIMEIRO slot do array em
 * gerar_pacote_recorrencia, 0019 — um pacote combinando dois dias fixos referencia só um deles).
 * Checar as duas não corrige essa imprecisão, só garante que ela nunca deixa passar uma exclusão
 * indevida (bookings sempre pega o caso que packages sozinho perderia).
 */
export async function getAlunoRecorrencias(studentId: string): Promise<AlunoRecorrencia[]> {
  const [rowsRes, bookingsRes, packagesRes] = await Promise.all([
    client().from("aluno_recorrencia").select("*").eq("aluno_id", studentId).order("dia_semana", { ascending: true }),
    client().from("bookings").select("recorrencia_id").eq("student_id", studentId).not("recorrencia_id", "is", null),
    client().from("packages").select("recorrencia_id").eq("student_id", studentId).not("recorrencia_id", "is", null),
  ]);
  if (rowsRes.error) throw new Error(rowsRes.error.message);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);
  if (packagesRes.error) throw new Error(packagesRes.error.message);

  const usados = new Set<string>([
    ...(bookingsRes.data ?? []).map((r) => r.recorrencia_id as string),
    ...(packagesRes.data ?? []).map((r) => r.recorrencia_id as string),
  ]);
  return (rowsRes.data ?? []).map((r) => mapAlunoRecorrencia(r, usados.has(r.id)));
}

/**
 * Exclusão de verdade (não é o toggle `ativo`) — só é aceita pela RPC quando a recorrência nunca
 * gerou nenhum booking/package (ver `temUso` acima e a migration 0023). Mensagem de erro amigável
 * já vem da RPC via `error.message` (mesmo padrão de `reagendar_aula`/`cancelar_aula`).
 */
export async function excluirAlunoRecorrencia(id: string): Promise<void> {
  const { error } = await client().rpc("excluir_aluno_recorrencia", { p_recorrencia_id: id });
  if (error) throw new Error(error.message);
}

export async function createAlunoRecorrencia(
  studentId: string,
  diaSemana: number,
  horario: string,
  duracaoMinutos: number,
) {
  const { error } = await client()
    .from("aluno_recorrencia")
    .insert({ aluno_id: studentId, dia_semana: diaSemana, horario, duracao: `${duracaoMinutos} minutes` });
  if (error) throw new Error(error.message);
}

export async function setAlunoRecorrenciaAtivo(id: string, ativo: boolean) {
  const { error } = await client().from("aluno_recorrencia").update({ ativo }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Todas as ocorrências de `weekday` dentro de `weeks` semanas a partir de `fromInstant`, como
 * "yyyy-MM-dd" em BRT — mesma lógica de `horizonDatesFor` (linha ~1030), sem tocar nela: aquela é
 * do AUTOSSERVICO (disponibilidade), esta é da RECORRENCIA, propositalmente duas funções pequenas
 * e separadas em vez de uma só generalizada por cima de código que "não deve ser refatorado"
 * (CLAUDE.md). `fromInstant` é um instante real (não uma data "yyyy-MM-dd" solta) — sempre passado
 * por `brt()` aqui dentro antes de qualquer leitor local (`getDay`/`format`), nunca lido cru, pelo
 * mesmo motivo que todo o resto deste arquivo faz isso.
 */
function futureWeekdayDates(weekday: number, weeks: number, fromInstant: Date): string[] {
  const out: string[] = [];
  const start = brt(fromInstant);
  const end = addWeeks(start, weeks);
  for (let d = start; d < end; d = addDays(d, 1)) {
    if (d.getDay() === weekday) out.push(format(d, "yyyy-MM-dd"));
  }
  return out;
}

/**
 * Resolve o array de slots que `gerar_pacote_recorrencia` (0014) espera: todas as linhas ATIVAS de
 * `aluno_recorrencia` entrelaçadas cronologicamente (decisão 9, CLAUDE.md — mais de um dia da
 * semana é a MESMA rotina, gera UM pacote só), convertidas de BRT pra UTC com `fromZonedTime`
 * (mesmo padrão de `saveAvailabilityInterval`), cortadas nas primeiras `totalAulas`. `fromInstant`
 * (default: agora) é o limite inferior da busca — passar uma data futura escolhida pelo professor
 * (Etapa 5, seletor de início) desloca esse limite pra frente, sem mudar mais nada do cálculo.
 */
function computeRecorrenciaSlots(
  recorrencias: Pick<AlunoRecorrencia, "id" | "diaSemana" | "horario" | "duracaoMinutos">[],
  totalAulas: number,
  fromInstant: Date = new Date(),
): { start_time: string; end_time: string; recorrencia_id: string }[] {
  const weeks = Math.min(52, Math.max(HORIZON_WEEKS, Math.ceil(totalAulas / Math.max(recorrencias.length, 1)) + 2));
  const candidates: { start: Date; end: Date; recorrenciaId: string }[] = [];
  for (const rec of recorrencias) {
    for (const day of futureWeekdayDates(rec.diaSemana, weeks, fromInstant)) {
      const from = fromZonedTime(`${day}T${rec.horario}:00`, TIMEZONE);
      if (from.getTime() <= Date.now()) continue;
      candidates.push({ start: from, end: new Date(from.getTime() + rec.duracaoMinutos * 60_000), recorrenciaId: rec.id });
    }
  }
  candidates.sort((a, b) => a.start.getTime() - b.start.getTime());
  return candidates
    .slice(0, totalAulas)
    .map((c) => ({ start_time: c.start.toISOString(), end_time: c.end.toISOString(), recorrencia_id: c.recorrenciaId }));
}

/**
 * As datas que `gerarPacoteRecorrencia` criaria — o MESMO cálculo, sem gravar nada. A tela mostra
 * isso antes do toque em "Gerar" (o professor vê o que vai acontecer, não descobre depois).
 */
export function previewRecorrenciaAulas(
  recorrencias: Pick<AlunoRecorrencia, "id" | "diaSemana" | "horario" | "duracaoMinutos">[],
  totalAulas: number,
  startDate?: string | null,
): string[] {
  if (recorrencias.length === 0) return [];
  const fromInstant = startDate ? fromZonedTime(`${startDate}T00:00:00`, TIMEZONE) : new Date();
  return computeRecorrenciaSlots(recorrencias, totalAulas, fromInstant).map((s) => s.start_time);
}

/**
 * Datas "yyyy-MM-dd" válidas pra iniciar um pacote — só dias que caem em algum `diaSemana` ativo,
 * dentro de `weeksAhead` semanas, com horário ainda não passado (mesmo filtro de
 * `computeRecorrenciaSlots`). Usada pela tela pra restringir o seletor de data de início às
 * ocorrências reais da recorrência — nunca uma data solta que não bate com nenhum dia configurado.
 */
export function getRecorrenciaStartDateOptions(
  recorrencias: Pick<AlunoRecorrencia, "diaSemana" | "horario">[],
  weeksAhead = 8,
): string[] {
  const now = new Date();
  const seen = new Set<string>();
  for (const rec of recorrencias) {
    for (const day of futureWeekdayDates(rec.diaSemana, weeksAhead, now)) {
      const from = fromZonedTime(`${day}T${rec.horario}:00`, TIMEZONE);
      if (from.getTime() <= Date.now()) continue;
      seen.add(day);
    }
  }
  return Array.from(seen).sort();
}

/**
 * Gera um pacote de recorrência: lê as linhas ATIVAS de `aluno_recorrencia` do aluno, calcula as
 * próximas `totalAulas` ocorrências a partir de `startDate` (ou de agora, se omitido) — entre
 * todas as linhas, entrelaçadas por data — e chama `gerar_pacote_recorrencia`. `startDate`, quando
 * informado, precisa ser um dos valores de `getRecorrenciaStartDateOptions` (a tela já restringe
 * isso; a função aqui só confia porque quem chama é a mesma tela que gerou as opções). Lança erro
 * amigável se não houver nenhuma linha ativa — a RPC também rejeitaria (`invalid_slots`), mas a
 * mensagem aqui é melhor pra UI.
 */
export async function gerarPacoteRecorrencia(studentId: string, totalAulas: number, startDate?: string): Promise<string> {
  const recorrencias = (await getAlunoRecorrencias(studentId)).filter((r) => r.ativo);
  if (recorrencias.length === 0) {
    throw new Error("Cadastre pelo menos um dia/horário de recorrência ativo antes de gerar um pacote.");
  }
  const fromInstant = startDate ? fromZonedTime(`${startDate}T00:00:00`, TIMEZONE) : new Date();
  const slots = computeRecorrenciaSlots(recorrencias, totalAulas, fromInstant);
  if (slots.length < totalAulas) {
    throw new Error("Não foi possível calcular datas futuras suficientes para esse número de aulas.");
  }
  const { data, error } = await client().rpc("gerar_pacote_recorrencia", { p_aluno_id: studentId, p_slots: slots });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function getSaldoPacote(pacoteId: string): Promise<SaldoPacote | null> {
  const { data, error } = await client().from("saldo_pacotes").select("*").eq("pacote_id", pacoteId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSaldoPacote(data) : null;
}

/**
 * Quantas aulas futuras `scheduled` de recorrência (`pacote_id is not null`) este aluno tem —
 * exatamente o que `gerar_pacote_recorrencia` (0018) cancela (`cancelado_por = 'professor'`) antes
 * de gerar um pacote novo. A tela usa isso pra avisar o professor ANTES de gerar, nunca depois.
 */
export async function getAulasCancelaveisRecorrencia(studentId: string): Promise<string[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await client()
    .from("bookings")
    .select("start_time")
    .order("start_time", { ascending: true })
    .eq("student_id", studentId)
    .not("pacote_id", "is", null)
    .eq("status", "scheduled")
    // Espelha o WHERE da RPC (0019/0021): reposição/remarcação NÃO é cancelada pela regeneração,
    // então não pode entrar na contagem — senão o diálogo avisa um número maior do que o que vai
    // acontecer de verdade, que é pior do que não avisar.
    .is("replacement_for_booking_id", null)
    .gt("start_time", nowIso);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.start_time as string);
}

// ---------------------------------------------------------------------------
// admin · histórico
// ---------------------------------------------------------------------------

export const HISTORICO_PAGINA = 30;

/** Uma linha do histórico: a aula + o contexto da cadeia (de onde veio / para onde foi). */
export interface HistoricoItem {
  booking: Booking;
  studentName: string;
  vinculo: VinculoAula | null;
  /** Início da aula da qual esta veio (remarcação/reposição). */
  deInicio: string | null;
  /** Início da aula para a qual esta foi remarcada (só quando `booking.status === "rescheduled"`). */
  paraInicio: string | null;
}

/** "João" e "joao" são a mesma busca (sem acento, sem maiúscula). */
const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Uma página do histórico do professor. A busca por aluno e o filtro de status são aplicados NA CONSULTA (antes eram
 * aplicados no aparelho sobre as 200 aulas mais recentes: um aluno antigo, ou "Faltas", podia sumir sem aviso).
 * `hasMore` vem de pedir uma linha a mais que a página.
 */
export async function getAdminBookingHistoryPage(
  adminId: string,
  search: string,
  statusFilter: string,
  periodo: "proximas" | "anteriores",
  page: number,
): Promise<{ items: HistoricoItem[]; hasMore: boolean }> {
  const students = await adminStudents(adminId);
  const nameOf = new Map(students.map((s) => [s.id, s.name]));

  let query = client().from("bookings").select("*").eq("admin_id", adminId);
  const q = semAcento(search);
  if (q) {
    const ids = students.filter((s) => semAcento(s.name).includes(q)).map((s) => s.id);
    if (ids.length === 0) return { items: [], hasMore: false };
    query = query.in("student_id", ids);
  }
  // Próximas = ainda não terminaram (em ordem crescente); anteriores = já terminaram (da mais recente para a mais
  // antiga). "Sem registro" é uma agendada que já terminou, então só existe entre as anteriores.
  const agora = new Date().toISOString();
  query = periodo === "proximas" ? query.gte("end_time", agora) : query.lt("end_time", agora);
  if (statusFilter === "sem_registro" || statusFilter === "scheduled") query = query.eq("status", "scheduled");
  else if (statusFilter !== "todas") query = query.eq("status", statusFilter);

  const from = page * HISTORICO_PAGINA;
  const { data, error } = await query
    .order("start_time", { ascending: periodo === "proximas" })
    .range(from, from + HISTORICO_PAGINA);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).slice(0, HISTORICO_PAGINA);
  const hasMore = (data ?? []).length > HISTORICO_PAGINA;

  // Contexto da cadeia, em DUAS consultas para a página inteira (nunca uma por linha): de onde veio a aula
  // (antecessor) e, nas remarcadas, para onde foi (sucessor).
  const [ante, sucessores] = await Promise.all([
    antecessores(rows.map((r) => r.replacement_for_booking_id)),
    (async () => {
      const idsRemarcadas = rows.filter((r) => r.status === "rescheduled").map((r) => r.id);
      const out = new Map<string, string>();
      if (idsRemarcadas.length === 0) return out;
      const { data: suc, error: sucError } = await client()
        .from("bookings")
        .select("replacement_for_booking_id, start_time")
        .in("replacement_for_booking_id", idsRemarcadas);
      if (sucError) throw new Error(sucError.message);
      for (const r of suc ?? []) if (r.replacement_for_booking_id) out.set(r.replacement_for_booking_id, r.start_time);
      return out;
    })(),
  ]);

  return {
    items: rows.map((r) => {
      const a = r.replacement_for_booking_id ? ante.get(r.replacement_for_booking_id) : undefined;
      return {
        booking: mapBooking(r),
        studentName: nameOf.get(r.student_id) ?? "Aluno",
        vinculo: a?.vinculo ?? (r.is_replacement ? ("reposicao" as VinculoAula) : null),
        deInicio: a?.inicio ?? null,
        paraInicio: sucessores.get(r.id) ?? null,
      };
    }),
    hasMore,
  };
}

// ---------------------------------------------------------------------------
// admin · pedidos (purchase requests)
// ---------------------------------------------------------------------------

export async function getPurchaseRequests(adminId: string) {
  const { data, error } = await client()
    .from("purchase_requests")
    .select("*")
    .eq("admin_id", adminId)
    .eq("status", "pending")
    .order("created_at");
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const templateIds = Array.from(new Set(rows.map((r) => r.template_id).filter(Boolean)));
  const studentIds = Array.from(new Set(rows.map((r) => r.student_id)));
  const [students, templatesRes, activePkgsRes] = await Promise.all([
    adminStudents(adminId),
    templateIds.length
      ? client().from("package_templates").select("*").in("id", templateIds)
      : Promise.resolve({ data: [], error: null } as const),
    // Pacotes ativos de quem pediu — pra avisar o professor do que a aprovação encerra.
    studentIds.length
      ? client().from("packages").select("*").in("student_id", studentIds).eq("status", "active")
      : Promise.resolve({ data: [], error: null } as const),
  ]);
  if (templatesRes.error) throw new Error(templatesRes.error.message);
  if (activePkgsRes.error) throw new Error(activePkgsRes.error.message);

  // O que `approve_purchase_request` encerra ao aprovar: os pacotes ativos NÃO-trial, nos dois
  // tipos de pedido (pacote -> assign_package_from_template; aula avulsa -> _create_package, desde
  // a 0031 — antes a aula avulsa fechava também a experimental).
  // As aulas já agendadas não se perdem (a conclusão debita do pacote novo pela busca "mais antigo
  // ativo com vaga"); o que se perde é o que sobrava pra agendar. Aqui só se conta total − usadas
  // de cada pacote que seria fechado.
  const activeByStudent = new Map<string, PackageRecord[]>();
  for (const row of activePkgsRes.data ?? []) {
    const p = mapPackage(row);
    activeByStudent.set(p.studentId, [...(activeByStudent.get(p.studentId) ?? []), p]);
  }

  // Pacote de RECORRÊNCIA: as aulas restantes já nascem todas MARCADAS e continuam valendo depois que o
  // pacote é encerrado (a conclusão debita pelo `pacote_id`). Então aprovar não "tira" nada dali — e o
  // número certo vem de `saldo_pacotes` (a autoridade, decisão 4), não da cópia `used_classes`, que
  // fica defasada depois de um desfazer. Antes o aviso contava as duas coisas do mesmo jeito e dizia
  // "essas aulas deixam de valer" para quem tinha só aulas já marcadas.
  const recIds = (activePkgsRes.data ?? []).filter((r) => r.origin === "recurrence").map((r) => r.id as string);
  const saldoRes = recIds.length
    ? await client().from("saldo_pacotes").select("pacote_id, restantes").in("pacote_id", recIds)
    : { data: [], error: null };
  if (saldoRes.error) throw new Error(saldoRes.error.message);
  const restantesRec = new Map((saldoRes.data ?? []).map((r) => [r.pacote_id as string, r.restantes as number]));

  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const templates = new Map((templatesRes.data ?? []).map((t) => [t.id, mapTemplate(t)]));

  return rows.map((r) => {
    const request = mapRequest(r);
    const closed = (activeByStudent.get(r.student_id) ?? []).filter((p) => p.origin !== "trial");
    const normais = closed.filter((p) => p.origin !== "recurrence");
    const recorrencia = closed.filter((p) => p.origin === "recurrence");
    // O que o aluno tem hoje, todos os pacotes ativos (a experimental também conta): dá contexto pra
    // decidir sem ter que abrir o perfil dele.
    const ativos = activeByStudent.get(r.student_id) ?? [];
    const aulasRestantes = ativos.reduce(
      (acc, p) => acc + (p.origin === "recurrence" ? (restantesRec.get(p.id) ?? 0) : Math.max(0, p.totalClasses - p.usedClasses)),
      0,
    );
    return {
      request,
      studentName: nameOf.get(r.student_id) ?? "Aluno",
      template: r.template_id ? (templates.get(r.template_id) ?? null) : null,
      /** Aulas que o aluno ainda tinha pra AGENDAR e que a aprovação encerra (pacotes que não são de recorrência). 0 = aprovar não tira nada. */
      classesLostOnApprove: normais.reduce((acc, p) => acc + Math.max(0, p.totalClasses - p.usedClasses), 0),
      /** Aulas marcadas num pacote de recorrência: continuam valendo mesmo com a aprovação. */
      recorrenciaRestantes: recorrencia.reduce((acc, p) => acc + (restantesRec.get(p.id) ?? 0), 0),
      /** Aulas restantes em todos os pacotes ativos; `null` = sem pacote ativo. */
      aulasRestantes: ativos.length ? aulasRestantes : null,
    };
  });
}

/** Os últimos pedidos já decididos (aprovados ou recusados) — pra conferir o que foi feito. */
export async function getPedidosDecididos(adminId: string, limite = 5) {
  const { data, error } = await client()
    .from("purchase_requests")
    .select("*")
    .eq("admin_id", adminId)
    .neq("status", "pending")
    .order("decided_at", { ascending: false, nullsFirst: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const templateIds = Array.from(new Set(rows.map((r) => r.template_id).filter(Boolean)));
  const [students, templatesRes] = await Promise.all([
    adminStudents(adminId),
    templateIds.length
      ? client().from("package_templates").select("*").in("id", templateIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);
  if (templatesRes.error) throw new Error(templatesRes.error.message);
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const templates = new Map((templatesRes.data ?? []).map((t) => [t.id, mapTemplate(t)]));
  return rows.map((r) => ({
    request: mapRequest(r),
    studentName: nameOf.get(r.student_id) ?? "Aluno",
    template: r.template_id ? (templates.get(r.template_id) ?? null) : null,
  }));
}

export async function approvePurchaseRequest(requestId: string) {
  const { error } = await client().rpc("approve_purchase_request", { p_request_id: requestId });
  if (error) throw new Error(error.message);
}

export async function rejectPurchaseRequest(requestId: string) {
  const { error } = await client().rpc("reject_purchase_request", { p_request_id: requestId });
  if (error) throw new Error(error.message);
}

/** Undo for a rejection — a rejection has no side effects, so putting it back is enough. */
export async function restorePurchaseRequest(requestId: string) {
  const { error } = await client()
    .from("purchase_requests")
    .update({ status: "pending", decided_at: null })
    .eq("id", requestId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// admin · pacotes (templates)
// ---------------------------------------------------------------------------

type TemplateInput = {
  name: string;
  description: string;
  totalClasses: number;
  priceCents: number | null;
  validityDays: number | null;
};

export async function createPackageTemplate(adminId: string, data: TemplateInput) {
  const { data: row, error } = await client()
    .from("package_templates")
    .insert({
      admin_id: adminId,
      name: data.name,
      description: data.description,
      total_classes: data.totalClasses,
      price_cents: data.priceCents,
      validity_days: data.validityDays,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapTemplate(row);
}

export async function updatePackageTemplate(id: string, data: Partial<TemplateInput>) {
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description;
  if (data.totalClasses !== undefined) patch.total_classes = data.totalClasses;
  if (data.priceCents !== undefined) patch.price_cents = data.priceCents;
  if (data.validityDays !== undefined) patch.validity_days = data.validityDays;
  const { data: row, error } = await client().from("package_templates").update(patch).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return mapTemplate(row);
}

/**
 * Soft delete: `purchase_requests.template_id` points here, and a hard delete would blank the
 * template out of past requests. Deactivating hides it from new requests, which is what the
 * screen promises.
 */
export async function deletePackageTemplate(id: string) {
  const { error } = await client().from("package_templates").update({ is_active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Desfaz `deletePackageTemplate`: o modelo volta a aparecer para novos pedidos (era só `is_active = false`). */
export async function restorePackageTemplate(id: string) {
  const { error } = await client().from("package_templates").update({ is_active: true }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// admin · disponibilidade
// ---------------------------------------------------------------------------

export const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** How far ahead the weekly grid writes and reads concrete slots. */
export const HORIZON_WEEKS = 12;

export interface AvailabilityDay {
  weekday: number;
  name: string;
  active: boolean;
  slots: AvailabilityInterval[];
}

function horizonBounds() {
  const now = new Date();
  return { fromIso: now.toISOString(), toIso: addWeeks(now, HORIZON_WEEKS).toISOString() };
}

/** Merges the individual hourly slots of one weekday into contiguous ranges. */
function mergeHours(entries: { hour: number; id: string }[]): { startHour: number; endHour: number; ids: string[] }[] {
  const byHour = new Map<number, string[]>();
  for (const e of entries) byHour.set(e.hour, [...(byHour.get(e.hour) ?? []), e.id]);

  const out: { startHour: number; endHour: number; ids: string[] }[] = [];
  for (const hour of Array.from(byHour.keys()).sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && last.endHour === hour) {
      last.endHour = hour + 1;
      last.ids.push(...byHour.get(hour)!);
    } else {
      out.push({ startHour: hour, endHour: hour + 1, ids: [...byHour.get(hour)!] });
    }
  }
  return out;
}

export async function getAvailability(adminId: string): Promise<AvailabilityDay[]> {
  const { fromIso, toIso } = horizonBounds();
  const [slotsRes, bookingsRes] = await Promise.all([
    client()
      .from("availability_slots")
      .select("id, start_time, is_active")
      .eq("admin_id", adminId)
      .gte("start_time", fromIso)
      .lt("start_time", toIso),
    client()
      .from("bookings")
      .select("start_time")
      .eq("admin_id", adminId)
      .in("status", ACTIVE_STATUSES)
      .gte("start_time", fromIso)
      .lt("start_time", toIso),
  ]);
  if (slotsRes.error) throw new Error(slotsRes.error.message);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);

  const slots = slotsRes.data ?? [];
  const bookings = (bookingsRes.data ?? []).map((b) => ({ weekday: brtWeekday(b.start_time), hour: brtHour(b.start_time) }));

  return WEEKDAY_NAMES.map((name, weekday) => {
    const ofDay = slots.filter((s) => brtWeekday(s.start_time) === weekday);
    const active = ofDay.some((s) => s.is_active);
    // When the whole day is switched off, every one of its slots is inactive together — show them
    // anyway (paused, not gone) instead of rendering an empty day. While the day is on, keep
    // filtering to active slots so an individually removed interval stays hidden.
    const relevant = active ? ofDay.filter((s) => s.is_active) : ofDay;
    const ranges = mergeHours(relevant.map((s) => ({ hour: brtHour(s.start_time), id: s.id })));

    return {
      weekday,
      name,
      active,
      slots: ranges.map((r) => ({
        key: `${weekday}-${r.startHour}-${r.endHour}`,
        weekday,
        startTime: hhmm(r.startHour),
        endTime: hhmm(r.endHour),
        slotIds: r.ids,
        bookedCount: bookings.filter((b) => b.weekday === weekday && b.hour >= r.startHour && b.hour < r.endHour).length,
      })),
    };
  });
}

async function setSlotsActive(ids: string[], active: boolean) {
  if (ids.length === 0) return;
  const { error } = await client().from("availability_slots").update({ is_active: active }).in("id", ids);
  if (error) throw new Error(error.message);
}

/** Turns every slot of that weekday inside the horizon on or off. */
export async function toggleAvailabilityDay(adminId: string, weekday: number, active: boolean) {
  const { fromIso, toIso } = horizonBounds();
  const { data, error } = await client()
    .from("availability_slots")
    .select("id, start_time")
    .eq("admin_id", adminId)
    .gte("start_time", fromIso)
    .lt("start_time", toIso);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).filter((s) => brtWeekday(s.start_time) === weekday).map((s) => s.id);
  if (ids.length === 0 && active) {
    throw new Error("Esse dia ainda não tem horários cadastrados. Adicione um intervalo primeiro.");
  }
  await setSlotsActive(ids, active);
}

/** Every date inside the horizon that falls on `weekday`, as "yyyy-MM-dd" in BRT. */
function horizonDatesFor(weekday: number): string[] {
  const out: string[] = [];
  const start = brt(new Date());
  const end = addWeeks(start, HORIZON_WEEKS);
  for (let d = start; d < end; d = addDays(d, 1)) {
    if (d.getDay() === weekday) out.push(format(d, "yyyy-MM-dd"));
  }
  return out;
}

/**
 * Writes one weekday range as concrete hourly slots across the horizon. `upsert_availability_slots`
 * inserts what is missing and reactivates what already exists.
 */
export async function saveAvailabilityInterval(
  adminId: string,
  weekday: number,
  start: string,
  end: string,
  replacing?: AvailabilityInterval | null,
): Promise<{ error?: string }> {
  const startHour = parseInt(start, 10);
  const endHour = parseInt(end, 10);
  if (endHour <= startHour) return { error: "O fim precisa ser depois do início." };

  const payload: { start_time: string; end_time: string }[] = [];
  for (const day of horizonDatesFor(weekday)) {
    for (let h = startHour; h < endHour; h++) {
      const from = fromZonedTime(`${day}T${hhmm(h)}:00`, TIMEZONE);
      if (from.getTime() <= Date.now()) continue;
      payload.push({ start_time: from.toISOString(), end_time: new Date(from.getTime() + 3_600_000).toISOString() });
    }
  }
  if (payload.length === 0) return { error: "Não há datas futuras nesse intervalo dentro do horizonte de agendamento." };

  if (replacing) await setSlotsActive(replacing.slotIds, false);

  const { error } = await client().rpc("upsert_availability_slots", { p_admin_id: adminId, p_slots: payload });
  if (error) {
    if (replacing) await setSlotsActive(replacing.slotIds, true);
    return { error: error.message };
  }
  return {};
}

/** Removing an interval deactivates its slots — the rows stay, so "desfazer" is exact. */
export async function deleteAvailabilityInterval(interval: AvailabilityInterval) {
  await setSlotsActive(interval.slotIds, false);
}

export async function restoreAvailabilityInterval(interval: AvailabilityInterval) {
  await setSlotsActive(interval.slotIds, true);
}

// ---------------------------------------------------------------------------
// configurações
// ---------------------------------------------------------------------------

export async function getAdminSettings(adminId: string): Promise<AdminSettings | null> {
  const { data, error } = await client()
    .from("profiles")
    .select("id, no_show_consumes_class, modo_agendamento, whatsapp")
    .eq("id", adminId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data
    ? {
        adminId: data.id,
        noShowConsumesClass: data.no_show_consumes_class,
        modoAgendamento: (data.modo_agendamento as ModoAgendamento | null) ?? "autosservico",
        whatsapp: data.whatsapp ?? null,
      }
    : null;
}

export async function updateNoShowConsumesClass(adminId: string, value: boolean) {
  const { error } = await client().from("profiles").update({ no_show_consumes_class: value }).eq("id", adminId);
  if (error) throw new Error(error.message);
}

export async function updateModoAgendamento(adminId: string, value: ModoAgendamento) {
  const { error } = await client().from("profiles").update({ modo_agendamento: value }).eq("id", adminId);
  if (error) throw new Error(error.message);
}

export async function updateWhatsapp(adminId: string, whatsapp: string | null) {
  const { error } = await client().from("profiles").update({ whatsapp }).eq("id", adminId);
  if (error) throw new Error("Não foi possível salvar o WhatsApp. Confira o número e tente de novo.");
}

/**
 * WhatsApp do professor, lido pelo aluno. Por RPC pelo mesmo motivo de
 * `getModoAgendamentoEfetivo` logo abaixo: o aluno não lê a linha de `profiles` do professor.
 */
/**
 * E-mail da conta de um aluno DO PRÓPRIO professor (contato). Vai por RPC (0036): o e-mail fica em `auth.users`, que o
 * cliente não lê, e `profiles` não o guarda. Só o professor dono chama; qualquer outro recebe erro.
 */
export async function getEmailDoAluno(studentId: string): Promise<string | null> {
  const { data, error } = await client().rpc("email_do_aluno", { p_student_id: studentId });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export async function getWhatsappDoProfessor(professorId: string): Promise<string | null> {
  const { data, error } = await client().rpc("whatsapp_do_professor", { p_professor_id: professorId });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/**
 * Lê o modo de agendamento efetivo do professor a partir de OUTRA conta (ex.: o aluno checando o
 * do próprio professor antes de abrir "Agendar"). Vai por RPC, não por `.from("profiles")`: a
 * policy de `profiles` não abre leitura nesse sentido de propósito (supabase/README.md — "Aluno
 * não enxerga o perfil do professor"), e reabri-la só por causa desta flag reabriria a tabela
 * inteira, não só o campo. `modo_agendamento_efetivo()` (0022) já devolve coalescido para
 * 'autosservico' quando a coluna é NULL. O próprio professor lendo o próprio modo usa
 * `getAdminSettings` (leitura direta da própria linha, já permitida) em vez desta função.
 */
export async function getModoAgendamentoEfetivo(professorId: string): Promise<ModoAgendamento> {
  const { data, error } = await client().rpc("modo_agendamento_efetivo", { p_professor_id: professorId });
  if (error) throw new Error(error.message);
  return data as ModoAgendamento;
}

// ---------------------------------------------------------------------------
// orientações da aula
// ---------------------------------------------------------------------------

function mapGuidelines(r: any): ClassGuidelines {
  return {
    adminId: r.admin_id,
    cep: r.cep,
    street: r.street,
    number: r.number,
    complement: r.complement,
    neighborhood: r.neighborhood,
    city: r.city,
    state: r.state,
    referencePoint: r.reference_point,
    arrivalMinutes: r.arrival_minutes,
    equipment: r.equipment ?? {},
    notes: r.notes,
  };
}

/**
 * Padrão do professor — hoje é a única fonte. Chamar por aqui (não por acesso direto à tabela)
 * é o que deixa espaço pra um override por aula no futuro sem mudar quem lê.
 */
export async function getClassGuidelines(adminId: string): Promise<ClassGuidelines | null> {
  const { data, error } = await client().from("class_guidelines").select("*").eq("admin_id", adminId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapGuidelines(data) : null;
}

export async function getClassGuidelinesForBooking(booking: Pick<Booking, "adminId">): Promise<ClassGuidelines | null> {
  return getClassGuidelines(booking.adminId);
}

export async function saveClassGuidelines(adminId: string, g: Omit<ClassGuidelines, "adminId">) {
  const { error } = await client()
    .from("class_guidelines")
    .upsert(
      {
        admin_id: adminId,
        cep: g.cep,
        street: g.street,
        number: g.number,
        complement: g.complement,
        neighborhood: g.neighborhood,
        city: g.city,
        state: g.state,
        reference_point: g.referencePoint,
        arrival_minutes: g.arrivalMinutes,
        equipment: g.equipment,
        notes: g.notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "admin_id" },
    );
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// notificações
//
// The database has no notifications table, so the feed is derived from the data that would have
// produced one (pending approvals, rejections, upcoming classes). Read/dismissed state is per
// device, in localStorage — there is nowhere on the server to record it.
// ---------------------------------------------------------------------------

function notificationState(userId: string): { read: string[]; cleared: string[] } {
  try {
    const raw = localStorage.getItem(`bb.notifications.${userId}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return { read: parsed?.read ?? [], cleared: parsed?.cleared ?? [] };
  } catch {
    return { read: [], cleared: [] };
  }
}

function saveNotificationState(userId: string, state: { read: string[]; cleared: string[] }) {
  try {
    localStorage.setItem(`bb.notifications.${userId}`, JSON.stringify(state));
  } catch {
    /* private mode / storage disabled — the feed just stops remembering */
  }
}

async function deriveNotifications(userId: string): Promise<AppNotification[]> {
  const { data: profile } = await client().from("profiles").select("role").eq("id", userId).maybeSingle();
  const items: AppNotification[] = [];
  const nowIso = new Date().toISOString();

  if (profile?.role === "admin") {
    const [requestsRes, pendingRes] = await Promise.all([
      client().from("purchase_requests").select("*").eq("admin_id", userId).eq("status", "pending"),
      client().from("bookings").select("*").eq("admin_id", userId).eq("status", "pending_confirmation"),
    ]);
    for (const r of requestsRes.data ?? []) {
      items.push({
        id: `request:${r.id}`,
        userId,
        kind: "system",
        title: r.kind === "single" ? "Pedido de aula avulsa" : "Pedido de pacote",
        description: "Um aluno está aguardando sua aprovação.",
        createdAt: r.created_at,
        read: false,
        entity: { type: "purchase_requests" },
      });
    }
    for (const b of pendingRes.data ?? []) {
      items.push({
        id: `booking:${b.id}:pending`,
        userId,
        kind: "booking",
        title: "Agendamento aguardando confirmação",
        description: "Um aluno pediu um horário.",
        createdAt: b.created_at,
        read: false,
        entity: { type: "booking", id: b.id },
      });
    }
  } else {
    const studentId = await studentIdForProfile(userId).catch(() => null);
    if (!studentId) return [];
    const [bookingsRes, requestsRes, coachAssessmentsRes] = await Promise.all([
      // `.or(...)` antes do `limit(40)`: sem ele, as aulas descartadas por regeneração consomem a
      // janela e empurram pra fora dela os eventos que viram notificação de verdade.
      client()
        .from("bookings")
        .select("*")
        .eq("student_id", studentId)
        .or(SEM_DESCARTE_DE_REGENERACAO)
        .order("start_time", { ascending: false })
        .limit(40),
      client().from("purchase_requests").select("*").eq("student_id", studentId).neq("status", "pending").order("decided_at", { ascending: false }).limit(20),
      // CLAUDE.md, "aluno descobre a avaliação do professor": sem isso, nada avisava o aluno que
      // uma avaliação 'coach' existia — ele só encontrava se abrisse Perfil de Boxe por conta
      // própria. RLS já deixava ler (0006/0007); faltava só aparecer aqui.
      client()
        .from("boxing_profile_assessments")
        .select("id, completed_at")
        .eq("student_id", studentId)
        .eq("assessment_type", "coach")
        .order("completed_at", { ascending: false })
        .limit(20),
    ]);
    // Uma aula `scheduled` com antecessor não é "confirmada" do nada: ou o professor remarcou
    // (antecessor `rescheduled`) ou marcou uma reposição (antecessor `no_show`/`cancelled`) — mesmo
    // discriminador de `antecessores` (CLAUDE.md, decisão 2). Sem isso, remarcar gerava um
    // "Aula confirmada · Seu horário está garantido" e o aluno não ficava sabendo que o horário
    // MUDOU. Antecessores buscados numa consulta só — podem estar fora da janela de 40 acima.
    const predecessorIds = Array.from(
      new Set(
        (bookingsRes.data ?? [])
          .filter((b) => b.status === "scheduled" && b.start_time > nowIso && b.replacement_for_booking_id)
          .map((b) => b.replacement_for_booking_id as string),
      ),
    );
    const predecessors = new Map<string, { status: string; start_time: string }>();
    if (predecessorIds.length) {
      const { data: predRows } = await client()
        .from("bookings")
        .select("id, status, start_time")
        .in("id", predecessorIds);
      for (const r of predRows ?? []) predecessors.set(r.id, { status: r.status, start_time: r.start_time });
    }
    const when = (iso: string) => `${formatDate(iso)} · ${formatTime(iso)}`;

    for (const b of bookingsRes.data ?? []) {
      const pred = b.replacement_for_booking_id ? predecessors.get(b.replacement_for_booking_id) : undefined;
      if (b.status === "scheduled" && b.start_time > nowIso && pred?.status === "rescheduled") {
        items.push({
          id: `booking:${b.id}:rescheduled`,
          userId,
          kind: "confirm",
          title: "Aula remarcada",
          description: `De ${when(pred.start_time)} para ${when(b.start_time)}.`,
          createdAt: b.created_at,
          read: false,
          entity: { type: "booking", id: b.id },
        });
        continue;
      }
      if (b.status === "scheduled" && b.start_time > nowIso && pred) {
        items.push({
          id: `booking:${b.id}:replacement`,
          userId,
          kind: "confirm",
          title: "Reposição marcada",
          description: `Sua aula de reposição é ${when(b.start_time)}.`,
          createdAt: b.created_at,
          read: false,
          entity: { type: "booking", id: b.id },
        });
        continue;
      }
      if (b.status === "rejected" || b.status === "rejected_with_suggestion") {
        items.push({
          id: `booking:${b.id}:${b.status}`,
          userId,
          kind: "cancel",
          title: b.status === "rejected" ? "Agendamento recusado" : "O professor sugeriu outro horário",
          description: b.teacher_note || "Toque para ver os detalhes.",
          createdAt: b.created_at,
          read: false,
          entity: { type: "booking", id: b.id },
        });
      } else if (b.status === "scheduled" && b.start_time > nowIso) {
        items.push({
          id: `booking:${b.id}:scheduled`,
          userId,
          kind: "confirm",
          title: "Aula confirmada",
          description: "Seu horário está garantido.",
          createdAt: b.created_at,
          read: false,
          entity: { type: "booking", id: b.id },
        });
      }
    }
    // "Já dá para agendar" só é verdade no autosserviço: na recorrência o aluno não escolhe horário
    // (o professor marca) e a aba de agendar nem aparece. Sem o modo, o aviso prometia o que o
    // aluno não podia fazer.
    let autosservico = true;
    if ((requestsRes.data ?? []).some((r) => r.status === "approved")) {
      try {
        const { data: st } = await client().from("students").select("admin_id").eq("id", studentId).maybeSingle();
        if (st?.admin_id) autosservico = (await getModoAgendamentoEfetivo(st.admin_id)) === "autosservico";
      } catch {
        /* sem o modo: mantém o texto do autosserviço (o padrão) */
      }
    }
    for (const r of requestsRes.data ?? []) {
      const aprovado = r.status === "approved";
      items.push({
        id: `request:${r.id}:${r.status}`,
        userId,
        kind: "system",
        title: aprovado ? "Pedido aprovado" : "Pedido recusado",
        description: aprovado
          ? autosservico
            ? "Suas aulas já estão disponíveis para agendar."
            : "Seu professor liberou o pacote. As aulas são marcadas por ele."
          : "Fale com seu professor para entender o motivo.",
        createdAt: r.decided_at ?? r.created_at,
        read: false,
        // Recusado leva à tela inicial (onde está o WhatsApp); aprovado, aos pacotes.
        entity: aprovado ? { type: "purchase_requests" } : { type: "home" },
      });
    }
    for (const a of coachAssessmentsRes.data ?? []) {
      items.push({
        id: `boxing-profile:${a.id}`,
        userId,
        kind: "system",
        title: "Seu professor te avaliou",
        description: "Veja a leitura dele sobre o seu Perfil de Boxe, ao lado da sua autoavaliação.",
        createdAt: a.completed_at,
        read: false,
        entity: { type: "boxing_profile" },
      });
    }
  }

  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getNotifications(userId: string): Promise<AppNotification[]> {
  const [items, state] = [await deriveNotifications(userId), notificationState(userId)];
  const cleared = new Set(state.cleared);
  const read = new Set(state.read);
  return items.filter((n) => !cleared.has(n.id)).map((n) => ({ ...n, read: read.has(n.id) }));
}

/** The bell passes only the notification id, so the owning user comes from the session. */
export async function markNotificationRead(id: string) {
  const { data } = await client().auth.getUser();
  const uid = data.user?.id;
  if (!uid) return;
  const state = notificationState(uid);
  if (!state.read.includes(id)) state.read.push(id);
  saveNotificationState(uid, state);
}

export async function markAllNotificationsRead(userId: string) {
  const items = await deriveNotifications(userId);
  const state = notificationState(userId);
  saveNotificationState(userId, { ...state, read: Array.from(new Set([...state.read, ...items.map((n) => n.id)])) });
}

export async function clearNotifications(userId: string): Promise<AppNotification[]> {
  const visible = await getNotifications(userId);
  const state = notificationState(userId);
  saveNotificationState(userId, { ...state, cleared: Array.from(new Set([...state.cleared, ...visible.map((n) => n.id)])) });
  return visible;
}

export async function restoreNotifications(items: AppNotification[]) {
  if (items.length === 0) return;
  const userId = items[0].userId;
  const state = notificationState(userId);
  const restore = new Set(items.map((n) => n.id));
  saveNotificationState(userId, { ...state, cleared: state.cleared.filter((id) => !restore.has(id)) });
}

// ---------------------------------------------------------------------------
// convites
// ---------------------------------------------------------------------------

export async function validateInvite(token: string): Promise<{ valid: boolean; reason: string } | null> {
  const { data, error } = await client().rpc("validate_invite", { p_token: token });
  if (error) throw new Error(error.message);
  const row = (data as { is_valid: boolean; reason: string }[] | null)?.[0];
  if (!row) return null;
  return { valid: row.is_valid, reason: row.reason };
}

/** Links the already-authenticated user as a student of this invite's admin. */
export async function acceptInvite(token: string) {
  const { error } = await client().rpc("accept_invite", { p_token: token });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// perfil
// ---------------------------------------------------------------------------

export async function updateProfileName(profileId: string, name: string) {
  const { error } = await client().from("profiles").update({ name }).eq("id", profileId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// perfil complementar do aluno (Etapa 8)
// ---------------------------------------------------------------------------

function mapStudentProfile(studentId: string, r: any | null): StudentProfile {
  return {
    studentId,
    sex: r?.sex ?? null,
    heightCm: r?.height_cm ?? null,
    weightKg: r?.weight_kg ?? null,
    wingspanCm: r?.wingspan_cm ?? null,
    guard: r?.guard ?? null,
    laterality: r?.laterality ?? null,
    fighterProfileResult: r?.fighter_profile_result ?? null,
    updatedAt: r?.updated_at ?? "",
  };
}

export async function getStudentProfile(studentId: string): Promise<StudentProfile> {
  const { data, error } = await client().from("student_profiles").select("*").eq("student_id", studentId).maybeSingle();
  if (error) throw new Error(error.message);
  return mapStudentProfile(studentId, data);
}

export async function saveStudentProfile(
  studentId: string,
  patch: Pick<StudentProfile, "sex" | "heightCm" | "weightKg" | "wingspanCm" | "guard" | "laterality">,
) {
  const { error } = await client()
    .from("student_profiles")
    .upsert(
      {
        student_id: studentId,
        sex: patch.sex,
        height_cm: patch.heightCm,
        weight_kg: patch.weightKg,
        wingspan_cm: patch.wingspanCm,
        guard: patch.guard,
        laterality: patch.laterality,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id" },
    );
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// perfil dos alunos — agregado pro professor (Etapa 10)
// ---------------------------------------------------------------------------

export interface CategoryStats<T extends string> {
  filled: number;
  breakdown: Record<T, number>;
}

export interface NumericStats {
  filled: number;
  avg: number | null;
  min: number | null;
  max: number | null;
}

export interface StudentProfileStats {
  totalStudents: number;
  sex: CategoryStats<Sex>;
  guard: CategoryStats<Guard>;
  laterality: CategoryStats<Laterality>;
  heightCm: NumericStats;
  weightKg: NumericStats;
}

function categoryStats<T extends string>(values: (T | null)[], keys: T[]): CategoryStats<T> {
  const breakdown = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
  let filled = 0;
  for (const v of values) {
    if (v && v in breakdown) {
      breakdown[v]++;
      filled++;
    }
  }
  return { filled, breakdown };
}

function numericStats(values: (number | null)[]): NumericStats {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return { filled: 0, avg: null, min: null, max: null };
  return {
    filled: present.length,
    avg: present.reduce((a, b) => a + b, 0) / present.length,
    min: Math.min(...present),
    max: Math.max(...present),
  };
}

export async function getStudentProfileStats(adminId: string): Promise<StudentProfileStats> {
  const { data: studentRows, error: studentsErr } = await client().from("students").select("id").eq("admin_id", adminId);
  if (studentsErr) throw new Error(studentsErr.message);
  const ids = (studentRows ?? []).map((s) => s.id);

  const profiles = ids.length
    ? await (async () => {
        const { data, error } = await client().from("student_profiles").select("*").in("student_id", ids);
        if (error) throw new Error(error.message);
        return (data ?? []).map((r) => mapStudentProfile(r.student_id, r));
      })()
    : [];

  return {
    totalStudents: ids.length,
    sex: categoryStats(profiles.map((p) => p.sex), ["female", "male", "other"]),
    guard: categoryStats(profiles.map((p) => p.guard), [
      "orthodox",
      "southpaw",
      "switch",
      "peekaboo",
      "cross_arm",
      "philly_shell",
      "long_guard",
    ]),
    laterality: categoryStats(profiles.map((p) => p.laterality), ["right", "left", "ambidextrous"]),
    heightCm: numericStats(profiles.map((p) => p.heightCm)),
    weightKg: numericStats(profiles.map((p) => p.weightKg)),
  };
}

// ---------------------------------------------------------------------------
// Perfil de Boxe — autoavaliação (Etapa 9 completa)
// ---------------------------------------------------------------------------

function mapAssessmentSummary(r: any): BoxingProfileAssessmentSummary {
  return {
    id: r.id,
    assessmentType: r.assessment_type,
    assessedBy: r.assessed_by,
    completedAt: r.completed_at,
    primaryProfile: r.primary_profile,
    secondaryProfile: r.secondary_profile,
    dimensionScores: r.dimension_scores,
    profileScores: r.profile_scores,
    assessmentLength: r.assessment_length,
    scoringVersion: r.scoring_version,
  };
}

/**
 * Lista pra tela de histórico — nunca busca `answers` (pode ter até 32 chaves por linha; a lista
 * só precisa do resumo). Detalhe completo é uma chamada separada, só quando o aluno abre uma
 * avaliação específica.
 *
 * Traz 'self' e 'coach' juntos (RLS decide o que cada sessão pode ver: o aluno lê as próprias
 * linhas independente do tipo desde a Fase 1; o professor lê as dos seus alunos desde a
 * migration 0007). Quem chama filtra por `assessmentType` conforme a tela precisar.
 */
export async function getBoxingProfileHistory(studentId: string): Promise<BoxingProfileAssessmentSummary[]> {
  const { data, error } = await client()
    .from("boxing_profile_assessments")
    .select(
      "id, assessment_type, assessed_by, completed_at, primary_profile, secondary_profile, dimension_scores, profile_scores, assessment_length, scoring_version",
    )
    .eq("student_id", studentId)
    .order("completed_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapAssessmentSummary);
}

export async function getBoxingProfileAssessment(id: string): Promise<BoxingProfileAssessment | undefined> {
  const { data, error } = await client().from("boxing_profile_assessments").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  return {
    ...mapAssessmentSummary(data),
    answers: data.answers,
    questionnaireVersion: data.questionnaire_version,
    wingspanIndexUsed: data.wingspan_index_used,
    createdAt: data.created_at,
  };
}

/**
 * Índice de envergadura (envergadura ÷ altura) do aluno agora, pro momento da avaliação — só usado
 * quando `length === "full"`. `null` se altura ou envergadura não estiverem preenchidas no
 * cadastro; nunca estima uma a partir da outra (CLAUDE.md, "Âncora física").
 */
async function currentWingspanIndex(studentId: string): Promise<number | null> {
  const { data, error } = await client().from("student_profiles").select("height_cm, wingspan_cm").eq("student_id", studentId).maybeSingle();
  if (error) throw new Error(error.message);
  return computeWingspanIndex(data?.height_cm ?? null, data?.wingspan_cm ?? null);
}

/**
 * Único ponto de escrita: calcula o resultado (scoreAssessment, determinístico, sem IA em
 * runtime) e persiste tudo — respostas, scores das 8 dimensões, scores dos 6 perfis, versão do
 * questionário e do algoritmo, variante (curta/completa) e o índice de envergadura usado (se
 * aplicável) — numa única inserção atômica. Uma avaliação concluída nunca é atualizada depois;
 * refazer o teste sempre cria uma linha nova.
 */
export async function submitBoxingProfileAssessment(
  studentId: string,
  answers: BoxingAnswers,
  length: BoxingAssessmentLength,
): Promise<BoxingProfileAssessment> {
  const questions = getBoxingProfileQuestions("self", length);
  if (!isBoxingProfileComplete(answers, questions)) {
    throw new Error("Responda todas as questões antes de concluir.");
  }
  const wingspanIndex = length === "full" ? await currentWingspanIndex(studentId) : null;
  const result = scoreBoxingProfile(answers, questions, FORCED_CHOICE_WEIGHT[length], wingspanIndex);
  const { data, error } = await client()
    .from("boxing_profile_assessments")
    .insert({
      student_id: studentId,
      assessment_type: "self",
      questionnaire_version: BOXING_QUESTIONNAIRE_VERSION,
      scoring_version: BOXING_SCORING_VERSION,
      assessment_length: length,
      wingspan_index_used: wingspanIndex,
      answers,
      dimension_scores: result.dimensionScores,
      profile_scores: result.profileScores,
      primary_profile: result.primaryProfile,
      secondary_profile: result.secondaryProfile,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return {
    ...mapAssessmentSummary(data),
    answers: data.answers,
    questionnaireVersion: data.questionnaire_version,
    wingspanIndexUsed: data.wingspan_index_used,
    createdAt: data.created_at,
  };
}

/**
 * Avaliação 'coach': o professor responde as mesmas perguntas (voz reformulada, mesmos ids, exceto
 * os 2 itens self-only), sobre um aluno seu. Mesmo motor de pontuação de
 * `submitBoxingProfileAssessment` — ele não lê texto de pergunta, só id/dimensão/opção, que são
 * idênticos entre as duas vozes. RLS (`boxing_profile_assessments_admin_insert`, migration 0007)
 * garante no banco que só o professor dono do aluno grava, e sempre com `assessed_by = auth.uid()`;
 * não confiamos nisso só no cliente.
 */
export async function submitCoachBoxingProfileAssessment(
  studentId: string,
  assessedBy: string,
  answers: BoxingAnswers,
  length: BoxingAssessmentLength,
): Promise<BoxingProfileAssessment> {
  const questions = getBoxingProfileQuestions("coach", length);
  if (!isBoxingProfileComplete(answers, questions)) {
    throw new Error("Responda todas as questões antes de concluir.");
  }
  // A âncora física é sobre o corpo do ALUNO, não de quem preenche — mesma fonte (`student_profiles`
  // do aluno) que a avaliação 'self' usaria pra ele.
  const wingspanIndex = length === "full" ? await currentWingspanIndex(studentId) : null;
  const result = scoreBoxingProfile(answers, questions, FORCED_CHOICE_WEIGHT[length], wingspanIndex);
  const { data, error } = await client()
    .from("boxing_profile_assessments")
    .insert({
      student_id: studentId,
      assessment_type: "coach",
      assessed_by: assessedBy,
      questionnaire_version: BOXING_QUESTIONNAIRE_VERSION,
      scoring_version: BOXING_SCORING_VERSION,
      assessment_length: length,
      wingspan_index_used: wingspanIndex,
      answers,
      dimension_scores: result.dimensionScores,
      profile_scores: result.profileScores,
      primary_profile: result.primaryProfile,
      secondary_profile: result.secondaryProfile,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return {
    ...mapAssessmentSummary(data),
    answers: data.answers,
    questionnaireVersion: data.questionnaire_version,
    wingspanIndexUsed: data.wingspan_index_used,
    createdAt: data.created_at,
  };
}

export type { BookingStatus };

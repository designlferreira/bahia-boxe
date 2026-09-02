import { addDays, addWeeks, format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { TIMEZONE } from "@/lib/dateUtils";
import { supabase } from "@/integrations/supabase/client";
import type {
  AdminSettings,
  AppNotification,
  AvailabilityInterval,
  Booking,
  BoxingProfileAssessment,
  BoxingProfileAssessmentSummary,
  Guard,
  Laterality,
  PackageRecord,
  PackageTemplate,
  PurchaseRequest,
  Sex,
  StudentProfile,
  StudentRecord,
} from "./types";
import type { BookingStatus } from "@/lib/bookingStatus";
import type { ClassGuidelines } from "@/lib/classGuidelines";
import {
  isComplete as isBoxingProfileComplete,
  QUESTIONNAIRE_VERSION as BOXING_QUESTIONNAIRE_VERSION,
  scoreAssessment as scoreBoxingProfile,
  SCORING_VERSION as BOXING_SCORING_VERSION,
  type Answers as BoxingAnswers,
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
  };
}

/** `packages` stores no template link, so the label is derived from `kind` + `origin` + `total_classes`. */
function mapPackage(r: any): PackageRecord {
  const kind: PackageRecord["kind"] = r.kind === "single" ? "single" : "package";
  const origin: PackageRecord["origin"] = r.origin === "trial" || r.origin === "admin_grant" ? r.origin : "purchase";
  return {
    id: r.id,
    studentId: r.student_id,
    totalClasses: r.total_classes,
    usedClasses: r.used_classes,
    status: r.status,
    kind,
    origin,
    templateName: origin === "trial" ? "Aula experimental" : kind === "single" ? "Aula avulsa" : `Pacote de ${r.total_classes} aulas`,
    createdAt: r.created_at,
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
  const [pkg, credits, upcomingRes, suggestionRes] = await Promise.all([
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
      .order("start_time", { ascending: false })
      .limit(1),
  ]);
  if (upcomingRes.error) throw new Error(upcomingRes.error.message);
  if (suggestionRes.error) throw new Error(suggestionRes.error.message);
  const upcoming = (upcomingRes.data ?? [])[0];
  const suggestion = (suggestionRes.data ?? [])[0];
  return {
    package: pkg,
    credits,
    nextBooking: upcoming ? mapBooking(upcoming) : null,
    suggestion: suggestion ? mapBooking(suggestion) : null,
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

/** `schedule_booking` validates credits, ownership and slot availability server-side. */
export async function scheduleBooking(slotId: string) {
  const { error } = await client().rpc("schedule_booking", { p_slot_id: slotId });
  if (error) throw new Error(error.message);
}

/** Students may cancel their own scheduled class up to 6h before it starts (RLS enforces it). */
export async function cancelBooking(bookingId: string) {
  const { data, error } = await client()
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Só é possível cancelar até 6 horas antes do início da aula.");
  return mapBooking(data);
}

export async function acceptSuggestion(bookingId: string) {
  const { data: current, error: readErr } = await client()
    .from("bookings")
    .select("suggested_start_time, suggested_end_time")
    .eq("id", bookingId)
    .single();
  if (readErr) throw new Error(readErr.message);
  const { data, error } = await client()
    .from("bookings")
    .update({
      start_time: current.suggested_start_time,
      end_time: current.suggested_end_time,
      status: "scheduled",
      suggested_start_time: null,
      suggested_end_time: null,
    })
    .eq("id", bookingId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Esse horário não está mais disponível. Escolha outro.");
  return mapBooking(data);
}

// ---------------------------------------------------------------------------
// student · histórico / detalhe
// ---------------------------------------------------------------------------

export async function getStudentBookingHistory(
  profileId: string,
  tab: "proximas" | "anteriores" | "todas",
): Promise<Booking[]> {
  const studentId = await studentIdForProfile(profileId);
  const { data, error } = await client()
    .from("bookings")
    .select("*")
    .eq("student_id", studentId)
    .order("start_time", { ascending: false });
  if (error) throw new Error(error.message);
  const now = Date.now();
  return (data ?? [])
    .filter((r) => {
      const isFuture = new Date(r.start_time).getTime() > now;
      if (tab === "proximas") return isFuture;
      if (tab === "anteriores") return !isFuture;
      return true;
    })
    .map(mapBooking);
}

/**
 * The professor's name is not readable from `profiles` by a student (RLS), so it comes from the
 * `booking_history_app` view, which joins it server-side. Falls back to the plain row.
 */
export async function getBookingDetail(bookingId: string): Promise<{ booking: Booking; adminName: string | null } | undefined> {
  const viewRes = await client().from("booking_history_app").select("*").eq("id", bookingId).maybeSingle();
  if (!viewRes.error && viewRes.data) {
    return { booking: mapBooking(viewRes.data), adminName: viewRes.data.admin_name ?? null };
  }
  const { data, error } = await client().from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { booking: mapBooking(data), adminName: null } : undefined;
}

/** Mesma view, do lado do professor: já traz o nome do aluno resolvido. */
export async function getAdminBookingDetail(bookingId: string): Promise<{ booking: Booking; studentName: string } | undefined> {
  const viewRes = await client().from("booking_history_app").select("*").eq("id", bookingId).maybeSingle();
  if (!viewRes.error && viewRes.data) {
    return { booking: mapBooking(viewRes.data), studentName: viewRes.data.student_name ?? "Aluno" };
  }
  const { data, error } = await client().from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { booking: mapBooking(data), studentName: "Aluno" } : undefined;
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

export async function getAdminDashboard(adminId: string) {
  const nowIso = new Date().toISOString();
  const { startIso, endIso } = dayBoundsUtcIso(new Date());

  const [students, todayRes, pendingRes, upcomingRes, awaitingRes] = await Promise.all([
    adminStudents(adminId),
    client()
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", adminId)
      .neq("status", "cancelled")
      .gte("start_time", startIso)
      .lt("start_time", endIso),
    client().from("bookings").select("*").eq("admin_id", adminId).eq("status", "pending_confirmation").order("start_time"),
    client()
      .from("bookings")
      .select("*")
      .eq("admin_id", adminId)
      .in("status", ACTIVE_STATUSES)
      .gt("start_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(3),
    // scheduled + horário já passou: não vira "completed" sozinha (ver reconcileBookingStatuses
    // acima) — fica visível aqui até o professor confirmar o que aconteceu.
    client()
      .from("bookings")
      .select("*")
      .eq("admin_id", adminId)
      .eq("status", "scheduled")
      .lt("end_time", nowIso)
      .order("start_time", { ascending: true }),
  ]);
  if (pendingRes.error) throw new Error(pendingRes.error.message);
  if (upcomingRes.error) throw new Error(upcomingRes.error.message);
  if (awaitingRes.error) throw new Error(awaitingRes.error.message);

  const byId = new Map(students.map((s) => [s.id, s]));
  const nameOf = (studentId: string) => byId.get(studentId)?.name ?? "Aluno";
  const credits = await creditsByStudent(students.map((s) => s.id));

  return {
    kpiToday: todayRes.count ?? 0,
    activeStudents: students.length,
    pending: (pendingRes.data ?? []).map((r) => ({ ...mapBooking(r), studentName: nameOf(r.student_id) })),
    upcoming: (upcomingRes.data ?? []).map((r) => ({ ...mapBooking(r), studentName: nameOf(r.student_id) })),
    awaitingConfirmation: (awaitingRes.data ?? []).map((r) => ({ ...mapBooking(r), studentName: nameOf(r.student_id) })),
    atRisk: students
      .map((student) => ({ student, credits: credits[student.id] ?? 0 }))
      .filter((x) => x.credits <= 1),
  };
}

/**
 * Versão em lote da mesma fórmula canônica, para listas de alunos (evita N chamadas de RPC). Um
 * aluno pode ter mais de um pacote `active` simultâneo agora (trial + pago) — soma o restante de
 * todos antes de descontar as reservas futuras, em vez de pegar "o" pacote.
 */
async function creditsByStudent(studentIds: string[]): Promise<Record<string, number>> {
  if (studentIds.length === 0) return {};
  const [pkgRes, bookingRes] = await Promise.all([
    client().from("packages").select("student_id, total_classes, used_classes").in("student_id", studentIds).eq("status", "active"),
    client()
      .from("bookings")
      .select("student_id")
      .in("student_id", studentIds)
      .in("status", ACTIVE_STATUSES)
      .gt("start_time", new Date().toISOString()),
  ]);
  if (pkgRes.error) throw new Error(pkgRes.error.message);
  if (bookingRes.error) throw new Error(bookingRes.error.message);

  const future: Record<string, number> = {};
  for (const b of bookingRes.data ?? []) future[b.student_id] = (future[b.student_id] ?? 0) + 1;

  const remaining: Record<string, number> = {};
  for (const id of studentIds) remaining[id] = 0;
  for (const p of pkgRes.data ?? []) {
    remaining[p.student_id] = (remaining[p.student_id] ?? 0) + (p.total_classes - p.used_classes);
  }

  const out: Record<string, number> = {};
  for (const id of studentIds) out[id] = Math.max(0, (remaining[id] ?? 0) - (future[id] ?? 0));
  return out;
}

// ---------------------------------------------------------------------------
// admin · agenda (timeline)
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  hour: string;
  free: boolean;
  booking?: Booking;
  studentName?: string;
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
      .neq("status", "cancelled")
      .gte("start_time", startIso)
      .lt("start_time", endIso),
    adminStudents(adminId),
  ]);
  if (slotsRes.error) throw new Error(slotsRes.error.message);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);

  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const bookings = bookingsRes.data ?? [];

  const hours = new Set<number>();
  for (const s of slotsRes.data ?? []) hours.add(brtHour(s.start_time));
  for (const b of bookings) hours.add(brtHour(b.start_time));

  return Array.from(hours)
    .sort((a, b) => a - b)
    .map((h) => {
      const booking = bookings.find((b) => brtHour(b.start_time) === h);
      if (!booking) return { hour: hhmm(h), free: true };
      return {
        hour: hhmm(h),
        free: false,
        booking: mapBooking(booking),
        studentName: nameOf.get(booking.student_id) ?? "Aluno",
      };
    });
}

export async function approveBooking(bookingId: string) {
  const { data, error } = await client()
    .from("bookings")
    .update({ status: "scheduled" })
    .eq("id", bookingId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapBooking(data);
}

export async function rejectBooking(bookingId: string, note: string, suggestedStart?: string | null, suggestedEnd?: string | null) {
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

/** Aulas do aluno que podem ser "a aula original" de uma reposição — canceladas ou faltas, mais recentes primeiro. */
export async function getReplaceableBookingsForStudent(studentId: string): Promise<Booking[]> {
  const { data, error } = await client()
    .from("bookings")
    .select("*")
    .eq("student_id", studentId)
    .in("status", ["no_show", "cancelled"])
    .order("start_time", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapBooking);
}

// ---------------------------------------------------------------------------
// admin · alunos
// ---------------------------------------------------------------------------

export async function getAdminStudents(adminId: string, search: string) {
  const students = await adminStudents(adminId);
  const ids = students.map((s) => s.id);
  const [credits, pkgRes] = await Promise.all([
    creditsByStudent(ids),
    ids.length
      ? client().from("packages").select("*").in("student_id", ids).eq("status", "active")
      : Promise.resolve({ data: [], error: null } as const),
  ]);
  if (pkgRes.error) throw new Error(pkgRes.error.message);

  const pkgByStudent = new Map<string, PackageRecord>();
  for (const row of pkgRes.data ?? []) pkgByStudent.set(row.student_id, mapPackage(row));

  const q = search.trim().toLowerCase();
  return students
    .map((student) => ({
      student,
      credits: credits[student.id] ?? 0,
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

  const [names, pkg, credits, historyRes] = await Promise.all([
    profileNames([row.profile_id]),
    activePackageForStudentRow(studentId),
    creditsAvailableFor(studentId),
    client().from("bookings").select("*").eq("student_id", studentId).order("start_time", { ascending: false }).limit(6),
  ]);
  if (historyRes.error) throw new Error(historyRes.error.message);

  const student: StudentRecord = {
    id: row.id,
    profileId: row.profile_id,
    adminId: row.admin_id,
    createdAt: row.created_at,
    name: names[row.profile_id] ?? "Aluno",
  };
  return { student, package: pkg, credits, history: (historyRes.data ?? []).map(mapBooking) };
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
// admin · histórico
// ---------------------------------------------------------------------------

export async function getAdminBookingHistory(
  adminId: string,
  search: string,
  statusFilter: string,
): Promise<{ booking: Booking; studentName: string }[]> {
  const [bookingsRes, students] = await Promise.all([
    client().from("bookings").select("*").eq("admin_id", adminId).order("start_time", { ascending: false }).limit(200),
    adminStudents(adminId),
  ]);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);

  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const q = search.trim().toLowerCase();
  return (bookingsRes.data ?? [])
    .filter((r) => statusFilter === "todas" || r.status === statusFilter)
    .map((r) => ({ booking: mapBooking(r), studentName: nameOf.get(r.student_id) ?? "Aluno" }))
    .filter((e) => !q || e.studentName.toLowerCase().includes(q));
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
    .select("id, no_show_consumes_class")
    .eq("id", adminId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { adminId: data.id, noShowConsumesClass: data.no_show_consumes_class } : null;
}

export async function updateNoShowConsumesClass(adminId: string, value: boolean) {
  const { error } = await client().from("profiles").update({ no_show_consumes_class: value }).eq("id", adminId);
  if (error) throw new Error(error.message);
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
    const [bookingsRes, requestsRes] = await Promise.all([
      client().from("bookings").select("*").eq("student_id", studentId).order("start_time", { ascending: false }).limit(40),
      client().from("purchase_requests").select("*").eq("student_id", studentId).neq("status", "pending").order("decided_at", { ascending: false }).limit(20),
    ]);
    for (const b of bookingsRes.data ?? []) {
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
    for (const r of requestsRes.data ?? []) {
      items.push({
        id: `request:${r.id}:${r.status}`,
        userId,
        kind: "system",
        title: r.status === "approved" ? "Pedido aprovado" : "Pedido recusado",
        description: r.status === "approved" ? "Seus créditos já estão disponíveis." : "Fale com seu professor para entender o motivo.",
        createdAt: r.decided_at ?? r.created_at,
        read: false,
        entity: { type: "purchase_requests" },
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
  patch: Pick<StudentProfile, "sex" | "heightCm" | "weightKg" | "guard" | "laterality">,
) {
  const { error } = await client()
    .from("student_profiles")
    .upsert(
      {
        student_id: studentId,
        sex: patch.sex,
        height_cm: patch.heightCm,
        weight_kg: patch.weightKg,
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
    completedAt: r.completed_at,
    primaryProfile: r.primary_profile,
    secondaryProfile: r.secondary_profile,
    dimensionScores: r.dimension_scores,
    profileScores: r.profile_scores,
  };
}

/**
 * Lista pra tela de histórico — nunca busca `answers` (pode ter até 32 chaves por linha; a lista
 * só precisa do resumo). Detalhe completo é uma chamada separada, só quando o aluno abre uma
 * avaliação específica.
 */
export async function getBoxingProfileHistory(studentId: string): Promise<BoxingProfileAssessmentSummary[]> {
  const { data, error } = await client()
    .from("boxing_profile_assessments")
    .select("id, completed_at, primary_profile, secondary_profile, dimension_scores, profile_scores")
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
    scoringVersion: data.scoring_version,
    createdAt: data.created_at,
  };
}

/**
 * Único ponto de escrita: calcula o resultado (scoreAssessment, determinístico, sem IA em
 * runtime) e persiste tudo — respostas, scores das 8 dimensões, scores dos 6 perfis, versão do
 * questionário e do algoritmo — numa única inserção atômica. Uma avaliação concluída nunca é
 * atualizada depois; refazer o teste sempre cria uma linha nova.
 */
export async function submitBoxingProfileAssessment(studentId: string, answers: BoxingAnswers): Promise<BoxingProfileAssessment> {
  if (!isBoxingProfileComplete(answers)) {
    throw new Error("Responda todas as questões antes de concluir.");
  }
  const result = scoreBoxingProfile(answers);
  const { data, error } = await client()
    .from("boxing_profile_assessments")
    .insert({
      student_id: studentId,
      assessment_type: "self",
      questionnaire_version: BOXING_QUESTIONNAIRE_VERSION,
      scoring_version: BOXING_SCORING_VERSION,
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
    scoringVersion: data.scoring_version,
    createdAt: data.created_at,
  };
}

export type { BookingStatus };

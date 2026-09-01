import { toZonedTime } from "date-fns-tz";
import { calcCreditsAvailable } from "@/lib/packageUtils";
import { TIMEZONE } from "@/lib/dateUtils";
import { supabase } from "@/integrations/supabase/client";
import type {
  AdminSettings,
  AppNotification,
  AvailabilitySlot,
  Booking,
  PackageRecord,
  PackageTemplate,
  PurchaseRequest,
  StudentRecord,
} from "./types";
import type { BookingStatus } from "@/lib/bookingStatus";

function client() {
  if (!supabase) throw new Error("Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes).");
  return supabase;
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------------------------------------------------------------------------
// row → app-type mappers (snake_case DB rows → the camelCase shapes every page already uses)
// ---------------------------------------------------------------------------

function mapBooking(r: any): Booking {
  return {
    id: r.id,
    studentId: r.student_id,
    adminId: r.admin_id,
    startTime: r.start_time,
    endTime: r.end_time,
    status: r.status,
    cancelReason: r.cancel_reason,
    teacherNote: r.teacher_note,
    suggestedStartTime: r.suggested_start_time,
    suggestedEndTime: r.suggested_end_time,
    isMakeup: r.is_makeup,
    refunded: r.refunded,
  };
}

function mapPackage(r: any): PackageRecord {
  return {
    id: r.id,
    studentId: r.student_id,
    totalClasses: r.total_classes,
    usedClasses: r.used_classes,
    status: r.status,
    templateName: r.template_name,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
}

function mapTemplate(r: any): PackageTemplate {
  return {
    id: r.id,
    adminId: r.admin_id,
    name: r.name,
    description: r.description,
    totalClasses: r.total_classes,
    priceCents: r.price_cents,
    validityDays: r.validity_days,
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

function mapNotification(r: any): AppNotification {
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    createdAt: r.created_at,
    read: r.read,
    relatedBookingId: r.related_booking_id,
  };
}

function mapSlot(r: any): AvailabilitySlot {
  return { id: r.id, adminId: r.admin_id, weekday: r.weekday, startTime: r.start_time.slice(0, 5), endTime: r.end_time.slice(0, 5) };
}

function mapSettings(r: any): AdminSettings {
  return { adminId: r.admin_id, noShowConsumesClass: r.no_show_consumes_class, availabilityDayActive: r.availability_day_active ?? {} };
}

/** Fetches {id: name} for a set of profile ids in one round trip. */
async function namesFor(ids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return {};
  const { data, error } = await client().from("profiles").select("id, name").in("id", unique);
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.id] = row.name;
  return map;
}

function weekdayOf(date: Date) {
  return toZonedTime(date, TIMEZONE).getDay();
}

function dayBoundsUtcIso(date: Date) {
  const zoned = toZonedTime(date, TIMEZONE);
  const start = new Date(zoned);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

// ---------------------------------------------------------------------------
// student · home / package
// ---------------------------------------------------------------------------

export async function activePackageFor(studentId: string): Promise<PackageRecord | null> {
  const { data, error } = await client()
    .from("packages")
    .select("*")
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapPackage(data) : null;
}

async function futureScheduledCount(studentId: string): Promise<number> {
  const { count, error } = await client()
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .in("status", ["scheduled", "pending_confirmation"])
    .gt("start_time", new Date().toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function creditsAvailableFor(studentId: string): Promise<number> {
  const pkg = await activePackageFor(studentId);
  if (!pkg) return 0;
  const future = await futureScheduledCount(studentId);
  return calcCreditsAvailable(pkg.totalClasses, pkg.usedClasses, future);
}

export async function getStudentHome(studentId: string) {
  const [pkg, credits, upcomingRes, suggestionRes] = await Promise.all([
    activePackageFor(studentId),
    creditsAvailableFor(studentId),
    client()
      .from("bookings")
      .select("*")
      .eq("student_id", studentId)
      .in("status", ["scheduled", "pending_confirmation"])
      .gt("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(1)
      .maybeSingle(),
    client().from("bookings").select("*").eq("student_id", studentId).eq("status", "rejected_with_suggestion").maybeSingle(),
  ]);
  return {
    package: pkg,
    credits,
    nextBooking: upcomingRes.data ? mapBooking(upcomingRes.data) : null,
    suggestion: suggestionRes.data ? mapBooking(suggestionRes.data) : null,
  };
}

export async function getPackageTemplates(adminId: string): Promise<PackageTemplate[]> {
  const { data, error } = await client().from("package_templates").select("*").eq("admin_id", adminId).order("total_classes");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTemplate);
}

export async function getStudentPackages(studentId: string) {
  const { data, error } = await client().from("packages").select("*").eq("student_id", studentId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPackage);
}

/** The admin_id of the (single, per spec §1) admin a student belongs to. */
export async function getStudentAdminId(studentId: string): Promise<string> {
  const { data, error } = await client().from("students").select("admin_id").eq("id", studentId).single();
  if (error) throw new Error(error.message);
  return data.admin_id;
}

// ---------------------------------------------------------------------------
// student · agendar
// ---------------------------------------------------------------------------

export interface DaySlot {
  time: string; // "HH:mm"
  status: "free" | "booked" | "own";
}

export async function getAvailableSlotsForDay(adminId: string, date: Date): Promise<DaySlot[]> {
  const wd = weekdayOf(date);
  const { data: settingsRow } = await client().from("admin_settings").select("availability_day_active").eq("admin_id", adminId).maybeSingle();
  const dayActive = settingsRow?.availability_day_active?.[String(wd)];
  if (dayActive === false) return [];

  const { data: slots, error: slotsErr } = await client()
    .from("availability_slots")
    .select("start_time, end_time")
    .eq("admin_id", adminId)
    .eq("weekday", wd);
  if (slotsErr) throw new Error(slotsErr.message);

  const { startIso, endIso } = dayBoundsUtcIso(date);
  const { data: bookings, error: bookErr } = await client()
    .from("bookings")
    .select("start_time")
    .eq("admin_id", adminId)
    .in("status", ["scheduled", "pending_confirmation"])
    .gte("start_time", startIso)
    .lt("start_time", endIso);
  if (bookErr) throw new Error(bookErr.message);

  const hours: string[] = [];
  for (const slot of slots ?? []) {
    const startH = parseInt(slot.start_time, 10);
    const endH = parseInt(slot.end_time, 10);
    for (let h = startH; h < endH; h++) hours.push(String(h).padStart(2, "0") + ":00");
  }
  const uniqueHours = Array.from(new Set(hours)).sort();
  const bookedHours = new Set((bookings ?? []).map((b) => toZonedTime(new Date(b.start_time), TIMEZONE).getHours()));

  return uniqueHours.map((time) => ({ time, status: bookedHours.has(parseInt(time, 10)) ? "booked" : "free" }));
}

export async function scheduleBooking(_studentId: string, adminId: string, startTime: string, endTime: string) {
  const { data, error } = await client().rpc("schedule_booking", { p_admin_id: adminId, p_start: startTime, p_end: endTime });
  if (error) throw new Error(error.message);
  return mapBooking(data);
}

export async function cancelBooking(bookingId: string) {
  const { data, error } = await client().from("bookings").update({ status: "cancelled" }).eq("id", bookingId).select().single();
  if (error) throw new Error(error.message);
  return mapBooking(data);
}

export async function acceptSuggestion(bookingId: string) {
  const { data: current, error: readErr } = await client().from("bookings").select("suggested_start_time, suggested_end_time").eq("id", bookingId).single();
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
    .single();
  if (error) throw new Error(error.message);
  return mapBooking(data);
}

// ---------------------------------------------------------------------------
// student · histórico / detalhe
// ---------------------------------------------------------------------------

export async function getStudentBookingHistory(
  studentId: string,
  tab: "proximas" | "anteriores" | "todas",
): Promise<Booking[]> {
  const { data, error } = await client().rpc("get_student_booking_history", { p_cursor: null, p_limit: 200 });
  if (error) throw new Error(error.message);
  const now = Date.now();
  return (data ?? [])
    .filter((r: any) => r.student_id === studentId)
    .filter((r: any) => {
      const isFuture = new Date(r.start_time).getTime() > now;
      if (tab === "proximas") return isFuture;
      if (tab === "anteriores") return !isFuture;
      return true;
    })
    .map(mapBooking);
}

export async function getBookingById(bookingId: string): Promise<Booking | undefined> {
  const { data, error } = await client().from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapBooking(data) : undefined;
}

// ---------------------------------------------------------------------------
// student · pacotes / solicitações
// ---------------------------------------------------------------------------

export async function requestPackage(_studentId: string, adminId: string, templateId: string) {
  const { data, error } = await client().rpc("request_package", { p_admin_id: adminId, p_template_id: templateId });
  if (error) throw new Error(error.message);
  return mapRequest(data);
}

export async function requestSingleClass(_studentId: string, adminId: string, templateId: string) {
  const { data, error } = await client().rpc("request_single_class", { p_admin_id: adminId, p_template_id: templateId });
  if (error) throw new Error(error.message);
  return mapRequest(data);
}

// ---------------------------------------------------------------------------
// admin · dashboard
// ---------------------------------------------------------------------------

export async function reconcileBookingStatuses(_adminId: string) {
  const { data, error } = await client().rpc("reconcile_booking_statuses");
  if (error) throw new Error(error.message);
  return data as number;
}

export async function getAdminDashboard(adminId: string) {
  const nowIso = new Date().toISOString();
  const [studentsRes, todayCountRes, pendingRes, upcomingRes] = await Promise.all([
    client().from("students").select("id, admin_id, created_at").eq("admin_id", adminId),
    client()
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", adminId)
      .neq("status", "cancelled")
      .gte("start_time", dayBoundsUtcIso(new Date()).startIso)
      .lt("start_time", dayBoundsUtcIso(new Date()).endIso),
    client().from("bookings").select("*").eq("admin_id", adminId).eq("status", "pending_confirmation"),
    client()
      .from("bookings")
      .select("*")
      .eq("admin_id", adminId)
      .in("status", ["scheduled", "pending_confirmation"])
      .gt("start_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(3),
  ]);
  if (studentsRes.error) throw new Error(studentsRes.error.message);
  if (pendingRes.error) throw new Error(pendingRes.error.message);
  if (upcomingRes.error) throw new Error(upcomingRes.error.message);

  const studentRows = studentsRes.data ?? [];
  const pendingRows = pendingRes.data ?? [];
  const upcomingRows = upcomingRes.data ?? [];
  const names = await namesFor([
    ...studentRows.map((r) => r.id),
    ...pendingRows.map((r: any) => r.student_id),
    ...upcomingRows.map((r: any) => r.student_id),
  ]);
  const students: StudentRecord[] = studentRows.map((r) => ({
    id: r.id,
    adminId: r.admin_id,
    createdAt: r.created_at,
    name: names[r.id] ?? "Aluno",
  }));

  const atRiskEntries = await Promise.all(
    students.map(async (s) => ({ student: s, credits: await creditsAvailableFor(s.id) })),
  );

  return {
    kpiToday: todayCountRes.count ?? 0,
    activeStudents: students.length,
    pending: pendingRows.map((r: any) => ({ ...mapBooking(r), studentName: names[r.student_id] ?? "Aluno" })),
    upcoming: upcomingRows.map((r: any) => ({ ...mapBooking(r), studentName: names[r.student_id] ?? "Aluno" })),
    atRisk: atRiskEntries.filter((x) => x.credits <= 1),
  };
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
  const wd = weekdayOf(date);
  const { data: slots, error: slotsErr } = await client().from("availability_slots").select("start_time, end_time").eq("admin_id", adminId).eq("weekday", wd);
  if (slotsErr) throw new Error(slotsErr.message);

  const { startIso, endIso } = dayBoundsUtcIso(date);
  const { data: bookings, error: bookErr } = await client()
    .from("bookings")
    .select("*")
    .eq("admin_id", adminId)
    .neq("status", "cancelled")
    .gte("start_time", startIso)
    .lt("start_time", endIso);
  if (bookErr) throw new Error(bookErr.message);

  const names = await namesFor((bookings ?? []).map((b: any) => b.student_id));

  const hourSet = new Set<number>();
  for (const slot of slots ?? []) {
    const startH = parseInt(slot.start_time, 10);
    const endH = parseInt(slot.end_time, 10);
    for (let h = startH; h < endH; h++) hourSet.add(h);
  }
  for (const b of bookings ?? []) hourSet.add(toZonedTime(new Date(b.start_time), TIMEZONE).getHours());

  const hours = Array.from(hourSet).sort((a, b) => a - b);
  return hours.map((h) => {
    const time = String(h).padStart(2, "0") + ":00";
    const booking = (bookings ?? []).find((b: any) => toZonedTime(new Date(b.start_time), TIMEZONE).getHours() === h);
    if (!booking) return { hour: time, free: true };
    return { hour: time, free: false, booking: mapBooking(booking), studentName: names[booking.student_id] ?? "Aluno" };
  });
}

export async function approveBooking(bookingId: string) {
  const { data, error } = await client().from("bookings").update({ status: "scheduled" }).eq("id", bookingId).select().single();
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

export async function completeBooking(bookingId: string) {
  const { error } = await client().rpc("complete_booking", { p_booking_id: bookingId });
  if (error) throw new Error(error.message);
}

export async function markNoShow(bookingId: string) {
  const { error } = await client().rpc("mark_no_show", { p_booking_id: bookingId });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// admin · alunos
// ---------------------------------------------------------------------------

export async function getAdminStudents(adminId: string, search: string) {
  const { data: students, error } = await client().from("students").select("id, admin_id, created_at").eq("admin_id", adminId);
  if (error) throw new Error(error.message);
  const rows = students ?? [];
  const names = await namesFor(rows.map((s) => s.id));
  const q = search.trim().toLowerCase();

  const entries = await Promise.all(
    rows.map(async (s) => ({
      student: { id: s.id, adminId: s.admin_id, createdAt: s.created_at, name: names[s.id] ?? "Aluno" } as StudentRecord,
      credits: await creditsAvailableFor(s.id),
      package: await activePackageFor(s.id),
    })),
  );
  return entries.filter((e) => !q || e.student.name.toLowerCase().includes(q));
}

export async function getAdminStudentDetail(studentId: string) {
  const [studentRes, names, pkg, credits, historyRes] = await Promise.all([
    client().from("students").select("id, admin_id, created_at").eq("id", studentId).single(),
    namesFor([studentId]),
    activePackageFor(studentId),
    creditsAvailableFor(studentId),
    client().from("booking_history_app").select("*").eq("student_id", studentId).order("start_time", { ascending: false }).limit(6),
  ]);
  if (studentRes.error) throw new Error(studentRes.error.message);
  if (historyRes.error) throw new Error(historyRes.error.message);

  const student: StudentRecord = {
    id: studentRes.data.id,
    adminId: studentRes.data.admin_id,
    createdAt: studentRes.data.created_at,
    name: names[studentId] ?? "Aluno",
  };
  return { student, package: pkg, credits, history: (historyRes.data ?? []).map(mapBooking) };
}

export async function assignPackageFromTemplate(studentId: string, templateId: string) {
  const { data, error } = await client().rpc("assign_package_from_template", { p_student_id: studentId, p_template_id: templateId });
  if (error) throw new Error(error.message);
  return mapPackage(data);
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
  const { data, error } = await client().rpc("get_admin_booking_history", { p_cursor: null, p_limit: 200 });
  if (error) throw new Error(error.message);
  const q = search.trim().toLowerCase();
  return (data ?? [])
    .filter((r: any) => r.admin_id === adminId)
    .filter((r: any) => statusFilter === "todas" || r.status === statusFilter)
    .filter((r: any) => !q || (r.student_name ?? "").toLowerCase().includes(q))
    .map((r: any) => ({ booking: mapBooking(r), studentName: r.student_name ?? "Aluno" }));
}

/** Only completed/no_show bookings consumed a credit, and a booking can only be refunded once. */
export function canRefundBooking(booking: Pick<Booking, "status" | "refunded">) {
  return (booking.status === "completed" || booking.status === "no_show") && !booking.refunded;
}

export async function refundBooking(bookingId: string) {
  const { data: booking, error: readErr } = await client().from("bookings").select("student_id, status, refunded").eq("id", bookingId).single();
  if (readErr) throw new Error(readErr.message);
  if (!canRefundBooking(booking)) return;

  const { data: pkg } = await client().from("packages").select("id, used_classes").eq("student_id", booking.student_id).eq("status", "active").maybeSingle();
  if (pkg && pkg.used_classes > 0) {
    await unwrap(await client().from("packages").update({ used_classes: pkg.used_classes - 1 }).eq("id", pkg.id).select().maybeSingle());
  }
  const { error } = await client().from("bookings").update({ refunded: true }).eq("id", bookingId);
  if (error) throw new Error(error.message);
}

export async function undoRefundBooking(bookingId: string) {
  const { data: booking, error: readErr } = await client().from("bookings").select("student_id, refunded").eq("id", bookingId).single();
  if (readErr) throw new Error(readErr.message);
  if (!booking.refunded) return;

  const { data: pkg } = await client().from("packages").select("id, used_classes").eq("student_id", booking.student_id).eq("status", "active").maybeSingle();
  if (pkg) {
    await client().from("packages").update({ used_classes: pkg.used_classes + 1 }).eq("id", pkg.id);
  }
  const { error } = await client().from("bookings").update({ refunded: false }).eq("id", bookingId);
  if (error) throw new Error(error.message);
}

export async function markBookingAsMakeup(bookingId: string) {
  const { error } = await client().from("bookings").update({ is_makeup: true }).eq("id", bookingId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// admin · pedidos (purchase requests)
// ---------------------------------------------------------------------------

export async function getPurchaseRequests(adminId: string) {
  const { data, error } = await client().from("purchase_requests").select("*").eq("admin_id", adminId).eq("status", "pending").order("created_at");
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const [names, templatesRes] = await Promise.all([
    namesFor(rows.map((r) => r.student_id)),
    client().from("package_templates").select("*").in("id", Array.from(new Set(rows.map((r) => r.template_id).filter(Boolean)))),
  ]);
  const templates: Record<string, PackageTemplate> = {};
  for (const t of templatesRes.data ?? []) templates[t.id] = mapTemplate(t);

  return rows.map((r) => ({
    request: mapRequest(r),
    studentName: names[r.student_id] ?? "Aluno",
    template: r.template_id ? (templates[r.template_id] ?? null) : null,
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

export async function restorePurchaseRequest(requestId: string) {
  const { error } = await client().from("purchase_requests").update({ status: "pending", decided_at: null }).eq("id", requestId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// admin · pacotes (templates CRUD)
// ---------------------------------------------------------------------------

export async function createPackageTemplate(adminId: string, data: Omit<PackageTemplate, "id" | "adminId">) {
  const { data: row, error } = await client()
    .from("package_templates")
    .insert({
      admin_id: adminId,
      name: data.name,
      description: data.description,
      total_classes: data.totalClasses,
      price_cents: data.priceCents,
      validity_days: data.validityDays,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapTemplate(row);
}

export async function updatePackageTemplate(id: string, data: Partial<Omit<PackageTemplate, "id" | "adminId">>) {
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

export async function deletePackageTemplate(id: string) {
  const { error } = await client().from("package_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// admin · disponibilidade
// ---------------------------------------------------------------------------

export const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export interface AvailabilityDay {
  weekday: number;
  name: string;
  active: boolean;
  slots: (AvailabilitySlot & { bookedCount: number })[];
}

export async function getAvailability(adminId: string): Promise<AvailabilityDay[]> {
  const [settingsRes, slotsRes, bookingsRes] = await Promise.all([
    client().from("admin_settings").select("*").eq("admin_id", adminId).maybeSingle(),
    client().from("availability_slots").select("*").eq("admin_id", adminId),
    client()
      .from("bookings")
      .select("start_time")
      .eq("admin_id", adminId)
      .in("status", ["scheduled", "pending_confirmation"])
      .gt("start_time", new Date().toISOString()),
  ]);
  if (slotsRes.error) throw new Error(slotsRes.error.message);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);

  const settings = settingsRes.data ? mapSettings(settingsRes.data) : null;
  const slots = (slotsRes.data ?? []).map(mapSlot);
  const bookingTimes = (bookingsRes.data ?? []).map((b) => toZonedTime(new Date(b.start_time), TIMEZONE));

  function bookedCount(weekday: number, start: string, end: string) {
    const s = parseInt(start, 10);
    const e = parseInt(end, 10);
    return bookingTimes.filter((d) => d.getDay() === weekday && d.getHours() >= s && d.getHours() < e).length;
  }

  return WEEKDAY_NAMES.map((name, weekday) => ({
    weekday,
    name,
    active: settings?.availabilityDayActive[weekday] ?? true,
    slots: slots
      .filter((s) => s.weekday === weekday)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((s) => ({ ...s, bookedCount: bookedCount(weekday, s.startTime, s.endTime) })),
  }));
}

async function ensureSettingsRow(adminId: string) {
  const { data } = await client().from("admin_settings").select("admin_id").eq("admin_id", adminId).maybeSingle();
  if (!data) {
    await client().from("admin_settings").insert({ admin_id: adminId });
  }
}

export async function toggleAvailabilityDay(adminId: string, weekday: number, active: boolean) {
  await ensureSettingsRow(adminId);
  const { data: row, error: readErr } = await client().from("admin_settings").select("availability_day_active").eq("admin_id", adminId).single();
  if (readErr) throw new Error(readErr.message);
  const next = { ...(row.availability_day_active ?? {}), [String(weekday)]: active };
  const { error } = await client().from("admin_settings").update({ availability_day_active: next }).eq("admin_id", adminId);
  if (error) throw new Error(error.message);
}

export async function saveAvailabilitySlot(
  adminId: string,
  weekday: number,
  start: string,
  end: string,
  id?: string | null,
): Promise<{ error?: string; slot?: AvailabilitySlot }> {
  const s = parseInt(start, 10);
  const e = parseInt(end, 10);
  if (e <= s) return { error: "O fim precisa ser depois do início." };

  const { data: daySlots, error: readErr } = await client().from("availability_slots").select("id, start_time, end_time").eq("admin_id", adminId).eq("weekday", weekday);
  if (readErr) return { error: readErr.message };
  const clash = (daySlots ?? []).some((sl) => sl.id !== id && parseInt(sl.start_time, 10) < e && s < parseInt(sl.end_time, 10));
  if (clash) return { error: `Esse intervalo conflita com outro já cadastrado em ${WEEKDAY_NAMES[weekday]}.` };

  if (id) {
    const { data, error } = await client().from("availability_slots").update({ start_time: start, end_time: end }).eq("id", id).select().single();
    if (error) return { error: error.message };
    return { slot: mapSlot(data) };
  }

  const { data, error } = await client().from("availability_slots").insert({ admin_id: adminId, weekday, start_time: start, end_time: end }).select().single();
  if (error) return { error: error.message };
  await ensureSettingsRow(adminId);
  const { data: row } = await client().from("admin_settings").select("availability_day_active").eq("admin_id", adminId).single();
  const next = { ...(row?.availability_day_active ?? {}), [String(weekday)]: true };
  await client().from("admin_settings").update({ availability_day_active: next }).eq("admin_id", adminId);
  return { slot: mapSlot(data) };
}

export async function deleteAvailabilitySlot(id: string) {
  const { error } = await client().from("availability_slots").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function restoreAvailabilitySlot(slot: AvailabilitySlot) {
  const { error } = await client().from("availability_slots").insert({
    id: slot.id,
    admin_id: slot.adminId,
    weekday: slot.weekday,
    start_time: slot.startTime,
    end_time: slot.endTime,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// configurações
// ---------------------------------------------------------------------------

export async function getAdminSettings(adminId: string): Promise<AdminSettings | null> {
  const { data, error } = await client().from("admin_settings").select("*").eq("admin_id", adminId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSettings(data) : null;
}

export async function updateNoShowConsumesClass(adminId: string, value: boolean) {
  await ensureSettingsRow(adminId);
  const { error } = await client().from("admin_settings").update({ no_show_consumes_class: value }).eq("admin_id", adminId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// notificações
// ---------------------------------------------------------------------------

export async function getNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await client().from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapNotification);
}

export async function markNotificationRead(id: string) {
  const { error } = await client().from("notifications").update({ read: true }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await client().from("notifications").update({ read: true }).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function clearNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await client().from("notifications").select("*").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const removed = (data ?? []).map(mapNotification);
  const { error: delErr } = await client().from("notifications").delete().eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);
  return removed;
}

export async function restoreNotifications(items: AppNotification[]) {
  if (items.length === 0) return;
  const { error } = await client()
    .from("notifications")
    .insert(
      items.map((n) => ({
        id: n.id,
        user_id: n.userId,
        kind: n.kind,
        title: n.title,
        description: n.description,
        created_at: n.createdAt,
        read: n.read,
        related_booking_id: n.relatedBookingId,
      })),
    );
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// convites
// ---------------------------------------------------------------------------

export async function validateInvite(token: string) {
  const { data, error } = await client().rpc("validate_invite", { p_token: token });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return null;
  return { invite: { token, adminId: row.admin_id, createdAt: "", usedAt: null }, adminName: row.admin_name ?? "Professor" };
}

/** Links the already-authenticated user (must have just signed up) as a student of this invite's admin. */
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

export type { BookingStatus };

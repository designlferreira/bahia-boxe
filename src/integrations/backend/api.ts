import { addDays, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { calcCreditsAvailable } from "@/lib/packageUtils";
import { TIMEZONE } from "@/lib/dateUtils";
import { getDb, mutate, genId, DEMO_ADMIN_ID } from "./store";
import type {
  AppNotification,
  AvailabilitySlot,
  Booking,
  PackageRecord,
  PackageTemplate,
  PurchaseRequest,
  StudentRecord,
} from "./types";
import type { BookingStatus } from "@/lib/bookingStatus";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function futureScheduledCount(bookings: Booking[], studentId: string) {
  const now = Date.now();
  return bookings.filter(
    (b) =>
      b.studentId === studentId &&
      (b.status === "scheduled" || b.status === "pending_confirmation") &&
      new Date(b.startTime).getTime() > now,
  ).length;
}

export function activePackageFor(studentId: string): PackageRecord | undefined {
  return getDb().packages.find((p) => p.studentId === studentId && p.status === "active");
}

export function creditsAvailableFor(studentId: string): number {
  const pkg = activePackageFor(studentId);
  if (!pkg) return 0;
  const future = futureScheduledCount(getDb().bookings, studentId);
  return calcCreditsAvailable(pkg.totalClasses, pkg.usedClasses, future);
}

function weekdayOf(date: Date) {
  return toZonedTime(date, TIMEZONE).getDay();
}

async function delay(ms = 350) {
  await new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// student · home / package
// ---------------------------------------------------------------------------

export async function getStudentHome(studentId: string) {
  await delay();
  const db = getDb();
  const pkg = activePackageFor(studentId);
  const credits = creditsAvailableFor(studentId);
  const now = Date.now();
  const upcoming = db.bookings
    .filter(
      (b) =>
        b.studentId === studentId &&
        (b.status === "scheduled" || b.status === "pending_confirmation") &&
        new Date(b.startTime).getTime() > now,
    )
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
  const suggestion = db.bookings.find((b) => b.studentId === studentId && b.status === "rejected_with_suggestion");
  return { package: pkg ?? null, credits, nextBooking: upcoming ?? null, suggestion: suggestion ?? null };
}

export async function getPackageTemplates(adminId = DEMO_ADMIN_ID): Promise<PackageTemplate[]> {
  await delay(200);
  return getDb().packageTemplates.filter((t) => t.adminId === adminId);
}

export async function getStudentPackages(studentId: string) {
  await delay(250);
  return getDb().packages.filter((p) => p.studentId === studentId);
}

// ---------------------------------------------------------------------------
// student · agendar
// ---------------------------------------------------------------------------

export interface DaySlot {
  time: string; // "HH:mm"
  status: "free" | "booked" | "own";
}

export async function getAvailableSlotsForDay(adminId: string, date: Date): Promise<DaySlot[]> {
  await delay(300);
  const db = getDb();
  const wd = weekdayOf(date);
  const settings = db.adminSettings.find((s) => s.adminId === adminId);
  if (settings && settings.availabilityDayActive[wd] === false) return [];

  const daySlots = db.availabilitySlots.filter((s) => s.adminId === adminId && s.weekday === wd);
  const dayStr = startOfDay(toZonedTime(date, TIMEZONE)).toISOString().slice(0, 10);
  const dayBookings = db.bookings.filter(
    (b) =>
      b.adminId === adminId &&
      (b.status === "scheduled" || b.status === "pending_confirmation") &&
      toZonedTime(new Date(b.startTime), TIMEZONE).toISOString().slice(0, 10) === dayStr,
  );

  const hours: string[] = [];
  for (const slot of daySlots) {
    const startH = parseInt(slot.startTime, 10);
    const endH = parseInt(slot.endTime, 10);
    for (let h = startH; h < endH; h++) hours.push(String(h).padStart(2, "0") + ":00");
  }
  const uniqueHours = Array.from(new Set(hours)).sort();

  return uniqueHours.map((time) => {
    const hour = parseInt(time, 10);
    const booked = dayBookings.some((b) => toZonedTime(new Date(b.startTime), TIMEZONE).getHours() === hour);
    return { time, status: booked ? "booked" : "free" };
  });
}

export async function scheduleBooking(studentId: string, adminId: string, startTime: string, endTime: string) {
  await delay(400);
  return mutate((db) => {
    const booking: Booking = {
      id: genId("bk"),
      studentId,
      adminId,
      startTime,
      endTime,
      status: "pending_confirmation",
    };
    db.bookings.unshift(booking);
    return booking;
  });
}

export async function cancelBooking(bookingId: string) {
  await delay(300);
  return mutate((db) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (b) b.status = "cancelled";
    return b;
  });
}

export async function acceptSuggestion(bookingId: string) {
  await delay(400);
  return mutate((db) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (b && b.suggestedStartTime && b.suggestedEndTime) {
      b.startTime = b.suggestedStartTime;
      b.endTime = b.suggestedEndTime;
      b.status = "scheduled";
      b.suggestedStartTime = null;
      b.suggestedEndTime = null;
    }
    return b;
  });
}

// ---------------------------------------------------------------------------
// student · histórico / detalhe
// ---------------------------------------------------------------------------

export async function getStudentBookingHistory(studentId: string, tab: "proximas" | "anteriores" | "todas") {
  await delay(350);
  const now = Date.now();
  return getDb()
    .bookings.filter((b) => b.studentId === studentId)
    .filter((b) => {
      const isFuture = new Date(b.startTime).getTime() > now;
      if (tab === "proximas") return isFuture;
      if (tab === "anteriores") return !isFuture;
      return true;
    })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
}

export async function getBookingById(bookingId: string): Promise<Booking | undefined> {
  await delay(200);
  return getDb().bookings.find((b) => b.id === bookingId);
}

// ---------------------------------------------------------------------------
// student · pacotes / solicitações
// ---------------------------------------------------------------------------

export async function requestPackage(studentId: string, adminId: string, templateId: string) {
  await delay(400);
  return mutate((db) => {
    const req: PurchaseRequest = {
      id: genId("pr"),
      studentId,
      adminId,
      kind: "package",
      templateId,
      status: "pending",
      notes: null,
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };
    db.purchaseRequests.push(req);
    return req;
  });
}

export async function requestSingleClass(studentId: string, adminId: string, templateId: string) {
  await delay(400);
  return mutate((db) => {
    const req: PurchaseRequest = {
      id: genId("pr"),
      studentId,
      adminId,
      kind: "single_class",
      templateId,
      status: "pending",
      notes: null,
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };
    db.purchaseRequests.push(req);
    return req;
  });
}

// ---------------------------------------------------------------------------
// admin · dashboard
// ---------------------------------------------------------------------------

export async function reconcileBookingStatuses(adminId: string) {
  return mutate((db) => {
    const now = Date.now();
    let changed = 0;
    for (const b of db.bookings) {
      if (b.adminId === adminId && b.status === "scheduled" && new Date(b.endTime).getTime() < now) {
        b.status = "completed";
        changed++;
      }
    }
    return changed;
  });
}

export async function getAdminDashboard(adminId: string) {
  await delay();
  const db = getDb();
  const students = db.students.filter((s) => s.adminId === adminId);
  const now = new Date();
  const todayBookings = db.bookings.filter(
    (b) => b.adminId === adminId && b.status !== "cancelled" && isSameDay(new Date(b.startTime), now),
  );
  const withName = (b: Booking) => ({ ...b, studentName: db.students.find((s) => s.id === b.studentId)?.name ?? "Aluno" });
  const pending = todayOrFuturePending(db.bookings, adminId).map(withName);
  const upcoming = db.bookings
    .filter((b) => b.adminId === adminId && (b.status === "scheduled" || b.status === "pending_confirmation"))
    .filter((b) => new Date(b.startTime).getTime() > Date.now())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 3)
    .map(withName);
  const atRisk = students
    .map((s) => ({ student: s, credits: creditsAvailableFor(s.id) }))
    .filter((x) => x.credits <= 1);

  return {
    kpiToday: todayBookings.length,
    activeStudents: students.length,
    pending,
    upcoming,
    atRisk,
  };
}

function isSameDay(a: Date, b: Date) {
  const za = toZonedTime(a, TIMEZONE);
  const zb = toZonedTime(b, TIMEZONE);
  return za.toDateString() === zb.toDateString();
}

function todayOrFuturePending(bookings: Booking[], adminId: string) {
  return bookings.filter((b) => b.adminId === adminId && b.status === "pending_confirmation");
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
  await delay(350);
  const db = getDb();
  const wd = weekdayOf(date);
  const daySlots = db.availabilitySlots.filter((s) => s.adminId === adminId && s.weekday === wd);
  const hourSet = new Set<number>();
  for (const slot of daySlots) {
    const startH = parseInt(slot.startTime, 10);
    const endH = parseInt(slot.endTime, 10);
    for (let h = startH; h < endH; h++) hourSet.add(h);
  }

  const dayBookings = db.bookings.filter(
    (b) => b.adminId === adminId && b.status !== "cancelled" && isSameDay(new Date(b.startTime), date),
  );
  for (const b of dayBookings) hourSet.add(toZonedTime(new Date(b.startTime), TIMEZONE).getHours());

  const hours = Array.from(hourSet).sort((a, b) => a - b);
  return hours.map((h) => {
    const time = String(h).padStart(2, "0") + ":00";
    const booking = dayBookings.find((b) => toZonedTime(new Date(b.startTime), TIMEZONE).getHours() === h);
    if (!booking) return { hour: time, free: true };
    const student = db.students.find((s) => s.id === booking.studentId);
    return { hour: time, free: false, booking, studentName: student?.name ?? "Aluno" };
  });
}

export async function approveBooking(bookingId: string) {
  await delay(300);
  return mutate((db) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (b) b.status = "scheduled";
    return b;
  });
}

export async function rejectBooking(
  bookingId: string,
  note: string,
  suggestedStart?: string | null,
  suggestedEnd?: string | null,
) {
  await delay(300);
  return mutate((db) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (b) {
      b.status = suggestedStart && suggestedEnd ? "rejected_with_suggestion" : "rejected";
      b.teacherNote = note || null;
      b.suggestedStartTime = suggestedStart ?? null;
      b.suggestedEndTime = suggestedEnd ?? null;
    }
    return b;
  });
}

export async function completeBooking(bookingId: string) {
  await delay(300);
  return mutate((db) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b) return b;
    b.status = "completed";
    const pkg = db.packages.find((p) => p.studentId === b.studentId && p.status === "active");
    if (pkg) pkg.usedClasses += 1;
    return b;
  });
}

export async function markNoShow(bookingId: string) {
  await delay(300);
  return mutate((db) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b) return b;
    b.status = "no_show";
    const settings = db.adminSettings.find((s) => s.adminId === b.adminId);
    if (settings?.noShowConsumesClass) {
      const pkg = db.packages.find((p) => p.studentId === b.studentId && p.status === "active");
      if (pkg) pkg.usedClasses += 1;
    }
    return b;
  });
}

// ---------------------------------------------------------------------------
// admin · alunos
// ---------------------------------------------------------------------------

export async function getAdminStudents(adminId: string, search: string) {
  await delay(300);
  const q = search.trim().toLowerCase();
  return getDb()
    .students.filter((s) => s.adminId === adminId)
    .filter((s) => !q || s.name.toLowerCase().includes(q))
    .map((s) => ({ student: s, credits: creditsAvailableFor(s.id), package: activePackageFor(s.id) }));
}

export async function getAdminStudentDetail(studentId: string) {
  await delay(300);
  const db = getDb();
  const student = db.students.find((s) => s.id === studentId) as StudentRecord;
  const pkg = activePackageFor(studentId);
  const history = db.bookings
    .filter((b) => b.studentId === studentId)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 6);
  return { student, package: pkg ?? null, credits: creditsAvailableFor(studentId), history };
}

export async function assignPackageFromTemplate(studentId: string, templateId: string) {
  await delay(400);
  return mutate((db) => {
    const template = db.packageTemplates.find((t) => t.id === templateId);
    if (!template) return null;
    for (const p of db.packages) {
      if (p.studentId === studentId && p.status === "active") p.status = "finished";
    }
    const pkg: PackageRecord = {
      id: genId("pkg"),
      studentId,
      totalClasses: template.totalClasses,
      usedClasses: 0,
      status: "active",
      templateName: template.name,
      createdAt: new Date().toISOString(),
      expiresAt: addDays(new Date(), template.validityDays).toISOString(),
    };
    db.packages.push(pkg);
    return pkg;
  });
}

export async function removeActivePackage(studentId: string) {
  await delay(300);
  return mutate((db) => {
    for (const p of db.packages) {
      if (p.studentId === studentId && p.status === "active") p.status = "finished";
    }
  });
}

// ---------------------------------------------------------------------------
// admin · histórico
// ---------------------------------------------------------------------------

export async function getAdminBookingHistory(adminId: string, search: string, statusFilter: string) {
  await delay(350);
  const db = getDb();
  const q = search.trim().toLowerCase();
  return db.bookings
    .filter((b) => b.adminId === adminId)
    .filter((b) => statusFilter === "todas" || b.status === statusFilter)
    .filter((b) => {
      if (!q) return true;
      const s = db.students.find((x) => x.id === b.studentId);
      return s?.name.toLowerCase().includes(q);
    })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .map((b) => ({ booking: b, studentName: db.students.find((s) => s.id === b.studentId)?.name ?? "Aluno" }));
}

/** Only completed/no_show bookings consumed a credit, and a booking can only be refunded once. */
export function canRefundBooking(booking: Pick<Booking, "status" | "refunded">) {
  return (booking.status === "completed" || booking.status === "no_show") && !booking.refunded;
}

export async function refundBooking(bookingId: string) {
  await delay(300);
  return mutate((db) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b || !canRefundBooking(b)) return;
    const pkg = db.packages.find((p) => p.studentId === b.studentId && p.status === "active");
    if (pkg && pkg.usedClasses > 0) pkg.usedClasses -= 1;
    b.refunded = true;
  });
}

export async function undoRefundBooking(bookingId: string) {
  return mutate((db) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (!b || !b.refunded) return;
    const pkg = db.packages.find((p) => p.studentId === b.studentId && p.status === "active");
    if (pkg) pkg.usedClasses += 1;
    b.refunded = false;
  });
}

export async function markBookingAsMakeup(bookingId: string) {
  await delay(300);
  return mutate((db) => {
    const b = db.bookings.find((x) => x.id === bookingId);
    if (b) b.isMakeup = true;
  });
}

// ---------------------------------------------------------------------------
// admin · pedidos (purchase requests)
// ---------------------------------------------------------------------------

export async function getPurchaseRequests(adminId: string) {
  await delay(300);
  const db = getDb();
  return db.purchaseRequests
    .filter((r) => r.adminId === adminId && r.status === "pending")
    .map((r) => ({
      request: r,
      studentName: db.students.find((s) => s.id === r.studentId)?.name ?? "Aluno",
      template: db.packageTemplates.find((t) => t.id === r.templateId) ?? null,
    }));
}

export async function approvePurchaseRequest(requestId: string) {
  await delay(400);
  return mutate((db) => {
    const req = db.purchaseRequests.find((r) => r.id === requestId);
    if (!req) return;
    req.status = "approved";
    req.decidedAt = new Date().toISOString();
    const template = db.packageTemplates.find((t) => t.id === req.templateId);
    if (!template) return;
    if (req.kind === "package") {
      for (const p of db.packages) {
        if (p.studentId === req.studentId && p.status === "active") p.status = "finished";
      }
      db.packages.push({
        id: genId("pkg"),
        studentId: req.studentId,
        totalClasses: template.totalClasses,
        usedClasses: 0,
        status: "active",
        templateName: template.name,
        createdAt: new Date().toISOString(),
        expiresAt: addDays(new Date(), template.validityDays).toISOString(),
      });
    } else {
      const active = db.packages.find((p) => p.studentId === req.studentId && p.status === "active");
      if (active) active.totalClasses += 1;
      else
        db.packages.push({
          id: genId("pkg"),
          studentId: req.studentId,
          totalClasses: 1,
          usedClasses: 0,
          status: "active",
          templateName: template.name,
          createdAt: new Date().toISOString(),
          expiresAt: addDays(new Date(), template.validityDays).toISOString(),
        });
    }
  });
}

export async function rejectPurchaseRequest(requestId: string) {
  await delay(300);
  return mutate((db) => {
    const req = db.purchaseRequests.find((r) => r.id === requestId);
    if (req) {
      req.status = "rejected";
      req.decidedAt = new Date().toISOString();
    }
  });
}

export async function restorePurchaseRequest(requestId: string) {
  return mutate((db) => {
    const req = db.purchaseRequests.find((r) => r.id === requestId);
    if (req) {
      req.status = "pending";
      req.decidedAt = null;
    }
  });
}

// ---------------------------------------------------------------------------
// admin · pacotes (templates CRUD)
// ---------------------------------------------------------------------------

export async function createPackageTemplate(adminId: string, data: Omit<PackageTemplate, "id" | "adminId">) {
  await delay(350);
  return mutate((db) => {
    const template: PackageTemplate = { id: genId("tpl"), adminId, ...data };
    db.packageTemplates.push(template);
    return template;
  });
}

export async function updatePackageTemplate(id: string, data: Partial<Omit<PackageTemplate, "id" | "adminId">>) {
  await delay(350);
  return mutate((db) => {
    const t = db.packageTemplates.find((x) => x.id === id);
    if (t) Object.assign(t, data);
    return t;
  });
}

export async function deletePackageTemplate(id: string) {
  await delay(300);
  return mutate((db) => {
    db.packageTemplates = db.packageTemplates.filter((t) => t.id !== id);
  });
}

// ---------------------------------------------------------------------------
// admin · disponibilidade
// ---------------------------------------------------------------------------

export const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export async function getAvailability(adminId: string) {
  await delay(350);
  const db = getDb();
  const settings = db.adminSettings.find((s) => s.adminId === adminId);
  return WEEKDAY_NAMES.map((name, weekday) => ({
    weekday,
    name,
    active: settings?.availabilityDayActive[weekday] ?? true,
    slots: db.availabilitySlots
      .filter((s) => s.adminId === adminId && s.weekday === weekday)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }));
}

export function bookingsInSlot(adminId: string, weekday: number, start: string, end: string) {
  const db = getDb();
  const s = parseInt(start, 10);
  const e = parseInt(end, 10);
  return db.bookings.filter((b) => {
    if (b.adminId !== adminId || (b.status !== "scheduled" && b.status !== "pending_confirmation")) return false;
    const d = toZonedTime(new Date(b.startTime), TIMEZONE);
    if (d.getDay() !== weekday) return false;
    const h = d.getHours();
    return h >= s && h < e;
  }).length;
}

export async function toggleAvailabilityDay(adminId: string, weekday: number, active: boolean) {
  await delay(300);
  return mutate((db) => {
    let settings = db.adminSettings.find((s) => s.adminId === adminId);
    if (!settings) {
      settings = { adminId, noShowConsumesClass: true, availabilityDayActive: {} };
      db.adminSettings.push(settings);
    }
    settings.availabilityDayActive[weekday] = active;
  });
}

export async function saveAvailabilitySlot(
  adminId: string,
  weekday: number,
  start: string,
  end: string,
  id?: string | null,
): Promise<{ error?: string; slot?: AvailabilitySlot }> {
  await delay(350);
  const s = parseInt(start, 10);
  const e = parseInt(end, 10);
  if (e <= s) return { error: "O fim precisa ser depois do início." };

  return mutate((db) => {
    const daySlots = db.availabilitySlots.filter((sl) => sl.adminId === adminId && sl.weekday === weekday);
    const clash = daySlots.some(
      (sl) => sl.id !== id && parseInt(sl.startTime, 10) < e && s < parseInt(sl.endTime, 10),
    );
    if (clash) return { error: `Esse intervalo conflita com outro já cadastrado em ${WEEKDAY_NAMES[weekday]}.` };

    if (id) {
      const slot = db.availabilitySlots.find((sl) => sl.id === id);
      if (slot) {
        slot.startTime = start;
        slot.endTime = end;
        return { slot };
      }
    }
    const slot: AvailabilitySlot = { id: genId("av"), adminId, weekday, startTime: start, endTime: end };
    db.availabilitySlots.push(slot);
    let settings = db.adminSettings.find((s2) => s2.adminId === adminId);
    if (!settings) {
      settings = { adminId, noShowConsumesClass: true, availabilityDayActive: {} };
      db.adminSettings.push(settings);
    }
    settings.availabilityDayActive[weekday] = true;
    return { slot };
  });
}

export async function deleteAvailabilitySlot(id: string) {
  await delay(300);
  return mutate((db) => {
    db.availabilitySlots = db.availabilitySlots.filter((s) => s.id !== id);
  });
}

export async function restoreAvailabilitySlot(slot: AvailabilitySlot) {
  return mutate((db) => {
    db.availabilitySlots.push(slot);
  });
}

// ---------------------------------------------------------------------------
// configurações
// ---------------------------------------------------------------------------

export async function getAdminSettings(adminId: string) {
  await delay(200);
  return getDb().adminSettings.find((s) => s.adminId === adminId) ?? null;
}

export async function updateNoShowConsumesClass(adminId: string, value: boolean) {
  await delay(300);
  return mutate((db) => {
    let settings = db.adminSettings.find((s) => s.adminId === adminId);
    if (!settings) {
      settings = { adminId, noShowConsumesClass: value, availabilityDayActive: {} };
      db.adminSettings.push(settings);
    } else {
      settings.noShowConsumesClass = value;
    }
  });
}

// ---------------------------------------------------------------------------
// notificações
// ---------------------------------------------------------------------------

export async function getNotifications(userId: string): Promise<AppNotification[]> {
  await delay(250);
  return getDb()
    .notifications.filter((n) => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function markNotificationRead(id: string) {
  return mutate((db) => {
    const n = db.notifications.find((x) => x.id === id);
    if (n) n.read = true;
  });
}

export async function markAllNotificationsRead(userId: string) {
  return mutate((db) => {
    for (const n of db.notifications) if (n.userId === userId) n.read = true;
  });
}

export async function clearNotifications(userId: string): Promise<AppNotification[]> {
  return mutate((db) => {
    const removed = db.notifications.filter((n) => n.userId === userId);
    db.notifications = db.notifications.filter((n) => n.userId !== userId);
    return removed;
  });
}

export async function restoreNotifications(items: AppNotification[]) {
  return mutate((db) => {
    db.notifications.push(...items);
  });
}

// ---------------------------------------------------------------------------
// convites
// ---------------------------------------------------------------------------

export async function validateInvite(token: string) {
  await delay(300);
  const db = getDb();
  const invite = db.invites.find((i) => i.token === token);
  if (!invite || invite.usedAt) return null;
  const admin = db.profiles.find((p) => p.id === invite.adminId);
  return { invite, adminName: admin?.name ?? "Professor" };
}

export async function acceptInvite(token: string, name: string) {
  await delay(500);
  return mutate((db) => {
    const invite = db.invites.find((i) => i.token === token);
    if (!invite || invite.usedAt) throw new Error("Convite inválido ou expirado.");
    const id = genId("stu");
    db.profiles.push({ id, name, role: "student", email: `${id}@bahiaboxe.com`, createdAt: new Date().toISOString() });
    db.students.push({ id, profileId: id, adminId: invite.adminId, name, createdAt: new Date().toISOString() });
    invite.usedAt = new Date().toISOString();
    return id;
  });
}

// ---------------------------------------------------------------------------
// perfil
// ---------------------------------------------------------------------------

export function studentIdForProfile(profileId: string): string {
  return profileId;
}

export async function updateProfileName(profileId: string, name: string) {
  await delay(400);
  return mutate((db) => {
    const profile = db.profiles.find((p) => p.id === profileId);
    if (profile) profile.name = name;
    const student = db.students.find((s) => s.id === profileId);
    if (student) student.name = name;
  });
}

export type { BookingStatus };

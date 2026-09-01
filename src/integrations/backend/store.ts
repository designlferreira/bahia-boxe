import type {
  AdminSettings,
  AppNotification,
  AvailabilitySlot,
  Booking,
  Invite,
  PackageRecord,
  PackageTemplate,
  Profile,
  PurchaseRequest,
  StudentRecord,
} from "./types";

/**
 * Local mock backend standing in for Supabase (no live project is configured for
 * this environment). Every function in ./api.ts is written as a boundary that
 * mirrors what a real Supabase RPC/view call would look like, so swapping this
 * file out for src/integrations/supabase/client.ts calls is a localized change.
 * Schema mirrors supabase/migrations/*.sql exactly.
 */

export interface DbShape {
  profiles: Profile[];
  students: StudentRecord[];
  packageTemplates: PackageTemplate[];
  packages: PackageRecord[];
  bookings: Booking[];
  availabilitySlots: AvailabilitySlot[];
  purchaseRequests: PurchaseRequest[];
  notifications: AppNotification[];
  invites: Invite[];
  adminSettings: AdminSettings[];
}

const STORAGE_KEY = "bahia-boxe-mock-db-v1";

const ADMIN_ID = "admin-1";
const STUDENT_ID = "student-1"; // Marina Souza — the only account with real login credentials

// Brazil has not observed DST since 2019, so a fixed -03:00 offset is safe year-round.
const BRT = "-03:00";
function brt(y: number, m: number, d: number, hh: number, mm = 0) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${BRT}`;
}

function seed(): DbShape {
  const students: StudentRecord[] = [
    { id: STUDENT_ID, profileId: STUDENT_ID, adminId: ADMIN_ID, name: "Marina Souza", createdAt: brt(2025, 3, 4, 9) },
    { id: "s2", profileId: "s2", adminId: ADMIN_ID, name: "Rafael Lima", createdAt: brt(2025, 3, 10, 9) },
    { id: "s3", profileId: "s3", adminId: ADMIN_ID, name: "Júlia Prado", createdAt: brt(2025, 4, 2, 9) },
    { id: "s4", profileId: "s4", adminId: ADMIN_ID, name: "Caio Menezes", createdAt: brt(2025, 4, 20, 9) },
    { id: "s5", profileId: "s5", adminId: ADMIN_ID, name: "Bruno Tavares", createdAt: brt(2025, 5, 1, 9) },
  ];

  const profiles: Profile[] = [
    { id: ADMIN_ID, name: "Diego Andrade", role: "admin", email: "diego@bahiaboxe.com", createdAt: brt(2025, 3, 1, 9) },
    ...students.map((s) => ({
      id: s.id,
      name: s.name,
      role: "student" as const,
      email: `${s.name.toLowerCase().split(" ")[0]}@bahiaboxe.com`,
      createdAt: s.createdAt,
    })),
  ];

  const packageTemplates: PackageTemplate[] = [
    { id: "t1", adminId: ADMIN_ID, name: "Pacote 4 aulas", description: "1x por semana · 30 dias", totalClasses: 4, priceCents: 22000, validityDays: 30 },
    { id: "t2", adminId: ADMIN_ID, name: "Pacote 10 aulas", description: "2x por semana · 60 dias", totalClasses: 10, priceCents: 48000, validityDays: 60 },
    { id: "t3", adminId: ADMIN_ID, name: "Aula avulsa", description: "Uma aula, sem validade", totalClasses: 1, priceCents: 6000, validityDays: 3650 },
  ];

  const packages: PackageRecord[] = [
    { id: "p1", studentId: "student-1", totalClasses: 10, usedClasses: 5, status: "active", templateName: "Pacote 10 aulas", createdAt: brt(2025, 7, 22, 9), expiresAt: brt(2025, 9, 22, 23, 59) },
    { id: "p2", studentId: "s2", totalClasses: 10, usedClasses: 4, status: "active", templateName: "Pacote 10 aulas", createdAt: brt(2025, 7, 1, 9), expiresAt: brt(2025, 9, 1, 23, 59) },
    { id: "p3", studentId: "s3", totalClasses: 8, usedClasses: 7, status: "active", templateName: "Pacote 8 aulas", createdAt: brt(2025, 7, 5, 9), expiresAt: brt(2025, 9, 5, 23, 59) },
    { id: "p4", studentId: "s4", totalClasses: 10, usedClasses: 10, status: "finished", templateName: "Pacote 10 aulas", createdAt: brt(2025, 6, 1, 9), expiresAt: brt(2025, 8, 1, 23, 59) },
    { id: "p5", studentId: "s5", totalClasses: 12, usedClasses: 8, status: "active", templateName: "Pacote 12 aulas", createdAt: brt(2025, 7, 10, 9), expiresAt: brt(2025, 9, 10, 23, 59) },
  ];

  const bookings: Booking[] = [
    { id: "b1", studentId: "student-1", adminId: ADMIN_ID, startTime: brt(2026, 9, 1, 7), endTime: brt(2026, 9, 1, 8), status: "scheduled" },
    { id: "b2", studentId: "student-1", adminId: ADMIN_ID, startTime: brt(2026, 9, 3, 19), endTime: brt(2026, 9, 3, 20), status: "pending_confirmation" },
    {
      id: "b5",
      studentId: "student-1",
      adminId: ADMIN_ID,
      startTime: brt(2026, 8, 29, 7),
      endTime: brt(2026, 8, 29, 8),
      status: "rejected_with_suggestion",
      teacherNote: "Marina, nesse horário a turma está cheia. Consigo te encaixar sexta às 19h, pode ser?",
      suggestedStartTime: brt(2026, 9, 4, 19),
      suggestedEndTime: brt(2026, 9, 4, 20),
    },
    { id: "b3", studentId: "student-1", adminId: ADMIN_ID, startTime: brt(2026, 8, 28, 7), endTime: brt(2026, 8, 28, 8), status: "completed" },
    { id: "b4", studentId: "student-1", adminId: ADMIN_ID, startTime: brt(2026, 8, 26, 7), endTime: brt(2026, 8, 26, 8), status: "no_show" },
    { id: "b6", studentId: "student-1", adminId: ADMIN_ID, startTime: brt(2026, 8, 22, 7), endTime: brt(2026, 8, 22, 8), status: "completed" },

    { id: "a1", studentId: "student-1", adminId: ADMIN_ID, startTime: brt(2026, 9, 1, 7), endTime: brt(2026, 9, 1, 8), status: "scheduled" },
    { id: "a2", studentId: "s2", adminId: ADMIN_ID, startTime: brt(2026, 9, 1, 8), endTime: brt(2026, 9, 1, 9), status: "pending_confirmation" },
    { id: "a3", studentId: "s3", adminId: ADMIN_ID, startTime: brt(2026, 9, 1, 17), endTime: brt(2026, 9, 1, 18), status: "scheduled" },
    { id: "a4", studentId: "s4", adminId: ADMIN_ID, startTime: brt(2026, 9, 1, 18), endTime: brt(2026, 9, 1, 19), status: "pending_confirmation" },
    { id: "a5", studentId: "s5", adminId: ADMIN_ID, startTime: brt(2026, 9, 1, 19), endTime: brt(2026, 9, 1, 20), status: "completed" },

    { id: "h1", studentId: "s5", adminId: ADMIN_ID, startTime: brt(2026, 8, 31, 19), endTime: brt(2026, 8, 31, 20), status: "completed" },
    { id: "h2", studentId: "s3", adminId: ADMIN_ID, startTime: brt(2026, 8, 31, 17), endTime: brt(2026, 8, 31, 18), status: "no_show" },
    { id: "h3", studentId: "student-1", adminId: ADMIN_ID, startTime: brt(2026, 8, 28, 7), endTime: brt(2026, 8, 28, 8), status: "completed" },
    { id: "h4", studentId: "s4", adminId: ADMIN_ID, startTime: brt(2026, 8, 27, 18), endTime: brt(2026, 8, 27, 19), status: "cancelled" },
    { id: "h5", studentId: "s2", adminId: ADMIN_ID, startTime: brt(2026, 8, 26, 8), endTime: brt(2026, 8, 26, 9), status: "completed" },
  ];

  // weekday: 0=domingo … 6=sábado
  const availabilitySlots: AvailabilitySlot[] = [
    { id: "v1", adminId: ADMIN_ID, weekday: 1, startTime: "06:00", endTime: "09:00" },
    { id: "v2", adminId: ADMIN_ID, weekday: 1, startTime: "17:00", endTime: "21:00" },
    { id: "v3", adminId: ADMIN_ID, weekday: 2, startTime: "06:00", endTime: "09:00" },
    { id: "v4", adminId: ADMIN_ID, weekday: 2, startTime: "17:00", endTime: "20:00" },
    { id: "v5", adminId: ADMIN_ID, weekday: 3, startTime: "06:00", endTime: "09:00" },
    { id: "v6", adminId: ADMIN_ID, weekday: 4, startTime: "17:00", endTime: "21:00" },
    { id: "v7", adminId: ADMIN_ID, weekday: 5, startTime: "06:00", endTime: "09:00" },
    { id: "v8", adminId: ADMIN_ID, weekday: 5, startTime: "17:00", endTime: "20:00" },
    { id: "v9", adminId: ADMIN_ID, weekday: 6, startTime: "09:00", endTime: "11:00" },
  ];

  const purchaseRequests: PurchaseRequest[] = [
    { id: "r1", studentId: "s4", adminId: ADMIN_ID, kind: "package", templateId: "t2", status: "pending", notes: null, createdAt: brt(2026, 8, 31, 14), decidedAt: null },
    { id: "r2", studentId: "s3", adminId: ADMIN_ID, kind: "single_class", templateId: "t3", status: "pending", notes: null, createdAt: brt(2026, 8, 31, 16), decidedAt: null },
  ];

  const notifications: AppNotification[] = [
    { id: "n1", userId: ADMIN_ID, kind: "booking", title: "Novo agendamento", description: "Caio Menezes pediu aula hoje às 18:00", createdAt: brt(2026, 9, 1, 6, 40), read: false, relatedBookingId: "a4" },
    { id: "n2", userId: ADMIN_ID, kind: "booking", title: "Novo agendamento", description: "Rafael Lima pediu aula hoje às 08:00", createdAt: brt(2026, 9, 1, 6, 18), read: false, relatedBookingId: "a2" },
    { id: "n3", userId: ADMIN_ID, kind: "cancel", title: "Aula cancelada", description: "Júlia Prado cancelou a aula de quinta, 17:00", createdAt: brt(2026, 8, 31, 21), read: false },
    { id: "n4", userId: ADMIN_ID, kind: "confirm", title: "Horário aceito", description: "Marina Souza aceitou a sugestão de sexta, 19:00", createdAt: brt(2026, 8, 31, 10), read: true },
    { id: "n5", userId: ADMIN_ID, kind: "system", title: "Pacote vencendo", description: "O pacote de Júlia Prado vence em 5 dias", createdAt: brt(2026, 8, 31, 9), read: true },
    { id: "sn1", userId: STUDENT_ID, kind: "confirm", title: "Aula aprovada", description: "Prof. Diego confirmou terça, 07:00", createdAt: brt(2026, 9, 1, 6, 30), read: false, relatedBookingId: "b1" },
    { id: "sn2", userId: STUDENT_ID, kind: "cancel", title: "Horário sugerido", description: "Prof. Diego propôs sexta, 19:00 no lugar de quinta", createdAt: brt(2026, 8, 29, 12), read: false, relatedBookingId: "b5" },
    { id: "sn3", userId: STUDENT_ID, kind: "system", title: "Pacote acabando", description: "Restam poucas aulas no seu pacote de 10", createdAt: brt(2026, 8, 31, 9), read: true },
  ];

  const adminSettings: AdminSettings[] = [
    { adminId: ADMIN_ID, noShowConsumesClass: true, availabilityDayActive: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true } },
  ];

  const invites: Invite[] = [{ token: "demo-convite", adminId: ADMIN_ID, createdAt: brt(2026, 8, 20, 9), usedAt: null }];

  return {
    profiles,
    students,
    packageTemplates,
    packages,
    bookings,
    availabilitySlots,
    purchaseRequests,
    notifications,
    invites,
    adminSettings,
  };
}

let db: DbShape = load();

function load(): DbShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DbShape;
  } catch {
    // ignore corrupt storage, fall through to fresh seed
  }
  return seed();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // storage unavailable (private mode, quota) — mock still works in-memory for this tab
  }
}

export function getDb(): DbShape {
  return db;
}

export function mutate<T>(fn: (draft: DbShape) => T): T {
  const result = fn(db);
  persist();
  return result;
}

export function resetMockDb() {
  db = seed();
  persist();
}

export function genId(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export const DEMO_ADMIN_ID = ADMIN_ID;
export const DEMO_STUDENT_ID = STUDENT_ID;
export const DEMO_PASSWORD = "123456";

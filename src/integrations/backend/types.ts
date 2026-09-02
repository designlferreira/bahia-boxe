import type { BookingStatus } from "@/lib/bookingStatus";

export type Role = "student" | "admin";

export interface Profile {
  id: string;
  name: string;
  role: Role;
  email: string;
  createdAt: string;
}

/**
 * A row of `public.students` — the link between a profile and its professor.
 *
 * `id` is the students row's own uuid and is NOT the profile id: the database keeps the
 * authenticated account (`auth.users` → `profiles`) and the student enrolment as separate
 * entities. Everything that references a student (`bookings.student_id`, `packages.student_id`,
 * `purchase_requests.student_id`) points at this `id`, never at `profileId`.
 */
export interface StudentRecord {
  id: string;
  profileId: string;
  adminId: string;
  name: string;
  createdAt: string;
}

/** De onde veio o pacote — dimensão separada de `kind` (que distingue pacote x aula avulsa). */
export type PackageOrigin = "trial" | "purchase" | "admin_grant";

export interface PackageTemplate {
  id: string;
  adminId: string;
  name: string;
  description: string;
  totalClasses: number;
  /** `package_templates.price_cents` is nullable — null means the price was never filled in. */
  priceCents: number | null;
  validityDays: number | null;
  isActive: boolean;
}

export interface PackageRecord {
  id: string;
  studentId: string;
  totalClasses: number;
  usedClasses: number;
  status: "active" | "finished";
  /** 'package' (multi-class) or 'single' (one-off class). */
  kind: "package" | "single";
  origin: PackageOrigin;
  /** Derived label — `packages` stores no template reference. */
  templateName: string;
  createdAt: string;
}

export interface Booking {
  id: string;
  studentId: string;
  adminId: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  slotId: string | null;
  billingKind: string;
  cancelReason?: string | null;
  teacherNote?: string | null;
  suggestedStartTime?: string | null;
  suggestedEndTime?: string | null;
  isReplacement: boolean;
  replacementForBookingId: string | null;
}

/** Uma movimentação imutável em `credit_transactions` — o histórico, não o saldo. */
export interface CreditTransaction {
  id: string;
  studentId: string;
  packageId: string | null;
  bookingId: string | null;
  delta: number;
  reason:
    | "trial_grant"
    | "purchase_grant"
    | "admin_grant"
    | "lesson_completed"
    | "absence_charge"
    | "undo"
    | "replacement_refund"
    | "legacy_unverified_consumption";
  reversesTransactionId: string | null;
  createdAt: string;
}

/** One concrete hour of availability — `availability_slots` is a list of datetimes, not a weekly grid. */
export interface AvailabilitySlot {
  id: string;
  adminId: string;
  startTime: string; // ISO
  endTime: string; // ISO
  isActive: boolean;
}

/**
 * A weekday time range as shown on the availability screen, backed by the concrete
 * `availability_slots` rows it covers within the planning horizon.
 */
export interface AvailabilityInterval {
  key: string;
  weekday: number;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  slotIds: string[];
  bookedCount: number;
}

export interface PurchaseRequest {
  id: string;
  studentId: string;
  adminId: string;
  kind: "package" | "single";
  templateId: string | null;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** O que tocar na notificação deve abrir — nunca uma rota hardcoded no componente. */
export type NotificationEntity =
  | { type: "booking"; id: string }
  | { type: "purchase_requests" }
  | null;

export interface AppNotification {
  id: string;
  userId: string;
  kind: "booking" | "cancel" | "confirm" | "system";
  title: string;
  description: string;
  createdAt: string;
  read: boolean;
  entity: NotificationEntity;
}

export interface AdminSettings {
  adminId: string;
  noShowConsumesClass: boolean;
}

export type Sex = "female" | "male" | "other";
export type Guard = "orthodox" | "southpaw" | "switch";
export type Laterality = "right" | "left" | "ambidextrous";

/**
 * Enriquecimento progressivo, opcional — nunca obrigatório no onboarding. Todo campo é `null` =
 * "não informado", não um valor sentinela armazenado.
 */
export interface StudentProfile {
  studentId: string;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  guard: Guard | null;
  laterality: Laterality | null;
  /** Reservado para a Etapa 9 (teste de perfil de lutador) — não escrito nesta rodada. */
  fighterProfileResult: unknown | null;
  updatedAt: string;
}

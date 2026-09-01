import type { BookingStatus } from "@/lib/bookingStatus";

export type Role = "student" | "admin";

export interface Profile {
  id: string;
  name: string;
  role: Role;
  email: string;
  createdAt: string;
}

export interface StudentRecord {
  id: string;
  profileId: string;
  adminId: string;
  name: string;
  createdAt: string;
}

export interface PackageTemplate {
  id: string;
  adminId: string;
  name: string;
  description: string;
  totalClasses: number;
  priceCents: number;
  validityDays: number;
}

export interface PackageRecord {
  id: string;
  studentId: string;
  totalClasses: number;
  usedClasses: number;
  status: "active" | "finished";
  templateName: string;
  createdAt: string;
  expiresAt: string;
}

export interface Booking {
  id: string;
  studentId: string;
  adminId: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  cancelReason?: string | null;
  teacherNote?: string | null;
  suggestedStartTime?: string | null;
  suggestedEndTime?: string | null;
  isMakeup?: boolean;
}

export interface AvailabilitySlot {
  id: string;
  adminId: string;
  weekday: number; // 0 = domingo ... 6 = sábado
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface PurchaseRequest {
  id: string;
  studentId: string;
  adminId: string;
  kind: "package" | "single_class";
  templateId: string | null;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface AppNotification {
  id: string;
  userId: string;
  kind: "booking" | "cancel" | "confirm" | "system";
  title: string;
  description: string;
  createdAt: string;
  read: boolean;
  relatedBookingId?: string | null;
}

export interface Invite {
  token: string;
  adminId: string;
  createdAt: string;
  usedAt: string | null;
}

export interface AdminSettings {
  adminId: string;
  noShowConsumesClass: boolean;
  availabilityDayActive: Record<number, boolean>;
}

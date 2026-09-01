import { format, formatDistanceToNowStrict } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";

export const TIMEZONE = "America/Sao_Paulo";

function zoned(date: string | Date) {
  return toZonedTime(typeof date === "string" ? new Date(date) : date, TIMEZONE);
}

/** "Ter, 01 set · 07:00" */
export function formatDateTime(date: string | Date) {
  return formatInTimeZone(date, TIMEZONE, "EEE, dd MMM · HH:mm", { locale: ptBR });
}

/** "01 set" */
export function formatDateShort(date: string | Date) {
  return formatInTimeZone(date, TIMEZONE, "dd MMM", { locale: ptBR });
}

/** "07:00" */
export function formatTime(date: string | Date) {
  return formatInTimeZone(date, TIMEZONE, "HH:mm", { locale: ptBR });
}

/** "Terça, 01 de setembro" */
export function formatDate(date: string | Date) {
  return formatInTimeZone(date, TIMEZONE, "EEEE, dd 'de' MMMM", { locale: ptBR });
}

/** day-of-month number as string, e.g. "01" */
export function formatDayNumber(date: string | Date) {
  return formatInTimeZone(date, TIMEZONE, "dd", { locale: ptBR });
}

/** short month abbreviation, e.g. "set" */
export function formatMonthShort(date: string | Date) {
  return formatInTimeZone(date, TIMEZONE, "MMM", { locale: ptBR }).toLowerCase();
}

/** short weekday abbreviation, e.g. "Ter" */
export function formatWeekdayShort(date: string | Date) {
  const s = formatInTimeZone(date, TIMEZONE, "EEE", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1).replace(".", "");
}

export function formatNextClass(startTime: string, endTime: string) {
  return `${formatDateTime(startTime)} – ${formatTime(endTime)}`;
}

export function isPastDate(date: string | Date) {
  return zoned(date).getTime() < Date.now();
}

export function relativeTime(date: string | Date) {
  return formatDistanceToNowStrict(typeof date === "string" ? new Date(date) : date, {
    addSuffix: true,
    locale: ptBR,
  });
}

export function isoDateOnly(date: Date) {
  return format(date, "yyyy-MM-dd");
}

import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { formatPoints, milliToPoints } from "./money.ts";

export function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

export function toIsoNull(value: unknown): string | null {
  if (value == null) return null;
  const iso = toIso(value);
  return iso || null;
}

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : parseISO(value);
}

export function formatPct(p: number, digits = 1): string {
  return `${(p * 100).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatDateTime(value: string | Date): string {
  try {
    return format(asDate(value), "MMM d, yyyy · h:mm a");
  } catch {
    return toIso(value);
  }
}

export function formatDate(value: string | Date): string {
  try {
    return format(asDate(value), "MMM d, yyyy");
  } catch {
    return toIso(value);
  }
}

export function formatRelative(value: string | Date): string {
  try {
    return formatDistanceToNowStrict(asDate(value), { addSuffix: true });
  } catch {
    return toIso(value);
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function statusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "upcoming":
      return "Upcoming";
    case "open":
      return "Open";
    case "paused":
      return "Paused";
    case "closed":
      return "Closed";
    case "resolved":
      return "Resolved";
    case "cancelled":
      return "Cancelled";
    case "disputed":
      return "Disputed";
    default:
      return status;
  }
}

export { formatPoints, milliToPoints };

import type { Alert } from "@/db/schema";

export type AlertListItem = Pick<
  Alert,
  | "id"
  | "type"
  | "billId"
  | "title"
  | "message"
  | "href"
  | "meta"
  | "severity"
  | "read"
  | "createdAt"
>;

export function formatAlertTimestamp(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const kst = new Date(value.getTime() + 9 * 60 * 60 * 1000);
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi} KST`;
}

export function filterUnreadAlerts(items: AlertListItem[]) {
  return items.filter((item) => !item.read);
}

export function alertsSince(items: AlertListItem[], startedAt: Date) {
  return items.filter((item) => new Date(item.createdAt) >= startedAt);
}

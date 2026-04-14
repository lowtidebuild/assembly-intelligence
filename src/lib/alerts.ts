import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { alert, type Alert } from "@/db/schema";

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

export interface CreateAlertInput {
  type: Alert["type"];
  title: string;
  message: string;
  billId?: number | null;
  href?: string | null;
  meta?: string | null;
  severity?: Alert["severity"];
}

export async function insertAlertIfMissing(
  input: CreateAlertInput,
): Promise<boolean> {
  const [existing] = await db
    .select({ id: alert.id })
    .from(alert)
    .where(
      and(
        eq(alert.type, input.type),
        eq(alert.title, input.title),
        eq(alert.message, input.message),
        input.billId == null ? isNull(alert.billId) : eq(alert.billId, input.billId),
        input.href == null ? isNull(alert.href) : eq(alert.href, input.href),
      ),
    )
    .limit(1);

  if (existing) return false;

  await db.insert(alert).values({
    type: input.type,
    billId: input.billId ?? null,
    title: input.title,
    message: input.message,
    href: input.href ?? null,
    meta: input.meta ?? null,
    severity: input.severity ?? "info",
  });
  return true;
}

export async function loadRecentAlerts(limitCount = 20): Promise<AlertListItem[]> {
  return db
    .select()
    .from(alert)
    .orderBy(desc(alert.createdAt), desc(alert.id))
    .limit(limitCount);
}

export async function loadUnreadAlertCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(alert)
    .where(eq(alert.read, false));

  return row?.count ?? 0;
}

export async function markAlertRead(alertId: number): Promise<boolean> {
  const rows = await db
    .update(alert)
    .set({ read: true })
    .where(and(eq(alert.id, alertId), eq(alert.read, false)))
    .returning({ id: alert.id });

  if (rows.length > 0) {
    return true;
  }
  return false;
}

export async function markAllAlertsRead(): Promise<number> {
  const rows = await db
    .update(alert)
    .set({ read: true })
    .where(eq(alert.read, false))
    .returning({ id: alert.id });

  return rows.length;
}

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

export function buildAlertMeta(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function recentThreshold(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

export async function loadRecentUnreadAlerts(limitCount = 6) {
  return db
    .select()
    .from(alert)
    .where(and(eq(alert.read, false), gte(alert.createdAt, recentThreshold(72))))
    .orderBy(desc(alert.createdAt), desc(alert.id))
    .limit(limitCount);
}

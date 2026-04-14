import { describe, expect, it } from "vitest";
import {
  alertsSince,
  filterUnreadAlerts,
  formatAlertTimestamp,
  type AlertListItem,
} from "@/lib/alerts-ui";
import {
  buildAlertMeta,
} from "@/lib/alerts";

function makeItem(
  overrides: Partial<AlertListItem> = {},
): AlertListItem {
  return {
    id: 1,
    type: "sync_summary",
    billId: null,
    title: "title",
    message: "message",
    href: null,
    meta: null,
    severity: "info",
    read: false,
    createdAt: new Date("2026-04-14T00:00:00.000Z"),
    ...overrides,
  };
}

describe("buildAlertMeta", () => {
  it("joins only non-empty parts", () => {
    expect(buildAlertMeta(["문체위", "", null, "2026-04-14"])).toBe(
      "문체위 · 2026-04-14",
    );
  });
});

describe("formatAlertTimestamp", () => {
  it("formats timestamps in KST", () => {
    expect(formatAlertTimestamp("2026-04-14T00:00:00.000Z")).toBe(
      "04-14 09:00 KST",
    );
  });
});

describe("alert filters", () => {
  it("returns only unread alerts", () => {
    expect(
      filterUnreadAlerts([makeItem(), makeItem({ id: 2, read: true })]).map(
        (item) => item.id,
      ),
    ).toEqual([1]);
  });

  it("keeps only alerts newer than the threshold", () => {
    const cutoff = new Date("2026-04-14T00:30:00.000Z");
    expect(
      alertsSince(
        [
          makeItem({ id: 1, createdAt: new Date("2026-04-14T01:00:00.000Z") }),
          makeItem({ id: 2, createdAt: new Date("2026-04-13T23:00:00.000Z") }),
        ],
        cutoff,
      ).map((item) => item.id),
    ).toEqual([1]);
  });
});

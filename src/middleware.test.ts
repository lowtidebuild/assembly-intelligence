import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/middleware";

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/api/auth/login",
    "/api/cron/sync-morning",
    "/api/health",
  ])("treats %s as public", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each(["/loginx", "/api/authx", "/radar", "/api/setup"])(
    "does not treat %s as public",
    (pathname) => {
      expect(isPublicPath(pathname)).toBe(false);
    },
  );

  it("enforces the /api/cron prefix boundary", () => {
    expect(isPublicPath("/api/cron")).toBe(true);
    expect(isPublicPath("/api/cron/")).toBe(true);
    expect(isPublicPath("/api/cronjob")).toBe(false);
  });
});

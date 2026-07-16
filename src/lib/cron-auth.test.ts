import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyCronRequest } from "@/lib/cron-auth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("verifyCronRequest", () => {
  it("accepts the configured Bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");

    const result = verifyCronRequest(
      new Request("https://example.com/api/cron/sync-morning", {
        headers: { authorization: "Bearer cron-secret" },
      }) as never,
    );

    expect(result).toEqual({ ok: true });
  });

  it.each([
    ["wrong", { authorization: "Bearer wrong-secret" }],
    ["missing", undefined],
  ] as const)("rejects a %s authorization header", (_label, headers) => {
    vi.stubEnv("CRON_SECRET", "cron-secret");

    const result = verifyCronRequest(
      new Request("https://example.com/api/cron/sync-morning", { headers }) as never,
    );

    expect(result).toEqual({
      ok: false,
      status: 401,
      message: "unauthorized",
    });
  });

  it("fails closed when the secret is unset in production", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    const result = verifyCronRequest(
      new Request("https://example.com/api/cron/sync-morning") as never,
    );

    expect(result).toEqual({
      ok: false,
      status: 500,
      message: "CRON_SECRET not configured",
    });
  });

  it("allows the explicit development bypass", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = verifyCronRequest(
      new Request("https://example.com/api/cron/sync-morning") as never,
    );

    expect(result).toEqual({ ok: true });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));

vi.mock("@/db", () => ({
  db: {
    execute: executeMock,
  },
}));

import { GET } from "@/app/api/cron/keep-alive/route";

describe("GET /api/cron/keep-alive", () => {
  beforeEach(() => {
    executeMock.mockReset();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns 401 without the cron bearer token", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/keep-alive") as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("returns ok for an authorized database ping", async () => {
    executeMock.mockResolvedValueOnce({ rows: [{ ok: 1 }] });

    const response = await GET(
      new Request("http://localhost/api/cron/keep-alive", {
        headers: { authorization: "Bearer test-cron-secret" },
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it("returns a generic body when the database ping fails", async () => {
    executeMock.mockRejectedValueOnce(
      new Error("postgres://internal-host.example/private-detail"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(
      new Request("http://localhost/api/cron/keep-alive", {
        headers: { authorization: "Bearer test-cron-secret" },
      }) as never,
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ ok: false });
    expect(JSON.stringify(body)).not.toContain("internal-host");
  });
});

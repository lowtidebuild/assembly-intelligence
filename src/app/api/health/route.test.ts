import { afterEach, describe, expect, it, vi } from "vitest";

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));

vi.mock("@/db", () => ({
  db: { execute: executeMock },
}));
vi.mock("@/lib/mcp-client", () => ({
  getMcpRuntimeConfig: () => ({
    baseUrl: "https://assembly-api-mcp.fly.dev/mcp",
    defaultProfile: "full",
  }),
  hasMcpKey: () => false,
  pingMcp: vi.fn(),
}));

import { classifyHealthError, GET } from "@/app/api/health/route";

afterEach(() => {
  executeMock.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("health error redaction", () => {
  it("classifies failures without returning raw exception text", async () => {
    vi.stubEnv("HEALTH_CHECK_TOKEN", "health-token");
    executeMock.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED db.internal.example:5432"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(
      new Request("https://example.com/api/health?details=1", {
        headers: { "x-health-check-token": "health-token" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.services.database.error).toBe("connection_failed");
    expect(JSON.stringify(body)).not.toContain("db.internal.example");
  });

  it("distinguishes timeout and authentication failures", () => {
    expect(classifyHealthError(new Error("request timed out"))).toBe("timeout");
    expect(classifyHealthError(new Error("401 unauthorized"))).toBe(
      "auth_failed",
    );
  });
});

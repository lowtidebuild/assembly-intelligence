import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthMode, signToken, verifyToken } from "@/lib/auth";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("auth token", () => {
  it("signs and verifies a token", async () => {
    const token = await signToken("shared-password");

    await expect(verifyToken("shared-password", token)).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"));
    const token = await signToken("shared-password");

    vi.setSystemTime(new Date("2026-07-24T00:00:00.000Z"));
    await expect(verifyToken("shared-password", token)).resolves.toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects an expiry changed without re-signing", async () => {
    const token = await signToken("shared-password");
    const [expiry, signature] = token.split(".");
    const tampered = `${Number(expiry) + 1}.${signature}`;

    await expect(verifyToken("shared-password", tampered)).resolves.toEqual({
      ok: false,
      reason: "bad_sig",
    });
  });

  it.each([
    ["missing dot", "123", "malformed"],
    ["empty signature", `${Date.now() + 60_000}.`, "malformed"],
    ["non-numeric expiry", "not-a-number.signature", "malformed"],
    ["invalid base64 signature", `${Date.now() + 60_000}.%`, "malformed"],
  ] as const)("rejects a %s token", async (_label, token, reason) => {
    await expect(verifyToken("shared-password", token)).resolves.toEqual({
      ok: false,
      reason,
    });
  });

  it("rejects truncated and tampered signatures", async () => {
    const token = await signToken("shared-password");
    const [expiry, signature] = token.split(".");
    const replacement = signature.endsWith("A") ? "B" : "A";

    await expect(
      verifyToken("shared-password", `${expiry}.${signature.slice(0, -1)}`),
    ).resolves.toEqual({ ok: false, reason: "bad_sig" });
    await expect(
      verifyToken(
        "shared-password",
        `${expiry}.${signature.slice(0, -1)}${replacement}`,
      ),
    ).resolves.toEqual({ ok: false, reason: "bad_sig" });
  });

  it("invalidates tokens after password rotation", async () => {
    const token = await signToken("password-a");

    await expect(verifyToken("password-b", token)).resolves.toEqual({
      ok: false,
      reason: "bad_sig",
    });
  });
});

describe("getAuthMode", () => {
  it("throws when APP_PASSWORD is unset in production", () => {
    vi.stubEnv("APP_PASSWORD", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => getAuthMode()).toThrow("APP_PASSWORD is not set");
  });

  it("bypasses auth when APP_PASSWORD is unset in development", () => {
    vi.stubEnv("APP_PASSWORD", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(getAuthMode()).toEqual({ enforced: false });
  });
});

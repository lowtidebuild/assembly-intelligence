import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  clearLoginFailures,
  isLoginRateLimited,
  POST,
  recordFailedLoginAttempt,
} from "@/app/api/auth/login/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("login throttle", () => {
  it("expires failures outside the sliding window", () => {
    const ip = "test-window-expiry";
    clearLoginFailures(ip);
    for (let index = 0; index < 10; index += 1) {
      recordFailedLoginAttempt(ip, 1_000 + index);
    }

    expect(isLoginRateLimited(ip, 2_000)).toBe(true);
    expect(isLoginRateLimited(ip, 16 * 60 * 1000 + 2_000)).toBe(false);
  });

  it("clears failures after a successful login", () => {
    const ip = "test-success-reset";
    clearLoginFailures(ip);
    for (let index = 0; index < 10; index += 1) {
      recordFailedLoginAttempt(ip, 1_000 + index);
    }
    expect(isLoginRateLimited(ip, 2_000)).toBe(true);

    clearLoginFailures(ip);
    expect(isLoginRateLimited(ip, 2_000)).toBe(false);
  });

  it("returns the rate-limited path on the 11th failed attempt", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_PASSWORD", "correct-password");
    const ip = "203.0.113.10";
    clearLoginFailures(ip);

    for (let index = 0; index < 10; index += 1) {
      const response = await POST(
        new NextRequest("https://example.com/api/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "x-forwarded-for": ip,
          },
          body: new URLSearchParams({ password: "wrong-password" }),
        }),
      );
      expect(response.status).toBe(303);
    }

    const response = await POST(
      new NextRequest("https://example.com/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": ip,
        },
        body: new URLSearchParams({ password: "wrong-password" }),
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("location")).toContain("error=rate_limited");
    clearLoginFailures(ip);
  });
});

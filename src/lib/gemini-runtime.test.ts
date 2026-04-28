import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertStubDbWriteAllowed,
  isStubDbWriteAllowed,
  shouldUseGeminiOrThrow,
} from "@/lib/gemini-client";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...ORIGINAL_ENV };
});

describe("Gemini runtime mode guards", () => {
  it("uses Gemini when GEMINI_API_KEY is configured", () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("ALLOW_AI_STUB", "");
    vi.stubEnv("ALLOW_STUB_DB_WRITE", "");
    vi.stubEnv("VERCEL_ENV", "");

    expect(shouldUseGeminiOrThrow("test")).toBe(true);
  });

  it("rejects no-key production instead of falling back to stub", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("ALLOW_AI_STUB", "1");
    vi.stubEnv("ALLOW_STUB_DB_WRITE", "1");
    vi.stubEnv("VERCEL_ENV", "production");

    expect(() => shouldUseGeminiOrThrow("test")).toThrow(
      /GEMINI_API_KEY is required in production/,
    );
    expect(isStubDbWriteAllowed()).toBe(false);
  });

  it("requires explicit ALLOW_AI_STUB for no-key non-production stub mode", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("ALLOW_AI_STUB", "");
    vi.stubEnv("VERCEL_ENV", "");

    expect(() => shouldUseGeminiOrThrow("test")).toThrow(/ALLOW_AI_STUB=1/);

    vi.stubEnv("ALLOW_AI_STUB", "1");
    expect(shouldUseGeminiOrThrow("test")).toBe(false);
  });

  it("requires both stub opt-ins before writing stub output", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("ALLOW_AI_STUB", "1");
    vi.stubEnv("ALLOW_STUB_DB_WRITE", "");

    expect(isStubDbWriteAllowed()).toBe(false);
    expect(() => assertStubDbWriteAllowed("test")).toThrow(
      /ALLOW_STUB_DB_WRITE=1/,
    );

    vi.stubEnv("ALLOW_STUB_DB_WRITE", "1");
    expect(isStubDbWriteAllowed()).toBe(true);
    expect(() => assertStubDbWriteAllowed("test")).not.toThrow();
  });
});

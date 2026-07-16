import { afterEach, describe, expect, it } from "vitest";
import {
  getMcpRuntimeConfig,
  redactMcpUrl,
  sanitizeMcpError,
} from "@/lib/mcp-client";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getMcpRuntimeConfig", () => {
  it("defaults to the public MCP server and full profile", () => {
    delete process.env.ASSEMBLY_API_MCP_BASE_URL;
    delete process.env.MCP_PROFILE;
    delete process.env.ASSEMBLY_API_MCP_PROFILE;

    expect(getMcpRuntimeConfig()).toEqual({
      baseUrl: "https://assembly-api-mcp.fly.dev/mcp",
      defaultProfile: "full",
    });
  });

  it("honors explicit base URL and lite profile override", () => {
    process.env.ASSEMBLY_API_MCP_BASE_URL = "https://mcp.internal.example/mcp";
    process.env.MCP_PROFILE = "lite";

    expect(getMcpRuntimeConfig()).toEqual({
      baseUrl: "https://mcp.internal.example/mcp",
      defaultProfile: "lite",
    });
  });
});

describe("MCP URL redaction", () => {
  it("masks query-string keys without removing other parameters", () => {
    expect(
      redactMcpUrl(
        "transport failed at https://assembly-api-mcp.fly.dev/mcp?key=SECRET123&profile=full",
      ),
    ).toBe(
      "transport failed at https://assembly-api-mcp.fly.dev/mcp?key=***&profile=full",
    );
  });

  it("surfaces sanitized transport errors to callers", () => {
    const original = new Error(
      "connect https://assembly-api-mcp.fly.dev/mcp?key=SECRET123&profile=full failed",
    );
    const sanitized = sanitizeMcpError(original);

    expect(sanitized.name).toBe(original.name);
    expect(sanitized.message).toContain("key=***");
    expect(sanitized.message).not.toContain("SECRET123");
    expect(sanitized.stack).not.toContain("SECRET123");
  });
});

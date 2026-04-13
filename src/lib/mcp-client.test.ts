import { afterEach, describe, expect, it } from "vitest";
import { getMcpRuntimeConfig } from "@/lib/mcp-client";

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


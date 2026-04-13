/**
 * Health check endpoint.
 *
 * Verifies the app can reach its critical dependencies:
 *   - Postgres (via Drizzle)
 *   - MCP server (via ping)
 *
 * Returns 200 with per-service status, or 503 if any service fails.
 * Used by setup wizard (to validate API keys before proceeding) and
 * by monitoring.
 */

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getMcpRuntimeConfig, pingMcp } from "@/lib/mcp-client";

interface HealthCheck {
  ok: boolean;
  error?: string;
  latencyMs?: number;
}

async function checkDb(): Promise<HealthCheck> {
  const t0 = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - t0,
    };
  }
}

async function checkMcp(): Promise<HealthCheck> {
  const t0 = Date.now();
  const result = await pingMcp();
  return {
    ...result,
    latencyMs: Date.now() - t0,
  };
}

export async function GET() {
  const [dbResult, mcpResult] = await Promise.all([checkDb(), checkMcp()]);
  const mcpRuntime = getMcpRuntimeConfig();

  const allOk = dbResult.ok && mcpResult.ok;
  return NextResponse.json(
    {
      ok: allOk,
      timestamp: new Date().toISOString(),
      services: {
        database: dbResult,
        mcp: {
          ...mcpResult,
          profile: mcpRuntime.defaultProfile,
          baseUrl: mcpRuntime.baseUrl,
          host: new URL(mcpRuntime.baseUrl).host,
        },
      },
    },
    { status: allOk ? 200 : 503 },
  );
}

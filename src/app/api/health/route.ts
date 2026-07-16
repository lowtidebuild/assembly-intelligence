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
import { getMcpRuntimeConfig, hasMcpKey, pingMcp } from "@/lib/mcp-client";

type HealthError =
  | "connection_failed"
  | "timeout"
  | "auth_failed"
  | "unknown";

interface HealthCheck {
  ok: boolean;
  error?: HealthError;
  latencyMs?: number;
  skipped?: boolean;
  optional?: boolean;
}

export function classifyHealthError(error: unknown): HealthError {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out|abort|ETIMEDOUT/i.test(message)) return "timeout";
  if (/auth|unauthorized|forbidden|invalid.*key|permission denied|\b40[13]\b/i.test(message)) {
    return "auth_failed";
  }
  if (/connection|connect|ECONN|ENOTFOUND|network|fetch failed|socket/i.test(message)) {
    return "connection_failed";
  }
  return "unknown";
}

async function checkDb(): Promise<HealthCheck> {
  const t0 = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    console.error("[health] database check failed", err);
    return {
      ok: false,
      error: classifyHealthError(err),
      latencyMs: Date.now() - t0,
    };
  }
}

async function checkMcp(): Promise<HealthCheck> {
  if (!hasMcpKey()) {
    return {
      ok: true,
      skipped: true,
      optional: true,
      latencyMs: 0,
    };
  }

  const t0 = Date.now();
  const result = await pingMcp();
  if (!result.ok) {
    console.error("[health] MCP check failed", result.error);
  }
  return {
    ok: result.ok,
    ...(result.error ? { error: classifyHealthError(result.error) } : {}),
    latencyMs: Date.now() - t0,
  };
}

export async function GET(request: Request) {
  const [dbResult, mcpResult] = await Promise.all([checkDb(), checkMcp()]);
  const allOk = dbResult.ok && mcpResult.ok;
  const timestamp = new Date().toISOString();
  const url = new URL(request.url);
  const wantsDetails =
    url.searchParams.get("verbose") === "1" ||
    url.searchParams.get("details") === "1";

  if (!wantsDetails) {
    return NextResponse.json(
      {
        ok: allOk,
        timestamp,
      },
      { status: allOk ? 200 : 503 },
    );
  }

  if (!isDetailedHealthAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "unauthorized",
      },
      { status: 401 },
    );
  }

  const mcpRuntime = getMcpRuntimeConfig();
  return NextResponse.json(
    {
      ok: allOk,
      timestamp,
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

function isDetailedHealthAuthorized(request: Request): boolean {
  const token = process.env.HEALTH_CHECK_TOKEN;
  if (!token) return false;

  const headerToken = request.headers.get("x-health-check-token") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";

  return timingSafeEqualString(headerToken || bearerToken, token);
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

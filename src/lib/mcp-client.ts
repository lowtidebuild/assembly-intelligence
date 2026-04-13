/**
 * MCP client wrapper for assembly-api-mcp.
 *
 * ── Transport: Streamable HTTP ────────────────────────────
 * The assembly-api-mcp server speaks MCP 1.x "streamable HTTP"
 * transport (not legacy SSE). Verified via the server's setup page
 * at https://assembly-api-mcp.fly.dev/ which documents:
 *
 *   claude mcp add assembly-api --transport http <URL>
 *
 * ── Connection strategy: shared, lazy, recoverable ────────
 * We maintain ONE persistent Client + Transport per process, created
 * lazily on first call. The original per-call connection pattern
 * triggered `{"error":"Invalid or expired session"}` HTTP 400s from
 * the upstream when calls came in rapid succession — apparently
 * opening+closing sessions back-to-back races the server's session
 * cleanup.
 *
 * With a persistent client:
 *   - First call opens the HTTP session once.
 *   - Subsequent calls reuse the same session ID.
 *   - If a call fails with a session error, the next call will
 *     transparently re-initialize (the cached client is discarded).
 *   - Process exit leaves the session to expire on its own.
 *
 * This is safe for Vercel serverless: each invocation gets its own
 * process, so the cached client lives exactly as long as the function.
 *
 * ── Concurrency ───────────────────────────────────────────
 * `p-limit(1)` — we observed the server drops sessions under any
 * parallelism. Fully serialized. 25-40s end-to-end for morning sync.
 *
 * ── Auth ──────────────────────────────────────────────────
 * The key is embedded in the URL as a query param:
 *   https://assembly-api-mcp.fly.dev/mcp?key=XXX&profile=full
 * Server-side only. The key must never reach the browser.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import pLimit from "p-limit";
import { withRetry, NonRetryableError, errorMessage } from "./api-base";

const DEFAULT_MCP_BASE_URL = "https://assembly-api-mcp.fly.dev/mcp";

export type McpProfile = "lite" | "full";

export interface McpRuntimeConfig {
  baseUrl: string;
  defaultProfile: McpProfile;
}

/** Fully serialized — parallelism triggers upstream session errors. */
const limit = pLimit(1);

/* ─────────────────────────────────────────────────────────────
 * URL construction
 * ────────────────────────────────────────────────────────────── */

function normalizeProfile(value: string | undefined): McpProfile {
  return value === "lite" ? "lite" : "full";
}

export function getMcpRuntimeConfig(): McpRuntimeConfig {
  return {
    baseUrl:
      process.env.ASSEMBLY_API_MCP_BASE_URL?.trim() || DEFAULT_MCP_BASE_URL,
    defaultProfile: normalizeProfile(
      process.env.MCP_PROFILE ?? process.env.ASSEMBLY_API_MCP_PROFILE,
    ),
  };
}

function buildClientCacheKey(profile: McpProfile): string {
  const runtime = getMcpRuntimeConfig();
  return `${runtime.baseUrl}|${profile}`;
}

function getMcpUrl(profile: McpProfile): URL {
  const key = process.env.ASSEMBLY_API_MCP_KEY;
  if (!key) {
    throw new NonRetryableError(
      "ASSEMBLY_API_MCP_KEY is not set in .env.local",
    );
  }
  const { baseUrl } = getMcpRuntimeConfig();
  const url = new URL(baseUrl);
  url.searchParams.set("key", key);
  url.searchParams.set("profile", profile);
  return url;
}

/* ─────────────────────────────────────────────────────────────
 * Shared client (lazy, reopens on failure)
 * ────────────────────────────────────────────────────────────── */

const sharedClients = new Map<string, Client>();

/** Create a fresh Client+Transport and connect. */
async function openClient(profile: McpProfile): Promise<Client> {
  const client = new Client(
    { name: "assembly-intelligence", version: "0.1.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(getMcpUrl(profile));
  await client.connect(transport);
  return client;
}

/** Get (or create) the shared client. */
async function getClient(profile: McpProfile): Promise<Client> {
  const cacheKey = buildClientCacheKey(profile);
  const existing = sharedClients.get(cacheKey);
  if (existing) return existing;

  const client = await openClient(profile);
  sharedClients.set(cacheKey, client);
  return client;
}

/** Force-close the shared client and clear it (used after a hard error). */
async function resetClient(profile: McpProfile): Promise<void> {
  const cacheKey = buildClientCacheKey(profile);
  const prev = sharedClients.get(cacheKey) ?? null;
  sharedClients.delete(cacheKey);
  if (prev) {
    await prev.close().catch(() => {});
  }
}

/**
 * Run `fn` against the shared client, recreating it on ANY failure.
 *
 * We're aggressive here because the upstream server (flaky fly.dev
 * backend) returns "Invalid or expired session" errors with
 * inconsistent message nesting (sometimes at the notification
 * layer, sometimes as a wrapped cause). Rather than pattern-match
 * all variants, just reset + retry once on any thrown error.
 * Opening a new client is cheap (sub-100ms); this keeps the call
 * sites dumb and the retry behavior consistent.
 */
async function runWithSharedClient<T>(
  profile: McpProfile,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  try {
    const client = await getClient(profile);
    return await fn(client);
  } catch (firstErr) {
    await resetClient(profile);
    try {
      const client = await getClient(profile);
      return await fn(client);
    } catch {
      // Surface the ORIGINAL error — the retry failure is usually
      // just a propagation of the same upstream issue.
      throw firstErr;
    }
  }
}

/* ─────────────────────────────────────────────────────────────
 * Public API
 * ────────────────────────────────────────────────────────────── */

/**
 * Call an MCP tool and return its `content` as JSON.
 *
 * The MCP spec says tool responses have a `content` array of
 * text/image/resource parts. For this integration, assembly-api-mcp
 * returns a single text part with a JSON-serialized payload — we
 * extract and parse it here so callers work with typed objects.
 *
 * Returns `null` if the response has no text content (server
 * returned image/resource/etc — shouldn't happen for this server).
 *
 * Retries up to 3 times with exponential backoff (1s, 3s, 9s).
 */
export async function callMcpTool<T = unknown>(
  toolName: string,
  args?: Record<string, unknown>,
  options?: {
    profile?: McpProfile;
  },
): Promise<T | null> {
  const profile = options?.profile ?? getMcpRuntimeConfig().defaultProfile;
  return limit(() =>
    withRetry(
      async () => {
        return runWithSharedClient(profile, async (client) => {
          const result = await client.callTool({
            name: toolName,
            arguments: args ?? {},
          });

          const content = Array.isArray(result.content) ? result.content : [];
          for (const part of content) {
            if (
              part &&
              typeof part === "object" &&
              "type" in part &&
              part.type === "text" &&
              "text" in part &&
              typeof part.text === "string"
            ) {
              try {
                return JSON.parse(part.text) as T;
              } catch {
                return part.text as T;
              }
            }
          }
          return null;
        });
      },
      { operation: `mcp.${toolName}`, maxAttempts: 3, baseDelayMs: 1000 },
    ),
  );
}

/**
 * Same as callMcpTool but throws if the result is null.
 * Use this when you know the tool always returns data.
 */
export async function callMcpToolOrThrow<T>(
  toolName: string,
  args?: Record<string, unknown>,
  options?: {
    profile?: McpProfile;
  },
): Promise<T> {
  const result = await callMcpTool<T>(toolName, args, options);
  if (result === null) {
    throw new Error(`MCP tool "${toolName}" returned no text content`);
  }
  return result;
}

/**
 * List all available tools on the MCP server. Useful for debugging
 * and for a future "developer tools" settings panel.
 */
export async function listMcpTools(options?: {
  profile?: McpProfile;
}): Promise<Array<{ name: string; description?: string }>> {
  const profile = options?.profile ?? getMcpRuntimeConfig().defaultProfile;
  return limit(() =>
    withRetry(
      () =>
        runWithSharedClient(profile, async (client) => {
          const result = await client.listTools();
          return result.tools.map((t) => ({
            name: t.name,
            description: t.description,
          }));
        }),
      { operation: "mcp.listTools", maxAttempts: 2 },
    ),
  );
}

/**
 * Cheap health check. Opens a connection if needed and tries
 * listing tools. Used by /api/health and setup wizard to verify
 * the key works before proceeding.
 */
export async function pingMcp(options?: {
  profile?: McpProfile;
}): Promise<{
  ok: boolean;
  error?: string;
}> {
  const profile = options?.profile ?? getMcpRuntimeConfig().defaultProfile;
  try {
    await runWithSharedClient(profile, async (client) => {
      await client.listTools();
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Explicit cleanup — used by scripts/tests that want deterministic
 * shutdown. Not required in serverless invocations (process exit
 * drops the connection).
 */
export async function closeMcp(): Promise<void> {
  const entries = [...sharedClients.entries()];
  sharedClients.clear();
  await Promise.all(
    entries.map(([, client]) =>
      client.close().catch(() => {}),
    ),
  );
}

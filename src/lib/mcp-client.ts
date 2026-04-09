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
 *   https://assembly-api-mcp.fly.dev/mcp?key=XXX&profile=lite
 * Server-side only. The key must never reach the browser.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import pLimit from "p-limit";
import { withRetry, NonRetryableError, errorMessage } from "./api-base";

const MCP_BASE_URL = "https://assembly-api-mcp.fly.dev/mcp";
const MCP_PROFILE = "lite"; // "lite" vs "full" — lite is enough for MVP

/** Fully serialized — parallelism triggers upstream session errors. */
const limit = pLimit(1);

/* ─────────────────────────────────────────────────────────────
 * URL construction
 * ────────────────────────────────────────────────────────────── */

function getMcpUrl(): URL {
  const key = process.env.ASSEMBLY_API_MCP_KEY;
  if (!key) {
    throw new NonRetryableError(
      "ASSEMBLY_API_MCP_KEY is not set in .env.local",
    );
  }
  const url = new URL(MCP_BASE_URL);
  url.searchParams.set("key", key);
  url.searchParams.set("profile", MCP_PROFILE);
  return url;
}

/* ─────────────────────────────────────────────────────────────
 * Shared client (lazy, reopens on failure)
 * ────────────────────────────────────────────────────────────── */

let sharedClient: Client | null = null;

/** Create a fresh Client+Transport and connect. */
async function openClient(): Promise<Client> {
  const client = new Client(
    { name: "assembly-intelligence", version: "0.1.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(getMcpUrl());
  await client.connect(transport);
  return client;
}

/** Get (or create) the shared client. */
async function getClient(): Promise<Client> {
  if (sharedClient) return sharedClient;
  sharedClient = await openClient();
  return sharedClient;
}

/** Force-close the shared client and clear it (used after a hard error). */
async function resetClient(): Promise<void> {
  const prev = sharedClient;
  sharedClient = null;
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
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  try {
    const client = await getClient();
    return await fn(client);
  } catch (firstErr) {
    await resetClient();
    try {
      const client = await getClient();
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
): Promise<T | null> {
  return limit(() =>
    withRetry(
      async () => {
        return runWithSharedClient(async (client) => {
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
): Promise<T> {
  const result = await callMcpTool<T>(toolName, args);
  if (result === null) {
    throw new Error(`MCP tool "${toolName}" returned no text content`);
  }
  return result;
}

/**
 * List all available tools on the MCP server. Useful for debugging
 * and for a future "developer tools" settings panel.
 */
export async function listMcpTools(): Promise<
  Array<{ name: string; description?: string }>
> {
  return limit(() =>
    withRetry(
      () =>
        runWithSharedClient(async (client) => {
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
export async function pingMcp(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    await runWithSharedClient(async (client) => {
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
  await resetClient();
}

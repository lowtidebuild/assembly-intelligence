/**
 * MCP client wrapper for assembly-api-mcp.
 *
 * ── Transport: Streamable HTTP ────────────────────────────
 * The assembly-api-mcp server speaks the MCP 1.x "streamable HTTP"
 * transport (not legacy SSE). Verified via the server's setup page
 * at https://assembly-api-mcp.fly.dev/ which documents:
 *
 *   claude mcp add assembly-api --transport http <URL>
 *
 * We use StreamableHTTPClientTransport from the SDK accordingly.
 * Initial SSE-based attempts returned `{"error":"Invalid or
 * expired session"}` (HTTP 400) because that server endpoint
 * doesn't accept SSE connections.
 *
 * ── Connection strategy: per-call ─────────────────────────
 * Each tool call opens a fresh HTTP transport, sends one request,
 * gets the response, and closes. Per-call overhead is minimal
 * because streamable HTTP is stateless (no long-lived connection).
 * Safe for Vercel serverless.
 *
 * ── Rate limiting ─────────────────────────────────────────
 * `p-limit` with concurrency 5 protects the MCP server from
 * connection storms during morning sync (which fetches
 * bills + schedules + votes + lawmakers in parallel).
 *
 * ── Auth ──────────────────────────────────────────────────
 * The key is embedded in the URL as a query param:
 *   https://assembly-api-mcp.fly.dev/mcp?key=XXX&profile=lite
 *
 * Server-side only. The key must never reach the browser.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import pLimit from "p-limit";
import { withRetry, NonRetryableError, errorMessage } from "./api-base";

const MCP_BASE_URL = "https://assembly-api-mcp.fly.dev/mcp";
const MCP_PROFILE = "lite"; // "lite" vs "full" — lite is enough for MVP

/** Max 5 concurrent MCP connections, hard ceiling. */
const limit = pLimit(5);

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
 * Per-call connection
 * ────────────────────────────────────────────────────────────── */

/**
 * Open an MCP client, run `fn(client)`, then close the connection.
 *
 * Always use this over raw SSEClientTransport — it guarantees
 * cleanup on error paths and keeps connection lifecycle short.
 */
async function withMcpClient<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(
    { name: "assembly-intelligence", version: "0.1.0" },
    { capabilities: {} },
  );

  const transport = new StreamableHTTPClientTransport(getMcpUrl());

  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    // Best-effort close — swallow errors here because we're
    // already in the finally block and the caller's result
    // (success or failure) has priority.
    await client.close().catch(() => {});
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
        return withMcpClient(async (client) => {
          const result = await client.callTool({
            name: toolName,
            arguments: args ?? {},
          });

          // Locate first text part
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
              // Try to parse as JSON; if it's plain text, return as-is
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
        withMcpClient(async (client) => {
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
 * Cheap health check. Opens a connection and immediately closes.
 * Used by /api/health and setup wizard to verify the key works
 * before proceeding.
 */
export async function pingMcp(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    await withMcpClient(async () => {
      // Connect-and-close is enough to verify auth + reachability
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

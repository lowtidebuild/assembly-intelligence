/**
 * Shared retry + error handling for external API calls.
 *
 * Used by mcp-client, gemini-client, and news-client to get consistent
 * retry behavior without each client rolling its own.
 */

export interface RetryOptions {
  /** Max attempts (including the first). Default 3. */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff. Default 1000 (1s, 3s, 9s). */
  baseDelayMs?: number;
  /** Operation name for error messages */
  operation: string;
  /** Optional abort signal for timeout integration */
  signal?: AbortSignal;
}

/**
 * Error that should NOT trigger a retry (e.g. 4xx client errors, validation
 * failures). Throwing this from the callback skips remaining retries.
 */
export class NonRetryableError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NonRetryableError";
  }
}

/**
 * Runs `fn` with exponential backoff on failure.
 *
 * Default backoff: 1s, 3s, 9s (3 attempts total).
 *
 * Example:
 *   const result = await withRetry(
 *     () => mcpClient.callTool({ name: "search_bills", arguments: {...} }),
 *     { operation: "search_bills", maxAttempts: 3 },
 *   );
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 1000;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.signal?.aborted) {
      throw new Error(`${opts.operation}: aborted`);
    }

    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      // Non-retryable errors bubble up immediately
      if (err instanceof NonRetryableError) {
        throw err;
      }

      // Last attempt failed, no more retries
      if (attempt === maxAttempts) {
        break;
      }

      // Exponential backoff: baseDelay * 3^(attempt-1)
      // attempt 1 fails → wait baseDelay (1s)
      // attempt 2 fails → wait baseDelay * 3 (3s)
      // attempt 3 fails → wait baseDelay * 9 (9s) — but only if maxAttempts > 3
      const delay = baseDelay * Math.pow(3, attempt - 1);
      await sleep(delay, opts.signal);
    }
  }

  // All attempts exhausted
  throw new Error(
    `${opts.operation} failed after ${maxAttempts} attempts: ${errorMessage(lastError)}`,
    { cause: lastError },
  );
}

/**
 * Sleep that honors an AbortSignal.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}

/**
 * Extract a human-readable message from any thrown value.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

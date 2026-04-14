export function flattenErrorText(err: unknown): string {
  const seen = new Set<unknown>();
  const parts: string[] = [];
  let current: unknown = err;

  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
      continue;
    }
    parts.push(String(current));
    break;
  }

  return parts.join(" | ");
}

export function isRetryableDbReadError(err: unknown): boolean {
  const message = flattenErrorText(err);
  return (
    message.includes("Failed to acquire permit to connect to the database") ||
    message.includes("Too many database connection attempts") ||
    message.includes("remaining connection slots are reserved") ||
    message.includes("connection attempts are currently ongoing") ||
    message.includes('"neon:retryable":true')
  );
}

export async function withDbReadRetry<T>(
  loader: () => Promise<T>,
  {
    attempts = 5,
    delayMs = 250,
  }: {
    attempts?: number;
    delayMs?: number;
  } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await loader();
    } catch (err) {
      lastError = err;
      if (!isRetryableDbReadError(err) || attempt === attempts) {
        throw err;
      }

      const waitMs = delayMs * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}

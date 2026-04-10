/**
 * Shared password gate — HMAC-signed session tokens.
 *
 * This is intentionally tiny because the threat model is tiny:
 * an internal tool where everyone on the team knows the same password.
 * We're gatekeeping against random internet traffic and accidental
 * link-sharing, not defending against nation-states.
 *
 * ── Token format ─────────────────────────────────────────
 *   <expiryMs>.<hmacBase64Url>
 *
 * where:
 *   expiryMs = Date.now() + SESSION_DURATION_MS at sign time
 *   hmac     = HMAC-SHA256(APP_PASSWORD as key, expiryMs as message)
 *
 * Verifying:
 *   1. Split token on "."
 *   2. Parse expiry, check > now
 *   3. Recompute HMAC(APP_PASSWORD, expiry)
 *   4. Constant-time compare against the provided sig
 *
 * Rotating APP_PASSWORD invalidates every session — the correct
 * behavior for a shared-password scheme.
 *
 * ── Edge runtime ─────────────────────────────────────────
 * Middleware runs in the Edge runtime, which has Web Crypto but
 * no Node `crypto` module. We use `crypto.subtle.sign` with HMAC,
 * which is available in both Edge and Node 18+.
 *
 * ── Dev mode bypass ──────────────────────────────────────
 * When APP_PASSWORD is unset AND NODE_ENV !== "production", auth is
 * disabled entirely (with a console warning). In production, a
 * missing APP_PASSWORD is a hard failure.
 */

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Name of the auth cookie — prefixed so it's namespaced in devtools. */
export const AUTH_COOKIE_NAME = "parlawatch_auth";

/** Query string used by middleware to remember where to return to. */
export const RETURN_TO_PARAM = "return_to";

/* ─────────────────────────────────────────────────────────────
 * Password presence / dev bypass
 * ────────────────────────────────────────────────────────────── */

export interface AuthMode {
  /** True when auth is enforced (APP_PASSWORD is set). */
  enforced: boolean;
  /** Cached password value — undefined when enforced=false. */
  password?: string;
}

export function getAuthMode(): AuthMode {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "APP_PASSWORD is not set. Shared-password auth cannot run in production without it.",
      );
    }
    return { enforced: false };
  }
  return { enforced: true, password };
}

/* ─────────────────────────────────────────────────────────────
 * Encoding helpers (Edge-safe, no Buffer)
 * ────────────────────────────────────────────────────────────── */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const pad = b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
  const b64 = b64url.replaceAll("-", "+").replaceAll("_", "/") + pad;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Constant-time byte array equality. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ─────────────────────────────────────────────────────────────
 * HMAC via Web Crypto
 * ────────────────────────────────────────────────────────────── */

async function importHmacKey(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function computeHmac(
  password: string,
  message: string,
): Promise<Uint8Array> {
  const key = await importHmacKey(password);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return new Uint8Array(sig);
}

/* ─────────────────────────────────────────────────────────────
 * Sign / verify
 * ────────────────────────────────────────────────────────────── */

/**
 * Create a new session token. Pass the raw submitted password —
 * we DON'T check it here (that's the login route's job), we only
 * sign the expiry.
 */
export async function signToken(password: string): Promise<string> {
  const expiry = Date.now() + SESSION_DURATION_MS;
  const expiryStr = String(expiry);
  const sig = await computeHmac(password, expiryStr);
  return `${expiryStr}.${bytesToBase64Url(sig)}`;
}

export type TokenCheckResult =
  | { ok: true }
  | { ok: false; reason: "malformed" | "expired" | "bad_sig" };

/**
 * Verify a token against the current APP_PASSWORD.
 * Returns structured failure reasons so middleware can log why
 * a session was rejected (useful when debugging rotation).
 */
export async function verifyToken(
  password: string,
  token: string,
): Promise<TokenCheckResult> {
  const dotIdx = token.indexOf(".");
  if (dotIdx <= 0 || dotIdx === token.length - 1) {
    return { ok: false, reason: "malformed" };
  }
  const expiryStr = token.slice(0, dotIdx);
  const sigStr = token.slice(dotIdx + 1);

  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry)) {
    return { ok: false, reason: "malformed" };
  }
  if (expiry < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  let providedSig: Uint8Array;
  try {
    providedSig = base64UrlToBytes(sigStr);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const expectedSig = await computeHmac(password, expiryStr);
  if (!timingSafeEqual(providedSig, expectedSig)) {
    return { ok: false, reason: "bad_sig" };
  }

  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────
 * Cookie options (shared between login and middleware)
 * ────────────────────────────────────────────────────────────── */

export function buildAuthCookieOptions(secure: boolean) {
  return {
    name: AUTH_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  };
}

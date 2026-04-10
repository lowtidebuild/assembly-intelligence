/**
 * /login — shared password gate entry point.
 *
 * Form POSTs to /api/auth/login with `password` and `return_to`.
 * On success the route sets the auth cookie and redirects to
 * return_to. On failure the route redirects back here with
 * ?error=... so we can show a message.
 */

import Link from "next/link";
import { RETURN_TO_PARAM } from "@/lib/auth";
import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    return_to?: string;
    error?: string;
  }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  bad_password: "비밀번호가 올바르지 않습니다.",
  missing: "비밀번호를 입력해 주세요.",
  server: "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

export default async function LoginPage(props: Props) {
  const sp = await props.searchParams;
  const returnTo = sp.return_to || "/briefing";
  const errorCode = sp.error;
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] ?? null : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-[var(--radius)] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-[22px] font-extrabold tracking-[-0.01em] text-[var(--color-primary)]">
            ParlaWatch+
          </h1>
          <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
            산업별 국회 인텔리전스 대시보드
          </p>
        </div>

        <form
          method="POST"
          action="/api/auth/login"
          className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]"
        >
          <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-[var(--color-text)]">
            비밀번호
            <input
              type="password"
              name="password"
              autoFocus
              required
              autoComplete="current-password"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[14px] text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </label>

          <input type="hidden" name={RETURN_TO_PARAM} value={returnTo} />

          <button
            type="submit"
            className="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            로그인
          </button>

          {errorMessage && (
            <p className="text-[12px] text-[var(--color-error)]">{errorMessage}</p>
          )}
        </form>

        <p className="mt-4 text-center text-[11px] text-[var(--color-text-tertiary)]">
          관리자에게 비밀번호를 문의하세요.{" "}
          <Link
            href="/api/health"
            className="text-[var(--color-primary)] hover:underline"
            target="_blank"
          >
            시스템 상태
          </Link>
        </p>
      </div>
    </div>
  );
}

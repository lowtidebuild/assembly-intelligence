/**
 * /settings — configuration overview page.
 *
 * Read-only for now. Shows:
 *   - Active industry profile (name, keywords, committees, llm_context)
 *   - Environment status (DB, MCP, Gemini key presence)
 *   - Last sync metadata
 *
 * Editing comes with the Setup wizard lane. This page is a landing
 * for "what am I currently configured to watch?"
 */

import { db } from "@/db";
import {
  industryProfile,
  industryCommittee,
  syncLog,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Settings as SettingsIcon, Database, Sparkles, Globe } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [profileRows, recentSyncs] = await Promise.all([
    db.select().from(industryProfile).limit(1),
    db.select().from(syncLog).orderBy(desc(syncLog.startedAt)).limit(5),
  ]);

  const profile = profileRows[0];
  const committees = profile
    ? await db
        .select()
        .from(industryCommittee)
        .where(eq(industryCommittee.industryProfileId, profile.id))
    : [];

  const envStatus = {
    db: Boolean(process.env.DATABASE_URL),
    mcp: Boolean(process.env.ASSEMBLY_API_MCP_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    naver: Boolean(
      process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET,
    ),
    cronSecret: Boolean(process.env.CRON_SECRET),
  };

  return (
    <>
      <PageHeader title="설정" subtitle="현재 프로필 및 환경 상태" />

      <div className="mx-auto grid max-w-[900px] grid-cols-1 gap-6 p-6">
        {/* Industry profile */}
        <Card icon={<SettingsIcon className="h-4 w-4" />} title="산업 프로필">
          {profile ? (
            <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-[13px]">
              <Row label="이름">
                <span className="font-semibold">
                  {profile.icon} {profile.name}
                </span>
                <span className="ml-2 text-[11px] text-[var(--color-text-tertiary)]">
                  ({profile.nameEn})
                </span>
              </Row>
              <Row label="프리셋 버전">
                <span className="font-mono text-[12px] text-[var(--color-text-secondary)]">
                  {profile.presetVersion ?? "custom"}
                </span>
              </Row>
              <Row label="설명">{profile.description || "—"}</Row>
              <Row label={`키워드 (${profile.keywords.length})`}>
                <div className="flex flex-wrap gap-1">
                  {profile.keywords.map((k) => (
                    <span
                      key={k}
                      className="inline-block rounded-[var(--radius-sm)] bg-[var(--color-primary-light)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-primary)]"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </Row>
              <Row label={`위원회 (${committees.length})`}>
                <div className="flex flex-wrap gap-1">
                  {committees.map((c) => (
                    <span
                      key={c.id}
                      className="inline-block rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]"
                    >
                      {c.committeeCode}
                    </span>
                  ))}
                </div>
              </Row>
              <Row label="LLM 컨텍스트">
                <details className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                  <summary className="cursor-pointer text-[var(--color-primary)]">
                    {profile.llmContext.slice(0, 80)}...
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] p-3 font-sans">
                    {profile.llmContext}
                  </pre>
                </details>
              </Row>
            </dl>
          ) : (
            <p className="text-[13px] text-[var(--color-text-tertiary)]">
              프로필이 설정되지 않았습니다. Setup wizard가 완성되면 여기서
              시작할 수 있습니다.
            </p>
          )}
        </Card>

        {/* Environment */}
        <Card icon={<Database className="h-4 w-4" />} title="환경 변수">
          <ul className="grid grid-cols-2 gap-2 text-[12px]">
            <EnvRow label="DATABASE_URL" ok={envStatus.db} />
            <EnvRow label="ASSEMBLY_API_MCP_KEY" ok={envStatus.mcp} />
            <EnvRow label="GEMINI_API_KEY" ok={envStatus.gemini} />
            <EnvRow label="NAVER_CLIENT_*" ok={envStatus.naver} />
            <EnvRow label="CRON_SECRET" ok={envStatus.cronSecret} />
          </ul>
          <p className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
            CRON_SECRET은 프로덕션(Vercel) 환경에서만 필요합니다. 로컬
            개발에서는 자동 우회됩니다.
          </p>
        </Card>

        {/* Recent syncs */}
        <Card icon={<Sparkles className="h-4 w-4" />} title="최근 동기화">
          {recentSyncs.length === 0 ? (
            <p className="text-[13px] text-[var(--color-text-tertiary)]">
              아직 동기화 기록이 없습니다.
            </p>
          ) : (
            <ul className="space-y-2 text-[12px]">
              {recentSyncs.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <StatusDot status={s.status} />
                    <span className="font-semibold text-[var(--color-text)]">
                      {s.syncType}
                    </span>
                    <span className="text-[11px] text-[var(--color-text-secondary)]">
                      {s.startedAt.toISOString().slice(5, 16).replace("T", " ")}
                    </span>
                  </div>
                  <div className="flex gap-4 text-[11px] text-[var(--color-text-secondary)]">
                    <span>
                      bills{" "}
                      <strong className="text-[var(--color-text)]">
                        {s.billsScored}/{s.billsProcessed}
                      </strong>
                    </span>
                    <span>
                      legi{" "}
                      <strong className="text-[var(--color-text)]">
                        {s.legislatorsUpdated}
                      </strong>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Docs */}
        <Card icon={<Globe className="h-4 w-4" />} title="참고">
          <ul className="space-y-1 text-[12px] text-[var(--color-text-secondary)]">
            <li>• 동기화 스케줄: 06:30 + 18:30 KST</li>
            <li>• MCP 서버: assembly-api-mcp.fly.dev (Streamable HTTP)</li>
            <li>• LLM: Gemini 2.5 Flash (scoring) + Pro (briefing)</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-2 border-b border-[var(--color-border)] pb-3 text-[14px] font-bold text-[var(--color-text)]">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="contents">
      <dt className="text-[var(--color-text-tertiary)]">{label}</dt>
      <dd className="text-[var(--color-text)]">{children}</dd>
    </div>
  );
}

function EnvRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
      <span
        className={`h-2 w-2 rounded-full ${ok ? "bg-[var(--color-success)]" : "bg-[var(--color-error)]"}`}
      />
      <span className="flex-1 font-mono text-[11px] text-[var(--color-text-secondary)]">
        {label}
      </span>
      <span className="text-[10px] font-semibold uppercase">
        {ok ? "SET" : "MISSING"}
      </span>
    </li>
  );
}

function StatusDot({
  status,
}: {
  status: "success" | "partial" | "failed" | string;
}) {
  const color =
    status === "success"
      ? "bg-[var(--color-success)]"
      : status === "partial"
        ? "bg-[var(--color-warning)]"
        : "bg-[var(--color-error)]";
  return <span className={`h-2 w-2 rounded-full ${color}`} />;
}

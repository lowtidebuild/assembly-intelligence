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
  industryCommittee,
  legislator,
  syncLog,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { McpCapabilityPanel } from "@/components/mcp-capability-panel";
import Link from "next/link";
import { getMcpRuntimeConfig, hasMcpKey } from "@/lib/mcp-client";
import { loadActiveIndustryProfileCompat, withDbReadRetry } from "@/lib/db-compat";
import { getMixin, mergeCommitteesWithMixins } from "@/lib/law-mixins";
import {
  Settings as SettingsIcon,
  Database,
  Sparkles,
  Globe,
  Edit3,
  Radar,
  ExternalLink,
} from "lucide-react";

export const revalidate = 300;

export default async function SettingsPage() {
  const mcpRuntime = getMcpRuntimeConfig();
  const mcpConfigured = hasMcpKey();
  const [profileRows, recentSyncs] = await withDbReadRetry(() =>
    Promise.all([
      loadActiveIndustryProfileCompat().then((profile) => (profile ? [profile] : [])),
      db
        .select({
          id: syncLog.id,
          syncType: syncLog.syncType,
          status: syncLog.status,
          startedAt: syncLog.startedAt,
          completedAt: syncLog.completedAt,
          billsProcessed: syncLog.billsProcessed,
          billsScored: syncLog.billsScored,
          legislatorsUpdated: syncLog.legislatorsUpdated,
          newsFetched: syncLog.newsFetched,
          errorsJson: syncLog.errorsJson,
        })
        .from(syncLog)
        .orderBy(desc(syncLog.startedAt))
        .limit(5),
    ]),
  );

  const profile = profileRows[0];
  const committees = profile
    ? await withDbReadRetry(() =>
        db
          .select()
          .from(industryCommittee)
          .where(eq(industryCommittee.industryProfileId, profile.id)),
      )
    : [];
  const committeeLeaders = profile
    ? await withDbReadRetry(() =>
        db
          .select({
            name: legislator.name,
            committees: legislator.committees,
            committeeRole: legislator.committeeRole,
          })
          .from(legislator)
          .where(
            and(
              eq(legislator.isActive, true),
              sql`${legislator.committeeRole} IN ('위원장', '간사')`,
            ),
          ),
      )
    : [];
  const profileCommitteeCodes = committees.map((c) => c.committeeCode);
  const effectiveCommitteeCodes = profile
    ? mergeCommitteesWithMixins(
        profileCommitteeCodes,
        profile.selectedLawMixins ?? [],
      )
    : [];
  const profileCommitteeSet = new Set(profileCommitteeCodes);
  const mixinDerivedCommittees = effectiveCommitteeCodes.filter(
    (code) => !profileCommitteeSet.has(code),
  );

  const envStatus = {
    db: Boolean(process.env.DATABASE_URL),
    mcp: mcpConfigured,
    gemini: Boolean(process.env.GEMINI_API_KEY),
    naver: Boolean(
      process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET,
    ),
    cronSecret: Boolean(process.env.CRON_SECRET),
  };
  const sampleKeyword = profile?.keywords[0] ?? profile?.name ?? "예산";

  return (
    <>
      <PageHeader title="설정" subtitle="현재 프로필 및 환경 상태" />

      <div className="mx-auto grid max-w-[900px] grid-cols-1 gap-6 p-6">
        {/* Industry profile */}
        <Card
          icon={<SettingsIcon className="h-4 w-4" />}
          title="산업 프로필"
          action={
            <Link
              href="/setup"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)]"
            >
              <Edit3 className="h-3 w-3" />
              {profile ? "편집" : "시작하기"}
            </Link>
          }
        >
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
              <Row label="관련 법률">
                {profile.selectedLawMixins.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {profile.selectedLawMixins.map((slug) => {
                      const mixin = getMixin(slug);
                      return (
                        <span
                          key={slug}
                          title={mixin?.formalName ?? slug}
                          className="inline-block rounded-[var(--radius-sm)] bg-[var(--color-primary-light)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-primary)]"
                        >
                          {mixin?.name ?? slug}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-[12px] text-[var(--color-text-tertiary)]">
                    추가 법률 없음. <Link href="/setup" className="underline">/setup</Link>
                    에서 선택할 수 있습니다.
                  </span>
                )}
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
              <Row label={`위원회 (${effectiveCommitteeCodes.length})`}>
                <div className="flex flex-col gap-2">
                  {mixinDerivedCommittees.length > 0 && (
                    <p className="text-[11px] text-[var(--color-text-tertiary)]">
                      선택한 법률 믹스인의 소관위는 아침 동기화 시 자동으로 fetch
                      pool에 포함됩니다.
                    </p>
                  )}
                  {effectiveCommitteeCodes.map((committeeCode) => {
                    const leaders = leadersForCommittee(
                      committeeCode,
                      committeeLeaders,
                    );
                    const isDerived = mixinDerivedCommittees.includes(committeeCode);
                    return (
                      <div
                        key={committeeCode}
                        className="rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] text-[var(--color-text-secondary)]"
                      >
                        <div className="flex items-center gap-2 font-semibold text-[var(--color-text)]">
                          <span>{committeeCode}</span>
                          {isDerived && (
                            <span className="rounded-[var(--radius-sm)] border border-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-primary)]">
                              믹스인 자동 추가
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5">
                          {leaders.chair.length > 0 || leaders.secretaries.length > 0 ? (
                            <>
                              {leaders.chair.length > 0 && (
                                <span>위원장: {leaders.chair.join("·")}</span>
                              )}
                              {leaders.chair.length > 0 &&
                                leaders.secretaries.length > 0 && <span>, </span>}
                              {leaders.secretaries.length > 0 && (
                                <span>간사: {leaders.secretaries.join("·")}</span>
                              )}
                            </>
                          ) : (
                            <span>위원장/간사 정보 없음</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
            <EnvRow label="ASSEMBLY_API_MCP_KEY (선택)" ok={envStatus.mcp} />
            <EnvRow label="GEMINI_API_KEY" ok={envStatus.gemini} />
            <EnvRow label="NAVER_CLIENT_*" ok={envStatus.naver} />
            <EnvRow label="CRON_SECRET" ok={envStatus.cronSecret} />
          </ul>
          <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-2 text-[12px]">
            <Row label="MCP 프로필">
              <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">
                {mcpRuntime.defaultProfile}
              </span>
            </Row>
            <Row label="MCP 서버">
              <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">
                {mcpRuntime.baseUrl}
              </span>
            </Row>
          </dl>
          <p className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
            CRON_SECRET은 프로덕션(Vercel) 환경에서만 필요합니다. 로컬
            개발에서는 자동 우회됩니다. `ASSEMBLY_API_MCP_KEY`는
            mock-data/read-only 데모 배포라면 없어도 됩니다.
          </p>
        </Card>

        <Card
          icon={<Radar className="h-4 w-4" />}
          title="최신 MCP 기능"
          action={
            <a
              href={`/api/mcp/capabilities?keyword=${encodeURIComponent(sampleKeyword)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)]"
            >
              <ExternalLink className="h-3 w-3" />
              capability JSON
            </a>
          }
        >
          {mcpConfigured ? (
            <McpCapabilityPanel sampleKeyword={sampleKeyword} />
          ) : (
            <p className="text-[12px] text-[var(--color-text-tertiary)]">
              MCP 키가 없어서 최신 capability probe를 건너뛰었습니다.
              mock-data/read-only 데모 배포에서는 정상입니다.
            </p>
          )}
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
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-2 border-b border-[var(--color-border)] pb-3 text-[14px] font-bold text-[var(--color-text)]">
        {icon}
        <span>{title}</span>
        {action && <span className="ml-auto">{action}</span>}
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

function leadersForCommittee(
  committeeCode: string,
  leaders: Array<{
    name: string;
    committees: string[];
    committeeRole: string | null;
  }>,
) {
  const chair: string[] = [];
  const secretaries: string[] = [];

  for (const leader of leaders) {
    if (!leader.committees.includes(committeeCode)) continue;
    if (leader.committeeRole === "위원장") chair.push(leader.name);
    if (leader.committeeRole === "간사") secretaries.push(leader.name);
  }

  return { chair, secretaries };
}

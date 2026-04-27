import type { MissingSchemaColumn } from "@/lib/schema-preflight";
import {
  syncDurationMs,
  type SyncHealthLogRow,
  type SyncHealthSummary,
} from "@/lib/sync-health-dashboard";
import { cn } from "@/lib/utils";

interface EnvStatus {
  database: boolean;
  mcp: boolean;
  gemini: boolean;
  naver: boolean;
  cronSecret: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  success: "성공",
  partial: "부분 성공",
  failed: "실패",
};

const SYNC_TYPE_LABELS: Record<string, string> = {
  morning: "Morning",
  evening: "Evening",
  manual: "Manual",
};

const SOURCE_LABELS: Record<string, string> = {
  committee: "위원회 목록",
  mixin_law: "법률명 검색",
  bill_name: "의안명 검색",
  manual_watch: "수동 watch",
};

const EVIDENCE_LABELS: Record<string, string> = {
  title_only: "제목만",
  metadata: "메타데이터",
  body: "본문 기반",
  body_with_references: "본문+참고자료",
};

const BODY_STATUS_LABELS: Record<string, string> = {
  not_attempted: "미시도",
  from_mcp_detail: "MCP detail",
  from_existing_db: "기존 DB",
  fetched: "본문 확보",
  empty: "본문 없음",
  failed: "확보 실패",
};

export function HealthSummaryCards({
  summary,
  missingColumns,
  envStatus,
}: {
  summary: SyncHealthSummary;
  missingColumns: MissingSchemaColumn[];
  envStatus: EnvStatus;
}) {
  const envReady = Object.values(envStatus).filter(Boolean).length;
  const envTotal = Object.values(envStatus).length;
  const parseFailureCount = sumRecord(summary.parseFailures);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        title="Morning"
        value={latestLabel(summary.latestMorning)}
        detail={latestDetail(summary.latestMorning)}
        status={summary.latestMorning?.status}
      />
      <SummaryCard
        title="Evening"
        value={latestLabel(summary.latestEvening)}
        detail={latestDetail(summary.latestEvening)}
        status={summary.latestEvening?.status}
      />
      <SummaryCard
        title="Schema"
        value={missingColumns.length === 0 ? "정상" : `${missingColumns.length}개 누락`}
        detail={
          missingColumns.length === 0
            ? "expected columns all present"
            : "migration 확인 필요"
        }
        status={missingColumns.length === 0 ? "success" : "failed"}
      />
      <SummaryCard
        title="LLM"
        value={`${formatNumber(summary.llmTotals.calls)} calls`}
        detail={`${formatNumber(summary.llmTotals.totalTokens)} tokens · parse ${parseFailureCount}`}
        status={parseFailureCount > 0 ? "partial" : "success"}
        footnote={`env ${envReady}/${envTotal}`}
      />
    </div>
  );
}

export function RecentSyncTable({ rows }: { rows: SyncHealthLogRow[] }) {
  return (
    <Panel title="최근 Sync" subtitle="최근 10회 실행">
      {rows.length === 0 ? (
        <EmptyState>아직 sync 기록이 없습니다.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                <th className="px-3 py-2">타입</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">시작</th>
                <th className="px-3 py-2 text-right">소요</th>
                <th className="px-3 py-2 text-right">법안</th>
                <th className="px-3 py-2 text-right">의원</th>
                <th className="px-3 py-2 text-right">뉴스</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--color-border)] last:border-0"
                >
                  <td className="px-3 py-2 font-mono text-[11px] text-[var(--color-text)]">
                    {SYNC_TYPE_LABELS[row.syncType] ?? row.syncType}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                    {formatKst(row.startedAt)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[var(--color-text-secondary)]">
                    {formatDuration(syncDurationMs(row))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[var(--color-text-secondary)]">
                    {formatNumber(row.billsScored)}/{formatNumber(row.billsProcessed)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[var(--color-text-secondary)]">
                    {formatNumber(row.legislatorsUpdated)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[var(--color-text-secondary)]">
                    {formatNumber(row.newsFetched)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function DiscoveryFunnel({ summary }: { summary: SyncHealthSummary }) {
  const items = [
    { label: "목록 원천", value: summary.discovery.totalListItems },
    { label: "후보 dedupe", value: summary.discovery.candidates },
    { label: "키워드 탈락", value: summary.discovery.droppedByKeyword },
    { label: "limit 탈락", value: summary.discovery.droppedByLimit },
    { label: "최종 scored", value: summary.discovery.scoredBills },
  ];

  return (
    <Panel title="Discovery Funnel" subtitle="최근 24시간">
      <BarList items={items} />
    </Panel>
  );
}

export function SourceBreakdown({ summary }: { summary: SyncHealthSummary }) {
  const items = Object.entries(summary.sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([source, value]) => ({
      label: SOURCE_LABELS[source] ?? source,
      value,
    }));

  return (
    <Panel title="Source Breakdown" subtitle="후보 발견 경로">
      {items.length === 0 ? (
        <EmptyState>source metadata가 아직 없습니다.</EmptyState>
      ) : (
        <BarList items={items} />
      )}
    </Panel>
  );
}

export function EvidenceQualityPanel({
  summary,
}: {
  summary: SyncHealthSummary;
}) {
  const evidenceItems = Object.entries(summary.evidenceLevelCounts).map(
    ([level, value]) => ({
      label: EVIDENCE_LABELS[level] ?? level,
      value,
    }),
  );
  const bodyItems = Object.entries(summary.bodyFetchStatusCounts).map(
    ([status, value]) => ({
      label: BODY_STATUS_LABELS[status] ?? status,
      value,
    }),
  );

  return (
    <Panel
      title="Evidence Quality"
      subtitle={`본문 확보 실패 ${formatNumber(summary.bodyFetchFailed)}건`}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <MiniHeading>근거 수준</MiniHeading>
          <BarList items={evidenceItems} />
        </div>
        <div>
          <MiniHeading>본문 확보 상태</MiniHeading>
          <BarList items={bodyItems} />
        </div>
      </div>
    </Panel>
  );
}

export function LlmUsageTable({ summary }: { summary: SyncHealthSummary }) {
  const rows = Object.entries(summary.llmUsageByOperation).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const parseFailureCount = sumRecord(summary.parseFailures);

  return (
    <Panel
      title="LLM Usage"
      subtitle={`${formatNumber(summary.llmTotals.totalTokens)} tokens · parse failures ${parseFailureCount}`}
    >
      {rows.length === 0 ? (
        <EmptyState>LLM usage metadata가 아직 없습니다.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                <th className="px-3 py-2">Operation</th>
                <th className="px-3 py-2 text-right">Calls</th>
                <th className="px-3 py-2 text-right">Prompt</th>
                <th className="px-3 py-2 text-right">Output</th>
                <th className="px-3 py-2 text-right">Thought</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Parse</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([operation, usage]) => (
                <tr
                  key={operation}
                  className="border-b border-[var(--color-border)] last:border-0"
                >
                  <td className="px-3 py-2 font-mono text-[11px] text-[var(--color-text)]">
                    {operation}
                  </td>
                  <NumberCell value={usage.calls} />
                  <NumberCell value={usage.promptTokens} />
                  <NumberCell value={usage.outputTokens} />
                  <NumberCell value={usage.thoughtTokens} />
                  <NumberCell value={usage.totalTokens} />
                  <NumberCell value={summary.parseFailures[operation] ?? 0} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function RecentSyncErrors({ summary }: { summary: SyncHealthSummary }) {
  return (
    <Panel title="Recent Errors" subtitle="partial/failed 및 parse failure">
      {summary.recentErrors.length === 0 ? (
        <EmptyState>최근 오류 기록이 없습니다.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {summary.recentErrors.map((entry) => (
            <li
              key={`${entry.id}-${entry.syncType}`}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <StatusPill status={entry.status} />
                <span className="font-mono text-[11px] text-[var(--color-text)]">
                  {SYNC_TYPE_LABELS[entry.syncType] ?? entry.syncType}
                </span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">
                  {formatKst(entry.startedAt)}
                </span>
              </div>
              <ul className="space-y-1 text-[12px] text-[var(--color-text-secondary)]">
                {entry.messages.map((message) => (
                  <li key={message} className="break-words">
                    {message}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function SchemaStatusPanel({
  missingColumns,
  envStatus,
}: {
  missingColumns: MissingSchemaColumn[];
  envStatus: EnvStatus;
}) {
  const grouped = groupMissingColumns(missingColumns);

  return (
    <Panel title="Schema / Env" subtitle="운영 전제 조건">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <MiniHeading>Schema preflight</MiniHeading>
          {missingColumns.length === 0 ? (
            <p className="text-[12px] text-[var(--color-text-secondary)]">
              expected column이 모두 존재합니다.
            </p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(grouped).map(([table, columns]) => (
                <li
                  key={table}
                  className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100"
                >
                  <span className="font-mono text-[11px] font-semibold">
                    {table}
                  </span>
                  <span className="ml-2">{columns.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <MiniHeading>Environment</MiniHeading>
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[12px]">
            <EnvRow label="DATABASE_URL" ok={envStatus.database} />
            <EnvRow label="MCP key" ok={envStatus.mcp} />
            <EnvRow label="Gemini key" ok={envStatus.gemini} />
            <EnvRow label="Naver API" ok={envStatus.naver} />
            <EnvRow label="Cron secret" ok={envStatus.cronSecret} />
          </dl>
        </div>
      </div>
    </Panel>
  );
}

function SummaryCard({
  title,
  value,
  detail,
  status,
  footnote,
}: {
  title: string;
  value: string;
  detail: string;
  status?: string;
  footnote?: string;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {title}
        </h2>
        {status && <StatusDot status={status} />}
      </div>
      <div className="text-[20px] font-bold tracking-[-0.01em] text-[var(--color-text)]">
        {value}
      </div>
      <div className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
        {detail}
      </div>
      {footnote && (
        <div className="mt-2 font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {footnote}
        </div>
      )}
    </section>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-baseline gap-2 border-b border-[var(--color-border)] pb-3">
        <h2 className="text-[13px] font-bold text-[var(--color-text)]">
          {title}
        </h2>
        {subtitle && (
          <span className="text-[11px] text-[var(--color-text-tertiary)]">
            · {subtitle}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function BarList({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
            <span className="text-[var(--color-text-secondary)]">
              {item.label}
            </span>
            <span className="font-mono text-[11px] font-semibold text-[var(--color-text)]">
              {formatNumber(item.value)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-[999px] bg-[var(--color-surface-2)]">
            <div
              className="h-full rounded-[999px] bg-[var(--color-primary)]"
              style={{
                width: item.value > 0
                  ? `${Math.max(3, (item.value / max) * 100)}%`
                  : "0%",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function NumberCell({ value }: { value: number }) {
  return (
    <td className="px-3 py-2 text-right font-mono text-[var(--color-text-secondary)]">
      {formatNumber(value)}
    </td>
  );
}

function EnvRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="contents">
      <dt className="text-[var(--color-text-tertiary)]">{label}</dt>
      <dd className={ok ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}>
        {ok ? "SET" : "MISSING"}
      </dd>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-[999px] border px-2 py-0.5 text-[10px] font-semibold",
        status === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200",
        status === "partial" &&
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200",
        status === "failed" &&
          "border-red-200 bg-red-50 text-red-800 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-200",
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const className =
    status === "success"
      ? "bg-[var(--color-success)]"
      : status === "partial"
        ? "bg-[var(--color-warning)]"
        : "bg-[var(--color-error)]";

  return <span className={cn("h-2.5 w-2.5 rounded-full", className)} />;
}

function MiniHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-bold text-[var(--color-text-tertiary)]">
      {children}
    </h3>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] italic text-[var(--color-text-tertiary)]">
      {children}
    </p>
  );
}

function latestLabel(row: SyncHealthLogRow | null): string {
  if (!row) return "기록 없음";
  return STATUS_LABELS[row.status] ?? row.status;
}

function latestDetail(row: SyncHealthLogRow | null): string {
  if (!row) return "아직 실행 기록이 없습니다.";
  return `${formatKst(row.startedAt)} · ${formatDuration(syncDurationMs(row))}`;
}

function formatKst(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "-";
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

function sumRecord(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, value) => sum + value, 0);
}

function groupMissingColumns(
  missingColumns: MissingSchemaColumn[],
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const item of missingColumns) {
    (grouped[item.table] ??= []).push(item.column);
  }
  return grouped;
}

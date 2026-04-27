import Link from "next/link";
import { sql } from "drizzle-orm";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";
import { db } from "@/db";
import { PageHeader } from "@/components/page-header";
import {
  DiscoveryFunnel,
  EvidenceQualityPanel,
  HealthSummaryCards,
  LlmUsageTable,
  RecentSyncErrors,
  RecentSyncTable,
  SchemaStatusPanel,
  SourceBreakdown,
} from "@/components/sync-health/panels";
import {
  EXPECTED_SCHEMA_COLUMNS,
  findMissingSchemaColumns,
  type MissingSchemaColumn,
  type SchemaColumnRow,
} from "@/lib/schema-preflight";
import {
  normalizeSyncQualityMetadata,
  summarizeSyncHealth,
  type SyncHealthLogRow,
} from "@/lib/sync-health-dashboard";
import { isDemoMode } from "@/lib/demo-mode";
import { hasMcpKey } from "@/lib/mcp-client";

export const dynamic = "force-dynamic";

type RawSyncLogRow = {
  id: number | string;
  syncType: string;
  status: string;
  startedAt: Date | string;
  completedAt: Date | string | null;
  billsProcessed: number | string | null;
  billsScored: number | string | null;
  legislatorsUpdated: number | string | null;
  newsFetched: number | string | null;
  errorsJson: unknown;
  metadataJson: unknown;
};

export default async function HealthPage() {
  noStore();

  if (isDemoMode()) {
    return <DemoBlockedHealthPage />;
  }

  const missingColumns = await loadMissingSchemaColumns();
  const hasSyncMetadata = !missingColumns.some(
    (column) => column.table === "sync_log" && column.column === "metadata_json",
  );
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [recentRows, windowRows] = await Promise.all([
    loadSyncRows({ limit: 10, includeMetadata: hasSyncMetadata }),
    loadSyncRows({
      limit: 200,
      includeMetadata: hasSyncMetadata,
      since: since24h,
    }),
  ]);
  const summary = summarizeSyncHealth({ recentRows, windowRows });
  const envStatus = {
    database: Boolean(process.env.DATABASE_URL),
    mcp: hasMcpKey(),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    naver: Boolean(
      process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET,
    ),
    cronSecret: Boolean(process.env.CRON_SECRET),
  };

  return (
    <>
      <PageHeader
        title="상태"
        subtitle={`마지막 갱신 ${formatKstDateTime(now)}`}
        actions={
          <Link
            href="/health"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            새로고침
          </Link>
        }
      />

      <main className="space-y-5 p-6">
        <HealthSummaryCards
          summary={summary}
          missingColumns={missingColumns}
          envStatus={envStatus}
        />

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <RecentSyncTable rows={recentRows} />
          <SchemaStatusPanel
            missingColumns={missingColumns}
            envStatus={envStatus}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <DiscoveryFunnel summary={summary} />
          <SourceBreakdown summary={summary} />
        </div>

        <EvidenceQualityPanel summary={summary} />

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <LlmUsageTable summary={summary} />
          <RecentSyncErrors summary={summary} />
        </div>
      </main>
    </>
  );
}

async function loadMissingSchemaColumns(): Promise<MissingSchemaColumn[]> {
  const tableNames = EXPECTED_SCHEMA_COLUMNS.map((entry) => sql`${entry.table}`);
  const result = await db.execute(
    sql`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name in (${sql.join(tableNames, sql`, `)})
      order by table_name, ordinal_position
    `,
  );

  return findMissingSchemaColumns(rowsFromResult<SchemaColumnRow>(result));
}

async function loadSyncRows({
  limit,
  includeMetadata,
  since,
}: {
  limit: number;
  includeMetadata: boolean;
  since?: Date;
}): Promise<SyncHealthLogRow[]> {
  const metadataColumn = includeMetadata
    ? sql`, metadata_json as "metadataJson"`
    : sql`, null::jsonb as "metadataJson"`;
  const whereClause = since ? sql`where started_at >= ${since}` : sql``;
  const result = await db.execute(
    sql`
      select
        id,
        sync_type as "syncType",
        status,
        started_at as "startedAt",
        completed_at as "completedAt",
        bills_processed as "billsProcessed",
        bills_scored as "billsScored",
        legislators_updated as "legislatorsUpdated",
        news_fetched as "newsFetched",
        errors_json as "errorsJson"
        ${metadataColumn}
      from sync_log
      ${whereClause}
      order by started_at desc
      limit ${limit}
    `,
  );

  return rowsFromResult<RawSyncLogRow>(result).map(normalizeSyncRow);
}

function normalizeSyncRow(row: RawSyncLogRow): SyncHealthLogRow {
  return {
    id: Number(row.id),
    syncType: row.syncType,
    status: row.status,
    startedAt: toDate(row.startedAt),
    completedAt: row.completedAt ? toDate(row.completedAt) : null,
    billsProcessed: toNumber(row.billsProcessed),
    billsScored: toNumber(row.billsScored),
    legislatorsUpdated: toNumber(row.legislatorsUpdated),
    newsFetched: toNumber(row.newsFetched),
    errorsJson: row.errorsJson,
    metadataJson: normalizeSyncQualityMetadata(row.metadataJson),
  };
}

function rowsFromResult<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNumber(value: number | string | null): number {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  if (Number.isFinite(numberValue)) return numberValue;
  return 0;
}

function DemoBlockedHealthPage() {
  return (
    <>
      <PageHeader title="상태" subtitle="데모 모드에서는 비공개" />
      <main className="p-6">
        <section className="max-w-[720px] rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[var(--color-text)]">
            <ShieldAlert className="h-4 w-4" />
            운영 상태 페이지 비공개
          </div>
          <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
            데모 모드에서는 token 사용량, schema 상태, sync 오류 메시지가 노출되지
            않도록 `/health` 화면을 차단합니다.
          </p>
        </section>
      </main>
    </>
  );
}

function formatKstDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

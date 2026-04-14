import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ContextStrip } from "@/components/context-strip";
import { flattenErrorText, withDbReadRetry } from "@/lib/db-compat";
import { getDemoTranscriptOverview } from "@/lib/demo-content";
import { todayKst, weekdayKo } from "@/lib/dashboard-data";
import { isDemoMode } from "@/lib/demo-mode";
import { buildTranscriptSnippet } from "@/lib/transcript-parser";
import {
  loadRecentTranscriptCount,
  loadRecentTranscriptHits,
  loadRecentTranscripts,
  loadTranscriptSummaryMap,
} from "@/services/transcript-sync";

export const revalidate = 300;

export default async function TranscriptsPage() {
  let transcripts = [] as Awaited<ReturnType<typeof loadRecentTranscripts>>;
  let hits = [] as Awaited<ReturnType<typeof loadRecentTranscriptHits>>;
  let recentCount = 0;
  let summaryMap = new Map<number, { hitCount: number; snippets: string[] }>();

  try {
    [transcripts, hits, recentCount] = await withDbReadRetry(() =>
      Promise.all([
        loadRecentTranscripts(20),
        loadRecentTranscriptHits(8),
        loadRecentTranscriptCount(14),
      ]),
    );
    summaryMap = await withDbReadRetry(() =>
      loadTranscriptSummaryMap(transcripts.map((entry) => entry.id)),
    );
  } catch (err) {
    if (!isMissingTranscriptSchemaError(err)) {
      throw err;
    }
  }

  if (isDemoMode() && transcripts.length === 0) {
    const demo = getDemoTranscriptOverview();
    transcripts = demo.transcripts;
    hits = demo.hits;
    recentCount = demo.recentCount;
    summaryMap = demo.summaryMap;
  }

  const today = todayKst();

  return (
    <>
      <PageHeader
        title="회의록"
        subtitle={`${today} ${weekdayKo(today)} · 위원회/본회의 회의록`}
      />
      <ContextStrip
        industryName="회의록"
        tagline="전체 회의록 보기 + 산업 키워드 언급 발언 정리"
        stats={[
          { label: "최근 14일", value: recentCount },
          { label: "키워드 언급", value: hits.length },
          { label: "목록", value: transcripts.length },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-3 flex items-center gap-2 border-b-2 border-[var(--color-border)] pb-2 text-[15px] font-bold text-[var(--color-text)]">
            전체 회의록
            <span className="ml-auto text-[12px] font-normal text-[var(--color-text-secondary)]">
              {transcripts.length}건
            </span>
          </div>

          {transcripts.length === 0 ? (
            <EmptyState message="아직 동기화된 회의록이 없습니다. 다음 morning sync 이후 최근 위원회 회의록이 채워집니다." />
          ) : (
            <div className="space-y-3">
              {transcripts.map((entry) => {
                const summary = summaryMap.get(entry.id);
                return (
                  <Link
                    key={entry.minutesId}
                    href={`/transcripts/${entry.minutesId}`}
                    className="block rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--color-surface-2)]"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-semibold leading-snug text-[var(--color-text)]">
                          {entry.meetingName}
                        </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
                          {entry.committee && (
                            <span className="font-semibold text-[var(--color-primary)]">
                              {entry.committee}
                            </span>
                          )}
                          {entry.committee && entry.meetingDate && <span>·</span>}
                          {entry.meetingDate && <span>{entry.meetingDate}</span>}
                          {(entry.committee || entry.meetingDate) && entry.sessionLabel && <span>·</span>}
                          {entry.sessionLabel && <span>{entry.sessionLabel}</span>}
                          {(entry.committee || entry.meetingDate || entry.sessionLabel) && entry.place && <span>·</span>}
                          {entry.place && <span>{entry.place}</span>}
                          {entry.utteranceCount > 0 && (
                            <>
                              {(entry.committee || entry.meetingDate || entry.sessionLabel || entry.place) && <span>·</span>}
                              <span>발언 {entry.utteranceCount}개</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="rounded-[10px] bg-[var(--color-primary-light)] px-3 py-1 text-[11px] font-semibold text-[var(--color-primary)]">
                        {summary?.hitCount ?? 0}건 언급
                      </div>
                    </div>
                    {summary && summary.snippets.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {summary.snippets.map((snippet, index) => (
                          <p
                            key={`${entry.minutesId}-${index}`}
                            className="line-clamp-2 text-[12px] leading-relaxed text-[var(--color-text-secondary)]"
                          >
                            {snippet}
                          </p>
                        ))}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-[14px] shadow-[var(--shadow-card)]">
            <div className="mb-3 border-b border-[var(--color-border)] pb-[10px] text-[13px] font-bold text-[var(--color-text)]">
              최근 키워드 언급
            </div>
            {hits.length === 0 ? (
              <p className="text-[12px] text-[var(--color-text-tertiary)]">
                최근 14일 내 저장된 키워드 언급 발언이 없습니다.
              </p>
            ) : (
              <ul className="flex flex-col">
                {hits.map((hit) => (
                  <li
                    key={`${hit.minutesId}-${hit.utteranceId}`}
                    className="border-b border-[var(--color-border)] py-[10px] last:border-b-0 last:pb-0 first:pt-0"
                  >
                    <Link href={`/transcripts/${hit.minutesId}#utterance-${hit.utteranceId}`} className="block rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--color-surface-2)]">
                      <div className="text-[12px] font-medium leading-snug text-[var(--color-text)]">
                        {hit.meetingName}
                      </div>
                      <div className="mt-1 text-[11px] font-medium leading-snug text-[var(--color-text-secondary)]">
                        {hit.speakerName}
                        {hit.speakerRole ? ` · ${hit.speakerRole}` : ""}
                      </div>
                      <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                        {hit.committee ?? "위원회 미상"}
                        {hit.meetingDate ? ` · ${hit.meetingDate}` : ""}
                        {hit.sessionLabel ? ` · ${hit.sessionLabel}` : ""}
                        {hit.place ? ` · ${hit.place}` : ""}
                      </div>
                      {hit.matchedKeywords.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {hit.matchedKeywords.map((keyword) => (
                            <span
                              key={`${hit.utteranceId}-${keyword}`}
                              className="rounded-[999px] bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 text-[10px] font-medium text-[var(--color-primary)]">
                        해당 발언으로 이동
                      </div>
                      {(hit.content || hit.snippet) && (
                        <p className="mt-2 line-clamp-5 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                          {buildTranscriptSnippet(hit.content ?? "", hit.matchedKeywords, 220) ?? hit.snippet}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-10 text-center text-[13px] text-[var(--color-text-tertiary)]">
      {message}
    </div>
  );
}

function isMissingTranscriptSchemaError(err: unknown) {
  const message = flattenErrorText(err);
  return (
    (message.includes("committee_transcript") ||
      message.includes("committee_transcript_utterance")) &&
    (message.includes("relation") ||
      message.includes("column") ||
      message.includes("42P01") ||
      message.includes("Failed query") ||
      message.includes("does not exist"))
  );
}

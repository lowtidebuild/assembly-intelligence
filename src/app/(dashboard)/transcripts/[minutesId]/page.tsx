import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { bill, legislator } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { LegislatorAvatar } from "@/components/legislator-avatar";
import { flattenErrorText } from "@/lib/db-compat";
import { loadTranscriptByMinutesId } from "@/services/transcript-sync";
import { ExternalLink } from "lucide-react";

export const revalidate = 300;

export default async function TranscriptDetailPage(props: {
  params: Promise<{ minutesId: string }>;
}) {
  const params = await props.params;
  let payload: Awaited<ReturnType<typeof loadTranscriptByMinutesId>> = null;

  try {
    payload = await loadTranscriptByMinutesId(params.minutesId);
  } catch (err) {
    if (!isMissingTranscriptSchemaError(err)) {
      throw err;
    }
  }

  if (!payload) {
    notFound();
  }

  const { transcript, utterances } = payload;
  const uniqueSpeakerNames = Array.from(
    new Set(utterances.map((entry) => entry.speakerName).filter(Boolean)),
  );
  const possibleLegislators =
    uniqueSpeakerNames.length > 0
      ? await db
          .select({
            id: legislator.id,
            name: legislator.name,
            party: legislator.party,
            photoUrl: legislator.photoUrl,
          })
          .from(legislator)
          .where(
            and(
              eq(legislator.isActive, true),
              inArray(legislator.name, uniqueSpeakerNames),
            ),
          )
      : [];
  const legislatorMap = new Map<string, (typeof possibleLegislators)[number]>();
  const duplicateNames = new Set<string>();
  for (const row of possibleLegislators) {
    if (legislatorMap.has(row.name)) {
      duplicateNames.add(row.name);
      legislatorMap.delete(row.name);
      continue;
    }
    legislatorMap.set(row.name, row);
  }
  for (const duplicateName of duplicateNames) {
    legislatorMap.delete(duplicateName);
  }

  const agendaBillIds = transcript.agendaItems
    .map((item) => item.billId)
    .filter((value): value is string => Boolean(value));
  const relatedBills =
    agendaBillIds.length > 0
      ? await db
          .select({
            id: bill.id,
            billId: bill.billId,
            billName: bill.billName,
          })
          .from(bill)
          .where(inArray(bill.billId, agendaBillIds))
      : [];
  const billMap = new Map(relatedBills.map((row) => [row.billId, row]));

  return (
    <>
      <PageHeader
        title="회의록 상세"
        subtitle={`${transcript.committee ?? "위원회 미상"} · ${transcript.meetingDate ?? "날짜 미상"}`}
      />

      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-6">
        <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]">
          <Link
            href="/transcripts"
            className="mb-4 inline-flex text-[12px] font-medium text-[var(--color-primary)] hover:underline"
          >
            ← 회의록 목록으로
          </Link>

          <h2 className="text-[24px] font-bold leading-tight text-[var(--color-text)]">
            {transcript.meetingName}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-secondary)]">
            {transcript.sessionLabel && <span>{transcript.sessionLabel}</span>}
            {transcript.place && (
              <>
                {transcript.sessionLabel && <span>·</span>}
                <span>{transcript.place}</span>
              </>
            )}
            <span>·</span>
            <span>발언 {transcript.utteranceCount}개</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {transcript.sourceUrl && (
              <a
                href={transcript.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text)]"
              >
                원문 보기
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {transcript.videoUrl && (
              <a
                href={transcript.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text)]"
              >
                영상 보기
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {transcript.pdfUrl && (
              <a
                href={transcript.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text)]"
              >
                PDF
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </section>

        {transcript.agendaItems.length > 0 && (
          <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]">
            <div className="mb-3 text-[14px] font-bold text-[var(--color-text)]">
              상정된 안건
            </div>
            <div className="space-y-2">
              {transcript.agendaItems.map((item) => {
                const localBill = item.billId ? billMap.get(item.billId) : null;
                return (
                  <div
                    key={`${item.sortOrder}-${item.title}`}
                    className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3"
                  >
                    <div className="text-[13px] font-medium text-[var(--color-text)]">
                      {item.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                      {item.billNumber && <span>의안번호 {item.billNumber}</span>}
                      {localBill && (
                        <>
                          <span>·</span>
                          <Link
                            href={`/radar?bill=${localBill.id}`}
                            className="font-semibold text-[var(--color-primary)] hover:underline"
                          >
                            레이더에서 보기
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-bold text-[var(--color-text)]">
                전체 발언
              </h3>
              <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                키워드가 언급된 발언은 파란 테두리와 배지로 강조됩니다.
              </p>
            </div>
            <div className="rounded-[10px] bg-[var(--color-primary-light)] px-3 py-1 text-[11px] font-semibold text-[var(--color-primary)]">
              {utterances.filter((entry) => entry.hasKeywordMatch).length}건 매칭
            </div>
          </div>

          <div className="space-y-4">
            {utterances.map((utterance) => {
              const member = legislatorMap.get(utterance.speakerName);
              return (
                <article
                  key={utterance.id}
                  className={`rounded-[var(--radius)] border px-4 py-4 ${
                    utterance.hasKeywordMatch
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                  }`}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <LegislatorAvatar
                      name={utterance.speakerName}
                      photoUrl={member?.photoUrl ?? utterance.speakerPhotoUrl}
                      size={44}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {member ? (
                          <Link
                            href={`/legislators/${member.id}`}
                            className="text-[14px] font-semibold text-[var(--color-primary)] hover:underline"
                          >
                            {utterance.speakerName}
                          </Link>
                        ) : (
                          <span className="text-[14px] font-semibold text-[var(--color-text)]">
                            {utterance.speakerName}
                          </span>
                        )}
                        {utterance.speakerRole && (
                          <span className="text-[12px] text-[var(--color-text-secondary)]">
                            {utterance.speakerRole}
                          </span>
                        )}
                        {utterance.speakerArea && (
                          <span className="text-[11px] text-[var(--color-text-tertiary)]">
                            {utterance.speakerArea}
                          </span>
                        )}
                        {utterance.speakerProfileUrl && !member && (
                          <a
                            href={utterance.speakerProfileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-primary)] hover:underline"
                          >
                            국회 프로필
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {utterance.hasKeywordMatch && utterance.matchedKeywords.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {utterance.matchedKeywords.map((keyword) => (
                            <span
                              key={`${utterance.id}-${keyword}`}
                              className="rounded-[999px] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text)]">
                    {utterance.content}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </>
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

import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  committeeTranscript,
  committeeTranscriptUtterance,
  type NewCommitteeTranscriptUtterance,
} from "@/db/schema";
import { ALL_COMMITTEES } from "@/lib/assembly-committees";
import { errorMessage } from "@/lib/api-base";
import { callMcpToolOrThrow } from "@/lib/mcp-client";
import {
  parseRecordMinutesHtml,
  type ParsedTranscriptUtterance,
} from "@/lib/transcript-parser";
import {
  buildRecordMinutesViewUrl,
  extractMinutesIdFromUrl,
  fetchRecordMinutesHtml,
} from "@/lib/transcript-source";

interface McpMeetingItem {
  회의명: string | null;
  회의일: string | null;
  안건: string | null;
  회의록URL: string | null;
  영상URL: string | null;
}

interface McpMeetingResponse {
  total?: number;
  items?: McpMeetingItem[];
}

export interface TranscriptSyncResult {
  meetingsFetched: number;
  transcriptsUpserted: number;
  matchedUtterances: number;
  errors: string[];
}

interface TranscriptCandidate {
  minutesId: string;
  meetingName: string;
  meetingDate: string | null;
  committee: string | null;
  pdfUrl: string | null;
  videoUrl: string | null;
}

const LOOKBACK_DAYS = 14;
const MAX_PAGES = 3;
const PAGE_SIZE = 50;

export async function syncCommitteeTranscripts(
  keywords: string[],
  committeeNames: string[],
  excludeKeywords: string[] = [],
): Promise<TranscriptSyncResult> {
  if (committeeNames.length === 0) {
    return {
      meetingsFetched: 0,
      transcriptsUpserted: 0,
      matchedUtterances: 0,
      errors: [],
    };
  }

  const candidates = await fetchTranscriptCandidates(committeeNames);
  const errors: string[] = [];
  let transcriptsUpserted = 0;
  let matchedUtterances = 0;

  for (const candidate of candidates) {
    try {
      const html = await fetchRecordMinutesHtml(candidate.minutesId);
      const parsed = parseRecordMinutesHtml(html, {
        keywords,
        excludeKeywords,
        meetingName: candidate.meetingName,
        meetingDate: candidate.meetingDate,
      });
      if (!parsed) {
        errors.push(`transcript_parse(${candidate.minutesId}): empty transcript body`);
        continue;
      }

      const resolvedCommittee =
        canonicalizeCommittee(parsed.committee) ??
        canonicalizeCommittee(candidate.committee) ??
        candidate.committee;

      const [saved] = await db
        .insert(committeeTranscript)
        .values({
          minutesId: candidate.minutesId,
          source: "record_xml",
          committee: resolvedCommittee,
          meetingName: parsed.meetingName,
          meetingDate: parsed.meetingDate,
          sessionLabel: parsed.sessionLabel,
          place: parsed.place,
          agendaItems: parsed.agendaItems,
          sourceUrl: buildRecordMinutesViewUrl(candidate.minutesId),
          pdfUrl: candidate.pdfUrl,
          videoUrl: candidate.videoUrl,
          fullText: parsed.fullText,
          utteranceCount: parsed.utterances.length,
        })
        .onConflictDoUpdate({
          target: committeeTranscript.minutesId,
          set: {
            source: sql`excluded.source`,
            committee: sql`excluded.committee`,
            meetingName: sql`excluded.meeting_name`,
            meetingDate: sql`excluded.meeting_date`,
            sessionLabel: sql`excluded.session_label`,
            place: sql`excluded.place`,
            agendaItems: sql`excluded.agenda_items`,
            sourceUrl: sql`excluded.source_url`,
            pdfUrl: sql`excluded.pdf_url`,
            videoUrl: sql`excluded.video_url`,
            fullText: sql`excluded.full_text`,
            utteranceCount: sql`excluded.utterance_count`,
            fetchedAt: sql`NOW()`,
          },
        })
        .returning({ id: committeeTranscript.id });

      await db
        .delete(committeeTranscriptUtterance)
        .where(eq(committeeTranscriptUtterance.transcriptId, saved.id));

      const utteranceRows = parsed.utterances.map((utterance) =>
        toUtteranceInsert(saved.id, utterance),
      );

      if (utteranceRows.length > 0) {
        await db.insert(committeeTranscriptUtterance).values(utteranceRows);
      }

      transcriptsUpserted += 1;
      matchedUtterances += utteranceRows.filter((entry) => entry.hasKeywordMatch).length;
    } catch (err) {
      errors.push(
        `transcript(${candidate.minutesId}): ${errorMessage(err)}`,
      );
    }
  }

  return {
    meetingsFetched: candidates.length,
    transcriptsUpserted,
    matchedUtterances,
    errors,
  };
}

export async function loadRecentTranscriptHits(limitCount = 8) {
  return db
    .select({
      utteranceId: committeeTranscriptUtterance.id,
      transcriptId: committeeTranscript.id,
      minutesId: committeeTranscript.minutesId,
      committee: committeeTranscript.committee,
      meetingName: committeeTranscript.meetingName,
      meetingDate: committeeTranscript.meetingDate,
      sessionLabel: committeeTranscript.sessionLabel,
      place: committeeTranscript.place,
      sourceUrl: committeeTranscript.sourceUrl,
      speakerName: committeeTranscriptUtterance.speakerName,
      speakerRole: committeeTranscriptUtterance.speakerRole,
      speakerArea: committeeTranscriptUtterance.speakerArea,
      content: committeeTranscriptUtterance.content,
      matchedKeywords: committeeTranscriptUtterance.matchedKeywords,
      snippet: committeeTranscriptUtterance.snippet,
    })
    .from(committeeTranscriptUtterance)
    .innerJoin(
      committeeTranscript,
      eq(committeeTranscript.id, committeeTranscriptUtterance.transcriptId),
    )
    .where(eq(committeeTranscriptUtterance.hasKeywordMatch, true))
    .orderBy(
      desc(committeeTranscript.meetingDate),
      asc(committeeTranscriptUtterance.sortOrder),
    )
    .limit(limitCount);
}

async function fetchTranscriptCandidates(
  committeeNames: string[],
): Promise<TranscriptCandidate[]> {
  const aliases = expandCommitteeAliases(committeeNames);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

  const rows: TranscriptCandidate[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let response: McpMeetingResponse;
    try {
      response = await callMcpToolOrThrow<McpMeetingResponse>(
        "assembly_session",
        {
          type: "meeting",
          age: 22,
          page,
          page_size: PAGE_SIZE,
        },
      );
    } catch (err) {
      throw new Error(`meeting_index(page=${page}): ${errorMessage(err)}`);
    }

    const items = response.items ?? [];
    for (const item of items) {
      const meetingName = item.회의명?.trim();
      const minutesId = extractMinutesIdFromUrl(item.회의록URL);
      if (!meetingName || !minutesId) continue;

      const meetingDate = normalizeDateOnly(item.회의일);
      if (meetingDate) {
        const parsedDate = new Date(`${meetingDate}T00:00:00+09:00`);
        if (parsedDate < cutoff) {
          continue;
        }
      }

      const resolvedCommittee = resolveMeetingCommittee(meetingName, aliases);
      if (!resolvedCommittee) continue;

      rows.push({
        minutesId,
        meetingName,
        meetingDate,
        committee: resolvedCommittee,
        pdfUrl: item.회의록URL?.trim() || null,
        videoUrl: item.영상URL?.trim() || null,
      });
    }

    if (items.length < PAGE_SIZE) break;
  }

  return Array.from(
    new Map(rows.map((row) => [row.minutesId, row])).values(),
  ).sort((left, right) => {
    const leftDate = left.meetingDate ?? "";
    const rightDate = right.meetingDate ?? "";
    return rightDate.localeCompare(leftDate);
  });
}

function toUtteranceInsert(
  transcriptId: number,
  utterance: ParsedTranscriptUtterance,
): NewCommitteeTranscriptUtterance {
  return {
    transcriptId,
    sortOrder: utterance.sortOrder,
    speakerName: utterance.speakerName,
    speakerRole: utterance.speakerRole,
    speakerArea: utterance.speakerArea,
    speakerProfileUrl: utterance.speakerProfileUrl,
    speakerPhotoUrl: utterance.speakerPhotoUrl,
    content: utterance.content,
    matchedKeywords: utterance.matchedKeywords,
    hasKeywordMatch: utterance.matchedKeywords.length > 0,
    snippet: utterance.snippet,
  };
}

function normalizeDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/u.test(value.trim()) ? value.trim() : null;
}

function expandCommitteeAliases(
  committeeNames: string[],
): Array<{ official: string; aliases: string[] }> {
  return committeeNames.map((name) => {
    const normalized = canonicalizeCommittee(name) ?? name;
    const found = ALL_COMMITTEES.find(
      (committee) =>
        committee.name === normalized ||
        committee.shortName === normalized ||
        committee.name === name ||
        committee.shortName === name,
    );

    const aliases = new Set<string>([name, normalized]);
    if (found) {
      aliases.add(found.name);
      aliases.add(found.shortName);
    }

    return {
      official: found?.name ?? normalized,
      aliases: Array.from(aliases).filter(Boolean),
    };
  });
}

function resolveMeetingCommittee(
  meetingName: string,
  committeeAliases: Array<{ official: string; aliases: string[] }>,
): string | null {
  for (const committee of committeeAliases) {
    if (committee.aliases.some((alias) => alias && meetingName.includes(alias))) {
      return committee.official;
    }
  }

  return canonicalizeCommittee(meetingName);
}

function canonicalizeCommittee(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const found = ALL_COMMITTEES.find(
    (committee) =>
      committee.name === trimmed ||
      committee.shortName === trimmed ||
      trimmed.includes(committee.name) ||
      trimmed.includes(committee.shortName),
  );
  return found?.name ?? null;
}

export async function loadRecentTranscripts(limitCount = 20) {
  return db
    .select()
    .from(committeeTranscript)
    .orderBy(desc(committeeTranscript.meetingDate), desc(committeeTranscript.fetchedAt))
    .limit(limitCount);
}

export async function loadTranscriptByMinutesId(minutesId: string) {
  const [transcript] = await db
    .select()
    .from(committeeTranscript)
    .where(eq(committeeTranscript.minutesId, minutesId))
    .limit(1);

  if (!transcript) return null;

  const utterances = await db
    .select()
    .from(committeeTranscriptUtterance)
    .where(eq(committeeTranscriptUtterance.transcriptId, transcript.id))
    .orderBy(asc(committeeTranscriptUtterance.sortOrder));

  return {
    transcript,
    utterances,
  };
}

export async function loadTranscriptHitsForLegislator(
  name: string,
  limitCount = 6,
) {
  return db
    .select({
      utteranceId: committeeTranscriptUtterance.id,
      minutesId: committeeTranscript.minutesId,
      committee: committeeTranscript.committee,
      meetingName: committeeTranscript.meetingName,
      meetingDate: committeeTranscript.meetingDate,
      sessionLabel: committeeTranscript.sessionLabel,
      place: committeeTranscript.place,
      speakerRole: committeeTranscriptUtterance.speakerRole,
      content: committeeTranscriptUtterance.content,
      matchedKeywords: committeeTranscriptUtterance.matchedKeywords,
      snippet: committeeTranscriptUtterance.snippet,
    })
    .from(committeeTranscriptUtterance)
    .innerJoin(
      committeeTranscript,
      eq(committeeTranscript.id, committeeTranscriptUtterance.transcriptId),
    )
    .where(
      and(
        eq(committeeTranscriptUtterance.speakerName, name),
        eq(committeeTranscriptUtterance.hasKeywordMatch, true),
      ),
    )
    .orderBy(desc(committeeTranscript.meetingDate), asc(committeeTranscriptUtterance.sortOrder))
    .limit(limitCount);
}

export async function loadTranscriptSummaryMap(transcriptIds: number[]) {
  if (transcriptIds.length === 0) return new Map<number, { hitCount: number; snippets: string[] }>();

  const utterances = await db
    .select({
      transcriptId: committeeTranscriptUtterance.transcriptId,
      snippet: committeeTranscriptUtterance.snippet,
    })
    .from(committeeTranscriptUtterance)
    .where(
      and(
        inArray(committeeTranscriptUtterance.transcriptId, transcriptIds),
        eq(committeeTranscriptUtterance.hasKeywordMatch, true),
      ),
    )
    .orderBy(asc(committeeTranscriptUtterance.transcriptId), asc(committeeTranscriptUtterance.sortOrder));

  const map = new Map<number, { hitCount: number; snippets: string[] }>();
  for (const utterance of utterances) {
    const current = map.get(utterance.transcriptId) ?? { hitCount: 0, snippets: [] };
    current.hitCount += 1;
    if (utterance.snippet && current.snippets.length < 2) {
      current.snippets.push(utterance.snippet);
    }
    map.set(utterance.transcriptId, current);
  }
  return map;
}

export async function loadRecentTranscriptCount(days = 14) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(committeeTranscript)
    .where(gte(committeeTranscript.meetingDate, cutoff.toISOString().slice(0, 10)));

  return rows[0]?.count ?? 0;
}

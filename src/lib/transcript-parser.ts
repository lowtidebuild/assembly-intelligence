import { decodeHtmlEntities } from "@/lib/html-entities";
import { findRelevantIncludeKeywords } from "@/lib/keyword-relevance";

export interface TranscriptAgendaItem {
  sortOrder: number;
  title: string;
  billId: string | null;
  billNumber: string | null;
}

export interface ParsedTranscriptUtterance {
  sortOrder: number;
  speakerName: string;
  speakerRole: string | null;
  speakerArea: string | null;
  speakerProfileUrl: string | null;
  speakerPhotoUrl: string | null;
  content: string;
  matchedKeywords: string[];
  snippet: string | null;
}

export interface ParsedCommitteeTranscript {
  committee: string | null;
  meetingName: string;
  meetingDate: string | null;
  sessionLabel: string | null;
  place: string | null;
  agendaItems: TranscriptAgendaItem[];
  utterances: ParsedTranscriptUtterance[];
  fullText: string;
}

interface ParseOptions {
  keywords?: string[];
  excludeKeywords?: string[];
  meetingName?: string | null;
  meetingDate?: string | null;
}

const SPEAKER_BLOCK_RE =
  /(<div id="spk_\d+" class="[^"]*\bspeaker\b[^"]*"[^>]*>)([\s\S]*?)(?=(?:<div id="spk_\d+" class="[^"]*\bspeaker\b)|(?:<p class="tit_sm\b)|(?:<div class="minutes_footer")|$)/g;
const AGENDA_ITEM_RE =
  /<p class="tit_sm angun pl10">\s*<a id="item(\d+)" href="([^"]*)"[^>]*class="tit"[^>]*>([\s\S]*?)<\/a>/g;
const SPAN_RE = /<span class="spk_sub"[^>]*>([\s\S]*?)<\/span>/g;

export function parseRecordMinutesHtml(
  html: string,
  options: ParseOptions = {},
): ParsedCommitteeTranscript | null {
  if (!html.includes("minutes_body")) {
    return null;
  }

  const normalizedHtml = html.replace(/\r/g, "");
  const headerHtml = captureSection(
    normalizedHtml,
    /<div class="minutes_header">([\s\S]*?)<div class="minutes_body">/,
  );
  const bodyHtml = captureSection(
    normalizedHtml,
    /<div class="minutes_body">([\s\S]*?)<div class="minutes_footer">/,
  );

  if (!bodyHtml) {
    return null;
  }

  const committee =
    cleanText(captureText(headerHtml, /<h1>([\s\S]*?)<\/h1>/))?.replace(/회의록$/u, "") ??
    committeeFromMeetingName(options.meetingName);
  const meetingName =
    options.meetingName?.trim() ||
    cleanText(captureText(headerHtml, /<h1>([\s\S]*?)<\/h1>/)) ||
    "회의록";
  const meetingDate =
    normalizeRecordDate(options.meetingDate) ??
    normalizeRecordDate(
      cleanText(
        captureText(
          headerHtml,
          /<div class="sbj lts2">일시<\/div><p class="con">([\s\S]*?)<\/p>/,
        ),
      ),
    );
  const turn = cleanText(captureText(headerHtml, /<p class="turn">([\s\S]*?)<\/p>/));
  const number = cleanText(captureText(headerHtml, /<p class="num">([\s\S]*?)<\/p>/));
  const place = cleanText(
    captureText(headerHtml, /<div class="sbj lts2">장소<\/div><p class="con">([\s\S]*?)<\/p>/),
  );
  const sessionLabel = [turn, number].filter(Boolean).join(" · ") || null;

  const agendaItems = parseAgendaItems(bodyHtml);
  const utterances = parseUtterances(
    bodyHtml,
    options.keywords ?? [],
    options.excludeKeywords ?? [],
  );
  const fullText = utterances.map((entry) => entry.content).filter(Boolean).join("\n\n");

  return {
    committee,
    meetingName,
    meetingDate,
    sessionLabel,
    place,
    agendaItems,
    utterances,
    fullText,
  };
}

export function buildTranscriptSnippet(
  content: string,
  keywords: string[],
  radius = 120,
): string | null {
  const text = content.trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  let firstIndex = -1;
  let firstKeyword = "";

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) continue;
    const index = lower.indexOf(normalizedKeyword);
    if (index >= 0 && (firstIndex === -1 || index < firstIndex)) {
      firstIndex = index;
      firstKeyword = keyword.trim();
    }
  }

  if (firstIndex === -1) {
    return text.length > radius * 2 ? `${text.slice(0, radius * 2).trim()}…` : text;
  }

  const start = Math.max(0, firstIndex - radius);
  const end = Math.min(text.length, firstIndex + firstKeyword.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function parseAgendaItems(bodyHtml: string): TranscriptAgendaItem[] {
  const items: TranscriptAgendaItem[] = [];
  for (const match of bodyHtml.matchAll(AGENDA_ITEM_RE)) {
    const sortOrder = Number.parseInt(match[1] ?? "", 10);
    const href = match[2] ?? "";
    const title = cleanText(match[3]) ?? "";
    const billId = href.match(/[?&]billId=([^"&]+)/)?.[1] ?? null;
    const billNumber = title.match(/의안번호\s*([0-9]+)/u)?.[1] ?? null;
    if (!title) continue;
    items.push({
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : items.length + 1,
      title,
      billId,
      billNumber,
    });
  }
  return items;
}

function parseUtterances(
  bodyHtml: string,
  keywords: string[],
  excludeKeywords: string[],
): ParsedTranscriptUtterance[] {
  const utterances: ParsedTranscriptUtterance[] = [];
  let sortOrder = 1;

  for (const match of bodyHtml.matchAll(SPEAKER_BLOCK_RE)) {
    const openingTag = match[1] ?? "";
    const blockBody = match[2] ?? "";
    const speakerName =
      cleanText(attributeValue(openingTag, "data-name")) ??
      cleanText(captureText(blockBody, /<strong class="name">([\s\S]*?)<\/strong>/)) ??
      "발언자 미상";
    const speakerRole =
      cleanText(attributeValue(openingTag, "data-pos")) ??
      cleanText(captureText(blockBody, /<span class="position">([\s\S]*?)<\/span>/)) ??
      null;
    const speakerArea = cleanText(captureText(blockBody, /<span class="area">([\s\S]*?)<\/span>/));
    const speakerProfileUrl = cleanText(captureText(blockBody, /<a href="([^"]+)"[^>]*target="_blank"/));
    const speakerPhotoUrl = normalizePhotoUrl(
      cleanText(captureText(blockBody, /<img src="([^"]+)"[^>]*alt=/)),
    );

    const spanTexts = Array.from(blockBody.matchAll(SPAN_RE))
      .map((spanMatch) => cleanText(spanMatch[1]))
      .filter((value): value is string => Boolean(value));
    const content =
      spanTexts.length > 0
        ? spanTexts.join("\n")
        : cleanText(captureText(blockBody, /<div class="txt">([\s\S]*?)<\/div><\/div>/)) ?? "";

    if (!content) continue;

    const matchedKeywords = findRelevantIncludeKeywords(
      content,
      keywords,
      excludeKeywords,
    );
    utterances.push({
      sortOrder: sortOrder++,
      speakerName,
      speakerRole,
      speakerArea,
      speakerProfileUrl,
      speakerPhotoUrl,
      content,
      matchedKeywords,
      snippet:
        matchedKeywords.length > 0
          ? buildTranscriptSnippet(content, matchedKeywords)
          : null,
    });
  }

  return utterances;
}

function captureSection(value: string, regex: RegExp): string {
  return regex.exec(value)?.[1] ?? "";
}

function captureText(value: string, regex: RegExp): string {
  return regex.exec(value)?.[1] ?? "";
}

function attributeValue(openingTag: string, name: string): string | null {
  const regex = new RegExp(`${name}="([^"]*)"`);
  return regex.exec(openingTag)?.[1] ?? null;
}

function normalizePhotoUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.includes("pic_member_none")) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) {
    return `https://record.assembly.go.kr${value}`;
  }
  return value;
}

function committeeFromMeetingName(value: string | null | undefined): string | null {
  if (!value) return null;
  const matched = value.match(/([가-힣A-Za-z]+위원회)/u);
  return matched?.[1] ?? null;
}

function normalizeRecordDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) {
    return trimmed;
  }
  const matched = trimmed.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/u);
  if (!matched) return null;
  const year = matched[1];
  const month = matched[2].padStart(2, "0");
  const day = matched[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const withoutBreaks = value
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/?(?:div|p|li|ul|ol|strong|span|a)[^>]*>/giu, " ")
    .replace(/&nbsp;/giu, " ");
  const decoded = decodeHtmlEntities(withoutBreaks)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return decoded || null;
}

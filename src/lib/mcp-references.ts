import { callMcpTool, hasMcpKey } from "@/lib/mcp-client";

type RecordValue = Record<string, unknown>;

export interface BillReferenceItem {
  title: string;
  subtitle?: string | null;
  url?: string | null;
  source: "research" | "nabo" | "lawmaking";
}

export interface BillReferenceSections {
  keyword: string;
  research: BillReferenceItem[];
  nabo: BillReferenceItem[];
  lawmaking: BillReferenceItem[];
}

export interface BillAnalysisReference {
  title: string;
  subtitle?: string | null;
  url?: string | null;
  source: BillReferenceItem["source"];
}

interface McpErrorPayload {
  error: string;
}

interface McpListLikePayload {
  total?: number;
  items?: RecordValue[];
}

interface ResearchBucket {
  total?: number;
  items?: RecordValue[];
}

interface ResearchPayload {
  library?: ResearchBucket;
  research?: ResearchBucket;
  budget?: ResearchBucket;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function isErrorPayload(value: unknown): value is McpErrorPayload {
  return isRecord(value) && typeof value.error === "string";
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(item: RecordValue, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(item[key]);
    if (value) return value;
  }
  return null;
}

export function normalizeBillReferenceKeyword(billName: string): string {
  return billName
    .replace(/\s+일부개정법률안$/u, "")
    .replace(/\s+전부개정법률안$/u, "")
    .replace(/\s+법률안$/u, " 법률")
    .replace(/\s+일부개정안$/u, "")
    .trim();
}

function toListItems(payload: unknown): RecordValue[] {
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.items)) {
    return payload.items.filter(isRecord);
  }
  return [];
}

function dedupeReferenceItems(items: BillReferenceItem[]): BillReferenceItem[] {
  const seen = new Set<string>();
  const deduped: BillReferenceItem[] = [];
  for (const item of items) {
    const key = `${item.source}:${item.title}:${item.url ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function mapResearchPayload(payload: unknown): BillReferenceItem[] {
  if (!isRecord(payload) || isErrorPayload(payload)) return [];
  const normalized = payload as ResearchPayload;
  const rows = [
    ...(normalized.library?.items ?? []),
    ...(normalized.research?.items ?? []),
    ...(normalized.budget?.items ?? []),
  ]
    .filter(isRecord)
    .map((item) => ({
      title:
        firstString(item, [
          "subj",
          "TITLE",
          "title",
          "제목",
          "bookname",
        ]) ?? "제목 미상",
      subtitle:
        firstString(item, ["pubDt", "DATE", "date", "cdNm", "author", "저자"]) ??
        null,
      url:
        firstString(item, [
          "link",
          "url",
          "URL",
          "detailLink",
          "detail_url",
        ]) ?? null,
      source: "research" as const,
    }));

  return dedupeReferenceItems(rows).slice(0, 3);
}

function mapListPayload(
  payload: unknown,
  source: "nabo" | "lawmaking",
  titleKeys: string[],
  subtitleKeys: string[],
  urlKeys: string[],
): BillReferenceItem[] {
  if (isErrorPayload(payload)) return [];
  const rows = toListItems(payload).map((item) => ({
    title: firstString(item, titleKeys) ?? "제목 미상",
    subtitle: firstString(item, subtitleKeys),
    url: firstString(item, urlKeys),
    source,
  }));
  return dedupeReferenceItems(rows).slice(0, 3);
}

export async function loadBillReferenceSections(
  billName: string,
): Promise<BillReferenceSections> {
  const keyword = normalizeBillReferenceKeyword(billName);
  if (!hasMcpKey()) {
    return {
      keyword,
      research: [],
      nabo: [],
      lawmaking: [],
    };
  }

  const [researchPayload, naboPayload, lawmakingPayload] = await Promise.all([
    callMcpTool<ResearchPayload | McpErrorPayload>(
      "research_data",
      { keyword, page_size: 3 },
      { profile: "full" },
    ).catch(() => null),
    callMcpTool<McpListLikePayload | McpErrorPayload>(
      "get_nabo",
      { type: "report", keyword, page_size: 3 },
      { profile: "full" },
    ).catch(() => null),
    callMcpTool<McpListLikePayload | McpErrorPayload>(
      "assembly_org",
      {
        type: "lawmaking",
        category: "legislation",
        keyword,
        page_size: 3,
      },
      { profile: "full" },
    ).catch(() => null),
  ]);

  return {
    keyword,
    research: mapResearchPayload(researchPayload),
    nabo: mapListPayload(
      naboPayload,
      "nabo",
      ["subj", "title", "TITLE", "제목"],
      ["pubDt", "cdNm", "deptNm"],
      ["link", "url", "URL", "downloadUrl"],
    ),
    lawmaking: mapListPayload(
      lawmakingPayload,
      "lawmaking",
      ["법령명", "법안명", "lsNm", "admRulNm", "caseNm", "itmNm", "title", "제목"],
      ["소관부처", "추진단계", "orgNm", "cptOfiOrgNm", "mgtDt"],
      ["링크", "url", "URL", "detailUrl", "detail_url"],
    ),
  };
}

export function flattenBillReferenceSections(
  sections: BillReferenceSections,
  limit = 5,
): BillAnalysisReference[] {
  return dedupeReferenceItems([
    ...sections.lawmaking,
    ...sections.research,
    ...sections.nabo,
  ]).slice(0, limit);
}

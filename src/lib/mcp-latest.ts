import {
  callMcpTool,
  getMcpRuntimeConfig,
  listMcpTools,
  type McpProfile,
} from "@/lib/mcp-client";

type RecordValue = Record<string, unknown>;

export type McpCapabilityStatus = "available" | "unconfigured" | "error";

export interface McpPreviewItem {
  title: string;
  subtitle?: string;
}

export interface McpCapabilityResult {
  status: McpCapabilityStatus;
  detail: string;
  previewItems: McpPreviewItem[];
  total: number | null;
}

export interface McpLatestSnapshot {
  runtime: {
    baseUrl: string;
    host: string;
    defaultProfile: McpProfile;
  };
  tools: {
    lite: string[];
    full: string[];
    fullOnly: string[];
  };
  sampleKeyword: string;
  features: {
    research: McpCapabilityResult;
    lawmaking: McpCapabilityResult;
    nabo: McpCapabilityResult;
  };
}

interface McpErrorPayload {
  error: string;
  code?: string;
}

interface McpListLikePayload {
  total?: number;
  items?: RecordValue[];
}

interface ResearchBucket {
  total?: number;
  items?: RecordValue[];
}

interface ResearchDataPayload {
  keyword?: string;
  source?: string;
  library?: ResearchBucket;
  research?: ResearchBucket;
  budget?: ResearchBucket;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function isMcpErrorPayload(value: unknown): value is McpErrorPayload {
  return isRecord(value) && typeof value.error === "string";
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(
  item: RecordValue,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = asString(item[key]);
    if (value) return value;
  }
  return null;
}

function classifyOptionalSourceError(message: string): McpCapabilityResult {
  if (message.includes("LAWMKING_OC")) {
    return {
      status: "unconfigured",
      detail:
        "대상 MCP 서버에 LAWMKING_OC가 설정되지 않아 국민참여입법센터 연동이 비활성화되어 있습니다.",
      previewItems: [],
      total: null,
    };
  }

  if (message.includes("NABO_API_KEY")) {
    return {
      status: "unconfigured",
      detail:
        "대상 MCP 서버에 NABO_API_KEY가 설정되지 않아 NABO 연동이 비활성화되어 있습니다.",
      previewItems: [],
      total: null,
    };
  }

  return {
    status: "error",
    detail: message,
    previewItems: [],
    total: null,
  };
}

function toListPayload(value: unknown): McpListLikePayload {
  if (!isRecord(value)) return {};
  return {
    total: typeof value.total === "number" ? value.total : undefined,
    items: Array.isArray(value.items)
      ? value.items.filter(isRecord)
      : undefined,
  };
}

function summarizeListPayload(
  payload: unknown,
  emptyDetail: string,
  titleKeys: string[],
  subtitleKeys: string[],
): McpCapabilityResult {
  if (isMcpErrorPayload(payload)) {
    return classifyOptionalSourceError(payload.error);
  }

  const normalized = toListPayload(payload);
  const items = normalized.items ?? [];
  const total =
    normalized.total ??
    (items.length > 0 ? items.length : 0);

  return {
    status: "available",
    detail:
      total > 0
        ? `${total}건 응답을 확인했습니다.`
        : emptyDetail,
    previewItems: items.slice(0, 3).map((item) => ({
      title:
        firstString(item, titleKeys) ??
        "제목 필드를 식별하지 못했습니다.",
      subtitle: firstString(item, subtitleKeys) ?? undefined,
    })),
    total,
  };
}

function researchTotal(payload: ResearchDataPayload): number {
  return (
    (payload.library?.total ?? payload.library?.items?.length ?? 0) +
    (payload.research?.total ?? payload.research?.items?.length ?? 0) +
    (payload.budget?.total ?? payload.budget?.items?.length ?? 0)
  );
}

function summarizeResearchPayload(
  payload: unknown,
  sampleKeyword: string,
): McpCapabilityResult {
  if (isMcpErrorPayload(payload)) {
    return classifyOptionalSourceError(payload.error);
  }

  const normalized = isRecord(payload) ? (payload as ResearchDataPayload) : {};
  const previewItems = [
    ...(normalized.library?.items ?? []),
    ...(normalized.research?.items ?? []),
    ...(normalized.budget?.items ?? []),
  ]
    .filter(isRecord)
    .slice(0, 3)
    .map((item) => ({
      title:
        firstString(item, [
          "subj",
          "TITLE",
          "title",
          "제목",
          "bookname",
        ]) ?? "제목 필드를 식별하지 못했습니다.",
      subtitle: firstString(item, [
        "pubDt",
        "DATE",
        "date",
        "cdNm",
        "author",
        "저자",
      ]) ?? undefined,
    }));
  const total = researchTotal(normalized);

  return {
    status: "available",
    detail:
      total > 0
        ? `통합 연구자료 ${total}건을 확인했습니다.`
        : `"${sampleKeyword}" 샘플 키워드에서는 결과가 없었지만 full 프로필 도구는 정상 응답했습니다.`,
    previewItems,
    total,
  };
}

async function probeResearch(sampleKeyword: string): Promise<McpCapabilityResult> {
  const keywords = [...new Set([sampleKeyword, "예산"])];

  for (const keyword of keywords) {
    const payload = await callMcpTool<ResearchDataPayload | McpErrorPayload>(
      "research_data",
      { keyword, page_size: 3 },
      { profile: "full" },
    );
    const summary = summarizeResearchPayload(payload, keyword);
    if (summary.status !== "available" || (summary.total ?? 0) > 0) {
      return summary;
    }
  }

  return {
    status: "available",
    detail:
      "샘플 키워드 두 개 모두 결과는 없었지만 full 프로필의 research_data 도구 연결은 정상입니다.",
    previewItems: [],
    total: 0,
  };
}

export async function getMcpLatestSnapshot(
  sampleKeyword = "예산",
): Promise<McpLatestSnapshot> {
  const runtime = getMcpRuntimeConfig();
  const [liteTools, fullTools, research, lawmakingPayload, naboPayload] =
    await Promise.all([
      listMcpTools({ profile: "lite" }),
      listMcpTools({ profile: "full" }),
      probeResearch(sampleKeyword),
      callMcpTool<McpListLikePayload | McpErrorPayload>(
        "assembly_org",
        {
          type: "lawmaking",
          category: "legislation",
          page_size: 3,
        },
        { profile: "full" },
      ),
      callMcpTool<McpListLikePayload | McpErrorPayload>(
        "get_nabo",
        {
          type: "report",
          keyword: sampleKeyword,
          page_size: 3,
        },
        { profile: "full" },
      ),
    ]);

  const liteToolNames = liteTools.map((tool) => tool.name);
  const fullToolNames = fullTools.map((tool) => tool.name);
  const fullOnly = fullToolNames.filter((tool) => !liteToolNames.includes(tool));

  return {
    runtime: {
      baseUrl: runtime.baseUrl,
      host: new URL(runtime.baseUrl).host,
      defaultProfile: runtime.defaultProfile,
    },
    tools: {
      lite: liteToolNames,
      full: fullToolNames,
      fullOnly,
    },
    sampleKeyword,
    features: {
      research,
      lawmaking: summarizeListPayload(
        lawmakingPayload,
        "국민참여입법센터 연동은 열려 있지만 현재 샘플 결과가 없습니다.",
        ["lsNm", "admRulNm", "caseNm", "itmNm", "title", "제목"],
        ["mgtDt", "stYd", "edYd", "orgNm", "reqOrgNm"],
      ),
      nabo: summarizeListPayload(
        naboPayload,
        "NABO 도구는 열려 있지만 현재 샘플 결과가 없습니다.",
        ["subj", "title", "TITLE", "제목"],
        ["pubDt", "cdNm", "deptNm"],
      ),
    },
  };
}


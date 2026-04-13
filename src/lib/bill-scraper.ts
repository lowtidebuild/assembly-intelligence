import { decodeHtmlEntities } from "@/lib/html-entities";

const BILL_PAGE_URL =
  "http://likms.assembly.go.kr/bill/bi/billDetailPage.do";
const BILL_INFO_FRAGMENT_URL =
  "http://likms.assembly.go.kr/bill/bi/bill/detail/billInfo.do";
const USER_AGENT = "ParlaWatch+ Legislative Monitor";
const PROPOSAL_SECTION_TITLE = "제안이유 및 주요내용";

export interface BillBodyFragment {
  proposalReason: string | null;
  mainContent: string | null;
}

function extractAttribute(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, "i");
  const match = tag.match(pattern);
  return match?.[2] ? decodeHtmlEntities(match[2]) : null;
}

function extractMetaCsrf(pageHtml: string): string | null {
  const metaTag = pageHtml.match(
    /<meta\b[^>]*name=(['"])_csrf\1[^>]*content=(['"])([\s\S]*?)\2[^>]*>/i,
  );
  return metaTag?.[3] ? decodeHtmlEntities(metaTag[3]) : null;
}

function extractHiddenFormFields(pageHtml: string): Record<string, string> {
  const formMatch =
    pageHtml.match(/<form\b[^>]*id=(['"])form\1[^>]*>([\s\S]*?)<\/form>/i) ??
    pageHtml.match(/<form\b[^>]*>([\s\S]*?)<\/form>/i);
  const formHtml = formMatch?.[2] ?? formMatch?.[1] ?? pageHtml;
  const fields: Record<string, string> = {};
  const inputRe = /<input\b[^>]*type=(['"])hidden\1[^>]*>/gi;

  for (const tag of formHtml.match(inputRe) ?? []) {
    const name = extractAttribute(tag, "name");
    if (!name) continue;
    fields[name] = extractAttribute(tag, "value") ?? "";
  }

  return fields;
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li|ul|ol|h[1-6]|tr|td|th|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function trimToRelevantSection(text: string): string | null {
  const start = text.indexOf(PROPOSAL_SECTION_TITLE);
  if (start < 0) return null;

  let section = text.slice(start + PROPOSAL_SECTION_TITLE.length).trim();
  section = section.replace(/\+?더보기/u, "").trim();

  const cutMarkers = [
    "위원회 심사",
    "소관위 심사정보",
    "첨부파일",
    "심사진행단계",
    "참고사항",
    "의안원문",
    "비고",
    "부가정보",
  ];

  let cutIndex = section.length;
  for (const marker of cutMarkers) {
    const idx = section.indexOf(marker);
    if (idx > 0 && idx < cutIndex) {
      cutIndex = idx;
    }
  }

  const trimmed = section.slice(0, cutIndex).trim();
  return trimmed || null;
}

function cleanSectionText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = decodeHtmlEntities(value)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized || null;
}

export function extractProposalSectionText(fragmentHtml: string): string | null {
  return trimToRelevantSection(htmlToText(fragmentHtml));
}

export function splitProposalAndMainContent(
  sectionText: string,
): BillBodyFragment {
  const cleaned = cleanSectionText(
    sectionText.replace(new RegExp(`^${PROPOSAL_SECTION_TITLE}\\s*`), ""),
  );
  if (!cleaned) {
    return {
      proposalReason: null,
      mainContent: null,
    };
  }

  const reasonMatch = cleaned.match(
    /(?:^|\n)제안이유\s*[:\n]\s*([\s\S]*?)(?=(?:\n주요내용\s*[:\n])|$)/u,
  );
  const mainMatch = cleaned.match(
    /(?:^|\n)주요내용\s*[:\n]\s*([\s\S]*)$/u,
  );

  const proposalReason = cleanSectionText(reasonMatch?.[1] ?? cleaned);
  const mainContent = cleanSectionText(mainMatch?.[1] ?? null);

  if (!reasonMatch && !mainMatch) {
    return {
      proposalReason,
      mainContent: null,
    };
  }

  return {
    proposalReason,
    mainContent,
  };
}

export async function fetchBillBodyFragment(
  billId: string,
): Promise<BillBodyFragment | null> {
  try {
    const pageUrl =
      `${BILL_PAGE_URL}?billId=${encodeURIComponent(billId)}&currMenuNo=2600044`;

    const pageRes = await fetch(pageUrl, {
      headers: {
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    });
    if (!pageRes.ok) return null;

    const pageHtml = await pageRes.text();
    const csrf = extractMetaCsrf(pageHtml);
    const formFields = extractHiddenFormFields(pageHtml);
    if (!csrf || !formFields.billId || !formFields.billNo) {
      return null;
    }

    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(formFields)) {
      body.set(key, value);
    }

    const fragmentRes = await fetch(BILL_INFO_FRAGMENT_URL, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "X-CSRF-TOKEN": csrf,
        Referer: pageUrl,
        Accept: "application/json, text/plain, */*",
      },
      body,
      cache: "no-store",
    });
    if (!fragmentRes.ok) return null;

    const fragmentHtml = await fragmentRes.text();
    const sectionText = extractProposalSectionText(fragmentHtml);
    if (!sectionText) return null;

    const parsed = splitProposalAndMainContent(sectionText);
    if (!parsed.proposalReason && !parsed.mainContent) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

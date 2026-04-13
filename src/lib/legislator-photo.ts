import { callMcpTool } from "@/lib/mcp-client";

const ASSEMBLY_BASE_URL = "https://www.assembly.go.kr";
const MEMBER_PAGE_PATH = "/portal/assm/assmMemb/member.do";

interface McpAssemblyMemberPayload {
  member?: {
    이름?: string | null;
    photo?: string | null;
  } | null;
}

export interface LegislatorPhotoInput {
  name: string;
  memberId: string;
  preferMemberPage?: boolean;
}

export function normalizeAssemblyPhotoUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    if (url.hostname !== "www.assembly.go.kr") return null;
    return isBrowserSafeAssemblyPhotoPath(url.pathname)
      ? `https://www.assembly.go.kr${url.pathname}`
      : null;
  }

  return isBrowserSafeAssemblyPhotoPath(trimmed)
    ? `https://www.assembly.go.kr${trimmed}`
    : null;
}

function isBrowserSafeAssemblyPhotoPath(path: string): boolean {
  return /^\/static\/portal\/img\/openassm\/.+\.(jpg|jpeg|png)$/i.test(path);
}

export function extractStaticPhotoUrlFromMemberPage(
  html: string,
): string | null {
  const backgroundMatch = html.match(
    /background-image:\s*url\((['"]?)(\/static\/portal\/img\/openassm\/[^'")]+\.(?:jpg|jpeg|png))\1\)/i,
  );
  if (backgroundMatch?.[2]) {
    return normalizeAssemblyPhotoUrl(backgroundMatch[2]);
  }

  const imageMatch = html.match(
    /<img[^>]+src=(['"])(\/static\/portal\/img\/openassm\/[^'"]+\.(?:jpg|jpeg|png))\1/i,
  );
  if (imageMatch?.[2]) {
    return normalizeAssemblyPhotoUrl(imageMatch[2]);
  }

  return null;
}

export function buildAssemblyMemberPageUrl(memberId: string): string {
  const url = new URL(MEMBER_PAGE_PATH, ASSEMBLY_BASE_URL);
  url.searchParams.set("monaCd", memberId);
  url.searchParams.set("st", "22");
  url.searchParams.set("viewType", "CONTBODY");
  return url.toString();
}

export async function fetchLegislatorPhotoFromMemberPage(
  memberId: string,
): Promise<string | null> {
  const response = await fetch(buildAssemblyMemberPageUrl(memberId), {
    headers: {
      "User-Agent": "Mozilla/5.0 Assembly-Intelligence/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  return extractStaticPhotoUrlFromMemberPage(html);
}

export async function resolveLegislatorPhotoUrl(
  input: LegislatorPhotoInput,
): Promise<string | null> {
  if (input.preferMemberPage) {
    try {
      const memberPagePhoto = await fetchLegislatorPhotoFromMemberPage(input.memberId);
      if (memberPagePhoto) {
        return memberPagePhoto;
      }
    } catch {
      // Fall through to MCP + final retry.
    }
  }

  try {
    const payload = await callMcpTool<McpAssemblyMemberPayload>(
      "assembly_member",
      {
        name: input.name,
        age: 22,
        page_size: 1,
      },
    );
    const matchedName = payload?.member?.이름?.trim();
    if (!matchedName || matchedName === input.name) {
      const directPhotoUrl = normalizeAssemblyPhotoUrl(payload?.member?.photo);
      if (directPhotoUrl) {
        return directPhotoUrl;
      }
    }
  } catch {
    // Fall through to the browser-rendered profile page.
  }

  try {
    return await fetchLegislatorPhotoFromMemberPage(input.memberId);
  } catch {
    return null;
  }
}

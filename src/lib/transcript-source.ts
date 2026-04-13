const RECORD_BASE_URL = "https://record.assembly.go.kr";

export function extractMinutesIdFromUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    const minutesId = url.searchParams.get("id");
    return minutesId?.trim() || null;
  } catch {
    const matched = value.match(/[?&]id=(\d+)/);
    return matched?.[1] ?? null;
  }
}

export function buildRecordMinutesViewUrl(minutesId: string): string {
  return `${RECORD_BASE_URL}/assembly/viewer/minutes/xml.do?id=${encodeURIComponent(minutesId)}&type=view`;
}

export async function fetchRecordMinutesHtml(
  minutesId: string,
): Promise<string> {
  const response = await fetch(buildRecordMinutesViewUrl(minutesId), {
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `record minutes fetch failed (${response.status}) for ${minutesId}`,
    );
  }

  return response.text();
}

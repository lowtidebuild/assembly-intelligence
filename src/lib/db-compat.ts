import { neon } from "@neondatabase/serverless";
import { db } from "@/db";
import { industryProfile, type IndustryProfile } from "@/db/schema";

export function flattenErrorText(err: unknown): string {
  const seen = new Set<unknown>();
  const parts: string[] = [];
  let current: unknown = err;

  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
      continue;
    }
    parts.push(String(current));
    break;
  }

  return parts.join(" | ");
}

export function isRetryableDbReadError(err: unknown): boolean {
  const message = flattenErrorText(err);
  return (
    message.includes("Failed to acquire permit to connect to the database") ||
    message.includes("Too many database connection attempts") ||
    message.includes("remaining connection slots are reserved") ||
    message.includes("connection attempts are currently ongoing") ||
    message.includes('"neon:retryable":true')
  );
}

function isMissingIndustryExcludeKeywordsColumn(err: unknown): boolean {
  return flattenErrorText(err).includes('column "exclude_keywords" does not exist');
}

function isMissingLegislatorCompatColumn(err: unknown): boolean {
  const message = flattenErrorText(err);
  return (
    message.includes('column "committee_role" does not exist') ||
    message.includes('column "photo_url" does not exist')
  );
}

function normalizeKeywordList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

type LegacyIndustryProfileRow = {
  id: number | string;
  slug: string;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  keywords: unknown;
  llmContext: string;
  presetVersion: string | null;
  isCustom: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type CompatLegislatorSummaryRow = {
  id: number;
  memberId: string;
  name: string;
  nameHanja: string | null;
  party: string;
  district: string | null;
  electionType: string | null;
  termNumber: number | null;
  committeeRole: string | null;
  committees: string[];
  photoUrl: string | null;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapLegacyIndustryProfileRow(
  row: LegacyIndustryProfileRow,
): IndustryProfile {
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    nameEn: row.nameEn,
    icon: row.icon,
    description: row.description,
    keywords: normalizeKeywordList(row.keywords),
    excludeKeywords: [],
    llmContext: row.llmContext,
    presetVersion: row.presetVersion,
    isCustom: row.isCustom,
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

const rawSql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export async function loadActiveIndustryProfileCompat(): Promise<IndustryProfile | null> {
  try {
    const [profile] = await db.select().from(industryProfile).limit(1);
    return profile ?? null;
  } catch (err) {
    if (!isMissingIndustryExcludeKeywordsColumn(err) || !rawSql) {
      throw err;
    }

    const rows = (await withDbReadRetry(() =>
      rawSql`
        select
          id,
          slug,
          name,
          name_en as "nameEn",
          icon,
          description,
          keywords,
          llm_context as "llmContext",
          preset_version as "presetVersion",
          is_custom as "isCustom",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from industry_profile
        limit 1
      `,
    )) as LegacyIndustryProfileRow[];

    const row = rows[0];
    return row ? mapLegacyIndustryProfileRow(row) : null;
  }
}

export async function loadActiveLegislatorSummaryCompat(): Promise<
  CompatLegislatorSummaryRow[]
> {
  const { legislator } = await import("@/db/schema");
  const { asc, eq } = await import("drizzle-orm");

  try {
    return await db
      .select({
        id: legislator.id,
        memberId: legislator.memberId,
        name: legislator.name,
        nameHanja: legislator.nameHanja,
        party: legislator.party,
        district: legislator.district,
        electionType: legislator.electionType,
        termNumber: legislator.termNumber,
        committeeRole: legislator.committeeRole,
        committees: legislator.committees,
        photoUrl: legislator.photoUrl,
      })
      .from(legislator)
      .where(eq(legislator.isActive, true))
      .orderBy(asc(legislator.seatIndex));
  } catch (err) {
    if (!isMissingLegislatorCompatColumn(err) || !rawSql) {
      throw err;
    }

    const rows = (await withDbReadRetry(() =>
      rawSql`
        select
          id,
          member_id as "memberId",
          name,
          name_hanja as "nameHanja",
          party,
          district,
          election_type as "electionType",
          term_number as "termNumber",
          null::text as "committeeRole",
          committees,
          null::text as "photoUrl"
        from legislator
        where is_active = true
        order by seat_index asc
      `,
    )) as CompatLegislatorSummaryRow[];

    return rows.map((row) => ({
      ...row,
      committees: normalizeKeywordList(row.committees),
    }));
  }
}

export async function withDbReadRetry<T>(
  loader: () => Promise<T>,
  {
    attempts = 5,
    delayMs = 250,
  }: {
    attempts?: number;
    delayMs?: number;
  } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await loader();
    } catch (err) {
      lastError = err;
      if (!isRetryableDbReadError(err) || attempt === attempts) {
        throw err;
      }

      const waitMs = delayMs * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}

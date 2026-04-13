import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bill, industryLegislatorWatch, legislator } from "@/db/schema";
import { type ImportanceLevel } from "@/lib/legislator-importance-ui";

export interface ImportanceRecord {
  level: ImportanceLevel;
  isManualWatch: boolean;
  isOnRelevantCommittee: boolean;
  sponsoredBillCount: number;
  committeeRole: string | null;
  reasons: string[];
}

export interface ImportanceContext {
  profileId: number;
  committeeCodes: string[];
}

export interface ProposerImportanceEntry {
  legislatorId: number;
  importance: ImportanceRecord;
}

function isLeadershipRole(role: string | null): boolean {
  return role === "위원장" || role === "간사";
}

function relevantCommitteesFor(
  committees: string[] | null | undefined,
  committeeCodes: string[],
): string[] {
  if (!committees || committees.length === 0 || committeeCodes.length === 0) {
    return [];
  }
  const targets = new Set(committeeCodes);
  return committees.filter((committee) => targets.has(committee));
}

export function importanceLevelFor({
  isManualWatch,
  isOnRelevantCommittee,
  sponsoredBillCount,
  committeeRole,
}: {
  isManualWatch: boolean;
  isOnRelevantCommittee: boolean;
  sponsoredBillCount: number;
  committeeRole: string | null;
}): ImportanceLevel {
  if (isManualWatch || (isOnRelevantCommittee && sponsoredBillCount >= 2)) {
    return "S";
  }
  if (
    isOnRelevantCommittee &&
    (sponsoredBillCount >= 1 || isLeadershipRole(committeeRole))
  ) {
    return "A";
  }
  if (isOnRelevantCommittee || sponsoredBillCount >= 1) {
    return "B";
  }
  return null;
}

export function makeProposerKey(name: string, party: string | null): string {
  return `${name}::${party ?? ""}`;
}

export async function computeImportance(
  ctx: ImportanceContext,
): Promise<Map<number, ImportanceRecord>> {
  const rows = await db
    .select({
      id: legislator.id,
      committees: legislator.committees,
      committeeRole: legislator.committeeRole,
      isManualWatch:
        sql<boolean>`${industryLegislatorWatch.legislatorId} IS NOT NULL`,
      sponsoredBillCount: sql<number>`count(${bill.id})::int`,
    })
    .from(legislator)
    .leftJoin(
      industryLegislatorWatch,
      and(
        eq(industryLegislatorWatch.legislatorId, legislator.id),
        eq(industryLegislatorWatch.industryProfileId, ctx.profileId),
      ),
    )
    .leftJoin(
      bill,
      and(
        eq(bill.proposerName, legislator.name),
        sql`(${bill.proposerParty} IS NULL OR ${bill.proposerParty} = ${legislator.party})`,
        sql`${bill.relevanceScore} >= 3`,
        sql`${bill.proposalDate} > NOW() - INTERVAL '180 days'`,
      ),
    )
    .where(eq(legislator.isActive, true))
    .groupBy(
      legislator.id,
      legislator.committees,
      legislator.committeeRole,
      industryLegislatorWatch.legislatorId,
    );

  const result = new Map<number, ImportanceRecord>();

  for (const row of rows) {
    const matchedCommittees = relevantCommitteesFor(
      row.committees,
      ctx.committeeCodes,
    );
    const isOnRelevantCommittee = matchedCommittees.length > 0;
    const level = importanceLevelFor({
      isManualWatch: row.isManualWatch,
      isOnRelevantCommittee,
      sponsoredBillCount: row.sponsoredBillCount,
      committeeRole: row.committeeRole,
    });

    const reasons: string[] = [];
    if (row.isManualWatch) reasons.push("수동 워치");
    if (matchedCommittees.length > 0) {
      reasons.push(`소관위 (${matchedCommittees.join(", ")})`);
    }
    if (row.sponsoredBillCount > 0) {
      reasons.push(`대표발의 ${row.sponsoredBillCount}건`);
    }
    if (isLeadershipRole(row.committeeRole)) {
      reasons.push(`위원회 ${row.committeeRole}`);
    }

    result.set(row.id, {
      level,
      isManualWatch: row.isManualWatch,
      isOnRelevantCommittee,
      sponsoredBillCount: row.sponsoredBillCount,
      committeeRole: row.committeeRole,
      reasons,
    });
  }

  return result;
}

export async function loadImportanceForLegislator(
  legislatorId: number,
  ctx: ImportanceContext,
): Promise<ImportanceRecord | null> {
  const [row] = await db
    .select({
      id: legislator.id,
      committees: legislator.committees,
      committeeRole: legislator.committeeRole,
      isManualWatch:
        sql<boolean>`${industryLegislatorWatch.legislatorId} IS NOT NULL`,
      sponsoredBillCount: sql<number>`count(${bill.id})::int`,
    })
    .from(legislator)
    .leftJoin(
      industryLegislatorWatch,
      and(
        eq(industryLegislatorWatch.legislatorId, legislator.id),
        eq(industryLegislatorWatch.industryProfileId, ctx.profileId),
      ),
    )
    .leftJoin(
      bill,
      and(
        eq(bill.proposerName, legislator.name),
        sql`(${bill.proposerParty} IS NULL OR ${bill.proposerParty} = ${legislator.party})`,
        sql`${bill.relevanceScore} >= 3`,
        sql`${bill.proposalDate} > NOW() - INTERVAL '180 days'`,
      ),
    )
    .where(and(eq(legislator.id, legislatorId), eq(legislator.isActive, true)))
    .groupBy(
      legislator.id,
      legislator.committees,
      legislator.committeeRole,
      industryLegislatorWatch.legislatorId,
    )
    .limit(1);

  if (!row) return null;

  const matchedCommittees = relevantCommitteesFor(
    row.committees,
    ctx.committeeCodes,
  );
  const isOnRelevantCommittee = matchedCommittees.length > 0;
  const level = importanceLevelFor({
    isManualWatch: row.isManualWatch,
    isOnRelevantCommittee,
    sponsoredBillCount: row.sponsoredBillCount,
    committeeRole: row.committeeRole,
  });

  const reasons: string[] = [];
  if (row.isManualWatch) reasons.push("수동 워치");
  if (matchedCommittees.length > 0) {
    reasons.push(`소관위 (${matchedCommittees.join(", ")})`);
  }
  if (row.sponsoredBillCount > 0) {
    reasons.push(`대표발의 ${row.sponsoredBillCount}건`);
  }
  if (isLeadershipRole(row.committeeRole)) {
    reasons.push(`위원회 ${row.committeeRole}`);
  }

  return {
    level,
    isManualWatch: row.isManualWatch,
    isOnRelevantCommittee,
    sponsoredBillCount: row.sponsoredBillCount,
    committeeRole: row.committeeRole,
    reasons,
  };
}

export async function loadProposerImportanceMap(
  proposers: Array<{ name: string; party: string | null }>,
  importanceById: Map<number, ImportanceRecord>,
): Promise<Map<string, ProposerImportanceEntry>> {
  const names = [...new Set(proposers.map((proposer) => proposer.name))];
  if (names.length === 0) return new Map();

  const matchedLegislators = await db
    .select({
      id: legislator.id,
      name: legislator.name,
      party: legislator.party,
    })
    .from(legislator)
    .where(inArray(legislator.name, names));

  const result = new Map<string, ProposerImportanceEntry>();
  for (const matched of matchedLegislators) {
    const importance = importanceById.get(matched.id);
    if (!importance) continue;
    const entry = {
      legislatorId: matched.id,
      importance,
    };
    result.set(makeProposerKey(matched.name, matched.party), entry);
    result.set(makeProposerKey(matched.name, null), entry);
  }
  return result;
}

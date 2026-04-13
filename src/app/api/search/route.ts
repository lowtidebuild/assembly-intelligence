import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bill, legislator } from "@/db/schema";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return Response.json({
      legislators: [],
      bills: [],
    });
  }

  const prefixQuery = `${q}%`;
  const legislatorRank = sql<number>`CASE
    WHEN lower(${legislator.name}) = lower(${q}) THEN 0
    WHEN lower(${legislator.name}) LIKE lower(${prefixQuery}) THEN 1
    WHEN lower(COALESCE(${legislator.nameHanja}, '')) = lower(${q}) THEN 2
    WHEN lower(COALESCE(${legislator.nameEnglish}, '')) = lower(${q}) THEN 3
    WHEN lower(COALESCE(${legislator.district}, '')) LIKE lower(${prefixQuery}) THEN 4
    ELSE 5
  END`;
  const billRank = sql<number>`CASE
    WHEN lower(${bill.billName}) = lower(${q}) THEN 0
    WHEN lower(${bill.billName}) LIKE lower(${prefixQuery}) THEN 1
    WHEN lower(${bill.proposerName}) = lower(${q}) THEN 2
    WHEN lower(${bill.proposerName}) LIKE lower(${prefixQuery}) THEN 3
    ELSE 4
  END`;

  const [legislatorsResult, billsResult] = await Promise.all([
    db
      .select({
        id: legislator.id,
        name: legislator.name,
        party: legislator.party,
        district: legislator.district,
      })
      .from(legislator)
      .where(
        and(
          eq(legislator.isActive, true),
          or(
            ilike(legislator.name, `%${q}%`),
            ilike(legislator.nameHanja, `%${q}%`),
            ilike(legislator.nameEnglish, `%${q}%`),
            ilike(legislator.district, `%${q}%`),
          ),
        ),
      )
      .orderBy(legislatorRank, asc(legislator.name))
      .limit(5),
    db
      .select({
        id: bill.id,
        billName: bill.billName,
        proposerName: bill.proposerName,
        committee: bill.committee,
        relevanceScore: bill.relevanceScore,
        stage: bill.stage,
      })
      .from(bill)
      .where(
        or(
          ilike(bill.billName, `%${q}%`),
          ilike(bill.proposerName, `%${q}%`),
        ),
      )
      .orderBy(
        billRank,
        sql`${bill.relevanceScore} DESC NULLS LAST`,
        desc(bill.proposalDate),
      )
      .limit(5),
  ]);

  return Response.json({
    legislators: legislatorsResult.filter((row) => row.id !== null),
    bills: billsResult,
  });
}

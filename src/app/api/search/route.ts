import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { legislator } from "@/db/schema";
import { searchBillsForCommand } from "@/lib/bill-monitoring";

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
    searchBillsForCommand(q, 5),
  ]);

  return Response.json({
    legislators: legislatorsResult.filter((row) => row.id !== null),
    bills: billsResult,
  });
}

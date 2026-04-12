import { asc, desc, eq, ilike, or, sql } from "drizzle-orm";
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
        or(
          ilike(legislator.name, `%${q}%`),
          ilike(legislator.nameHanja, `%${q}%`),
          ilike(legislator.nameEnglish, `%${q}%`),
          ilike(legislator.district, `%${q}%`),
        ),
      )
      .orderBy(asc(legislator.name))
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
      .orderBy(sql`${bill.relevanceScore} DESC NULLS LAST`, desc(bill.proposalDate))
      .limit(5),
  ]);

  return Response.json({
    legislators: legislatorsResult.filter((row) => row.id !== null),
    bills: billsResult,
  });
}

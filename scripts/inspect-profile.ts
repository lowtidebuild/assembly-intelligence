import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db");
  const { industryProfile, industryCommittee, industryLegislatorWatch } =
    await import("../src/db/schema");
  const { eq, sql } = await import("drizzle-orm");

  const profiles = await db.select().from(industryProfile);
  console.log(`── industry_profile (${profiles.length} rows) ──`);
  for (const p of profiles) {
    console.log(
      `  [${p.id}] ${p.icon} ${p.name} (${p.slug}) — ${p.keywords.length} keywords — preset=${p.presetVersion}`,
    );
    const committees = await db
      .select()
      .from(industryCommittee)
      .where(eq(industryCommittee.industryProfileId, p.id));
    console.log(`      committees (${committees.length}): ${committees.map((c) => c.committeeCode).join(", ")}`);
    const [watches] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(industryLegislatorWatch)
      .where(eq(industryLegislatorWatch.industryProfileId, p.id));
    console.log(`      watched legislators: ${watches?.c ?? 0}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

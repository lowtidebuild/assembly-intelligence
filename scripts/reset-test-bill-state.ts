/**
 * Reset bill 1's company_impact + deep_analysis back to null so the
 * UI shows the "not yet generated" state during smoke testing.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db");
  const { bill } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  await db
    .update(bill)
    .set({
      companyImpact: null,
      companyImpactIsAiDraft: false,
      deepAnalysis: null,
      deepAnalysisGeneratedAt: null,
    })
    .where(eq(bill.id, 1));
  console.log("✅ reset bill 1 to clean state");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

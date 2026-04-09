/**
 * Seed a test industry profile into the DB so we can dry-run the
 * morning sync pipeline end-to-end. Uses preset data.
 *
 * Idempotent — uses ON CONFLICT so re-running just updates.
 *
 * ⚠️ src/db/index.ts reads DATABASE_URL at module load time (top-level
 * `neon(process.env.DATABASE_URL!)`), so we must load dotenv BEFORE
 * importing it. Static ESM imports are hoisted, so we use dynamic
 * import() inside main() instead.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db");
  const { industryProfile, industryCommittee } = await import("../src/db/schema");
  const { getPreset } = await import("../src/lib/industry-presets");
  const { eq } = await import("drizzle-orm");

  const slug = process.argv[2] ?? "cybersecurity";
  const preset = getPreset(slug);
  if (!preset) {
    console.error(`unknown preset: ${slug}`);
    process.exit(1);
  }

  console.log(`Seeding ${preset.name} (${preset.slug})...`);

  const [profile] = await db
    .insert(industryProfile)
    .values({
      slug: preset.slug,
      name: preset.name,
      nameEn: preset.nameEn,
      icon: preset.icon,
      description: preset.description,
      keywords: preset.keywords,
      llmContext: preset.llmContext,
      presetVersion: preset.presetVersion,
      isCustom: false,
    })
    .onConflictDoUpdate({
      target: industryProfile.slug,
      set: {
        name: preset.name,
        nameEn: preset.nameEn,
        icon: preset.icon,
        description: preset.description,
        keywords: preset.keywords,
        llmContext: preset.llmContext,
        presetVersion: preset.presetVersion,
        updatedAt: new Date(),
      },
    })
    .returning();

  console.log(
    `  → profile id=${profile.id}, keywords=${preset.keywords.length}`,
  );

  // Wipe existing committees for this profile, then re-seed
  await db
    .delete(industryCommittee)
    .where(eq(industryCommittee.industryProfileId, profile.id));

  for (const code of preset.suggestedCommittees) {
    await db.insert(industryCommittee).values({
      industryProfileId: profile.id,
      committeeCode: code,
      priority: 1,
      isAutoAdded: true,
    });
  }

  console.log(`  → committees: ${preset.suggestedCommittees.length}`);
  console.log("✅ seed complete");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

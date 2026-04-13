/**
 * POST /api/setup
 *
 * Persists the full setup wizard state via sequential writes:
 *   1. Upsert IndustryProfile by slug
 *   2. Wipe + re-insert IndustryCommittee rows
 *   3. Wipe + re-insert IndustryLegislatorWatch rows
 *
 * The wipe-and-insert pattern is safe because:
 *   - Committees and watch rows don't have FK dependents
 *   - The whole request is idempotent for the same slug
 *   - Quantities are small (~5 committees, ~20 legislators)
 *
 * On success: returns the new profile id.
 * The client is responsible for router.push("/briefing") after success.
 *
 * Body shape:
 * {
 *   slug: string,                 // stable identifier
 *   name: string,                 // Korean display name
 *   nameEn: string,               // English fallback
 *   icon: string,                 // emoji
 *   description: string,
 *   keywords: string[],           // 1-100 items
 *   llmContext: string,           // 50-5000 chars
 *   presetVersion: string | null, // null = custom
 *   committees: string[],         // canonical Korean names
 *   legislatorIds: number[]       // bigints from legislator.id
 * }
 */

import { NextResponse, type NextRequest } from "next/server";
import { demoGuardResponse } from "@/lib/demo-mode";
import { z } from "zod";
import { db } from "@/db";
import {
  industryProfile,
  industryCommittee,
  industryLegislatorWatch,
} from "@/db/schema";
import { eq, ne } from "drizzle-orm";
import { errorMessage } from "@/lib/api-base";

const bodySchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "slug은 소문자/숫자/하이픈만 가능"),
  name: z.string().min(1).max(50),
  nameEn: z.string().min(1).max(50),
  icon: z.string().max(8).default("📊"),
  description: z.string().max(500).default(""),
  keywords: z.array(z.string().min(1).max(60)).min(1).max(100),
  llmContext: z.string().min(20).max(5000),
  presetVersion: z.string().max(50).nullable().default(null),
  committees: z.array(z.string().min(1).max(60)).max(20),
  legislatorIds: z.array(z.number().int().positive()).max(100),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  const blocked = demoGuardResponse();
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "invalid_json", "Body is not valid JSON");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "validation_error",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }

  const input = parsed.data;

  // Neon's HTTP driver doesn't support transactions (each statement
  // is its own HTTP request). The wizard tolerates partial state on
  // failure because:
  //   1. The whole thing is idempotent — re-running with the same
  //      slug wipes + re-inserts everything
  //   2. An in-progress failure still leaves usable state (old
  //      committees/watches just get replaced)
  //   3. Wizard lives behind auth, so no concurrent writer races
  try {
    // 0. Single-tenant guarantee: delete any profile that ISN'T the
    //    one we're about to upsert. design.md §17 says the codebase
    //    is generic but a deployment picks ONE industry. We enforce
    //    that here so the dashboard's `.from(industryProfile).limit(1)`
    //    isn't order-dependent. CASCADE wipes related rows.
    await db.delete(industryProfile).where(ne(industryProfile.slug, input.slug));

    // 1. Upsert profile by slug
    const [profile] = await db
      .insert(industryProfile)
      .values({
        slug: input.slug,
        name: input.name,
        nameEn: input.nameEn,
        icon: input.icon,
        description: input.description,
        keywords: input.keywords,
        llmContext: input.llmContext,
        presetVersion: input.presetVersion,
        isCustom: input.presetVersion === null,
      })
      .onConflictDoUpdate({
        target: industryProfile.slug,
        set: {
          name: input.name,
          nameEn: input.nameEn,
          icon: input.icon,
          description: input.description,
          keywords: input.keywords,
          llmContext: input.llmContext,
          presetVersion: input.presetVersion,
          isCustom: input.presetVersion === null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: industryProfile.id });

    // 2. Wipe + re-insert committees
    await db
      .delete(industryCommittee)
      .where(eq(industryCommittee.industryProfileId, profile.id));

    if (input.committees.length > 0) {
      await db.insert(industryCommittee).values(
        input.committees.map((code) => ({
          industryProfileId: profile.id,
          committeeCode: code,
          priority: 1,
          isAutoAdded: false,
        })),
      );
    }

    // 3. Wipe + re-insert watched legislators
    await db
      .delete(industryLegislatorWatch)
      .where(eq(industryLegislatorWatch.industryProfileId, profile.id));

    if (input.legislatorIds.length > 0) {
      await db.insert(industryLegislatorWatch).values(
        input.legislatorIds.map((legislatorId) => ({
          industryProfileId: profile.id,
          legislatorId,
          isAutoAdded: false,
        })),
      );
    }

    return NextResponse.json(
      { ok: true, profileId: profile.id },
      { status: 200 },
    );
  } catch (err) {
    console.error("[api/setup] failed:", err);
    return errorResponse(500, "setup_failed", errorMessage(err));
  }
}

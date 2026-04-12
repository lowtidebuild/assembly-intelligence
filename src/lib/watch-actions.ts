"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { industryLegislatorWatch, industryProfile } from "@/db/schema";

const PAGES_TO_REVALIDATE = [
  "/briefing",
  "/radar",
  "/impact",
  "/watch",
  "/assembly",
];

function revalidateAll() {
  for (const path of PAGES_TO_REVALIDATE) {
    revalidatePath(path);
  }
}

async function loadActiveProfileId(): Promise<number | null> {
  const [profile] = await db
    .select({ id: industryProfile.id })
    .from(industryProfile)
    .limit(1);
  return profile?.id ?? null;
}

function parseLegislatorId(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Add a legislator to the active industry's watch list.
 * Used from the legislator profile slide-over's toggle button.
 * Idempotent: duplicate adds are a no-op.
 */
export async function addLegislatorToWatchAction(formData: FormData) {
  const profileId = await loadActiveProfileId();
  if (!profileId) return;

  const legislatorId = parseLegislatorId(formData.get("legislatorId"));
  if (!legislatorId) return;

  const rawReason = formData.get("reason");
  const reason =
    typeof rawReason === "string" && rawReason.trim()
      ? rawReason.trim()
      : "수동 추가";

  await db
    .insert(industryLegislatorWatch)
    .values({
      industryProfileId: profileId,
      legislatorId,
      reason,
      isAutoAdded: false,
    })
    .onConflictDoNothing({
      target: [
        industryLegislatorWatch.industryProfileId,
        industryLegislatorWatch.legislatorId,
      ],
    });

  revalidateAll();
}

/**
 * Remove a legislator from the active industry's watch list.
 * Idempotent: removing a non-existing row is a no-op.
 */
export async function removeLegislatorFromWatchAction(formData: FormData) {
  const profileId = await loadActiveProfileId();
  if (!profileId) return;

  const legislatorId = parseLegislatorId(formData.get("legislatorId"));
  if (!legislatorId) return;

  await db
    .delete(industryLegislatorWatch)
    .where(
      and(
        eq(industryLegislatorWatch.industryProfileId, profileId),
        eq(industryLegislatorWatch.legislatorId, legislatorId),
      ),
    );

  revalidateAll();
}

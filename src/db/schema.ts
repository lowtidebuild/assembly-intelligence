/**
 * Database schema — Assembly Intelligence Dashboard
 *
 * 12 tables split into 3 groups:
 *
 *   Industry config (3):  IndustryProfile, IndustryCommittee,
 *                         IndustryLegislatorWatch
 *   Assembly data (5):    Bill, BillTimeline, Legislator, Vote,
 *                         NewsArticle
 *   App state (4):        Alert, DailyBriefing, RelevanceOverride,
 *                         SyncLog
 *
 * Relationships diagram:
 *
 *   IndustryProfile 1 ──── N IndustryCommittee
 *                   1 ──── N IndustryLegislatorWatch ── N Legislator
 *                   (no FK to Bill — filter is runtime via keywords/LLM)
 *
 *   Bill 1 ──── N BillTimeline
 *        1 ──── N Vote ── N Legislator
 *        1 ──── N NewsArticle (nullable bill_id for unassociated news)
 *        1 ──── N RelevanceOverride
 *
 *   All tables use bigint id primary keys with generated identity.
 *   Timestamps are `timestamp with time zone` (Postgres best practice).
 */

import {
  pgTable,
  bigint,
  text,
  boolean,
  integer,
  date,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ─────────────────────────────────────────────────────────────
 * Enums
 * ────────────────────────────────────────────────────────────── */

/**
 * Bill lifecycle stages — matches the GR/PA team's existing Excel
 * color coding convention (stage 0-6).
 *
 *   0 = 발의예정           (white)
 *   1 = 법안발의/입법예고  (light yellow)
 *   2 = 상임위 심사/계류중 (yellow)
 *   3 = 법제사법위 심사    (orange)
 *   4 = 국회 비준          (green)
 *   5 = 정부 이송          (light green)
 *   6 = 공포               (green, completed)
 */
export const billStageEnum = pgEnum("bill_stage", [
  "stage_0",
  "stage_1",
  "stage_2",
  "stage_3",
  "stage_4",
  "stage_5",
  "stage_6",
]);

export const syncTypeEnum = pgEnum("sync_type", ["morning", "evening", "manual"]);
export const syncStatusEnum = pgEnum("sync_status", [
  "success",
  "partial",
  "failed",
]);

export const voteResultEnum = pgEnum("vote_result", [
  "yes",
  "no",
  "abstain",
  "absent",
  "unknown",
]);

export const alertTypeEnum = pgEnum("alert_type", [
  "stage_change",
  "new_bill",
  "vote_scheduled",
  "sync_failure",
  "sync_summary",
  "transcript_hit",
  "legislation_notice",
  "petition",
  "press_release",
]);

export const alertSeverityEnum = pgEnum("alert_severity", [
  "info",
  "warning",
  "critical",
]);

/* ─────────────────────────────────────────────────────────────
 * Industry config
 * ────────────────────────────────────────────────────────────── */

/**
 * IndustryProfile — one row per deployment. Populated by setup wizard.
 * Drives keyword pre-filter + Gemini scoring prompt + UI branding.
 *
 * `preset_version` tracks which preset the user started from (e.g.
 * "game-v1.0"). `null` means the profile was built from scratch via
 * "직접 입력" option. This lets us detect presets that drifted from
 * defaults and offer upgrades later.
 */
export const industryProfile = pgTable("industry_profile", {
  id: bigint("id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  slug: text("slug").notNull().unique(), // "game", "cybersecurity", "custom-abc123"
  name: text("name").notNull(), // "게임"
  nameEn: text("name_en").notNull(), // "Game"
  icon: text("icon").notNull().default("📊"), // emoji
  description: text("description").notNull().default(""),
  // Keywords used by sync pipeline for pre-filter before Gemini scoring.
  // Stored as jsonb for efficient IN queries + future weighting.
  keywords: jsonb("keywords")
    .$type<string[]>()
    .notNull()
    .default([]),
  // Negative match phrases that explicitly suppress false positives
  // from broad include keywords. Example: include "게임" but exclude
  // "제로섬 게임", "치킨게임", "게임이론".
  excludeKeywords: jsonb("exclude_keywords")
    .$type<string[]>()
    .notNull()
    .default([]),
  // Injected as system prompt prefix for Gemini relevance scoring.
  llmContext: text("llm_context").notNull().default(""),
  presetVersion: text("preset_version"), // null = custom
  isCustom: boolean("is_custom").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * IndustryCommittee — which Assembly standing committees matter for
 * this industry. Populated from preset suggestions, editable by user.
 *
 *   priority 1 = core (always surface events)
 *   priority 2 = relevant (surface domain-matching events)
 *   priority 3 = occasional (surface only high-relevance events)
 */
export const industryCommittee = pgTable(
  "industry_committee",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    industryProfileId: bigint("industry_profile_id", { mode: "number" })
      .notNull()
      .references(() => industryProfile.id, { onDelete: "cascade" }),
    committeeCode: text("committee_code").notNull(), // "문체위", "과방위"
    priority: integer("priority").notNull().default(2),
    isAutoAdded: boolean("is_auto_added").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_industry_committee").on(
      t.industryProfileId,
      t.committeeCode,
    ),
  ],
);

/**
 * IndustryLegislatorWatch — legislators this industry tracks.
 * Populated by user during setup wizard (hemicycle selection UI),
 * not from presets. Changes frequently as legislators enter/leave
 * committees.
 */
export const industryLegislatorWatch = pgTable(
  "industry_legislator_watch",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    industryProfileId: bigint("industry_profile_id", { mode: "number" })
      .notNull()
      .references(() => industryProfile.id, { onDelete: "cascade" }),
    legislatorId: bigint("legislator_id", { mode: "number" })
      .notNull()
      .references(() => legislator.id, { onDelete: "cascade" }),
    reason: text("reason"), // "게임산업법 대표발의"
    isAutoAdded: boolean("is_auto_added").notNull().default(false),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_industry_legislator_watch").on(
      t.industryProfileId,
      t.legislatorId,
    ),
  ],
);

/**
 * IndustryBillWatch — bills this industry explicitly tracks outside
 * the automatic committee + keyword pipeline. Populated from the
 * global search command when a user adds an out-of-profile bill to
 * monitoring.
 */
export const industryBillWatch = pgTable(
  "industry_bill_watch",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    industryProfileId: bigint("industry_profile_id", { mode: "number" })
      .notNull()
      .references(() => industryProfile.id, { onDelete: "cascade" }),
    billId: text("bill_id")
      .notNull()
      .references(() => bill.billId, { onDelete: "cascade" }),
    addedFrom: text("added_from").notNull().default("search"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_industry_bill_watch").on(t.industryProfileId, t.billId),
  ],
);

/* ─────────────────────────────────────────────────────────────
 * Assembly data (synced from assembly-api-mcp)
 * ────────────────────────────────────────────────────────────── */

/**
 * Legislator — synced from `query_assembly("nwvrqwxyaytdsfvhu", {AGE:22})`
 * which returns the canonical 국회의원 현황 dataset (295 members in 22대).
 *
 * **Primary key strategy:** `memberId` mirrors `MONA_CD` (e.g. "T2T8225E"),
 * which is a stable Assembly-assigned code. Cross-verified against
 * `의원코드` returned by `assembly_org({type:committee})`.
 *
 * `committees` is jsonb array because a legislator can serve on
 * multiple committees simultaneously. Populated from CMITS by splitting
 * on ", ".
 *
 * `photoUrl` stores a browser-safe Assembly profile image URL gathered
 * from the official member page. MCP's `member.photo` field is only a
 * hint and may point to non-renderable `/photo/...jpg` URLs.
 */
export const legislator = pgTable(
  "legislator",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    memberId: text("member_id").notNull().unique(), // MONA_CD / 의원코드
    name: text("name").notNull(), // HG_NM (한글)
    nameHanja: text("name_hanja"), // HJ_NM (한자)
    nameEnglish: text("name_english"), // ENG_NM (영문)
    party: text("party").notNull(), // POLY_NM
    district: text("district"), // ORIG_NM — "울산 북구" or "비례대표"
    electionType: text("election_type"), // ELECT_GBN_NM — "지역구"/"비례대표"
    termNumber: integer("term_number"), // 몇 선 (parsed from REELE_GBN_NM)
    birthDate: date("birth_date"),
    birthCalendar: text("birth_calendar"), // BTH_GBN_NM — "양"/"음"
    gender: text("gender"), // SEX_GBN_NM — "남"/"여"
    termHistory: text("term_history"), // UNITS — "제21대, 제22대"
    committeeRole: text("committee_role"), // JOB_RES_NM — "위원장"/"간사"/"위원"
    // Committees this legislator serves on. JSON array of committee names.
    committees: jsonb("committees").$type<string[]>().notNull().default([]),
    // Seat position on hemicycle (computed at sync time from party ordering)
    seatIndex: integer("seat_index"),
    // Contact / office info — displayed in 의원 워치 detail + setup wizard
    email: text("email"),
    homepage: text("homepage"),
    officePhone: text("office_phone"), // TEL_NO
    officeAddress: text("office_address"), // ASSEM_ADDR — "의원회관 515호"
    staffRaw: text("staff_raw"), // STAFF — comma-separated raw names
    secretaryRaw: text("secretary_raw"), // SECRETARY + SECRETARY2
    memTitle: text("mem_title"), // 주요 약력 (multi-line)
    photoUrl: text("photo_url"),
    isActive: boolean("is_active").notNull().default(true),
    lastSynced: timestamp("last_synced", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_legislator_party").on(t.party),
    index("idx_legislator_active").on(t.isActive),
  ],
);

/**
 * Bill — the core entity. Synced via two-phase fetch from
 * `assembly_bill`:
 *   Phase 1: `assembly_bill({ committee, age })` → list (no body)
 *   Phase 2: `assembly_bill({ bill_id })` → detail with 심사경과,
 *            공동발의자[], 공동발의자_총수, LINK_URL
 *
 * `companyImpact` is the GR/PA team's editable assessment (section 13
 * of design.md). `companyImpactIsAiDraft` tracks whether it's a
 * confirmed human judgment or an unreviewed Gemini draft.
 *
 * `summaryText` is pre-generated by Gemini Flash during sync (not
 * on-demand) so the slide-over panel opens instantly.
 *
 * `billNumber` stores the user-facing 의안번호 (e.g. 2217868), while
 * `billId` keeps the stable system identifier (PRC_...).
 *
 * `proposalReason` and `mainContent` are nullable because the sync
 * pipeline can still fall back to pure MCP mode when 의안정보시스템 body
 * enrichment is unavailable.
 *
 * `externalLink` uses `LINK_URL` (https) from the detail response.
 */
export const bill = pgTable(
  "bill",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    billId: text("bill_id").notNull().unique(), // Assembly official system ID (PRC_...)
    billNumber: text("bill_number"), // User-facing 의안번호 (e.g. 2217868)
    billName: text("bill_name").notNull(),
    proposerName: text("proposer_name").notNull(),
    proposerParty: text("proposer_party"),
    coSponsorCount: integer("co_sponsor_count").notNull().default(0),
    committee: text("committee"), // 소관위원회
    stage: billStageEnum("stage").notNull().default("stage_1"),
    status: text("status"), // raw status string from MCP
    proposalDate: timestamp("proposal_date", { withTimezone: true }),
    // Gemini Flash output — 1 to 5 score
    relevanceScore: integer("relevance_score"),
    relevanceReasoning: text("relevance_reasoning"),
    // Full bill body (제안이유 + 주요내용) — used for impact analysis
    proposalReason: text("proposal_reason"),
    mainContent: text("main_content"),
    // Pre-generated summary shown in slide-over panel (Gemini Flash, sync-time)
    summaryText: text("summary_text"),
    // User-editable company impact assessment (GR/PA judgment)
    companyImpact: text("company_impact"),
    companyImpactIsAiDraft: boolean("company_impact_is_ai_draft")
      .notNull()
      .default(false),
    // Gemini Pro deep analysis (5-section JSON) — generated on-demand
    // from the impact page. Nullable; regenerated on request.
    // Shape matches BillAnalysisResult in gemini-client.ts.
    deepAnalysis: jsonb("deep_analysis").$type<unknown>(),
    deepAnalysisGeneratedAt: timestamp("deep_analysis_generated_at", {
      withTimezone: true,
    }),
    // Direct link to 의안정보시스템
    externalLink: text("external_link"),
    lastSynced: timestamp("last_synced", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_bill_relevance").on(t.relevanceScore),
    index("idx_bill_stage").on(t.stage),
    index("idx_bill_committee").on(t.committee),
    index("idx_bill_proposal_date").on(t.proposalDate),
    index("idx_bill_bill_number").on(t.billNumber),
  ],
);

/**
 * BillTimeline — lifecycle events for a bill. Used by briefing
 * generator to detect "bills that changed today".
 */
export const billTimeline = pgTable(
  "bill_timeline",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    billId: bigint("bill_id", { mode: "number" })
      .notNull()
      .references(() => bill.id, { onDelete: "cascade" }),
    stage: billStageEnum("stage").notNull(),
    eventDate: timestamp("event_date", { withTimezone: true }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_bill_timeline_bill").on(t.billId)],
);

/**
 * Vote — individual legislator votes on a bill. Optional per bill
 * (only final votes populate this). Used for "voting pattern analysis"
 * in Bill Impact Analyzer.
 */
export const vote = pgTable(
  "vote",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    billId: bigint("bill_id", { mode: "number" })
      .notNull()
      .references(() => bill.id, { onDelete: "cascade" }),
    legislatorId: bigint("legislator_id", { mode: "number" })
      .notNull()
      .references(() => legislator.id, { onDelete: "cascade" }),
    result: voteResultEnum("result").notNull(),
    voteDate: timestamp("vote_date", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("uq_vote").on(t.billId, t.legislatorId),
    index("idx_vote_bill").on(t.billId),
  ],
);

/**
 * NewsArticle — cached news search results from Naver News API.
 * `billId` is nullable because some queries are context-based (e.g.
 * "게임산업" general news) not bill-specific.
 */
export const newsArticle = pgTable(
  "news_article",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    billId: bigint("bill_id", { mode: "number" }).references(() => bill.id, {
      onDelete: "set null",
    }),
    query: text("query").notNull(), // What we searched for
    title: text("title").notNull(),
    url: text("url").notNull().unique(),
    source: text("source"), // "전자신문", "디지털타임스"
    description: text("description"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_news_bill").on(t.billId),
    index("idx_news_published").on(t.publishedAt),
  ],
);

/**
 * LegislationNotice — pre-filing public notice items fetched from
 * `assembly_org({ type: "legislation_notice" })`.
 *
 * These are not formal bills yet, but they are early warning signals
 * for the industry profile. We store only the small metadata slice
 * exposed by the MCP endpoint and mark rows as relevant via title-only
 * keyword matching during morning sync.
 */
export const legislationNotice = pgTable(
  "legislation_notice",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    billNumber: text("bill_number").notNull().unique(),
    billName: text("bill_name").notNull(),
    proposerType: text("proposer_type"),
    committee: text("committee"),
    noticeEndDate: date("notice_end_date"),
    isRelevant: boolean("is_relevant").notNull().default(false),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_legislation_notice_relevant").on(t.isRelevant, t.noticeEndDate)],
);

/**
 * PetitionItem — petition feed from `assembly_org({ type: "petition" })`.
 * Stored independently from bills because petitions are an early-signal
 * layer and may never become formal legislation.
 */
export const petitionItem = pgTable(
  "petition_item",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    petitionId: text("petition_id").notNull().unique(),
    title: text("title").notNull(),
    committee: text("committee"),
    status: text("status"),
    proposerName: text("proposer_name"),
    isRelevant: boolean("is_relevant").notNull().default(false),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_petition_item_relevant").on(t.isRelevant, t.fetchedAt)],
);

/**
 * PressRelease — official Assembly press feed via
 * `assembly_org({ type: "press" })`.
 */
export const pressRelease = pgTable(
  "press_release",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    externalId: text("external_id").notNull().unique(),
    title: text("title").notNull(),
    committee: text("committee"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    url: text("url"),
    summary: text("summary"),
    isRelevant: boolean("is_relevant").notNull().default(false),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_press_release_relevant").on(t.isRelevant, t.publishedAt)],
);

/**
 * CommitteeTranscript — full committee/plenary minutes metadata sourced
 * from the Assembly record viewer HTML. One row per `minutes_id`.
 *
 * `agendaItems` keeps a compact bill-linked agenda summary so the detail
 * page can show which agenda items were discussed without reparsing raw
 * HTML at render time.
 */
export const committeeTranscript = pgTable(
  "committee_transcript",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    minutesId: text("minutes_id").notNull().unique(),
    source: text("source").notNull().default("record_xml"),
    committee: text("committee"),
    meetingName: text("meeting_name").notNull(),
    meetingDate: date("meeting_date"),
    sessionLabel: text("session_label"),
    place: text("place"),
    agendaItems: jsonb("agenda_items")
      .$type<
        Array<{
          sortOrder: number;
          title: string;
          billId: string | null;
          billNumber: string | null;
        }>
      >()
      .notNull()
      .default([]),
    sourceUrl: text("source_url"),
    pdfUrl: text("pdf_url"),
    videoUrl: text("video_url"),
    fullText: text("full_text"),
    utteranceCount: integer("utterance_count").notNull().default(0),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_committee_transcript_meeting_date").on(t.meetingDate),
    index("idx_committee_transcript_committee_date").on(t.committee, t.meetingDate),
  ],
);

/**
 * CommitteeTranscriptUtterance — ordered speaker utterances extracted from
 * the Assembly record viewer HTML. We persist the full content so the app
 * can render a complete transcript view while also flagging keyword hits.
 */
export const committeeTranscriptUtterance = pgTable(
  "committee_transcript_utterance",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    transcriptId: bigint("transcript_id", { mode: "number" })
      .notNull()
      .references(() => committeeTranscript.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    speakerName: text("speaker_name").notNull(),
    speakerRole: text("speaker_role"),
    speakerArea: text("speaker_area"),
    speakerProfileUrl: text("speaker_profile_url"),
    speakerPhotoUrl: text("speaker_photo_url"),
    content: text("content").notNull(),
    matchedKeywords: jsonb("matched_keywords")
      .$type<string[]>()
      .notNull()
      .default([]),
    hasKeywordMatch: boolean("has_keyword_match").notNull().default(false),
    snippet: text("snippet"),
  },
  (t) => [
    uniqueIndex("uq_committee_transcript_utterance").on(t.transcriptId, t.sortOrder),
    index("idx_committee_transcript_utterance_transcript").on(t.transcriptId, t.sortOrder),
    index("idx_committee_transcript_utterance_match").on(
      t.hasKeywordMatch,
      t.transcriptId,
    ),
  ],
);

/* ─────────────────────────────────────────────────────────────
 * App state
 * ────────────────────────────────────────────────────────────── */

/**
 * Alert — in-app notification center entries surfaced in the bell
 * dropdown and /alerts page. Sync jobs create structured alerts for
 * stage changes, new key bills, transcript hits, and sync summaries.
 */
export const alert = pgTable(
  "alert",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    type: alertTypeEnum("type").notNull(),
    billId: bigint("bill_id", { mode: "number" }).references(() => bill.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    message: text("message").notNull(),
    href: text("href"),
    meta: text("meta"),
    severity: alertSeverityEnum("severity").notNull().default("info"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_alert_unread").on(t.read, t.createdAt),
    index("idx_alert_bill").on(t.billId),
    index("idx_alert_type_created").on(t.type, t.createdAt),
  ],
);

/**
 * DailyBriefing — pre-rendered HTML briefing. One row per day.
 * Generated by morning sync cron, served by 브리핑봇 page.
 */
export const dailyBriefing = pgTable(
  "daily_briefing",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    date: text("date").notNull().unique(), // "2026-04-09" (KST date, not timestamp)
    contentHtml: text("content_html").notNull(),
    // Summary stats for sidebar/header display
    keyItemCount: integer("key_item_count").notNull().default(0),
    scheduleCount: integer("schedule_count").notNull().default(0),
    newBillCount: integer("new_bill_count").notNull().default(0),
    // Snapshot ids so the /briefing page can render the same bill sets
    // that were used when the HTML briefing was generated.
    keyBillIds: jsonb("key_bill_ids").$type<number[]>().notNull().default([]),
    newBillIds: jsonb("new_bill_ids").$type<number[]>().notNull().default([]),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

/**
 * RelevanceOverride — feedback loop. When GR/PA person disagrees
 * with Gemini's relevance score, they can override it. Overrides
 * are stored here and later aggregated to refine the LLM prompt.
 */
export const relevanceOverride = pgTable(
  "relevance_override",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    billId: bigint("bill_id", { mode: "number" })
      .notNull()
      .references(() => bill.id, { onDelete: "cascade" }),
    originalScore: integer("original_score"),
    overrideScore: integer("override_score").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_relevance_override_bill").on(t.billId)],
);

/**
 * SyncLog — record of each sync cycle. Used for dashboard "last sync"
 * indicator + debugging sync failures.
 */
export const syncLog = pgTable(
  "sync_log",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    syncType: syncTypeEnum("sync_type").notNull(),
    status: syncStatusEnum("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    billsProcessed: integer("bills_processed").notNull().default(0),
    billsScored: integer("bills_scored").notNull().default(0),
    legislatorsUpdated: integer("legislators_updated").notNull().default(0),
    newsFetched: integer("news_fetched").notNull().default(0),
    errorsJson: jsonb("errors_json").$type<unknown>(),
  },
  (t) => [index("idx_sync_log_started").on(t.startedAt)],
);

/* ─────────────────────────────────────────────────────────────
 * Relations
 * ────────────────────────────────────────────────────────────── */

export const industryProfileRelations = relations(
  industryProfile,
  ({ many }) => ({
    committees: many(industryCommittee),
    legislatorWatches: many(industryLegislatorWatch),
    billWatches: many(industryBillWatch),
  }),
);

export const industryCommitteeRelations = relations(
  industryCommittee,
  ({ one }) => ({
    profile: one(industryProfile, {
      fields: [industryCommittee.industryProfileId],
      references: [industryProfile.id],
    }),
  }),
);

export const industryLegislatorWatchRelations = relations(
  industryLegislatorWatch,
  ({ one }) => ({
    profile: one(industryProfile, {
      fields: [industryLegislatorWatch.industryProfileId],
      references: [industryProfile.id],
    }),
    legislator: one(legislator, {
      fields: [industryLegislatorWatch.legislatorId],
      references: [legislator.id],
    }),
  }),
);

export const industryBillWatchRelations = relations(
  industryBillWatch,
  ({ one }) => ({
    profile: one(industryProfile, {
      fields: [industryBillWatch.industryProfileId],
      references: [industryProfile.id],
    }),
    bill: one(bill, {
      fields: [industryBillWatch.billId],
      references: [bill.billId],
    }),
  }),
);

export const billRelations = relations(bill, ({ many }) => ({
  timeline: many(billTimeline),
  votes: many(vote),
  news: many(newsArticle),
  alerts: many(alert),
  relevanceOverrides: many(relevanceOverride),
  watchedBy: many(industryBillWatch),
}));

export const billTimelineRelations = relations(billTimeline, ({ one }) => ({
  bill: one(bill, {
    fields: [billTimeline.billId],
    references: [bill.id],
  }),
}));

export const legislatorRelations = relations(legislator, ({ many }) => ({
  votes: many(vote),
  watchedBy: many(industryLegislatorWatch),
}));

export const voteRelations = relations(vote, ({ one }) => ({
  bill: one(bill, { fields: [vote.billId], references: [bill.id] }),
  legislator: one(legislator, {
    fields: [vote.legislatorId],
    references: [legislator.id],
  }),
}));

export const newsArticleRelations = relations(newsArticle, ({ one }) => ({
  bill: one(bill, { fields: [newsArticle.billId], references: [bill.id] }),
}));

export const committeeTranscriptRelations = relations(
  committeeTranscript,
  ({ many }) => ({
    utterances: many(committeeTranscriptUtterance),
  }),
);

export const committeeTranscriptUtteranceRelations = relations(
  committeeTranscriptUtterance,
  ({ one }) => ({
    transcript: one(committeeTranscript, {
      fields: [committeeTranscriptUtterance.transcriptId],
      references: [committeeTranscript.id],
    }),
  }),
);

export const alertRelations = relations(alert, ({ one }) => ({
  bill: one(bill, { fields: [alert.billId], references: [bill.id] }),
}));

export const relevanceOverrideRelations = relations(
  relevanceOverride,
  ({ one }) => ({
    bill: one(bill, {
      fields: [relevanceOverride.billId],
      references: [bill.id],
    }),
  }),
);

/* ─────────────────────────────────────────────────────────────
 * Type exports — use these everywhere instead of raw inferences
 * ────────────────────────────────────────────────────────────── */

export type IndustryProfile = typeof industryProfile.$inferSelect;
export type NewIndustryProfile = typeof industryProfile.$inferInsert;
export type IndustryCommittee = typeof industryCommittee.$inferSelect;
export type IndustryLegislatorWatch =
  typeof industryLegislatorWatch.$inferSelect;
export type IndustryBillWatch = typeof industryBillWatch.$inferSelect;
export type Legislator = typeof legislator.$inferSelect;
export type NewLegislator = typeof legislator.$inferInsert;
export type Bill = typeof bill.$inferSelect;
export type NewBill = typeof bill.$inferInsert;
export type BillTimeline = typeof billTimeline.$inferSelect;
export type Vote = typeof vote.$inferSelect;
export type NewsArticle = typeof newsArticle.$inferSelect;
export type LegislationNotice = typeof legislationNotice.$inferSelect;
export type NewLegislationNotice = typeof legislationNotice.$inferInsert;
export type PetitionItem = typeof petitionItem.$inferSelect;
export type NewPetitionItem = typeof petitionItem.$inferInsert;
export type PressRelease = typeof pressRelease.$inferSelect;
export type NewPressRelease = typeof pressRelease.$inferInsert;
export type CommitteeTranscript = typeof committeeTranscript.$inferSelect;
export type NewCommitteeTranscript = typeof committeeTranscript.$inferInsert;
export type CommitteeTranscriptUtterance =
  typeof committeeTranscriptUtterance.$inferSelect;
export type NewCommitteeTranscriptUtterance =
  typeof committeeTranscriptUtterance.$inferInsert;
export type Alert = typeof alert.$inferSelect;
export type DailyBriefing = typeof dailyBriefing.$inferSelect;
export type RelevanceOverride = typeof relevanceOverride.$inferSelect;
export type SyncLog = typeof syncLog.$inferSelect;

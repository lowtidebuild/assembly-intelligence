CREATE TYPE "public"."alert_type" AS ENUM('stage_change', 'new_bill', 'vote_scheduled', 'sync_failure');--> statement-breakpoint
CREATE TYPE "public"."bill_stage" AS ENUM('stage_0', 'stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5', 'stage_6');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_type" AS ENUM('morning', 'evening', 'manual');--> statement-breakpoint
CREATE TYPE "public"."vote_result" AS ENUM('yes', 'no', 'abstain', 'absent', 'unknown');--> statement-breakpoint
CREATE TABLE "alert" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alert_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"type" "alert_type" NOT NULL,
	"bill_id" bigint,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bill_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"bill_id" text NOT NULL,
	"bill_name" text NOT NULL,
	"proposer_name" text NOT NULL,
	"proposer_party" text,
	"co_sponsor_count" integer DEFAULT 0 NOT NULL,
	"committee" text,
	"stage" "bill_stage" DEFAULT 'stage_1' NOT NULL,
	"status" text,
	"proposal_date" timestamp with time zone,
	"relevance_score" integer,
	"relevance_reasoning" text,
	"proposal_reason" text,
	"main_content" text,
	"summary_text" text,
	"company_impact" text,
	"company_impact_is_ai_draft" boolean DEFAULT false NOT NULL,
	"external_link" text,
	"last_synced" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_bill_id_unique" UNIQUE("bill_id")
);
--> statement-breakpoint
CREATE TABLE "bill_timeline" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bill_timeline_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"bill_id" bigint NOT NULL,
	"stage" "bill_stage" NOT NULL,
	"event_date" timestamp with time zone NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_briefing" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "daily_briefing_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"date" text NOT NULL,
	"content_html" text NOT NULL,
	"key_item_count" integer DEFAULT 0 NOT NULL,
	"schedule_count" integer DEFAULT 0 NOT NULL,
	"new_bill_count" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_briefing_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "industry_committee" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "industry_committee_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"industry_profile_id" bigint NOT NULL,
	"committee_code" text NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"is_auto_added" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_legislator_watch" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "industry_legislator_watch_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"industry_profile_id" bigint NOT NULL,
	"legislator_id" bigint NOT NULL,
	"reason" text,
	"is_auto_added" boolean DEFAULT false NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_profile" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "industry_profile_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text NOT NULL,
	"icon" text DEFAULT '📊' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"llm_context" text DEFAULT '' NOT NULL,
	"preset_version" text,
	"is_custom" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "industry_profile_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "legislator" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "legislator_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"member_id" text NOT NULL,
	"name" text NOT NULL,
	"name_hanja" text,
	"party" text NOT NULL,
	"district" text,
	"term_number" integer,
	"committees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seat_index" integer,
	"profile_image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legislator_member_id_unique" UNIQUE("member_id")
);
--> statement-breakpoint
CREATE TABLE "news_article" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_article_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"bill_id" bigint,
	"query" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"source" text,
	"description" text,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_article_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "relevance_override" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "relevance_override_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"bill_id" bigint NOT NULL,
	"original_score" integer,
	"override_score" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sync_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sync_type" "sync_type" NOT NULL,
	"status" "sync_status" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"bills_processed" integer DEFAULT 0 NOT NULL,
	"bills_scored" integer DEFAULT 0 NOT NULL,
	"legislators_updated" integer DEFAULT 0 NOT NULL,
	"news_fetched" integer DEFAULT 0 NOT NULL,
	"errors_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "vote" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vote_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"bill_id" bigint NOT NULL,
	"legislator_id" bigint NOT NULL,
	"result" "vote_result" NOT NULL,
	"vote_date" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_timeline" ADD CONSTRAINT "bill_timeline_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_committee" ADD CONSTRAINT "industry_committee_industry_profile_id_industry_profile_id_fk" FOREIGN KEY ("industry_profile_id") REFERENCES "public"."industry_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_legislator_watch" ADD CONSTRAINT "industry_legislator_watch_industry_profile_id_industry_profile_id_fk" FOREIGN KEY ("industry_profile_id") REFERENCES "public"."industry_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_legislator_watch" ADD CONSTRAINT "industry_legislator_watch_legislator_id_legislator_id_fk" FOREIGN KEY ("legislator_id") REFERENCES "public"."legislator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_article" ADD CONSTRAINT "news_article_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relevance_override" ADD CONSTRAINT "relevance_override_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_bill_id_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_legislator_id_legislator_id_fk" FOREIGN KEY ("legislator_id") REFERENCES "public"."legislator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_alert_unread" ON "alert" USING btree ("read","created_at");--> statement-breakpoint
CREATE INDEX "idx_alert_bill" ON "alert" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "idx_bill_relevance" ON "bill" USING btree ("relevance_score");--> statement-breakpoint
CREATE INDEX "idx_bill_stage" ON "bill" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_bill_committee" ON "bill" USING btree ("committee");--> statement-breakpoint
CREATE INDEX "idx_bill_proposal_date" ON "bill" USING btree ("proposal_date");--> statement-breakpoint
CREATE INDEX "idx_bill_timeline_bill" ON "bill_timeline" USING btree ("bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_industry_committee" ON "industry_committee" USING btree ("industry_profile_id","committee_code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_industry_legislator_watch" ON "industry_legislator_watch" USING btree ("industry_profile_id","legislator_id");--> statement-breakpoint
CREATE INDEX "idx_legislator_party" ON "legislator" USING btree ("party");--> statement-breakpoint
CREATE INDEX "idx_legislator_active" ON "legislator" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_news_bill" ON "news_article" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "idx_news_published" ON "news_article" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "idx_relevance_override_bill" ON "relevance_override" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "idx_sync_log_started" ON "sync_log" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vote" ON "vote" USING btree ("bill_id","legislator_id");--> statement-breakpoint
CREATE INDEX "idx_vote_bill" ON "vote" USING btree ("bill_id");
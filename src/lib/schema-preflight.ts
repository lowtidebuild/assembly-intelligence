export interface ExpectedTable {
  table: string;
  columns: string[];
}

export interface SchemaColumnRow {
  table_name: string;
  column_name: string;
}

export interface MissingSchemaColumn {
  table: string;
  column: string;
}

// Every new migration that adds a table/column consumed by cron paths MUST add an entry here.
export const EXPECTED_SCHEMA_COLUMNS: ExpectedTable[] = [
  {
    table: "daily_briefing",
    columns: ["key_bill_ids", "new_bill_ids", "content_json"],
  },
  {
    table: "legislator",
    columns: ["photo_url"],
  },
  {
    table: "bill",
    columns: [
      "bill_number",
      "proposal_reason",
      "main_content",
      "evidence_level",
      "body_fetch_status",
      "evidence_meta",
      "discovery_sources",
      "discovery_keywords",
      "analysis_meta",
    ],
  },
  {
    table: "petition_item",
    columns: ["petition_id", "title", "is_relevant"],
  },
  {
    table: "press_release",
    columns: ["title", "committee", "is_relevant"],
  },
  {
    table: "industry_profile",
    columns: ["exclude_keywords", "selected_law_mixins"],
  },
  {
    table: "sync_log",
    columns: ["metadata_json"],
  },
  {
    table: "committee_transcript",
    columns: ["minutes_id", "meeting_name", "full_text", "agenda_items"],
  },
  {
    table: "committee_transcript_utterance",
    columns: [
      "transcript_id",
      "sort_order",
      "content",
      "has_keyword_match",
    ],
  },
  {
    table: "alert",
    columns: ["type", "title", "message", "severity", "read"],
  },
  {
    table: "industry_bill_watch",
    columns: ["industry_profile_id", "bill_id"],
  },
];

export function findMissingSchemaColumns(
  rows: SchemaColumnRow[],
  expected: ExpectedTable[] = EXPECTED_SCHEMA_COLUMNS,
): MissingSchemaColumn[] {
  const actual = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!actual.has(row.table_name)) {
      actual.set(row.table_name, new Set());
    }
    actual.get(row.table_name)!.add(row.column_name);
  }

  return expected.flatMap((entry) => {
    const present = actual.get(entry.table) ?? new Set<string>();
    return entry.columns
      .filter((column) => !present.has(column))
      .map((column) => ({ table: entry.table, column }));
  });
}

export function quoteSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

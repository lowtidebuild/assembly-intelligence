import { describe, expect, it } from "vitest";
import {
  EXPECTED_SCHEMA_COLUMNS,
  findMissingSchemaColumns,
  quoteSqlString,
} from "@/lib/schema-preflight";

describe("schema preflight helpers", () => {
  it("tracks new sync health and detection metadata columns", () => {
    expect(EXPECTED_SCHEMA_COLUMNS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "sync_log",
          columns: expect.arrayContaining(["metadata_json"]),
        }),
        expect.objectContaining({
          table: "bill",
          columns: expect.arrayContaining([
            "discovery_sources",
            "discovery_keywords",
            "analysis_meta",
          ]),
        }),
        expect.objectContaining({
          table: "daily_briefing",
          columns: expect.arrayContaining(["content_json"]),
        }),
      ]),
    );
  });

  it("finds missing expected columns", () => {
    expect(
      findMissingSchemaColumns(
        [
          { table_name: "sync_log", column_name: "id" },
          { table_name: "sync_log", column_name: "metadata_json" },
          { table_name: "bill", column_name: "discovery_sources" },
        ],
        [
          { table: "sync_log", columns: ["metadata_json"] },
          {
            table: "bill",
            columns: ["discovery_sources", "analysis_meta"],
          },
        ],
      ),
    ).toEqual([{ table: "bill", column: "analysis_meta" }]);
  });

  it("quotes SQL strings safely", () => {
    expect(quoteSqlString("bill")).toBe("'bill'");
    expect(quoteSqlString("o'hare")).toBe("'o''hare'");
  });
});

import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/search/route";

describe("GET /api/search", () => {
  it("returns empty results without touching the database for short queries", async () => {
    const response = await GET(new Request("http://localhost/api/search?q=%EC%A7%84"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      legislators: [],
      bills: [],
    });
  });
});

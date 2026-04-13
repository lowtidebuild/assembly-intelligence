import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/setup/route";

describe("POST /api/setup", () => {
  it("returns invalid_json for malformed request bodies", async () => {
    const response = await POST(
      new Request("http://localhost/api/setup", {
        method: "POST",
        body: "{",
        headers: {
          "content-type": "application/json",
        },
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "invalid_json",
        message: "Body is not valid JSON",
      },
    });
  });

  it("returns validation_error for invalid payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/setup", {
        method: "POST",
        body: JSON.stringify({
          slug: "INVALID SLUG",
          name: "",
          nameEn: "",
          keywords: [],
          llmContext: "short",
          committees: [],
          legislatorIds: [],
        }),
        headers: {
          "content-type": "application/json",
        },
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "validation_error",
      },
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  buildAssemblyMemberPageUrl,
  extractStaticPhotoUrlFromMemberPage,
  normalizeAssemblyPhotoUrl,
} from "@/lib/legislator-photo";

describe("normalizeAssemblyPhotoUrl", () => {
  it("keeps browser-safe static portal URLs", () => {
    expect(
      normalizeAssemblyPhotoUrl(
        "https://www.assembly.go.kr/static/portal/img/openassm/new/c39a39eef1a54ac79afc0124ac6a1598.jpg",
      ),
    ).toBe(
      "https://www.assembly.go.kr/static/portal/img/openassm/new/c39a39eef1a54ac79afc0124ac6a1598.jpg",
    );
  });

  it("normalizes relative static paths", () => {
    expect(
      normalizeAssemblyPhotoUrl(
        "/static/portal/img/openassm/new/thumb/example.jpg",
      ),
    ).toBe(
      "https://www.assembly.go.kr/static/portal/img/openassm/new/thumb/example.jpg",
    );
  });

  it("rejects raw /photo urls", () => {
    expect(
      normalizeAssemblyPhotoUrl("https://www.assembly.go.kr/photo/QDU1100U.jpg"),
    ).toBeNull();
  });
});

describe("extractStaticPhotoUrlFromMemberPage", () => {
  it("extracts background-image based profile photos", () => {
    const html = `
      <span class="img" style="background-image: url('/static/portal/img/openassm/new/c39a39eef1a54ac79afc0124ac6a1598.jpg')"></span>
    `;

    expect(extractStaticPhotoUrlFromMemberPage(html)).toBe(
      "https://www.assembly.go.kr/static/portal/img/openassm/new/c39a39eef1a54ac79afc0124ac6a1598.jpg",
    );
  });

  it("extracts img src based profile photos", () => {
    const html = `
      <img src="/static/portal/img/openassm/new/thumb/test-thumb.jpg" alt="profile" />
    `;

    expect(extractStaticPhotoUrlFromMemberPage(html)).toBe(
      "https://www.assembly.go.kr/static/portal/img/openassm/new/thumb/test-thumb.jpg",
    );
  });
});

describe("buildAssemblyMemberPageUrl", () => {
  it("builds the official member.do URL from monaCd", () => {
    expect(buildAssemblyMemberPageUrl("QDU1100U")).toBe(
      "https://www.assembly.go.kr/portal/assm/assmMemb/member.do?monaCd=QDU1100U&st=22&viewType=CONTBODY",
    );
  });
});

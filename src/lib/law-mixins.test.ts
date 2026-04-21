import { describe, expect, it } from "vitest";
import {
  getMixin,
  listMixinSlugs,
  listMixins,
  mergeExcludesWithMixins,
  mergeKeywordsWithMixins,
} from "@/lib/law-mixins";

describe("law-mixins registry", () => {
  it("lists the expected shipping mixins", () => {
    const slugs = listMixinSlugs();
    expect(slugs).toHaveLength(8);
    expect(slugs).toContain("ecommerce-act");
    expect(slugs).toContain("esports-promotion-act");
  });

  it("returns undefined for unknown slugs", () => {
    expect(getMixin("nonexistent-act")).toBeUndefined();
  });

  it("auto-merges formalName and name into keywords", () => {
    const mixin = getMixin("ecommerce-act");
    expect(mixin).toBeDefined();
    expect(mixin?.keywords).toContain(mixin?.formalName ?? "");
    expect(mixin?.keywords).toContain(mixin?.name ?? "");
  });

  it("dedupes keywords for every mixin", () => {
    for (const slug of listMixinSlugs()) {
      const mixin = getMixin(slug);
      expect(mixin).toBeDefined();
      expect(new Set(mixin?.keywords).size).toBe(mixin?.keywords.length);
    }
  });

  it("ships only non-empty mixins", () => {
    for (const mixin of listMixins()) {
      expect(mixin.slug).toMatch(/^[a-z][a-z0-9-]+$/);
      expect(mixin.name.length).toBeGreaterThan(0);
      expect(mixin.formalName.length).toBeGreaterThan(0);
      expect(mixin.keywords.length).toBeGreaterThan(3);
    }
  });
});

describe("mergeKeywordsWithMixins", () => {
  it("returns the base keyword set when mixinSlugs is empty", () => {
    const base = ["게임", "게임산업"];
    expect(new Set(mergeKeywordsWithMixins(base, []))).toEqual(new Set(base));
  });

  it("dedupes overlapping keywords", () => {
    const merged = mergeKeywordsWithMixins(["전자상거래"], ["ecommerce-act"]);
    expect(merged.filter((keyword) => keyword === "전자상거래")).toHaveLength(1);
  });

  it("adds mixin keywords and formal names to the profile keywords", () => {
    const merged = mergeKeywordsWithMixins(["게임산업"], ["ecommerce-act"]);
    expect(merged).toContain("게임산업");
    expect(merged).toContain("전자상거래");
    expect(merged).toContain("전자상거래 등에서의 소비자보호에 관한 법률");
  });

  it("silently skips unknown slugs", () => {
    expect(
      new Set(mergeKeywordsWithMixins(["게임산업"], ["nonexistent-act"])),
    ).toEqual(new Set(["게임산업"]));
  });

  it("handles multiple mixins at once", () => {
    const merged = mergeKeywordsWithMixins([], [
      "ecommerce-act",
      "info-comm-network-act",
    ]);
    expect(merged).toContain("전자상거래");
    expect(merged).toContain("정보통신망");
  });
});

describe("mergeExcludesWithMixins", () => {
  it("preserves profile excludes when no mixins are selected", () => {
    expect(
      new Set(mergeExcludesWithMixins(["제로섬 게임", "치킨게임"], [])),
    ).toEqual(new Set(["제로섬 게임", "치킨게임"]));
  });

  it("keeps profile excludes even when mixins currently add none", () => {
    const merged = mergeExcludesWithMixins(["제로섬 게임"], [
      "ecommerce-act",
      "pipa",
    ]);
    expect(merged).toContain("제로섬 게임");
  });
});

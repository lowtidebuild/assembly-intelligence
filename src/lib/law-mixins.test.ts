import { describe, expect, it } from "vitest";
import { STANDING_COMMITTEES } from "@/lib/assembly-committees";
import {
  getMixin,
  listMixinSlugs,
  listMixins,
  mergeCommitteesWithMixins,
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

describe("LawMixin.suggestedCommittees", () => {
  it("gives every mixin at least one committee", () => {
    for (const mixin of listMixins()) {
      expect(mixin.suggestedCommittees.length).toBeGreaterThan(0);
    }
  });

  it("uses canonical standing committee names", () => {
    const validCommitteeNames = new Set(
      STANDING_COMMITTEES.map((committee) => committee.name),
    );

    for (const mixin of listMixins()) {
      for (const committeeCode of mixin.suggestedCommittees) {
        expect(
          validCommitteeNames.has(committeeCode),
          `${mixin.slug} -> ${committeeCode}`,
        ).toBe(true);
      }
    }
  });

  it("keeps the expected committee mappings for shipped mixins", () => {
    expect(getMixin("ecommerce-act")?.suggestedCommittees).toContain(
      "정무위원회",
    );
    expect(getMixin("fair-labeling-act")?.suggestedCommittees).toContain(
      "정무위원회",
    );
    expect(getMixin("info-comm-network-act")?.suggestedCommittees).toContain(
      "과학기술정보방송통신위원회",
    );
    expect(getMixin("copyright-act")?.suggestedCommittees).toContain(
      "문화체육관광위원회",
    );
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

describe("mergeCommitteesWithMixins", () => {
  it("returns the profile committee set unchanged when no mixins are selected", () => {
    const result = mergeCommitteesWithMixins(
      ["문화체육관광위원회", "과학기술정보방송통신위원회"],
      [],
    );

    expect(result).toEqual([
      "문화체육관광위원회",
      "과학기술정보방송통신위원회",
    ]);
  });

  it("unions mixin committees into the profile committee set", () => {
    const result = mergeCommitteesWithMixins(
      ["문화체육관광위원회"],
      ["ecommerce-act", "copyright-act"],
    );

    expect(new Set(result)).toEqual(
      new Set(["문화체육관광위원회", "정무위원회"]),
    );
  });

  it("silently skips unknown mixin slugs", () => {
    expect(
      mergeCommitteesWithMixins(["정무위원회"], ["unknown-mixin"]),
    ).toEqual(["정무위원회"]);
  });

  it("dedupes committees shared by multiple mixins", () => {
    const result = mergeCommitteesWithMixins(
      [],
      ["ecommerce-act", "fair-labeling-act"],
    );

    expect(result.filter((committee) => committee === "정무위원회")).toHaveLength(
      1,
    );
  });

  it("includes every committee from multi-committee mixins", () => {
    const result = mergeCommitteesWithMixins([], ["pipa"]);

    expect(result).toContain("정무위원회");
    expect(result).toContain("행정안전위원회");
  });
});

#!/usr/bin/env tsx

import * as blocks from "../src/lib/law-keyword-blocks.ts";
import { listPresets } from "../src/lib/industry-presets.ts";
import {
  getMixin,
  listMixinSlugs,
  listMixins,
} from "../src/lib/law-mixins.ts";

let failures = 0;

function fail(message: string) {
  console.error(`FAIL: ${message}`);
  failures += 1;
}

function ok(message: string) {
  console.log(`OK:   ${message}`);
}

for (const slug of listMixinSlugs()) {
  const mixin = getMixin(slug);
  if (!mixin) {
    fail(`getMixin("${slug}") returned undefined for a known slug`);
    continue;
  }
  if (!mixin.keywords.includes(mixin.formalName)) {
    fail(`mixin "${slug}" formalName is missing from keywords`);
  }
  if (!mixin.keywords.includes(mixin.name)) {
    fail(`mixin "${slug}" name is missing from keywords`);
  }
  ok(`mixin "${slug}" invariants satisfied`);
}

for (const mixin of listMixins()) {
  if (getMixin(mixin.slug)?.slug !== mixin.slug) {
    fail(`slug mismatch on "${mixin.slug}"`);
  }
}

for (const [name, value] of Object.entries(blocks)) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`law-keyword-blocks export "${name}" is empty or invalid`);
    continue;
  }
  ok(`block "${name}" has ${value.length} keywords`);
}

const presetKeywords = new Map(
  listPresets().map((preset) => [preset.slug, new Set(preset.keywords)]),
);

console.log("\n=== Preset ∩ Mixin overlap (informational) ===");
for (const mixin of listMixins()) {
  const mixinKeywords = new Set(mixin.keywords);
  for (const [presetSlug, keywords] of presetKeywords) {
    const overlap = [...mixinKeywords].filter((keyword) => keywords.has(keyword));
    if (overlap.length > 0) {
      console.log(
        `  preset "${presetSlug}" ∩ mixin "${mixin.slug}": ${overlap.length} keywords`,
      );
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} invariant(s) violated.`);
  process.exit(1);
}

console.log("\nAll law-mixin invariants pass.");

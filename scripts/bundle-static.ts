/**
 * Bundle the exported examples/*.html files into a single
 * examples/app.html with JS-based tab navigation.
 *
 * Use case: share ONE file with external reviewers. They open it in
 * any browser, click tabs at the top to switch pages, no server
 * required.
 *
 * How it works:
 *   1. Read each exported HTML file
 *   2. Extract the inlined <style data-inlined="true"> CSS block
 *      (identical across all files — they come from the same Next.js
 *      build, so we only keep one copy)
 *   3. Extract the <body> inner HTML from each file
 *   4. Strip the per-file yellow notice banner (we'll add one to
 *      the bundle instead)
 *   5. Rewrite sibling filename links (radar.html → #page-radar)
 *      so clicking sidebar nav items switches tabs
 *   6. Stack all page bodies as <section class="bundled-page"
 *      data-page="..."> elements, hidden by default
 *   7. Add a tab bar at the top + tiny hash-router script
 *
 * The result is a single ~350 KB HTML file that works offline.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface PageSpec {
  slug: string;
  filename: string;
  label: string;
  /** Tab group — primary tabs show first, secondary tabs second */
  group: "primary" | "variant" | "meta";
}

const PAGES: PageSpec[] = [
  { slug: "briefing", filename: "briefing.html", label: "브리핑봇", group: "primary" },
  { slug: "radar", filename: "radar.html", label: "입법 레이더", group: "primary" },
  { slug: "radar-slide-over", filename: "radar-slide-over.html", label: "레이더 상세", group: "variant" },
  { slug: "impact-empty", filename: "impact-empty.html", label: "영향 분석기 (빈)", group: "variant" },
  { slug: "impact-selected", filename: "impact-selected.html", label: "영향 분석기", group: "primary" },
  { slug: "watch", filename: "watch.html", label: "의원 워치", group: "primary" },
  { slug: "assembly", filename: "assembly.html", label: "국회 현황", group: "primary" },
  { slug: "settings", filename: "settings.html", label: "설정", group: "primary" },
  { slug: "setup", filename: "setup.html", label: "설정 위저드", group: "primary" },
  { slug: "login", filename: "login.html", label: "로그인", group: "meta" },
];

const EXAMPLES_DIR = resolve("examples");
const DOCS_DIR = resolve("docs");

function extractCss(html: string): string {
  const m = html.match(/<style data-inlined="true">([\s\S]*?)<\/style>/);
  return m?.[1] ?? "";
}

function extractBodyInner(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/);
  return m?.[1] ?? "";
}

/**
 * Strip the yellow "정적 스냅샷" notice banner that export-static.ts
 * injects at the top of each exported page body. Matches the first
 * <div> whose inline style contains the banner's background color.
 */
function stripNotice(html: string): string {
  return html.replace(
    /<div style="[^"]*#fef3c7[\s\S]*?<\/div>/,
    "",
  );
}

/**
 * Rewrite sibling-filename hrefs to hash-based routes.
 *   href="radar.html"        → href="#page-radar"
 *   href="radar.html?foo=1"  → href="#page-radar"
 *
 * Only the exact filenames we know about get rewritten. Unknown
 * links (external URLs, `#` stubs) are left alone.
 */
function rewriteLinks(html: string, pages: PageSpec[]): string {
  let result = html;
  for (const p of pages) {
    const escaped = p.filename.replace(/\./g, "\\.");
    const regex = new RegExp(`href="${escaped}[^"]*"`, "g");
    result = result.replace(regex, `href="#page-${p.slug}"`);
  }
  return result;
}

function buildTabBar(pages: PageSpec[]): string {
  const byGroup: Record<string, PageSpec[]> = {
    primary: [],
    variant: [],
    meta: [],
  };
  for (const p of pages) byGroup[p.group].push(p);

  const groupLabels: Record<string, string> = {
    primary: "메인",
    variant: "변형",
    meta: "기타",
  };

  const groups = (["primary", "variant", "meta"] as const).map((g) => {
    const items = byGroup[g];
    if (items.length === 0) return "";
    const links = items
      .map(
        (p) =>
          `<a href="#page-${p.slug}" data-tab="${p.slug}">${p.label}</a>`,
      )
      .join("");
    return `<div class="tab-group">
      <span class="tab-label">${groupLabels[g]}</span>
      ${links}
    </div>`;
  });
  return groups.join("\n");
}

function main() {
  console.log("── bundling ──");
  let css = "";
  const sections: string[] = [];

  for (const page of PAGES) {
    const path = resolve(EXAMPLES_DIR, page.filename);
    const html = readFileSync(path, "utf-8");

    // CSS: first file wins (all files share the same Next.js build)
    if (!css) {
      css = extractCss(html);
      console.log(
        `  css extracted from ${page.filename}: ${Math.round(css.length / 1024)} KB`,
      );
    }

    let body = extractBodyInner(html);
    body = stripNotice(body);
    body = rewriteLinks(body, PAGES);

    sections.push(
      `<section class="bundled-page" data-page="${page.slug}">${body}</section>`,
    );
    console.log(
      `  ${page.slug.padEnd(20)} ${Math.round(body.length / 1024)} KB`,
    );
  }

  const tabs = buildTabBar(PAGES);

  const bundled = `<!DOCTYPE html>
<html lang="ko" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ParlaWatch+ — Interactive Demo</title>
<style>
${css}

/* ── Bundle-specific overrides ───────────────────────────── */
.bundle-notice {
  background: #fef3c7;
  color: #78350f;
  border-bottom: 1px solid #fde68a;
  padding: 8px 20px;
  font-family: -apple-system, 'Segoe UI', 'Pretendard', 'Noto Sans KR', sans-serif;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}
.bundle-notice code {
  background: rgba(0, 0, 0, 0.05);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11px;
}
.bundle-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 8px 20px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  font-family: -apple-system, 'Segoe UI', 'Pretendard', 'Noto Sans KR', sans-serif;
  font-size: 11px;
}
.tab-group {
  display: flex;
  align-items: center;
  gap: 3px;
}
.tab-label {
  color: #94a3b8;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-right: 6px;
}
.bundle-tabs a {
  padding: 4px 10px;
  border-radius: 12px;
  color: #64748b;
  text-decoration: none;
  font-weight: 500;
  transition: background 0.12s, color 0.12s;
}
.bundle-tabs a:hover {
  background: #f1f5f9;
  color: #1e293b;
}
.bundle-tabs a.active {
  background: #dbeafe;
  color: #2563eb;
  font-weight: 700;
}
.bundled-page {
  display: none;
}
.bundled-page.active {
  display: block;
}
/* Prevent internal sticky topbars from fighting with body padding */
.bundled-page {
  min-height: 100vh;
}
</style>
</head>
<body>
<div class="bundle-notice">
  <strong>ParlaWatch+ Interactive Demo</strong> · 정적 스냅샷 ·
  실제 앱: <code>pnpm install &amp;&amp; pnpm dev</code> →
  <code>localhost:3000</code> ·
  편집/필터 제출/슬라이드오버 닫기 등은 동작하지 않습니다
</div>
<nav class="bundle-tabs">
${tabs}
</nav>
${sections.join("\n\n")}
<script>
(function () {
  function activate() {
    var raw = (window.location.hash || "#page-briefing").slice(1);
    var slug = raw.indexOf("page-") === 0 ? raw.slice(5) : "briefing";
    var pages = document.querySelectorAll(".bundled-page");
    var matched = false;
    pages.forEach(function (p) {
      var hit = p.getAttribute("data-page") === slug;
      if (hit) matched = true;
      p.classList.toggle("active", hit);
    });
    // Fallback: if no match, activate the first page
    if (!matched && pages[0]) {
      pages[0].classList.add("active");
      slug = pages[0].getAttribute("data-page");
    }
    // Sync tab highlight
    document.querySelectorAll(".bundle-tabs a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-tab") === slug);
    });
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", activate);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", activate);
  } else {
    activate();
  }
})();
</script>
</body>
</html>`;

  const outPath = resolve(EXAMPLES_DIR, "app.html");
  mkdirSync(DOCS_DIR, { recursive: true });
  writeFileSync(outPath, bundled, "utf-8");
  writeFileSync(resolve(DOCS_DIR, "index.html"), bundled, "utf-8");
  const bytes = Buffer.byteLength(bundled, "utf-8");
  console.log(
    `\n✅ examples/app.html (${Math.round(bytes / 1024)} KB, ${PAGES.length} pages)`,
  );
  console.log("   mirrored to docs/index.html");
  console.log(`   open examples/app.html to browse`);
}

main();

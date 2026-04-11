/**
 * Static HTML export — snapshots every dashboard page as a
 * standalone HTML file with all CSS inlined, for:
 *   1. README examples
 *   2. External feedback review (send a .zip of HTML files)
 *
 * How it works:
 *   1. Playwright logs in with APP_PASSWORD
 *   2. For each page, grab the rendered HTML via page.content()
 *   3. Find every <link rel="stylesheet" href="/_next/static/...">
 *   4. Fetch each CSS file, inline it as <style>...</style>
 *   5. Strip all <script> tags — they reference Next.js chunks
 *      that won't work offline, and server components have
 *      already emitted the full DOM
 *   6. Replace <a href="/..."> links with static page names
 *      so clicking 설정 → settings.html works offline
 *   7. Save to examples/ at the repo root
 *
 * The saved files are static snapshots — no interactivity
 * (no editor save, no hemicycle hover, no slide-over close).
 * For full-fidelity visuals use the PNG screenshots instead.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = resolve("examples");

interface ExportTarget {
  /** URL path on the running server */
  path: string;
  /** Filename to save as (without .html extension) */
  name: string;
  /** Human description for the manifest + index */
  description: string;
}

// Ordered so index.html navigation feels natural
const TARGETS: ExportTarget[] = [
  { path: "/briefing", name: "briefing", description: "브리핑봇 — 오늘의 핵심 법안 + Gemini 일일 브리핑 + 관련 뉴스" },
  { path: "/radar", name: "radar", description: "입법 레이더 — 필터 가능 법안 테이블" },
  { path: "/radar?bill=1", name: "radar-slide-over", description: "입법 레이더 — 슬라이드오버 패널 열린 상태" },
  { path: "/impact", name: "impact-empty", description: "영향 분석기 — 법안 선택 전 empty state" },
  { path: "/impact?bill=1", name: "impact-selected", description: "영향 분석기 — 법안 선택 + 분석 셸" },
  { path: "/assembly", name: "assembly", description: "국회 현황 — 295명 의석 배치도 (wedge layout)" },
  { path: "/watch", name: "watch", description: "의원 워치 — 워치리스트 + hemicycle 피커" },
  { path: "/settings", name: "settings", description: "설정 — 프로필 / 환경 변수 / 동기화 로그" },
  { path: "/setup", name: "setup", description: "설정 위저드 — 5단계 온보딩" },
  { path: "/login", name: "login", description: "로그인 페이지" },
];

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="password"]', process.env.APP_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/briefing/);
}

/**
 * Extract all stylesheet URLs from the HTML, fetch them, and
 * return a single merged <style> block to inject in place.
 */
async function fetchAndInlineCss(
  page: Page,
  html: string,
): Promise<{ html: string; cssBytes: number }> {
  // Find all <link rel="stylesheet" ...> tags
  const linkRegex =
    /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
  const hrefRegex = /href=["']([^"']+)["']/i;

  const links = html.match(linkRegex) ?? [];
  const cssChunks: string[] = [];
  let totalBytes = 0;

  for (const link of links) {
    const match = link.match(hrefRegex);
    if (!match) continue;
    const href = match[1];
    // Resolve to absolute URL against the server
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    try {
      const res = await page.request.get(url);
      if (!res.ok()) {
        console.warn(`  ⚠ css fetch failed ${res.status()} ${url}`);
        continue;
      }
      const css = await res.text();
      cssChunks.push(`/* ${href} */\n${css}`);
      totalBytes += css.length;
    } catch (err) {
      console.warn(`  ⚠ css fetch error ${url}:`, err);
    }
  }

  // Remove all <link rel="stylesheet"> tags from the HTML
  const cleanedHtml = html.replace(linkRegex, "");
  // Inject one big <style> block right before </head>
  const styleBlock = `<style data-inlined="true">\n${cssChunks.join("\n\n")}\n</style>`;
  const withStyle = cleanedHtml.replace(/<\/head>/i, `${styleBlock}\n</head>`);
  return { html: withStyle, cssBytes: totalBytes };
}

/**
 * Strip all script tags. The rendered DOM from the server is
 * already complete; client JS was only for hydration +
 * interactivity, neither of which matter in a static snapshot.
 */
function stripScripts(html: string): string {
  // Remove <script>...</script> (with content)
  let cleaned = html.replace(
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
  // Also remove self-closing / src-only script tags
  cleaned = cleaned.replace(/<script\b[^>]*\/?>/gi, "");
  // Remove preload/prefetch link tags that point to JS chunks
  cleaned = cleaned.replace(
    /<link[^>]+rel=["'](?:preload|prefetch|modulepreload)["'][^>]*>/gi,
    "",
  );
  return cleaned;
}

/**
 * Rewrite internal navigation hrefs so clicking links in the
 * exported HTML goes to sibling static files. For example:
 *   <a href="/radar">  →  <a href="radar.html">
 *   <a href="/radar?bill=1">  →  <a href="radar-slide-over.html">
 *
 * Anything we didn't export gets a noop href="#".
 */
function rewriteLinks(html: string, targets: ExportTarget[]): string {
  // Build a map: path → filename
  const pathToFile = new Map<string, string>();
  for (const t of targets) {
    pathToFile.set(t.path, `${t.name}.html`);
  }
  // Regex: capture href="..." values starting with /
  // We need to keep href attributes inside relative asset URLs
  // (e.g. fonts, images) intact, so we only match <a href="...">
  return html.replace(
    /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
    (full, before, href, after) => {
      if (!href.startsWith("/")) return full;
      if (href.startsWith("//")) return full; // protocol-relative
      // Check if exact path matches
      const mapped = pathToFile.get(href);
      if (mapped) {
        return `<a ${before}href="${mapped}"${after}>`;
      }
      // Stub unknown internal links to prevent offline broken nav
      return `<a ${before}href="#"${after} data-stubbed-href="${href}">`;
    },
  );
}

/**
 * Convert remaining Next.js asset URLs (fonts, images) that we
 * didn't inline. For simplicity we just prefix them with BASE_URL
 * so if the viewer has a network connection, they resolve.
 * Alternative: download + base64 data URL (larger files).
 */
function absolutizeAssets(html: string): string {
  return html.replace(
    /(src|href)=["'](\/_next\/[^"']+)["']/gi,
    (_, attr, path) => `${attr}="${BASE_URL}${path}"`,
  );
}

/**
 * Add an "exported" notice banner at the top of the body so
 * readers understand this is a static snapshot.
 */
function addNotice(html: string, description: string): string {
  const banner = `
<div style="
  background: #fef3c7;
  color: #78350f;
  border-bottom: 1px solid #fde68a;
  padding: 10px 20px;
  font-family: -apple-system, 'Segoe UI', 'Pretendard', sans-serif;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
">
  <strong>정적 스냅샷</strong> · ${description} ·
  실제 앱: <code>pnpm start</code> 후 <code>http://localhost:3000</code> ·
  클릭/편집은 동작하지 않습니다
</div>`;
  return html.replace(/(<body[^>]*>)/i, `$1${banner}`);
}

async function exportPage(
  page: Page,
  target: ExportTarget,
): Promise<{ bytes: number; cssBytes: number }> {
  console.log(`\n── ${target.name} (${target.path}) ──`);
  await page.goto(`${BASE_URL}${target.path}`);
  await page.waitForLoadState("networkidle");

  let html = await page.content();
  const cssResult = await fetchAndInlineCss(page, html);
  html = cssResult.html;
  html = stripScripts(html);
  html = absolutizeAssets(html);
  html = rewriteLinks(html, TARGETS);
  html = addNotice(html, target.description);

  const outPath = resolve(OUT_DIR, `${target.name}.html`);
  writeFileSync(outPath, html, "utf-8");
  const bytes = Buffer.byteLength(html, "utf-8");
  console.log(
    `  → ${outPath.split("/").slice(-2).join("/")} (${Math.round(bytes / 1024)} KB, css ${Math.round(cssResult.cssBytes / 1024)} KB)`,
  );
  return { bytes, cssBytes: cssResult.cssBytes };
}

function writeIndex(
  targets: ExportTarget[],
  stats: Record<string, { bytes: number }>,
) {
  const rows = targets
    .map((t) => {
      const size = stats[t.name]?.bytes ?? 0;
      return `
    <li>
      <a href="${t.name}.html">
        <strong>${t.name}.html</strong>
        <span class="desc">${t.description}</span>
        <span class="size">${Math.round(size / 1024)} KB</span>
      </a>
    </li>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>ParlaWatch+ 정적 스냅샷</title>
<style>
  :root {
    --primary: #2563eb;
    --text: #1e293b;
    --muted: #64748b;
    --bg: #f8fafc;
    --border: #e2e8f0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Segoe UI', 'Pretendard', 'Noto Sans KR', sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 40px 20px;
  }
  .container {
    max-width: 760px;
    margin: 0 auto;
  }
  h1 {
    font-size: 28px;
    color: var(--primary);
    margin-bottom: 6px;
    letter-spacing: -0.02em;
  }
  .subtitle {
    color: var(--muted);
    font-size: 14px;
    margin-bottom: 24px;
  }
  .intro {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px 20px;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.7;
    margin-bottom: 24px;
  }
  .intro code {
    background: #f1f5f9;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 12px;
  }
  ul {
    list-style: none;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  li {
    border-bottom: 1px solid var(--border);
  }
  li:last-child {
    border-bottom: none;
  }
  a {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 14px 20px;
    text-decoration: none;
    color: var(--text);
    transition: background 0.15s;
  }
  a:hover {
    background: #f8fafc;
  }
  strong {
    color: var(--primary);
    font-size: 14px;
    flex: 0 0 auto;
    font-family: 'SF Mono', Monaco, monospace;
  }
  .desc {
    color: var(--muted);
    font-size: 12px;
    flex: 1 1 auto;
  }
  .size {
    color: #94a3b8;
    font-size: 11px;
    font-family: 'SF Mono', Monaco, monospace;
  }
  footer {
    margin-top: 24px;
    text-align: center;
    color: #94a3b8;
    font-size: 11px;
  }
</style>
</head>
<body>
  <div class="container">
    <h1>ParlaWatch+ 정적 스냅샷</h1>
    <p class="subtitle">산업별 국회 인텔리전스 대시보드 · ${new Date().toISOString().slice(0, 10)} 수집</p>
    <div class="intro">
      이 디렉토리의 HTML 파일들은 실제 구동 중인 ParlaWatch+ 앱의 정적 스냅샷입니다.
      CSS는 각 파일에 인라인되어 있어 외부 의존성 없이 열립니다. JavaScript는 제거되어
      인터랙션(편집, 필터, 슬라이드오버 닫기 등)은 동작하지 않습니다. 시각적 결과만 보시려면
      아래 페이지들을 차례로 열어보세요.<br><br>
      <strong>실제 앱 실행:</strong> <code>pnpm install</code> → <code>pnpm dev</code> →
      <code>http://localhost:3000</code>
    </div>
    <ul>${rows}
    </ul>
    <footer>
      Generated by scripts/export-static.ts · Data source:
      assembly-api-mcp + Gemini 2.5 Flash/Pro + Naver News Search API
    </footer>
  </div>
</body>
</html>`;
  writeFileSync(resolve(OUT_DIR, "index.html"), html, "utf-8");
  console.log(`\n→ index.html`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  try {
    await login(page);

    const stats: Record<string, { bytes: number }> = {};
    let totalBytes = 0;
    let totalCssBytes = 0;
    for (const target of TARGETS) {
      const result = await exportPage(page, target);
      stats[target.name] = { bytes: result.bytes };
      totalBytes += result.bytes;
      totalCssBytes += result.cssBytes;
    }
    writeIndex(TARGETS, stats);

    console.log(
      `\n✅ ${TARGETS.length} pages exported, total ${Math.round(totalBytes / 1024)} KB (css ${Math.round(totalCssBytes / 1024)} KB)`,
    );
    console.log(`   open examples/index.html to browse`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("❌ export failed:", err);
  process.exit(1);
});

# Walkthrough Findings — 2026-04-11

Full visual walkthrough of the app via scripts/walkthrough.ts.
17 pages captured, inspected one by one, two substantive fixes shipped.

## What passes

All 6 dashboard pages + login + setup wizard + all 5 wizard steps
render correctly with no layout breaks, no ghost components, and no
obvious UX gaps. The ParlaWatch variant-C aesthetic is maintained
throughout. Korean text wraps and spaces correctly.

Specific highlights:
- **01-03 login flow** — branded, error state visible in red
- **04 briefing** — 2-column workspace matches variant-C mockup exactly
- **05-06 radar** — table, filter chips, URL-driven sort all work
- **07 radar slide-over** — backdrop click-to-close + full detail panel
- **08-09 impact page** — bill picker + analysis shell with real editors
- **10 assembly hemicycle** — 295 seats rendering with party legend
- **11 watch** — empty state copy points to the hemicycle picker
- **12 settings** — 4 cards with profile, env status, sync logs
- **13-16 setup wizard** — all 5 steps, edit mode works, step indicator
  shows completion state properly
- **17 logout** — cookie cleared, back to login

## Issues found + fixes

### P0 — Stub artifacts leaking into rendered UI

**Symptom:** bill.summary_text on every card showed `[STUB 요약]`,
daily_briefing.content_html contained `[STUB] Gemini 브리핑 생성기는
Lane B에서 구현됩니다`.

**Root cause:** The last morning sync that wrote to the DB was run
with `--stub` during Lane D smoke testing. Neither the bill rows nor
the daily_briefing row got overwritten by a subsequent real run.

**Fix:** Re-ran `scripts/dry-run-morning-sync.ts` (no --stub flag) →
44.3s, 5 bills scored with real Gemini, briefing HTML regenerated
with full Korean prose. See `after/04-briefing.png` for proof.

**Why it matters:** A team member opening the dashboard would see
`[STUB]` markers and lose trust. Sync logic was fine; this was a
lifecycle oversight during development.

### P1 — News rail surfaced industry-wide noise over bill-linked signal

**Symptom:** The briefing "관련 뉴스" section led with articles about
"무등록 성인 PC방 적발" because the industry-wide Naver query for
"게임산업 게임산업진흥" matched broadly. Bill-linked news (e.g.
"정연욱 의원, e스포츠 진흥법 개정안 통과") was pushed below the fold.

**Root cause:** `loadRecentNews()` ordered by `publishedAt DESC` only,
treating bill-linked and industry-wide rows equally.

**Fix:** `src/services/news-sync.ts` — added primary sort key
`${newsArticle.billId} IS NULL` so bill-linked rows always appear
first, with date ordering inside each group. See `after/04-briefing.png`
for the new news order.

**Why it matters:** The whole point of filtering news by an
industry profile is to show the user actionable signal. Noise on
top defeats the purpose.

## Issues NOT fixed (tracked as P2)

### Walkthrough script locator bugs

A few selectors in `scripts/walkthrough-zoom.ts` matched the wrong
DOM element:
- `b02-topbar` (`.sticky`) matched the sidebar
- `r01-filter-bar` (`form`) matched the sidebar logout form
- `a01-hemicycle` (`svg`) matched the brand icon
- `s01-card` through `s04-card` (`.rounded-[var(--radius)]`) were too greedy

**Not a user-facing issue.** The full-page `walkthrough.ts` captures
already showed everything we needed. Fixing the zoom script is low
priority and will take care of itself next time we rerun it.

## Screenshot manifest

See `manifest.json` for the list of full-page captures with captions
and URLs. `after/` contains the post-fix recaptures for comparison
against the corresponding numbered files in the root screenshots dir.

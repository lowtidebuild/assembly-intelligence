# Walkthrough Findings — 2026-04-11 (legislator importance lane)

Full visual walkthrough of the app via `scripts/walkthrough.ts`.
17 pages re-captured after the legislator importance release, plus
`screenshots/after/*.png` comparison captures and refreshed static
examples.

## What passes

All 6 dashboard pages + login + setup wizard + all 5 wizard steps
render correctly with no layout breaks, no ghost components, and no
obvious UX gaps. The ParlaWatch variant-C aesthetic is maintained
throughout. Korean text wraps and spaces correctly.

Specific highlights:
- **01-03 login flow** — branded, error state visible in red
- **04 briefing** — proposer name now carries S/A/B importance star
- **05-06 radar** — table, filter chips, URL-driven sort all work
- **07 radar slide-over** — proposer star + legislator deep-link visible
- **08-09 impact page** — bill picker + analysis shell with real editors
- **10 assembly hemicycle** — 295 seats rendering with party legend +
  importance outline rings
- **11 watch** — S/A recommendation cards + hemicycle picker +
  legislator profile slide-over
- **12 settings** — 4 cards with profile, env status, sync logs
- **13-16 setup wizard** — all 5 steps, edit mode works, step indicator
  shows completion state properly
- **17 logout** — cookie cleared, back to login

## Resolved from previous run

### P0 — Stub artifacts leaking into rendered UI (resolved)

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

### P1 — News rail surfaced industry-wide noise over bill-linked signal (resolved)

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

## Issues found + fixed in this release

### P0 — Client pages imported server-only importance logic

**Symptom:** `/assembly` and `/watch` could render a blank shell in the
browser, and Playwright walkthroughs timed out waiting for `svg circle`
even though the HTTP response itself was `200`.

**Root cause:** `LegislatorImportanceStar` is used inside the client
`Hemicycle` component, but it imported `importanceBadgeClass` from
`src/lib/legislator-importance.ts`. That file also imports `db`, so the
browser tried to execute `src/db/index.ts` and crashed with
`DATABASE_URL is not set`.

**Fix:** Split the UI-safe type and color helper into
`src/lib/legislator-importance-ui.ts`, then pointed the client
components at that file. Rebuilt, re-ran walkthrough, and confirmed
`/assembly` renders `358` SVG circles in Playwright before capture.

**Why it matters:** This was a real runtime regression on two of the
main pages, not just a screenshot script problem. Fixing the import
boundary restored the hemicycle, watch recommendations, and profile
slide-over flows.

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

<h1 align="center">ParlaWatch+</h1>

<p align="center">
  <strong>Legislative Intelligence Dashboard for Korean Industries</strong><br/>
  AI-powered bill tracking, legislator profiling, and automated daily GR/PA briefings
</p>

> This English page is based on the Korean README. The Korean README remains the default/canonical version: [README.md](./README.md)<br/>
> The app UI is currently available in Korean only.

---

> **TL;DR** — Full-stack legislative intelligence dashboard for Korean GR/PA teams. Syncs bills via MCP, scores with Gemini AI, generates daily briefings. 7 industry presets + 8 cross-law mixins (E-Commerce Act, Information Communications Network Act, Copyright Act, etc.) for precise watchlists, 295 legislator profiles, auto-sync twice daily. Next.js 15 + Neon Postgres + Gemini. [Non-developer setup guide (Korean)](./docs/setup-guide.md)

---

## Background

[ParlaWatch](https://github.com/lowtidebuild/parlawatch) started as a tool for monitoring Korean National Assembly YouTube broadcasts, especially parliamentary inspections and committee sessions. **ParlaWatch+** extends that philosophy into a **full legislative monitoring system tailored to specific industries**.

The core experience is simple: when your team opens the dashboard in the morning, you should immediately see the bills, lawmakers, transcript mentions, public notices, and press releases that matter to your industry in one connected workflow. The current app runs against the latest upstream `full` profile, and `/settings` also shows readiness for `research_data`, `assembly_org(type=lawmaking)`, and `get_nabo`.

**One-line summary**: when you arrive at work each morning, the dashboard tells you which new bills may affect your industry, with AI doing the first round of triage.

## Screenshots

### Briefing Bot — the morning starting point

![Briefing Bot](./screenshots/04-briefing.png)

Gemini-scored key bill cards and proposer importance badges (S/A/B). The right side shows a daily briefing written by Gemini Pro plus bill-related news pulled from Naver News.

### Legislative Radar — bill tracking table

![Legislative Radar](./screenshots/07-radar-slide-over.png)

A filterable bill table with a slide-over detail panel. AI summary, importance judgment, company impact editor, and legislator profile deep links all live on one screen.

### Bill Impact Analyzer — deep analysis with Gemini Pro

![Impact Analyzer](./screenshots/09-impact-selected.png)

Selecting a bill produces a structured five-section analysis: executive summary, key provisions, operational/financial/compliance impact, likelihood of passage, and recommended actions.

### Assembly Overview — seat map for all 295 members of the 22nd Assembly

![Assembly Overview](./screenshots/10-assembly.png)

A three-sector hemicycle based on the real plenary seating layout. Seat brightness reflects industry importance, and clicking a seat opens the member profile.

### Legislator Watch — automatic recommendations plus profiles

![Legislator Watch](./screenshots/11-watch.png)

Automatic S/A-tier legislator recommendations. Each member page shows Chinese-character name, constituency, committee assignments, aides, career summary, and recent primary-sponsored bills.

### Transcripts — full text plus keyword speech tracking

![Transcripts](./screenshots/18-transcripts.png)

Stores full plenary and committee transcripts, then highlights only the speeches mentioning industry keywords. You can also inspect session title, timestamp, speaker, and deep links into the original text.

### Setup Wizard — five-step onboarding

![Setup Wizard](./screenshots/13-setup-step2.png)

Industry preset + related law mixins -> keyword editing -> committee selection -> legislator selection -> final review. A game company can monitor Game Industry Act alongside the E-Commerce Act and Information Communications Network Act by checking multiple law mixins directly on Step 1. You can download the project and customize it for your own industry.

---

## Core Features

<table>
<tr>
<td width="50%">

### Automatic sync
Runs automatically every day at 06:30 and 18:30 KST via Vercel Cron.
Bill collection from MCP -> Gemini Flash scoring -> briefing generation -> news collection.

### Seven industry presets + eight law mixins
| Industry | Keywords | Committees |
|---|---|---|
| Game | 20 | 4 |
| Information Security | 15 | 3 |
| Bio | 15 | 4 |
| Fintech | 15 | 3 |
| Semiconductor | 12 | 3 |
| E-commerce | 15 | 4 |
| Artificial Intelligence | 15 | 4 |

On top of the industry preset, **cross-law mixins** (E-Commerce Act, Fair Labeling Act, Information Communications Network Act, Personal Information Protection Act, Copyright Act, E-Sports Promotion Act, Youth Protection Act, Contents Industry Promotion Act) can be toggled via checkboxes. A game company can track "Game + E-Commerce Act + Info. Comm. Network Act" from a single profile. Manual input also supported. Every field editable.

</td>
<td width="50%">

### Legislator importance tiers: S/A/B
Automatically calculated from committee relevance, primary-sponsored bills in the last 180 days, whether the member is chair or ranking member, and any manual watch flags. The same scoring logic is reused across five pages.

### Gemini AI analysis
- **Flash**: bill score (1-5) + 2-3 sentence summary during sync
- **Pro**: daily briefing HTML + first-draft company impact notes + five-section deep analysis on demand

### Legislator profiles
All 295 current members of the 22nd National Assembly. Stable tracking based on `MONA_CD`. Includes Chinese-character name, English name, email, office, aides, biography, and related bills.

</td>
</tr>
</table>

---

## Tech Stack

| Area | Technology |
|---|---|
| **Frontend** | Next.js 15 App Router, React 19, Tailwind CSS v4, TypeScript 5 |
| **Database** | PostgreSQL (Neon, HTTP driver), Drizzle ORM |
| **AI** | Gemini 2.5 Flash (scoring), Gemini 3.1 Pro (briefing, deep analysis) |
| **Data Source** | [assembly-api-mcp](https://github.com/hollobit/assembly-api-mcp) (MCP Streamable HTTP, configurable `full` profile) |
| **News** | Naver News Search API |
| **Hosting** | Vercel (App + Cron), Neon (DB) |
| **Auth** | HMAC-signed cookie (Edge middleware, 7-day session) |

---

## Quick Start

> Detailed guide for non-developers (Korean): [docs/setup-guide.md](./docs/setup-guide.md)

### 1. Environment variables

Create a `.env.local` file and fill in the following keys:

```bash
DATABASE_URL=postgresql://...          # Neon (pooled)
DATABASE_URL_UNPOOLED=postgresql://...  # Neon (direct)
ASSEMBLY_API_MCP_KEY=...               # assembly-api-mcp API key
ASSEMBLY_API_MCP_BASE_URL=...          # optional, self-hosted MCP URL
MCP_PROFILE=full                       # optional, full recommended
GEMINI_API_KEY=...                     # Google AI Studio
NAVER_CLIENT_ID=...                    # Naver Developers
NAVER_CLIENT_SECRET=...                # Naver Developers
APP_PASSWORD=...                       # login password (any string)
```

`ASSEMBLY_API_MCP_KEY` is required for **live MCP-backed features** such as
`/setup`, manual or automated sync, and MCP capability probes. Some pages may open
without it when you are only reading from an already-populated local database, but
production should have the key configured.

If `ASSEMBLY_API_MCP_BASE_URL` is empty, the app uses the public upstream server (`assembly-api-mcp.fly.dev`). Optional sources such as `lawmaking` and `NABO` are controlled by **the target MCP server's own configuration**, not the app env. In other words, the server must already have credentials such as `LAWMKING_OC` and `NABO_API_KEY` configured before those sources become available.

### Operations check commands

```bash
pnpm ci:check          # typecheck + lint + test + build
pnpm preflight:schema  # verify required latest columns exist
pnpm smoke:postdeploy  # smoke-check core routes after production deploy
```

### 2. Install dependencies + run DB migrations

```bash
pnpm install
pnpm db:migrate   # local dev DB only
```

**Production deploys are not a manual `pnpm db:migrate` target.** After `git push origin main`, the Vercel build runs `pnpm deploy:migrate` → `pnpm build` automatically. Preview deploys (`VERCEL_ENV=preview`) skip migrations.

### 3. Start the server

```bash
pnpm dev    # http://localhost:3000
```

### 4. Configure an industry profile

Select an industry preset in `/setup` -> check related law mixins (optional) -> edit keywords/committees -> save.
Or use the CLI: `pnpm tsx scripts/seed-test-profile.ts game`

### 5. Run the first sync

```bash
pnpm tsx scripts/dry-run-morning-sync.ts   # ~45 sec, real Gemini calls
```

Return to `/briefing` to see live data.

---

## Want to use it for another industry?

You do not need to change a single line of code. The runtime profile is injected into every Gemini prompt.

1. Pick a preset in `/setup` (or enter one manually)
2. Check related law mixins (optional) — reuse cross-industry law keyword sets
3. Edit keywords, committees, and LLM context
4. Save -> starting from the next sync, the app begins collecting bills for that industry

Current presets: [`src/lib/industry-presets.ts`](./src/lib/industry-presets.ts)
Law mixins: [`src/lib/law-mixins.ts`](./src/lib/law-mixins.ts) · Shared keyword blocks: [`src/lib/law-keyword-blocks.ts`](./src/lib/law-keyword-blocks.ts)

---

## Project Structure

```text
src/
├── app/
│   ├── (dashboard)/          # six dashboard pages
│   │   ├── briefing/         # briefing bot
│   │   ├── radar/            # legislative radar
│   │   ├── impact/           # impact analyzer
│   │   ├── watch/            # legislator watch
│   │   ├── assembly/         # assembly overview
│   │   └── settings/         # settings
│   ├── setup/                # five-step setup wizard
│   └── api/                  # cron, bills, auth, setup
├── components/               # hemicycle, slide-overs, wizard, etc.
├── services/                 # sync orchestrator, news collection
├── lib/                      # MCP client, Gemini, presets, auth
└── db/                       # Drizzle schema (12 tables)
```

---

## Operating Cost

| Service | Cost | Notes |
|---|---|---|
| Neon Postgres | **Free** | Free tier, scale-to-zero |
| Vercel | **Free** | Hobby plan, two cron runs/day |
| Gemini AI | **~$2-3/month** | Flash scoring + Pro briefing |
| Naver News | **Free** | 25,000 calls/day (currently ~20/day used) |
| assembly-api-mcp | **Free** | Community MCP server |

**Practical monthly cost: about $2-3 (Gemini only)**

---

## Known Constraints

- **MCP cold start**: the `assembly-api-mcp` server can take 60-90 seconds to wake up. Vercel Cron helps keep it warm.
- **No bill body text**: the MCP source does not expose proposal reasons or key contents. Scoring is based on bill title, committee, and sponsor only.
- **Optional source readiness varies by MCP server**: the public upstream server exposes the `full` profile tool list, but sources such as `lawmaking` and `NABO` may still be disabled if the target MCP server does not have separate credentials configured. The app surfaces that status as-is in `/settings` and `/api/mcp/capabilities`.

---

## License

Apache License 2.0 — [LICENSE](./LICENSE)

---

## Credits

This project is built on top of the following open source tools and services:

| | |
|---|---|
| **MCP Data** | [@hollobit](https://www.threads.com/@hollobit) / [assembly-api-mcp](https://github.com/hollobit/assembly-api-mcp) |
| **Design Inspiration** | [ParlaWatch](https://github.com/lowtidebuild/parlawatch) |
| **AI Engine** | Google Gemini 2.5 Flash / 3.1 Pro |
| **News Source** | Naver News Search API |
| **Developer Tools** | [Claude Code](https://claude.ai/code) + [OpenAI Codex](https://openai.com/codex) |

---

<p align="center">
  <sub>Each morning, AI helps your team understand which new bills may affect your industry.</sub>
</p>

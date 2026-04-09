# 🔖 다음에 이어서 작업하기 위한 기록

**마지막 작업일:** 2026-04-10
**현재 상태:** **Lane A scaffolding 진행 중** — DB + 프리셋 완료, MCP client 동작 검증됨, sync.ts는 실제 MCP API와 맞게 재작성 필요.
**프로젝트:** 산업별 국회 인텔리전스 대시보드 (Assembly Intelligence Dashboard) — "ParlaWatch+"

---

## 🚀 다음 세션 시작 방법

```
RESUME.md 읽고 이어서
```

### 사전 작업 없음
`.env.local`은 이미 8개 변수로 채워져 있고 Neon DB에 12 tables migrated. 바로 이어가기.

### Production용 키 관리 (나중에)
같은 변수 이름으로 GitHub Secrets + Vercel Env Vars에 등록.
코드는 `process.env.*`만 읽으면 환경별로 알아서 동작. Vercel 배포 시 `CRON_SECRET` 추가 필요 (Vercel이 자동 생성 가능).

---

## 📍 2026-04-10 세션에서 한 일

### ✅ 부트스트랩 완료 (commit `e2fd3d5`)
- Next.js 15.5.15 + React 19 + Tailwind 4 + TypeScript 5.9
- src/ 디렉토리 구조
- 모든 runtime deps: Drizzle, Neon, MCP SDK, Gemini, TanStack Table, Radix, Lucide
- 모든 dev deps: Vitest, Playwright, drizzle-kit
- pnpm `onlyBuiltDependencies` approved
- ParlaWatch 토큰 적용된 `globals.css` (light/dark)
- `src/lib/utils.ts` (cn helper)

### ✅ Lane A DB schema + 산업 프리셋 (commit `ade2822`)
- **design.md 대규모 업데이트:** Level 2 specialization, hemicycle, 국회 현황 페이지, 12 tables
- **12 tables migrated to Neon** (Singapore):
  industry_profile, industry_committee, industry_legislator_watch,
  legislator, bill, bill_timeline, vote, news_article, alert,
  daily_briefing, relevance_override, sync_log
- **7 산업 프리셋** (src/lib/industry-presets.ts):
  게임, **정보보안/사이버시큐리티**, 바이오, 핀테크, 반도체, 이커머스, AI
  - 각각 keywords (10-30개) + suggested_committees + llm_context (200-400 words)
  - **의원은 프리셋에 없음** — 사용자가 hemicycle UI로 동적 선택
- `src/db/schema.ts` (520 lines), `src/db/index.ts` (Neon HTTP driver)

### 🟡 Lane A MCP client + sync service (미커밋)
- **MCP client 동작 검증됨** — `/api/health` returns `ok: true` with mcp latency ~319ms
- **Transport 발견:** SSE가 아니라 **Streamable HTTP** (MCP 1.x)
  - `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk/client/streamableHttp.js`
  - per-call connection pattern + p-limit(5) rate limiter
- `src/lib/api-base.ts` — withRetry, NonRetryableError, sleep
- `src/lib/mcp-client.ts` — callMcpTool, listMcpTools, pingMcp
- `src/lib/cron-auth.ts` — CRON_SECRET 검증 (dev mode bypass)
- `src/lib/gemini-stub.ts` — Lane B 임시 placeholder
- `src/services/sync.ts` — 오케스트레이터 작성됨, but **MCP tool 이름이 틀림** (아래 참조)
- `src/app/api/cron/sync-morning/route.ts` — Vercel Cron endpoint
- `src/app/api/cron/sync-evening/route.ts` — Vercel Cron endpoint
- `src/app/api/health/route.ts` — DB + MCP health check
- `vercel.json` — cron schedule: 21:30 UTC + 09:30 UTC

### 🔴 중요 발견: MCP API 실제 구조가 design.md 가정과 다름

**실제 MCP 서버 (assembly-api-mcp)는 6개 tools만 노출:**
- `assembly_member` — 의원 검색/분석/정당통계
- `assembly_bill` — 법안 검색/추적/상세 (bill_id 전달 시)
- `assembly_session` — 일정/회의록/표결
- `assembly_org` — 위원회/청원/입법예고
- `discover_apis` — 276 API 탐색
- `query_assembly` — API 코드 직접 호출 (범용 escape hatch)

**응답 필드가 한글:** `의안ID`, `의안명`, `제안자`, `소관위원회`, `제안일` 등

**핵심 문제:**
- `assembly_bill` search 응답에 `제안이유`/`주요내용` 없음 → Gemini 스코어링 위해 `bill_id`로 **2차 호출** 필요 (검증 필요)
- `assembly_member`에 `member_id` 없음 → primary key 전략 변경 필요
- `legislator.committees[]` 배열도 MCP가 안 줌 → aggregation 필요

**전체 분석:** [docs/mcp-api-reality.md](docs/mcp-api-reality.md) (실제 응답 샘플 + 필드 매핑 + schema 조정 필요 목록 포함)

---

### ⚡ 이전 세션 (2026-04-09) 요약

#### /plan-design-review 완료 (5/10 → 8/10)
- ParlaWatch HTML 대시보드를 시각적 베이스로 채택 (Bloomberg Terminal 방향 폐기)
- Variant C 선택: 240px 좌측 사이드바 + 2-column 워크스페이스
- **GR/PA 실제 엑셀표 발견** — "당사 영향 사항" 컬럼 누락 발견
- 입법 레이더 = 엑셀의 웹 버전 (테이블 기본 + 카드 토글)
- 슬라이드오버 패널 (500px right) for 법안 상세
- 인터랙션 상태 테이블 (loading/empty/error/success/partial × 6 features)
- 모바일은 브리핑봇만 반응형
- **승인된 목업:** `~/.gstack/projects/assembly-intelligence/designs/briefing-bot-20260408/variant-C.png`

### ✅ /plan-eng-review 완료 (round 2, 6 issues, all clean)
- Sync 전략 변경: 2-hourly → **2x daily** (06:30 + 18:30 KST), Vercel Hobby 호환
- 데이터 모델: 누락된 3개 테이블 추가 (NewsArticle, RelevanceOverride, SyncLog)
- 아키텍처 다이어그램 업데이트 (Slack 제거, 새 API 엔드포인트 표시)
- 새 API 엔드포인트 2개:
  - `POST /api/bills/[id]/generate-impact` (Gemini Pro, ~2초)
  - `PATCH /api/bills/[id]/impact` (수동 저장)
- 슬라이드오버 패널 데이터: sync 시 미리 요약 + 심층 분석만 on-demand
- 테스트 플랜 업데이트: **35 test cases** (28 unit + 2 eval + 5 E2E)
- **Slack 전면 제거** (회사가 API 미지원)

### ✅ 환경 설정 파일 생성
- `.env.example` — 변수 이름 + 발급 링크 템플릿
- `.gitignore` — `.env*.local` 보호

---

## 🔒 design.md 최종 결정 요약

| 항목 | 결정 | 이유 |
|------|------|------|
| **테마** | 라이트 기본 + 다크 토글 | ParlaWatch 일치, 사용자 선호 |
| **레이아웃** | Variant C (사이드바 + 2-column) | 파워 유저 워크플로우 |
| **입법 레이더** | 테이블 기본 + 카드 토글 | 엑셀 워크플로우 대체 |
| **당사 영향 사항** | editable 필드 + AI 초안 토글 | 전문가 판단 + 시간 절약 |
| **중요도** | 내부 1-5 + UI S/A/B/C 병기 | 엑셀 호환 + LLM 친화 |
| **법안 상세** | 슬라이드오버 패널 (500px) | 컨텍스트 유지 |
| **알림** | 대시보드만 (in-app) | Slack API 미지원 |
| **Sync 주기** | 2x daily (06:30 + 18:30) | Vercel Hobby 호환 |
| **모바일** | 브리핑봇만 반응형 | 사내 도구, 데스크탑 위주 |

---

## 🗺️ 구현 시작 시 따를 순서

다음 세션에서 코드 작성 시작:

### Step 0: 프로젝트 부트스트랩 (10분)
```bash
cd "/Users/lowtidebuild/코딩 프로젝트/assembly-intelligence"
bunx create-next-app@latest . --typescript --tailwind --app --no-src-dir --eslint
# .env.local이 이미 있으면 next-app이 안 건드림
```

### Step 1-7: 4개 lane 병렬 실행
이전 eng review에서 확정된 4개 병렬 lane:
- **Lane A (sequential):** DB 스키마 + 설정 마법사 → MCP 클라이언트 + sync → 통합
- **Lane B (parallel):** Gemini 클라이언트 + 프롬프트
- **Lane C (parallel):** 대시보드 UI 컴포넌트 (mock 데이터로 스캐폴딩)
- **Lane D (parallel):** Naver News 클라이언트

Lane B/C/D는 동시 시작 가능. Lane A 완료 후 Step 7에서 wire up.

---

## 📂 핵심 파일 위치

### 프로젝트 루트
- `design.md` — **메인 사양서 (always read first)**
- `RESUME.md` — 이 파일
- `.env.example` — 환경 변수 템플릿
- `.gitignore`
- `assembly-intelligence-brainstorm.md` — 초기 브레인스토밍 (참고용)
- **`docs/mcp-api-reality.md`** — 실제 MCP 서버 스키마 분석 (2026-04-10)
- **`src/db/schema.ts`** — 12 tables Drizzle schema
- **`src/lib/industry-presets.ts`** — 7 산업 프리셋
- **`src/lib/mcp-client.ts`** — Streamable HTTP MCP wrapper (동작 검증됨)
- **`src/services/sync.ts`** — 오케스트레이터 (실제 API와 맞게 재작성 필요)
- **`vercel.json`** — Cron schedules

### gstack 프로젝트 데이터 (`~/.gstack/projects/assembly-intelligence/`)
- `lowtidebuild-unknown-design-20260407-221000.md` — 디자인 doc 원본 복사본
- `lowtidebuild-unknown-eng-review-test-plan-20260409-*.md` — 최신 테스트 플랜 (35 cases)
- `designs/briefing-bot-20260408/variant-C.html` — 승인된 목업 HTML
- `designs/briefing-bot-20260408/variant-C.png` — 승인된 목업 스크린샷
- `learnings.jsonl` — 누적 학습 (12+ entries)
- `timeline.jsonl` — 세션 타임라인
- `unknown-reviews.jsonl` — 리뷰 로그

---

## 🎯 다음 세션 우선순위

### 1순위: sync.ts를 실제 MCP API에 맞게 재작성 (30-60분)
1. `scripts-sample-mcp.mjs` 스타일로 더 많은 샘플 호출:
   - `assembly_bill({ bill_id: <id> })` → 상세 응답에 `제안이유`/`주요내용` 있는지 확인
   - `assembly_session({ type: "schedule", date_from: <today> })` → 일정 응답 구조
   - `assembly_org({ type: "committee", include_members: true })` → 위원회 구성
2. `docs/mcp-api-reality.md` 업데이트
3. `src/services/sync.ts` 재작성:
   - tool 이름: `assembly_bill`, `assembly_member`, `assembly_session`
   - 한글 필드 → 영어 schema 필드 매핑 함수
   - 2-phase bill fetch (search → bill_id detail) 구현
4. `src/db/schema.ts` 조정:
   - `legislator.member_id` 전략 변경 (composite key or 제거)
   - `name_hanja`, `profile_image_url` 제거 고려 (MCP가 안 줌)
5. `pnpm db:generate` → 새 migration → `pnpm db:migrate`
6. `/api/cron/sync-morning` 직접 호출해서 dry-run 성공 확인

### 2순위: Lane B — Gemini client (30-45분)
- `src/lib/gemini-client.ts` — `@google/genai` SDK 사용
- `src/lib/prompts/relevance-scoring.ts`
- `src/lib/prompts/bill-summary.ts`
- `src/lib/prompts/daily-briefing.ts`
- `src/lib/prompts/company-impact.ts`
- `src/lib/prompts/bill-analysis.ts`
- `gemini-stub.ts` → 실제 Gemini 호출로 교체
- sync cron에서 stub import 제거

### 3순위: Lane C — UI scaffolding (1-2시간)
- `src/components/sidebar.tsx` (ParlaWatch 토큰, 6 nav items)
- `src/app/(dashboard)/layout.tsx` — sidebar + main 레이아웃
- `src/app/(dashboard)/briefing/page.tsx` — Variant C 구조
- `src/app/(dashboard)/radar/page.tsx` — TanStack Table + slide-over
- `src/app/(dashboard)/watch/page.tsx` — (reuse hemicycle)
- `src/app/(dashboard)/impact/page.tsx`
- `src/app/(dashboard)/assembly/page.tsx` — **국회 현황 (hemicycle)**
- `src/app/(dashboard)/settings/page.tsx`
- **`src/components/hemicycle.tsx`** — 재사용 가능한 의석도 SVG 컴포넌트 (키 컴포넌트)

### 4순위: Setup wizard + Auth middleware
- `src/app/setup/page.tsx` (5 steps: industry → keywords → committees → legislators via hemicycle → confirm)
- `src/middleware.ts` — shared password gate

### 5순위: Lane D — Naver News + API routes + Tests
- `src/lib/news-client.ts`
- `src/app/api/bills/[id]/generate-impact/route.ts`
- `src/app/api/bills/[id]/impact/route.ts`
- Vitest 유닛 테스트 + Playwright E2E

---

## 📋 지금까지 진행한 작업 전체 로그

### ✅ 1. `/office-hours` — 완료 (2026-04-07)

**목표:** 국회 인텔리전스 대시보드의 product design doc 작성

**진행 내용:**
- 모드: Startup / Intrapreneurship (사내 프로젝트)
- 실제 수요 확인: 현재 사내에 수동으로 입법 업데이트를 취합하는 전담 GR/PA 담당자가 존재
- 다섯 번에 걸친 질문으로 문제 정의 (Demand, Status Quo, Target User, Narrowest Wedge)
- 네이밍: "산업별 국회 인텔리전스 대시보드"
- 다섯 개 컴포넌트를 하나의 프로덕트로 통합 결정 (전단계 대시보드 비전 고수)
- 첫 세션에서 A~D 네 개만 있었는데, 중간에 **E. 관련 뉴스 (Related News)** 추가
  - "웹검색으로 법안 관련 뉴스도 같이 보여주면 도움되지 않을까?"
- LLM을 Claude → Gemini로 변경 (사용자 요청: 가성비)
  - "Claude Code 기반 에이전트가 아닌데 반드시 Anthropic model 만 써야 하는건 아닐거 같은데..Gemini가 가성비 좋아서..Gemini 쓰고 싶은데?"
- 디자인 중요성 강조: "정교한 프론트 엔드 디자인이 중요할듯 함"

**어드버서리얼 리뷰:** 2라운드 (17개 이슈 → 12개 수정 → 5개 Reviewer Concerns로 남음)

**Cross-model 챌린지:** Claude 서브에이전트가 "4개 컴포넌트 전체 출시" 전제를 두 번 공격했지만, 사용자가 두 번 모두 방어 (사내 greenlight 데모 맥락 때문)

**산출물:**
- `design.md` (프로젝트 루트) — Status: APPROVED
- `~/.gstack/projects/assembly-intelligence/lowtidebuild-unknown-design-20260407-221000.md` (gstack 복사본)

---

### ✅ 2. `/plan-eng-review` — 완료 (CLEARED, 2026-04-08)

**목표:** 아키텍처, 코드 품질, 테스트, 성능 전반에 대한 엔지니어링 리뷰

**Step 0: Scope Challenge**
기술 스택에서 불필요한 복잡도 제거:
- ❌ SQLite 옵션 → ✅ PostgreSQL만 (Neon)
- ❌ 이메일 알림 (Resend) → ✅ Slack only
- ❌ self-hosted 옵션 → ✅ Vercel만
- 제품 기능은 하나도 줄이지 않고 기술적 결정 branch만 단순화

**Section 1: Architecture (4개 이슈 해결)**

1. **MCP transport 선택** — SSE 기반인데 Vercel serverless 타임아웃 문제
   - 선택: Per-call connection (connect, call one tool, close). 500ms 오버헤드 수용

2. **Vercel Cron 제한** — Hobby는 하루 1회가 최소
   - 사용자 결정: "걍 하루 1회 정도만 되도 충분하지 않을까?"
   - 결과: Vercel Hobby plan으로 충분, 복잡도 대폭 감소

3. **누락된 데이터 모델 테이블** — 3개 추가
   - `NewsArticle` (뉴스 캐시)
   - `RelevanceOverride` (피드백 루프)
   - `SyncLog` (싱크 디버깅)
   - 총 10개 테이블

4. **아키텍처 다이어그램 오류** — Claude → Gemini, DB 위치, Component E 누락
   - 수정된 다이어그램으로 교체 완료

**Section 2: Code Quality (2개 이슈 해결)**

5. **모듈 구조 확정**
```
src/
  lib/
    mcp-client.ts      (MCP 연결 팩토리)
    gemini-client.ts   (Gemini API 래퍼)
    news-client.ts     (Naver News API 래퍼)
    api-base.ts        (공통 retry/error)
  lib/prompts/
    relevance-scoring.ts
    daily-briefing.ts
    bill-analysis.ts
  services/
    sync.ts            (Cron sync 오케스트레이터)
    alert.ts           (Slack webhook 전송)
    briefing.ts        (일일 브리핑 생성기)
  app/
    (dashboard)/       (Next.js 페이지)
    api/               (Route 핸들러)
```

6. **프롬프트 관리** — `src/lib/prompts/` 하위에 role별 파일 분리
   - 프롬프트 변경은 로직 수정 없이 한 파일만 수정

**Section 3: Test Review — 32개 코드 경로 추적**

완전한 테스트 플랜 확정:
- 21개 unit 테스트
- 2개 eval 스위트 (Gemini 품질 검증)
- 3개 E2E 스펙 (Playwright)

**Section 4: Performance (1개 이슈 해결)**

7. **Gemini 호출 최적화** — 50-200개 법안을 매번 스코어링하는 건 비용+지연 문제
   - 선택: 키워드 pre-filter (~80% 감소) + parallel 스코어링 (p-limit, concurrency 10)

**Outside Voice (Claude 서브에이전트) — 3개 tension 해결**

8. **Neon free tier 콜드 스타트** — 5분 유휴 후 scale-to-zero
   - 선택: MVP에서는 수용 (첫 로드 2-3초)

9. **Google Custom Search 할당량** — free는 100 queries/day뿐
   - 선택: **Naver News Search API**로 변경 (25,000 calls/day 무료, 한국어 최적화)

10. **Open Questions는 질문이 아니라 블로커** — 산업/API 키/Slack 없으면 핵심 가치 루프 검증 불가
    - 사용자 인지하고 수락

**TODOS 2개 모두 빌드 플랜에 포함:**
- MCP connection rate limiter (5 connections/second 안전판)
- 데이터 신선도 표시기 UI ("Last synced: 2026-04-08 06:30 KST")

**병렬화 전략:** 4개 lane (3개 parallel + 1개 sequential)

**산출물:**
- 업데이트된 `design.md` (아키텍처 다이어그램, 테크스택, 의존성 수정)
- `~/.gstack/projects/assembly-intelligence/lowtidebuild-unknown-eng-review-test-plan-20260408-000100.md`

---

### ⏸️ 3. `/plan-design-review` — 진행 중 (Step 0.5 직전 일시중지)

**목표:** 디자이너의 눈으로 UI/UX 갭을 찾아 플랜에 디자인 결정 추가

**진행된 부분:**
- Pre-review 시스템 감사 완료
- DESIGN.md 없음 확인 (갭으로 플래그)
- UI 분류: **APP UI** (workspace-driven, data-dense, task-focused)
- 초기 디자인 점수: **5/10**
- 주요 갭 식별:
  1. 스크린별 레이아웃 명세 없음
  2. 인터랙션 상태 (loading/empty/error) 미정의
  3. 실제 비주얼 목업 없음
- 사용자가 "full 7-pass 리뷰" 선택

**중단된 위치:** Step 0.5 (비주얼 목업 생성) 시작 직전

**남은 작업:**
1. **Step 0.5: Visual Mockups** — gstack designer로 5개 대시보드 페이지 목업 생성
   - 메인 (브리핑봇)
   - 입법 레이더
   - 의원 워치
   - 법안 영향 분석기
   - 관련 뉴스 (사이드바 컴포넌트)
   - 설정 마법사 + 로그인 페이지

2. **Pass 1: Information Architecture** — 무엇을 먼저/중간/나중에 보여줄지

3. **Pass 2: Interaction State Coverage** — loading/empty/error/success/partial 상태 테이블

4. **Pass 3: User Journey & Emotional Arc** — GR/PA 담당자의 일상 워크플로우 맵핑

5. **Pass 4: AI Slop Risk** — 제네릭 SaaS 카드 그리드 패턴 방지

6. **Pass 5: Design System Alignment** — DESIGN.md 갭, shadcn/ui 재사용 전략

7. **Pass 6: Responsive & Accessibility** — 데스크톱 우선이지만 랩탑 대응, 키보드 내비, 스크린 리더

8. **Pass 7: Unresolved Design Decisions** — 구현 중에 발목 잡을 애매한 결정들

---

## 🔒 주요 결정사항 정리

| 항목 | 결정 | 이유 |
|------|------|------|
| **컴포넌트 범위** | 5개 전체 (A+B+C+D+E) Day 1 출시 | 사내 greenlight 데모는 시각적 임팩트 필요 |
| **LLM** | Gemini (Flash + Pro) | 가성비, 한국어 성능 양호 |
| **뉴스 API** | Naver News Search | 25,000 calls/day 무료 (vs Google 100/day) |
| **호스팅** | Vercel (Hobby로 충분) | 복잡도 감소, 무료 |
| **데이터베이스** | PostgreSQL (Neon 무료) | 콜드 스타트 수용 |
| **알림** | Slack webhook only | 이메일은 post-greenlight |
| **싱크 주기** | 하루 1회 | 사용자 결정, 시간당 싱크 불필요 |
| **MCP transport** | Per-call connection | SSE를 short-lived로 사용 |
| **인증** | 공유 패스워드 게이트 | SSO는 post-greenlight |
| **프론트엔드** | Next.js 15 App Router + Tailwind + shadcn/ui | "Bloomberg Terminal meets Vercel Dashboard" |
| **디자인 토큰** | #0A0F1E 배경, #3B82F6 accent, Pretendard/Inter, 14px base | Dark theme 기본 |

---

## 📂 관련 파일 위치

### 프로젝트 디렉토리 (`/Users/lowtidebuild/코딩 프로젝트/assembly-intelligence/`)
- `assembly-intelligence-brainstorm.md` — 초기 브레인스토밍 (2026-04-07)
- `design.md` — **승인된 디자인 문서 (이게 메인 사양서)**
- `RESUME.md` — 이 파일

### gstack 프로젝트 디렉토리 (`~/.gstack/projects/assembly-intelligence/`)
- `lowtidebuild-unknown-design-20260407-221000.md` — 디자인 문서 gstack 복사본
- `lowtidebuild-unknown-eng-review-test-plan-20260408-000100.md` — 테스트 플랜
- `checkpoints/checkpoint-20260408-design-review-pending.md` — 상세 체크포인트
- `learnings.jsonl` — 이 프로젝트에서 축적된 학습들
- `timeline.jsonl` — 세션 타임라인

---

## 🎯 블로커 해결 후 실제 구현 순서

### 병렬로 가능한 작업 (Lane B, C, D)
- **Lane B:** `src/lib/gemini-client.ts` + `src/lib/prompts/` — Gemini 클라이언트 + 프롬프트
- **Lane C:** `src/app/(dashboard)/` — 순수 UI 컴포넌트 (mock 데이터로 스캐폴딩)
- **Lane D:** `src/lib/news-client.ts` + `src/services/alert.ts` — Naver News + Slack

### Sequential 작업 (Lane A)
1. DB 스키마 + 설정 마법사 (`src/db/`, `src/app/setup/`)
2. MCP 클라이언트 + sync 파이프라인 (`src/lib/mcp-client.ts`, `src/services/sync.ts`)
3. 모든 것을 연결 (`src/services/`, `src/app/api/`)

### 최종 병합
모든 lane을 merge 후 Step 7에서 wire up

---

## 🔧 기술 스택 (확정)

```
Frontend:   Next.js 15 (App Router) + Tailwind CSS + shadcn/ui
Database:   PostgreSQL (Neon 무료) via Drizzle ORM
Hosting:    Vercel (Hobby plan)
LLM:        Gemini API (gemini-2.5-flash + gemini-2.5-pro)
MCP:        @modelcontextprotocol/sdk (per-call SSE)
News:       Naver News Search API
Alerts:     Slack Webhook
Cron:       Vercel Cron (하루 1회)
Auth:       공유 패스워드 게이트
CI/CD:      GitHub Actions
```

---

## 💡 The Assignment (꼭 코드 작성 전에!)

**코드를 작성하기 전에 GR/PA 담당자 옆에서 2시간 동안 실제 워크플로우를 관찰할 것.**

관찰할 것:
- 어떤 웹사이트를 가장 먼저 체크하는가?
- 법안의 관련도를 어떻게 판단하는가?
- 아웃풋 리포트의 포맷은?
- "이걸 먼저 알았더라면" 하고 바라는 정보는?

이 관찰이 Gemini 프롬프트, 브리핑 포맷, 대시보드 레이아웃을 어떤 아키텍처 문서보다 더 날카롭게 만들 것.

---

## 📞 다음 세션 시작 시 체크리스트

- [ ] 블로커 3개 해결됨? (산업, API 키, Slack)
- [ ] GR/PA 담당자 옵저베이션 완료?
- [ ] `RESUME.md` + `design.md` 두 파일 읽기
- [ ] `/plan-design-review` 재실행
- [ ] Step 0.5부터 이어서 진행 (비주얼 목업 → 7개 리뷰 패스)
- [ ] 디자인 리뷰 완료 후 실제 구현 시작

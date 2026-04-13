# MCP API Reality Check — assembly-api-mcp

Captured: 2026-04-10 via live server inspection.
**Updated:** 2026-04-13 with upstream `v0.7.0` README/CHANGELOG 확인 + 실제
`profile=full` MCP tool listing 재검증.
이전 샘플 응답 업데이트는 2026-04-10 (part 2) 기준이며,
`scripts/sample-mcp.ts` and `scripts/query-bill-detail-v2.ts`.
Raw JSON dumps are saved under `docs/mcp-samples/` for diff reference.

Server: `https://assembly-api-mcp.fly.dev` (github: hollobit/assembly-api-mcp)
Transport: **Streamable HTTP** (NOT SSE — this was a wrong assumption in
design.md v1; verified via server setup page at the base URL).

## 2026-04-13 delta

Upstream README / CHANGELOG 기준 최신 버전은 **`v0.7.0` (2026-04-12)** 입니다.

- `full` 프로필 도구 수: **11개**
- 실제 `profile=full` MCP `listTools()` 확인 결과:
  - `assembly_member`
  - `assembly_bill`
  - `assembly_session`
  - `assembly_org`
  - `discover_apis`
  - `query_assembly`
  - `bill_detail`
  - `committee_detail`
  - `petition_detail`
  - `research_data`
  - `get_nabo`
- `assembly_org(type="lawmaking")` 는 공개 upstream 인스턴스에서 현재
  `{"error":"LAWMKING_OC가 설정되지 않았습니다..."}` 로 응답
- `get_nabo(...)` 는 공개 upstream 인스턴스에서 현재
  `{"error":"NABO_API_KEY가 설정되지 않았습니다..."}` 로 응답

즉, **최신 도구 surface 자체는 배포돼 있지만**, optional data source는
대상 MCP 서버 환경변수 준비 여부에 따라 활성화/비활성화됩니다.

## Why this document exists

The original design.md was written assuming a particular set of MCP
tool names (`get_active_lawmakers`, `search_bills`, `get_bill_detail`)
that turned out to be hallucinated — the real server exposes a
completely different API surface. This doc captures ground truth so
sync.ts, schema.ts, and downstream code can align with reality.

## The 6 real tools

### `assembly_member`
국회의원 검색 및 분석.

**Parameters:**
| Name | Type | Notes |
|---|---|---|
| `name` | string | 의원 이름 (부분 일치) |
| `party` | string | 정당명 |
| `district` | string | 선거구명 |
| `committee` | string | 소속위원회명 (부분 일치) |
| `analyze` | boolean | true면 발의법안+표결 종합분석 포함 |
| `lang` | string | `en`이면 영문 API |
| `age` | number | 대수 (기본 22) |
| `page`, `page_size` | number | max 100 |
| `scope` | string | `current`(기본) / `history` |
| `mode` | string | `party_stats` |

**Response (mode=party_stats):**
```json
{
  "mode": "party_stats",
  "items": [
    {
      "POLY_GROUP_NM": "더불어민주당",  // 교섭단체
      "POLY_NM": "더불어민주당",         // 정당
      "N1": 152,                          // 지역구
      "N2": 8,                            // 비례
      "N3": 160,                          // 합계
      "N4": 54.24                         // 점유율 %
    },
    ...
  ]
}
```

**Response (committee search):**
```json
{
  "total": <int>,
  "returned": <int>,
  "items": [
    {
      "이름": "김교흥",
      "정당": "더불어민주당",
      "선거구": "인천 서구갑",
      "당선횟수": "3선",
      "당선방법": "지역구",
      "소속위원회": "문화체육관광위원회"
    }
  ]
}
```

⚠️ **Missing fields we expected:**
- No `member_id` (stable identifier). Need alternative primary key.
  Candidate: composite (name + party + district) — but party and
  district can theoretically change mid-term.
- No `committees` array (only one committee per row; a legislator
  serving on 2 committees will show twice).
- `당선횟수` is "3선" string — parse to integer.
- No profile image URL.
- No hanja name.

**Our schema.ts has fields (member_id, name_hanja, profile_image_url)
that we'll need to either populate via a secondary call, leave null,
or remove.**

### `assembly_bill`
국회 의안 검색, 추적, 분석.

**Parameters:**
| Name | Type | Notes |
|---|---|---|
| `bill_name` | string | 의안명 부분 일치 |
| `bill_id` | string | **상세 조회 모드** (전달 시 단일 bill 상세 반환) |
| `proposer` | string | 제안자 이름 |
| `committee` | string | 소관위원회명 |
| `status` | string | `all`/`pending`/`processed`/`recent` |
| `bill_type` | string | `alternative` (위원회안/대안) |
| `keywords` | string | 쉼표 구분, 트래킹 모드 |
| `mode` | string | `search`/`track`/`stats` |
| `include_history` | boolean | track 모드에서 심사이력 포함 |
| `age`, `page`, `page_size` | number | |

**Response (search):**
```json
{
  "total": <int>,
  "items": [
    {
      "의안ID": "PRC_I2I5R1P1P1O2P0N9N1V7U1U7S6T0S2",
      "의안번호": "2217868",
      "의안명": "게임산업진흥에 관한 법률 일부개정법률안",
      "제안자": "진종오의원 등 10인",
      "제안자구분": null,
      "대수": "22",
      "소관위원회": "문화체육관광위원회",
      "제안일": "2026-03-30",
      "처리상태": null,
      "처리일": null,
      "상세링크": "http://likms.assembly.go.kr/bill/billDetail.do?billId=PRC_...",
      "대표발의자": "진종오",
      "공동발의자": "박정훈,김용태,이양수,김상훈,이만희,최형두,..."
    }
  ]
}
```

⚠️ **Critical missing fields for Gemini scoring:**
- `제안이유` (proposal reason) — NOT in search response
- `주요내용` (main content) — NOT in search response

**Required workflow:** two-phase fetch.
1. Call `assembly_bill` with committee/bill_name/keywords to get list
2. For each bill we want to score, call `assembly_bill` again with
   `bill_id` to get full content

**Response (bill_id detail mode):** sampled 2026-04-10
```json
{
  "total": 1,
  "items": [
    {
      "의안ID": "PRC_...",
      "의안번호": "2218043",
      "의안명": "대중문화예술산업발전법 일부개정법률안",
      "제안이유": null,
      "주요내용": null,
      "LINK_URL": "https://likms.assembly.go.kr/bill/billDetail.do?billId=PRC_...",
      "의안문서_ZIP": "https://likms.assembly.go.kr/bill/bi/bill/detail/downloadDtlZip.do?billId=PRC_...",
      "공동발의자": [
        { "이름": "박성훈", "정당": "국민의힘", "대표구분": "대표발의" },
        { "이름": "고동진", "정당": "국민의힘", "대표구분": "" }
      ],
      "공동발의자_총수": 10,
      "심사경과": {
        "소관위원회": "문화체육관광위원회",
        "소관위_회부일": "2026-04-03",
        "소관위_상정일": null,
        "소관위_처리일": null,
        "소관위_처리결과": null,
        "법사위_회부일": null,
        "본회의_상정일": null,
        "본회의_의결일": null,
        "본회의_결과": null,
        "정부이송일": null,
        "공포일": null
      }
    }
  ]
}
```

🔴 **제안이유/주요내용 fields exist but are null for every bill we
sampled** (3 bills from 2026-03-30). Also confirmed via
`query_assembly` with candidate api_codes
(`OOWY4R001216HX11461` 의안 상세정보, `OOWY4R001216HX11462` 의안 심사정보,
`OOWY4R001216HX11440`/`11536` 의안정보 통합 API) — all return
`total: 0`. The MCP server does NOT expose bill body text at all.

**Options for Gemini scoring:**
1. **Title-only scoring** (recommended for MVP) — 의안명 alone is
   surprisingly high-signal for our use case ("게임산업진흥에 관한
   법률 일부개정법률안" is obviously in scope). Pair with 소관위원회
   and 대표발의자 for context. Document limitation in briefing UI.
2. **HTML scrape LIKMS** — fetch `LINK_URL`, parse HTML, extract
   proposal body. Adds dependency on HTML structure + ban risk.
3. **ZIP download + HWP parse** — `의안문서_ZIP` returns a ZIP with
   HWP files. No practical HWP parser in Node. Skip.

**Decision (2026-04-10):** go with option 1 for v0. Add `proposal_reason`
and `main_content` as nullable columns; populate when MCP starts
exposing them. Lane B Gemini prompts must work with just title +
committee + proposer.

🎯 **심사경과 is gold for stage tracking.** Stage can be derived from
timestamps:
- `소관위_회부일` set, no 상정 → stage 1 (회부)
- `소관위_상정일` set → stage 2 (소위심사)
- `소관위_처리일` set, 처리결과 = "원안가결"/"수정가결" → stage 3
- `법사위_회부일` set → stage 4
- `본회의_상정일` set → stage 5
- `본회의_결과` = "원안가결"/"수정가결" → stage 6 (가결)
- `공포일` set → stage 6+ (공포)

🎯 **공동발의자 array in detail mode includes 정당 per proposer** —
proposer party can be read directly from the entry where
`대표구분 === "대표발의"`. No cross-lookup needed.

**Field normalization required:**
- `의안ID` → our `bill_id` (primary external ID)
- `의안번호` → our internal reference (display)
- `의안명` → `bill_name`
- `대표발의자` → `proposer_name`
- `공동발의자`.split(",").length → `co_sponsor_count`
- `소관위원회` → `committee`
- `제안일` → `proposal_date` (parse YYYY-MM-DD)
- `상세링크` → `external_link`
- `처리상태` (nullable) → `status`
- **No party per-bill field** — 제안자구분 was null. Party needs
  joining from `assembly_member` or embedded in 제안자 string.

### `assembly_session`
국회 일정·회의록·표결.

**Parameters:**
| Name | Type | Notes |
|---|---|---|
| `type` | string | `schedule`/`meeting`/`vote` (auto-detect) |
| `date_from`, `date_to` | string | YYYY-MM-DD or YYYY |
| `meeting_type` | string | |
| `conf_id` | string | 회의록 ID |
| `include_explanations` | boolean | 제안설명서 포함 |
| `keyword` | string | |
| `committee` | string | |
| `bill_id` | string | vote 모드에서 의원별 표결 상세 |
| `vote_type` | string | |
| `age`, `page`, `page_size` | |

**Expected use for briefing bot:**
- `type=schedule&date_from=<today>&date_to=<today>&committee=...` →
  "오늘의 국회 일정" section
- `type=vote&bill_id=...` → per-bill voting records
- `type=meeting` → committee meetings archive (less useful for daily)

**Response (schedule):** sampled 2026-04-10
```json
{
  "mode": "schedule",
  "total": 10,
  "items": [
    {
      "일정종류": "국회행사",
      "일자": "2026-04-30",
      "시간": "14:00~16:30",
      "위원회": null,
      "내용": "돌봄통합지원법의 원활한 시행을 위한 국회토론회",
      "장소": "의원회관 제5간담회의실(208호)"
    }
  ]
}
```
⚠️ These are 국회행사 (events/토론회/기념식), NOT plenary/committee
sessions. For the briefing bot's "오늘 일정" section, this is useful
background but doesn't drive vote tracking. Most rows have `위원회: null`.

**Response (vote):** sampled 2026-04-10
```json
{ "mode": "vote", "total": 0, "items": [] }
```
The `bill_id` we tried had no votes. Expected — 22대 bills are still
mostly in committee. Structure for populated responses still TBD.

### `assembly_org`
위원회, 청원, 입법예고, 보도자료.

**Parameters:**
| Name | Type | Notes |
|---|---|---|
| `type` | string | `committee`/`petition`/`legislation_notice`/`press` |
| `committee_name` | string | |
| `include_members` | boolean | 위원회 위원 명단 포함 |
| `petition_id` | string | |
| `petition_status` | string | |
| `bill_name` | string | 입법예고 |
| `age`, `page`, `page_size` | |

**Expected use:**
- `type=committee&include_members=true` → 상임위 구성 (setup wizard)
- `type=legislation_notice` → 입법예고 단계 법안 (assembly_bill 미커버)
- `type=petition` → 청원 (관련 산업 청원 모니터링)

**Response (committee + members):** sampled 2026-04-10 for 문체위
```json
{
  "type": "committee",
  "total": 1,
  "items": [
    {
      "위원회명": "문화체육관광위원회",
      "위원회구분": "상임위원회",
      "위원장": "김교흥 (더불어민주당)",
      "간사": "임오경 (더불어민주당),박정하 (국민의힘)",
      "현원": 15,
      "정원": 16,
      "위원목록": [
        {
          "이름": "김교흥",
          "정당": "더불어민주당",
          "선거구": "인천 서구갑",
          "직위": "위원장",
          "의원코드": "X1K3667J"
        }
      ]
    }
  ]
}
```

🎯 **`의원코드` is a stable member ID** (e.g. `X1K3667J`, `5K93695T`).
Same format as `MONA_CD` from `query_assembly("nwvrqwxyaytdsfvhu")`.
**This is our legislator primary key.** Problem solved.

**Response (legislation_notice):** sampled 2026-04-10
```json
{
  "type": "legislation_notice",
  "total": 5,
  "items": [
    {
      "의안번호": "2218095",
      "법률안명": "해양폐기물 및 해양오염퇴적물 관리법 일부개정법률안",
      "제안자구분": "의원",
      "소관위": "농림축산식품해양수산위원회",
      "게시종료일": "2026-04-22"
    }
  ]
}
```
⚠️ No `의안ID` — 입법예고 단계에서는 PRC_... ID가 아직 없다. 매칭은
`의안번호`로 해야 함. 이 단계 bill들은 우리 Bill 테이블에는 스킵하고
별도 screen에서만 보여주는 것도 방법.

### `discover_apis` + `query_assembly`
국회 276개 API를 코드로 직접 호출하는 범용 escape hatch.

**Use case:** 6개 전용 tool이 커버하지 않는 데이터 (예: 의안통계, 전체
의원 명단, 보고서). `discover_apis`로 API 코드 찾고, `query_assembly`
로 호출.

**query_assembly 파라미터:**
- `api_code` (required, string) — 예: `BILLRCP`, `nwvrqwxyaytdsfvhu`
- `params` (object) — API별 파라미터 (예: `{ AGE: 22, BILL_ID: "PRC_..." }`)
- `page`, `page_size`

**Known API codes:**
- `BILLRCP` — 의안 접수 목록 (ERACO/BILL_ID/BILL_NM/PPSL_DT/PROC_RSLT).
  118,686 historical bills. 제안이유/주요내용 없음.
- `nwvrqwxyaytdsfvhu` — **전체 의원 현황 (USE THIS)**. 295명 리턴.
  Stable schema documented below.
- `ALLSCHEDULE` — 전체 일정 (sampled not yet)

**🎯 `nwvrqwxyaytdsfvhu` — 전체 의원 API (sampled 2026-04-10)**

This is the **canonical legislator source**. Superior to
`assembly_member` which lacks stable IDs.

```json
{
  "api": "nwvrqwxyaytdsfvhu",
  "total": 295,
  "fields": [
    "HG_NM", "HJ_NM", "ENG_NM", "BTH_GBN_NM", "BTH_DATE",
    "JOB_RES_NM", "POLY_NM", "ORIG_NM", "ELECT_GBN_NM",
    "CMIT_NM", "CMITS", "REELE_GBN_NM", "UNITS", "SEX_GBN_NM",
    "TEL_NO", "E_MAIL", "HOMEPAGE", "STAFF", "SECRETARY",
    "SECRETARY2", "MONA_CD", "MEM_TITLE", "ASSEM_ADDR"
  ],
  "items": [
    {
      "HG_NM": "강경숙",
      "HJ_NM": "姜景淑",
      "ENG_NM": "KANG KYUNGSOOK",
      "POLY_NM": "조국혁신당",
      "ORIG_NM": "비례대표",
      "ELECT_GBN_NM": "비례대표",
      "CMIT_NM": "교육위원회",
      "CMITS": "교육위원회",
      "REELE_GBN_NM": "초선",
      "UNITS": "제22대",
      "MONA_CD": "T2T8225E",
      "MEM_TITLE": "2024.5~ 제22대 국회의원 ...",
      "ASSEM_ADDR": "의원회관 515호"
    }
  ]
}
```

**Field → schema mapping (final):**
| Our schema | nwvrqwxyaytdsfvhu field | Notes |
|---|---|---|
| `member_id` | `MONA_CD` | **stable, canonical PK** |
| `name` | `HG_NM` | 한글이름 |
| `name_hanja` | `HJ_NM` | 한자이름 ← was assumed missing |
| `name_english` | `ENG_NM` | 새 필드 후보 |
| `party` | `POLY_NM` | 정당 |
| `district` | `ORIG_NM` | 선거구 or "비례대표" |
| `election_type` | `ELECT_GBN_NM` | "지역구"/"비례대표" |
| `committees[]` | `CMITS` | **comma-separated string, split on ","** |
| `term_number` | parse(`REELE_GBN_NM`) | "초선"=1, "재선"=2, "3선"=3, etc |
| `term_history` | `UNITS` | "제21대, 제22대" |
| `profile_image_url` | — | **drop column** (MCP never exposes) |
| `email` | `E_MAIL` | 새 필드 후보 |
| `office_address` | `ASSEM_ADDR` | 새 필드 후보 (설정 화면용) |

**MONA_CD ↔ 의원코드 equivalence:** `assembly_org` returns `의원코드`
for members in a committee, same format as `MONA_CD`. Verified:
same person → same code across both endpoints.

## Implications for sync.ts (final plan, 2026-04-10 pt 2)

**Legislator sync (once per day in morning sync):**
```
query_assembly("nwvrqwxyaytdsfvhu", { AGE: 22 }, page_size=300)
→ 295 legislators
→ upsert into `legislator` table keyed by MONA_CD
```
Single call replaces the hypothetical "per-committee fetch → dedupe"
workflow entirely. CMITS is split into `committees[]` array.

**Bill sync (two-phase, runs for each watched committee):**
```
Phase 1 — discovery:
  assembly_bill({ committee, age: 22, page_size: 100 })
  → items with 의안ID, 의안명, 제안자, 소관위원회, 제안일,
    대표발의자, 공동발의자 (string, co-names only)

Phase 2 — detail fetch (only for bills we want to keep):
  For each bill where keywordMatches(의안명, profile.keywords):
    assembly_bill({ bill_id: 의안ID })
    → item with 공동발의자[] (with 정당), 심사경과, LINK_URL
    → derive stage from 심사경과 timestamps
    → derive proposer_party from 공동발의자 where 대표구분 === "대표발의"
```

**Schedule (morning sync background data):**
```
assembly_session({ type: "schedule",
                   date_from: today, date_to: today+30 })
→ upcoming events (토론회, 세미나, 행사)
→ display in briefing bot "오늘/이번주 일정" section
```

**Committees (setup wizard only, not per-sync):**
```
For each committee user picks:
  assembly_org({ type: "committee", committee_name,
                 include_members: true, age: 22 })
  → committee metadata + member list
  → used to populate IndustryCommittee + as hemicycle seed
```

## Schema adjustments (final, 2026-04-10 pt 2)

| Current schema field | Decision |
|---|---|
| `legislator.member_id` (unique) | ✅ **KEEP** — use `MONA_CD` from `nwvrqwxyaytdsfvhu`. Cross-confirmed against `의원코드` in `assembly_org`. |
| `legislator.committees jsonb[]` | ✅ **KEEP** — populate from `CMITS.split(", ")`. |
| `legislator.term_number int` | ✅ **KEEP** — parse `REELE_GBN_NM` ("초선"=1, "재선"=2, "3선"=3, …). |
| `legislator.name_hanja` | ✅ **KEEP** — `HJ_NM` exists in `nwvrqwxyaytdsfvhu`. |
| `legislator.profile_image_url` | ❌ **DROP** — no API exposes it. |
| `bill.bill_id unique` | ✅ **KEEP** — use `의안ID` (`PRC_...`) |
| `bill.proposer_party` | ✅ **KEEP** — extract from detail response `공동발의자[]` where `대표구분 === "대표발의"`. |
| `bill.proposal_reason, main_content` | ⚠️ **KEEP AS NULLABLE** — MCP doesn't expose them. Always null for now. Lane B Gemini prompts must handle null gracefully. |
| `bill.co_sponsor_count` | Use `공동발의자_총수` (int) from detail, fallback to `공동발의자.split(",").length` from search. |
| `bill.stage` | Derive from `심사경과` timestamps in detail response (see above). |
| `bill.external_link` | Use `LINK_URL` from detail response (search response has `상세링크` with http not https). |

## What's still open (deferred)

- `assembly_bill(keywords, mode=track)` returns a different field
  shape (`billNo`, `billName`, `proposer`, `coProposers`, `histories`).
  Use it IF we want complete bill histories for stage tracking — but
  the detail mode's 심사경과 already gives us that. Skip for now.
- `assembly_session(vote)` shape for bills that DO have votes. We'll
  find out next time a 22대 bill passes plenary (🤷).
- Scraping `LINK_URL` HTML to get 제안이유/주요내용. Defer until we
  actually need richer Gemini input.

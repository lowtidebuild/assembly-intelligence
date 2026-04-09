# MCP API Reality Check — assembly-api-mcp

Captured: 2026-04-10 via live server inspection.
Server: `https://assembly-api-mcp.fly.dev` (github: hollobit/assembly-api-mcp)
Transport: **Streamable HTTP** (NOT SSE — this was a wrong assumption in
design.md v1; verified via server setup page at the base URL).

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

This doubles the MCP call count during morning sync. Need to verify
whether the detail response actually includes 제안이유/주요내용, or
whether we need to call `discover_apis` + `query_assembly` to hit
a different underlying API code.

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

⚠️ Response shape not yet sampled. TODO next session.

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

### `discover_apis` + `query_assembly`
국회 276개 API를 코드로 직접 호출하는 범용 escape hatch.

**Use case:** 6개 전용 tool이 커버하지 않는 데이터 (예: 의안통계, 특정
위원회 위원 명단, 보고서). `discover_apis`로 API 코드 찾고, `query_assembly`
로 호출.

**Example API codes seen in description:**
- `ALLSCHEDULE` — 전체 일정
- `BILLRCP` — 법안 접수
- `nwvrqwxyaytdsfvhu` — 불투명한 코드 (276개 중 일부는 이런 ID)

## Implications for sync.ts

The current sync.ts assumes single-call retrieval of bills with full
content. In reality:

**Morning sync phase 1 (discovery):**
```
For each committee in activeProfile.committees:
  assembly_bill({ committee, status: "pending", page_size: 100 })
  → array of { 의안ID, 의안명, 제안자, 소관위원회, 제안일, ... }
  (NO 제안이유 or 주요내용)
```

**Morning sync phase 2 (keyword pre-filter):**
Check if `의안명` contains any industry keyword. Bills that match go
to phase 3. Bills that don't are stored with relevance_score=null
(they exist but aren't scored).

**Morning sync phase 3 (Gemini scoring):**
For each matched bill, call `assembly_bill({ bill_id: 의안ID })` to
get full details (ASSUMING detail response includes 제안이유/주요내용 —
needs verification). Then send to Gemini for scoring.

**This is 2× more MCP calls than the original design.** Mitigation:
the keyword pre-filter should be aggressive (catching ~20% of bills)
so we only pay for the detail fetch on the ones that matter.

**Alternative:** if `assembly_bill(bill_id)` still doesn't return
제안이유/주요내용, we'll need `discover_apis` + `query_assembly` to
find the underlying 의안정보시스템 API that has it — most likely
something like `BILLRCP` or a specific 의안본문 API.

## Schema adjustments needed

| Current schema field | Reality check |
|---|---|
| `legislator.member_id` (unique) | **No real member_id from MCP.** Use composite key: `${name}_${party}_${district}` |
| `legislator.committees jsonb[]` | Need to aggregate multiple single-committee responses |
| `legislator.term_number int` | Parse from "3선" string |
| `legislator.name_hanja` | Not in response. Either drop column or leave null. |
| `legislator.profile_image_url` | Not in response. Drop or leave null. |
| `bill.bill_id unique` | Use `의안ID` (e.g. `PRC_...`) |
| `bill.proposer_party` | Not directly in bill response. Derive from assembly_member lookup or parse from 제안자 string. |
| `bill.proposal_reason, main_content` | Require phase-2 detail fetch. May not be present even then. |

## Next session plan

1. Sample `assembly_bill({ bill_id: <some_id> })` detail response →
   confirm whether 제안이유/주요내용 present
2. Sample `assembly_session({ type: schedule, date_from: today })`
3. Sample `assembly_org({ type: committee, include_members: true })`
4. Decide legislator primary key strategy
5. Rewrite sync.ts phase by phase with real field names
6. Update schema.ts if needed (drop unused columns, adjust constraints)
7. Regenerate migration + push to Neon
8. Full end-to-end morning sync dry-run with stub Gemini scorer

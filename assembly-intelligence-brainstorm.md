# 국회 인텔리전스 대시보드 — 브레인스토밍 기록

**날짜:** 2026-04-07
**관련 프로젝트:** ParlaWatch, [assembly-api-mcp](https://github.com/hollobit/assembly-api-mcp)

---

## 발단

ParlaWatch(국회 영상 모니터링 도구)에 assembly-api-mcp(국회 Open API MCP 서버)를 결합하면 뭐가 가능할까?

## assembly-api-mcp 개요

- 276개 국회 Open API를 MCP 서버로 제공
- Lite 9개 / Full 18개 도구
- 의원, 의안, 일정, 회의록, 표결, 청원, 입법예고, 예산분석, 연구보고서 등
- Claude, Gemini, ChatGPT 등 AI 도구에서 실시간 접근 가능
- 원격 서버 URL만으로 바로 사용 가능: `https://assembly-api-mcp.fly.dev/mcp?key=YOUR_API_KEY&profile=lite`

### 주요 도구 (Lite)

| 도구 | 설명 |
|------|------|
| `search_members` | 의원 검색 (이름/정당/선거구/위원회) |
| `search_bills` | 의안 검색+상세+상태필터 |
| `get_schedule` | 국회 일정 조회 |
| `search_meetings` | 회의록 검색 |
| `get_votes` | 표결 조회 |
| `analyze_legislator` | 의원 종합분석 |
| `track_legislation` | 주제별 법안 추적 |
| `discover_apis` | 276개 API 키워드 검색 |
| `query_assembly` | 범용 API 직접 호출 |

### Full 전용 추가 도구

| 도구 | 설명 |
|------|------|
| `get_bill_detail` | 의안 상세 (제안이유, 주요내용) |
| `get_bill_review` | 의안 심사정보 |
| `get_bill_history` | 의안 접수/처리 이력 |
| `get_committees` | 위원회 목록 |
| `search_petitions` | 국민동의청원 검색 |
| `get_legislation_notices` | 입법예고 조회 |
| `search_library` | 국회도서관 자료 검색 |
| `get_budget_analysis` | 예산정책처 분석 자료 |
| `search_research_reports` | 입법조사처 보고서 |

---

## 결론 1: ParlaWatch와 합치기보다 따로 만드는 게 낫다

**이유:** ParlaWatch의 핵심은 "비정형 영상 → LLM으로 구조화"인데, assembly-api-mcp가 주는 데이터는 이미 구조화되어 있음. 비정형 데이터 파이프라인에 정형 데이터를 끼워 넣으면 양쪽 다 어중간해짐.

나중에 필요하면 느슨하게 연동 가능:
- ParlaWatch가 영상에서 발견한 안건 → 새 도구에서 해당 법안 상세 추적
- 새 도구가 감지한 주요 법안 → ParlaWatch에서 관련 영상 우선 분석

---

## 결론 2: A~D를 하나의 프로덕트로

처음에 4가지 후보를 나눴지만, 전부 같은 데이터 풀 위의 다른 뷰일 뿐:

### A. 입법 레이더 (Legislative Radar)
키워드/산업 설정 → 관련 법안의 전체 라이프사이클 자동 추적. 입법예고 → 발의 → 심사 → 표결까지 타임라인. 매일 cron 돌려서 변동사항 알림.

### B. 의원 워치 (Legislator Watch)
특정 산업 관련 의원들의 활동 종합 분석. 발의 법안, 표결 패턴, 소속 위원회, 발언 이력. GR(정부관계) 담당자를 위한 도구.

### C. 국회 브리핑봇 (Assembly Briefing Bot)
매일 아침 "오늘 국회에서 우리 산업 관련 뭐가 있나" 자동 생성. 일정 + 계류법안 + 최근 표결 + 입법예고를 한 장짜리 브리핑으로.

### D. 법안 영향 분석기
특정 법안 → 제안이유, 주요내용, 심사현황, 관련 의원, 표결 전망, 유사 과거 법안까지 AI 종합 분석 리포트.

### 하나로 합치면: "산업별 국회 인텔리전스 대시보드"

- **메인 화면:** 오늘의 브리핑 (C)
- **법안 탭:** 관심 법안 타임라인 + 드릴다운 (A+D)
- **의원 탭:** 관련 의원 프로파일 (B)
- **알림:** 변동사항 자동 감지

기술적으로 assembly-api-mcp 하나가 백엔드 역할을 하므로 쪼개는 게 오히려 비효율.

---

## 다음 단계

- [ ] 구체적인 설계 (아키텍처, 기술 스택, 데이터 모델)
- [ ] 프로젝트 생성 및 구현

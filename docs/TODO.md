# ParlaWatch+ 로드맵

## 현재 완료

- [x] 6개 대시보드 (브리핑봇, 입법 레이더, 영향 분석기, 의원 워치, 국회 현황, 설정)
- [x] Gemini AI 스코어링 + 브리핑 + 심층 분석
- [x] 의원 중요도 S/A/B + 프로필 슬라이드오버
- [x] 워치리스트 추가/제거 (슬라이드오버에서)
- [x] 산업별 프리셋 7종
- [x] Naver News 수집
- [x] 읽기 전용 데모 모드
- [x] GitHub Pages + Vercel 배포
- [x] HTML 엔티티 디코더
- [x] Hemicycle opacity 기반 중요도 시각화

## 진행 중 (Codex 위임)

### UX 종합 업그레이드 (`CODEX_BRIEF_ux_upgrade.md`)
- [x] **의원 프로필 전용 페이지** (`/legislators`, `/legislators/[id]`)
- [x] **통합 검색** (의원 + 법안 실시간 드롭다운)
- [x] **모바일 반응형** (햄버거 사이드바 + 1컬럼 스택)

## 다음 — 법안 요약 품질 개선 (블로커: 국회 API 서버 복구)

### 법안 본문 가져오기 → Gemini 요약 구체화
- [ ] 열린국회정보 API (`ASSEMBLY_OPEN_API_KEY`)로 법안 제안이유/주요내용 조회 가능한지 테스트 (서버 복구 후)
- [ ] 가능하면: sync 시 본문 가져와서 `bill.proposal_reason`, `bill.main_content` 컬럼 채우기
- [ ] 불가능하면: 의안정보시스템(`LINK_URL`) HTML 스크레이핑으로 본문 추출
- [ ] Gemini 요약 프롬프트 개선 — 본문 있으면 핵심 조항/변경사항 위주 요약
- [ ] 본문 없어도: "뻔한 일반론 금지, 의안명에서 추론 가능한 구체적 쟁점 중심" 프롬프트 강화

## 다음 — MCP 미사용 도구 활용 (블로커: 국회 API 서버 복구)

### Phase 1 — 위원회 안건 알림 (`assembly_org`)
- [ ] `assembly_org({ type: "legislation_notice" })` → 입법예고 법안 수집
- [ ] 입법예고 법안이 우리 키워드에 매칭되면 브리핑에 "입법예고" 섹션 추가
- [ ] `assembly_org({ type: "committee", include_members: true })` → 위원회 소속 의원 실시간 갱신
- [ ] 위원회 회의 안건에 우리 법안이 올라가면 알림

### Phase 2 — 의원 프로필 사진
- [ ] MCP에서 사진 URL 미제공 — 국회 웹사이트에서 MONA_CD 기반으로 이미지 URL 구성
- [ ] URL 패턴: `https://www.assembly.go.kr/photo/9770${MONA_CD}.jpg` (검증 필요)
- [ ] DB에 `profile_image_url` 컬럼 복원 + sync 시 URL 생성
- [ ] hemicycle hover tooltip, 슬라이드오버, 프로필 페이지에 사진 표시

### Phase 3 — 회의록 키워드 모니터링
- [ ] MCP에 회의록 검색 도구가 현재 없음
- [ ] 대안 A: 국회 회의록 공공데이터 API 직접 호출 (열린국회정보 API)
- [ ] 대안 B: assembly-api-mcp에 기능 추가 요청 (issue)
- [ ] 회의록에서 산업 키워드 언급 횟수 집계
- [ ] 의원별 발언 빈도 → 중요도 보강
- [ ] Gemini로 발언 찬반 분위기 분석

### Phase 4 — 의원 발언 분석 + 통과 예측 강화
- [ ] 회의록 기반 의원 스탠스 분석 (Phase 3 의존)
- [ ] `assembly_org` 소위원회 구성 + 소위 통과 여부 → 본회의 통과 예측
- [ ] 청원 모니터링 (`assembly_org({ type: "petition" })`)

## 미래

- [ ] Slack/Teams 알림 연동
- [ ] 다크 모드 UI 완성 (토큰은 이미 정의됨)
- [ ] 다중 산업 프로필 동시 운영
- [ ] 의원 네트워크 그래프 (공동발의 관계)
- [ ] 법안 유사도 분석 (embedding 기반)

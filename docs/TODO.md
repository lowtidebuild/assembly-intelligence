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
- [x] 의원 프로필 전용 페이지 (`/legislators`, `/legislators/[id]`)
- [x] 통합 검색 (의원 + 법안 실시간 드롭다운)
- [x] 모바일 반응형 (햄버거 사이드바 + 1컬럼 스택)
- [x] 입법예고 모니터링 (`assembly_org` → 브리핑에 D-N 배지)
- [x] 위원회 구성 실시간 갱신 (위원장/간사 직위 우선순위)
- [x] 슬라이드오버 slide-in 애니메이션
- [x] 국회 현황 full-width hemicycle + 가로 정당 통계 카드
- [x] Gemini Pro 3.1 업그레이드
- [x] Apache 2.0 라이선스
- [x] 품질 개선 리메디에이션 (브리핑 snapshot 정합성, evening sync 안정화, 검색 접근성/정렬, 회귀 테스트)
- [x] 데모 배포 내부 런북 정리

## 다음 — 법안 본문 가져오기 (블로커: 국회 서버 복구)

### 제안이유 및 주요내용 원문 수집
- [ ] 열린국회정보 API로 법안 본문 조회 가능한지 테스트 (서버 복구 후)
- [ ] 가능하면: sync 시 본문 → `bill.proposal_reason` + `bill.main_content` 저장
- [ ] 불가능하면: 의안정보시스템(`LINK_URL`) HTML 스크레이핑으로 본문 추출
- [ ] 원문 확보 시: 브리핑 카드에 AI 요약 대신 원문 핵심 내용 표시
- [ ] Gemini 요약에 원문 투입 → 구체적 조항/변경사항 위주 요약으로 품질 대폭 개선
- [ ] 원문 없는 경우: 프롬프트 강화 ("뻔한 일반론 금지, 의안명 기반 구체적 쟁점 중심")

## 다음 — 추가 기능 (블로커: 국회 서버 복구)

### 의원 프로필 사진
- [ ] 국회 웹사이트 사진 URL 패턴 검증 (`www.assembly.go.kr` 복구 후)
- [ ] 패턴 확인되면: DB `photo_url` 컬럼 + sync 시 URL 생성
- [ ] hemicycle tooltip, 슬라이드오버, 프로필 페이지, 워치 카드에 사진 표시
- [ ] 사진 로드 실패 시 이니셜 fallback

### 회의록 키워드 모니터링
- [ ] 열린국회정보 API 회의록 endpoint 테스트 (`ASSEMBLY_OPEN_API_KEY`, 서버 복구 후)
- [ ] 산업 키워드로 회의록 본문 검색
- [ ] 매칭된 발언 snippet 저장 (전후 200자)
- [ ] 브리핑에 "회의록 동향" 섹션 추가
- [ ] 의원별 발언 빈도 → 중요도 S/A/B 보강

### 의원 발언 분석 + 통과 예측
- [ ] 회의록 기반 의원 스탠스 분석 (회의록 기능 의존)
- [ ] Gemini로 찬반 분위기 분석
- [ ] `assembly_org` 소위원회 구성 → 통과 가능성 정밀화
- [ ] 청원 모니터링 (`assembly_org({ type: "petition" })`)

## 미래

- [ ] CI에 `tsc` + `lint` + `test` + `build`를 배포 전 필수 체크로 고정
- [ ] 데모/본체 배포 전 스키마 preflight 자동화 (`information_schema` 체크 스크립트)
- [ ] `/briefing` / `/api/health` 배포 후 스모크 체크 자동화
- [ ] Slack/Teams 알림 연동
- [ ] 다크 모드 UI 완성 (토큰은 이미 정의됨)
- [ ] 다중 산업 프로필 동시 운영
- [ ] 의원 네트워크 그래프 (공동발의 관계)
- [ ] 법안 유사도 분석 (embedding 기반)
- [ ] examples/app.html + docs/index.html 재생성 (최신 UI 반영)
- [ ] 데모/본체 Vercel 자동 배포 파이프라인 정비

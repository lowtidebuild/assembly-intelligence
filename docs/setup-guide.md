# ParlaWatch+ 설치 가이드 (비개발자용)

> 이 문서는 개발 경험이 없는 GR/PA 담당자가 ParlaWatch+를 처음부터 끝까지 설치하고 운영할 수 있도록 작성되었습니다. 순서대로 따라가면 약 30-40분이면 완료됩니다.

---

## 목차

1. [전체 구조 이해하기](#1-전체-구조-이해하기)
2. [사전 준비: 계정 만들기](#2-사전-준비-계정-만들기)
3. [API 키 발급](#3-api-키-발급)
4. [데이터베이스 만들기 (Neon)](#4-데이터베이스-만들기-neon)
5. [Vercel에 배포하기](#5-vercel에-배포하기)
6. [산업 프로필 설정하기](#6-산업-프로필-설정하기)
7. [첫 동기화 실행하기](#7-첫-동기화-실행하기)
8. [매일 사용하기: 각 탭 활용법](#8-매일-사용하기-각-탭-활용법)
9. [FAQ / 문제 해결](#9-faq--문제-해결)

---

## 1. 전체 구조 이해하기

ParlaWatch+는 다음 4개의 외부 서비스를 조합해서 동작합니다:

```
국회 공공데이터 (assembly-api-mcp)
        ↓ 법안 + 의원 정보 수집
ParlaWatch+ 서버 (Vercel)
        ↓ Gemini AI로 분석 + 점수 매기기
데이터베이스 (Neon)
        ↓ 결과 저장
브라우저 (당신의 화면)
        + Naver News에서 관련 뉴스 수집
```

**필요한 API 키 4종:**

| 서비스 | 용도 | 비용 |
|---|---|---|
| assembly-api-mcp | 국회 법안/의원 데이터 | 무료 |
| Google Gemini | AI 분석 + 브리핑 생성 | ~$2-3/월 |
| Naver Developers | 관련 뉴스 수집 | 무료 |
| Neon | 데이터베이스 | 무료 |

---

## 2. 사전 준비: 계정 만들기

아래 4개 사이트에 회원가입하세요. 전부 무료입니다.

| # | 서비스 | URL | 가입 방법 |
|---|---|---|---|
| 1 | **GitHub** | [github.com](https://github.com) | 이메일로 가입 (코드 저장소) |
| 2 | **Neon** | [neon.tech](https://neon.tech) | GitHub 계정으로 로그인 |
| 3 | **Vercel** | [vercel.com](https://vercel.com) | GitHub 계정으로 로그인 |
| 4 | **Google AI Studio** | [aistudio.google.com](https://aistudio.google.com) | Google 계정으로 로그인 |
| 5 | **Naver Developers** | [developers.naver.com](https://developers.naver.com) | 네이버 계정으로 로그인 |

> GitHub 계정이 있으면 Neon과 Vercel은 "Sign in with GitHub" 버튼으로 바로 가입됩니다.

---

## 3. API 키 발급

### 3-1. assembly-api-mcp 키

1. [assembly-api-mcp GitHub 페이지](https://github.com/hollobit/assembly-api-mcp)에 방문
2. README의 안내에 따라 API 키를 발급받으세요
3. 키를 메모장에 복사해두세요

> 이 키가 국회 공공데이터에 접근하는 열쇠입니다.

### 3-2. Google Gemini API 키

1. [Google AI Studio](https://aistudio.google.com/apikey)에 접속
2. "Create API key" 클릭
3. 생성된 키를 복사해두세요 (AIza... 로 시작)

> Gemini는 법안 분석과 일일 브리핑 생성에 사용됩니다. 하루 비용은 약 100-200원 수준입니다.

### 3-3. Naver Developers 키

1. [Naver Developers](https://developers.naver.com/apps/#/register)에 접속
2. "애플리케이션 등록" 클릭
3. **애플리케이션 이름**: `ParlaWatch` (아무 이름 가능)
4. **사용 API**: "검색" 선택
5. **서비스 환경**: "WEB 설정" → 서비스 URL에 `https://localhost:3000` 입력
6. 등록 완료 후 **Client ID**와 **Client Secret**을 복사

> 하루 25,000건 무료. ParlaWatch+는 하루 ~20건만 사용합니다.

---

## 4. 데이터베이스 만들기 (Neon)

1. [Neon Console](https://console.neon.tech)에 로그인
2. **"New Project"** 클릭
3. 프로젝트 이름: `parlawatch` (아무 이름)
4. Region: **Asia Pacific (Singapore)** 선택 (한국에서 가장 빠름)
5. 생성 완료!

생성 후 화면에 **Connection string**이 표시됩니다:

```
postgresql://neondb_owner:xxxxxxxx@ep-xxx-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

이 문자열이 2개 필요합니다:
- **Pooled** (끝에 `-pooler`가 있는 버전) → `DATABASE_URL`에 사용
- **Direct** (`-pooler`가 없는 버전) → `DATABASE_URL_UNPOOLED`에 사용

> Neon 대시보드 → 프로젝트 → "Connection Details" 탭에서 두 버전 모두 복사할 수 있습니다.

---

## 5. Vercel에 배포하기

### 5-1. 코드 가져오기

1. [ParlaWatch+ GitHub 저장소](https://github.com/lowtidebuild/assembly-intelligence)에 방문
2. 우측 상단 **"Fork"** 버튼 클릭 → 내 GitHub에 복사됨

### 5-2. Vercel에서 배포

1. [vercel.com/new](https://vercel.com/new)에 접속
2. 방금 Fork한 저장소 선택
3. **Framework Preset**: Next.js (자동 감지됨)
4. **Environment Variables** 섹션에 아래 값을 입력:

| Key | Value (어디서 가져오나) |
|---|---|
| `DATABASE_URL` | Neon → Connection Details → Pooled |
| `DATABASE_URL_UNPOOLED` | Neon → Connection Details → Direct |
| `GEMINI_API_KEY` | 3-2에서 발급한 키 |
| `NAVER_CLIENT_ID` | 3-3에서 발급한 ID |
| `NAVER_CLIENT_SECRET` | 3-3에서 발급한 Secret |
| `APP_PASSWORD` | 로그인 비밀번호 (직접 정하세요, 예: `myteam2026`) |
| `INDUSTRY_PROFILE` | `game` (나중에 설정 위저드에서 변경 가능) |

5. **"Deploy"** 클릭
6. 2-3분 후 배포 완료!

선택값:

| Key | 용도 |
|---|---|
| `MCP_PROFILE` | 기본값은 `full` 권장. 최신 MCP 도구(`research_data`, `get_nabo`)까지 노출 |
| `ASSEMBLY_API_MCP_BASE_URL` | 공개 upstream 대신 직접 띄운 `assembly-api-mcp` 서버를 붙이고 싶을 때 사용 |
| `ASSEMBLY_API_MCP_KEY` | 실시간 MCP 호출을 쓸 때만 필요. mock-data/read-only 데모만 띄울 때는 생략 가능 |

> `lawmaking` / `NABO`는 이 앱이 아니라 **대상 MCP 서버** 쪽에 `LAWMKING_OC`, `NABO_API_KEY`가 준비되어 있어야 활성화됩니다.

배포 후 `https://your-project.vercel.app` 주소가 생깁니다.

### 5-3. 데이터베이스 테이블 생성

배포 후 최초 1회만 실행:

1. Vercel 대시보드 → 프로젝트 → **Settings** → **Functions** 탭
2. 또는 로컬에서 `pnpm db:migrate` 실행

> 잘 모르겠으면 관리자에게 "DB 마이그레이션 실행해달라"고 요청하세요.
>
> 중요: 이미 운영 중인 앱을 다시 배포할 때도, 새 컬럼이 추가된 릴리스라면 **코드 배포 전에 DB 마이그레이션을 먼저 적용**해야 합니다. 자세한 순서는 [docs/demo-deploy-runbook.md](./demo-deploy-runbook.md)를 참고하세요.
>
> 배포 전 기본 점검 명령:
>
> ```bash
> pnpm ci:check
> pnpm preflight:schema
> ```

---

## 6. 산업 프로필 설정하기

### 6-1. 접속

1. 배포된 URL에 접속 (예: `https://your-project.vercel.app`)
2. 로그인 화면에서 `APP_PASSWORD`에 설정한 비밀번호 입력
3. 브리핑봇 페이지가 나타남 (처음엔 비어있음)

### 6-2. 산업 선택

1. 좌측 메뉴에서 **설정** 클릭
2. **"시작하기"** 또는 **"편집"** 버튼 클릭 → 설정 위저드 열림

### Step 1: 산업 선택
7개 프리셋 중 하나를 선택하세요:

| 프리셋 | 적합한 회사 예시 |
|---|---|
| 🎮 게임 | 게임 개발사, 퍼블리셔, e스포츠 |
| 🛡️ 정보보안 | 보안 솔루션, 클라우드 보안, 개인정보 |
| 💊 바이오 | 제약, 의료기기, 헬스케어 |
| 💰 핀테크 | 간편결제, 인터넷은행, 가상자산 |
| 💻 반도체 | 반도체 설계/제조, 디스플레이 |
| 🛒 이커머스 | 온라인 쇼핑, 배달, 물류 |
| 🤖 인공지능 | AI 서비스, 데이터, 자율주행 |

> 목록에 없는 산업이면 **"직접 입력"** 카드를 선택하세요.

### Step 2: 키워드 편집
프리셋이 기본 키워드를 채워주지만, **자유롭게 추가/삭제** 가능합니다.

**좋은 키워드 예시:**
- ✅ `게임산업진흥` — 구체적인 법률명
- ✅ `확률형 아이템` — 핵심 규제 이슈
- ❌ `디지털` — 너무 넓음, 관련 없는 법안이 많이 잡힘

**팁**: 15-25개가 적정. 너무 적으면 법안을 놓치고, 너무 많으면 노이즈가 늘어남.

### Step 3: 위원회 선택
우리 산업과 관련된 국회 상임위원회를 선택합니다. 프리셋이 추천해주지만 편집 가능.

### Step 4: 의원 선택 (선택사항)
hemicycle에서 특별히 주시하고 싶은 의원을 클릭해서 워치리스트에 추가.

### Step 5: 확인 + 저장

---

## 7. 첫 동기화 실행하기

프로필 설정 후 최초 1회 동기화를 실행해야 데이터가 채워집니다.

**방법 A: 자동 대기**
매일 아침 06:30 + 저녁 18:30 KST에 Vercel Cron이 자동 실행. 다음 날 아침까지 기다리면 데이터가 채워져 있습니다.

**방법 B: 수동 실행 (개발 환경)**
```bash
pnpm tsx scripts/dry-run-morning-sync.ts
```
약 45초 소요. 완료 후 `/briefing` 페이지에 실제 데이터가 표시됩니다.

---

## 8. 매일 사용하기: 각 탭 활용법

### 브리핑봇 (`/briefing`)

**언제 보나**: 매일 아침 출근 직후

**무엇이 보이나**:
- **오늘의 핵심**: Gemini가 5점 만점으로 평가한 법안 중 4-5점짜리만 카드로 표시
- **Gemini 브리핑**: AI가 작성한 오늘의 요약 (핵심 법안, 일정, 신규 발의)
- **관련 뉴스**: Naver News에서 수집한 산업 관련 기사

**활용 팁**:
- 법안 카드의 제안자 이름 옆 **별표(S/A/B)**는 해당 의원의 산업 중요도
- S = 핵심 (수동 워치 또는 관련위 + 대표발의 2건+)
- A = 주요 (관련위 위원장/간사 또는 대표발의 1건)
- B = 참고 (관련위 소속)
- 별표를 클릭하면 의원 상세 프로필 확인 가능

---

### 입법 레이더 (`/radar`)

**언제 보나**: 전체 법안 목록을 확인하거나, 특정 조건으로 필터링할 때

**핵심 기능**:
- **필터 칩**: 단계별 (발의/상임위/법사위/본회의/이송/공포), 중요도별 (3+/4+/5), 위원회별
- **정렬**: 발의일, 의안명, 중요도 컬럼 클릭으로 정렬
- **검색**: 의안명이나 제안자 이름으로 검색
- **슬라이드오버**: 행 클릭 → 오른쪽에 법안 상세 패널

**슬라이드오버에서 할 수 있는 것**:
- AI 요약 확인
- 중요도 판단 근거 확인
- **"AI 초안 생성"** → Gemini Pro가 당사 영향 사항 초안 작성 (~20초)
- **"수동 입력"** → 직접 당사 영향 사항 작성
- 의안정보시스템 외부 링크로 원문 확인

---

### 영향 분석기 (`/impact`)

**언제 보나**: 특정 법안에 대해 심층 분석이 필요할 때

**핵심 기능**:
- 왼쪽에서 법안 선택
- **"심층 분석 생성"** 버튼 클릭 → Gemini Pro가 5개 섹션 분석 생성 (~30-60초):
  1. Executive Summary
  2. 핵심 조항 분석
  3. 운영/재무/컴플라이언스 영향
  4. 통과 가능성 평가
  5. 권장 액션

> 심층 분석은 비용이 들기 때문에 (건당 ~50원) 진짜 중요한 법안에만 사용하세요.

---

### 의원 워치 (`/watch`)

**언제 보나**: 산업 관련 핵심 의원을 관리할 때

**핵심 기능**:
- **자동 추천**: S/A 등급 의원을 자동으로 추천
- **워치리스트**: 추천 카드에서 "워치리스트에 추가" 클릭
- **프로필 확인**: 의원 이름이나 hemicycle 좌석 클릭 → 슬라이드오버
  - 위원회 소속 + 역할
  - 최근 180일 관련 대표발의 법안
  - 한자명, 연락처, 보좌진, 약력

---

### 국회 현황 (`/assembly`)

**언제 보나**: 전체 의석 구성을 한눈에 파악하고 싶을 때

**핵심 기능**:
- 295명 전체 의석을 실제 본회의장 형태로 표시
- 밝은 좌석 = 산업 관련 중요 의원, 흐린 좌석 = 관련도 낮음
- 좌석 클릭 → 의원 상세 프로필
- 우측에 정당별 의석 수 통계

---

### 설정 (`/settings`)

**무엇이 보이나**:
- 현재 산업 프로필 요약
- 환경 변수 상태 (연결 정상/비정상)
- 최근 동기화 이력

**"편집" 버튼** → 설정 위저드로 이동해서 산업 프로필 수정 가능

---

## 9. FAQ / 문제 해결

### Q: 브리핑봇에 아무것도 안 나와요
**A**: 첫 동기화가 아직 안 된 상태입니다. 아침 06:30 KST까지 기다리거나, 관리자에게 수동 동기화를 요청하세요.

### Q: 법안이 5개밖에 안 잡혀요
**A**: 키워드가 너무 좁을 수 있습니다. 설정 위저드에서 키워드를 추가해보세요. 일반적으로 15-25개가 적정.

### Q: Gemini 비용이 걱정돼요
**A**: 자동 동기화(아침/저녁)는 하루 약 100-200원 수준입니다. 심층 분석은 건당 ~50원이므로 필요한 법안에만 사용하세요.

### Q: 비밀번호를 잊었어요
**A**: Vercel 대시보드 → Settings → Environment Variables에서 `APP_PASSWORD` 값을 확인하세요.

### Q: 다른 산업으로 바꾸고 싶어요
**A**: `/setup` (설정 위저드)에서 새 프리셋 선택 → 저장. 다음 동기화부터 새 키워드가 적용됩니다. 기존 데이터는 유지됩니다.

### Q: 의원 정보가 오래된 것 같아요
**A**: 아침 동기화 시 295명 전체를 국회 API에서 최신 정보로 갱신합니다. 의원직 변동(보궐선거, 사퇴 등)도 자동 반영됩니다.

---

> 문제가 있으면 [GitHub Issues](https://github.com/lowtidebuild/assembly-intelligence/issues)에 남겨주세요.

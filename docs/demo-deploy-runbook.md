# ParlaWatch+ 데모 배포 런북

> 목적: Next.js 데모 앱 또는 정적 예제 번들을 다시 배포할 때, 스키마 드리프트와 예제 미재생성 때문에 화면이 깨지는 일을 막기 위한 운영 문서입니다.

---

## 언제 이 문서를 쓰나

다음 중 하나라도 해당하면 이 순서를 따릅니다.

- `src/db/schema.ts`가 바뀌었다
- `drizzle/*.sql` 마이그레이션이 추가됐다
- `/briefing`, `/radar`, `/watch`, `/settings` 같은 데시보드 UI가 바뀌었다
- `examples/*.html`, `examples/app.html`, `docs/index.html`를 다시 만들어야 한다
- `DEMO_MODE=true`로 띄운 공개 데모를 재배포한다

---

## 배포 대상 2종

ParlaWatch+에는 사실상 두 종류의 데모가 있습니다.

1. Next.js 데모 앱
   - Vercel에서 실행
   - `DEMO_MODE=true`
   - 실제 DB를 읽되 쓰기는 막힘

2. 정적 예제 번들
   - `examples/*.html`
   - `examples/app.html`
   - `docs/index.html`
   - 오프라인/링크 공유용

두 대상은 서로 독립적입니다.

- Next.js 데모 앱은 DB 스키마 영향을 받습니다.
- 정적 예제 번들은 DB 스키마보다 “재생성 여부” 영향을 더 크게 받습니다.

---

## 가장 중요한 원칙

### 1. 스키마가 먼저, 코드가 나중

공유 DB를 읽는 앱에서 새 컬럼을 기대하는 코드를 먼저 배포하면, 데모가 바로 500으로 죽을 수 있습니다.

항상 이 순서를 지킵니다.

1. 마이그레이션 적용
2. 컬럼 존재 확인
3. 앱 재배포
4. 스모크 테스트

### 2. 정적 예제는 자동으로 갱신되지 않음

대시보드 UI를 바꿨더라도 `examples/*.html`, `examples/app.html`, `docs/index.html`는 직접 재생성하지 않으면 옛 화면이 남아 있습니다.

---

## 표준 배포 순서

### 0. 로컬 preflight

코드 병합 전 또는 배포 직전, 로컬에서 아래를 모두 통과시킵니다.

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

선택:

```bash
pnpm test:e2e
```

---

## 1. DB 마이그레이션 적용

예: `0005_daily_briefing_snapshots.sql`

```bash
pnpm tsx scripts/apply-migration.ts drizzle/0005_daily_briefing_snapshots.sql
```

### 1-1. 컬럼 존재 확인

`daily_briefing`에 새 컬럼이 실제로 생겼는지 확인합니다.

```ts
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'daily_briefing'
ORDER BY ordinal_position;
```

`0005` 적용 후 기대값:

- `key_bill_ids`
- `new_bill_ids`

### 1-2. 순서 규칙

마이그레이션이 여러 개 쌓여 있으면 파일 번호 순서대로 적용합니다.

- `0001` → `0002` → `0003` → `0004` → `0005`

중간 번호를 건너뛰지 않습니다.

---

## 2. Next.js 데모 앱 재배포

### 필수 환경

- `DEMO_MODE=true`
- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- 나머지 앱 필수 env

### 체크 포인트

- 데모는 인증 없이 읽기 가능해야 함
- 쓰기 API는 403이어야 함
- `/briefing`이 500 없이 떠야 함

### 최소 스모크 경로

브라우저 또는 배포 URL 기준으로 아래를 확인합니다.

- `/api/health`
- `/briefing`
- `/radar`
- `/watch`
- `/legislators`
- `/settings`

특히 `/briefing`은 `daily_briefing` 스키마 변화 영향을 가장 먼저 받으므로 우선 확인합니다.

### 데모가 깨졌을 때 가장 먼저 볼 것

1. 최근 마이그레이션이 대상 DB에 적용됐는가
2. `daily_briefing`, `legislator`, `legislation_notice` 등 최근 바뀐 테이블 컬럼이 실제로 있는가
3. Vercel이 새 커밋으로 다시 배포됐는가
4. `DEMO_MODE=true`가 유지되고 있는가

---

## 3. 정적 예제 재생성

UI 변경이 있었다면 반드시 같이 갱신합니다.

### 3-1. 로컬 서버 실행

```bash
pnpm dev
```

### 3-2. 정적 HTML export

새 터미널에서:

```bash
pnpm tsx scripts/export-static.ts
```

생성물:

- `examples/briefing.html`
- `examples/radar.html`
- `examples/watch.html`
- 기타 페이지별 html

### 3-3. 단일 번들 재생성

```bash
pnpm tsx scripts/bundle-static.ts
```

생성물:

- `examples/app.html`

### 3-4. 오프라인 검증

```bash
pnpm tsx scripts/verify-bundle.ts
```

성공 기준:

- `file://`로 열렸을 때 탭 전환이 된다
- `briefing`, `radar`, `assembly`, `watch` 해시 라우팅이 된다

### 3-5. docs/index.html 갱신

배포/문서용 인덱스를 별도로 쓰고 있다면 정적 예제와 함께 최신 상태로 맞춥니다.

---

## 4. `0005_daily_briefing_snapshots.sql` 전용 메모

이 마이그레이션은 `daily_briefing`에 다음 컬럼을 추가합니다.

- `key_bill_ids`
- `new_bill_ids`

이 컬럼을 쓰는 코드는 `/briefing`에서 브리핑 HTML과 좌측 카드 목록을 같은 스냅샷으로 맞추기 위해 필요합니다.

데모 DB가 이 마이그레이션 없이 새 코드를 읽으면, 하위 호환 방어가 없다면 `/briefing`이 깨질 수 있습니다.

현재 코드는 호환 fallback을 포함하지만, 운영 기준 정답은 여전히 “먼저 마이그레이션 적용”입니다.

---

## 5. 배포 후 확인 체크리스트

- [ ] `pnpm exec tsc --noEmit`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] 대상 DB에 최신 migration 적용
- [ ] `information_schema`로 신규 컬럼 확인
- [ ] `/api/health` 200 확인
- [ ] `/briefing` 진입 확인
- [ ] `/radar`, `/watch`, `/legislators`, `/settings` 진입 확인
- [ ] 데모 모드에서 수정 액션이 차단되는지 확인
- [ ] UI 변경 시 `examples/*.html` 재생성
- [ ] `examples/app.html` 재생성
- [ ] `pnpm tsx scripts/verify-bundle.ts` 통과

---

## 6. 권장 커밋 단위

운영 사고를 줄이려면 배포 관련 변경도 아래처럼 쪼개는 편이 좋습니다.

1. `feat/db:` 또는 `fix(db:)`
   - schema
   - migration

2. `feat(app:)` 또는 `fix(app:)`
   - 새 컬럼을 읽는 앱 코드

3. `chore(examples:)`
   - `examples/*.html`
   - `examples/app.html`
   - `docs/index.html`

4. `docs:`
   - 런북
   - setup/deploy 문서

---

## 7. 장애 대응 한 줄 요약

데모가 갑자기 깨졌다면 가장 먼저 이걸 의심합니다.

> 새 코드가 기대하는 DB 컬럼이 데모 DB에 아직 없다.

이 경우 우선순위는 항상 같습니다.

1. migration 적용 여부 확인
2. 컬럼 존재 확인
3. 앱 재배포
4. `/briefing`부터 스모크 테스트

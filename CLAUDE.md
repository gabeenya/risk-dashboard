# CLAUDE.md

이 파일은 이 저장소에서 작업할 때 Claude Code가 참고할 가이드입니다.

## 규칙
git commit 및 push 는 마음대로 하지 말고 사용자에게 맡기기.

## 프로젝트 개요

**외식BG RO실 리스크 관리 시스템 (Risk Monitoring & Analytics Platform)**

이랜드 외식BG의 11개 리스크 영역(불법파견·표시광고·가맹·IP·노무·영업비밀·부실채권·위생·안전·클레임·징계)을 모니터링하고, 적발 건수와 처리 상태를 추적하며, PPT 보고서와 AI 분석 리포트를 생성하는 한국어 단일 페이지 웹 애플리케이션.

## 아키텍처

**모듈화된 정적 SPA**: `index.html`은 마크업과 외부 라이브러리/스크립트 로드 선언만 담당하고, 실제 로직은 `assets/css/`·`assets/js/` 아래 페이지·기능 단위로 분리되어 있습니다. CI 빌드는 없습니다 — **GitHub Pages**에서 `main` 브랜치를 그대로 서빙합니다. 단, JS는 커밋 전 로컬에서 난독화를 거칩니다(아래 `assets/js-min/` 참고) — 이 의미에서만 "빌드 단계"가 있습니다.

**파일 레이아웃**:
```
risk_dashboard/
├─ index.html              # 마크업 + CDN/자산 로드만 (script src는 assets/js-min/* 를 가리킴)
├─ manifest.json           # PWA 매니페스트 (홈 화면 설치용 이름/아이콘/테마색)
├─ sw.js                   # PWA 서비스워커 — 같은 출처 정적 자산만 캐시, Supabase/CDN은 항상 네트워크
├─ assets/
│  ├─ css/     base.css · dashboard.css · input.css · admin.css · ai.css
│  ├─ js/      원본 소스 — 실제 편집은 항상 여기서. config · constants · state · utils
│  │           · auth · nav · dashboard · input · adwatch · admin · ai · ppt · main
│  ├─ js-min/  난독화된 배포용 산출물 — 직접 편집 금지, tools/obfuscate.ps1이 assets/js/*
│  │           로부터 자동 생성. index.html/sw.js가 실제로 로드하는 건 이 폴더.
│  └─ img/     로고 + PWA 아이콘(icon-192/512, icon-maskable-512, apple-touch-icon)
└─ supabase/
   ├─ config.toml
   ├─ migrations/                       # ALTER/CREATE 문서화용 (실제 적용은 콘솔에서)
   └─ functions/
      ├─ auth-login/index.ts            # 로그인 검증·세션 발급/검증/갱신·비밀번호 변경 (service role, 클라이언트로 pw 해시 미노출)
      ├─ admin-users/index.ts           # 관리자 페이지의 users 관리(승인/역할변경/권한수정/삭제/신규계정) — 토큰 소유자가 OWNER_IDS인지 서버에서 재검증
      ├─ ai-analyze/index.ts            # Anthropic API 프록시 (Edge Function)
      ├─ ad-watch-scan/index.ts         # 표시광고 뒷광고 의심 자동 모니터링 (검색+본문수집+AI판별) — 스캔 직후 Resend 이메일 발송
      └─ weekly-report/index.ts         # 전체 11개 영역 주간 진단 리포트: KPI표·추이·SLA·급증경보·반복고위험·영역별 권고 (pg_cron → Claude 요약 → Resend 발송)
```

**스크립트 로드 순서** (index.html:32-43, 모두 `defer`):
`config → constants → state → utils → auth → nav → dashboard → input → adwatch → admin → ai → ppt → main`

각 JS 파일은 IIFE/모듈 시스템 없이 **전역 함수·전역 변수**로 동작합니다. 새 함수를 추가할 때 전역 네임스페이스에 그대로 노출되며, 다른 파일에서 호출 가능합니다 — 이름 충돌에 주의.

**JS 난독화** (`assets/js/` → `assets/js-min/`): `tools/obfuscate.ps1`이 `npx javascript-obfuscator`로 `assets/js/*.js` 각각을 난독화해 `assets/js-min/*.js`에 생성합니다. **`assets/js/`가 유일한 편집 대상**이고, `assets/js-min/`은 매번 통째로 재생성되는 산출물이라 직접 고치면 다음 빌드에서 사라집니다. 전역 스코프 이름(함수/변수)은 절대 바꾸지 않도록 `rename-globals=false`로 고정되어 있습니다 — 각 파일이 `<script defer>`로 개별 로드되며 `esc()`/`SB_URL`/`TYPES` 같은 전역을 파일 간에 그대로 공유하기 때문입니다(모듈 번들이 아님). 콘솔 출력 차단도 켜지 않습니다 — 앱이 에러 토스트에서 "콘솔(F12) 확인"을 안내하므로.

**캐시 버스터**: `index.html` 상단의 `window.__ASSET_V`(index.html:18)와 모든 `<link>/<script>`의 `?v=YYYYMMDD<suffix>`(예: `?v=20260428m`)는 **같은 값**으로 일괄 갱신해야 합니다. CSS·JS를 수정해 배포할 때마다 새 값으로 바꿔주세요 — 그래야 사용자 브라우저가 옛 캐시를 버립니다. 같은 날 두 번 배포하면 `m → n → o` 식으로 접미사만 올리면 됩니다.

> **자동 갱신**: 프로젝트 루트에서 `powershell -ExecutionPolicy Bypass -File .\tools\update-cache-buster.ps1` 실행하면 (1) `tools/obfuscate.ps1`을 먼저 돌려 `assets/js-min/`을 재생성하고 (2) `__ASSET_V`와 모든 `?v=` 값을 한 번에 새 버전으로 바꿔줍니다(같은 날이면 접미사 한 칸 증가, 날짜가 바뀌면 `a`부터 재시작). CSS·JS·index.html을 수정했다면 커밋 직전 이 스크립트 하나만 돌리세요. `sw.js`의 `CACHE_VERSION`도 이 스크립트가 같은 값으로 함께 갱신합니다.

**PWA**: `manifest.json` + `sw.js`로 홈 화면 설치(Add to Home Screen)를 지원합니다. 서비스워커는 같은 출처의 정적 자산(css/js/이미지)만 캐시하고, Supabase REST/Edge Function 호출과 외부 CDN은 그대로 네트워크로 흘려보내 항상 최신 데이터를 받습니다(assets/js/main.js에서 등록). 아이콘은 PowerShell(`System.Drawing`)로 생성한 정적 PNG라 로고를 바꾸면 재생성 필요.

**외부 의존성** (CDN 로드, 번들 없음, index.html:10-12):
- `Chart.js 4.4.1` — 라인/도넛/바 차트
- `pptxgenjs 3.12.0` — PPTX 보고서 생성
- `marked@12` — AI 응답 마크다운을 HTML로 렌더링

**백엔드**:
- **Supabase REST API** (SDK 미사용) — `records` 테이블 CRUD만 클라이언트가 anon key로 직접 호출한다. `sbGet`/`sbIns`/`sbUpd`/`sbDel` 헬퍼가 `fetch`로 직접 호출 (assets/js/config.js). `users` 테이블은 SELECT/UPDATE/DELETE가 RLS로 완전히 막혀 있고, 가입 신청용 INSERT(status='pending', role='user' 조합만)만 열려 있다 (supabase/migrations/20260821_lock_down_users.sql) — 나머지 users 관련 동작은 전부 아래 두 Edge Function을 거친다.
- **Supabase Edge Function `auth-login`** — 로그인 비밀번호 검증·세션 토큰(서명된 HMAC) 발급/검증/갱신·비밀번호 변경을 service role로 처리 (supabase/functions/auth-login/index.ts). 클라이언트는 더 이상 `users.pw`를 직접 비교하지 않는다 — `assets/js/auth.js`의 `authCall()`이 이 함수를 호출. 세션은 `sessionStorage`에 `{token, exp}`로 저장하고 새로고침마다 서버에 `verify`로 재검증(위조 불가).
- **Supabase Edge Function `admin-users`** — 관리자 페이지(가입 승인/거절, 역할·브랜드·영역 권한 수정, 이름 변경, 계정 추가/삭제)의 `users` 쓰기를 service role로 처리 (supabase/functions/admin-users/index.ts). 요청마다 토큰을 검증하고 그 소유자가 `OWNER_IDS`(함수 안에 상수 복제, `assets/js/constants.js`와 반드시 동일하게 유지)에 있는지 서버에서 재확인한다 — `assets/js/admin.js`의 `adminCall()`이 호출.
  둘 다 필요 시크릿: `AUTH_TOKEN_SECRET`(신규 — `openssl rand -hex 32` 등으로 생성, 프로젝트 시크릿이라 두 함수가 값을 공유), `SUPABASE_SERVICE_ROLE_KEY`(자동 제공).
- **Supabase Edge Function `ai-analyze`** — Anthropic API 호출 프록시. 클라이언트는 prompt만 POST하고, Edge Function이 시크릿에 보관된 `ANTHROPIC_API_KEY`로 Anthropic을 호출합니다 (supabase/functions/ai-analyze/index.ts). 호출 모델은 `claude-sonnet-4-6`.
- **Supabase Edge Function `ad-watch-scan`** — 스캔이 끝나면 등급별(의심/주의/낮음) 집계와 '의심' 후보 목록을 Resend로 즉시 이메일 발송합니다(스캔 직후 알림형). 표시광고 영역에 국한된 알림이며, 전체 영역 정기 리포트(`weekly-report`)와는 별개.
- **Supabase Edge Function `weekly-report`** — 매주 금요일 15:00 KST에 pg_cron(`supabase/migrations/20260803_weekly_report_cron.sql`)이 트리거. `records` 전체 11개 영역에 대해 영역별 KPI 표·전주 대비 추이(막대 비교)·SLA 초과(14일 이상 미해결)·전월 대비 임계치 경보·최근 60일 반복/고위험 항목(같은 영역·브랜드 조합이 반복되거나 누적 건수가 많은 경우)을 집계하고, Claude로 진단 요약 + 영역별(11개 전체, 각 최소 1개) 권고 조치를 생성해 Resend로 이메일 발송 (supabase/functions/weekly-report/index.ts). 표시광고 검토대기 큐는 이 리포트에 포함하지 않음(스캔 직후 알림으로 별도 커버). 필요 시크릿(두 함수 공통): `RESEND_API_KEY`, `RESEND_SENDER_EMAIL`(선택, 기본 `onboarding@resend.dev` — Resend 샌드박스 발신 주소), `RESEND_SENDER_NAME`(선택), `REPORT_RECIPIENTS`(콤마 구분 수신자 목록 — 샌드박스 모드에서는 Resend 가입 이메일만 가능). `ANTHROPIC_API_KEY`는 `ai-analyze`와 공유.

## 데이터 모델

Supabase에 두 개의 테이블이 있습니다:

**`records`** — 리스크 적발 기록
- `id` (number, `Date.now()` 사용), `date` (YYYY-MM-DD)
- `type` (6개 영역 중 하나), `subtype` (영역별 상세 위반 유형)
- `brand` (13개 브랜드 중 하나), `store` (선택, 브랜드별 매장명 — `assets/js/constants.js`의 `STORES[brand]` 목록에서 드롭다운 선택. 매장 목록이 없는 브랜드(`상권`/`본부`/`광주ck`/`주안ck`/`기흥ck`/`CX팀`)는 항상 빈 값), `count` (정수)
- `status`: `모니터링` | `위반(처리중)` | `완료`
- `note` (선택), `author` (작성자 이름)

**`users`** — 사용자 계정
- `id`, `name`, `pw` (커스텀 해시 — 아래 보안 메모 참조)
- `role`: `admin` | `user`, `joined` (가입일)

## 도메인 상수 (assets/js/constants.js)

`SUB`, `ILLEGAL_DISPATCH_CATS`, `TYPES`, `BRANDS`, `STORES`, `TC`/`BC`/`SC`/`TYPE_COLORS`, `MONTHS`, `STATS`, `ADMIN` 등 모든 도메인 상수가 한 파일에 모여 있습니다. 영역·브랜드·상세유형을 추가/변경할 때 이곳을 먼저 수정해야 합니다.

`STORES`는 `{브랜드: [매장명, ...]}` 형태로, 데이터 입력 폼(`f-store`)·데이터 목록 인라인 수정·엑셀 일괄 업로드(양식 다운로드·검증) 3곳에서 매장명 드롭다운/검증에 공통으로 사용됩니다 (assets/js/input.js). 매장명이 브랜드 접두어와 다른 경우(예: `뺑드프랑스`→`프랑제리`, `다구오`/`후원`/`반궁`/`스테이크어스`/`테루`/`아시아문`→`프랜차이즈`, `더카페`/`루고`/`페르케노`→`카페`)가 있으니 새 매장을 추가할 때 실제 매장명 접두어가 아니라 소속 브랜드 카테고리 기준으로 넣어야 합니다.

특이 사항:
- **`불법파견`만 13개 브랜드 전체 사용**, 나머지 영역은 9개(`COMMON_BRANDS` = `광주ck/주안ck/기흥ck/CX팀` 제외) — PPT의 영역별 상세 슬라이드 표 너비 계산이 이에 의존합니다 (assets/js/ppt.js:19-22, 190).
- 단, **PPT의 불법파견 슬라이드는 10개 브랜드만 출력**합니다(`ILLEGAL_REPORT_BRANDS` = 13개 중 `프랑제리/카페/프랜차이즈` 제외, ppt.js:21-22). 화면(대시보드/입력) 13개 vs 보고서 10개로 다른 점 유의.
- `영업비밀`, `IP`도 `SUB`에 상세 유형이 채워져 있습니다 (예전엔 빈 배열이었으나 현재는 정의됨, constants.js:38-49). 빈 배열이 되는 영역은 없지만 코드는 여전히 빈 배열을 안전하게 처리합니다("해당 없음" 표시).
- 레거시 영역명 `IP(지식재산)`은 `loadData()`에서 `IP`로 자동 정규화 (assets/js/dashboard.js:7).
- `불법파견`의 13개 상세 유형은 `ILLEGAL_DISPATCH_CATS`로 4개 카테고리로 그룹화되어 있으나, 현재 PPT에서는 이 그룹화를 직접 사용하지 않고 평면 리스트로 렌더합니다.

## 페이지 / 탭 구조 (index.html:78-279)

- `page-dashboard` — KPI 4개, 라인차트(월별 추이), 도넛(영역/상세 분포), 바(브랜드별), 최근 모니터링 표(상태별 필터 + 페이지네이션)
- `page-input` — 비로그인 시 잠금 화면(`#inputLock`), 로그인 시 입력 폼과 데이터 목록(상세유형/브랜드/건수/상태/비고 인라인 수정 가능)
- `page-ai` — Claude API 호출. 분석 항목(위험도·트렌드·완료율·권고·플랜·브랜드별) 체크박스로 선택, 출력 스타일(노션/신문/터미널) 선택. 마크다운은 `marked`로 HTML 변환.
- `page-admin` — 관리자만 보이는 탭(`#adminTabBtn`은 `role==='admin'`일 때만 표시), 사용자 추가/삭제

탭 전환은 `switchTab()`(assets/js/nav.js:2)이 `.pg.on` 클래스를 토글하는 방식이며, 페이지 진입 시 해당 페이지의 렌더 함수(`loadData`/`renderInputPg`/`renderAdmin` 등)를 호출합니다.

## 명명 규칙

읽기 어려울 정도로 짧은 식별자가 의도적으로 사용됩니다 (`kpi1r`, `sbIns`, `lChart`, `TC`, `BC`, `SC`, `td`, `hp`, `sc`). 새 코드를 추가할 때는 **기존 스타일에 맞춰 짧게** 쓰세요 — 길게 쓰면 주변과 어울리지 않습니다.

주요 약어:
- `sb*` = Supabase 헬퍼 (config.js)
- `l/r/bChart` = line/right(doughnut)/bar 차트 인스턴스 (state.js)
- `TC` = type colors, `BC` = brand colors, `SC` = subtype colors, `TYPE_COLORS` = PPT용 (`#` 없는 hex)
- `strongHash(pw)` = 신규 계정용 비밀번호 해시(PBKDF2), `td()` = 오늘 날짜 문자열, `sc(s)` = status 클래스 매핑 (utils.js)

## 보안 주의사항

이 코드에는 **데모/내부용** 보안 결정이 여러 개 있습니다. 변경 시 모르고 우회하지 않도록 주의하세요:

1. **Supabase publishable key가 클라이언트에 노출**되어 있습니다 (assets/js/config.js:5). RLS(Row Level Security)와 함께 쓰이도록 설계된 키지만, `records`/`ad_watch_candidates` 테이블의 실제 RLS 정책(INSERT/UPDATE/DELETE)은 Supabase 콘솔에만 있어 코드로 확인 불가합니다. 현재 구조상 로그인 여부와 무관하게 이 키만 있으면 `records` REST 엔드포인트를 직접 호출해 읽기/쓰기가 가능합니다(로그인 화면은 UI 게이트일 뿐 DB 레벨 인가가 아님) — 근본적으로 닫으려면 Supabase Auth로 전환하거나 모든 쓰기를 Edge Function(service role) 경유로 옮겨야 합니다(아직 미착수). `users` 테이블은 아래 2번 대로 이미 잠겨 있습니다. 변경 전 Supabase 콘솔의 RLS 정책을 먼저 확인하세요.
2. **비밀번호 해시 · users 테이블 접근**: 로그인 검증은 `supabase/functions/auth-login`, 관리자의 사용자 관리는 `supabase/functions/admin-users`가 서버(service role)에서 처리합니다. 신규 계정은 PBKDF2-SHA256(100,000회, salt) 형식(`pbkdf2:salt:hash`, assets/js/utils.js `strongHash()`)으로 저장되고, 예전에 클라이언트가 직접 비교하던 djb2 변형 해시(`hp()`)는 완전히 제거되었습니다 — 레거시 계정은 다음 로그인 성공 시 자동으로 pbkdf2로 승격됩니다. `users` 테이블은 `supabase/migrations/20260821_lock_down_users.sql`로 anon SELECT/UPDATE/DELETE를 전부 차단했고, INSERT도 가입 신청 모양(status='pending', role='user')으로만 허용됩니다 — REST로 비밀번호 해시를 직접 조회하거나 role을 조작하는 경로는 막혔습니다.
3. **관리자 계정은 자동 생성되지 않습니다.** `users` 테이블이 비어 있으면 아무도 로그인할 수 없으므로, 최초 1회는 Supabase 콘솔에서 `id='admin', role='admin'`으로 직접 시드해야 합니다. `pw` 값은 `tools/password-hash.html`(로컬 전용, 네트워크 전송 없음)로 pbkdf2 해시를 만들어 넣으세요.
4. **세션**: `sessionStorage`에는 `AUTH_TOKEN_SECRET`으로 서명된 토큰(`{token, exp}`)만 저장하고, 새로고침마다 `auth-login`의 `verify` 액션으로 서버에 재검증을 맡깁니다. 클라이언트가 sessionStorage 값을 직접 조작해도(예: 관리자 id로 위조) 서명을 통과하지 못해 로그인되지 않습니다.
5. **Anthropic API 키는 Supabase Edge Function 시크릿에 보관** — 클라이언트 코드에는 없습니다. AI 분석은 `${SB_URL}/functions/v1/ai-analyze`로 prompt만 POST하고 Edge Function이 대신 호출합니다 (assets/js/ai.js:122-132, supabase/functions/ai-analyze/index.ts:32-48). 키를 운영하려면 Supabase 대시보드의 Edge Function 환경변수에서 `ANTHROPIC_API_KEY`를 설정하세요. **절대 클라이언트 코드(`assets/js/*`)에 직접 박지 마세요** — GitHub Pages는 공개 URL입니다.

## 개발 / 실행

- CI 빌드는 없습니다. 로컬에서는 단순 정적 서버(`python -m http.server`, `npx serve` 등)로 띄우면 됩니다. CDN 스크립트 때문에 `file://` 직접 열기는 일부 기능이 제한될 수 있습니다.
- **주의**: `index.html`은 `assets/js-min/`(난독화 산출물)을 로드합니다. `assets/js/*.js`(원본)를 수정한 뒤 로컬 새로고침만으로는 반영되지 않습니다 — `assets/js/`를 편집한 세션에서 브라우저로 동작을 확인하려면 최소한 `powershell -ExecutionPolicy Bypass -File .\tools\obfuscate.ps1`을 먼저 돌려 `assets/js-min/`을 재생성해야 합니다(캐시 버스터까지 함께 갱신하려면 `update-cache-buster.ps1`을 대신 실행).
- 데이터를 보려면 Supabase에 `records`, `users` 테이블이 존재해야 합니다.
- AI 분석을 테스트하려면 Edge Function `ai-analyze`가 배포되어 있고 `ANTHROPIC_API_KEY` 시크릿이 설정되어 있어야 합니다. 로컬에서 함수 코드를 수정했다면 `supabase functions deploy ai-analyze`로 재배포 필요.
- 변경 후에는 브라우저에서 직접 확인 — 자동 테스트가 없습니다. UI 변경 시 4개 탭(대시보드/데이터 입력/AI 분석/관리자)을 모두 한 번씩 열어 회귀를 확인하세요.

## 배포 (GitHub Pages)

- 배포 방식: **GitHub Pages**. `main` 브랜치에 푸시하면 자동으로 반영됩니다 (별도 빌드/배포 워크플로 없음).
- 운영 반영 절차: 변경 사항을 커밋 → `git push origin main` → 잠시(보통 1~2분) 후 Pages가 새 버전을 서빙.
- **CSS·JS 수정 시**: `index.html`의 `__ASSET_V`와 모든 `?v=` 쿼리 값을 같은 새 값으로 함께 갱신해야 사용자 캐시가 무효화됩니다 (위 “캐시 버스터” 참조).
- **Edge Function은 별도 배포**: `supabase/functions/ai-analyze`는 GitHub Pages가 아니라 Supabase 측에 배포되어야 합니다. `git push`로는 배포되지 않으니 `supabase functions deploy ai-analyze`로 별도 적용.
- **클라이언트 노출 주의**: GitHub Pages는 공개 URL입니다. `assets/js/*`에 들어간 모든 키와 코드는 그대로 인터넷에 공개됩니다. Supabase publishable key는 공개 전제 키이지만, RLS가 켜져 있는지 반드시 확인하고 변경하세요.

## PPT 생성 (assets/js/ppt.js)

`pptxgenjs`로 슬라이드를 동적으로 그립니다. `generatePPT()`(ppt.js:303)가 진입점이며, 슬라이드별 빌더로 분리되어 있습니다:

| 슬라이드 | 빌더 | 내용 |
|---|---|---|
| 1 | `buildCoverSlide` | 표지 |
| 2 | `buildOverviewSlide` | 법인 전체 KPI 4개 + 월별 라인차트 |
| 3 | `buildBrandSummarySlide` | 브랜드별 종합 표(연누적·당월 × 영역별 전체/위반 + 합계) |
| 4~ | `buildTypeDetailSlide` | 영역별 상세(상단 표 + 하단 도넛 + KPI 박스) |

공통 헤더는 `addPptHeader`(ppt.js:28). 표 열 너비(`colW`), 좌표 상수(`TABLE_X/Y/H`, `BTM_Y/H`, `SLIDE_W`)와 색상(`PPT_NAVY`, `TYPE_COLORS`, `SUB_COLORS`)이 파일 상단에 모여 있습니다 — 브랜드/영역 개수를 바꾸면 이 좌표들도 함께 조정해야 합니다.

영역별 상세 슬라이드는 `불법파견`이면 `ILLEGAL_REPORT_BRANDS`(10개), 그 외엔 `COMMON_BRANDS`(9개)를 사용해 셀 폭과 폰트 크기(`bW`, `dataFs`, `rowHeight`)를 분기합니다 (ppt.js:190, 202-206, 258).

## 자주 마주칠 작업

- **새 영역/브랜드/상세 유형 추가**: `assets/js/constants.js`(상수) → `index.html`의 입력 폼/필터 버튼 옵션 → `assets/js/ppt.js`의 좌표·열 너비 순으로 검토.
- **새 상태 값 추가**: `STATS` 배열(constants.js:68)을 늘리고 `sc()` 매핑(utils.js:16-20), `.s-*` CSS 클래스(`assets/css/base.css`), 그리고 위반 집계 로직(여러 곳에서 `status!=='모니터링'` 또는 `status==='완료'`로 판단 — `dashboard.js`, `ai.js`, `ppt.js`)을 모두 일관되게 수정.
- **차트 색상 변경**: `TC` / `BC` / `SC` / `TYPE_COLORS` (constants.js:62-65) — PPT용 `TYPE_COLORS`는 `#` 없는 hex입니다.
- **AI 분석 항목 추가**: `AI_SECTIONS` 객체(ai.js:2-9)에 키와 `{label, instr}`를 추가하고, `index.html`의 `.ai-opt-cb` 체크박스 마크업도 함께 추가. prompt 빌더는 선택된 키들을 자동으로 섹션 리스트로 변환합니다.
- **AI 모델/토큰 변경**: `supabase/functions/ai-analyze/index.ts:43-48`의 `model`/`max_tokens` 수정 후 `supabase functions deploy ai-analyze`로 재배포.

## 응답 언어

이 프로젝트는 한국어 사용자가 운영합니다. 사용자가 별도로 영어를 요청하지 않는 한 한국어로 답하세요.

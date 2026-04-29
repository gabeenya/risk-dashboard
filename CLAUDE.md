# CLAUDE.md

이 파일은 이 저장소에서 작업할 때 Claude Code가 참고할 가이드입니다.

## 규칙
git commit 및 push 는 마음대로 하지 말고 사용자에게 맡기기.

## 프로젝트 개요

**외식BG RO실 리스크 관리 시스템 (Risk Monitoring & Analytics Platform)**

이랜드 외식BG의 6개 리스크 영역(가맹·불법파견·표시광고·노무·영업비밀·IP)을 모니터링하고, 적발 건수와 처리 상태를 추적하며, PPT 보고서와 AI 분석 리포트를 생성하는 한국어 단일 페이지 웹 애플리케이션.

## 아키텍처

**모듈화된 정적 SPA**: `index.html`은 마크업과 외부 라이브러리/스크립트 로드 선언만 담당하고, 실제 로직은 `assets/css/`·`assets/js/` 아래 페이지·기능 단위로 분리되어 있습니다. 빌드 단계는 없습니다 — **GitHub Pages**에서 `main` 브랜치를 그대로 서빙합니다.

**파일 레이아웃**:
```
risk_dashboard/
├─ index.html              # 마크업 + CDN/자산 로드만
├─ assets/
│  ├─ css/   base.css · dashboard.css · input.css · admin.css · ai.css
│  └─ js/    config · constants · state · utils · auth · nav
│            · dashboard · input · admin · ai · ppt · main
└─ supabase/
   ├─ config.toml
   └─ functions/ai-analyze/index.ts   # Anthropic API 프록시 (Edge Function)
```

**스크립트 로드 순서** (index.html:32-43, 모두 `defer`):
`config → constants → state → utils → auth → nav → dashboard → input → admin → ai → ppt → main`

각 JS 파일은 IIFE/모듈 시스템 없이 **전역 함수·전역 변수**로 동작합니다. 새 함수를 추가할 때 전역 네임스페이스에 그대로 노출되며, 다른 파일에서 호출 가능합니다 — 이름 충돌에 주의.

**캐시 버스터**: `index.html` 상단의 `window.__ASSET_V`(index.html:18)와 모든 `<link>/<script>`의 `?v=YYYYMMDD<suffix>`(예: `?v=20260428m`)는 **같은 값**으로 일괄 갱신해야 합니다. CSS·JS를 수정해 배포할 때마다 새 값으로 바꿔주세요 — 그래야 사용자 브라우저가 옛 캐시를 버립니다. 같은 날 두 번 배포하면 `m → n → o` 식으로 접미사만 올리면 됩니다.

**외부 의존성** (CDN 로드, 번들 없음, index.html:10-12):
- `Chart.js 4.4.1` — 라인/도넛/바 차트
- `pptxgenjs 3.12.0` — PPTX 보고서 생성
- `marked@12` — AI 응답 마크다운을 HTML로 렌더링

**백엔드**:
- **Supabase REST API** (SDK 미사용) — `records`/`users` 테이블 CRUD. `sbGet`/`sbIns`/`sbUpd`/`sbDel` 헬퍼가 `fetch`로 직접 호출 (assets/js/config.js).
- **Supabase Edge Function `ai-analyze`** — Anthropic API 호출 프록시. 클라이언트는 prompt만 POST하고, Edge Function이 시크릿에 보관된 `ANTHROPIC_API_KEY`로 Anthropic을 호출합니다 (supabase/functions/ai-analyze/index.ts). 호출 모델은 `claude-sonnet-4-5`, `max_tokens: 2000`.

## 데이터 모델

Supabase에 두 개의 테이블이 있습니다:

**`records`** — 리스크 적발 기록
- `id` (number, `Date.now()` 사용), `date` (YYYY-MM-DD)
- `type` (6개 영역 중 하나), `subtype` (영역별 상세 위반 유형)
- `brand` (13개 브랜드 중 하나), `count` (정수)
- `status`: `모니터링` | `위반(처리중)` | `완료`
- `note` (선택), `author` (작성자 이름)

**`users`** — 사용자 계정
- `id`, `name`, `pw` (커스텀 해시 — 아래 보안 메모 참조)
- `role`: `admin` | `user`, `joined` (가입일)

## 도메인 상수 (assets/js/constants.js)

`SUB`, `ILLEGAL_DISPATCH_CATS`, `TYPES`, `BRANDS`, `TC`/`BC`/`SC`/`TYPE_COLORS`, `MONTHS`, `STATS`, `ADMIN` 등 모든 도메인 상수가 한 파일에 모여 있습니다. 영역·브랜드·상세유형을 추가/변경할 때 이곳을 먼저 수정해야 합니다.

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
- `hp(pw)` = 비밀번호 해시, `td()` = 오늘 날짜 문자열, `sc(s)` = status 클래스 매핑 (utils.js)

## 보안 주의사항

이 코드에는 **데모/내부용** 보안 결정이 여러 개 있습니다. 변경 시 모르고 우회하지 않도록 주의하세요:

1. **Supabase publishable key가 클라이언트에 노출**되어 있습니다 (assets/js/config.js:5). RLS(Row Level Security)와 함께 쓰이도록 설계된 키지만, 현재 스키마의 RLS 설정은 코드에서 확인 불가합니다 — 변경 전 Supabase 콘솔의 RLS 정책을 먼저 확인하세요.
2. **비밀번호 해시 `hp()`** 는 단순 문자열 해시(djb2 변형)입니다 (assets/js/utils.js:3-10). 암호학적 해시가 아니므로 패스워드 보호용으로 적절하지 않습니다 — 운영 전환 시 Supabase Auth 같은 표준 방식으로 교체 권장.
3. **관리자 기본 계정**: `admin` / `admin1234`가 `init()`에서 자동 생성됩니다 (assets/js/main.js:6-9).
4. **Anthropic API 키는 Supabase Edge Function 시크릿에 보관** — 클라이언트 코드에는 없습니다. AI 분석은 `${SB_URL}/functions/v1/ai-analyze`로 prompt만 POST하고 Edge Function이 대신 호출합니다 (assets/js/ai.js:122-132, supabase/functions/ai-analyze/index.ts:32-48). 키를 운영하려면 Supabase 대시보드의 Edge Function 환경변수에서 `ANTHROPIC_API_KEY`를 설정하세요. **절대 클라이언트 코드(`assets/js/*`)에 직접 박지 마세요** — GitHub Pages는 공개 URL입니다.

## 개발 / 실행

- 빌드 도구가 없습니다. 로컬에서는 단순 정적 서버(`python -m http.server`, `npx serve` 등)로 띄우면 됩니다. CDN 스크립트 때문에 `file://` 직접 열기는 일부 기능이 제한될 수 있습니다.
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

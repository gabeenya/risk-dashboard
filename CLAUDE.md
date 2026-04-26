# CLAUDE.md

이 파일은 이 저장소에서 작업할 때 Claude Code가 참고할 가이드입니다.

## 프로젝트 개요 

**외식BG RO실 리스크 관리 시스템 (Risk Monitoring & Analytics Platform)**

이랜드 외식BG의 6개 리스크 영역(가맹·불법파견·표시광고·노무·영업비밀·IP)을 모니터링하고, 적발 건수와 처리 상태를 추적하며, PPT 보고서와 AI 분석 리포트를 생성하는 한국어 단일 페이지 웹 애플리케이션.

## 아키텍처

**단일 파일 SPA**: 전체 앱이 `index.html` 하나(약 980줄)에 들어 있습니다. HTML / CSS / JavaScript 모두 한 파일에 인라인되어 있고 빌드 단계가 없습니다. **GitHub Pages**로 배포되는 정적 사이트입니다 — `main` 브랜치의 `index.html`이 그대로 서빙됩니다.

**외부 의존성** (CDN 로드, 번들 없음):
- `Chart.js 4.4.1` — 라인/도넛/바 차트
- `pptxgenjs 3.12.0` — PPTX 보고서 생성
- `Supabase REST API` — 데이터 저장소
- `Anthropic Claude API` — AI 분석 (브라우저 직접 호출)

**백엔드**: Supabase REST API만 사용 (SDK 미사용). `sbGet`/`sbIns`/`sbUpd`/`sbDel` 헬퍼가 `fetch`로 직접 호출합니다 (index.html:332-335).

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

## 도메인 상수 (index.html:337-358)

`SUB`, `ILLEGAL_DISPATCH_CATS`, `TYPES`, `BRANDS` 등 모든 도메인 상수가 한 곳에 모여 있습니다. 영역·브랜드·상세유형을 추가/변경할 때 이곳을 먼저 수정해야 합니다.

특이 사항:
- **`불법파견`만 13개 브랜드 전체 사용**, 나머지 영역은 9개(`COMMON_BRANDS` = `광주ck/주안ck/기흥ck/CX팀` 제외) — PPT 슬라이드 4번 이후의 표 너비 계산이 이에 의존합니다 (index.html:746-747, 764).
- `영업비밀`, `IP(지식재산)`은 `SUB`에서 빈 배열로 정의되어 있어 상세 유형 선택 UI가 “해당 없음”으로 표시됩니다 (index.html:412).
- `불법파견`의 13개 상세 유형은 `ILLEGAL_DISPATCH_CATS`로 4개 카테고리로 그룹화되어 PPT에서만 사용됩니다.

## 페이지 / 탭 구조 (index.html:167-309)

- `page-dashboard` — KPI 4개, 라인차트(월별 추이), 도넛(영역/상세 분포), 바(브랜드별), 최근 모니터링 표
- `page-input` — 비로그인 시 잠금 화면(`#inputLock`), 로그인 시 입력 폼과 데이터 목록
- `page-ai` — AI 분석 (Claude API 호출)
- `page-admin` — 관리자만 보이는 탭 (`#adminTabBtn`은 `role==='admin'`일 때만 표시), 사용자 추가/삭제

탭 전환은 `switchTab()`이 `.pg.on` 클래스를 토글하는 방식입니다.

## 명명 규칙

읽기 어려울 정도로 짧은 식별자가 의도적으로 사용됩니다 (`kpi1r`, `sbIns`, `lChart`, `TC`, `BC`, `SC`, `td`, `hp`, `sc`). 새 코드를 추가할 때는 **기존 스타일에 맞춰 짧게** 쓰세요 — 길게 쓰면 주변과 어울리지 않습니다.

주요 약어:
- `sb*` = Supabase 헬퍼
- `l/r/bChart` = line/right(doughnut)/bar 차트 인스턴스
- `TC` = type colors, `BC` = brand colors, `SC` = subtype colors
- `hp(pw)` = 비밀번호 해시, `td()` = 오늘 날짜 문자열, `sc(s)` = status 클래스 매핑

## 보안 주의사항

이 코드에는 **데모/내부용** 보안 결정이 여러 개 있습니다. 변경 시 모르고 우회하지 않도록 주의하세요:

1. **Supabase publishable key가 클라이언트에 노출**되어 있습니다 (index.html:329-330). 이 키는 RLS(Row Level Security)와 함께 쓰이도록 설계된 키지만, 현재 스키마에 RLS가 어떻게 설정되어 있는지는 코드에서 확인 불가합니다 — 변경 전 Supabase 콘솔의 RLS 정책을 먼저 확인하세요.
2. **비밀번호 해시 `hp()`** 는 단순 문자열 해시(djb2 변형)입니다 (index.html:379). 암호학적 해시가 아니므로 패스워드 보호용으로 적절하지 않습니다 — 운영 전환 시 Supabase Auth 같은 표준 방식으로 교체 권장.
3. **관리자 기본 계정**: `admin` / `admin1234`가 `init()`에서 자동 생성됩니다 (index.html:364).
4. **Anthropic API 키 필드가 비어 있음** (index.html:962). 현재 AI 분석을 실행하면 API 오류가 발생합니다. 키를 코드에 직접 넣지 말고, 운영 전환 시 백엔드 프록시 또는 `.env`+빌드 단계 도입을 검토하세요.

## 개발 / 실행

- 빌드 도구가 없습니다. 로컬에서는 `index.html`을 더블클릭하거나 단순 정적 서버(`python -m http.server`, `npx serve` 등)로 띄우면 됩니다.
- 데이터를 보려면 Supabase에 `records`, `users` 테이블이 존재해야 합니다.
- 변경 후에는 브라우저에서 직접 확인 — 자동 테스트가 없습니다. UI 변경 시 4개 탭(대시보드/데이터 입력/AI 분석/관리자)을 모두 한 번씩 열어 회귀를 확인하세요.

## 배포 (GitHub Pages)

- 배포 방식: **GitHub Pages**. `main` 브랜치에 푸시하면 자동으로 반영됩니다 (별도 빌드/배포 워크플로 없음).
- 운영 반영 절차: 변경 사항을 커밋 → `git push origin main` → 잠시(보통 1~2분) 후 Pages가 새 버전을 서빙.
- 최근 커밋이 모두 `Update index.html`인 것은 GitHub 웹 에디터로 수정한 흔적으로 보입니다 — 의미 있는 변경에는 어떤 영역/기능을 바꿨는지 알 수 있는 커밋 메시지를 권장합니다.
- **클라이언트 노출 주의**: GitHub Pages는 공개 URL입니다. `index.html`에 들어간 모든 키와 코드는 그대로 인터넷에 공개됩니다. Anthropic API 키처럼 비밀이어야 하는 값은 절대 코드에 직접 박지 마세요(보안 주의사항 4번 참조). Supabase publishable key는 공개 전제 키이지만, RLS가 켜져 있는지 반드시 확인하고 변경하세요.

## PPT 생성 (`generatePPT`, index.html:561-945)

`pptxgenjs`로 슬라이드를 동적으로 그립니다. 슬라이드 구성:
1. 표지
2. 법인 전체 KPI + 월별 라인차트
3. 브랜드별 종합 테이블 (연누적/당월 × 영역별)
4~ 영역별 상세 (상단 표 + 하단 도넛 + KPI 박스). `불법파견`은 13개 브랜드 + 4개 카테고리 그룹 헤더로 다른 레이아웃을 사용합니다.

표 열 너비(`colW`)와 슬라이드 좌표가 하드코딩되어 있습니다 — 브랜드/영역 개수를 바꾸면 `BRANDS`, `TYPES` 외에 PPT 좌표도 함께 조정해야 합니다.

## 자주 마주칠 작업

- **새 영역/브랜드/상세 유형 추가**: index.html:337-358의 상수 → 데이터 입력 폼의 옵션 → PPT 좌표 순으로 검토.
- **새 상태 값 추가**: `STATS` 배열(index.html:358)을 늘리고 `sc()` 매핑(index.html:381), `.s-*` CSS 클래스(index.html:80-82), 그리고 위반 집계 로직(여러 곳에서 `status!=='모니터링'` 또는 `status==='완료'`로 판단)을 모두 일관되게 수정.
- **차트 색상 변경**: `TC` / `BC` / `SC` / `TYPE_COLORS` (index.html:353-356) — PPT용 `TYPE_COLORS`는 `#` 없는 hex입니다.

## 응답 언어

이 프로젝트는 한국어 사용자가 운영합니다. 사용자가 별도로 영어를 요청하지 않는 한 한국어로 답하세요.

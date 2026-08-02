// ── 전역 런타임 상태 ─────────────────────────────────
let records     = [];
let notes       = [];
let users       = [];
let lChart, rChart, bChart;
let curFilter   = 'all';
let curBrand    = 'all';    // 대시보드 브랜드 필터: 'all' | <brand>
let curType     = '불법파견';
let user        = null;
let deleted     = null;
let uTimer      = null;
let recentPage  = 0;
let recentStatus = 'all';   // 최근 모니터링 상태별 필터: all | 모니터링 | 위반(처리중) | 완료
let selYm       = '';       // 대시보드 기준 월(YYYY-MM). ''이면 당월. 도넛/막대/최근/히트맵/당월KPI/알림이 이 월로 스코프됨
let inpSub      = 'all';    // 데이터 입력 목록 — 상세유형 필터: 'all' | <subtype>
let inpBrand    = 'all';    // 데이터 입력 목록 — 브랜드 필터: 'all' | <brand>
let inpStat     = 'all';    // 데이터 입력 목록 — 상태 필터: 'all' | <status>
let inpSelected = new Set(); // 데이터 입력 목록 — 다중 선택된 레코드 id 집합 (다중/전체 삭제용)
let curDashCat  = 'all';    // 대시보드 분류 필터: 'all' | 카테고리명
let curInputCat = 'all';    // 데이터 입력 분류 필터: 'all' | 카테고리명
let adWatchCandidates = []; // 표시광고 뒷광고 의심 자동 모니터링 — 스캔 후보 목록

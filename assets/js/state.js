// ── 전역 런타임 상태 ─────────────────────────────────
let records     = [];
let users       = [];
let lChart, rChart, bChart;
let curFilter   = 'all';
let curType     = '가맹';
let user        = null;
let deleted     = null;
let uTimer      = null;
let recentPage  = 0;
let recentStatus = 'all';   // 최근 모니터링 상태별 필터: all | 모니터링 | 위반(처리중) | 완료
let inpSub      = 'all';    // 데이터 입력 목록 — 상세유형 필터: 'all' | <subtype>
let inpBrand    = 'all';    // 데이터 입력 목록 — 브랜드 필터: 'all' | <brand>

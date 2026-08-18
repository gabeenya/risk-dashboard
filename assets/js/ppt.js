// ── PPT 보고서 생성 ──────────────────────────────────
// pptxgenjs로 슬라이드를 동적으로 그림.
// 슬라이드 좌표·열 너비는 모두 하드코딩 — 브랜드/영역 개수를 바꾸면 좌표도 함께 조정 필요.

// 색상 (# 없는 hex)
const PPT_NAVY  = '1e3a8a';
const PPT_WHITE = 'FFFFFF';
const PPT_GBG   = 'f8f9fc';

// 슬라이드 4~ 공통 좌표
const TABLE_X = 0.15;
const TABLE_Y = 0.85;
const TABLE_H = 3.25;
const BTM_Y   = 4.20;
const BTM_H   = 1.35;
const SLIDE_W = 9.7;

// 불법파견에만 포함되는 브랜드 / 일반 영역 브랜드
const ILLEGAL_ONLY_BRANDS    = ['광주ck','주안ck','기흥ck','CX팀'];
const COMMON_BRANDS          = BRANDS.filter(b => !ILLEGAL_ONLY_BRANDS.includes(b));
const ILLEGAL_REPORT_EXCLUDE = ['프랑제리','카페','프랜차이즈'];
const ILLEGAL_REPORT_BRANDS  = BRANDS.filter(b => !ILLEGAL_REPORT_EXCLUDE.includes(b));

// 영역별 도넛 색상 풀 (13색)
const SUB_COLORS = ['1e3a8a','e8845a','5eba8a','e8c35a','9b7ed4','e87a9f','5abfbf','c4a86e','7ab8d4','d4846e','82c4a0','b8a0d4','e8a05a'];

// ── 영업비밀 10:1 환산 안내 푸터 (슬라이드 내 적정 위치에 표기) ─
// compact: true → 한 줄 7pt(공간 부족 슬라이드용) / false → 2줄(예시 포함)
function addVioNote(slide, y, compact) {
  if (compact) {
    slide.addText("※ 영업비밀 '모니터링 건수' 10:1 환산 / '위반 건수' 1:1 정상값 반영.   (ex. 실제 모니터링 1,540건·위반 3건 → 그래프 154·3건)", {
      x: 0.15, y: y, w: 9.7, h: 0.18,
      fontSize: 7, color: '64748b', fontFace: 'Calibri', valign: 'middle'
    });
  } else {
    slide.addText([
      { text: "※ 영업비밀 '모니터링 건수'의 경우 10:1 환산 반영 / '위반 건수'의 경우 1:1 정상값 반영.", options: { fontSize: 8, color: '64748b', breakLine: true } },
      { text: "(ex. 실제 모니터링 건수가 1,540건, 위반 건수가 3건인 경우 그래프 내 각 154건, 3건으로 반영)", options: { fontSize: 7, color: '94a3b8' } }
    ], { x: 0.15, y: y, w: 9.7, h: 0.30, fontFace: 'Calibri', valign: 'top' });
  }
}

// 영업비밀 행은 모니터링 합계 시 10:1 환산 (위반은 원값)
function pptMonCnt(r) { return r.type === '영업비밀' ? r.count / 10 : r.count; }
// 연 누적 컷오프 — 대시보드 dY 로직(dashboard.js)과 동일: 기준 연도 1월 ~ 기준 월까지만 포함
// (기준월 이후에 입력된 최신 데이터가 "연누적"에 섞여 들어가지 않도록 함)
function pptAccCutoff(recs, yr, mo) {
  return recs.filter(r => {
    if (!r.date) return false;
    const [ry, rm] = r.date.split('-').map(Number);
    return ry === yr && rm <= mo;
  });
}
// 표 셀 표시용 — 환산값이 소수가 되면 1자리 표시, 정수면 그대로
function pptFmt(n) {
  if (!n) return '-';
  return Number.isInteger(n) ? n : (Math.round(n * 10) / 10);
}

// ── 공통 헤더 (네이비 띠 + 제목 + 부제) ────────────────
function addPptHeader(pres, slide, title, sub) {
  slide.background = { color: PPT_GBG };
  slide.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.7, fill:{color:PPT_NAVY} });
  slide.addText(title, { x:0.15, y:0.05, w:7.4, h:0.6, fontSize:24, bold:true, color:PPT_WHITE, fontFace:'Calibri', valign:'middle' });
  if (sub) slide.addText(sub, { x:7.6, y:0.05, w:2.25, h:0.6, fontSize:13, color:'CADCFC', fontFace:'Calibri', align:'right', valign:'middle' });
}

// ── 슬라이드 1: 표지 ─────────────────────────────────
function buildCoverSlide(pres, ctx) {
  const { now, monthName } = ctx;
  const s = pres.addSlide();
  s.background = { color: PPT_NAVY };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:4.3, w:10, h:1.325, fill:{color:'16307a'} });
  s.addShape(pres.shapes.RECTANGLE, { x:0.6, y:1.5, w:0.08, h:1.8, fill:{color:'CADCFC'} });
  s.addText('외식BG',                                  { x:0.85, y:1.45, w:8.5, h:0.75, fontSize:36, bold:true, color:PPT_WHITE, fontFace:'Calibri' });
  s.addText(monthName + '월 리스크 관리 현황',           { x:0.85, y:2.15, w:8.5, h:0.75, fontSize:36, bold:true, color:'CADCFC', fontFace:'Calibri' });
  s.addText('Risk Monitoring & Analytics Report',  { x:0.85, y:3.05, w:8.5, h:0.4,  fontSize:15, color:'8fa8c8', fontFace:'Calibri', italic:true });
  s.addText('기준일: ' + now.toLocaleDateString('ko-KR') + '   |   외식BG RO실',
                                                    { x:0.85, y:4.5,  w:8.5, h:0.4,  fontSize:13, color:'8fa8c8', fontFace:'Calibri' });
}

// ── 슬라이드 2: 법인 전체 KPI + 월별 라인차트 ────────
function buildOverviewSlide(pres, ctx) {
  const { prevYr, prevMonthName, tot, vio, prevMTot, prevMVio, done, act, rate, vr, mArr } = ctx;
  const s = pres.addSlide();
  addPptHeader(pres, s, '법인 전체 리스크 현황', prevYr + '년 ' + String(prevMonthName).padStart(2,'0') + '월 기준');

  [
    { label:'누적 모니터링', value:pptFmt(tot)+'건',  sub:'위반 '+vio+'건 ('+vr+'%)',                                      color:PPT_NAVY },
    { label:'전월 모니터링', value:pptFmt(prevMTot)+'건', sub:'위반 '+prevMVio+'건 ('+(prevMTot?Math.round(prevMVio/prevMTot*100):0)+'%)', color:'2563eb' },
    { label:'처리 완료율',   value:rate+'%',  sub:'완료 '+done+' / 위반 '+vio+'건',                               color:'15803d' },
    { label:'조치중',       value:act+'건',  sub:'위반(처리중) 상태',                                            color:'94a3b8' }
  ].forEach((k, i) => {
    const x = 0.25 + i * 2.42;
    s.addShape(pres.shapes.RECTANGLE, { x, y:0.8, w:2.25, h:1.3, fill:{color:PPT_WHITE}, shadow:{type:'outer',blur:5,offset:2,angle:135,color:'000000',opacity:0.07} });
    s.addShape(pres.shapes.RECTANGLE, { x, y:0.8, w:0.05, h:1.3, fill:{color:k.color} });
    s.addText(k.label, { x:x+0.12, y:0.88, w:2.1, h:0.26, fontSize:11, color:'94a3b8', fontFace:'Calibri', bold:true });
    s.addText(k.value, { x:x+0.12, y:1.16, w:2.1, h:0.5,  fontSize:26, bold:true, color:'0f172a', fontFace:'Calibri' });
    s.addText(k.sub,   { x:x+0.12, y:1.72, w:2.1, h:0.3,  fontSize:11, color:k.color === '15803d' ? '15803d' : 'c0603a', fontFace:'Calibri' });
  });

  // 축은 PowerPoint가 데이터 범위에 맞춰 자동 조정. 단, 건수는 음수가 될 수 없으므로 min=0으로 고정.
  s.addChart(pres.charts.LINE, [
    { name:'모니터링', labels:MONTHS, values:mArr.map(m => m.mon) },
    { name:'위반',     labels:MONTHS, values:mArr.map(m => m.vio) }
  ], {
    x:0.25, y:2.25, w:9.5, h:2.78,
    lineSize:2, lineSmooth:true,
    chartColors:['8fa8c8','e8845a'],
    showLegend:true, legendPos:'b',
    catAxisLabelColor:'94a3b8', valAxisLabelColor:'94a3b8',
    valAxisMinVal:0,
    valGridLine:{ color:'e2e8f0', size:0.5 },
    chartArea:{ fill:{ color: PPT_WHITE } }
  });

  addVioNote(s, 5.10);
}

// ── 슬라이드 3: 브랜드별 종합 표 (연누적 / 전월 두 슬라이드로 분할) ─────────────
// 같은 표 구조를 mode만 바꿔 두 번 그림 — 전 브랜드 한 화면에 표시되고, 영역 컬럼이 두 배 폭이 되어 가독성↑
function buildBrandSummarySlide(pres, ctx) {
  buildBrandSummaryPage(pres, ctx, 'year');
  buildBrandSummaryPage(pres, ctx, 'month');
}

function buildBrandSummaryPage(pres, ctx, mode) {
  // mode: 'year' (연누적 전체) | 'month' (전월만)
  const { prevYr: yr, prevMonthName: monthName, prevYm: ym, d, dAcc } = ctx;
  const s = pres.addSlide();
  const title    = mode === 'year' ? '브랜드별 현황 (연누적)' : '브랜드별 현황 (전월)';
  const hdrColor = mode === 'year' ? '1e3a8a'              : '2563eb';
  const hdrSub   = mode === 'year' ? '1a3270'              : '1d4ed8';
  addPptHeader(pres, s, title, yr + '년 ' + String(monthName).padStart(2,'0') + '월 기준');

  // 한 행의 records 필터 — mode에 따라 연누적(기준월까지 컷오프)/당월
  const filterRecs = (brand, type) => mode === 'year'
    ? dAcc.filter(r => r.brand === brand && r.type === type)
    : d.filter(r => r.brand === brand && r.type === type && r.date && r.date.startsWith(ym));
  const filterTypeRecs = (type) => mode === 'year'
    ? dAcc.filter(r => r.type === type)
    : d.filter(r => r.type === type && r.date && r.date.startsWith(ym));

  const data = [];

  // 헤더1: 브랜드 | 영역명(colspan 2) × TYPES | 합계(colspan 2)
  const h1 = [{ text:'브랜드', options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:7, align:'center', valign:'middle', rowspan:2 } }];
  TYPES.forEach(t => h1.push({ text:t, options:{ bold:true, fill:{color:hdrColor}, color:PPT_WHITE, fontSize:6, align:'center', colspan:2 } }));
  h1.push({ text:'합계', options:{ bold:true, fill:{color:'334155'}, color:PPT_WHITE, fontSize:7, align:'center', valign:'middle', colspan:2, rowspan:2 } });
  data.push(h1);

  // 헤더2: 전체/위반 반복
  const h2 = [];
  TYPES.forEach(() => {
    h2.push({ text:'전체', options:{ bold:true, fill:{color:hdrSub}, color:'CADCFC', fontSize:5, align:'center' } });
    h2.push({ text:'위반', options:{ bold:true, fill:{color:hdrSub}, color:'CADCFC', fontSize:5, align:'center' } });
  });
  data.push(h2);

  // 데이터행: 전 브랜드
  BRANDS.forEach((brand, bi) => {
    const bg = bi % 2 === 0 ? 'f8fafc' : PPT_WHITE;
    const row = [{ text:brand, options:{ fontSize:6, bold:true, align:'center', valign:'middle', fill:{color:bg} } }];
    let bTot = 0, bVio = 0;
    TYPES.forEach(type => {
      const recs = filterRecs(brand, type);
      const t = recs.reduce((s, r) => s + pptMonCnt(r), 0);
      const v = recs.filter(r => r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
      bTot += t; bVio += v;
      row.push({ text:pptFmt(t), options:{ fontSize:6, align:'center', valign:'middle', fill:{color:bg} } });
      row.push({ text:v || '-', options:{ fontSize:6, align:'center', valign:'middle', color:v>0?'dc2626':'94a3b8', bold:v>0, fill:{color:bg} } });
    });
    row.push({ text:pptFmt(bTot), options:{ fontSize:6, align:'center', valign:'middle', bold:true, fill:{color:'eef2ff'} } });
    row.push({ text:bVio || '-', options:{ fontSize:6, align:'center', valign:'middle', bold:bVio>0, color:bVio>0?'dc2626':'94a3b8', fill:{color:'eef2ff'} } });
    data.push(row);
  });

  // 합계행: 전체 브랜드 기준
  const sumRow = [{ text:'합계', options:{ bold:true, fontSize:6, align:'center', valign:'middle', fill:{color:PPT_NAVY}, color:PPT_WHITE } }];
  let gTot = 0, gVio = 0;
  TYPES.forEach(type => {
    const recs = filterTypeRecs(type);
    const t = recs.reduce((s, r) => s + pptMonCnt(r), 0);
    const v = recs.filter(r => r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
    gTot += t; gVio += v;
    sumRow.push({ text:pptFmt(t), options:{ bold:true, fontSize:6, align:'center', valign:'middle', fill:{color:PPT_NAVY}, color:PPT_WHITE } });
    sumRow.push({ text:v || '-', options:{ bold:true, fontSize:6, align:'center', valign:'middle', fill:{color:PPT_NAVY}, color:v>0?'fca5a5':PPT_WHITE } });
  });
  sumRow.push({ text:pptFmt(gTot), options:{ bold:true, fontSize:6, align:'center', valign:'middle', fill:{color:'334155'}, color:PPT_WHITE } });
  sumRow.push({ text:gVio || '-', options:{ bold:true, fontSize:6, align:'center', valign:'middle', fill:{color:'334155'}, color:gVio>0?'fca5a5':PPT_WHITE } });
  data.push(sumRow);

  // 열 너비: 브랜드(0.7) + 영역×2 + 합계(0.42×2) = 9.7
  const CW = (9.7 - 0.7 - 0.84) / (TYPES.length * 2);
  const typeColW = TYPES.flatMap(() => [CW, CW]);
  // 행 수: 헤더 2 + 브랜드 15 + 합계 1 = 18
  // 폰트 축소에 맞춰 행 높이도 슬림하게 → 표가 슬라이드에 여유 있게 들어옴
  const totalRows = 2 + BRANDS.length + 1;
  const available = 5.625 - 0.85 - 0.30;
  const rowH = Math.min(0.24, available / totalRows);
  s.addTable(data, {
    x:0.15, y:0.85, w:9.7,
    border:{ pt:0.3, color:'e2e8f0' },
    colW:[0.7, ...typeColW, 0.42, 0.42],
    rowH
  });
  addVioNote(s, 0.85 + totalRows * rowH + 0.05, true);
}

// ── 리스크 노출/측정판 · 조치사항 (대시보드와 동일 기준 — 연 누적/당월 각 1장) ──
const GRADE_PPT_COLOR = { A:'16a34a', B:'2563eb', C:'d97706', D:'dc2626', F:'334155' };

function buildGradeBoardSlide(pres, ctx, mode) {
  const { prevYr, prevMonthName, prevYm } = ctx;
  const isAcc = mode === 'acc';
  const s = pres.addSlide();
  addPptHeader(pres, s, '리스크 노출/측정판 (' + (isAcc ? '연 누적' : '당월') + ')',
               prevYr + '년 ' + String(prevMonthName).padStart(2,'0') + '월 기준');

  const brands = BRANDS.filter(b => !RANK_EXCLUDE.has(b));
  const ranked = brands.map(brand => {
    const details = {};
    GRADE_AREAS.forEach(type => { details[type] = calcGradeDetail(type, brand, prevYm, isAcc); });
    const scoreAreas = GRADE_AREAS.filter(t => !isGradeAreaExcluded(t, brand));
    let total = 0;
    scoreAreas.forEach(type => { total += GRADE_SCORE[details[type].grade] ?? 0; });
    const avg   = total / scoreAreas.length;
    const score = parseFloat((avg * 10).toFixed(1));
    const overallGrade = avg >= 9 ? 'A' : avg >= 7 ? 'B' : avg >= 4 ? 'C' : avg >= 1 ? 'D' : 'F';
    return { brand, details, score, overallGrade };
  }).sort((a, b) => b.score - a.score || a.brand.localeCompare(b.brand));

  const data = [[
    { text:'순위',     options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:7, align:'center', valign:'middle' } },
    { text:'브랜드',   options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:7, align:'center', valign:'middle' } },
    { text:'종합등급', options:{ bold:true, fill:{color:'334155'}, color:PPT_WHITE, fontSize:7, align:'center', valign:'middle' } },
    ...GRADE_AREAS.map(type => ({ text:type, options:{ bold:true, fill:{color:'1a3270'}, color:PPT_WHITE, fontSize:6.5, align:'center', valign:'middle' } }))
  ]];

  ranked.forEach(({ brand, details, score, overallGrade }, idx) => {
    const bg = idx % 2 === 0 ? 'f8fafc' : PPT_WHITE;
    const scoreTxt = Number.isInteger(score) ? score : score.toFixed(1);
    const row = [
      { text:String(idx + 1), options:{ fontSize:7, align:'center', valign:'middle', bold:idx < 3, fill:{color:bg} } },
      { text:brand, options:{ fontSize:7, bold:true, align:'center', valign:'middle', fill:{color:bg} } },
      { text:overallGrade + ' (' + scoreTxt + '점)', options:{ fontSize:6.5, bold:true, align:'center', valign:'middle', color:GRADE_PPT_COLOR[overallGrade], fill:{color:bg} } }
    ];
    GRADE_AREAS.forEach(type => {
      if (isGradeAreaExcluded(type, brand)) {
        row.push({ text:'-', options:{ fontSize:6.5, align:'center', valign:'middle', bold:true, color:'94a3b8', fill:{color:bg} } });
        return;
      }
      const dtl = details[type];
      row.push({ text:dtl.grade + '(' + dtl.cnt + ')', options:{ fontSize:6.5, align:'center', valign:'middle', bold:true, color:GRADE_PPT_COLOR[dtl.grade], fill:{color:bg} } });
    });
    data.push(row);
  });

  const rankCW = 0.45, brandCW = 0.85, overallCW = 0.9;
  const areaCW = (SLIDE_W - rankCW - brandCW - overallCW) / GRADE_AREAS.length;
  const totalRows = data.length;
  const rowH = Math.min(0.28, (5.625 - 0.85 - 0.35) / totalRows);
  s.addTable(data, {
    x:TABLE_X, y:0.85, w:SLIDE_W,
    border:{ pt:0.3, color:'e2e8f0' },
    colW:[rankCW, brandCW, overallCW, ...GRADE_AREAS.map(() => areaCW)],
    rowH
  });
  s.addText('등급 기준(위반율=위반+완료÷전체): A ≤5% · B ≤10% · C ≤15% · D ≤20% · F 20%초과 (외부노출/중대재해 즉시 F, 부실채권 2개월초과 미입금 1억초과 즉시 F·1억이하 즉시 D)', {
    x:TABLE_X, y:0.85 + totalRows * rowH + 0.08, w:SLIDE_W, h:0.3,
    fontSize:7, color:'64748b', fontFace:'Calibri'
  });
}

function buildActionBoardSlide(pres, ctx, mode) {
  const { prevYr, prevMonthName, prevYm } = ctx;
  const isAcc = mode === 'acc';
  const [pYr, pMo] = prevYm.split('-').map(Number);
  const s = pres.addSlide();
  addPptHeader(pres, s, '조치사항 (' + (isAcc ? '연 누적' : '당월') + ')',
               prevYr + '년 ' + String(prevMonthName).padStart(2,'0') + '월 기준');

  // ── 징계 현황 (감사 영역) ──
  const jngRecs = isAcc
    ? records.filter(r => { if (r.type !== '감사' || !r.date) return false; const [ry, rm] = r.date.split('-').map(Number); return ry === pYr && rm <= pMo; })
    : records.filter(r => r.type === '감사' && r.date && r.date.startsWith(prevYm));

  const jngY = 0.85;
  s.addText('징계 현황', { x:TABLE_X, y:jngY-0.03, w:4, h:0.24, fontSize:12, bold:true, color:'0f172a', fontFace:'Calibri' });
  s.addText(jngRecs.length + '건', { x:SLIDE_W-1.15, y:jngY-0.03, w:1.3, h:0.24, fontSize:9, color:'94a3b8', align:'right', fontFace:'Calibri' });

  const JNG_MAX = 9;
  const jngHead = ['날짜','브랜드','상세유형','징계유형','성명','양형','비고','상태'].map(t =>
    ({ text:t, options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:7, align:'center', valign:'middle' } }));
  const jngData = [jngHead];
  if (!jngRecs.length) {
    jngData.push([{ text:'해당 기간 징계 현황 없음', options:{ fontSize:8, align:'center', color:'94a3b8', colspan:8 } }]);
  } else {
    jngRecs.slice(0, JNG_MAX).forEach((r, idx) => {
      const bg = idx % 2 === 0 ? 'f8fafc' : PPT_WHITE;
      let name = r.jg_name || '', sent = r.jg_sent || '';
      if (!name && !sent) { const p = parseJgRecord(r); if (p) { name = p.name; sent = p.sent; } }
      const noteText = r.jg_name != null ? (r.note || '') : (parseJgRecord(r)?.note || r.note || '');
      jngData.push([
        { text:r.date ? r.date.slice(5).replace('-','/') : '-', options:{ fontSize:7, align:'center', valign:'middle', fill:{color:bg} } },
        { text:r.brand || '-', options:{ fontSize:7, align:'center', valign:'middle', fill:{color:bg} } },
        { text:r.subtype && r.subtype !== '-' ? r.subtype : '-', options:{ fontSize:6.5, align:'center', valign:'middle', fill:{color:bg} } },
        { text:r.jng_type || '-', options:{ fontSize:6.5, align:'center', valign:'middle', fill:{color:bg} } },
        { text:name || '-', options:{ fontSize:7, align:'center', valign:'middle', fill:{color:bg} } },
        { text:sent || '-', options:{ fontSize:6.5, align:'center', valign:'middle', fill:{color:bg} } },
        { text:noteText || '-', options:{ fontSize:6.5, valign:'middle', fill:{color:bg} } },
        { text:statLbl(r.status, '감사'), options:{ fontSize:6.5, align:'center', valign:'middle', fill:{color:bg} } }
      ]);
    });
    if (jngRecs.length > JNG_MAX) {
      jngData.push([{ text:'외 ' + (jngRecs.length - JNG_MAX) + '건 더', options:{ fontSize:7, align:'center', color:'94a3b8', colspan:8 } }]);
    }
  }
  const jngTblY = jngY + 0.25;
  const notesY  = 3.35;
  const jngRowH = Math.min(0.24, (notesY - jngTblY - 0.1) / jngData.length);
  s.addTable(jngData, {
    x:TABLE_X, y:jngTblY, w:SLIDE_W, border:{ pt:0.3, color:'e2e8f0' },
    colW:[0.7, 0.85, 1.15, 0.85, 0.85, 1.1, 3.1, 1.1], rowH:jngRowH
  });

  // ── 영역별 특이사항 (전체 영역) ──
  const noteRecs = isAcc
    ? notes.filter(n => { if (!n.date) return false; const [ny, nm] = n.date.split('-').map(Number); return ny === pYr && nm <= pMo; })
    : notes.filter(n => n.date && n.date.startsWith(prevYm));

  s.addText('영역별 특이사항', { x:TABLE_X, y:notesY-0.03, w:4, h:0.24, fontSize:12, bold:true, color:'0f172a', fontFace:'Calibri' });
  s.addText(noteRecs.length + '건', { x:SLIDE_W-1.15, y:notesY-0.03, w:1.3, h:0.24, fontSize:9, color:'94a3b8', align:'right', fontFace:'Calibri' });

  const NOTE_MAX = 8;
  const noteHead = ['날짜','영역','브랜드','주요이슈','이슈상세','조치완료'].map(t =>
    ({ text:t, options:{ bold:true, fill:{color:'6366f1'}, color:PPT_WHITE, fontSize:7, align:'center', valign:'middle' } }));
  const noteData = [noteHead];
  if (!noteRecs.length) {
    noteData.push([{ text:'해당 기간 특이사항 없음', options:{ fontSize:8, align:'center', color:'94a3b8', colspan:6 } }]);
  } else {
    noteRecs.slice(0, NOTE_MAX).forEach((n, idx) => {
      const bg = idx % 2 === 0 ? 'f5f3ff' : PPT_WHITE;
      const p = parseNoteContent(n.content);
      noteData.push([
        { text:n.date ? n.date.slice(5).replace('-','/') : '-', options:{ fontSize:7, align:'center', valign:'middle', fill:{color:bg} } },
        { text:n.type || '-', options:{ fontSize:6.5, align:'center', valign:'middle', fill:{color:bg} } },
        { text:n.brand || '-', options:{ fontSize:7, align:'center', valign:'middle', fill:{color:bg} } },
        { text:p.m || '-', options:{ fontSize:6.5, valign:'middle', fill:{color:bg} } },
        { text:p.d || '-', options:{ fontSize:6.5, valign:'middle', fill:{color:bg} } },
        { text:p.a || '-', options:{ fontSize:6.5, valign:'middle', fill:{color:bg} } }
      ]);
    });
    if (noteRecs.length > NOTE_MAX) {
      noteData.push([{ text:'외 ' + (noteRecs.length - NOTE_MAX) + '건 더', options:{ fontSize:7, align:'center', color:'94a3b8', colspan:6 } }]);
    }
  }
  const noteTblY = notesY + 0.25;
  const noteRowH = Math.min(0.24, (5.55 - noteTblY) / noteData.length);
  s.addTable(noteData, {
    x:TABLE_X, y:noteTblY, w:SLIDE_W, border:{ pt:0.3, color:'e2e8f0' },
    colW:[0.7, 0.85, 0.85, 1.9, 2.9, 2.5], rowH:noteRowH
  });
}

// ── 슬라이드 4~: 영역별 상세 ─────────────────────────
function buildTypeDetailSlide(pres, ctx, type, typeIdx) {
  const { d, prevYr, prevMonthName, prevYm } = ctx;
  const typeRecs = d.filter(r => r.type === type && r.date && r.date.startsWith(prevYm));
  if (!typeRecs.length) return;

  // 영역별 브랜드 노출 규칙:
  //   - 불법파견 → ILLEGAL_REPORT_BRANDS (10개+상권)
  //   - 영업비밀 → COMMON_BRANDS (9개+상권) — '상권'은 영업비밀에서만 노출
  //   - 그 외   → COMMON_BRANDS에서 '상권' 제외
  let useBrands = type === '불법파견' ? ILLEGAL_REPORT_BRANDS : COMMON_BRANDS;
  if (type !== '영업비밀') useBrands = useBrands.filter(b => b !== '상권');
  const s = pres.addSlide();
  addPptHeader(pres, s, type + ' 모니터링 상세 현황', prevYr + '년 ' + String(prevMonthName).padStart(2,'0') + '월 기준 (전월)');
  const typeColor = TYPE_COLORS[typeIdx];

  const typeTot  = typeRecs.reduce((sum, r) => sum + pptMonCnt(r), 0);
  const typeVio  = typeRecs.filter(r => r.status !== '모니터링').reduce((sum, r) => sum + r.count, 0);
  const typeDone = typeRecs.filter(r => r.status === '완료').reduce((sum, r) => sum + r.count, 0);
  const typeAct  = typeRecs.filter(r => r.status === '위반(처리중)').reduce((sum, r) => sum + r.count, 0);
  const typeRate = typeVio ? Math.round(typeDone / typeVio * 100) : 0;

  // 표 — 세부 항목 컬럼을 우선 확보(일반 1.30"/불법파견 1.34")한 뒤 남은 너비를 브랜드+소계 셀에 균등 분배.
  // 9/10 브랜드일 땐 기존 0.42/0.38 너비를 그대로 보존하고, 브랜드 추가 시 자동으로 셀이 줄어들어 항목명이 짤리지 않도록 한다.
  const itemColW = type === '불법파견' ? 1.34 : 1.30;
  const bW       = (SLIDE_W - itemColW) / ((useBrands.length + 1) * 2);
  const bCW2     = useBrands.flatMap(() => [bW, bW]);
  const colWs2   = [itemColW, ...bCW2, bW, bW];
  const dataFs   = type === '불법파견' ? 8 : 9;

  const subs2 = SUB[type];
  const tableData = [];

  // 헤더행1: 세부 항목 + 브랜드별 colspan:2 + 소계 colspan:2
  const h = [{ text:'세부 항목', options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:10, align:'center', valign:'middle', rowspan:2 } }];
  useBrands.forEach(b => h.push({ text:b, options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:9, align:'center', colspan:2 } }));
  h.push({ text:'소계', options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:10, align:'center', colspan:2 } });
  tableData.push(h);

  // 헤더행2: 전체/위반
  const h2 = [];
  useBrands.forEach(() => {
    h2.push({ text:'전체', options:{ bold:true, fill:{color:'1a3270'}, color:PPT_WHITE, fontSize:8, align:'center' } });
    h2.push({ text:'위반', options:{ bold:true, fill:{color:'1a3270'}, color:PPT_WHITE, fontSize:8, align:'center' } });
  });
  h2.push({ text:'전체', options:{ bold:true, fill:{color:'1a3270'}, color:PPT_WHITE, fontSize:8, align:'center' } });
  h2.push({ text:'위반', options:{ bold:true, fill:{color:'1a3270'}, color:PPT_WHITE, fontSize:8, align:'center' } });
  tableData.push(h2);

  (subs2 && subs2.length ? subs2 : ['(세부 항목 없음)']).forEach((item, idx) => {
    const bg = idx % 2 === 0 ? 'f8fafc' : PPT_WHITE;
    const row = [{ text:item, options:{ fontSize:dataFs, fill:{color:bg}, valign:'middle' } }];
    let rTot = 0, rVio = 0;
    useBrands.forEach(brand => {
      const recs = typeRecs.filter(r => r.brand === brand && (subs2 && subs2.length ? r.subtype === item : true));
      const t = recs.reduce((sum, r) => sum + pptMonCnt(r), 0);
      const v = recs.filter(r => r.status !== '모니터링').reduce((sum, r) => sum + r.count, 0);
      rTot += t; rVio += v;
      row.push({ text:pptFmt(t), options:{ fontSize:dataFs, align:'center', fill:{color:bg} } });
      row.push({ text:v || '-', options:{ fontSize:dataFs, align:'center', color:v>0?'dc2626':'94a3b8', bold:v>0, fill:{color:bg} } });
    });
    row.push({ text:pptFmt(rTot), options:{ fontSize:dataFs, align:'center', bold:true, fill:{color:'eef2ff'} } });
    row.push({ text:rVio || '-', options:{ fontSize:dataFs, align:'center', bold:rVio>0, color:rVio>0?'dc2626':'94a3b8', fill:{color:'eef2ff'} } });
    tableData.push(row);
  });

  const sumR = [{ text:'합계', options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:10, align:'center' } }];
  let gT = 0, gV = 0;
  useBrands.forEach(brand => {
    const t = typeRecs.filter(r => r.brand === brand).reduce((sum, r) => sum + pptMonCnt(r), 0);
    const v = typeRecs.filter(r => r.brand === brand && r.status !== '모니터링').reduce((sum, r) => sum + r.count, 0);
    gT += t; gV += v;
    sumR.push({ text:pptFmt(t), options:{ bold:true, fontSize:dataFs, align:'center', fill:{color:PPT_NAVY}, color:PPT_WHITE } });
    sumR.push({ text:v || '-', options:{ bold:true, fontSize:dataFs, align:'center', fill:{color:PPT_NAVY}, color:v>0?'fca5a5':PPT_WHITE } });
  });
  sumR.push({ text:pptFmt(gT), options:{ bold:true, fontSize:dataFs, align:'center', fill:{color:PPT_NAVY}, color:PPT_WHITE } });
  sumR.push({ text:gV || '-', options:{ bold:true, fontSize:dataFs, align:'center', fill:{color:PPT_NAVY}, color:gV>0?'fca5a5':PPT_WHITE } });
  tableData.push(sumR);

  // 표만 표시 (하단 도넛/KPI 요약은 별도 슬라이드로 이동)
  const rowHeight = type === '불법파견' ? 0.22 : 0.34;
  s.addTable(tableData, { x:TABLE_X, y:TABLE_Y, w:SLIDE_W, border:{pt:0.3,color:'e2e8f0'}, colW:colWs2, rowH:rowHeight });

  // 영업비밀 슬라이드에만 환산 안내 푸터
  if (type === '영업비밀') addVioNote(s, 5.40, true);
  void typeColor; void typeDone; void typeRate; void typeAct;
}

// ── 영역별 모니터링 결과 요약 (영역 상세 섹션 뒤에 1~2장 슬라이드에 모아서 출력)
// 9개 영역을 카드 그리드(2행 × 3열)로 배치. 6개 초과분은 다음 슬라이드로.
function buildTypeSummarySlides(pres, ctx) {
  const cols = 3, rowsPerSlide = 2, perSlide = cols * rowsPerSlide;
  const groups = [];
  for (let i = 0; i < TYPES.length; i += perSlide) groups.push(TYPES.slice(i, i + perSlide));
  groups.forEach((group, gi) => buildTypeSummaryPage(pres, ctx, group, gi, groups.length, cols, rowsPerSlide));
}

function buildTypeSummaryPage(pres, ctx, typeGroup, slideIdx, totalSlides, cols, rowsPerSlide) {
  const { prevYr, prevMonthName } = ctx;
  const s = pres.addSlide();
  const titleSuf = totalSlides > 1 ? ` (${slideIdx + 1}/${totalSlides})` : '';
  addPptHeader(pres, s, '영역별 모니터링 결과 요약' + titleSuf,
               prevYr + '년 ' + String(prevMonthName).padStart(2,'0') + '월 기준 (전월)');

  const startY = 0.85;
  const endY   = 5.55; // 슬라이드 하단까지
  const cardW  = (10 - 0.30 - (cols - 1) * 0.12) / cols;            // 좌우 0.15 여백 + 카드 사이 0.12
  const cardH  = (endY - startY - (rowsPerSlide - 1) * 0.12) / rowsPerSlide;

  typeGroup.forEach((type, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = 0.15 + col * (cardW + 0.12);
    const y = startY + row * (cardH + 0.12);
    drawTypeSummaryCard(pres, s, ctx, type, x, y, cardW, cardH);
  });
}

// 카드 1개: 좌측 도넛 + 우측 KPI 4개
function drawTypeSummaryCard(pres, s, ctx, type, x, y, w, h) {
  const { d, prevYm } = ctx;
  const typeIdx = TYPES.indexOf(type);
  const typeColor = TYPE_COLORS[typeIdx] || '94a3b8';
  const typeRecs  = d.filter(r => r.type === type && r.date && r.date.startsWith(prevYm));

  const typeTot  = typeRecs.reduce((sum, r) => sum + pptMonCnt(r), 0);
  const typeVio  = typeRecs.filter(r => r.status !== '모니터링').reduce((sum, r) => sum + r.count, 0);
  const typeDone = typeRecs.filter(r => r.status === '완료').reduce((sum, r) => sum + r.count, 0);
  const typeAct  = typeRecs.filter(r => r.status === '위반(처리중)').reduce((sum, r) => sum + r.count, 0);
  const typeRate = typeVio ? Math.round(typeDone / typeVio * 100) : 0;

  // 카드 배경 + 좌측 영역색 띠
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill:{color:PPT_WHITE}, shadow:{type:'outer',blur:5,offset:2,angle:135,color:'000000',opacity:0.07} });
  s.addShape(pres.shapes.RECTANGLE, { x, y, w:0.06, h, fill:{color:typeColor} });

  // 카드 제목 (영역명)
  s.addText(type, { x:x+0.15, y:y+0.06, w:w-0.20, h:0.32, fontSize:13, bold:true, color:'0f172a', fontFace:'Calibri' });

  // 본문 영역: 도넛(좌) + KPI(우)
  const bodyY = y + 0.42;
  const bodyH = h - 0.50;
  const donW  = w * 0.46;
  const kpiX  = x + donW + 0.05;
  const kpiW  = w - donW - 0.20;

  // 좌측: 미니 도넛
  const subs = SUB[type];
  if (subs && subs.length) {
    const subCnts        = subs.map(sub => typeRecs.filter(r => r.subtype === sub && r.status !== '모니터링').reduce((sum, r) => sum + r.count, 0));
    const filteredLabels = subs.filter((_, i) => subCnts[i] > 0);
    const filteredCnts   = subCnts.filter(v => v > 0);
    if (filteredCnts.length) {
      s.addChart(pres.charts.DOUGHNUT, [{ name:'건수', labels:filteredLabels, values:filteredCnts }], {
        x:x+0.10, y:bodyY, w:donW, h:bodyH,
        chartColors: SUB_COLORS.slice(0, filteredLabels.length),
        showLegend:true, legendPos:'b', legendFontSize:6,
        showPercent:false,
        dataLabelColor:PPT_WHITE,
        dataLabelFontSize:6,
        chartArea:{ fill:{ color: PPT_WHITE } },
        holeSize:50
      });
    } else {
      s.addText('위반 데이터 없음', { x:x+0.10, y:bodyY + bodyH/2 - 0.15, w:donW, h:0.3, fontSize:10, color:'94a3b8', fontFace:'Calibri', align:'center' });
    }
  }

  // 우측: KPI 4행
  const kpis = [
    ['전체 모니터링', pptFmt(typeTot) + '건'],
    ['위반 건수',     typeVio + '건' + (typeTot ? ' (' + Math.round(typeVio/typeTot*100) + '%)' : '')],
    ['처리 완료율',   typeRate + '%'],
    ['조치중',       typeAct + '건']
  ];
  const rowH = bodyH / kpis.length;
  kpis.forEach(([label, val], i) => {
    const cy = bodyY + i * rowH;
    s.addText(label, { x:kpiX,             y:cy, w:kpiW * 0.55, h:rowH, fontSize:9,  color:'64748b', fontFace:'Calibri', valign:'middle' });
    s.addText(val,   { x:kpiX + kpiW*0.55, y:cy, w:kpiW * 0.45, h:rowH, fontSize:11, bold:true, color:'0f172a', fontFace:'Calibri', align:'right', valign:'middle' });
  });
}

// ── 슬라이드 N: 브랜드별 영역 현황 ───────────────────
// 전월 기준 6개 영역 × (전체/위반) 표 + 영역별 막대 그래프.
// '위반'은 status !== '모니터링' (위반(처리중) + 완료) 합산.
function buildBrandDetailSlide(pres, ctx, brand) {
  const { d, prevYr, prevMonthName, prevYm } = ctx;
  const brandRecs = d.filter(r => r.brand === brand && r.date && r.date.startsWith(prevYm));

  const s = pres.addSlide();
  addPptHeader(pres, s, brand + ' 영역별 모니터링 현황', prevYr + '년 ' + String(prevMonthName).padStart(2,'0') + '월 기준 (전월)');

  const bTot  = brandRecs.reduce((sum, r) => sum + pptMonCnt(r), 0);
  const bVio  = brandRecs.filter(r => r.status !== '모니터링').reduce((sum, r) => sum + r.count, 0);
  const bDone = brandRecs.filter(r => r.status === '완료').reduce((sum, r) => sum + r.count, 0);
  const bAct  = brandRecs.filter(r => r.status === '위반(처리중)').reduce((sum, r) => sum + r.count, 0);
  const bRate = bVio ? Math.round(bDone / bVio * 100) : 0;
  const bVr   = bTot ? Math.round(bVio / bTot * 100) : 0;

  // KPI 4-box strip
  [
    { label:'전월 모니터링', value:pptFmt(bTot)+'건', sub:'위반 '+bVio+'건 ('+bVr+'%)',                                color:PPT_NAVY },
    { label:'위반 건수',     value:bVio+'건', sub:'전체 대비 '+bVr+'%',                                       color:'2563eb' },
    { label:'처리 완료율',   value:bRate+'%', sub:'완료 '+bDone+' / 위반 '+bVio+'건',                          color:'15803d' },
    { label:'조치중',       value:bAct+'건', sub:'위반(처리중) 상태',                                         color:'94a3b8' }
  ].forEach((k, i) => {
    const x = 0.25 + i * 2.42;
    s.addShape(pres.shapes.RECTANGLE, { x, y:0.85, w:2.25, h:1.15, fill:{color:PPT_WHITE}, shadow:{type:'outer',blur:5,offset:2,angle:135,color:'000000',opacity:0.07} });
    s.addShape(pres.shapes.RECTANGLE, { x, y:0.85, w:0.05, h:1.15, fill:{color:k.color} });
    s.addText(k.label, { x:x+0.12, y:0.90, w:2.1, h:0.22, fontSize:10, color:'94a3b8', fontFace:'Calibri', bold:true });
    s.addText(k.value, { x:x+0.12, y:1.14, w:2.1, h:0.42, fontSize:22, bold:true, color:'0f172a', fontFace:'Calibri' });
    s.addText(k.sub,   { x:x+0.12, y:1.62, w:2.1, h:0.3,  fontSize:10, color:k.color === '15803d' ? '15803d' : 'c0603a', fontFace:'Calibri' });
  });

  // 영역별 집계 (영업비밀 모니터링은 10:1 환산)
  const typeMons = TYPES.map(type => brandRecs.filter(r => r.type === type).reduce((sum, r) => sum + pptMonCnt(r), 0));
  const typeVios = TYPES.map(type => brandRecs.filter(r => r.type === type && r.status !== '모니터링').reduce((sum, r) => sum + r.count, 0));

  // 좌측: 영역별 막대 그래프
  // 기본: 자동 스케일(min=0만 고정).
  // 1000 초과 영역이 있는 브랜드만 0-100/5단위로 고정 + 100 초과 값은 막대 상단에 실제 수치 표기
  // → 영업비밀처럼 한 영역만 압도적으로 큰 브랜드에서 나머지 영역도 보이게 함.
  const chartMax = Math.max(...typeMons, ...typeVios);
  const barOpts = {
    x:0.15, y:2.20, w:5.4, h:3.2,
    barDir:'col', barGrouping:'clustered',
    chartColors:['8fa8c8','e8845a'],
    showLegend:true, legendPos:'b', legendFontSize:9,
    catAxisLabelColor:'94a3b8', catAxisLabelFontSize:9,
    valAxisLabelColor:'94a3b8', valAxisLabelFontSize:9,
    valAxisMinVal:0,
    valGridLine:{ color:'e2e8f0', size:0.5 },
    chartArea:{ fill:{ color:PPT_WHITE } }
  };
  if (chartMax > 1000) {
    Object.assign(barOpts, {
      valAxisMaxVal:100, valAxisMajorUnit:5,
      showValue:true,
      dataLabelFontSize:8,
      dataLabelColor:'0f172a',
      dataLabelPosition:'outEnd',
      dataLabelFormatCode:'[>100]0;""'
    });
  }
  s.addChart(pres.charts.BAR, [
    { name:'모니터링', labels:TYPES, values:typeMons },
    { name:'위반',     labels:TYPES, values:typeVios }
  ], barOpts);

  // 우측: 영역별 표 (영역 / 전체 / 위반)
  // 영역(11개)+헤더+합계 = 13행. 좌측 막대그래프 높이(2.20~5.40)에 맞춰 폰트·행높이 슬림하게.
  const dFs = 8;
  const tblData = [[
    { text:'영역', options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:dFs, align:'center', valign:'middle' } },
    { text:'전체', options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:dFs, align:'center', valign:'middle' } },
    { text:'위반', options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:dFs, align:'center', valign:'middle' } }
  ]];

  TYPES.forEach((type, ti) => {
    const bg = ti % 2 === 0 ? 'f8fafc' : PPT_WHITE;
    const t = typeMons[ti], v = typeVios[ti];
    tblData.push([
      { text:type,     options:{ fontSize:dFs, bold:true, align:'center', valign:'middle', fill:{color:bg}, color:'334155' } },
      { text:pptFmt(t), options:{ fontSize:dFs, align:'center', valign:'middle', fill:{color:bg} } },
      { text:v || '-', options:{ fontSize:dFs, align:'center', valign:'middle', bold:v>0, color:v>0?'dc2626':'94a3b8', fill:{color:bg} } }
    ]);
  });

  tblData.push([
    { text:'합계',        options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:dFs, align:'center', valign:'middle' } },
    { text:pptFmt(bTot),  options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:dFs, align:'center', valign:'middle' } },
    { text:bVio || '-',   options:{ bold:true, fill:{color:PPT_NAVY}, color:bVio>0?'fca5a5':PPT_WHITE, fontSize:dFs, align:'center', valign:'middle' } }
  ]);

  // 행 높이: 막대그래프 높이(2.20~5.40, 3.2") 안에 13행이 들어오도록 — 폰트·여백 축소로 강제 슬림
  const totalRows = TYPES.length + 2;
  const rowH = Math.min(0.24, (5.38 - 2.20) / totalRows);
  s.addTable(tblData, {
    x:5.70, y:2.20, w:4.15,
    colW:[1.90, 1.10, 1.15],
    border:{ pt:0.3, color:'e2e8f0' },
    margin:[1, 2, 1, 2],
    rowH
  });

  // 영업비밀 행이 포함되므로 환산 안내 푸터 표기 (하단)
  addVioNote(s, 5.42, true);
}

// ── 슬라이드 2: [RO실] 고정화 1P ─────────────────────
// 대부분 고정 템플릿(목표·25년누적 열, 라벨, 하단 문구, 빨간불 박스).
// 계산 셀(주차 1~4 + 26년 누적)만 데이터로 채움:
//   · 6개 영역 '조치/내부적발' (위반(처리중)+완료 / 전체)  → "v/t"
//   · 부실채권 '부실 건수' (상세유형 '2개월 초과 미입금' 합계)
//   · 분쟁해결 '해결/발생' (노무 중 '기타진정'·'직장내괴롭힘')
// 주차: 달력 주차(월요일 시작), 5주차는 4주에 합산.
// 26년 누적: 이미지 base값 + 기준월 신규 카운트.
function buildFixedSlide(pres, ctx) {
  const { d, prevYr, prevMonthName, prevYm } = ctx;
  const NOMU_DISPUTE = ['기타진정', '직장내괴롭힘'];

  // pred로 필터한 레코드를 달력 주차별/월합으로 집계 (v=위반(처리중)+완료, t=전체)
  const agg = (pred) => {
    const yr = +prevYm.slice(0,4), m0 = +prevYm.slice(5,7) - 1;
    const fw = (new Date(yr, m0, 1).getDay() + 6) % 7; // 월요일=0
    const w = [ {v:0,t:0}, {v:0,t:0}, {v:0,t:0}, {v:0,t:0} ];
    let mv = 0, mt = 0;
    d.forEach(r => {
      if (!r.date || !r.date.startsWith(prevYm) || !pred(r)) return;
      let wk = Math.floor((+r.date.slice(8,10) - 1 + fw) / 7);
      if (wk > 3) wk = 3; // 5주차는 4주 칸에 합산
      const mon = pptMonCnt(r); // 전체/모니터링: 영업비밀 10:1 환산 반영
      const c   = r.count || 0; // 위반: 원값(1:1)
      w[wk].t += mon; mt += mon;
      if (r.status !== '모니터링') { w[wk].v += c; mv += c; }
    });
    return { w, mv, mt };
  };
  const xy = (v, t) => t ? v + '/' + pptFmt(t) : '';  // 주차 셀: 데이터 없으면 공란

  // 톤: 회색(헤더)·노란색(섹션/지표)·흰색(영역명/값). 녹·주황·빨강 값 셀만 고정색.
  const GRN = { fill:{color:'00b050'}, bold:true };
  const RED = { fill:{color:'ff0000'}, color:'FFFFFF', bold:true };
  const ORG = { fill:{color:'ffc000'}, bold:true };
  const SEC = { fill:{color:'fdf3c0'}, bold:true };   // 1·2·3·4 제목 섹션 행 — 노란색 유지
  const AREA= { fill:{color:'FFFFFF'}, bold:true };   // 영역명 칸(흰색)
  const LBL = { fill:{color:'FFFFFF'} };              // 지표 칸(흰색)
  const cel = (text, o) => ({ text: text == null ? '' : String(text),
    options: Object.assign({ fontSize:6.5, bold:true, align:'center', valign:'middle', color:'333333', fill:{color:'FFFFFF'} }, o || {}) });
  const blank4 = () => [cel(''), cel(''), cel(''), cel('')];
  const secBlank4 = () => [cel('', SEC), cel('', SEC), cel('', SEC), cel('', SEC)]; // 섹션 행 빈 칸도 노랑

  const hOpt = { fill:{color:'d9d9d9'}, color:'333333', bold:true, fontSize:7, align:'center', valign:'middle' };
  const rows = [];

  // 헤더 2행
  rows.push([
    cel('EBG 해결 제목', Object.assign({}, hOpt, { rowspan:2, align:'left' })),
    cel('지표',          Object.assign({}, hOpt, { rowspan:2 })),
    cel('목표',          Object.assign({}, hOpt, { rowspan:2 })),
    cel('25년 누적',     Object.assign({}, hOpt, { rowspan:2 })),
    cel('26년 누적',     Object.assign({}, hOpt, { rowspan:2 })),
    cel(prevMonthName + '월', Object.assign({}, hOpt, { colspan:4 }))
  ]);
  rows.push([ cel('1주', hOpt), cel('2주', hOpt), cel('3주', hOpt), cel('4주', hOpt) ]);

  // 1. AI 컴플라이언스 (고정) — 섹션 행 전체 노랑
  rows.push([
    cel('1. AI 컴플라이언스', Object.assign({}, SEC, { align:'left' })),
    cel('AI 적발율', SEC), cel('100%', SEC), cel('-', SEC), cel('-', SEC), ...secBlank4()
  ]);

  // 6개 영역 정의 + 사전 집계 (핵심6대 합계 행을 먼저 그리므로 미리 계산)
  const areas = [
    { name:'① 불법파견', c25h:'0', c25a:'70/70',   color:GRN, pred:r=>r.type==='불법파견', base:[46,46] },
    { name:'② 표시광고', c25h:'0', c25a:'118/118', color:GRN, pred:r=>r.type==='표시광고', base:[117,117] },
    { name:'③ 가맹',     c25h:'0', c25a:'40/40',   color:GRN, pred:r=>r.type==='가맹',     base:[91,91] },
    { name:'④ 지적재산', c25h:'0', c25a:'62/62',   color:GRN, pred:r=>r.type==='IP',       base:[26,26] },
    { name:'⑤ 영업비밀', c25h:'-', c25a:'-',       color:null, pred:r=>r.type==='영업비밀', base:[56,118] },
    { name:'⑥ 노무 감사(52시간/임금체불)', c25h:'3/3', c25a:'3/3', color:RED,
      pred:r=>r.type==='노무' && !NOMU_DISPUTE.includes(r.subtype), base:[17,17] }
  ];
  const aggs = areas.map(a => agg(a.pred));

  // 핵심 6대 합계: 6개 영역 '조치/내부적발'의 주차별·26누적 합
  const c6w = [ {v:0,t:0}, {v:0,t:0}, {v:0,t:0}, {v:0,t:0} ];
  let c6bv = 0, c6bt = 0, c6mv = 0, c6mt = 0;
  areas.forEach((a, i) => {
    const A = aggs[i];
    c6bv += a.base[0]; c6bt += a.base[1]; c6mv += A.mv; c6mt += A.mt;
    A.w.forEach((wk, k) => { c6w[k].v += wk.v; c6w[k].t += wk.t; });
  });

  // 2. 핵심 6대 영역 리스크 ZERO (요약 2행) — '내부 적발 조치율'에 6개 영역 합계 반영
  rows.push([
    cel('2. 핵심 6대 영역 리스크 ZERO', Object.assign({}, SEC, { align:'left', rowspan:2 })),
    cel('해결 / 외부노출', SEC), cel('0건', SEC), cel('0건', SEC), cel('0건', SEC), ...secBlank4()
  ]);
  rows.push([
    cel('내부 적발 조치율', SEC), cel('100%', SEC), cel('100%', SEC),
    cel((c6bv + c6mv) + '/' + pptFmt(c6bt + c6mt), SEC),
    cel(xy(c6w[0].v,c6w[0].t), SEC), cel(xy(c6w[1].v,c6w[1].t), SEC),
    cel(xy(c6w[2].v,c6w[2].t), SEC), cel(xy(c6w[3].v,c6w[3].t), SEC)
  ]);

  // 6개 영역 행: 해결/외부노출(공란) + 조치/내부적발(계산)
  areas.forEach((a, i) => {
    const colr = a.color || {};
    rows.push([
      cel(a.name, Object.assign({}, AREA, { align:'left', rowspan:2, fontSize: a.name.length > 10 ? 6 : 6.5 })),
      cel('해결 / 외부노출', LBL), cel('0'), cel(a.c25h, colr), cel(''), ...blank4()  // 26·주차 공란(req1)
    ]);
    const A = aggs[i];
    rows.push([
      cel('조치 / 내부적발', LBL), cel('100%'), cel(a.c25a, colr),
      cel((a.base[0] + A.mv) + '/' + pptFmt(a.base[1] + A.mt)),
      cel(xy(A.w[0].v,A.w[0].t)), cel(xy(A.w[1].v,A.w[1].t)), cel(xy(A.w[2].v,A.w[2].t)), cel(xy(A.w[3].v,A.w[3].t))
    ]);
  });

  // 3. 부실 ZERO (고정 요약 2행) — 섹션 행 전체 노랑
  rows.push([
    cel('3. 부실 ZERO', Object.assign({}, SEC, { align:'left', rowspan:2 })),
    cel('발생 건수', SEC), cel('0건', SEC), cel('3건(2.6억)', SEC), cel('3건(2.6억)', SEC), ...secBlank4()
  ]);
  rows.push([
    cel('로스율(리미나)', SEC), cel('0.12%', SEC), cel('0.27%', SEC), cel('0.24%', SEC), ...secBlank4()
  ]);

  // ① 부실 채권 — 부실 건수(계산: 2개월 초과 미입금 합계)
  const B = agg(r => r.type === '부실채권' && r.subtype === '2개월 초과 미입금');
  rows.push([
    cel('① 부실 채권', Object.assign({}, AREA, { align:'left' })),
    cel('부실 건수', LBL), cel('0건'), cel('3', RED), cel(3 + B.mt),
    cel(B.w[0].t || ''), cel(B.w[1].t || ''), cel(B.w[2].t || ''), cel(B.w[3].t || '')
  ]);

  // ② 재고 로스 (고정, req2)
  rows.push([
    cel('② 재고 로스', Object.assign({}, AREA, { align:'left' })),
    cel('로스율', LBL), cel('0.2%'), cel('0.22%', ORG), cel('0.24%'), ...blank4()
  ]);

  // 4. 분쟁 해결 — 해결/발생(계산: 노무 중 기타진정·직장내괴롭힘)
  const P = agg(r => r.type === '노무' && NOMU_DISPUTE.includes(r.subtype));
  rows.push([
    cel('4. 분쟁 해결\n(소송/외부신고·내부제보·주요분쟁)', Object.assign({}, SEC, { align:'left', fontSize:5.5 })),
    cel('해결/발생(건수)', SEC), cel('100%', SEC), cel('46/46', SEC),
    cel((21 + P.mv) + '/' + pptFmt(31 + P.mt), SEC),
    cel(xy(P.w[0].v,P.w[0].t), SEC), cel(xy(P.w[1].v,P.w[1].t), SEC), cel(xy(P.w[2].v,P.w[2].t), SEC), cel(xy(P.w[3].v,P.w[3].t), SEC)
  ]);

  // ── 슬라이드 작성 ──
  const s = pres.addSlide();
  addPptHeader(pres, s, '[RO실] 고정화 1P', prevYr + '년 ' + String(prevMonthName).padStart(2,'0') + '월 기준');

  // 22행을 한 페이지에: 폰트·여백을 슬림하게, 테두리는 회색(0.5pt)으로 칸 구분 또렷
  const tableTop = 0.74, rowH = 0.148;
  s.addTable(rows, {
    x:0.15, y:tableTop, w:9.7,
    colW:[1.85, 1.15, 0.5, 0.7, 0.72, 1.195, 1.195, 1.195, 1.195],
    border:{ pt:0.5, color:'000000' },
    rowH, margin:[1, 2, 1, 2], autoPage:false, valign:'middle', fontFace:'Calibri'
  });

  // 하단 고정 문구 + 빨간불 박스
  const by = tableTop + rows.length * rowH + 0.24;
  s.addText('1. EBG', { x:0.2, y:by, w:9, h:0.24, fontSize:11, bold:true, color:'0f172a', fontFace:'Calibri' });
  s.addText([
    { text:'우선순위1) [법위반 ZERO]',  options:{ breakLine:true } },
    { text:'우선순위2) [부실 ZERO]',    options:{ breakLine:true } },
    { text:'우선순위3) [분쟁 해결 100%]', options:{} }
  ], { x:0.35, y:by + 0.25, w:9, h:0.52, fontSize:9, color:'334155', fontFace:'Calibri', lineSpacingMultiple:1.1 });

  const ry = by + 0.82;
  s.addShape(pres.shapes.RECTANGLE, { x:0.2,  y:ry, w:1.0,  h:0.36, fill:{color:'ff0000'} });
  s.addText('빨간 불', { x:0.2, y:ry, w:1.0, h:0.36, fontSize:12, bold:true, color:'FFFFFF', align:'center', valign:'middle', fontFace:'Calibri' });
  s.addShape(pres.shapes.RECTANGLE, { x:1.25, y:ry, w:8.55, h:0.36, fill:{color:'FFFFFF'}, line:{color:'808080', width:1} });
}

// ── 메인 진입점 ──────────────────────────────────────
// 사이드바 '보고서 생성' → 기준 월 선택 모달
function openReportModal() {
  if (!user) { showLogin(); return; }
  if (!isAdmin()) { toast('권한이 없습니다.'); return; }
  closeSidebar();
  const m = document.getElementById('reportModal');
  if (m) m.classList.remove('hide');
}
function closeReportModal() {
  const m = document.getElementById('reportModal');
  if (m) m.classList.add('hide');
}

async function generatePPT() {
  if (!user) { showLogin(); return; }
  if (!isAdmin()) { toast('권한이 없습니다.'); return; }
  if (!records.length) { toast('데이터가 없습니다. 새로고침 후 다시 시도해주세요.'); return; }
  const btn  = document.getElementById('pptHeaderBtn');
  const spin = document.getElementById('pptSpinIcon');
  btn.disabled = true;
  spin.style.display = 'inline-block';

  try {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_16x9';

    // 컨텍스트 사전 계산
    const now       = new Date();
    const yr        = now.getFullYear();
    const ym        = yr + '-' + String(now.getMonth()+1).padStart(2,'0');
    // 기준(데이터) 월: 선택값(YYYY-MM)이 있으면 그 달, 없으면 오늘 기준 지난 달
    const sel = (document.getElementById('pptMonth') || {}).value;
    const baseDate = sel
      ? new Date(+sel.slice(0,4), +sel.slice(5,7) - 1, 1)
      : new Date(yr, now.getMonth() - 1, 1);
    const prevYr        = baseDate.getFullYear();
    const prevMonthName = baseDate.getMonth() + 1;
    const prevYm        = prevYr + '-' + String(prevMonthName).padStart(2,'0');
    // 발행(표지·파일명) 월 = 기준 월 + 1 (기존 "지난 달 데이터 → 이번 달 보고서" 관례 유지)
    const coverDate  = new Date(prevYr, prevMonthName, 1);
    const coverYr    = coverDate.getFullYear();
    const monthName  = coverDate.getMonth() + 1;

    const d    = records;
    // "연누적" 지표는 기준월(prevYm)까지만 — 기준월 이후 입력분은 제외
    const dAcc = pptAccCutoff(d, prevYr, prevMonthName);
    const tot  = dAcc.reduce((s, r) => s + pptMonCnt(r), 0);
    const vio  = dAcc.filter(r => r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
    const done = dAcc.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
    const act  = dAcc.filter(r => r.status === '위반(처리중)').reduce((s, r) => s + r.count, 0);
    const rate = vio ? Math.round(done / vio * 100) : 0;
    const vr   = tot ? Math.round(vio / tot * 100) : 0;
    const mTot = d.filter(r => r.date && r.date.startsWith(ym)).reduce((s, r) => s + pptMonCnt(r), 0);
    const mVio = d.filter(r => r.date && r.date.startsWith(ym) && r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
    const prevMTot = d.filter(r => r.date && r.date.startsWith(prevYm)).reduce((s, r) => s + pptMonCnt(r), 0);
    const prevMVio = d.filter(r => r.date && r.date.startsWith(prevYm) && r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
    const mArr = MONTHS.map((_, i) => {
      const pfx = yr + '-' + String(i+1).padStart(2,'0');
      return {
        mon: d.filter(r => r.date && r.date.startsWith(pfx)).reduce((s, r) => s + pptMonCnt(r), 0),
        vio: d.filter(r => r.date && r.date.startsWith(pfx) && r.status !== '모니터링').reduce((s, r) => s + r.count, 0)
      };
    });

    const ctx = { now, monthName, yr, ym, prevYr, prevMonthName, prevYm, d, dAcc, tot, vio, mTot, mVio, prevMTot, prevMVio, done, act, rate, vr, mArr };

    buildCoverSlide(pres, ctx);
    buildFixedSlide(pres, ctx);
    buildGradeBoardSlide(pres, ctx, 'acc');
    buildGradeBoardSlide(pres, ctx, 'mon');
    buildActionBoardSlide(pres, ctx, 'acc');
    buildActionBoardSlide(pres, ctx, 'mon');
    buildOverviewSlide(pres, ctx);
    buildBrandSummarySlide(pres, ctx);
    TYPES.forEach((type, idx) => buildTypeDetailSlide(pres, ctx, type, idx));
    // 영역별 상세 섹션 직후, 9개 영역 요약(KPI + 미니 도넛)을 1~2장 슬라이드에 카드 그리드로 통합
    buildTypeSummarySlides(pres, ctx);
    BRANDS.forEach(brand => buildBrandDetailSlide(pres, ctx, brand));

    const fn = '외식BG_리스크_' + coverYr + '년_' + monthName + '월_리스크관리현황.pptx';
    await pres.writeFile({ fileName: fn });
    toast('✅ 보고서 저장 완료!');
    closeReportModal();
  } catch(e) {
    toast('❌ 생성 오류: ' + e.message);
    console.error(e);
  }

  btn.disabled = false;
  spin.style.display = 'none';
}

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
  s.addText('외식 BG 리스크',                       { x:0.85, y:1.45, w:8.5, h:0.75, fontSize:36, bold:true, color:PPT_WHITE, fontFace:'Calibri' });
  s.addText(monthName + '월 리스크 관리 현황',         { x:0.85, y:2.15, w:8.5, h:0.75, fontSize:36, bold:true, color:'CADCFC', fontFace:'Calibri' });
  s.addText('Risk Monitoring & Analytics Report',  { x:0.85, y:3.05, w:8.5, h:0.4,  fontSize:15, color:'8fa8c8', fontFace:'Calibri', italic:true });
  s.addText('기준일: ' + now.toLocaleDateString('ko-KR') + '   |   외식BG RO실',
                                                    { x:0.85, y:4.5,  w:8.5, h:0.4,  fontSize:13, color:'8fa8c8', fontFace:'Calibri' });
}

// ── 슬라이드 2: 법인 전체 KPI + 월별 라인차트 ────────
function buildOverviewSlide(pres, ctx) {
  const { yr, monthName, tot, vio, mTot, mVio, done, act, rate, vr, mArr } = ctx;
  const s = pres.addSlide();
  addPptHeader(pres, s, '법인 전체 리스크 현황', yr + '년 ' + monthName + '월 기준');

  [
    { label:'누적 모니터링', value:tot+'건',  sub:'위반 '+vio+'건 ('+vr+'%)',                                      color:PPT_NAVY },
    { label:'당월 모니터링', value:mTot+'건', sub:'위반 '+mVio+'건 ('+(mTot?Math.round(mVio/mTot*100):0)+'%)',     color:'2563eb' },
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

  s.addChart(pres.charts.LINE, [
    { name:'모니터링', labels:MONTHS, values:mArr.map(m => m.mon) },
    { name:'위반',     labels:MONTHS, values:mArr.map(m => m.vio) }
  ], {
    x:0.25, y:2.25, w:9.5, h:3.05,
    lineSize:2, lineSmooth:true,
    chartColors:['8fa8c8','e8845a'],
    showLegend:true, legendPos:'b',
    catAxisLabelColor:'94a3b8', valAxisLabelColor:'94a3b8',
    valGridLine:{ color:'e2e8f0', size:0.5 },
    chartArea:{ fill:{ color: PPT_WHITE } }
  });
}

// ── 슬라이드 3: 브랜드별 종합 표 ─────────────────────
function buildBrandSummarySlide(pres, ctx) {
  const { yr, monthName, ym, d } = ctx;
  const s = pres.addSlide();
  addPptHeader(pres, s, '브랜드별 현황', yr + '년 ' + monthName + '월 기준');

  const data = [];

  // 헤더행1: 브랜드 | 연누적(영역×2 colspan) | 당월(영역×2 colspan) | 합계(2 colspan)
  data.push([
    { text:'브랜드',           options:{ bold:true, fill:{color:PPT_NAVY},   color:PPT_WHITE, fontSize:10, align:'center', valign:'middle', rowspan:3 } },
    { text:'연 누 적',         options:{ bold:true, fill:{color:'1e3a8a'},   color:PPT_WHITE, fontSize:10, align:'center', colspan:TYPES.length*2 } },
    { text:'당 월 ('+monthName+'월)', options:{ bold:true, fill:{color:'2563eb'}, color:PPT_WHITE, fontSize:10, align:'center', colspan:TYPES.length*2 } },
    { text:'합계',             options:{ bold:true, fill:{color:'334155'},   color:PPT_WHITE, fontSize:10, align:'center', valign:'middle', colspan:2, rowspan:3 } }
  ]);

  // 헤더행2: 영역명 (연누적 6개, 당월 6개)
  const hRow2 = [];
  TYPES.slice(0, TYPES.length - 1).forEach(t => {
    hRow2.push({ text:t, options:{ bold:true, fill:{color:'1a3270'}, color:PPT_WHITE, fontSize:8, align:'center', colspan:2 } });
  });
  hRow2.push({ text:TYPES[5], options:{ bold:true, fill:{color:'1a3270'}, color:PPT_WHITE, fontSize:6, align:'center', colspan:2 } });
  TYPES.slice(0, TYPES.length - 1).forEach(t => {
    hRow2.push({ text:t, options:{ bold:true, fill:{color:'1d4ed8'}, color:PPT_WHITE, fontSize:8, align:'center', colspan:2 } });
  });
  hRow2.push({ text:TYPES[5], options:{ bold:true, fill:{color:'1d4ed8'}, color:PPT_WHITE, fontSize:6, align:'center', colspan:2 } });
  data.push(hRow2);

  // 헤더행3: "전체/위반" 반복
  const hRow3 = [];
  TYPES.forEach(() => {
    hRow3.push({ text:'전체', options:{ bold:true, fill:{color:'1e3a8a'}, color:'CADCFC', fontSize:8, align:'center' } });
    hRow3.push({ text:'위반', options:{ bold:true, fill:{color:'1e3a8a'}, color:'CADCFC', fontSize:8, align:'center' } });
  });
  TYPES.forEach(() => {
    hRow3.push({ text:'전체', options:{ bold:true, fill:{color:'2563eb'}, color:'BFDBFE', fontSize:8, align:'center' } });
    hRow3.push({ text:'위반', options:{ bold:true, fill:{color:'2563eb'}, color:'BFDBFE', fontSize:8, align:'center' } });
  });
  data.push(hRow3);

  // 데이터행: 브랜드별
  BRANDS.forEach((brand, bi) => {
    const bg = bi % 2 === 0 ? 'f8fafc' : PPT_WHITE;
    const row = [{ text:brand, options:{ fontSize:9, bold:true, align:'center', fill:{color:bg} } }];
    let bYearTot = 0, bYearVio = 0;

    // 연누적
    TYPES.forEach(type => {
      const recs = d.filter(r => r.brand === brand && r.type === type);
      const t = recs.reduce((s, r) => s + r.count, 0);
      const v = recs.filter(r => r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
      bYearTot += t; bYearVio += v;
      row.push({ text:t || '-', options:{ fontSize:8, align:'center', fill:{color:bg} } });
      row.push({ text:v || '-', options:{ fontSize:8, align:'center', color:v>0?'dc2626':'94a3b8', bold:v>0, fill:{color:bg} } });
    });

    // 당월
    TYPES.forEach(type => {
      const recs = d.filter(r => r.brand === brand && r.type === type && r.date && r.date.startsWith(ym));
      const t = recs.reduce((s, r) => s + r.count, 0);
      const v = recs.filter(r => r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
      row.push({ text:t || '-', options:{ fontSize:8, align:'center', fill:{color:bg} } });
      row.push({ text:v || '-', options:{ fontSize:8, align:'center', color:v>0?'dc2626':'94a3b8', bold:v>0, fill:{color:bg} } });
    });

    // 합계 (연누적만)
    row.push({ text:bYearTot || '-', options:{ fontSize:8, align:'center', bold:true, fill:{color:'eef2ff'} } });
    row.push({ text:bYearVio || '-', options:{ fontSize:8, align:'center', bold:bYearVio>0, color:bYearVio>0?'dc2626':'94a3b8', fill:{color:'eef2ff'} } });
    data.push(row);
  });

  // 합계행
  const sumRow = [{ text:'합계', options:{ bold:true, fontSize:9, align:'center', fill:{color:PPT_NAVY}, color:PPT_WHITE } }];
  let gYearTot = 0, gYearVio = 0;
  TYPES.forEach(type => {
    const t = d.filter(r => r.type === type).reduce((s, r) => s + r.count, 0);
    const v = d.filter(r => r.type === type && r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
    gYearTot += t; gYearVio += v;
    sumRow.push({ text:t || '-', options:{ bold:true, fontSize:8, align:'center', fill:{color:PPT_NAVY}, color:PPT_WHITE } });
    sumRow.push({ text:v || '-', options:{ bold:true, fontSize:8, align:'center', fill:{color:PPT_NAVY}, color:v>0?'fca5a5':PPT_WHITE } });
  });
  TYPES.forEach(type => {
    const t = d.filter(r => r.type === type && r.date && r.date.startsWith(ym)).reduce((s, r) => s + r.count, 0);
    const v = d.filter(r => r.type === type && r.date && r.date.startsWith(ym) && r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
    sumRow.push({ text:t || '-', options:{ bold:true, fontSize:8, align:'center', fill:{color:'2563eb'}, color:PPT_WHITE } });
    sumRow.push({ text:v || '-', options:{ bold:true, fontSize:8, align:'center', fill:{color:'2563eb'}, color:v>0?'fca5a5':PPT_WHITE } });
  });
  sumRow.push({ text:gYearTot || '-', options:{ bold:true, fontSize:8, align:'center', fill:{color:'334155'}, color:PPT_WHITE } });
  sumRow.push({ text:gYearVio || '-', options:{ bold:true, fontSize:8, align:'center', fill:{color:'334155'}, color:gYearVio>0?'fca5a5':PPT_WHITE } });
  data.push(sumRow);

  // 열 너비: 브랜드(0.7) + 연누적(영역×2×0.34) + 당월(영역×2×0.34) + 합계(0.42×2) = 9.70"
  const typeColW = TYPES.flatMap(() => [0.34, 0.34]);
  s.addTable(data, {
    x:0.15, y:0.85, w:9.7,
    border:{ pt:0.3, color:'e2e8f0' },
    colW:[0.7, ...typeColW, ...typeColW, 0.42, 0.42],
    rowH:0.27
  });
}

// ── 슬라이드 4~: 영역별 상세 ─────────────────────────
function buildTypeDetailSlide(pres, ctx, type, typeIdx) {
  const { yr, now, d } = ctx;
  const typeRecs = d.filter(r => r.type === type);
  if (!typeRecs.length) return;

  const useBrands = type === '불법파견' ? ILLEGAL_REPORT_BRANDS : COMMON_BRANDS;
  const s = pres.addSlide();
  addPptHeader(pres, s, type + ' 모니터링 상세 현황', yr + '년 ' + String(now.getMonth()+1).padStart(2,'0') + '월 기준');
  const typeColor = TYPE_COLORS[typeIdx];

  const typeTot  = typeRecs.reduce((sum, r) => sum + r.count, 0);
  const typeVio  = typeRecs.filter(r => r.status !== '모니터링').reduce((sum, r) => sum + r.count, 0);
  const typeDone = typeRecs.filter(r => r.status === '완료').reduce((sum, r) => sum + r.count, 0);
  const typeAct  = typeRecs.filter(r => r.status === '위반(처리중)').reduce((sum, r) => sum + r.count, 0);
  const typeRate = typeVio ? Math.round(typeDone / typeVio * 100) : 0;

  // 표 (10브랜드(불법파견) vs 9브랜드(일반)에 맞춰 셀 폭 분기)
  const bW       = type === '불법파견' ? 0.38 : 0.42;
  const bCW2     = useBrands.flatMap(() => [bW, bW]);
  const itemColW = SLIDE_W - useBrands.length * bW * 2 - bW * 2;
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
      const t = recs.reduce((sum, r) => sum + r.count, 0);
      const v = recs.filter(r => r.status !== '모니터링').reduce((sum, r) => sum + r.count, 0);
      rTot += t; rVio += v;
      row.push({ text:t || '-', options:{ fontSize:dataFs, align:'center', fill:{color:bg} } });
      row.push({ text:v || '-', options:{ fontSize:dataFs, align:'center', color:v>0?'dc2626':'94a3b8', bold:v>0, fill:{color:bg} } });
    });
    row.push({ text:rTot || '-', options:{ fontSize:dataFs, align:'center', bold:true, fill:{color:'eef2ff'} } });
    row.push({ text:rVio || '-', options:{ fontSize:dataFs, align:'center', bold:rVio>0, color:rVio>0?'dc2626':'94a3b8', fill:{color:'eef2ff'} } });
    tableData.push(row);
  });

  const sumR = [{ text:'합계', options:{ bold:true, fill:{color:PPT_NAVY}, color:PPT_WHITE, fontSize:10, align:'center' } }];
  let gT = 0, gV = 0;
  useBrands.forEach(brand => {
    const t = typeRecs.filter(r => r.brand === brand).reduce((sum, r) => sum + r.count, 0);
    const v = typeRecs.filter(r => r.brand === brand && r.status !== '모니터링').reduce((sum, r) => sum + r.count, 0);
    gT += t; gV += v;
    sumR.push({ text:t || '-', options:{ bold:true, fontSize:dataFs, align:'center', fill:{color:PPT_NAVY}, color:PPT_WHITE } });
    sumR.push({ text:v || '-', options:{ bold:true, fontSize:dataFs, align:'center', fill:{color:PPT_NAVY}, color:v>0?'fca5a5':PPT_WHITE } });
  });
  sumR.push({ text:gT || '-', options:{ bold:true, fontSize:dataFs, align:'center', fill:{color:PPT_NAVY}, color:PPT_WHITE } });
  sumR.push({ text:gV || '-', options:{ bold:true, fontSize:dataFs, align:'center', fill:{color:PPT_NAVY}, color:gV>0?'fca5a5':PPT_WHITE } });
  tableData.push(sumR);

  // 불법파견(16행): 압축, 그 외: 보통
  const rowHeight = type === '불법파견' ? 0.18 : 0.28;
  s.addTable(tableData, { x:TABLE_X, y:TABLE_Y, w:SLIDE_W, border:{pt:0.3,color:'e2e8f0'}, colW:colWs2, rowH:rowHeight });

  // 하단: 도넛(좌) + KPI 요약(우)
  const subs = SUB[type];
  if (subs && subs.length) {
    const subCnts        = subs.map(sub => typeRecs.filter(r => r.subtype === sub && r.status !== '모니터링').reduce((sum, r) => sum + r.count, 0));
    const filteredLabels = subs.filter((_, i) => subCnts[i] > 0);
    const filteredCnts   = subCnts.filter(v => v > 0);
    s.addChart(pres.charts.DOUGHNUT, [{ name:'건수', labels:filteredLabels, values:filteredCnts }], {
      x:TABLE_X, y:BTM_Y, w:3.5, h:BTM_H,
      chartColors: SUB_COLORS.slice(0, filteredLabels.length),
      showLegend:true, legendPos:'r', legendFontSize:9,
      showPercent:true,
      dataLabelColor:PPT_WHITE,
      dataLabelFontSize:6,
      chartArea:{ fill:{ color: PPT_WHITE } },
      holeSize:55
    });
  }

  // KPI 요약 박스 (2×2)
  const kpiX = 3.85;
  const kpiW = 6.0;
  s.addShape(pres.shapes.RECTANGLE, { x:kpiX, y:BTM_Y, w:kpiW, h:BTM_H, fill:{color:PPT_WHITE}, shadow:{type:'outer',blur:5,offset:2,angle:135,color:'000000',opacity:0.07} });
  s.addShape(pres.shapes.RECTANGLE, { x:kpiX, y:BTM_Y, w:0.06, h:BTM_H, fill:{color:typeColor} });
  s.addText(type + ' 모니터링 결과 요약', { x:kpiX+0.15, y:BTM_Y+0.05, w:kpiW-0.25, h:0.3, fontSize:12, bold:true, color:'334155', fontFace:'Calibri' });

  const cellW = (kpiW - 0.3) / 2;
  [
    ['전체 모니터링', typeTot + '건'],
    ['위반 건수',     typeVio + '건 (' + (typeTot ? Math.round(typeVio/typeTot*100) : 0) + '%)'],
    ['처리 완료율',   typeRate + '%'],
    ['조치중',       typeAct + '건']
  ].forEach(([label, val], i) => {
    const col  = i % 2;
    const rowI = Math.floor(i / 2);
    const cx = kpiX + 0.15 + col * cellW;
    const cy = BTM_Y + 0.4 + rowI * 0.45;
    s.addText(label + ':', { x:cx, y:cy, w:cellW*0.55, h:0.4, fontSize:10, color:'64748b', fontFace:'Calibri', valign:'middle' });
    s.addText(val,         { x:cx + cellW*0.55, y:cy, w:cellW*0.45, h:0.4, fontSize:12, bold:true, color:'0f172a', fontFace:'Calibri', align:'right', valign:'middle' });
  });
}

// ── 메인 진입점 ──────────────────────────────────────
async function generatePPT() {
  if (!user) { toast('로그인 후 이용해 주세요.'); showLogin(); return; }
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
    const monthName = now.getMonth() + 1;
    const yr        = now.getFullYear();
    const ym        = yr + '-' + String(now.getMonth()+1).padStart(2,'0');

    const d    = records;
    const tot  = d.reduce((s, r) => s + r.count, 0);
    const vio  = d.filter(r => r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
    const done = d.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
    const act  = d.filter(r => r.status === '위반(처리중)').reduce((s, r) => s + r.count, 0);
    const rate = vio ? Math.round(done / vio * 100) : 0;
    const vr   = tot ? Math.round(vio / tot * 100) : 0;
    const mTot = d.filter(r => r.date && r.date.startsWith(ym)).reduce((s, r) => s + r.count, 0);
    const mVio = d.filter(r => r.date && r.date.startsWith(ym) && r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
    const mArr = MONTHS.map((_, i) => {
      const pfx = yr + '-' + String(i+1).padStart(2,'0');
      return {
        mon: d.filter(r => r.date && r.date.startsWith(pfx)).reduce((s, r) => s + r.count, 0),
        vio: d.filter(r => r.date && r.date.startsWith(pfx) && r.status !== '모니터링').reduce((s, r) => s + r.count, 0)
      };
    });

    const ctx = { now, monthName, yr, ym, d, tot, vio, mTot, mVio, done, act, rate, vr, mArr };

    buildCoverSlide(pres, ctx);
    buildOverviewSlide(pres, ctx);
    buildBrandSummarySlide(pres, ctx);
    TYPES.forEach((type, idx) => buildTypeDetailSlide(pres, ctx, type, idx));

    const fn = '외식BG_리스크_' + yr + '년_' + monthName + '월_리스크관리현황.pptx';
    await pres.writeFile({ fileName: fn });
    toast('✅ 보고서 저장 완료!');
  } catch(e) {
    toast('❌ 생성 오류: ' + e.message);
    console.error(e);
  }

  btn.disabled = false;
  spin.style.display = 'none';
}

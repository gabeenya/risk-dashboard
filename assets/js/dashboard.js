// ── 대시보드 ─────────────────────────────────────────
async function loadData() {
  if (!user) { records = []; return; }   // 비로그인 시 데이터 자체를 비움
  setSy('불러오는 중...', '#15803d', '#f0fdf4');
  try { records = await sbGet('records'); }
  catch(e) { records = []; }
  // 레거시 영역명 정규화: 'IP(지식재산)' → 'IP'
  records.forEach(r => { if (r.type === 'IP(지식재산)') r.type = 'IP'; });
  // 브랜드/영역 권한 필터링: admin이 아니면 본인이 접근 가능한 브랜드+영역만 노출
  if (!isAdmin()) {
    const allowB = userBrands();
    const allowT = userTypes();
    records = records.filter(r => allowB.includes(r.brand) && allowT.includes(r.type));
  }
  records.sort((a, b) => b.date.localeCompare(a.date));
  setSy('동기화됨', '#15803d', '#f0fdf4');
  renderDash(curFilter);
  if (isAdmin()) renderInputTable();
}

// 필터 적용된 records
function getFR(k) { return k === 'all' ? records : records.filter(r => r.type === k); }

// 영업비밀은 모니터링 건수 집계 시 10:1 환산(위반 건수는 원값 유지)
function monCnt(r) {
  if (r.type === '영업비밀') return r.count / 10;
  return r.count;
}
// 환산값 합계를 보기 좋게 — 정수면 정수로, 소수면 소수 1자리로
function fmtMon(n) { return Number.isInteger(n) ? n.toLocaleString() : (Math.round(n * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

// SLA: '위반(처리중)' 상태로 발생일(date)로부터 N일 이상 경과 → 장기 미해결
const SLA_DAYS = 14;
function daysSince(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d)) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
function isSlaOver(r) { return r.status === '위반(처리중)' && daysSince(r.date) >= SLA_DAYS; }

// SLA 초과 건 호버 팝업 — 현재 영역 필터(curFilter) 기준
let __slaPopupEl = null;
function showSlaPopup(target) {
  hideSlaPopup();
  const list = getFR(curFilter).filter(isSlaOver)
    .map(r => ({ ...r, days: daysSince(r.date) }))
    .sort((a, b) => b.days - a.days);
  if (!list.length) return;

  const rows = list.map(r => `
    <tr>
      <td>${esc(r.date)}</td>
      <td class="sla-popup-days">${r.days}일</td>
      <td>${esc(r.type)}${r.subtype ? ' / ' + esc(r.subtype) : ''}</td>
      <td>${esc(r.brand || '-')}</td>
      <td style="text-align:right">${r.count.toLocaleString()}</td>
    </tr>`).join('');

  const totalCnt = list.reduce((s, r) => s + r.count, 0);
  __slaPopupEl = document.createElement('div');
  __slaPopupEl.className = 'sla-popup';
  __slaPopupEl.innerHTML = `
    <div class="sla-popup-hd">14일 이상 위반(처리중) — ${list.length}레코드 · ${totalCnt.toLocaleString()}건</div>
    <table class="sla-popup-tbl">
      <thead><tr><th>발생일</th><th>경과</th><th>영역/상세</th><th>브랜드</th><th style="text-align:right">건수</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  document.body.appendChild(__slaPopupEl);

  // 위치 조정: 트리거 아래, 화면 밖이면 위/좌로 보정
  const rect = target.getBoundingClientRect();
  const pop  = __slaPopupEl.getBoundingClientRect();
  const margin = 6;
  let left = rect.left;
  let top  = rect.bottom + margin;
  if (left + pop.width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - pop.width - 12);
  if (top  + pop.height > window.innerHeight - 12) top = Math.max(12, rect.top - pop.height - margin);
  __slaPopupEl.style.left = left + 'px';
  __slaPopupEl.style.top  = top  + 'px';
}
function hideSlaPopup() {
  if (__slaPopupEl) { __slaPopupEl.remove(); __slaPopupEl = null; }
}

// 임계치(영역별 위반 건수) — 전월 대비 +건수 / 전월 대비 +% 둘 다 검사
function getThresholds() {
  try { const saved = JSON.parse(localStorage.getItem('riskThresholds') || '{}');
        // 구버전 abs 키가 남아있어도 새 delta 기본값으로 자연스럽게 폴백
        const merged = { ...THRESHOLDS_DEFAULT };
        Object.keys(saved).forEach(k => {
          merged[k] = {
            delta: (saved[k] && typeof saved[k].delta === 'number') ? saved[k].delta : (THRESHOLDS_DEFAULT[k] ? THRESHOLDS_DEFAULT[k].delta : 10),
            mom:   (saved[k] && typeof saved[k].mom   === 'number') ? saved[k].mom   : (THRESHOLDS_DEFAULT[k] ? THRESHOLDS_DEFAULT[k].mom   : 50)
          };
        });
        return merged; }
  catch { return { ...THRESHOLDS_DEFAULT }; }
}
function checkThresholds() {
  const alerts = [];
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;
  const T = getThresholds();
  TYPES.forEach(type => {
    const t = T[type] || THRESHOLDS_DEFAULT[type];
    if (!t) return;
    const currVio = records.filter(r => r.type === type && r.date && r.date.startsWith(ym) && r.status !== '모니터링').reduce((s,r) => s+r.count, 0);
    const prevVio = records.filter(r => r.type === type && r.date && r.date.startsWith(prevYm) && r.status !== '모니터링').reduce((s,r) => s+r.count, 0);
    const delta = currVio - prevVio;
    if (delta >= t.delta && t.delta > 0) {
      alerts.push({ type, kind: 'delta', curr: currVio, prev: prevVio, delta, threshold: t.delta });
    }
    if (prevVio > 0) {
      const pct = ((currVio - prevVio) / prevVio) * 100;
      if (pct >= t.mom && t.mom > 0) {
        alerts.push({ type, kind: 'mom', curr: currVio, prev: prevVio, pct: Math.round(pct) });
      }
    }
  });
  return alerts;
}
function renderAlerts() {
  const bar = document.getElementById('alertBar');
  if (!bar) return;
  const alerts = checkThresholds();
  if (!alerts.length) { bar.style.display = 'none'; bar.innerHTML = ''; updateAlertFilterDots(new Set()); return; }
  const typesInAlert = new Set(alerts.map(a => a.type));
  bar.style.display = '';
  const items = alerts.map(a => {
    if (a.kind === 'delta') return `<span class="alert-chip" onclick="setFilter(document.querySelector('.fb[onclick*=&quot;${a.type}&quot;]'),'${a.type}')"><b>${a.type}</b> 전월 대비 <b>+${a.delta.toLocaleString()}건</b> (${a.prev}→${a.curr})</span>`;
    return `<span class="alert-chip" onclick="setFilter(document.querySelector('.fb[onclick*=&quot;${a.type}&quot;]'),'${a.type}')"><b>${a.type}</b> 전월 대비 <b>+${a.pct}%</b> (${a.prev}→${a.curr})</span>`;
  }).join('');
  bar.innerHTML = `<span class="alert-lead">🔔 알림 ${alerts.length}건</span>${items}`;
  updateAlertFilterDots(typesInAlert);
}
function updateAlertFilterDots(typesInAlert) {
  document.querySelectorAll('.fb').forEach(btn => {
    btn.classList.remove('has-alert');
    const m = btn.getAttribute('onclick') || '';
    TYPES.forEach(t => {
      if (typesInAlert.has(t) && m.includes(`'${t}'`)) btn.classList.add('has-alert');
    });
  });
}

function renderDash(k) {
  const d = getFR(k);
  const tot = d.reduce((s, r) => s + monCnt(r), 0);
  const vio = d.filter(r => r.status === '위반(처리중)' || r.status === '완료').reduce((s, r) => s + r.count, 0);
  const now = new Date();
  const ym  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const mTot = d.filter(r => r.date.startsWith(ym)).reduce((s, r) => s + monCnt(r), 0);
  const mVio = d.filter(r => r.date.startsWith(ym) && (r.status === '위반(처리중)' || r.status === '완료')).reduce((s, r) => s + r.count, 0);
  const done = d.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
  const act  = d.filter(r => r.status === '위반(처리중)').reduce((s, r) => s + r.count, 0);
  const slaOver = d.filter(isSlaOver).reduce((s, r) => s + r.count, 0);
  const dr  = vio  ? (done / vio  * 100).toFixed(1) : 0;
  const vr  = tot  ? (vio  / tot  * 100).toFixed(1) : 0;
  const mvr = mTot ? (mVio / mTot * 100).toFixed(1) : 0;

  document.getElementById('kpi1').textContent  = `${vio.toLocaleString()} / ${fmtMon(tot)}`;
  document.getElementById('kpi1r').textContent = tot ? `위반율 ${vr}%` : '-';
  document.getElementById('kpi1s').textContent = '위반 / 전체 모니터링';
  document.getElementById('kpi2').textContent  = `${mVio.toLocaleString()} / ${fmtMon(mTot)}`;
  document.getElementById('kpi2r').textContent = mTot ? `위반율 ${mvr}%` : '-';
  document.getElementById('kpi2s').textContent = `${now.getMonth()+1}월 기준`;
  document.getElementById('kpi3').textContent  = dr + '%';
  document.getElementById('kpi3s').textContent = `완료 ${done.toLocaleString()} / 위반 ${vio.toLocaleString()}건`;
  document.getElementById('kpi4').textContent  = act.toLocaleString();
  const k4s = document.getElementById('kpi4s');
  if (slaOver > 0) {
    k4s.innerHTML = `위반(처리중) 상태 · <span class="sla-alert" onmouseenter="showSlaPopup(this)" onmouseleave="hideSlaPopup()">${SLA_DAYS}일 초과 ${slaOver.toLocaleString()}건</span>`;
  } else {
    k4s.textContent = '위반(처리중) 상태 건수';
  }

  renderLine(d, now);
  renderRight(d, k, now);
  // 막대그래프(브랜드별 현황)는 admin만 — 브랜드장은 본인 1~몇 개만 보이면 차트 의미가 옅어 카드 자체를 숨김.
  // 브랜드장에게는 도넛/라인 차트의 환산 안내 푸터로 안내가 충분히 전달됨.
  const barCard = document.getElementById('barChartCard');
  if (isAdmin()) {
    if (barCard) barCard.style.display = '';
    renderBar(d);
  } else {
    if (barCard) barCard.style.display = 'none';
  }
  renderRecent(d);
  renderHeatmap();
  renderAlerts();

  // 영업비밀 10:1 환산 안내: 도넛·브랜드별 현황은 전체·영업비밀에서, 추이 그래프는 영업비밀 탭에서만 노출
  const showNote = (k === 'all' || k === '영업비밀') ? '' : 'none';
  const rNote = document.getElementById('rChartNote');
  const bNote = document.getElementById('barChartNote');
  const lNote = document.getElementById('lineChartNote');
  if (rNote) rNote.style.display = showNote;
  if (bNote) bNote.style.display = showNote;
  if (lNote) lNote.style.display = (k === '영업비밀') ? '' : 'none';
}

// ── 브랜드/영역별 위험도 리더보드 ──────────────────
// 고정 브랜드 순서로 카드 배치, 각 카드에 Top 3 영역을 칩으로 표시
const BRAND_ORDER = ['애슐리','피자몰','로운','자연별곡','리미니','델리바이애슐리','프랜차이즈','카페','프랑제리','기흥ck','광주ck','주안ck','CX팀','상권','본부'];

function renderHeatmap() {
  const wrap = document.getElementById('heatmapWrap');
  if (!wrap) return;
  const brands = isAdmin() ? BRANDS : userBrands().filter(b => BRANDS.includes(b));
  if (!brands.length) { wrap.innerHTML = '<div class="drill-empty">표시할 브랜드가 없습니다.</div>'; return; }

  const cnt = (type, brand) => records
    .filter(r => r.type === type && r.brand === brand && r.status !== '모니터링')
    .reduce((s, r) => s + r.count, 0);

  const items = brands.map(b => {
    const areas = TYPES.map(t => ({ type: t, count: cnt(t, b) }))
      .filter(a => a.count > 0)
      .sort((x, y) => y.count - x.count);
    const total = areas.reduce((s, a) => s + a.count, 0);
    return { brand: b, total, areas };
  })
  .filter(it => it.total > 0)
  .sort((a, b) => {
    const ai = BRAND_ORDER.indexOf(a.brand);
    const bi = BRAND_ORDER.indexOf(b.brand);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  if (!items.length) {
    wrap.innerHTML = '<div class="drill-empty">표시할 위반 데이터가 없습니다.</div>';
    return;
  }

  // 전역 max: 모든 (브랜드, 영역) 조합 중 최대값 → 카드 간 동일 스케일로 위험도 비교
  const globalMax = Math.max(1, ...items.flatMap(it => it.areas.map(a => a.count)));

  let html = '<div class="rank-grid">';
  items.forEach(it => {
    const areaRows = it.areas.map(a => {
      const pct = Math.max(6, Math.round(a.count / globalMax * 100));
      return `
        <div class="rank-area" onclick="event.stopPropagation();openDrill('type-brand','${a.type}','${it.brand}')">
          <span class="rank-area-name">${a.type}</span>
          <div class="rank-area-bar"><div class="rank-area-fill" style="width:${pct}%"></div></div>
          <span class="rank-area-count">${a.count.toLocaleString()}</span>
        </div>`;
    }).join('');

    html += `
      <div class="rank-card" onclick="openDrill('brand','${it.brand}')">
        <div class="rank-card-hd">
          <span class="rank-brand">${it.brand}</span>
          <span class="rank-total">누적위반 ${it.total.toLocaleString()}건</span>
        </div>
        <div class="rank-areas">${areaRows}</div>
      </div>`;
  });
  html += '</div>';
  wrap.innerHTML = html;
}

// ── 드릴다운: 영역×브랜드 / 영역 / 브랜드 / 상세유형 등 조건으로 records 필터해서 패널 표시
function openDrill(mode, a, b) {
  let filtered = records.slice();
  let title = '', sub = '';
  if (mode === 'type-brand')   { filtered = filtered.filter(r => r.type === a && r.brand === b); title = `${a} × ${b}`;  sub = `위반 건수 ${filtered.filter(r => r.status !== '모니터링').reduce((s,r)=>s+r.count,0)}건 · 모니터링 포함 총 ${filtered.length}레코드`; }
  else if (mode === 'type')    { filtered = filtered.filter(r => r.type === a);                   title = `${a} 전체`;   sub = `${filtered.length}레코드`; }
  else if (mode === 'brand')   { filtered = filtered.filter(r => r.brand === a);                  title = `${a} 전체`;   sub = `${filtered.length}레코드`; }
  else if (mode === 'subtype') { filtered = filtered.filter(r => r.type === a && r.subtype === b); title = `${a} · ${b}`; sub = `${filtered.length}레코드`; }
  else if (mode === 'month')   { filtered = filtered.filter(r => r.date && r.date.startsWith(a)); title = `${a} 발생`;   sub = `${filtered.length}레코드`; }

  filtered.sort((x, y) => y.date.localeCompare(x.date));
  document.getElementById('drillTit').textContent = title;
  document.getElementById('drillSub').textContent = sub;
  const tb = document.getElementById('drillTbody');
  if (!filtered.length) {
    tb.innerHTML = '<tr><td colspan="7"><div class="drill-empty">해당 데이터가 없습니다.</div></td></tr>';
  } else {
    tb.innerHTML = filtered.map(r => {
      const over = isSlaOver(r);
      const ageBadge = over ? ` <span class="sla-badge">${daysSince(r.date)}일</span>` : '';
      return `<tr${over ? ' class="sla-over"' : ''}>
      <td>${esc(r.date)}</td>
      <td>${esc(r.subtype || '-')}</td>
      <td>${esc(r.brand)}</td>
      <td>${r.count}</td>
      <td><span class="st ${sc(r.status)}">${esc(r.status)}</span>${ageBadge}</td>
      <td>${esc(r.author || '-')}</td>
      <td>${esc(r.note || '-')}</td>
    </tr>`;
    }).join('');
  }
  document.getElementById('drillOverlay').classList.add('on');
  document.getElementById('drillPanel').classList.add('on');
}

function closeDrill() {
  document.getElementById('drillOverlay').classList.remove('on');
  document.getElementById('drillPanel').classList.remove('on');
}

function renderLine(d, now) {
  const yr = now.getFullYear();
  document.getElementById('lineYear').textContent = yr + '년';

  const m = Array(12).fill(0);
  const v = Array(12).fill(0);
  d.forEach(r => {
    const x = new Date(r.date);
    if (x.getFullYear() === yr) {
      m[x.getMonth()] += monCnt(r);
      if (r.status === '위반(처리중)' || r.status === '완료') v[x.getMonth()] += r.count;
    }
  });

  if (lChart) lChart.destroy();
  lChart = new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: {
      labels: MONTHS,
      datasets: [
        { label:'모니터링', data:m, borderColor:'#8fa8c8', backgroundColor:'rgba(143,168,200,0.07)', tension:0.4, pointRadius:3, pointBackgroundColor:'#8fa8c8', borderWidth:2 },
        { label:'위반',     data:v, borderColor:'#e8845a', backgroundColor:'rgba(232,132,90,0.07)',  tension:0.4, pointRadius:3, pointBackgroundColor:'#e8845a', borderWidth:2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid:{color:'rgba(0,0,0,0.03)'}, ticks:{font:{size:10},color:'#94a3b8',autoSkip:false,maxRotation:0} },
        y: { grid:{color:'rgba(0,0,0,0.03)'}, ticks:{font:{size:10},color:'#94a3b8'}, beginAtZero:true }
      }
    }
  });
}

function renderRight(d, k, now) {
  if (rChart) { rChart.destroy(); rChart = null; }
  const lg  = document.getElementById('rChartLeg');
  const tag = document.getElementById('rChartTag');
  const tit = document.getElementById('rChartTit');

  if (k === 'all') {
    tit.textContent = '위반 유형별 분포';
    tag.textContent = now.getFullYear() + '년';
    const cnt = TYPES.map(t => d.filter(r => r.type === t && r.status !== '모니터링').reduce((s,r) => s + r.count, 0));
    const tot = cnt.reduce((a,b) => a + b, 0);
    let legHtml = TYPES.map((t,i) => `<span><span class="ld" style="background:${TC[i]}"></span>${t} ${tot ? Math.round(cnt[i]/tot*100) : 0}%</span>`).join('');
    if (!tot) legHtml += '<span class="empty-note">위반 사항이 없습니다.</span>';
    lg.innerHTML = legHtml;
    rChart = new Chart(document.getElementById('rightChart'), {
      type: 'doughnut',
      data: { labels: TYPES, datasets: [{ data: cnt, backgroundColor: TC, borderWidth: 3, borderColor: '#fff' }] },
      options: {
        responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{legend:{display:false}},
        onClick: (_, els) => { if (els.length) openDrill('type', TYPES[els[0].index]); }
      }
    });
  } else {
    tit.textContent = '상세 위반 유형별 분포';
    tag.textContent = k;
    const subs = SUB[k];
    if (!subs || !subs.length) {
      lg.innerHTML = '<span class="empty-note">등록된 상세 유형이 없습니다</span>';
      return;
    }
    const cnt = subs.map(s => d.filter(r => r.subtype === s && r.status !== '모니터링').reduce((x,r) => x + r.count, 0));
    const tot = cnt.reduce((a,b) => a + b, 0);
    let legHtml = subs.map((s,i) => `<span><span class="ld" style="background:${SC[i%SC.length]}"></span>${s} ${tot ? Math.round(cnt[i]/tot*100) : 0}%</span>`).join('');
    if (!tot) legHtml += '<span class="empty-note">위반 사항이 없습니다.</span>';
    lg.innerHTML = legHtml;
    rChart = new Chart(document.getElementById('rightChart'), {
      type: 'doughnut',
      data: { labels: subs, datasets: [{ data: cnt, backgroundColor: subs.map((_,i) => SC[i%SC.length]), borderWidth: 3, borderColor: '#fff' }] },
      options: {
        responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{legend:{display:false}},
        onClick: (_, els) => { if (els.length) openDrill('subtype', k, subs[els[0].index]); }
      }
    });
  }
}

function renderBar(d) {
  // 비-admin은 본인 권한 브랜드만 막대로 노출
  const labels   = isAdmin() ? BRANDS : userBrands().filter(b => BRANDS.includes(b));
  const total    = labels.map(b => d.filter(r => r.brand === b).reduce((s,r) => s + monCnt(r), 0));
  const detected = labels.map(b => d.filter(r => r.brand === b && r.status !== '모니터링').reduce((s,r) => s + r.count, 0));
  if (bChart) bChart.destroy();
  bChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'총 모니터링 건수', data: total,    backgroundColor:'#8fa8c8', borderRadius: 4, borderSkipped: false, categoryPercentage: 0.92, barPercentage: 0.95, maxBarThickness: 26 },
        { label:'위반',             data: detected, backgroundColor:'#e8845a', borderRadius: 4, borderSkipped: false, categoryPercentage: 0.92, barPercentage: 0.95, maxBarThickness: 26 }
      ]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid:{color:'rgba(0,0,0,0.03)'}, ticks:{font:{size:10},color:'#94a3b8'}, beginAtZero:true },
        y: { grid:{display:false}, ticks:{font:{size:10},color:'#475569'} }
      },
      onClick: (_, els) => { if (els.length) openDrill('brand', labels[els[0].index]); }
    }
  });
}

function renderRecent(d) {
  const tb = document.getElementById('recentTbody');
  const pg = document.getElementById('recentPager');
  const PAGE_SIZE = 10;
  // 상태별 필터 적용
  const filtered = recentStatus === 'all' ? d : d.filter(r => r.status === recentStatus);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (recentPage >= totalPages) recentPage = totalPages - 1;
  if (recentPage < 0) recentPage = 0;
  const start = recentPage * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  if (!slice.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty">데이터를 입력해 주세요</div></td></tr>';
    pg.innerHTML = '';
    return;
  }
  let html = slice.map(r => {
    const over = isSlaOver(r);
    const ageBadge = over ? ` <span class="sla-badge" title="발생 후 ${daysSince(r.date)}일 경과">${daysSince(r.date)}일</span>` : '';
    return `<tr${over ? ' class="sla-over"' : ''}>
    <td>${esc(r.date.slice(5).replace('-','/'))}</td>
    <td>${esc(r.type)}</td>
    <td class="cell-sub">${esc(r.subtype||'-')}</td>
    <td>${esc(r.brand)}</td>
    <td><span class="st ${sc(r.status)}">${esc(r.status)}</span>${ageBadge}</td>
    <td class="cell-sub">${esc(r.note||'-')}</td>
  </tr>`;
  }).join('');
  for (let i = slice.length; i < PAGE_SIZE; i++) {
    html += '<tr class="ph-row"><td colspan="6">&nbsp;</td></tr>';
  }
  tb.innerHTML = html;
  renderPager(pg, recentPage, totalPages);
}

function renderPager(c, curr, total) {
  if (total <= 1) { c.innerHTML = ''; return; }

  let html = `<button class="pg-btn" ${curr===0 ? 'disabled' : ''} onclick="gotoPage(${curr-1})">‹</button>`;
  const pages = [];
  if (total <= 7) {
    for (let i = 0; i < total; i++) pages.push(i);
  } else {
    pages.push(0);
    if (curr > 2) pages.push('...');
    for (let i = Math.max(1, curr-1); i <= Math.min(total-2, curr+1); i++) pages.push(i);
    if (curr < total-3) pages.push('...');
    pages.push(total-1);
  }
  pages.forEach(p => {
    if (p === '...') html += `<span class="pg-dot">…</span>`;
    else html += `<button class="pg-btn${p===curr ? ' on' : ''}" onclick="gotoPage(${p})">${p+1}</button>`;
  });
  html += `<button class="pg-btn" ${curr===total-1 ? 'disabled' : ''} onclick="gotoPage(${curr+1})">›</button>`;
  c.innerHTML = html;
}

function gotoPage(p) { recentPage = p; renderRecent(getFR(curFilter)); }

function setRecentStatus(btn, st) {
  document.querySelectorAll('.rs-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  recentStatus = st;
  recentPage = 0;
  renderRecent(getFR(curFilter));
}

// ── 대시보드 ─────────────────────────────────────────
async function loadData() {
  if (!user) { records = []; return; }   // 비로그인 시 데이터 자체를 비움
  setSy('불러오는 중...', '#15803d', '#f0fdf4');
  try { records = await sbGet('records'); }
  catch(e) { records = []; }
  // 레거시 영역명 정규화: 'IP(지식재산)' → 'IP'
  records.forEach(r => { if (r.type === 'IP(지식재산)') r.type = 'IP'; });
  // 브랜드 권한 필터링: admin이 아니면 본인 브랜드만 노출
  if (!isAdmin()) {
    const allow = userBrands();
    records = records.filter(r => allow.includes(r.brand));
  }
  records.sort((a, b) => b.date.localeCompare(a.date));
  setSy('동기화됨', '#15803d', '#f0fdf4');
  renderDash(curFilter);
  if (isAdmin()) renderInputTable();
}

// 필터 적용된 records
function getFR(k) { return k === 'all' ? records : records.filter(r => r.type === k); }

function renderDash(k) {
  const d = getFR(k);
  const tot = d.reduce((s, r) => s + r.count, 0);
  const vio = d.filter(r => r.status === '위반(처리중)' || r.status === '완료').reduce((s, r) => s + r.count, 0);
  const now = new Date();
  const ym  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const mTot = d.filter(r => r.date.startsWith(ym)).reduce((s, r) => s + r.count, 0);
  const mVio = d.filter(r => r.date.startsWith(ym) && (r.status === '위반(처리중)' || r.status === '완료')).reduce((s, r) => s + r.count, 0);
  const done = d.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
  const act  = d.filter(r => r.status === '위반(처리중)').reduce((s, r) => s + r.count, 0);
  const dr  = vio  ? (done / vio  * 100).toFixed(1) : 0;
  const vr  = tot  ? (vio  / tot  * 100).toFixed(1) : 0;
  const mvr = mTot ? (mVio / mTot * 100).toFixed(1) : 0;

  document.getElementById('kpi1').textContent  = `${vio.toLocaleString()} / ${tot.toLocaleString()}`;
  document.getElementById('kpi1r').textContent = tot ? `위반율 ${vr}%` : '-';
  document.getElementById('kpi1s').textContent = '위반 / 전체 모니터링';
  document.getElementById('kpi2').textContent  = `${mVio.toLocaleString()} / ${mTot.toLocaleString()}`;
  document.getElementById('kpi2r').textContent = mTot ? `위반율 ${mvr}%` : '-';
  document.getElementById('kpi2s').textContent = `${now.getMonth()+1}월 기준`;
  document.getElementById('kpi3').textContent  = dr + '%';
  document.getElementById('kpi3s').textContent = `완료 ${done.toLocaleString()} / 위반 ${vio.toLocaleString()}건`;
  document.getElementById('kpi4').textContent  = act.toLocaleString();
  document.getElementById('kpi4s').textContent = '위반(처리중) 상태 건수';

  renderLine(d, now);
  renderRight(d, k, now);
  // 막대그래프(브랜드별 현황)는 admin만 — 브랜드장은 본인 1~몇 개만 보이면 차트 의미가 옅어 카드 자체를 숨김
  const barCard = document.getElementById('barChartCard');
  if (isAdmin()) {
    if (barCard) barCard.style.display = '';
    renderBar(d);
  } else {
    if (barCard) barCard.style.display = 'none';
  }
  renderRecent(d);
}

function renderLine(d, now) {
  const yr = now.getFullYear();
  document.getElementById('lineYear').textContent = yr + '년';

  const m = Array(12).fill(0);
  const v = Array(12).fill(0);
  d.forEach(r => {
    const x = new Date(r.date);
    if (x.getFullYear() === yr) {
      m[x.getMonth()] += r.count;
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
      options: { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{legend:{display:false}} }
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
      options: { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{legend:{display:false}} }
    });
  }
}

function renderBar(d) {
  // 비-admin은 본인 권한 브랜드만 막대로 노출
  const labels   = isAdmin() ? BRANDS : userBrands().filter(b => BRANDS.includes(b));
  const total    = labels.map(b => d.filter(r => r.brand === b).reduce((s,r) => s + r.count, 0));
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
      }
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
  let html = slice.map(r => `<tr>
    <td>${r.date.slice(5).replace('-','/')}</td>
    <td>${r.type}</td>
    <td class="cell-sub">${r.subtype||'-'}</td>
    <td>${r.brand}</td>
    <td><span class="st ${sc(r.status)}">${r.status}</span></td>
    <td class="cell-sub">${r.note||'-'}</td>
  </tr>`).join('');
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

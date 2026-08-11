// ── KPI 숫자 카운트업 애니메이션 ────────────────────
let _kpiRepeat = null;
const _kpiTok   = {};   // 카드별 취소 토큰 — 새 애니메이션 시작 시 구 rAF 루프 종료
// 카드별 "진짜" 목표 문자열 캐시. renderDash가 실제 데이터로 textContent를 세팅한 직후 1회만
// DOM에서 캡처해 여기 저장하고, 이후 반복 카운트업은 항상 이 캐시값만 목표로 삼는다.
// (DOM textContent를 매번 다시 읽어 목표로 삼으면, 백그라운드 탭에서 rAF가 멈춰 애니메이션이
//  "0 / 0" 같은 중간값에 멈춘 순간을 다음 주기가 그대로 읽어들여 0/0에 영구 고정되는
//  피드백 루프가 생긴다 — 이게 반복됐던 "00/00" 현상의 근본 원인이었음)
const _kpiFinal = {};

function _kpiAnim(id, el, target, suffix, isFloat) {
  const tok = Symbol();
  _kpiTok[id] = tok;
  const dur = 900, t0 = performance.now();
  const safe = v => Math.max(0, v);   // 음수 방어
  const fmt  = v => isFloat ? safe(v).toFixed(1) : Math.round(safe(v)).toLocaleString();
  const tick = now => {
    if (_kpiTok[id] !== tok) return;  // 더 새로운 애니메이션이 시작됐으면 중단
    const p = Math.min((now - t0) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(target * e) + suffix;
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = fmt(target) + suffix;
  };
  requestAnimationFrame(tick);
}

// capture=true: renderDash 직후 최초 호출 — DOM에 방금 세팅된 실제 값을 캡처해 캐시에 저장.
// capture=false(생략): setInterval 반복 호출 — DOM을 다시 읽지 않고 캐시된 값만 사용.
function runKpiCountUp(capture) {
  ['kpi1','kpi2','kpi3','kpi4'].forEach((id, i) => {
    const el  = document.getElementById(id);
    if (!el) return;

    if (capture) {
      const domRaw = el.textContent.trim();
      if (!domRaw || domRaw === '-') { delete _kpiFinal[id]; return; }
      _kpiFinal[id] = domRaw;
    }

    const raw = _kpiFinal[id];
    if (!raw) return;

    setTimeout(() => {
      // "X / Y" 형식 (위반 / 모니터링) — 양쪽 모두 카운트업
      const si = raw.indexOf(' / ');
      if (si !== -1) {
        const lStr = raw.slice(0, si);
        const rStr = raw.slice(si + 3);
        const tL = parseFloat(lStr.replace(/,/g, ''));
        const tR = parseFloat(rStr.replace(/,/g, ''));
        // 음수 데이터거나 파싱 실패 → 애니메이션 없이 원본 표시
        if (isNaN(tL) || isNaN(tR) || tL < 0 || tR < 0) return;
        const tok = Symbol();
        _kpiTok[id] = tok;
        const fmtL = v => Math.round(Math.max(0, v)).toLocaleString();
        const hasDecR = rStr.includes('.');
        const fmtR = v => {
          const n = Math.max(0, v);
          return hasDecR
            ? (Math.round(n * 10) / 10).toLocaleString(undefined, {minimumFractionDigits:1, maximumFractionDigits:1})
            : Math.round(n).toLocaleString();
        };
        const dur = 900, t0 = performance.now();
        const tick = now => {
          if (_kpiTok[id] !== tok) return;
          const p = Math.min((now - t0) / dur, 1);
          const e = 1 - Math.pow(1 - p, 3);
          el.textContent = fmtL(tL * e) + ' / ' + fmtR(tR * e);
          if (p < 1) requestAnimationFrame(tick);
          else el.textContent = fmtL(tL) + ' / ' + fmtR(tR);
        };
        requestAnimationFrame(tick);
        return;
      }
      // 단일 숫자 (정수·소수·%·원 등)
      const m = raw.match(/^([\d,]+(?:\.\d+)?)/);
      if (!m) return;
      const target  = parseFloat(m[1].replace(/,/g, ''));
      if (target < 0) return;  // 음수 데이터 → 원본 유지
      const suffix  = raw.slice(m[0].length);
      const isFloat = m[1].includes('.') || suffix.startsWith('%');
      _kpiAnim(id, el, target, suffix, isFloat);
    }, i * 100);
  });
}

// ── 대시보드 ─────────────────────────────────────────
let _loadSeq = 0;
async function loadData() {
  if (!user) { records = []; return; }   // 비로그인 시 데이터 자체를 비움
  const seq = ++_loadSeq;
  setSy('불러오는 중...', '#15803d', '#f0fdf4');
  // notes 실패가 records 로딩을 막지 않도록 allSettled 사용
  const [recRes, notesRes] = await Promise.allSettled([sbGet('records'), sbGet('notes')]);
  if (seq !== _loadSeq) return;
  // sbGet이 throw(HTTP 에러·파싱 오류) → rejected / non-array → 기존 records 유지, 0/0 방지
  if (recRes.status === 'rejected') {
    const reason = recRes.reason?.message || String(recRes.reason || '');
    setSy(`불러오기 실패 (${reason}) — 이전 데이터 유지`, '#dc2626', '#fef2f2');
    return;
  }
  if (!Array.isArray(recRes.value)) {
    setSy('응답 형식 오류 — 이전 데이터 유지', '#dc2626', '#fef2f2');
    return;
  }
  records = recRes.value;
  if (notesRes.status === 'fulfilled' && Array.isArray(notesRes.value)) {
    notes = notesRes.value.sort((a, b) => b.date.localeCompare(a.date));
  }
  // 레거시 영역명 정규화: 'IP(지식재산)' → 'IP', '고객지원' → '클레임'
  records.forEach(r => {
    if (r.type === 'IP(지식재산)') r.type = 'IP';
    if (r.type === '고객지원')     r.type = '클레임';
  });
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

// 필터 적용된 records — 영역(k) + 분류(curDashCat) + 브랜드(curBrand) 동시 적용
function getFR(k) {
  let d = (k === 'all') ? records : records.filter(r => r.type === k);
  if (k === 'all' && curDashCat && curDashCat !== 'all') {
    const catT = CAT_TYPES[curDashCat] || [];
    d = d.filter(r => catT.includes(r.type));
  }
  if (curBrand && curBrand !== 'all') d = d.filter(r => r.brand === curBrand);
  return d;
}

// 대시보드 브랜드 필터 변경
function setDashBrand(v) {
  curBrand = v || 'all';
  recentPage = 0;
  renderDash(curFilter);
}

// 브랜드 드롭다운 옵션 채우기 (권한 반영: admin=전체, 그 외=접근 브랜드)
function populateDashBrandSel() {
  const sel = document.getElementById('dashBrandSel');
  if (!sel) return;
  const bs = isAdmin() ? BRANDS : userBrands().filter(b => BRANDS.includes(b));
  if (!bs.includes(curBrand)) curBrand = 'all';
  sel.innerHTML = '<option value="all">전체 브랜드</option>' +
    bs.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  sel.value = curBrand;
}

// 영역 셀렉트 / 사이드바 영역 항목을 현재 curFilter·curDashCat에 맞춰 동기화
function syncAreaControls() {
  document.querySelectorAll('.side-areas .fb').forEach(b => {
    const m = b.getAttribute('onclick') || '';
    b.classList.toggle('on', m.includes(`'${curFilter}'`));
  });
  const sel = document.getElementById('dashAreaSel');
  if (!sel) return;
  const allowed = (curDashCat && curDashCat !== 'all') ? (CAT_TYPES[curDashCat] || TYPES) : TYPES;
  sel.innerHTML = '<option value="all">전체 영역</option>' +
    allowed.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  sel.value = curFilter;
  const catSel = document.getElementById('dashCatSel');
  if (catSel && catSel.value !== curDashCat) catSel.value = curDashCat;
}

// ── 기준 월 ──────────────────────────────────────────
// 당월 문자열(YYYY-MM)
function curYm() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; }
// 대시보드 기준 월(YYYY-MM): selYm이 비어있으면 당월
function refYm() { return selYm || curYm(); }
// 기준 월의 Date(1일)
function refDate() { const [y, m] = refYm().split('-').map(Number); return new Date(y, m - 1, 1); }
// 영역 필터 + 기준 월로 스코프된 records
function getFRM(k) { const ym = refYm(); return getFR(k).filter(r => r.date && r.date.startsWith(ym)); }

// 기준 월 변경/리셋 + 상단 컨트롤 UI 동기화
function setDashMonth(v) { selYm = v || ''; recentPage = 0; renderDash(curFilter); }
function resetDashMonth() { selYm = ''; recentPage = 0; renderDash(curFilter); }
function syncDashMonthUI() {
  const ym = refYm();
  const inp = document.getElementById('dashMonth');
  if (inp) inp.value = ym;
  const isCur = ym === curYm();
  const nowBtn = document.getElementById('dashMonthNow');
  if (nowBtn) nowBtn.classList.toggle('on', isCur);
  const note = document.getElementById('dashMonthNote');
  if (note) note.textContent = isCur ? '당월 기준' : '과거/특정 월 조회 중';
  const yb = document.querySelector('.yr-badge');
  if (yb) yb.textContent = `${refDate().getFullYear()}년 기준`;
}

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

// SLA 초과 건 호버/탭 팝업 — 현재 영역 필터(curFilter) 기준
// PC: mouseenter/leave / 모바일: 탭하면 토글되고 바깥 탭 시 닫힘
let __slaPopupEl = null;
function toggleSlaPopup(target, ev) {
  if (ev) ev.stopPropagation();
  if (__slaPopupEl) hideSlaPopup();
  else showSlaPopup(target);
}
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

  // 모바일: 팝업 바깥 탭 시 닫힘 (다음 tick부터 등록해 현재 클릭이 즉시 닫는 것 방지)
  setTimeout(() => {
    document.addEventListener('click', __slaOutsideClick, { once: true });
  }, 0);
}
function __slaOutsideClick(ev) {
  if (__slaPopupEl && !__slaPopupEl.contains(ev.target)) hideSlaPopup();
  else if (__slaPopupEl) document.addEventListener('click', __slaOutsideClick, { once: true });
}
function hideSlaPopup() {
  if (__slaPopupEl) { __slaPopupEl.remove(); __slaPopupEl = null; }
}

// 최근 모니터링 표 — 행 클릭 시 해당 레코드 전체 내용을 팝업으로 표시
let __notePopupEl = null;
let _recentPageRows = [];
function toggleNotePopup(target, ev) {
  if (ev) ev.stopPropagation();
  if (__notePopupEl) { hideNotePopup(); return; }
  showNotePopup(target);
}
function showNotePopup(target) {
  hideNotePopup();
  const r = _recentPageRows[Number(target.dataset.idx)];
  if (!r) return;

  const fields = [
    ['날짜', r.date || '-'],
    ['영역', r.type || '-'],
    ['상세유형', r.subtype || '-'],
    ['브랜드', r.brand || '-'],
    ['상태', statLbl(r.status, r.type)],
    ['건수', r.count != null ? r.count.toLocaleString() : '-'],
    ['작성자', r.author || '-'],
  ];

  __notePopupEl = document.createElement('div');
  __notePopupEl.className = 'note-popup';

  const tbl = document.createElement('table');
  tbl.className = 'note-popup-tbl';
  fields.forEach(([label, val]) => {
    const row = document.createElement('tr');
    const th = document.createElement('th'); th.textContent = label;
    const td = document.createElement('td'); td.textContent = String(val);
    row.appendChild(th); row.appendChild(td);
    tbl.appendChild(row);
  });
  __notePopupEl.appendChild(tbl);

  const noteVal = (r.note || '').trim();
  if (noteVal) {
    const hd = document.createElement('div');
    hd.className = 'note-popup-hd';
    hd.textContent = '비고';
    const txt = document.createElement('div');
    txt.className = 'note-popup-txt';
    txt.textContent = noteVal;
    __notePopupEl.appendChild(hd);
    __notePopupEl.appendChild(txt);
  }

  document.body.appendChild(__notePopupEl);

  const rect = target.getBoundingClientRect();
  const pop  = __notePopupEl.getBoundingClientRect();
  const margin = 6;
  let left = rect.left;
  let top  = rect.bottom + margin;
  if (left + pop.width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - pop.width - 12);
  if (top  + pop.height > window.innerHeight - 12) top = Math.max(12, rect.top - pop.height - margin);
  __notePopupEl.style.left = left + 'px';
  __notePopupEl.style.top  = top  + 'px';

  setTimeout(() => {
    document.addEventListener('click', __noteOutsideClick, { once: true });
  }, 0);
}
function __noteOutsideClick(ev) {
  if (__notePopupEl && !__notePopupEl.contains(ev.target)) hideNotePopup();
  else if (__notePopupEl) document.addEventListener('click', __noteOutsideClick, { once: true });
}
function hideNotePopup() {
  if (__notePopupEl) { __notePopupEl.remove(); __notePopupEl = null; }
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
  // 한 영역당 최대 1개 alert. 두 조건(건수 / %) 모두 충족하면 양쪽 값을 함께 표시.
  const alerts = [];
  const ref = refDate();
  const ym = refYm();
  const prevDate = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;
  const T = getThresholds();
  TYPES.forEach(type => {
    const t = T[type] || THRESHOLDS_DEFAULT[type];
    if (!t) return;
    const currVio = records.filter(r => r.type === type && r.date && r.date.startsWith(ym) && r.status !== '모니터링').reduce((s,r) => s+r.count, 0);
    const prevVio = records.filter(r => r.type === type && r.date && r.date.startsWith(prevYm) && r.status !== '모니터링').reduce((s,r) => s+r.count, 0);
    const delta = currVio - prevVio;
    const hitDelta = delta >= t.delta && t.delta > 0;
    const pct = prevVio > 0 ? ((currVio - prevVio) / prevVio) * 100 : null;
    const hitMom = pct !== null && pct >= t.mom && t.mom > 0;
    if (hitDelta || hitMom) {
      alerts.push({
        type, curr: currVio, prev: prevVio,
        delta: hitDelta ? delta : null,
        pct:   hitMom   ? Math.round(pct) : null
      });
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
    const parts = [];
    if (a.delta !== null) parts.push(`<b>+${a.delta.toLocaleString()}건</b>`);
    if (a.pct !== null)   parts.push(`<b>+${a.pct}%</b>`);
    const metric = parts.join(' / ');
    return `<span class="alert-chip" onclick="setFilter(document.querySelector('.fb[onclick*=&quot;${a.type}&quot;]'),'${a.type}')"><b>${a.type}</b> 전월 대비 ${metric} (${a.prev}→${a.curr})</span>`;
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

// 사이드바 '리스크 영역 현황' — 영역별 누적 건수(count 합계) 배지 갱신
function renderSideAreaCounts() {
  document.querySelectorAll('.area-count').forEach(el => {
    const t = el.getAttribute('data-type');
    const sum = records.reduce((n, r) => n + (r.type === t ? (Number(r.count) || 0) : 0), 0);
    el.textContent = sum.toLocaleString();
  });
}

// ── 대시보드 카드 진입 애니메이션 (IntersectionObserver 기반) ──────
// 차트(라인/도넛/바)는 Chart.js 기본 애니메이션 사용. 스크롤 재진입 시 chart.reset()+update()
// 그 외 카드(grade board, heatmap, recent rows)는 CSS/transition 애니메이션
let _dashObserver = null;
const _prevIntersect = new WeakMap(); // 이전 교차 상태 추적 (prev=false → 이탈 후 재진입)

function isInViewport(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.top < window.innerHeight && r.bottom > 0;
}

function _applyCardAnim(el, anim, delay) {
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = `${anim} 0.75s cubic-bezier(0.22,0.61,0.36,1) ${delay || '0s'} both`;
}

function _resumeTicker() {
  const tb = document.getElementById('recentTbody');
  if (tb) tb.style.animationPlayState = 'running';
}
function _pauseTicker() {
  const tb = document.getElementById('recentTbody');
  if (tb) tb.style.animationPlayState = 'paused';
}

function animateHeatmapBars() {
  const wrap = document.getElementById('heatmapWrap');
  if (!wrap) return;
  wrap.querySelectorAll('.rank-area-fill').forEach((bar, i) => {
    const finalW = bar.style.width;
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    bar.style.transition = `width 0.55s cubic-bezier(0.25,0.46,0.45,0.94) ${(i * 0.018).toFixed(3)}s`;
    bar.style.width = finalW;
  });
}

const _CHART_IDS = ['lineChartCard', 'rightChartCard', 'barChartCard'];

function _triggerCardAnim(el) {
  if (!el) return;
  if (el.id === 'gradeBoard')       { _applyCardAnim(el, 'dash-left-in', '0.05s'); }
  else if (el.id === 'heatmapCard') { animateHeatmapBars(); }
  else if (el.id === 'lineChartCard')  { if (lChart) { lChart.reset();  lChart.update();  } }
  else if (el.id === 'rightChartCard') { if (rChart) { rChart.reset();  rChart.update();  } }
  else if (el.id === 'barChartCard')   { if (bChart) { bChart.reset();  bChart.update();  } }
  else                              { _resumeTicker(); }
}

function _resetCardAnim(el) {
  if (!el) return;
  if (el.id === 'gradeBoard') { el.style.animation = ''; }
  else if (!_CHART_IDS.includes(el.id) && el.id !== 'heatmapCard') {
    _pauseTicker();
  }
  // 차트/히트맵: 별도 리셋 불필요
}

function _setupDashObserver() {
  if (_dashObserver) _dashObserver.disconnect();
  _dashObserver = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      const prev = _prevIntersect.get(target);
      _prevIntersect.set(target, isIntersecting);
      if (!isIntersecting) { _resetCardAnim(target); return; }
      // 차트: 화면 이탈(prev=false) 후 재진입 시만 재애니메이션 (초기 생성 시 Chart.js가 처리)
      // 기타: prev!==true (처음 진입 포함) 시 애니메이션
      const isChart = _CHART_IDS.includes(target.id);
      if (isChart ? (prev === false) : (prev !== true)) _triggerCardAnim(target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
  [
    document.getElementById('gradeBoard'),
    document.getElementById('lineChartCard'),
    document.getElementById('rightChartCard'),
    document.getElementById('barChartCard'),
    document.getElementById('heatmapCard'),
    document.querySelector('#barChartCard ~ .card'),
  ].forEach(el => { if (el) _dashObserver.observe(el); });
}

function renderDash(k) {
  syncDashMonthUI();
  renderSideAreaCounts();
  populateDashBrandSel();
  syncAreaControls();
  const d   = getFR(k);
  const ref = refDate();
  const yr  = ref.getFullYear();
  const mo  = ref.getMonth() + 1;
  const ym  = refYm();                               // 기준 월(YYYY-MM)
  const isVio = r => r.status === '위반(처리중)' || r.status === '완료';

  // 기준 월 스코프(당월 KPI·차트·목록·히트맵·알림이 사용)
  const dm = d.filter(r => r.date && r.date.startsWith(ym));
  // KPI2 전용 (당월/직접선택/기간)
  const dmKpi  = getChartData(d, _modeKpi, _fromKpi, _toKpi, ym) || dm;
  const kpiYm  = _modeKpi === 'mon' ? ym : _modeKpi === 'period' ? (_toKpi || _fromKpi || ym) : (_modeKpi || ym);
  const [kpiYr, kpiMo] = kpiYm.split('-').map(Number);
  // 차트별 데이터 (null → acc 모드에서 d 전체 사용)
  const dmRight = getChartData(d, _modeRight, _fromRight, _toRight, ym);
  const dmBar   = getChartData(d, _modeBar,   _fromBar,   _toBar,   ym);
  // 드롭다운 월 목록 동기화
  syncChartDropdowns();
  // 연 누적: 기준 연도 1월~기준 월
  const dY = d.filter(r => {
    if (!r.date) return false;
    const [ry, rm] = r.date.split('-').map(Number);
    return ry === yr && rm <= mo;
  });

  // 누적(연 누적) — dY / 당월·처리·현재 — dm
  // 징계·부실채권은 모니터링 개념이 없어, 클레임은 별도 영역 KPI로만 노출하기 위해 완전 전체 뷰 집계에서 제외 (전체 필터 시 분자·분모 모두 제외)
  const NO_MON = ['감사', '부실채권', '클레임'];
  const excNoMon = r => !NO_MON.includes(r.type);
  // 분류 전체 뷰에서 해당 분류의 모든 영역이 NO_MON이면 excNoMon 필터를 건너뜀 (부정/부실 제거 분류)
  const catAllNoMon = k === 'all' && curDashCat !== 'all' &&
    (CAT_TYPES[curDashCat] || []).every(t => NO_MON.includes(t));
  const dYb    = (NO_MON.includes(k) || catAllNoMon) ? dY : dY.filter(excNoMon);
  const dmKpiB = (NO_MON.includes(k) || catAllNoMon) ? dmKpi : dmKpi.filter(excNoMon);
  const tot    = dYb.reduce((s, r) => s + monCnt(r), 0);
  const vio    = dYb.filter(isVio).reduce((s, r) => s + r.count, 0);
  const mTot   = dmKpiB.reduce((s, r) => s + monCnt(r), 0);
  const mVio   = dmKpiB.filter(isVio).reduce((s, r) => s + r.count, 0);
  const done = dYb.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);   // 기준월까지 누적 완료
  const act  = dYb.filter(r => r.status === '위반(처리중)').reduce((s, r) => s + r.count, 0);  // 누적 전체 기준
  const slaOver = dYb.filter(isSlaOver).reduce((s, r) => s + r.count, 0);
  const dr  = vio ? (done / vio * 100).toFixed(1) : 0;   // 누적 완료율 = 누적 완료 / 누적 위반
  const vr  = tot  ? (vio  / tot  * 100).toFixed(1) : 0;
  const mvr = mTot ? (mVio / mTot * 100).toFixed(1) : 0;

  // 영역별 KPI 라벨: 클레임(접수/처리중/처리완료), 징계(적발/조치완료), 부실채권(발생/해결)
  // catAllNoMon: 부정/부실 제거 분류 전체 뷰 (징계+부실채권 합산)
  const isClm      = k === '클레임';
  const isAn       = k === '안전';
  const isJng      = k === '감사';
  const isBc       = k === '부실채권';
  const isCatNoMon = catAllNoMon;
  const isStoreOps = k === 'all' && curDashCat === '매장 운영 관리';
  const isNoMon    = isJng || isBc || isCatNoMon;
  const lblMon  = isClm ? '접수'   : isAn ? '발생'     : isNoMon ? '전체'       : '모니터링';
  const lblVio  = isClm ? '처리'   : isAn ? '조치완료' : isJng   ? '적발'       : isBc ? '발생' : isCatNoMon ? '처리(완료)' : '위반';
  const lblIng  = isClm ? '처리중' : isAn ? '발생'     : isJng   ? '적발'       : isBc ? '발생' : isCatNoMon ? '조치중'     : '위반(처리중)';
  const lblRate = isClm ? '처리율' : isAn ? '조치율'   : isJng   ? '조치완료율' : isBc ? '해결율' : isCatNoMon ? '완료율'   : '위반율';

  // KPI 카드 라벨/서브 동적 갱신
  // kpi3Str/kpi3: 부실채권은 아래 isBc 블록에서 '회수금액'으로 덮어씀
  document.getElementById('kpi3Str').textContent = isClm ? '처리완료율' : isJng ? '조치완료율' : isBc ? '회수금액' : '완료율';
  document.getElementById('kpi3').textContent    = isBc ? '-' : dr + '%';
  // 안전/클레임 뷰: KPI3 숨김 + 나머지 3칸 균등 너비
  const _kpi3Card = document.getElementById('kpi3Str') && document.getElementById('kpi3Str').closest('.kpi');
  if (_kpi3Card) _kpi3Card.style.display = (isAn || isClm) ? 'none' : '';
  const _kpiGrid = _kpi3Card && _kpi3Card.closest('.kpi-grid');
  if (_kpiGrid) _kpiGrid.style.gridTemplateColumns = (isAn || isClm) ? 'repeat(3,1fr)' : '';

  const k3s    = document.getElementById('kpi3s');
  const doneLbl = isClm ? '처리완료' : isJng ? '조치완료' : isBc ? '해결' : '완료';
  const k4Lbl  = document.getElementById('kpi4Lbl');
  const k4s    = document.getElementById('kpi4s');

  if (isJng) {
    // 징계 뷰
    document.getElementById('kpi1Str').textContent = '연 누적 징계 건수';
    document.getElementById('kpi1').textContent    = tot.toLocaleString();
    document.getElementById('kpi1r').textContent   = done ? `조치완료 ${done.toLocaleString()}건` : '-';
    document.getElementById('kpi1s').textContent   = `${yr}년 ${mo}월까지 누적`;

    const mDone = dmKpiB.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
    document.getElementById('kpi2Str').textContent = '당월 조치완료 건수';
    document.getElementById('kpi2').textContent    = mDone.toLocaleString();
    document.getElementById('kpi2r').textContent   = mTot ? `적발 ${mTot.toLocaleString()}건` : '-';
    document.getElementById('kpi2s').textContent   = `${kpiYr}년 ${kpiMo}월 기준`;

    k3s.textContent = `조치완료 ${done.toLocaleString()} / 적발 ${vio.toLocaleString()}건 · ${yr}년 ${mo}월까지 누적`;

    if (k4Lbl) k4Lbl.textContent = '현재';
    document.getElementById('kpi4Str').textContent = '현재 적발 현황';
    document.getElementById('kpi4').textContent    = act.toLocaleString();
    if (slaOver > 0) {
      k4s.innerHTML = `적발 상태 · <span class="sla-alert" onmouseenter="showSlaPopup(this)" onmouseleave="hideSlaPopup()" onclick="toggleSlaPopup(this, event)">${SLA_DAYS}일 초과 ${slaOver.toLocaleString()}건</span>`;
    } else {
      k4s.textContent = '적발 상태 건수';
    }
  } else if (isBc) {
    // 부실채권 뷰 — KPI3: 회수금액
    const bcRecovery = dY.filter(r =>
      r.type === '부실채권' && r.status === '완료' && BC_AMT_SUBS.includes(r.subtype)
    ).reduce((s, r) => {
      if (r.bc_amount != null) return s + (Number(r.bc_amount) || 0);
      const old = parseBcAmt(r); return s + (old || 0);
    }, 0);

    document.getElementById('kpi1Str').textContent = '연 누적 부실채권 발생 건수';
    document.getElementById('kpi1').textContent    = tot.toLocaleString();
    document.getElementById('kpi1r').textContent   = done ? `해결 ${done.toLocaleString()}건` : '-';
    document.getElementById('kpi1s').textContent   = `${yr}년 ${mo}월까지 누적`;

    document.getElementById('kpi2Str').textContent = '당월 부실채권 발생 건수';
    document.getElementById('kpi2').textContent    = mTot.toLocaleString();
    document.getElementById('kpi2r').textContent   = act ? `발생 ${act.toLocaleString()}건` : '-';
    document.getElementById('kpi2s').textContent   = `${kpiYr}년 ${kpiMo}월 기준`;

    document.getElementById('kpi3Str').textContent = '회수금액';
    document.getElementById('kpi3').textContent    = bcRecovery.toLocaleString() + '원';
    k3s.textContent = `미입금·2개월초과 중 해결 건 금액 합산 · ${yr}년 ${mo}월까지 누적`;

    if (k4Lbl) k4Lbl.textContent = '현재';
    document.getElementById('kpi4Str').textContent = '현재 발생 현황';
    document.getElementById('kpi4').textContent    = act.toLocaleString();
    if (slaOver > 0) {
      k4s.innerHTML = `발생 상태 · <span class="sla-alert" onmouseenter="showSlaPopup(this)" onmouseleave="hideSlaPopup()" onclick="toggleSlaPopup(this, event)">${SLA_DAYS}일 초과 ${slaOver.toLocaleString()}건</span>`;
    } else {
      k4s.textContent = '발생 상태 건수';
    }
  } else if (isCatNoMon) {
    // 부정/부실 제거 분류 전체 뷰 — 징계+부실채권 합산
    // KPI1: 연 누적 건수 (합산)
    document.getElementById('kpi1Str').textContent = '연 누적 건수';
    document.getElementById('kpi1').textContent    = tot.toLocaleString();
    document.getElementById('kpi1r').textContent   = done ? `완료 ${done.toLocaleString()}건` : '-';
    document.getElementById('kpi1s').textContent   = `${yr}년 ${mo}월까지 누적`;

    // KPI2: 당월 발생 건수 (합산)
    document.getElementById('kpi2Str').textContent = '당월 발생 건수';
    document.getElementById('kpi2').textContent    = mTot.toLocaleString();
    document.getElementById('kpi2r').textContent   = act ? `조치중 ${act.toLocaleString()}건` : '-';
    document.getElementById('kpi2s').textContent   = `${kpiYr}년 ${kpiMo}월 기준`;

    // KPI3: 부실채권 누적 회수 금액
    const bcRecovery = dY.filter(r =>
      r.type === '부실채권' && r.status === '완료' && BC_AMT_SUBS.includes(r.subtype)
    ).reduce((s, r) => {
      if (r.bc_amount != null) return s + (Number(r.bc_amount) || 0);
      const old = parseBcAmt(r); return s + (old || 0);
    }, 0);
    document.getElementById('kpi3Str').textContent = '누적 회수 금액';
    document.getElementById('kpi3').textContent    = bcRecovery.toLocaleString() + '원';
    k3s.textContent = `미입금·2개월초과 해결 건 합산 · ${yr}년 ${mo}월까지 누적`;

    // KPI4: 징계 조치완료율
    const jngVio  = dY.filter(r => r.type === '감사' && isVio(r)).reduce((s,r) => s+r.count, 0);
    const jngDone = dY.filter(r => r.type === '감사' && r.status === '완료').reduce((s,r) => s+r.count, 0);
    const jngRate = jngVio ? (jngDone / jngVio * 100).toFixed(1) : 0;
    if (k4Lbl) k4Lbl.textContent = '징계';
    document.getElementById('kpi4Str').textContent = '징계 조치완료율';
    document.getElementById('kpi4').textContent    = jngRate + '%';
    k4s.textContent = `조치완료 ${jngDone.toLocaleString()} / 적발 ${jngVio.toLocaleString()}건 · ${yr}년 ${mo}월까지 누적`;
  } else if (isStoreOps) {
    // 매장 운영 관리 분류 전체 뷰 — 안전+클레임 합산 (위생은 체계 개편 예정으로 집계 제외)
    const stOps   = r => r.type === '안전' || r.type === '클레임';
    const dYSt    = dY.filter(stOps);
    const dmSt    = dmKpi.filter(stOps);
    const doneSt  = dYSt.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
    const totSt   = dYSt.reduce((s, r) => s + r.count, 0);
    const actSt   = dYSt.filter(r => r.status === '위반(처리중)').reduce((s, r) => s + r.count, 0);
    const mDoneSt = dmSt.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
    const mTotSt  = dmSt.reduce((s, r) => s + r.count, 0);
    const stRate  = totSt  ? (doneSt  / totSt  * 100).toFixed(1) : 0;
    const stMRate = mTotSt ? (mDoneSt / mTotSt * 100).toFixed(1) : 0;
    const slaOverSt = dYSt.filter(isSlaOver).reduce((s, r) => s + r.count, 0);

    document.getElementById('kpi1Str').textContent = '해결 / 발생';
    document.getElementById('kpi1').textContent    = `${doneSt.toLocaleString()} / ${totSt.toLocaleString()}`;
    document.getElementById('kpi1r').textContent   = totSt ? `해결율 ${stRate}%` : '-';
    document.getElementById('kpi1s').textContent   = `${yr}년 ${mo}월까지 누적`;

    document.getElementById('kpi2Str').textContent = '해결 / 발생';
    document.getElementById('kpi2').textContent    = `${mDoneSt.toLocaleString()} / ${mTotSt.toLocaleString()}`;
    document.getElementById('kpi2r').textContent   = mTotSt ? `해결율 ${stMRate}%` : '-';
    document.getElementById('kpi2s').textContent   = `${kpiYr}년 ${kpiMo}월 기준`;

    document.getElementById('kpi3Str').textContent = '해결율';
    document.getElementById('kpi3').textContent    = stRate + '%';
    k3s.textContent = `해결 ${doneSt.toLocaleString()} / 발생 ${totSt.toLocaleString()}건 · ${yr}년 ${mo}월까지 누적`;

    if (k4Lbl) k4Lbl.textContent = '현재';
    document.getElementById('kpi4Str').textContent = '조치중 건수';
    document.getElementById('kpi4').textContent    = actSt.toLocaleString();
    if (slaOverSt > 0) {
      k4s.innerHTML = `조치중 상태 · <span class="sla-alert" onmouseenter="showSlaPopup(this)" onmouseleave="hideSlaPopup()" onclick="toggleSlaPopup(this, event)">${SLA_DAYS}일 초과 ${slaOverSt.toLocaleString()}건</span>`;
    } else {
      k4s.textContent = '조치중 상태 건수';
    }
  } else if (isClm) {
    // 클레임 뷰 — 처리완료/접수·처리중 기준 (안전과 동일 구조)
    const mDone   = dmKpiB.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
    const clRate  = tot  ? (done  / tot  * 100).toFixed(1) : 0;
    const clMRate = mTot ? (mDone / mTot * 100).toFixed(1) : 0;

    document.getElementById('kpi1Str').textContent = '처리완료 / 접수·처리중';
    document.getElementById('kpi1').textContent    = `${done.toLocaleString()} / ${tot.toLocaleString()}`;
    document.getElementById('kpi1r').textContent   = tot ? `처리율 ${clRate}%` : '-';
    document.getElementById('kpi1s').textContent   = `${yr}년 ${mo}월까지 누적`;

    document.getElementById('kpi2Str').textContent = '처리완료 / 접수·처리중';
    document.getElementById('kpi2').textContent    = `${mDone.toLocaleString()} / ${mTot.toLocaleString()}`;
    document.getElementById('kpi2r').textContent   = mTot ? `처리율 ${clMRate}%` : '-';
    document.getElementById('kpi2s').textContent   = `${kpiYr}년 ${kpiMo}월 기준`;

    if (k4Lbl) k4Lbl.textContent = '현재';
    document.getElementById('kpi4Str').textContent = '처리중 건수';
    document.getElementById('kpi4').textContent    = act.toLocaleString();
    if (slaOver > 0) {
      k4s.innerHTML = `접수/처리중 상태 · <span class="sla-alert" onmouseenter="showSlaPopup(this)" onmouseleave="hideSlaPopup()" onclick="toggleSlaPopup(this, event)">${SLA_DAYS}일 초과 ${slaOver.toLocaleString()}건</span>`;
    } else {
      k4s.textContent = '접수/처리중 상태 건수';
    }
  } else if (isAn) {
    // 안전 뷰 — 조치완료/발생 기준
    // 발생 = 전체 입력값(완료+발생+모니터링), 조치완료 = 완료 상태, 조치율 = 완료/전체
    const mDone   = dmKpiB.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
    const anRate  = tot  ? (done  / tot  * 100).toFixed(1) : 0;
    const anMRate = mTot ? (mDone / mTot * 100).toFixed(1) : 0;

    document.getElementById('kpi1Str').textContent = '조치완료 / 발생';
    document.getElementById('kpi1').textContent    = `${done.toLocaleString()} / ${tot.toLocaleString()}`;
    document.getElementById('kpi1r').textContent   = tot ? `조치율 ${anRate}%` : '-';
    document.getElementById('kpi1s').textContent   = `${yr}년 ${mo}월까지 누적`;

    document.getElementById('kpi2Str').textContent = '조치완료 / 발생';
    document.getElementById('kpi2').textContent    = `${mDone.toLocaleString()} / ${mTot.toLocaleString()}`;
    document.getElementById('kpi2r').textContent   = mTot ? `조치율 ${anMRate}%` : '-';
    document.getElementById('kpi2s').textContent   = `${kpiYr}년 ${kpiMo}월 기준`;

    if (k4Lbl) k4Lbl.textContent = '현재';
    document.getElementById('kpi4Str').textContent = '발생 건수';
    document.getElementById('kpi4').textContent    = act.toLocaleString();
    if (slaOver > 0) {
      k4s.innerHTML = `발생 상태 · <span class="sla-alert" onmouseenter="showSlaPopup(this)" onmouseleave="hideSlaPopup()" onclick="toggleSlaPopup(this, event)">${SLA_DAYS}일 초과 ${slaOver.toLocaleString()}건</span>`;
    } else {
      k4s.textContent = '발생 상태 건수';
    }
  } else {
    // 일반 뷰
    document.getElementById('kpi1Str').textContent = `${lblVio} / ${lblMon}`;
    document.getElementById('kpi1').textContent    = `${vio.toLocaleString()} / ${fmtMon(tot)}`;
    document.getElementById('kpi1r').textContent   = tot ? `${lblRate} ${vr}%` : '-';
    document.getElementById('kpi1s').textContent   = `${yr}년 ${mo}월까지 누적`;

    document.getElementById('kpi2Str').textContent = `${lblVio} / ${lblMon}`;
    document.getElementById('kpi2').textContent    = `${mVio.toLocaleString()} / ${fmtMon(mTot)}`;
    document.getElementById('kpi2r').textContent   = mTot ? `${lblRate} ${mvr}%` : '-';
    document.getElementById('kpi2s').textContent   = `${kpiYr}년 ${kpiMo}월 기준`;

    if (k === 'all') {
      let sub3 = `${doneLbl} ${done.toLocaleString()} / ${lblVio} ${vio.toLocaleString()}건 · ${yr}년 ${mo}월까지 누적<br>조치중 ${act.toLocaleString()}건`;
      if (slaOver > 0) sub3 += ` · <span class="sla-alert" onmouseenter="showSlaPopup(this)" onmouseleave="hideSlaPopup()" onclick="toggleSlaPopup(this, event)">${SLA_DAYS}일 초과 ${slaOver.toLocaleString()}건</span>`;
      k3s.innerHTML = sub3;
    } else {
      k3s.textContent = `${doneLbl} ${done.toLocaleString()} / ${lblVio} ${vio.toLocaleString()}건 · ${yr}년 ${mo}월까지 누적`;
    }

    // KPI4: 조치중 건수 (누적 기준)
    if (k4Lbl) k4Lbl.textContent = '현재';
    document.getElementById('kpi4Str').textContent = isClm ? '처리중 건수' : '조치중 건수';
    document.getElementById('kpi4').textContent    = act.toLocaleString();
    if (slaOver > 0) {
      k4s.innerHTML = `${lblIng} 상태 · <span class="sla-alert" onmouseenter="showSlaPopup(this)" onmouseleave="hideSlaPopup()" onclick="toggleSlaPopup(this, event)">${SLA_DAYS}일 초과 ${slaOver.toLocaleString()}건</span>`;
    } else {
      k4s.textContent = `${lblIng} 상태 건수`;
    }
  }

  // 차트 카드 제목 및 범례 갱신
  const lineTit = document.getElementById('lineCardTit');
  if (lineTit) lineTit.textContent = `월별 ${lblMon} / ${lblVio} 건수 추이`;
  const lLegMon = document.getElementById('lineLegMon');
  const lLegVio = document.getElementById('lineLegVio');
  if (lLegMon) lLegMon.textContent = lblMon;
  if (lLegVio) lLegVio.textContent = lblVio;
  const bLegMon = document.getElementById('barLegMon');
  const bLegVio = document.getElementById('barLegVio');
  if (bLegMon) bLegMon.textContent = `총 ${lblMon} 건수`;
  if (bLegVio) bLegVio.textContent = lblVio;

  // 최근 모니터링 카드 제목/상태 버튼 라벨
  const recTit = document.getElementById('recentCardTit');
  if (recTit) recTit.textContent = isClm ? '최근 접수 현황' : isAn ? '최근 안전 현황' : isJng ? '최근 징계 현황' : isBc ? '최근 부실채권 현황' : isCatNoMon ? '최근 현황' : '최근 모니터링 현황';
  const rb = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  rb('rsBtnMon',  isClm ? '모니터링'    : isAn ? '모니터링'   : isNoMon ? '전체'    : '모니터링');
  rb('rsBtnIng',  isClm ? '접수/처리중' : isAn ? '발생'       : isJng   ? '적발'    : isBc ? '발생' : isCatNoMon ? '조치중' : '위반(처리중)');
  rb('rsBtnDone', isClm ? '처리완료'   : isAn ? '조치완료'   : isJng   ? '조치완료': isBc ? '해결' : isCatNoMon ? '완료'  : '완료');

  renderLine(d, ref);
  renderRight(dmRight || d, k, ref);
  // 막대그래프(브랜드별 현황)는 admin만 — 브랜드장은 본인 1~몇 개만 보이면 차트 의미가 옅어 카드 자체를 숨김.
  // 브랜드장에게는 도넛/라인 차트의 환산 안내 푸터로 안내가 충분히 전달됨.
  const barCard = document.getElementById('barChartCard');
  if (isAdmin()) {
    if (barCard) barCard.style.display = '';
    renderBar(dmBar || d);
  } else {
    if (barCard) barCard.style.display = 'none';
  }
  _recentData = d.slice(0, 100);
  renderRecent(_recentData);
  const hmYm = _modeHeat === 'acc' ? null :
               _modeHeat === 'period' ? (_toHeat || _fromHeat || ym) :
               _modeHeat === 'mon' ? ym : _modeHeat;
  renderHeatmap(hmYm);
  renderAlerts();

  // 영업비밀 10:1 환산 안내: 도넛·브랜드별 현황은 전체·영업비밀에서, 추이 그래프는 영업비밀 탭에서만 노출
  const showNote = (k === 'all' || k === '영업비밀') ? '' : 'none';
  const rNote = document.getElementById('rChartNote');
  const bNote = document.getElementById('barChartNote');
  const lNote = document.getElementById('lineChartNote');
  if (rNote) rNote.style.display = showNote;
  if (bNote) bNote.style.display = showNote;
  if (lNote) lNote.style.display = (k === '영업비밀') ? '' : 'none';

  // KPI 카운트업: 렌더 직후 실제 값을 캐시에 캡처(capture=true) + 5초 주기 반복(캐시값만 사용, DOM 재읽기 없음)
  clearInterval(_kpiRepeat);
  runKpiCountUp(true);
  _kpiRepeat = setInterval(() => runKpiCountUp(false), 5000);

  const gbRow = document.getElementById('gbRow');
  const board = document.getElementById('gradeBoard');
  const actionBoard = document.getElementById('actionBoard');
  if (gbRow && board && actionBoard) {
    // 브랜드 단독 선택 (분류·영역 필터 없음): 본인 브랜드 측정판 표시
    const brandOnlyView = curBrand !== 'all' && k === 'all' && (!curDashCat || curDashCat === 'all');
    let isSide = false;
    if (curBrand !== 'all' && !brandOnlyView) {
      // 브랜드 + 분류/영역 동시 선택: 기존대로 측정판·조치사항 숨김
      gbRow.style.display = 'none';
    } else {
      let visibleAreas;
      if (k !== 'all') {
        visibleAreas = GRADE_AREAS.includes(k) ? [k] : [];
      } else if (curDashCat && curDashCat !== 'all') {
        visibleAreas = (CAT_TYPES[curDashCat] || []).filter(t => GRADE_AREAS.includes(t));
      } else {
        visibleAreas = GRADE_AREAS;
      }
      const showOverall = k === 'all';
      if (!visibleAreas.length) {
        gbRow.style.display = 'none';
      } else {
        gbRow.style.display = '';
        // 분류뷰(영역 수 적음) 또는 영역별 뷰: 기존처럼 측정판 안에 조치사항을 병합한 한 장의 카드로 표시
        isSide = !brandOnlyView && (
          (k === 'all' && (curDashCat === '부정/부실 제거' || curDashCat === '매장 운영 관리')) ||
          k !== 'all'
        );
        renderLeaderboard(visibleAreas, showOverall, brandOnlyView);
      }
    }
    // 측정판·조치사항 병합 여부: 분류/영역 필터 뷰는 기존 그대로 하나의 카드(측정판 안에 조치사항 병합),
    // 완전 전체 뷰·브랜드 단독 뷰만 독립된 두 개의 카드로 분리
    if (isSide) {
      if (actionBoard.parentNode !== board) board.appendChild(actionBoard);
    } else {
      if (actionBoard.parentNode !== gbRow) gbRow.appendChild(actionBoard);
    }
    board.classList.toggle('layout-side', isSide);
    // 1.5:3.5 비율: 부정/부실제거 분류뷰 또는 영역별 뷰
    board.classList.toggle('layout-side-fraud', isSide && (
      (curDashCat === '부정/부실 제거' && k === 'all') || k !== 'all'
    ));
    // 징계현황: 전체뷰·부정/부실 제거 분류뷰·감사 영역뷰에서만 노출
    const jngPanel = document.getElementById('jngPanel');
    if (jngPanel) {
      const showJng = (k === 'all' && (curDashCat === 'all' || curDashCat === '부정/부실 제거')) || k === '감사';
      jngPanel.style.display = showJng ? '' : 'none';
    }
    // 감사 KPI 카드(조치완료/적발·경징계·중징계·형사고발): 완전 전체 뷰에서만 노출
    const auditKpiGrid = document.getElementById('auditKpiGrid');
    if (auditKpiGrid) {
      const showAuditKpi = k === 'all' && curDashCat === 'all';
      auditKpiGrid.style.display = showAuditKpi ? '' : 'none';
      if (showAuditKpi) renderAuditKpis(dY);
    }
    // 메인 KPI 카드(kpi1~4): 완전 전체 뷰에서만 측정판·조치사항 행 위로 이동, 그 외 뷰는 원래 위치(그 아래) 유지
    const mainKpiGrid = document.getElementById('mainKpiGrid');
    if (mainKpiGrid) {
      const isMainView = k === 'all' && curDashCat === 'all';
      if (isMainView && gbRow.previousElementSibling !== mainKpiGrid) {
        gbRow.parentNode.insertBefore(mainKpiGrid, gbRow);
      } else if (!isMainView && gbRow.nextElementSibling !== mainKpiGrid) {
        gbRow.parentNode.insertBefore(mainKpiGrid, gbRow.nextSibling);
      }
    }
  }
  renderNotesSection(k);

  // 비-차트 카드의 _prevIntersect 상태 초기화 → Observer 재연결 시 애니메이션 재실행
  [document.getElementById('gradeBoard'),
   document.getElementById('heatmapCard'),
   document.querySelector('#barChartCard ~ .card')
  ].forEach(el => { if (el) _prevIntersect.delete(el); });
  _setupDashObserver();
}

let _notesDashPage = 0;
function setNotesDashPage(dir) {
  _notesDashPage += dir;
  renderNotesSection(curFilter);
}

function renderNotesSection(k) {
  const panel = document.getElementById('notesPanel');
  if (!panel) return;
  let filtered;
  if (k === 'all') {
    filtered = (curDashCat && curDashCat !== 'all')
      ? notes.filter(n => (CAT_TYPES[curDashCat] || []).includes(n.type))
      : [...notes];
  } else {
    filtered = notes.filter(n => n.type === k);
  }
  // 브랜드별뷰: 해당 브랜드 또는 전체(brand=null/undefined) 특이사항만
  if (curBrand !== 'all') {
    filtered = filtered.filter(n => !n.brand || n.brand === curBrand);
  }
  // 조치사항 모드 날짜 필터
  if (_modeAction === 'mon') {
    const curYmStr = `${refDate().getFullYear()}-${String(refDate().getMonth()+1).padStart(2,'0')}`;
    filtered = filtered.filter(n => n.date && n.date.startsWith(curYmStr));
  } else if (_modeAction === 'period') {
    filtered = filtered.filter(n => {
      if (!n.date) return true;
      const nm = n.date.slice(0,7);
      return (!_fromAction || nm >= _fromAction) && (!_toAction || nm <= _toAction);
    });
  } else if (_modeAction !== 'acc' && /^\d{4}-\d{2}$/.test(_modeAction)) {
    filtered = filtered.filter(n => n.date && n.date.startsWith(_modeAction));
  }
  panel.style.display = '';
  const list  = document.getElementById('notesDashList');
  const pager = document.getElementById('notesDashPager');
  if (!list) return;
  if (!filtered.length) {
    list.innerHTML = '<span class="nd-empty">해당 기간 특이사항 없음</span>';
    if (pager) pager.style.display = 'none';
    return;
  }

  const MAX_RECS = 50, PAGE_SIZE = 10, MAX_PAGE = 5, SHOW = 5;
  const showArea = (k === 'all');
  const allNotes = filtered.slice(0, MAX_RECS);
  const totalPages = Math.min(MAX_PAGE, Math.max(1, Math.ceil(allNotes.length / PAGE_SIZE)));
  if (_notesDashPage >= totalPages) _notesDashPage = totalPages - 1;
  if (_notesDashPage < 0)           _notesDashPage = 0;
  const pageNotes = allNotes.slice(_notesDashPage * PAGE_SIZE, (_notesDashPage + 1) * PAGE_SIZE);

  const makeNdRow = n => {
    const p = parseNoteContent(n.content);
    return `<tr>
      ${showArea ? `<td class="nd-td nd-td-area"><span class="nd-type">${esc(n.type)}</span></td>` : ''}
      <td class="nd-td nd-td-date">${esc(n.date.slice(5).replace('-','/'))}</td>
      <td class="nd-td nd-td-brand">${esc(n.brand||'-')}</td>
      <td class="nd-td"><div class="nd-cell-scroll">${esc(p.m||'-')}</div></td>
      <td class="nd-td"><div class="nd-cell-scroll">${esc(p.d||'-')}</div></td>
      <td class="nd-td"><div class="nd-cell-scroll">${esc(p.a||'-')}</div></td>
    </tr>`;
  };
  const singleHtml = pageNotes.map(makeNdRow).join('');
  const ndcg = `<colgroup>${showArea ? '<col style="width:64px">' : ''}<col style="width:50px"><col style="width:64px"><col style="width:16%"><col style="width:47%"><col style="width:30%"></colgroup>`;
  const ndHead = `<thead><tr>
    ${showArea ? '<th class="nd-th nd-th-area">영역</th>' : ''}
    <th class="nd-th nd-th-date">날짜</th>
    <th class="nd-th">브랜드</th>
    <th class="nd-th">주요이슈</th>
    <th class="nd-th">이슈상세</th>
    <th class="nd-th">조치완료</th>
  </tr></thead>`;

  list.innerHTML = `
    <div class="nd-tbl-wrap"><table class="nd-tbl nd-tbl-hdr">${ndcg}${ndHead}</table></div>
    <div class="nd-port" id="ndPort">
      <table class="nd-tbl nd-tbl-bdy">${ndcg}<tbody id="ndBtbl">${singleHtml}</tbody></table>
    </div>`;

  setTimeout(() => {
    const port = document.getElementById('ndPort');
    const tb   = document.getElementById('ndBtbl');
    if (!port || !tb) return;
    const rows = tb.querySelectorAll('tr');
    if (!rows.length) return;
    const rowH = (tb.offsetHeight / rows.length) || 36;
    port.style.height = `${rowH * Math.min(SHOW, pageNotes.length)}px`;
    if (pageNotes.length > SHOW) {
      tb.innerHTML = singleHtml + singleHtml;
      tb.style.animation = `ticker-up ${pageNotes.length * 2.5}s linear infinite`;
    }
    // 드래그 스크롤 (좌우)
    port.querySelectorAll('.nd-cell-scroll').forEach(el => {
      let active = false, startX = 0, scrollLeft = 0;
      el.addEventListener('mousedown', e => { active = true; startX = e.clientX; scrollLeft = el.scrollLeft; e.preventDefault(); });
      el.addEventListener('mousemove', e => { if (!active) return; el.scrollLeft = scrollLeft - (e.clientX - startX); });
      const stop = () => { active = false; };
      el.addEventListener('mouseup', stop);
      el.addEventListener('mouseleave', stop);
    });
  }, 50);

  if (pager) {
    pager.style.display = totalPages > 1 ? '' : 'none';
    const pi = document.getElementById('notesDashPageInfo');
    if (pi) pi.textContent = `${_notesDashPage + 1} / ${totalPages}`;
    const btns = pager.querySelectorAll('button');
    if (btns[0]) btns[0].disabled = _notesDashPage === 0;
    if (btns[1]) btns[1].disabled = _notesDashPage >= totalPages - 1;
  }
}

// ── 차트 누적/당월 모드 ─────────────────────────────
let _modeRight = 'acc', _modeBar = 'acc', _modeHeat = 'acc', _modeGrade = 'acc';
let _fromRight = '', _toRight = '', _fromBar = '', _toBar = '', _fromHeat = '', _toHeat = '', _fromGrade = '', _toGrade = '';
let _modeKpi = 'mon', _fromKpi = '', _toKpi = '';
let _modeAction = 'acc', _fromAction = '', _toAction = '';
let _recentData = [];

// 데이터에서 사용 가능한 월 목록 반환 (최신순)
function getAvailableMonths() {
  const s = new Set();
  (records || []).forEach(r => { if (r.date && r.date.length >= 7) s.add(r.date.slice(0,7)); });
  return [...s].sort().reverse();
}

// 차트/조치 드롭다운 월 목록 동기화
function syncChartDropdowns() {
  const months = getAvailableMonths();
  const monthOpts = months.map(m => {
    const [y, mo2] = m.split('-').map(Number);
    return `<option value="${m}">${y}년 ${mo2}월</option>`;
  }).join('');
  const blankOpt = `<option value="">전체</option>`;
  const periodOpt = `<option value="period">기간 설정</option>`;

  [['modeRight',_modeRight],['modeBar',_modeBar],['modeHeat',_modeHeat],['modeGrade',_modeGrade]].forEach(([id, cur]) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = `<option value="acc">누적</option><option value="mon">당월</option>${monthOpts}${periodOpt}`;
    sel.value = cur;
  });
  const kpiSel = document.getElementById('modeKpi');
  if (kpiSel) { kpiSel.innerHTML = `<option value="mon">당월</option>${monthOpts}${periodOpt}`; kpiSel.value = _modeKpi; }
  const actSel = document.getElementById('actionModeSel');
  if (actSel) { actSel.innerHTML = `<option value="acc">누적</option><option value="mon">당월</option>${monthOpts}${periodOpt}`; actSel.value = _modeAction; }

  [['fromRight',_fromRight],['toRight',_toRight],['fromBar',_fromBar],['toBar',_toBar],
   ['fromHeat',_fromHeat],['toHeat',_toHeat],['fromGrade',_fromGrade],['toGrade',_toGrade],
   ['fromKpi',_fromKpi],['toKpi',_toKpi],['fromAction',_fromAction],['toAction',_toAction]
  ].forEach(([id, val]) => {
    const sel = document.getElementById(id);
    if (sel) { sel.innerHTML = blankOpt + monthOpts; sel.value = val; }
  });
}

// 차트 데이터 필터링 (null = acc 모드, d 전체 사용)
function getChartData(d, mode, from, to, defaultYm) {
  if (mode === 'acc') return null;
  if (mode === 'period') {
    return d.filter(r => {
      if (!r.date) return true;
      const ym2 = r.date.slice(0,7);
      return (!from || ym2 >= from) && (!to || ym2 <= to);
    });
  }
  const useYm = mode === 'mon' ? defaultYm : mode;
  return d.filter(r => r.date && r.date.startsWith(useYm));
}

function setChartMode(id, val) {
  if (id === 'right') { _modeRight = val; if (val !== 'period') { _fromRight = ''; _toRight = ''; } }
  if (id === 'bar')   { _modeBar   = val; if (val !== 'period') { _fromBar   = ''; _toBar   = ''; } }
  if (id === 'heat')  { _modeHeat  = val; if (val !== 'period') { _fromHeat  = ''; _toHeat  = ''; } }
  if (id === 'grade') { _modeGrade = val; if (val !== 'period') { _fromGrade = ''; _toGrade = ''; } }
  const idCap = id.charAt(0).toUpperCase() + id.slice(1);
  const pr = document.getElementById('period' + idCap);
  if (pr) pr.style.display = val === 'period' ? '' : 'none';
  renderDash(curFilter);
}
function setChartPeriod(id, which, val) {
  if (id === 'right') { if (which === 'from') _fromRight = val; else _toRight = val; }
  if (id === 'bar')   { if (which === 'from') _fromBar   = val; else _toBar   = val; }
  if (id === 'heat')  { if (which === 'from') _fromHeat  = val; else _toHeat  = val; }
  if (id === 'grade') { if (which === 'from') _fromGrade = val; else _toGrade = val; }
  renderDash(curFilter);
}
function setKpiMode(val) {
  _modeKpi = val; if (val !== 'period') { _fromKpi = ''; _toKpi = ''; }
  const pr = document.getElementById('periodKpi');
  if (pr) pr.style.display = val === 'period' ? '' : 'none';
  renderDash(curFilter);
}
function setKpiPeriod(which, val) {
  if (which === 'from') _fromKpi = val; else _toKpi = val;
  renderDash(curFilter);
}
function setActionMode(val) {
  _modeAction = val; if (val !== 'period') { _fromAction = ''; _toAction = ''; }
  const pr = document.getElementById('periodAction');
  if (pr) pr.style.display = val === 'period' ? '' : 'none';
  _jngPage = 0; _notesDashPage = 0;
  const rdR = refDate(); const yr2 = rdR.getFullYear(); const mo2 = rdR.getMonth() + 1;
  const ym2 = `${yr2}-${String(mo2).padStart(2,'0')}`;
  renderJngSection(ym2, `${yr2}년 ${mo2}월 기준`);
  renderNotesSection(curFilter);
}
function setActionPeriod(which, val) {
  if (which === 'from') _fromAction = val; else _toAction = val;
  const rdR = refDate(); const yr2 = rdR.getFullYear(); const mo2 = rdR.getMonth() + 1;
  const ym2 = `${yr2}-${String(mo2).padStart(2,'0')}`;
  renderJngSection(ym2, `${yr2}년 ${mo2}월 기준`);
  renderNotesSection(curFilter);
}

// ── 등급 순위판 정보 팝업 ──────────────────────────
let __gradeInfoEl = null;
function showGradeInfo(target) {
  if (__gradeInfoEl) return;
  const isCat = curDashCat && curDashCat !== 'all';
  const areaList = isCat
    ? (CAT_TYPES[curDashCat] || []).filter(t => GRADE_AREAS.includes(t))
    : GRADE_AREAS;
  const areaStr = areaList.join(', ');
  const isAcc = _modeGrade === 'acc';
  __gradeInfoEl = document.createElement('div');
  __gradeInfoEl.className = 'grade-info-popup';
  __gradeInfoEl.innerHTML =
    `<div class="gip-tit">순위 산정 기준</div>` +
    `<div class="gip-sec">평가 영역 (${areaList.length}개)</div>` +
    `<div class="gip-val">${esc(areaStr)}</div>` +
    `<div class="gip-sec">월별 등급 기준 (해당 월 위반율 = 위반+완료 ÷ 모니터링+위반+완료)</div>` +
    `<div class="gip-val">A ≤10% · B ≤20% · C ≤30% · D ≤50% · F 50%초과<br>즉시 F: 외부노출 1건↑ · 안전 중대재해 1건↑ · 부실채권 2개월초과 미입금 1억초과<br>즉시 D: 부실채권 2개월초과 미입금 1억이하</div>` +
    `<div class="gip-sec">등급 점수</div>` +
    `<div class="gip-val">A=10점 · B=8점 · C=5점 · D=3점 · F=0점</div>` +
    (isAcc
      ? `<div class="gip-sec">영역별 누적 등급</div>` +
        `<div class="gip-val">시작월~기준월 매월 등급 점수의 평균으로 산정<br>(안전 1월~ · 그 외 영역 3월~, 단순 누적 건수 아님)</div>`
      : '') +
    `<div class="gip-sec">종합등급 기준 (평균점수)</div>` +
    `<div class="gip-val">A 9-10 · B 7-8 · C 4-6 · D 1-3 · F 0</div>` +
    `<div class="gip-sec">100점 환산</div>` +
    `<div class="gip-val">평균점수 × 10</div>`;
  document.body.appendChild(__gradeInfoEl);
  const rect = target.getBoundingClientRect();
  const pw = 260;
  let left = rect.left;
  if (left + pw > window.innerWidth - 12) left = Math.max(12, window.innerWidth - pw - 12);
  __gradeInfoEl.style.left = left + 'px';
  __gradeInfoEl.style.top  = (rect.bottom + 6) + 'px';
}
function hideGradeInfo() {
  if (__gradeInfoEl) { __gradeInfoEl.remove(); __gradeInfoEl = null; }
}

// ── 브랜드 리스크 등급 순위판 ──────────────────────
const GRADE_AREAS   = ['불법파견','표시광고','가맹','IP','노무','영업비밀','부실채권','안전'];
const GRADE_SCORE   = { A:10, B:8, C:5, D:3, F:0 };
const RANK_EXCLUDE  = new Set(['광주ck','기흥ck','주안ck','CX팀','상권','본부']);

// 평균 점수 → 등급 문자 (종합등급과 동일 기준)
function gradeFromScore(avg) {
  return avg >= 9 ? 'A' : avg >= 7 ? 'B' : avg >= 4 ? 'C' : avg >= 1 ? 'D' : 'F';
}

// 위반율(위반+완료 ÷ 모니터링+위반+완료) → 등급 문자
// A ≤10% · B ≤20% · C ≤30% · D ≤50% · F 50%초과
function gradeFromRate(cnt, mon) {
  const total = cnt + mon;
  const rate = total > 0 ? cnt / total : 0;
  return rate > 0.5 ? 'F' : rate > 0.3 ? 'D' : rate > 0.2 ? 'C' : rate > 0.1 ? 'B' : 'A';
}

// 영역별 누적 평균 시작월 (그 외 영역은 데이터 입력이 대부분 3월부터 시작됨)
const GRADE_ACC_START_MONTH = { 안전: 1 };
const GRADE_ACC_DEFAULT_START = 3;

// 등급 + 위반 건수를 함께 반환
// acc=true면 영역별 시작월(안전=1월, 그 외=3월)~ym까지 "매월 등급 점수의 평균"으로 등급을 산정한다.
// (단순 누적 건수로 매기면 개월 수가 쌓일수록 결국 모두 D/F로 수렴하므로,
//  월별로 계산한 등급의 평균 점수를 다시 등급으로 환산하는 방식을 쓴다.)
// cnt/mon은 평균이 아니라 시작월~ym까지의 실제 누적 합산값이다.
function calcGradeDetail(type, brand, ym, acc) {
  if (acc) {
    const [yr, mo] = ym.split('-').map(Number);
    const startMo = Math.min(GRADE_ACC_START_MONTH[type] ?? GRADE_ACC_DEFAULT_START, mo);
    const months = [];
    for (let m = startMo; m <= mo; m++) months.push(`${yr}-${String(m).padStart(2,'0')}`);
    const monthly = months.map(m => calcGradeDetail(type, brand, m, false));
    const cnt = monthly.reduce((s, d) => s + d.cnt, 0);
    const mon = monthly.reduce((s, d) => s + d.mon, 0);
    const avg = monthly.reduce((s, d) => s + (GRADE_SCORE[d.grade] ?? 0), 0) / monthly.length;
    return { grade: gradeFromScore(avg), cnt, mon };
  }

  const recs = records.filter(r => r.brand === brand && r.type === type && r.date && r.date.startsWith(ym));

  if (type === '부실채권') {
    // F: 2개월 초과 미입금 액 > 1억
    const overF = recs.filter(r => {
      if (r.subtype !== '2개월 초과 미입금') return false;
      const amt = r.bc_amount != null ? Number(r.bc_amount) : (parseBcAmt(r) ?? 0);
      return amt > 100000000;
    });
    if (overF.length) return { grade:'F', cnt: overF.reduce((s,r) => s+r.count, 0), mon: 0 };
    // D: 2개월 초과 미입금 액 ≤ 1억
    const over2 = recs.filter(r => {
      if (r.subtype !== '2개월 초과 미입금') return false;
      const amt = r.bc_amount != null ? Number(r.bc_amount) : (parseBcAmt(r) ?? Infinity);
      return amt <= 100000000;
    });
    if (over2.length) return { grade:'D', cnt: over2.reduce((s,r) => s+r.count, 0), mon: 0 };
    // A~D: 위반율 기준 (모니터링+위반+완료 대비 위반+완료)
    const mon = recs.filter(r => r.status === '모니터링').reduce((s, r) => s + r.count, 0);
    const cnt = recs.filter(r => r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
    const grade = gradeFromRate(cnt, mon);
    return { grade, cnt, mon };
  }

  if (type === '안전') {
    // F: 중대재해 발생 1건 이상
    const critical = recs.filter(r => r.subtype === '중대재해 발생');
    if (critical.some(r => r.count > 0)) return { grade:'F', cnt: critical.reduce((s,r)=>s+r.count,0), mon: 0 };
    // A~D: 위반율 기준 (발생+조치완료 ÷ 모니터링+발생+조치완료)
    const mon = recs.filter(r => r.status === '모니터링').reduce((s, r) => s + r.count, 0);
    const cnt = recs.filter(r => r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
    const grade = gradeFromRate(cnt, mon);
    return { grade, cnt, mon };
  }

  // 컴플라이언스 영역: 외부노출 1건 이상이면 F (우선), 그 외엔 위반율 기준
  const mon = recs.filter(r => r.status === '모니터링').reduce((s, r) => s + r.count, 0);
  const cnt = recs.filter(r => r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
  if (recs.some(r => r.exposed)) return { grade:'F', cnt, mon };
  const grade = gradeFromRate(cnt, mon);
  return { grade, cnt, mon };
}

// 하위 호환 (다른 곳에서 사용 가능)
function calcGrade(type, brand, ym) { return calcGradeDetail(type, brand, ym).grade; }

function renderLeaderboard(visibleAreas, showOverall, brandOnly) {
  visibleAreas = visibleAreas || GRADE_AREAS;
  if (showOverall === undefined) showOverall = true;
  brandOnly = !!brandOnly;
  const board = document.getElementById('gradeBoard');
  if (!board) return;

  const refYm2  = `${refDate().getFullYear()}-${String(refDate().getMonth()+1).padStart(2,'0')}`;
  const ym     = (_modeGrade === 'acc' || _modeGrade === 'mon') ? refYm2 :
                 _modeGrade === 'period' ? (_toGrade || _fromGrade || refYm2) : _modeGrade;
  const [yr, mo] = ym.split('-').map(Number);
  const isAcc  = _modeGrade === 'acc';
  const lbl    = isAcc ? `${yr}년 ${mo}월 누적 기준` : `${yr}년 ${mo}월 기준`;

  const ymEl = document.getElementById('gradeYm');
  if (ymEl) ymEl.textContent = lbl;
  const modeGradeEl = document.getElementById('modeGrade');
  if (modeGradeEl) modeGradeEl.value = _modeGrade;

  // 헤더 동적 갱신
  const headTr = document.getElementById('gradeHead');
  if (headTr) {
    headTr.innerHTML =
      (brandOnly ? '' : `<th class="gt-rank">순위</th>`) +
      `<th class="gt-brand">브랜드</th>` +
      (showOverall ? `<th class="gt-overall">종합등급</th><th class="gt-sep"></th>` : '') +
      visibleAreas.map(t => `<th class="gt-area">${esc(t)}</th>`).join('');
  }

  const brands = (isAdmin() ? BRANDS : userBrands().filter(b => BRANDS.includes(b)))
    .filter(b => !RANK_EXCLUDE.has(b));

  const scoreAreas = visibleAreas.filter(t => GRADE_AREAS.includes(t));
  let ranked = brands.map(brand => {
    const details = {};
    GRADE_AREAS.forEach(type => {
      const d = calcGradeDetail(type, brand, ym, isAcc);
      details[type] = d;
    });
    const brandScoreAreas = scoreAreas.filter(t => !isGradeAreaExcluded(t, brand));
    const effAreas = brandScoreAreas.length ? brandScoreAreas : scoreAreas;
    let total = 0;
    effAreas.forEach(type => { total += GRADE_SCORE[details[type].grade] ?? 0; });
    const avg   = effAreas.length ? total / effAreas.length : 0;
    const score = parseFloat((avg * 10).toFixed(1));
    const overallGrade = gradeFromScore(avg);
    return { brand, details, total, score, overallGrade };
  }).sort((a, b) => b.score - a.score || a.brand.localeCompare(b.brand));
  if (brandOnly) ranked = ranked.filter(r => r.brand === curBrand);

  const tbody = document.getElementById('gradeRows');
  if (!tbody) return;
  tbody.innerHTML = '';

  ranked.forEach(({ brand, details, score, overallGrade }, idx) => {
    const rank = idx + 1;
    const pc   = rank === 1 ? 'p1' : rank === 2 ? 'p2' : rank === 3 ? 'p3' : '';
    const tr   = document.createElement('tr');
    const scoreTxt = Number.isInteger(score) ? score : score.toFixed(1);
    tr.innerHTML =
      (brandOnly ? '' : `<td><span class="gp ${pc}">${rank}</span></td>`) +
      `<td class="gt-brand">${esc(brand)}</td>` +
      (showOverall ? `<td class="gt-overall"><div class="gt-overall-wrap"><span class="gc ${overallGrade}">${overallGrade}</span><span class="gt-overall-score">${scoreTxt}점</span></div></td><td class="gt-sep"></td>` : '') +
      visibleAreas.map(t =>
        isGradeAreaExcluded(t, brand)
          ? `<td class="gt-area"><div class="gc-cell"><span class="gc na">-</span></div></td>`
          : `<td class="gt-area"><div class="gc-cell"><span class="gc ${details[t].grade}">${details[t].grade}</span>` +
            `<span class="gc-cnt"><span class="gc-vio">${details[t].cnt}</span>/<span class="gc-mon">${details[t].cnt + details[t].mon}</span></span></div></td>`
      ).join('');
    tbody.appendChild(tr);
    setTimeout(() => tr.classList.add('gb-in'), 40 + idx * 500);
  });

  renderJngSection(ym, lbl);
  scheduleRankAnim();
}

// 감사 KPI 카드(조치완료/적발·경징계·중징계·형사고발) — 연 누적, 브랜드 필터 반영
function renderAuditKpis(dY) {
  const recs = dY.filter(r => r.type === '감사');
  const done = recs.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
  const tot  = recs.reduce((s, r) => s + r.count, 0);
  const rate = tot ? (done / tot * 100).toFixed(1) : 0;
  const cntByJngType = jt => recs.filter(r => r.jng_type === jt).reduce((s, r) => s + r.count, 0);
  const rd = refDate();
  const sub = `${rd.getFullYear()}년 ${rd.getMonth() + 1}월까지 누적`;

  document.getElementById('auditKpi1').textContent  = `${done.toLocaleString()} / ${tot.toLocaleString()}`;
  document.getElementById('auditKpi1r').textContent = tot ? `조치완료율 ${rate}%` : '-';
  document.getElementById('auditKpi1s').textContent = sub;

  document.getElementById('auditKpi2').textContent  = cntByJngType('경징계').toLocaleString();
  document.getElementById('auditKpi2s').textContent = sub;
  document.getElementById('auditKpi3').textContent  = cntByJngType('중징계').toLocaleString();
  document.getElementById('auditKpi3s').textContent = sub;
  document.getElementById('auditKpi4').textContent  = cntByJngType('형사고발').toLocaleString();
  document.getElementById('auditKpi4s').textContent = sub;
}

let _jngPage = 0;

function onJngModeChange() { /* 레거시 - setActionMode 사용 */ }

function setJngPage(dir) {
  _jngPage += dir;
  const rd = refDate(), yr = rd.getFullYear(), mo = rd.getMonth() + 1;
  const ym = `${yr}-${String(mo).padStart(2,'0')}`;
  renderJngSection(ym, `${yr}년 ${mo}월 기준`);
}

function renderJngSection(ym, lbl) {
  const jngYm  = document.getElementById('jngYm');
  const mode   = _modeAction;
  const brands = isAdmin() ? BRANDS : userBrands().filter(b => BRANDS.includes(b));

  let jngRecs;
  if (mode === 'mon') {
    jngRecs = records.filter(r => r.type === '감사' && r.date && r.date.startsWith(ym) && brands.includes(r.brand));
    if (jngYm) jngYm.textContent = lbl;
  } else if (mode === 'period') {
    jngRecs = records.filter(r => {
      if (r.type !== '감사' || !r.date || !brands.includes(r.brand)) return false;
      const ym2 = r.date.slice(0,7);
      return (!_fromAction || ym2 >= _fromAction) && (!_toAction || ym2 <= _toAction);
    });
    const fLbl = _fromAction ? _fromAction.replace('-','년 ') + '월' : '?';
    const tLbl = _toAction ? _toAction.replace('-','년 ') + '월' : '?';
    if (jngYm) jngYm.textContent = `${fLbl} ~ ${tLbl}`;
  } else if (mode !== 'acc' && /^\d{4}-\d{2}$/.test(mode)) {
    // 특정 월 직접 선택
    jngRecs = records.filter(r => r.type === '감사' && r.date && r.date.startsWith(mode) && brands.includes(r.brand));
    const [y2, m2] = mode.split('-').map(Number);
    if (jngYm) jngYm.textContent = `${y2}년 ${m2}월`;
  } else {
    // acc: 연 누적
    const [yr, mo] = ym.split('-').map(Number);
    jngRecs = records.filter(r => {
      if (r.type !== '감사' || !r.date || !brands.includes(r.brand)) return false;
      const [ry, rm] = r.date.split('-').map(Number);
      return ry === yr && rm <= mo;
    });
    if (jngYm) jngYm.textContent = lbl + ' 누적';
  }
  // 브랜드별 뷰: 해당 브랜드만 표시
  if (curBrand !== 'all') jngRecs = jngRecs.filter(r => r.brand === curBrand);

  const wrap  = document.getElementById('jngCards');
  const pager = document.getElementById('jngPager');
  if (!wrap) return;

  if (!jngRecs.length) {
    wrap.innerHTML = `<span class="jng-empty">해당 기간 징계 현황 없음</span>`;
    if (pager) pager.style.display = 'none';
    return;
  }

  const MAX_RECS = 50, PAGE_SIZE = 10, MAX_PAGE = 5, SHOW = 5;
  const allRecs = jngRecs.slice(0, MAX_RECS);
  const totalPages = Math.min(MAX_PAGE, Math.max(1, Math.ceil(allRecs.length / PAGE_SIZE)));
  if (_jngPage >= totalPages) _jngPage = totalPages - 1;
  if (_jngPage < 0)           _jngPage = 0;
  const pageRecs = allRecs.slice(_jngPage * PAGE_SIZE, (_jngPage + 1) * PAGE_SIZE);

  const makeJngRow = r => {
    let name = r.jg_name || '', sent = r.jg_sent || '';
    if (!name && !sent) { const p = parseJgRecord(r); if (p) { name = p.name; sent = p.sent; } }
    const noteText = r.jg_name != null ? (r.note || '') : (parseJgRecord(r)?.note || r.note || '');
    return `<tr>
      <td>${esc(r.date ? r.date.slice(5).replace('-','/') : '-')}</td>
      <td>${esc(r.brand || '-')}</td>
      <td>${esc(r.subtype && r.subtype !== '-' ? r.subtype : '-')}</td>
      <td>${esc(r.jng_type || '-')}</td>
      <td>${esc(name || '-')}</td>
      <td>${esc(sent || '-')}</td>
      <td>${esc(noteText || '-')}</td>
      <td><span class="rc-st ${sc(r.status)}">${esc(statLbl(r.status, '감사'))}</span></td>
    </tr>`;
  };
  const singleHtml = pageRecs.map(makeJngRow).join('');
  const jcg = `<colgroup><col style="width:7%"><col style="width:9%"><col style="width:10%"><col style="width:8%"><col style="width:8%"><col style="width:12%"><col style="width:38%"><col style="width:8%"></colgroup>`;
  const jHead = `<thead><tr><th>날짜</th><th>브랜드</th><th>상세유형</th><th>징계유형</th><th>성명</th><th>양형</th><th>비고</th><th>상태</th></tr></thead>`;
  wrap.innerHTML = `
    <div class="jng-tbl-wrap">
      <table class="jng-tbl jng-tbl-hdr">${jcg}${jHead}</table>
      <div class="jng-port" id="jngPort">
        <table class="jng-tbl jng-tbl-bdy">${jcg}<tbody id="jngBtbl">${singleHtml}</tbody></table>
      </div>
    </div>`;

  setTimeout(() => {
    const port = document.getElementById('jngPort');
    const tb   = document.getElementById('jngBtbl');
    if (!port || !tb) return;
    const rows = tb.querySelectorAll('tr');
    if (!rows.length) return;
    const rowH = (tb.offsetHeight / rows.length) || 28;
    port.style.height = `${rowH * Math.min(SHOW, pageRecs.length)}px`;
    if (pageRecs.length > SHOW) {
      tb.innerHTML = singleHtml + singleHtml;
      tb.style.animation = `ticker-up ${pageRecs.length * 2.5}s linear infinite`;
    }
  }, 50);

  if (pager) {
    pager.style.display = totalPages > 1 ? '' : 'none';
    const pi = document.getElementById('jngPageInfo');
    if (pi) pi.textContent = `${_jngPage + 1} / ${totalPages}`;
    const btns = pager.querySelectorAll('button');
    if (btns[0]) btns[0].disabled = _jngPage === 0;
    if (btns[1]) btns[1].disabled = _jngPage >= totalPages - 1;
  }
}

// ── 리더보드 연속 부상 애니메이션 ───────────────────
let _rankScanTimer = null;
const _RISE_ROW_MS  = 500;   // 행 간 딜레이
const _RISE_ANIM_MS = 2200;  // CSS animation 시간과 동기화
const _RISE_PAUSE   = 600;   // 마지막 행 후 잠깐 대기

function scheduleRankAnim() {
  if (_rankScanTimer) clearTimeout(_rankScanTimer);

  const board = document.getElementById('gradeBoard');
  if (board) {
    board.onmouseenter = () => { board._rankPaused = true; };
    board.onmouseleave = () => { board._rankPaused = false; };
  }

  const runRise = () => {
    if (board && board._rankPaused) {
      _rankScanTimer = setTimeout(runRise, 300);
      return;
    }
    const rows = Array.from(document.querySelectorAll('.grade-tbl tbody tr'));
    if (!rows.length) { _rankScanTimer = setTimeout(runRise, 2000); return; }

    rows.forEach((r, i) => {
      setTimeout(() => {
        r.classList.remove('gb-in');
        void r.offsetWidth;
        r.classList.add('gb-in');
      }, i * _RISE_ROW_MS);
    });

    // 마지막 행 완료 시점 계산 → 짧게 쉬고 바로 재실행
    const nextIn = (rows.length - 1) * _RISE_ROW_MS + _RISE_ANIM_MS + _RISE_PAUSE;
    _rankScanTimer = setTimeout(runRise, nextIn);
  };

  // 첫 실행은 초기 진입 애니메이션 끝난 후 시작
  const initRows = document.querySelectorAll('.grade-tbl tbody tr').length;
  _rankScanTimer = setTimeout(runRise, 40 + initRows * _RISE_ROW_MS + _RISE_ANIM_MS + 800);
}

// ── 브랜드/영역별 위험도 리더보드 ──────────────────
// 고정 브랜드 순서로 카드 배치, 각 카드에 Top 3 영역을 칩으로 표시
const BRAND_ORDER = ['애슐리','피자몰','로운','자연별곡','리미니','델리바이애슐리','프랜차이즈','카페','프랑제리','기흥ck','광주ck','주안ck','CX팀','상권','본부'];

function renderHeatmap(scopeYm) {
  const wrap = document.getElementById('heatmapWrap');
  if (!wrap) return;
  const brands = isAdmin() ? BRANDS : userBrands().filter(b => BRANDS.includes(b));
  if (!brands.length) { wrap.innerHTML = '<div class="drill-empty">표시할 브랜드가 없습니다.</div>'; return; }

  // 영역 탭이 'all'이면 영역(TYPES) 기준, 특정 영역이면 그 영역의 상세 위반 유형(SUB[type]) 기준
  const isAll = curFilter === 'all';
  const dim   = isAll ? TYPES : (SUB[curFilter] || []);

  // 카드 제목 동적 갱신
  const titEl = document.querySelector('#heatmapCard .card-tit');
  if (titEl) {
    const isClm = curFilter === '클레임';
    titEl.innerHTML = isAll
      ? '브랜드/영역별 위험도 <span class="card-sub-note">— 위반 건수 상위 브랜드 · Top 3 영역</span>'
      : isClm
        ? `브랜드/상세유형별 처리 현황 <span class="card-sub-note">— ${esc(curFilter)} · 상세 처리 유형별 처리 건수</span>`
        : `브랜드/상세유형별 위험도 <span class="card-sub-note">— ${esc(curFilter)} · 상세 위반 유형별 위반 건수</span>`;
  }

  // scopeYm 있으면 당월, 없으면 누적(전체)
  const mr = scopeYm ? records.filter(r => r.date && r.date.startsWith(scopeYm)) : records;

  // 카운트: 전체 모드는 (영역, 브랜드), 영역 모드는 (상세유형, 브랜드)
  const cnt = isAll
    ? (key, brand) => mr.filter(r => r.type === key && r.brand === brand && r.status !== '모니터링').reduce((s, r) => s + r.count, 0)
    : (key, brand) => mr.filter(r => r.type === curFilter && r.subtype === key && r.brand === brand && r.status !== '모니터링').reduce((s, r) => s + r.count, 0);

  const items = brands.map(b => {
    const cells = dim.map(k => ({ key: k, count: cnt(k, b) }))
      .filter(a => a.count > 0)
      .sort((x, y) => y.count - x.count);
    const total = cells.reduce((s, a) => s + a.count, 0);
    return { brand: b, total, cells };
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

  // 전역 max: 모든 (브랜드, 차원키) 조합 중 최대값 → 카드 간 동일 스케일
  const globalMax = Math.max(1, ...items.flatMap(it => it.cells.map(a => a.count)));

  let html = '<div class="rank-grid">';
  items.forEach(it => {
    const cellRows = it.cells.map(a => {
      const pct = Math.max(6, Math.round(a.count / globalMax * 100));
      const drillCall = isAll
        ? `openDrill('type-brand','${a.key}','${it.brand}')`
        : `openDrill('subtype-brand','${curFilter}','${it.brand}','${a.key}')`;
      return `
        <div class="rank-area" onclick="event.stopPropagation();${drillCall}">
          <span class="rank-area-name">${esc(a.key)}</span>
          <div class="rank-area-bar"><div class="rank-area-fill" style="width:${pct}%"></div></div>
          <span class="rank-area-count">${a.count.toLocaleString()}</span>
        </div>`;
    }).join('');

    html += `
      <div class="rank-card" onclick="openDrill('brand','${it.brand}')">
        <div class="rank-card-hd">
          <span class="rank-brand">${esc(it.brand)}</span>
          <span class="rank-total">위반 ${it.total.toLocaleString()}건</span>
        </div>
        <div class="rank-areas">${cellRows}</div>
      </div>`;
  });
  html += '</div>';
  wrap.innerHTML = html;
  // 애니메이션은 IntersectionObserver (_triggerCardAnim)가 처리
}

// ── 드릴다운: 영역×브랜드 / 영역 / 브랜드 / 상세유형 등 조건으로 records 필터해서 패널 표시
function openDrill(mode, a, b, c) {
  let filtered = records.slice();
  let title = '', sub = '';
  if (mode === 'type-brand')   { filtered = filtered.filter(r => r.type === a && r.brand === b); title = `${a} × ${b}`;  sub = `위반 건수 ${filtered.filter(r => r.status !== '모니터링').reduce((s,r)=>s+r.count,0)}건 · 모니터링 포함 총 ${filtered.length}레코드`; }
  else if (mode === 'subtype-brand') { filtered = filtered.filter(r => r.type === a && r.brand === b && r.subtype === c); title = `${a} · ${c} × ${b}`; sub = `위반 건수 ${filtered.filter(r => r.status !== '모니터링').reduce((s,r)=>s+r.count,0)}건 · 모니터링 포함 총 ${filtered.length}레코드`; }
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
      <td><span class="st ${sc(r.status)}">${esc(statLbl(r.status, r.type))}</span>${ageBadge}</td>
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

function renderLine(d, ref) {
  const yr     = ref.getFullYear();
  const selIdx = ref.getMonth();   // 기준 월 인덱스(0~11) — 라인차트에서 강조
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
  // 기준 월 포인트만 크게 표시
  const pr = MONTHS.map((_, i) => i === selIdx ? 6 : 3);

  if (lChart) lChart.destroy();
  lChart = new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: {
      labels: MONTHS,
      datasets: [
        { label:'모니터링', data:m, borderColor:'#8fa8c8', backgroundColor:'rgba(143,168,200,0.07)', tension:0.4, pointRadius:pr, pointBackgroundColor:'#8fa8c8', borderWidth:2 },
        { label:'위반',     data:v, borderColor:'#e8845a', backgroundColor:'rgba(232,132,90,0.07)',  tension:0.4, pointRadius:pr, pointBackgroundColor:'#e8845a', borderWidth:2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 1800, easing: 'easeInOutQuart' },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid:{color:'rgba(0,0,0,0.03)'}, ticks:{font:{size:10},color:'#94a3b8',autoSkip:false,maxRotation:0} },
        y: { grid:{color:'rgba(0,0,0,0.03)'}, ticks:{font:{size:10},color:'#94a3b8'}, beginAtZero:true }
      }
    }
  });
}

// 도넛 조각 숫자 라벨: 비중이 충분한 조각은 안쪽에 흰 숫자로, 작은 조각은
// 겹치거나 잘려 안 보이므로 바깥으로 리더라인(꺾은선)을 빼서 꼬리표로 표시.
const calloutLabelsPlugin = {
  id: 'calloutLabels',
  afterDatasetsDraw(chart, _args, opts) {
    const meta = chart.getDatasetMeta(0);
    const arc0 = meta.data[0];
    if (!arc0) return;
    const ds    = chart.data.datasets[0];
    const data  = ds.data;
    const total = data.reduce((a, b) => a + b, 0);
    if (!total) return;

    const { ctx, chartArea } = chart;
    const cx = arc0.x, cy = arc0.y;
    const outerR    = arc0.outerRadius;
    const threshold = opts.threshold || 0.06;

    ctx.save();
    ctx.font = "700 11px Pretendard, -apple-system, sans-serif";
    ctx.textBaseline = 'middle';

    // 1) 충분히 큰 조각: 안쪽 중앙에 흰 숫자
    meta.data.forEach((arc, i) => {
      const v = data[i];
      if (!v || v / total < threshold) return;
      const angle = (arc.startAngle + arc.endAngle) / 2;
      const r = (arc.innerRadius + arc.outerRadius) / 2;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(String(v), cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    });

    // 2) 작은 조각: 바깥으로 리더라인을 빼서 꼬리표 표시 (좌/우로 분리, 겹치면 세로로 밀어냄)
    const small = [];
    meta.data.forEach((arc, i) => {
      const v = data[i];
      if (!v || v / total >= threshold) return;
      const angle = (arc.startAngle + arc.endAngle) / 2;
      small.push({
        v, angle,
        ax: cx + Math.cos(angle) * outerR,
        ay: cy + Math.sin(angle) * outerR,
        color: Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : ds.backgroundColor
      });
    });

    if (small.length) {
      const MAX_GAP = 14, MIN_GAP = 10;
      const labelR = outerR + 20;
      const minY   = chartArea.top + 8, maxY = chartArea.bottom - 8;

      // 라벨 개수가 많아 세로 공간이 부족하면 간격을 MIN_GAP까지 줄여서라도 겹치지 않게 유지
      const place = arr => {
        if (!arr.length) return;
        arr.sort((a, b) => a.ay - b.ay);
        const gap = arr.length > 1
          ? Math.max(MIN_GAP, Math.min(MAX_GAP, (maxY - minY) / (arr.length - 1)))
          : MAX_GAP;
        arr.forEach(s => { s.ly = s.ay; });
        for (let k = 1; k < arr.length; k++) {
          if (arr[k].ly - arr[k - 1].ly < gap) arr[k].ly = arr[k - 1].ly + gap;
        }
        const overflow = arr[arr.length - 1].ly - maxY;
        if (overflow > 0) arr.forEach(s => { s.ly -= overflow; });
        if (arr[0].ly < minY) {
          const shift = minY - arr[0].ly;
          arr.forEach(s => { s.ly += shift; });
        }
      };
      const draw = (arr, side) => {
        arr.forEach(s => {
          const lx     = cx + (side === 'right' ? labelR : -labelR);
          const elbowX = cx + Math.cos(s.angle) * (outerR + 8);
          const elbowY = cy + Math.sin(s.angle) * (outerR + 8);
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(s.ax, s.ay);
          ctx.lineTo(elbowX, elbowY);
          ctx.lineTo(lx, s.ly);
          ctx.stroke();
          ctx.fillStyle = s.color || '#475569';
          ctx.textAlign = side === 'right' ? 'left' : 'right';
          ctx.fillText(String(s.v), lx + (side === 'right' ? 4 : -4), s.ly);
        });
      };

      const leftArr  = small.filter(s => Math.cos(s.angle) < 0);
      const rightArr = small.filter(s => Math.cos(s.angle) >= 0);
      place(leftArr); place(rightArr);
      draw(leftArr, 'left'); draw(rightArr, 'right');
    }

    ctx.restore();
  }
};

function renderRight(d, k, ref) {
  if (rChart) { rChart.destroy(); rChart = null; }
  const lg  = document.getElementById('rChartLeg');
  const tag = document.getElementById('rChartTag');
  const tit = document.getElementById('rChartTit');
  const tagYm = `${ref.getFullYear()}.${String(ref.getMonth()+1).padStart(2,'0')}`;

  if (k === 'all') {
    tit.textContent = '위반 유형별 분포';
    tag.textContent = tagYm;
    const cnt = TYPES.map(t => d.filter(r => r.type === t && r.status !== '모니터링').reduce((s,r) => s + r.count, 0));
    const tot = cnt.reduce((a,b) => a + b, 0);
    let legHtml = TYPES.map((t,i) => `<span><span class="ld" style="background:${TC[i]}"></span>${t} ${tot ? Math.round(cnt[i]/tot*100) : 0}%</span>`).join('');
    if (!tot) legHtml += '<span class="empty-note">위반 사항이 없습니다.</span>';
    lg.innerHTML = legHtml;
    rChart = new Chart(document.getElementById('rightChart'), {
      type: 'doughnut',
      data: { labels: TYPES, datasets: [{ data: cnt, backgroundColor: TC, borderWidth: 3, borderColor: '#fff' }] },
      plugins: [calloutLabelsPlugin],
      options: {
        responsive:true, maintainAspectRatio:false, cutout:'65%',
        layout: { padding: { left: 34, right: 34, top: 8, bottom: 8 } },
        animation: { duration: 1800, easing: 'easeInOutQuart' },
        plugins:{ legend:{display:false}, calloutLabels:{ threshold: 0.06 } },
        onClick: (_, els) => { if (els.length) openDrill('type', TYPES[els[0].index]); }
      }
    });
  } else {
    tit.textContent = k === '클레임' ? '상세 처리 유형별 분포' : '상세 위반 유형별 분포';
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
      plugins: [calloutLabelsPlugin],
      options: {
        responsive:true, maintainAspectRatio:false, cutout:'65%',
        layout: { padding: { left: 34, right: 34, top: 8, bottom: 8 } },
        animation: { duration: 1800, easing: 'easeInOutQuart' },
        plugins:{ legend:{display:false}, calloutLabels:{ threshold: 0.06 } },
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
      animation: { duration: 1800, easing: 'easeInOutQuart' },
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
  hideNotePopup();
  const tb   = document.getElementById('recentTbody');
  const pg   = document.getElementById('recentPager');
  const port = document.getElementById('recsPort');

  const PAGE_SIZE = 20;  // 페이지당 행 수
  const MAX_PAGE  = 5;   // 최대 페이지 수
  const SHOW      = 10;  // 한 번에 보이는 행 수
  const MAX_ROWS  = PAGE_SIZE * MAX_PAGE;  // 최대 100건

  const filtered = (recentStatus === 'all' ? d : d.filter(r => r.status === recentStatus))
                    .slice(0, MAX_ROWS);

  const totalPages = Math.min(MAX_PAGE, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  if (recentPage >= totalPages) recentPage = totalPages - 1;
  if (recentPage < 0) recentPage = 0;

  const pageRows = filtered.slice(recentPage * PAGE_SIZE, (recentPage + 1) * PAGE_SIZE);

  // 기존 티커 초기화
  tb.style.animation = 'none';
  tb.style.animationPlayState = '';

  if (pg) pg.style.display = '';

  if (!pageRows.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty">데이터를 입력해 주세요</div></td></tr>';
    if (port) port.style.height = '';
    if (pg) pg.innerHTML = '';
    return;
  }

  _recentPageRows = pageRows;

  const makeRow = (r, i) => {
    const over = isSlaOver(r);
    const ageBadge = over ? ` <span class="sla-badge" title="발생 후 ${daysSince(r.date)}일 경과">${daysSince(r.date)}일</span>` : '';
    const noteVal = (r.note || '').trim();
    return `<tr class="recent-row${over ? ' sla-over' : ''}" data-idx="${i}" onclick="toggleNotePopup(this, event)" title="클릭해 전체 내용 보기">
    <td>${esc(r.date.slice(5).replace('-','/'))}</td>
    <td>${esc(r.type)}</td>
    <td class="cell-sub">${esc(r.subtype||'-')}</td>
    <td>${esc(r.brand)}</td>
    <td><span class="st ${sc(r.status)}">${esc(statLbl(r.status, r.type))}</span>${ageBadge}</td>
    <td class="cell-sub cell-note-clip">${esc(noteVal || '-')}</td>
  </tr>`;
  };

  const singleHtml = pageRows.map(makeRow).join('');

  // 단일 세트 렌더 후 행 높이 측정
  tb.innerHTML = singleHtml;
  void tb.offsetHeight;
  const rowH = pageRows.length ? (tb.offsetHeight / pageRows.length) : 36;
  if (port) port.style.height = `${rowH * Math.min(SHOW, pageRows.length)}px`;

  if (pageRows.length <= SHOW) {
    // 10개 이하: 정적 표시 (순환 불필요)
    renderPager(pg, recentPage, totalPages);
    return;
  }

  // 2배 복제 → -50% translateY = 정확히 1세트(20행) 이동 → 무한 루프
  tb.innerHTML = singleHtml + singleHtml;
  const dur = pageRows.length * 2.5;  // 행당 2.5초 (20행 → 50초 1주기)
  void tb.offsetHeight;
  tb.style.animation = `ticker-up ${dur}s linear infinite`;

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

function gotoPage(p) { recentPage = p; renderRecent(_recentData); }

function setRecentStatus(btn, st) {
  document.querySelectorAll('.rs-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  recentStatus = st;
  recentPage = 0;
  renderRecent(_recentData);
}

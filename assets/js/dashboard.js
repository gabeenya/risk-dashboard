// ── KPI 숫자 카운트업 애니메이션 ────────────────────
let _kpiRepeat = null;
const _kpiTok  = {};   // 카드별 취소 토큰 — 새 애니메이션 시작 시 구 rAF 루프 종료

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

function runKpiCountUp() {
  ['kpi1','kpi2','kpi3','kpi4'].forEach((id, i) => {
    const el  = document.getElementById(id);
    if (!el) return;
    const raw = el.textContent.trim();
    if (!raw || raw === '-') return;

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
async function loadData() {
  if (!user) { records = []; return; }   // 비로그인 시 데이터 자체를 비움
  setSy('불러오는 중...', '#15803d', '#f0fdf4');
  try { records = await sbGet('records'); }
  catch(e) { records = []; }
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
  const list = getFRM(curFilter).filter(isSlaOver)
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
  // 연 누적: 기준 연도 1월~기준 월
  const dY = d.filter(r => {
    if (!r.date) return false;
    const [ry, rm] = r.date.split('-').map(Number);
    return ry === yr && rm <= mo;
  });

  // 누적(연 누적) — dY / 당월·처리·현재 — dm
  // 징계·부실채권은 모니터링 개념이 없어 위반율 집계에서 제외 (전체 필터 시 분자·분모 모두 제외)
  const NO_MON = ['징계', '부실채권'];
  const excNoMon = r => !NO_MON.includes(r.type);
  // 분류 전체 뷰에서 해당 분류의 모든 영역이 NO_MON이면 excNoMon 필터를 건너뜀 (부정/부실 제거 분류)
  const catAllNoMon = k === 'all' && curDashCat !== 'all' &&
    (CAT_TYPES[curDashCat] || []).every(t => NO_MON.includes(t));
  const dYb = (NO_MON.includes(k) || catAllNoMon) ? dY : dY.filter(excNoMon);
  const dmb  = (NO_MON.includes(k) || catAllNoMon) ? dm : dm.filter(excNoMon);
  const tot  = dYb.reduce((s, r) => s + monCnt(r), 0);
  const vio  = dYb.filter(isVio).reduce((s, r) => s + r.count, 0);
  const mTot = dmb.reduce((s, r) => s + monCnt(r), 0);
  const mVio = dmb.filter(isVio).reduce((s, r) => s + r.count, 0);
  const done = dYb.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);   // 기준월까지 누적 완료
  const act  = dmb.filter(r => r.status === '위반(처리중)').reduce((s, r) => s + r.count, 0);
  const slaOver = dmb.filter(isSlaOver).reduce((s, r) => s + r.count, 0);
  const dr  = vio ? (done / vio * 100).toFixed(1) : 0;   // 누적 완료율 = 누적 완료 / 누적 위반
  const vr  = tot  ? (vio  / tot  * 100).toFixed(1) : 0;
  const mvr = mTot ? (mVio / mTot * 100).toFixed(1) : 0;

  // 영역별 KPI 라벨: 클레임(접수/처리중/처리완료), 징계(적발/조치완료), 부실채권(발생/해결)
  // catAllNoMon: 부정/부실 제거 분류 전체 뷰 (징계+부실채권 합산)
  const isClm      = k === '클레임';
  const isJng      = k === '징계';
  const isBc       = k === '부실채권';
  const isCatNoMon = catAllNoMon;
  const isNoMon    = isJng || isBc || isCatNoMon;
  const lblMon  = isClm ? '접수'   : isNoMon ? '전체'       : '모니터링';
  const lblVio  = isClm ? '처리'   : isJng   ? '적발'       : isBc ? '발생' : isCatNoMon ? '처리(완료)' : '위반';
  const lblIng  = isClm ? '처리중' : isJng   ? '적발'       : isBc ? '발생' : isCatNoMon ? '조치중'     : '위반(처리중)';
  const lblRate = isClm ? '처리율' : isJng   ? '조치완료율' : isBc ? '해결율' : isCatNoMon ? '완료율'   : '위반율';

  // KPI 카드 라벨/서브 동적 갱신
  // kpi3Str/kpi3: 부실채권은 아래 isBc 블록에서 '회수금액'으로 덮어씀
  document.getElementById('kpi3Str').textContent = isClm ? '처리완료율' : isJng ? '조치완료율' : isBc ? '회수금액' : '완료율';
  document.getElementById('kpi3').textContent    = isBc ? '-' : dr + '%';

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

    document.getElementById('kpi2Str').textContent = '당월 징계 건수';
    document.getElementById('kpi2').textContent    = mTot.toLocaleString();
    document.getElementById('kpi2r').textContent   = act ? `적발 ${act.toLocaleString()}건` : '-';
    document.getElementById('kpi2s').textContent   = `${yr}년 ${mo}월 기준`;

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
    document.getElementById('kpi2s').textContent   = `${yr}년 ${mo}월 기준`;

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
    document.getElementById('kpi2s').textContent   = `${yr}년 ${mo}월 기준`;

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
    const jngVio  = dY.filter(r => r.type === '징계' && isVio(r)).reduce((s,r) => s+r.count, 0);
    const jngDone = dY.filter(r => r.type === '징계' && r.status === '완료').reduce((s,r) => s+r.count, 0);
    const jngRate = jngVio ? (jngDone / jngVio * 100).toFixed(1) : 0;
    if (k4Lbl) k4Lbl.textContent = '징계';
    document.getElementById('kpi4Str').textContent = '징계 조치완료율';
    document.getElementById('kpi4').textContent    = jngRate + '%';
    k4s.textContent = `조치완료 ${jngDone.toLocaleString()} / 적발 ${jngVio.toLocaleString()}건 · ${yr}년 ${mo}월까지 누적`;
  } else {
    // 일반 뷰
    document.getElementById('kpi1Str').textContent = `${lblVio} / ${lblMon}`;
    document.getElementById('kpi1').textContent    = `${vio.toLocaleString()} / ${fmtMon(tot)}`;
    document.getElementById('kpi1r').textContent   = tot ? `${lblRate} ${vr}%` : '-';
    document.getElementById('kpi1s').textContent   = `${yr}년 ${mo}월까지 누적`;

    document.getElementById('kpi2Str').textContent = `${lblVio} / ${lblMon}`;
    document.getElementById('kpi2').textContent    = `${mVio.toLocaleString()} / ${fmtMon(mTot)}`;
    document.getElementById('kpi2r').textContent   = mTot ? `${lblRate} ${mvr}%` : '-';
    document.getElementById('kpi2s').textContent   = `${yr}년 ${mo}월 기준`;

    if (k === 'all') {
      let sub3 = `${doneLbl} ${done.toLocaleString()} / ${lblVio} ${vio.toLocaleString()}건 · ${yr}년 ${mo}월까지 누적<br>조치중 ${act.toLocaleString()}건`;
      if (slaOver > 0) sub3 += ` · <span class="sla-alert" onmouseenter="showSlaPopup(this)" onmouseleave="hideSlaPopup()" onclick="toggleSlaPopup(this, event)">${SLA_DAYS}일 초과 ${slaOver.toLocaleString()}건</span>`;
      k3s.innerHTML = sub3;
    } else {
      k3s.textContent = `${doneLbl} ${done.toLocaleString()} / ${lblVio} ${vio.toLocaleString()}건 · ${yr}년 ${mo}월까지 누적`;
    }

    // KPI4: 분류 없이 전체 영역 뷰일 때만 징계 건수 카드 / 그 외(분류 선택 포함)는 조치중 카드
    if (k === 'all' && curDashCat === 'all') {
      const jngCur = dm.filter(r => r.type === '징계').reduce((s, r) => s + r.count, 0);
      const jngAcc = dY.filter(r => r.type === '징계').reduce((s, r) => s + r.count, 0);
      if (k4Lbl) k4Lbl.textContent = '징계';
      document.getElementById('kpi4Str').textContent = '누적 징계 건수';
      document.getElementById('kpi4').textContent    = jngAcc.toLocaleString();
      k4s.textContent = `당월 ${jngCur.toLocaleString()}건`;
    } else {
      if (k4Lbl) k4Lbl.textContent = '현재';
      document.getElementById('kpi4Str').textContent = isClm ? '처리중 건수' : '조치중 건수';
      document.getElementById('kpi4').textContent    = act.toLocaleString();
      if (slaOver > 0) {
        k4s.innerHTML = `${lblIng} 상태 · <span class="sla-alert" onmouseenter="showSlaPopup(this)" onmouseleave="hideSlaPopup()" onclick="toggleSlaPopup(this, event)">${SLA_DAYS}일 초과 ${slaOver.toLocaleString()}건</span>`;
      } else {
        k4s.textContent = `${lblIng} 상태 건수`;
      }
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
  if (recTit) recTit.textContent = isClm ? '최근 접수 현황' : isJng ? '최근 징계 현황' : isBc ? '최근 부실채권 현황' : isCatNoMon ? '최근 현황' : '최근 모니터링 현황';
  const rb = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  rb('rsBtnMon',  isClm ? '접수'    : isNoMon ? '전체'    : '모니터링');
  rb('rsBtnIng',  isClm ? '처리중'  : isJng   ? '적발'    : isBc ? '발생' : isCatNoMon ? '조치중' : '위반(처리중)');
  rb('rsBtnDone', isClm ? '처리완료': isJng   ? '조치완료' : isBc ? '해결' : isCatNoMon ? '완료'  : '완료');

  renderLine(d, ref);
  renderRight(dm, k, ref);
  // 막대그래프(브랜드별 현황)는 admin만 — 브랜드장은 본인 1~몇 개만 보이면 차트 의미가 옅어 카드 자체를 숨김.
  // 브랜드장에게는 도넛/라인 차트의 환산 안내 푸터로 안내가 충분히 전달됨.
  const barCard = document.getElementById('barChartCard');
  if (isAdmin()) {
    if (barCard) barCard.style.display = '';
    renderBar(dm);
  } else {
    if (barCard) barCard.style.display = 'none';
  }
  renderRecent(dm);
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

  // KPI 카운트업: 렌더 직후 + 8초 주기 반복
  clearInterval(_kpiRepeat);
  runKpiCountUp();
  _kpiRepeat = setInterval(runKpiCountUp, 8000);

  const board = document.getElementById('gradeBoard');
  if (board) {
    if (curBrand !== 'all') {
      board.style.display = 'none';
    } else {
      let visibleAreas;
      if (k !== 'all') {
        visibleAreas = GRADE_AREAS.includes(k) ? [k] : [];
      } else if (curDashCat && curDashCat !== 'all') {
        visibleAreas = (CAT_TYPES[curDashCat] || []).filter(t => GRADE_AREAS.includes(t));
      } else {
        visibleAreas = GRADE_AREAS;
      }
      const showOverall = (k === 'all') && (!curDashCat || curDashCat === 'all');
      if (!visibleAreas.length) {
        board.style.display = 'none';
      } else {
        board.style.display = '';
        renderLeaderboard(visibleAreas, showOverall);
      }
    }
  }
}

// ── 브랜드 리스크 등급 순위판 ──────────────────────
const GRADE_AREAS   = ['불법파견','표시광고','가맹','IP','노무','영업비밀','부실채권'];
const GRADE_SCORE   = { A:10, B:8, C:5, D:3, F:0 };
const RANK_EXCLUDE  = new Set(['광주ck','기흥ck','주안ck','CX팀','상권','본부']);

// 등급 + 위반 건수를 함께 반환
function calcGradeDetail(type, brand, ym) {
  const recs = records.filter(r => r.brand === brand && r.type === type && r.date.startsWith(ym));
  if (type === '부실채권') {
    const over2 = recs.filter(r => {
      if (r.subtype !== '2개월 초과 미입금') return false;
      const amt = r.bc_amount != null ? Number(r.bc_amount) : (parseBcAmt(r) ?? Infinity);
      return amt <= 100000000;
    });
    if (over2.length) return { grade:'D', cnt: over2.reduce((s,r) => s+r.count, 0), mon: 0 };
    const cnt = recs.filter(r => r.subtype === '미입금').reduce((s, r) => s + r.count, 0);
    const mon = recs.filter(r => r.status === '모니터링').reduce((s, r) => s + r.count, 0);
    const grade = cnt <= 3 ? 'A' : cnt <= 5 ? 'B' : cnt <= 10 ? 'C' : 'D';
    return { grade, cnt, mon };
  }
  const mon = recs.filter(r => r.status === '모니터링').reduce((s, r) => s + r.count, 0);
  const cnt = recs.filter(r => r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
  const grade = cnt <= 3 ? 'A' : cnt <= 6 ? 'B' : cnt <= 9 ? 'C' : 'D';
  return { grade, cnt, mon };
}

// 하위 호환 (다른 곳에서 사용 가능)
function calcGrade(type, brand, ym) { return calcGradeDetail(type, brand, ym).grade; }

function renderLeaderboard(visibleAreas, showOverall) {
  visibleAreas = visibleAreas || GRADE_AREAS;
  if (showOverall === undefined) showOverall = true;
  const board = document.getElementById('gradeBoard');
  if (!board) return;

  const rd  = refDate();
  const yr  = rd.getFullYear();
  const mo  = rd.getMonth() + 1;
  const ym  = `${yr}-${String(mo).padStart(2,'0')}`;
  const lbl = `${yr}년 ${mo}월 기준`;

  const ymEl = document.getElementById('gradeYm');
  if (ymEl) ymEl.textContent = lbl;

  // 헤더 동적 갱신
  const headTr = document.getElementById('gradeHead');
  if (headTr) {
    headTr.innerHTML =
      `<th class="gt-rank">순위</th>` +
      `<th class="gt-brand">브랜드</th>` +
      (showOverall ? `<th class="gt-overall">종합등급</th><th class="gt-sep"></th>` : '') +
      visibleAreas.map(t => `<th class="gt-area">${esc(t)}</th>`).join('');
  }

  const brands = (isAdmin() ? BRANDS : userBrands().filter(b => BRANDS.includes(b)))
    .filter(b => !RANK_EXCLUDE.has(b));

  const ranked = brands.map(brand => {
    const details = {};
    let total = 0;
    GRADE_AREAS.forEach(type => {
      const d = calcGradeDetail(type, brand, ym);
      details[type] = d;
      total += GRADE_SCORE[d.grade] ?? 0;
    });
    const avg = total / GRADE_AREAS.length;
    const overallGrade = avg >= 9 ? 'A' : avg >= 7 ? 'B' : avg >= 4 ? 'C' : avg >= 1 ? 'D' : 'F';
    return { brand, details, total, overallGrade };
  }).sort((a, b) => b.total - a.total || a.brand.localeCompare(b.brand));

  const tbody = document.getElementById('gradeRows');
  if (!tbody) return;
  tbody.innerHTML = '';

  ranked.forEach(({ brand, details, overallGrade }, idx) => {
    const rank = idx + 1;
    const pc   = rank === 1 ? 'p1' : rank === 2 ? 'p2' : rank === 3 ? 'p3' : '';
    const tr   = document.createElement('tr');
    tr.innerHTML =
      `<td><span class="gp ${pc}">${rank}</span></td>` +
      `<td class="gt-brand">${esc(brand)}</td>` +
      (showOverall ? `<td class="gt-overall"><span class="gc ${overallGrade}">${overallGrade}</span></td><td class="gt-sep"></td>` : '') +
      visibleAreas.map(t =>
        `<td class="gt-area"><div class="gc-cell"><span class="gc ${details[t].grade}">${details[t].grade}</span>` +
        `<span class="gc-cnt">${details[t].cnt}/<span class="gc-mon">${details[t].cnt + details[t].mon}</span></span></div></td>`
      ).join('');
    tbody.appendChild(tr);
    setTimeout(() => tr.classList.add('gb-in'), 40 + idx * 500);
  });

  renderJngSection(ym, lbl);
  scheduleRankAnim();
}

function renderJngSection(ym, lbl) {
  const jngYm = document.getElementById('jngYm');
  if (jngYm) jngYm.textContent = lbl;

  const brands  = isAdmin() ? BRANDS : userBrands().filter(b => BRANDS.includes(b));
  const jngRecs = records.filter(r =>
    r.type === '징계' && r.date.startsWith(ym) && brands.includes(r.brand)
  );

  const wrap = document.getElementById('jngCards');
  if (!wrap) return;

  if (!jngRecs.length) {
    wrap.innerHTML = '<span class="jng-empty">해당 월 징계 현황 없음</span>';
    return;
  }

  const cards = jngRecs.map(r => {
    let name = r.jg_name || '', sent = r.jg_sent || '';
    if (!name && !sent) {
      const p = parseJgRecord(r);
      if (p) { name = p.name; sent = p.sent; }
    }
    if (!name && !sent) return '';
    return `<div class="jng-card">` +
      `<div class="jng-card-brand">${esc(r.brand)}</div>` +
      `<div class="jng-card-name">${esc(name) || '-'}</div>` +
      `<div class="jng-card-sent">${esc(sent) || '-'}</div>` +
      `</div>`;
  }).filter(Boolean);

  if (!cards.length) {
    wrap.innerHTML = '<span class="jng-empty">성명·양형 정보가 입력되지 않은 건만 있습니다</span>';
    return;
  }
  wrap.innerHTML = cards.join('');
  setTimeout(() => {
    wrap.querySelectorAll('.jng-card').forEach((el, i) =>
      setTimeout(() => el.classList.add('jc-in'), i * 60)
    );
  }, 80);
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

function renderHeatmap() {
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

  // 기준 월로 스코프된 records
  const ym = refYm();
  const mr = records.filter(r => r.date && r.date.startsWith(ym));

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
      plugins: { legend: { display: false } },
      scales: {
        x: { grid:{color:'rgba(0,0,0,0.03)'}, ticks:{font:{size:10},color:'#94a3b8',autoSkip:false,maxRotation:0} },
        y: { grid:{color:'rgba(0,0,0,0.03)'}, ticks:{font:{size:10},color:'#94a3b8'}, beginAtZero:true }
      }
    }
  });
}

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
      options: {
        responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{legend:{display:false}},
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
    <td><span class="st ${sc(r.status)}">${esc(statLbl(r.status, r.type))}</span>${ageBadge}</td>
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

function gotoPage(p) { recentPage = p; renderRecent(getFRM(curFilter)); }

function setRecentStatus(btn, st) {
  document.querySelectorAll('.rs-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  recentStatus = st;
  recentPage = 0;
  renderRecent(getFRM(curFilter));
}

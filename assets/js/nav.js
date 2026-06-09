// ── 상단바 타이틀 / 모바일 사이드바 드로어 ──────────────
const TAB_TITLES = { dashboard: '대시보드', input: '데이터 입력', ai: 'AI 분석', admin: '관리자' };
function setTopbarTitle(pg) {
  const el = document.getElementById('topbarBadge');
  if (el && TAB_TITLES[pg]) el.textContent = TAB_TITLES[pg];
}
// 모바일: 햄버거로 사이드바 슬라이드 인/아웃
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sideOverlay');
  const open = sb && sb.classList.toggle('open');
  if (ov) ov.classList.toggle('show', !!open);
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sideOverlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('show');
}

// ── 탭 / 필터 / 영역 전환 ────────────────────────────
function switchTab(pg, btn) {
  if (!user) { showLogin(); return; }
  // 데이터 입력 탭: admin 전용 / 관리자 탭: OWNER_IDS 최상위 관리자 전용
  if (pg === 'input' && !isAdmin()) { toast('권한이 없습니다.'); return; }
  if (pg === 'admin' && !isOwner()) { toast('권한이 없습니다.'); return; }

  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  document.getElementById('page-' + pg).classList.add('on');
  btn.classList.add('on');
  setTopbarTitle(pg);
  closeSidebar();

  if (pg === 'dashboard') loadData();
  if (pg === 'input')     renderInputPg();
  if (pg === 'admin')     renderAdmin();
  if (pg === 'ai') {
    renderBrandPicker();
    document.getElementById('aiEmpty').style.display = '';
    document.getElementById('aiResult').style.display = 'none';
  }
}

// 대시보드 영역 필터 — 사이드바 '리스크 영역 현황' 항목 / 대시보드 영역 드롭다운 공용
// (btn 인자는 레거시 호환용으로 무시하고, key 기준으로 동기화한다)
function setFilter(btn, key) {
  if (key !== 'all' && !canSeeType(key)) {
    toast('권한이 없습니다.');
    if (typeof syncAreaControls === 'function') syncAreaControls();  // 드롭다운 선택값 원복
    return;
  }
  // 다른 페이지에서 영역을 고르면 대시보드로 전환
  const dashEl = document.getElementById('page-dashboard');
  if (dashEl && !dashEl.classList.contains('on')) {
    document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
    document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
    dashEl.classList.add('on');
    document.getElementById('tabDashboard').classList.add('on');
    setTopbarTitle('dashboard');
  }
  curFilter = key;
  recentPage = 0;
  closeSidebar();
  renderDash(key);   // renderDash 내부에서 syncAreaControls()로 사이드바·드롭다운 활성화 동기화
}

// 데이터 입력 페이지 영역 탭
function setInputType(btn, type) {
  // 영역 선택: 드롭다운(btn=null) 또는 레거시 탭(btn=요소) 겸용
  if (btn && btn.classList) {
    document.querySelectorAll('.tt').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
  }
  curType = type;
  const ddl = document.getElementById('inputTypeSel');
  if (ddl && ddl.value !== type) ddl.value = type;
  document.getElementById('f-type').value = type;
  document.getElementById('areaBadge').textContent = type;
  document.getElementById('listBadge').textContent = type;
  // 안전 전용 일괄 업로드 폼은 '안전' 영역에서만 노출
  const safeBlock = document.getElementById('xlSafeBlock');
  if (safeBlock) safeBlock.style.display = (type === '안전') ? '' : 'none';

  const sel = document.getElementById('f-subtype');
  const s = SUB[type];
  if (!s || !s.length) {
    sel.innerHTML = '<option value="">해당 없음</option>';
  } else {
    sel.innerHTML = '<option value="">선택하세요</option>' + s.map(x => `<option>${x}</option>`).join('');
  }
  // 상태 select: 영역별 표시 라벨(클레임은 접수/처리중/처리완료) 적용, 저장값은 STATS 그대로
  const stSel = document.getElementById('f-status');
  if (stSel) {
    const cur = stSel.value || '모니터링';
    stSel.innerHTML = STATS.map(s => `<option value="${s}">${statLbl(s, type)}</option>`).join('');
    stSel.value = cur;
  }
  // 영역 전환 시 데이터 목록 필터는 '전체'로 초기화, 다중 선택도 해제
  inpSub = 'all'; inpBrand = 'all'; inpStat = 'all';
  inpSelected.clear();
  renderInputTable();
}

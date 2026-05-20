// ── 탭 / 필터 / 영역 전환 ────────────────────────────
function switchTab(pg, btn) {
  if (!user) { showLogin(); return; }
  // 데이터 입력 / 관리자 탭은 admin 전용
  if ((pg === 'input' || pg === 'admin') && !isAdmin()) {
    toast('권한이 없습니다.');
    return;
  }

  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  document.getElementById('page-' + pg).classList.add('on');
  btn.classList.add('on');

  if (pg === 'dashboard') loadData();
  if (pg === 'input')     renderInputPg();
  if (pg === 'admin')     renderAdmin();
  if (pg === 'ai') {
    renderBrandPicker();
    document.getElementById('aiEmpty').style.display = '';
    document.getElementById('aiResult').style.display = 'none';
  }
}

// 대시보드 영역 필터
function setFilter(btn, key) {
  if (key !== 'all' && !canSeeType(key)) { toast('권한이 없습니다.'); return; }
  document.querySelectorAll('.fb').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  curFilter = key;
  recentPage = 0;
  renderDash(key);
}

// 데이터 입력 페이지 영역 탭
function setInputType(btn, type) {
  document.querySelectorAll('.tt').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  curType = type;
  document.getElementById('f-type').value = type;
  document.getElementById('areaBadge').textContent = type;
  document.getElementById('listBadge').textContent = type;

  const sel = document.getElementById('f-subtype');
  const s = SUB[type];
  if (!s || !s.length) {
    sel.innerHTML = '<option value="">해당 없음</option>';
  } else {
    sel.innerHTML = '<option value="">선택하세요</option>' + s.map(x => `<option>${x}</option>`).join('');
  }
  // 영역 전환 시 데이터 목록 필터는 '전체'로 초기화
  inpSub = 'all'; inpBrand = 'all';
  renderInputTable();
}

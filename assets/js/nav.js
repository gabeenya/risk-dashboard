// ── 탭 / 필터 / 영역 전환 ────────────────────────────
function switchTab(pg, btn) {
  // 데이터 입력은 로그인 필수 — 보고서 생성과 동일하게 toast + 로그인 모달만 띄우고 탭 전환은 막음
  if (pg === 'input' && !user) {
    toast('로그인 후 이용해 주세요.');
    showLogin();
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
  renderInputTable();
}

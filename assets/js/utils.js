// ── 작은 헬퍼 ────────────────────────────────────────
// hp(pw): djb2 변형 해시. 암호학적 해시가 아니므로 데모용.
function hp(pw) {
  let h = 0;
  for (let i = 0; i < pw.length; i++) {
    h = ((h << 5) - h) + pw.charCodeAt(i);
    h |= 0;
  }
  return h.toString(36);
}

// 오늘 날짜 (YYYY-MM-DD)
function td() { return new Date().toISOString().split('T')[0]; }

// 상태 → CSS 클래스
function sc(s) {
  return s === '완료' ? 's-done'
       : s === '위반(처리중)' ? 's-ing'
       : 's-mon';
}

// 동기화 배지 문구/색 갱신
function setSy(t, c, b) {
  const el = document.getElementById('syncBadge');
  el.textContent = t;
  el.style.color = c;
  el.style.background = b;
}

// 토스트 (오른쪽 하단)
function toast(m) {
  const t = document.getElementById('toast');
  t.textContent = m;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// 폼 에러 텍스트 표시/숨김
function err(id, m) {
  const el = document.getElementById(id);
  el.textContent = m;
  el.classList.toggle('show', !!m);
}

// 로고 클릭 → 대시보드 + 전체 필터로 복귀
function goHome() {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  document.getElementById('page-dashboard').classList.add('on');
  document.getElementById('tabDashboard').classList.add('on');
  document.querySelectorAll('.fb').forEach(b => b.classList.remove('on'));
  document.querySelector('.fb').classList.add('on');
  curFilter = 'all';
  loadData();
}

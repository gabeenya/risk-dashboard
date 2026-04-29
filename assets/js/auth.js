// ── 인증 / 로그인 ────────────────────────────────────
async function loadUsers() {
  try { users = await sbGet('users'); }
  catch(e) { users = []; }
}

// 비로그인 시: 헤더 우측은 숨기고 #page-login만 단독으로 보임
function showLogin() {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  document.getElementById('page-login').classList.add('on');
  err('loginErr', '');
  setTimeout(() => { const f = document.getElementById('li-id'); if (f) f.focus(); }, 30);
}

// 로그인 성공 후: 대시보드 페이지로 전환
function showDashboard() {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  document.getElementById('page-dashboard').classList.add('on');
  document.getElementById('tabDashboard').classList.add('on');
}

async function doLogin() {
  const id = document.getElementById('li-id').value.trim();
  const pw = document.getElementById('li-pw').value;
  if (!id || !pw) { err('loginErr', '아이디와 비밀번호를 입력하세요.'); return; }

  await loadUsers();
  const u = users.find(u => u.id === id && u.pw === hp(pw));
  if (!u) { err('loginErr', '아이디 또는 비밀번호가 올바르지 않습니다.'); return; }

  user = u;
  document.getElementById('li-id').value = '';
  document.getElementById('li-pw').value = '';
  err('loginErr', '');
  applyUser();
  showDashboard();
  toast(`${u.name}님, 환영합니다!`);
  await loadData();
  renderInputPg();
}

function logout() {
  user = null;
  records = [];   // 다른 사용자 데이터가 잔상으로 남지 않도록
  applyUser();
  renderInputPg();
  toast('로그아웃 되었습니다.');
  showLogin();    // 초기 로그인 페이지로 복귀
}

// 권한 헬퍼
function isAdmin()         { return !!user && user.role === 'admin'; }
function userBrands()      { return (user && Array.isArray(user.brands)) ? user.brands : []; }
function canSeeBrand(b)    { return isAdmin() || userBrands().includes(b); }
function requireAdmin(msg) {
  if (isAdmin()) return true;
  toast(msg || '권한이 없습니다.');
  return false;
}

// 현재 user에 따라 헤더 우측 영역 / 탭 / 보고서 버튼 표시 토글
// 비로그인 시: 헤더 우측 전체 숨김 (로고만 노출)
function applyUser() {
  const hdr = document.getElementById('hdRight');
  const c = document.getElementById('userChip');
  const inputTab = document.getElementById('tabInput');
  const adminTab = document.getElementById('adminTabBtn');
  const pptBtn   = document.getElementById('pptHeaderBtn');

  if (user) {
    if (hdr) hdr.style.display = '';
    c.classList.add('show');
    document.getElementById('userChipName').textContent =
      user.name + (isAdmin() ? '' : ` · ${userBrands().join(', ') || '브랜드 미지정'}`);
    // 입력 탭 / 보고서 버튼은 비-admin에게도 노출 — 클릭 시 nav.js·ppt.js에서 권한 토스트로 차단
    // 관리자 탭만 admin 전용 (관리자 화면 자체가 admin 영역이라 노출 의미가 없음)
    inputTab.style.display = '';
    pptBtn.style.display   = '';
    adminTab.style.display = isAdmin() ? '' : 'none';
  } else {
    if (hdr) hdr.style.display = 'none';
    c.classList.remove('show');
  }
}

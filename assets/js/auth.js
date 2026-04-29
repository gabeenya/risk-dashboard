// ── 인증 / 로그인 ────────────────────────────────────
async function loadUsers() {
  try { users = await sbGet('users'); }
  catch(e) { users = []; }
}

// 로그인 모달은 비로그인 시 항상 열려있고, 로그인 후에만 닫힘 (전체 화면 게이트)
function showLogin() {
  document.getElementById('loginModal').classList.remove('hide');
  document.getElementById('li-id').focus();
}

function hideLogin() {
  document.getElementById('loginModal').classList.add('hide');
  err('loginErr', '');
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
  hideLogin();
  applyUser();
  toast(`${u.name}님, 환영합니다!`);
  await loadData();
  renderInputPg();
}

function logout() {
  user = null;
  applyUser();
  records = [];   // 다른 사용자 데이터가 잔상으로 남지 않도록
  renderInputPg();
  toast('로그아웃 되었습니다.');
  showLogin();
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

// 현재 user에 따라 헤더 chip / 탭 / 보고서 버튼 표시 토글
function applyUser() {
  const c = document.getElementById('userChip');
  const inputTab = document.getElementById('tabInput');
  const adminTab = document.getElementById('adminTabBtn');
  const pptBtn   = document.getElementById('pptHeaderBtn');

  if (user) {
    c.classList.add('show');
    document.getElementById('userChipName').textContent =
      user.name + (isAdmin() ? '' : ` · ${userBrands().join(', ') || '브랜드 미지정'}`);
    // 입력 탭 / 관리자 탭 / 보고서 버튼은 admin만 노출
    inputTab.style.display = isAdmin() ? '' : 'none';
    adminTab.style.display = isAdmin() ? '' : 'none';
    pptBtn.style.display   = isAdmin() ? '' : 'none';
  } else {
    c.classList.remove('show');
    inputTab.style.display = 'none';
    adminTab.style.display = 'none';
    pptBtn.style.display   = 'none';
  }
}

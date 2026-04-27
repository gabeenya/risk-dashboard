// ── 인증 / 로그인 ────────────────────────────────────
async function loadUsers() {
  try { users = await sbGet('users'); }
  catch(e) { users = []; }
}

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
  hideLogin();
  applyUser();
  toast(`${u.name}님, 환영합니다!`);
  renderInputPg();
}

function logout() {
  user = null;
  applyUser();
  renderInputPg();
  toast('로그아웃 되었습니다.');
}

// 현재 user에 따라 헤더 chip / 관리자 탭 표시 토글
function applyUser() {
  const c = document.getElementById('userChip');
  if (user) {
    c.classList.add('show');
    document.getElementById('userChipName').textContent = user.name;
    document.getElementById('adminTabBtn').style.display = user.role === 'admin' ? '' : 'none';
  } else {
    c.classList.remove('show');
    document.getElementById('adminTabBtn').style.display = 'none';
  }
}

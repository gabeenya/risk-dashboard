// ── 인증 / 로그인 ────────────────────────────────────
async function loadUsers() {
  try { users = await sbGet('users'); }
  catch(e) { users = []; }
}

// ── 세션 유지 / 자동 로그아웃 ─────────────────────────
// 세션은 sessionStorage에 보관합니다 → 창(탭)을 닫으면 세션이 사라져 자동 로그아웃되고,
// 같은 탭에서의 새로고침은 로그인이 유지됩니다. 창이 열려 있는 동안에도 보안을 위해
// 로그인 후 3시간이 지나면 자동 로그아웃되며, 만료 5분 전 팝업으로 경고합니다.
//  · '세션 연장' → 3시간 재설정 / 무응답 → 만료 시 자동 로그아웃
//  · 비밀번호는 저장하지 않고 사용자 id와 만료시각(exp)만 보관합니다.
const SESSION_KEY  = 'risk_session';
const SESSION_MS   = 3 * 60 * 60 * 1000;   // 세션 유효 시간: 3시간
const SESS_WARN_MS = 5 * 60 * 1000;        // 만료 5분 전 경고
let sessTimer  = null;   // 만료/경고 점검 인터벌
let sessWarned = false;  // 경고 모달 노출 여부(중복 방지)

function saveSession() {
  if (!user) return;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, exp: Date.now() + SESSION_MS })); }
  catch (e) {}
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
}
function readSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
  catch (e) { return null; }
}

// init()에서 호출 — 유효한 세션이 있으면 자동 로그인 후 대시보드로 진입
async function restoreSession() {
  const s = readSession();
  if (!s || !s.id || !s.exp || Date.now() >= s.exp) { clearSession(); return false; }
  const u = users.find(x => x.id === s.id);
  if (!u || u.status === 'pending') { clearSession(); return false; }
  user = u;
  applyUser();
  showDashboard();
  startSessionTimer();
  await loadData();
  renderInputPg();
  return true;
}

function startSessionTimer() {
  stopSessionTimer();
  sessWarned = false;
  sessTimer = setInterval(checkSession, 1000); // 1초마다 점검(만료 카운트다운 표시용)
}
function stopSessionTimer() {
  if (sessTimer) { clearInterval(sessTimer); sessTimer = null; }
  hideSessionWarn();
}
function checkSession() {
  const s = readSession();
  if (!s || !s.exp) return;
  const left = s.exp - Date.now();
  if (left <= 0) { autoLogout(); return; }
  if (left <= SESS_WARN_MS && !sessWarned) showSessionWarn();
  if (sessWarned) updateSessionWarnCountdown(left);
}

function autoLogout() {
  stopSessionTimer();
  clearSession();
  user = null;
  records = [];
  applyUser();
  renderInputPg();
  showLogin();
  toast('보안을 위해 자동 로그아웃되었습니다. 다시 로그인해 주세요.');
}

// 만료 경고에서 '세션 연장' — 3시간 재설정
function extendSession() {
  if (!user) return;
  saveSession();
  sessWarned = false;
  hideSessionWarn();
  toast('세션이 연장되었습니다. (3시간)');
}

function showSessionWarn() {
  sessWarned = true;
  const m = document.getElementById('sessionWarnModal');
  if (m) m.classList.remove('hide');
}
function hideSessionWarn() {
  const m = document.getElementById('sessionWarnModal');
  if (m) m.classList.add('hide');
}
function updateSessionWarnCountdown(leftMs) {
  const el = document.getElementById('sessWarnCount');
  if (!el) return;
  const sec = Math.max(0, Math.floor(leftMs / 1000));
  el.textContent = `${Math.floor(sec / 60)}분 ${String(sec % 60).padStart(2, '0')}초`;
}

// 비로그인 시: 헤더 우측은 숨기고 #page-login만 단독으로 보임
function showLogin() {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  document.getElementById('page-login').classList.add('on');
  err('loginErr', '');
  showLoginCard();
  setTimeout(() => { const f = document.getElementById('li-id'); if (f) f.focus(); }, 30);
}

// 로그인 ↔ 가입 신청 카드 토글
function showLoginCard() {
  document.getElementById('loginCard').classList.remove('hide');
  document.getElementById('signupCard').classList.add('hide');
  err('signupErr', '');
}
function showSignupCard() {
  document.getElementById('loginCard').classList.add('hide');
  document.getElementById('signupCard').classList.remove('hide');
  renderSignupBrandPicker();
  err('loginErr', '');
  setTimeout(() => { const f = document.getElementById('su-name'); if (f) f.focus(); }, 30);
}

// 가입 신청 폼의 브랜드 picker 렌더
function renderSignupBrandPicker() {
  const grid = document.getElementById('suBrandGrid');
  if (!grid || grid.dataset.rendered) return;
  grid.innerHTML = BRANDS.map(b =>
    `<label class="brand-pick-opt"><input type="checkbox" class="su-brand-cb" value="${b}"> ${b}</label>`
  ).join('');
  grid.dataset.rendered = '1';
}
function suBrandAll(checked) {
  document.querySelectorAll('.su-brand-cb').forEach(cb => { cb.checked = checked; });
}

// 가입 신청 — users 테이블에 status='pending'으로 INSERT
async function doSignup() {
  const n  = document.getElementById('su-name').value.trim();
  const id = document.getElementById('su-id').value.trim();
  const pw = document.getElementById('su-pw').value;
  const brands = Array.from(document.querySelectorAll('.su-brand-cb:checked')).map(cb => cb.value);

  if (!n || !id || !pw) { err('signupErr', '이름·아이디·비밀번호를 모두 입력하세요.'); return; }
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) { err('signupErr', '아이디는 영문/숫자/.-_만 사용할 수 있습니다.'); return; }
  if (pw.length < 4) { err('signupErr', '비밀번호는 4자 이상이어야 합니다.'); return; }
  if (!brands.length) { err('signupErr', '희망 접근 브랜드를 1개 이상 선택하세요.'); return; }

  await loadUsers();
  if (users.find(u => u.id === id)) { err('signupErr', '이미 사용 중이거나 신청 중인 아이디입니다.'); return; }

  const ok = await sbIns('users', {
    id, name: n, pw: hp(pw), role: 'user', joined: td(), brands, status: 'pending'
  });
  if (!ok) { err('signupErr', '신청 실패 — ' + (window.__sbLastErr || '잠시 후 다시 시도해 주세요.')); return; }

  document.getElementById('su-name').value = '';
  document.getElementById('su-id').value   = '';
  document.getElementById('su-pw').value   = '';
  suBrandAll(false);
  err('signupErr', '');
  toast('가입 신청 완료 — 관리자 승인 후 로그인 가능합니다.');
  showLoginCard();
}

// 로그인 성공 후: 대시보드 페이지로 전환
function showDashboard() {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  document.getElementById('page-dashboard').classList.add('on');
  document.getElementById('tabDashboard').classList.add('on');
  setTopbarTitle('dashboard');
}

async function doLogin() {
  const id = document.getElementById('li-id').value.trim();
  const pw = document.getElementById('li-pw').value;
  if (!id || !pw) { err('loginErr', '아이디와 비밀번호를 입력하세요.'); return; }

  await loadUsers();
  const u = users.find(u => u.id === id && u.pw === hp(pw));
  if (!u) { err('loginErr', '아이디 또는 비밀번호가 올바르지 않습니다.'); return; }
  if (u.status === 'pending') { err('loginErr', '관리자 승인 대기 중인 계정입니다.'); return; }

  user = u;
  document.getElementById('li-id').value = '';
  document.getElementById('li-pw').value = '';
  err('loginErr', '');
  applyUser();
  showDashboard();
  saveSession();
  startSessionTimer();
  toast(`${u.name}님, 환영합니다!`);
  await loadData();
  renderInputPg();
}

// ── 비밀번호 변경 (로그인 사용자 본인만) ──────────────
function openChangePw() {
  if (!user) { showLogin(); return; }
  document.getElementById('cp-cur').value  = '';
  document.getElementById('cp-new').value  = '';
  document.getElementById('cp-new2').value = '';
  err('changePwErr', '');
  document.getElementById('changePwModal').classList.remove('hide');
  setTimeout(() => { const f = document.getElementById('cp-cur'); if (f) f.focus(); }, 30);
}
function closeChangePw() {
  document.getElementById('changePwModal').classList.add('hide');
}
async function doChangePw() {
  if (!user) { showLogin(); return; }
  const cur  = document.getElementById('cp-cur').value;
  const next = document.getElementById('cp-new').value;
  const conf = document.getElementById('cp-new2').value;
  if (!cur || !next || !conf) { err('changePwErr', '모든 항목을 입력하세요.'); return; }
  if (user.pw !== hp(cur))    { err('changePwErr', '현재 비밀번호가 올바르지 않습니다.'); return; }
  if (next.length < 4)        { err('changePwErr', '새 비밀번호는 4자 이상이어야 합니다.'); return; }
  if (next !== conf)          { err('changePwErr', '새 비밀번호 확인이 일치하지 않습니다.'); return; }
  if (next === cur)           { err('changePwErr', '현재 비밀번호와 동일합니다.'); return; }

  const newHash = hp(next);
  const ok = await sbUpd('users', user.id, { pw: newHash });
  if (!ok) { err('changePwErr', '변경 실패 — ' + (window.__sbLastErr || '잠시 후 다시 시도해 주세요.')); return; }
  user.pw = newHash;
  closeChangePw();
  toast('비밀번호가 변경되었습니다.');
}

function logout() {
  stopSessionTimer();
  clearSession();
  user = null;
  records = [];   // 다른 사용자 데이터가 잔상으로 남지 않도록
  applyUser();
  renderInputPg();
  toast('로그아웃 되었습니다.');
  showLogin();    // 초기 로그인 페이지로 복귀
}

// 권한 헬퍼
function isAdmin()         { return !!user && user.role === 'admin'; }
// 최상위 관리자 — 관리자 페이지(사용자/임계치 관리)는 이 사람만 접근 가능
function isOwner()         { return !!user && Array.isArray(OWNER_IDS) && OWNER_IDS.includes(user.id); }
function userBrands()      { return (user && Array.isArray(user.brands)) ? user.brands : []; }
function userTypes()       { return (user && Array.isArray(user.types))  ? user.types  : []; }
function canSeeBrand(b)    { return isAdmin() || userBrands().includes(b); }
function canSeeType(t)     { return isAdmin() || userTypes().includes(t); }
function requireAdmin(msg) {
  if (isAdmin()) return true;
  toast(msg || '권한이 없습니다.');
  return false;
}

// 현재 user에 따라 사이드바(사용자 칩·탭) / 상단바 표시 토글
// 비로그인 시: .app 에 'logged-out' 부여 → 사이드바·상단바 숨기고 로그인 화면만 노출
function applyUser() {
  const app = document.querySelector('.app');
  const c = document.getElementById('userChip');
  const inputTab = document.getElementById('tabInput');
  const adminTab = document.getElementById('adminTabBtn');
  const pptBtn   = document.getElementById('pptHeaderBtn');

  if (user) {
    if (app) app.classList.remove('logged-out');
    c.classList.add('show');
    const av = document.getElementById('userChipAvatar');
    const nm = document.getElementById('userChipName');
    const mt = document.getElementById('userChipMeta');
    if (av) av.textContent = (user.name || '?').trim().charAt(0) || 'U';
    if (nm) nm.textContent = user.name;
    if (mt) mt.textContent = isAdmin() ? '관리자' : (userBrands().join(', ') || '브랜드 미지정');
    // 입력 탭 / 보고서 버튼은 비-admin에게도 노출 — 클릭 시 nav.js·ppt.js에서 권한 토스트로 차단
    // 관리자 탭은 OWNER_IDS에 등록된 최상위 관리자에게만 노출 (다른 admin은 접근 불가)
    inputTab.style.display = '';
    pptBtn.style.display   = '';
    adminTab.style.display = isOwner() ? '' : 'none';
  } else {
    if (app) app.classList.add('logged-out');
    c.classList.remove('show');
  }
}

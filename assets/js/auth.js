// ── 인증 / 로그인 ────────────────────────────────────
// users 테이블 전체 조회는 이제 admin.js의 loadAdminUsers()(admin-users Edge Function 경유)
// 뿐이다 — anon key로 users를 직접 SELECT하던 예전 loadUsers()는 RLS 잠금과 함께 제거됨.

// ── 세션 유지 / 자동 로그아웃 ─────────────────────────
// 세션은 sessionStorage에 보관합니다 → 창(탭)을 닫으면 세션이 사라져 자동 로그아웃되고,
// 같은 탭에서의 새로고침은 로그인이 유지됩니다. 창이 열려 있는 동안에도 보안을 위해
// 로그인 후 3시간이 지나면 자동 로그아웃되며, 만료 5분 전 팝업으로 경고합니다.
//  · '세션 연장' → 3시간 재설정 / 무응답 → 만료 시 자동 로그아웃
//  · id+만료시각을 그냥 저장하던 예전 방식은 브라우저 콘솔에서 값만 써넣으면 아무 계정으로나
//    로그인되는 문제가 있었음. 지금은 supabase/functions/auth-login이 서버 시크릿으로 서명한
//    토큰을 저장하고, 새로고침 시 매번 서버에 검증을 맡긴다(위조 불가) — auth-login 참고.
const SESSION_KEY  = 'risk_session';
const SESS_WARN_MS = 5 * 60 * 1000;        // 만료 5분 전 경고
let sessTimer  = null;   // 만료/경고 점검 인터벌
let sessWarned = false;  // 경고 모달 노출 여부(중복 방지)

// auth-login Edge Function 호출 헬퍼
const AUTH_FN_URL = `${SB_URL}/functions/v1/auth-login`;
async function authCall(action, payload) {
  try {
    const r = await fetch(AUTH_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      body: JSON.stringify({ action, ...payload }),
    });
    return await r.json();
  } catch (e) { return { ok: false, error: '네트워크 오류가 발생했습니다.' }; }
}

function saveSession(token, exp) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, exp })); }
  catch (e) {}
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
}
function readSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
  catch (e) { return null; }
}

// init()에서 호출 — 유효한 세션 토큰이 있으면 서버에 검증을 맡긴 뒤 대시보드로 진입
async function restoreSession() {
  const s = readSession();
  if (!s || !s.token || !s.exp || Date.now() >= s.exp) { clearSession(); return false; }
  const res = await authCall('verify', { token: s.token });
  if (!res.ok || !res.profile) { clearSession(); return false; }
  user = res.profile;
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
  updateSessCountdown(left);
}
function updateSessCountdown(ms) {
  const el  = document.getElementById('sessCountdown');
  const bar = document.getElementById('sessCountdownBar');
  if (!el) return;
  if (bar) bar.style.display = user ? '' : 'none';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sc = Math.floor((ms % 60000) / 1000);
  el.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
  el.style.color = ms <= SESS_WARN_MS ? '#dc2626' : '#64748b';
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

// 만료 경고에서 '세션 연장' — 서버에서 토큰을 새로 발급받아 3시간 재설정
async function extendSession() {
  if (!user) return;
  const s = readSession();
  if (!s || !s.token) return;
  const res = await authCall('refresh', { token: s.token });
  if (!res.ok) { toast('세션 연장 실패 — 다시 로그인해 주세요.'); autoLogout(); return; }
  saveSession(res.token, res.exp);
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

  // users 테이블은 더 이상 anon SELECT가 열려있지 않아 사전 중복 체크 대신
  // INSERT 실패(기본키 충돌)로 중복 여부를 판단한다 — RLS: 20260821_lock_down_users.sql 참고.
  const ok = await sbIns('users', {
    id, name: n, pw: await strongHash(pw), role: 'user', joined: td(), brands, status: 'pending'
  });
  if (!ok) {
    const dup = /duplicate key|already exists/i.test(window.__sbLastErr || '');
    err('signupErr', dup ? '이미 사용 중이거나 신청 중인 아이디입니다.' : '신청 실패 — ' + (window.__sbLastErr || '잠시 후 다시 시도해 주세요.'));
    return;
  }

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

  const res = await authCall('login', { id, pw });
  if (!res.ok) { err('loginErr', res.error || '아이디 또는 비밀번호가 올바르지 않습니다.'); return; }

  user = res.profile;
  document.getElementById('li-id').value = '';
  document.getElementById('li-pw').value = '';
  err('loginErr', '');
  applyUser();
  showDashboard();
  saveSession(res.token, res.exp);
  startSessionTimer();
  toast(`${user.name}님, 환영합니다!`);
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
  if (next.length < 4)        { err('changePwErr', '새 비밀번호는 4자 이상이어야 합니다.'); return; }
  if (next !== conf)          { err('changePwErr', '새 비밀번호 확인이 일치하지 않습니다.'); return; }
  if (next === cur)           { err('changePwErr', '현재 비밀번호와 동일합니다.'); return; }

  const s = readSession();
  const res = await authCall('changePassword', { token: s && s.token, curPw: cur, newPw: next });
  if (!res.ok) { err('changePwErr', res.error || '변경 실패 — 잠시 후 다시 시도해 주세요.'); return; }
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
    const bar = document.getElementById('sessCountdownBar');
    if (bar) bar.style.display = 'none';
  }
}

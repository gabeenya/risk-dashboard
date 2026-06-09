// ── 부트스트랩 ───────────────────────────────────────
async function init() {
  await loadUsers();

  // 관리자 계정은 Supabase 콘솔에서 수동 시드합니다 (자동 생성 X).
  // users 테이블이 비어 있으면 아무도 로그인 못 하므로, 초기 1회는 콘솔에서
  // id='admin', role='admin', pw=강력한 해시값으로 직접 INSERT 하세요.

  applyUser();

  // 폼 기본값은 로그인과 무관하게 미리 세팅해도 무해 (admin이 들어와야만 보이는 영역)
  document.getElementById('f-date').value = new Date().toISOString().split('T')[0];
  setInputType(document.querySelector('.tt.on'), '불법파견');
  initAIStyle();

  // 새로고침 시 세션 복원(로그인 후 3시간 이내) — 유효한 세션이 없으면 로그인 화면
  const restored = await restoreSession();
  if (!restored) showLogin();
}

// 모든 스크립트가 defer로 로드되므로 DOMContentLoaded 시점에 실행됨
document.addEventListener('DOMContentLoaded', init);

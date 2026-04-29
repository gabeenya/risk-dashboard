// ── 부트스트랩 ───────────────────────────────────────
async function init() {
  await loadUsers();

  // 관리자 기본 계정 자동 생성 (데모용)
  if (!users.find(u => u.id === ADMIN)) {
    await sbIns('users', { id: ADMIN, name: '관리자', pw: hp('admin1234'), role: 'admin', joined: td(), brands: [] });
    await loadUsers();
  }

  // 로그인 페이지가 게이트 — 로그인 전에는 데이터 로드 / 폼 초기화 / 차트 렌더 모두 보류
  applyUser();
  showLogin();

  // 폼 기본값은 로그인과 무관하게 미리 세팅해도 무해 (admin이 들어와야만 보이는 영역)
  document.getElementById('f-date').value = new Date().toISOString().split('T')[0];
  setInputType(document.querySelector('.tt.on'), '가맹');
  initAIStyle();
}

// 모든 스크립트가 defer로 로드되므로 DOMContentLoaded 시점에 실행됨
document.addEventListener('DOMContentLoaded', init);

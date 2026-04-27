// ── 부트스트랩 ───────────────────────────────────────
async function init() {
  await loadUsers();

  // 관리자 기본 계정 자동 생성 (데모용)
  if (!users.find(u => u.id === ADMIN)) {
    await sbIns('users', { id: ADMIN, name: '관리자', pw: hp('admin1234'), role: 'admin', joined: td() });
    await loadUsers();
  }

  await loadData();

  document.getElementById('f-date').value = new Date().toISOString().split('T')[0];
  setInputType(document.querySelector('.tt.on'), '가맹');
  initAIStyle();
}

// 모든 스크립트가 defer로 로드되므로 DOMContentLoaded 시점에 실행됨
document.addEventListener('DOMContentLoaded', init);

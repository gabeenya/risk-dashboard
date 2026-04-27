// ── 관리자 ───────────────────────────────────────────
async function createUser() {
  const n  = document.getElementById('new-name').value.trim();
  const id = document.getElementById('new-id').value.trim();
  const pw = document.getElementById('new-pw').value.trim();
  if (!n || !id || !pw) { toast('모든 항목을 입력하세요.'); return; }
  if (pw.length < 4) { toast('비밀번호는 4자 이상이어야 합니다.'); return; }

  await loadUsers();
  if (users.find(u => u.id === id)) { toast('이미 사용 중인 아이디입니다.'); return; }

  await sbIns('users', { id, name: n, pw: hp(pw), role: 'user', joined: td() });
  document.getElementById('newUserInfo').textContent = `아이디: ${id} / 임시 비밀번호: ${pw}`;
  document.getElementById('newUserResult').style.display = '';
  document.getElementById('new-name').value = '';
  document.getElementById('new-id').value   = '';
  document.getElementById('new-pw').value   = '';

  await loadUsers();
  renderAdmin();
  toast(`${n}님 계정이 추가되었습니다.`);
}

function copyUser() {
  const i = document.getElementById('newUserInfo').textContent;
  navigator.clipboard.writeText(i).then(() => toast('복사되었습니다!'));
}

async function renderAdmin() {
  await loadUsers();
  document.getElementById('userTbody').innerHTML = users.map(u => `<tr>
    <td>${u.id}</td>
    <td>${u.name}</td>
    <td>${u.role === 'admin' ? '<span class="adm-badge">관리자</span>' : '일반'}</td>
    <td>${u.joined || '-'}</td>
    <td>${u.id === ADMIN ? '' : `<button class="del-btn" onclick="delUser('${u.id}')">✕</button>`}</td>
  </tr>`).join('');
}

async function delUser(id) {
  await sbDel('users', id);
  await loadUsers();
  renderAdmin();
  toast('삭제되었습니다.');
}

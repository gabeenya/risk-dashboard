// ── 관리자 ───────────────────────────────────────────

// 영역별 알림 임계치 편집 — localStorage('riskThresholds') 저장 (브라우저 단위 공유)
function renderThresholdTable() {
  const tb = document.getElementById('thresholdTbody');
  if (!tb) return;
  const cur = (typeof getThresholds === 'function') ? getThresholds() : THRESHOLDS_DEFAULT;
  tb.innerHTML = TYPES.map(t => {
    const v = cur[t] || THRESHOLDS_DEFAULT[t] || { delta: 0, mom: 0 };
    return `<tr>
      <td><b>${t}</b></td>
      <td><input type="number" min="0" class="st-sel th-inp" id="th-delta-${t}" value="${v.delta}" style="width:80px"> 건</td>
      <td><input type="number" min="0" class="st-sel th-inp" id="th-mom-${t}" value="${v.mom}" style="width:80px"> %</td>
    </tr>`;
  }).join('');
}
function saveThresholds() {
  const out = {};
  TYPES.forEach(t => {
    const delta = parseInt(document.getElementById('th-delta-'+t).value) || 0;
    const mom   = parseInt(document.getElementById('th-mom-'+t).value)   || 0;
    out[t] = { delta, mom };
  });
  localStorage.setItem('riskThresholds', JSON.stringify(out));
  toast('임계치 저장 완료 — 대시보드로 돌아가면 반영됩니다.');
}
function resetThresholds() {
  if (!confirm('모든 영역의 임계치를 기본값으로 되돌릴까요?')) return;
  localStorage.removeItem('riskThresholds');
  renderThresholdTable();
  toast('기본값으로 복원되었습니다.');
}

// 신규 계정용 브랜드 체크박스 그리드 렌더
function renderNewBrandPicker() {
  const grid = document.getElementById('newBrandGrid');
  if (!grid) return;
  grid.innerHTML = BRANDS.map(b =>
    `<label class="brand-pick-opt"><input type="checkbox" class="new-brand-cb" value="${b}"> ${b}</label>`
  ).join('');
}

function newBrandAll(checked) {
  document.querySelectorAll('.new-brand-cb').forEach(cb => { cb.checked = checked; });
}

// 권한이 admin이면 브랜드 picker 숨김 (admin은 전체 브랜드)
function toggleNewBrandPicker() {
  const role = document.getElementById('new-role').value;
  document.getElementById('newBrandWrap').style.display = role === 'admin' ? 'none' : '';
}

async function createUser() {
  const n  = document.getElementById('new-name').value.trim();
  const id = document.getElementById('new-id').value.trim();
  const pw = document.getElementById('new-pw').value.trim();
  const role = document.getElementById('new-role').value;
  const brands = role === 'admin'
    ? []
    : Array.from(document.querySelectorAll('.new-brand-cb:checked')).map(cb => cb.value);

  if (!n || !id || !pw) { toast('모든 항목을 입력하세요.'); return; }
  if (pw.length < 4) { toast('비밀번호는 4자 이상이어야 합니다.'); return; }
  if (role === 'user' && !brands.length) { toast('브랜드장 계정은 접근 브랜드를 1개 이상 선택해야 합니다.'); return; }

  await loadUsers();
  if (users.find(u => u.id === id)) { toast('이미 사용 중인 아이디입니다.'); return; }

  await sbIns('users', { id, name: n, pw: hp(pw), role, joined: td(), brands });
  const roleLabel = role === 'admin' ? '관리자' : `브랜드장 (${brands.join(', ')})`;
  document.getElementById('newUserInfo').textContent = `아이디: ${id} / 임시 비밀번호: ${pw} / 권한: ${roleLabel}`;
  document.getElementById('newUserResult').style.display = '';
  document.getElementById('new-name').value = '';
  document.getElementById('new-id').value   = '';
  document.getElementById('new-pw').value   = '';
  document.getElementById('new-role').value = 'user';
  toggleNewBrandPicker();
  newBrandAll(false);

  await loadUsers();
  renderAdmin();
  toast(`${n}님 계정이 추가되었습니다.`);
}

function copyUser() {
  const i = document.getElementById('newUserInfo').textContent;
  navigator.clipboard.writeText(i).then(() => toast('복사되었습니다!'));
}

async function renderAdmin() {
  renderNewBrandPicker();
  toggleNewBrandPicker();
  renderThresholdTable();
  await loadUsers();
  document.getElementById('userTbody').innerHTML = users.map(u => {
    const isProtected = u.id === ADMIN;
    const uBrands = Array.isArray(u.brands) ? u.brands : [];
    const roleSel = isProtected
      ? '<span class="adm-badge">관리자</span>'
      : `<select class="st-sel role-sel" onchange="updRole('${u.id}', this.value)">
           <option value="user"${u.role==='user'?' selected':''}>브랜드장</option>
           <option value="admin"${u.role==='admin'?' selected':''}>관리자</option>
         </select>`;
    const brandsCell = u.role === 'admin'
      ? '<span class="cell-muted">전체</span>'
      : `<button class="brand-edit-btn" onclick="editBrands('${u.id}')">${uBrands.length ? uBrands.join(', ') : '미지정'} ✎</button>`;
    return `<tr>
      <td>${u.id}</td>
      <td>${u.name}</td>
      <td>${roleSel}</td>
      <td>${brandsCell}</td>
      <td>${u.joined || '-'}</td>
      <td>${isProtected ? '' : `<button class="del-btn" onclick="delUser('${u.id}')">✕</button>`}</td>
    </tr>`;
  }).join('');
}

async function updRole(id, role) {
  if (id === ADMIN) return;
  // admin으로 바꾸면 brands는 비움 (전체 의미)
  const patch = role === 'admin' ? { role, brands: [] } : { role };
  await sbUpd('users', id, patch);
  await loadUsers();
  renderAdmin();
  toast(`권한 → ${role === 'admin' ? '관리자' : '브랜드장'}`);
}

// 브랜드 편집 — 인라인 모달처럼 동작 (간단히 prompt 대용으로 체크박스 모달 띄움)
function editBrands(id) {
  const u = users.find(x => x.id === id);
  if (!u) return;
  const cur = Array.isArray(u.brands) ? u.brands : [];
  const html = BRANDS.map(b =>
    `<label class="brand-pick-opt"><input type="checkbox" class="edit-brand-cb" value="${b}"${cur.includes(b)?' checked':''}> ${b}</label>`
  ).join('');
  document.getElementById('editBrandsTitle').textContent = `${u.name} (${u.id}) 브랜드 권한`;
  document.getElementById('editBrandsGrid').innerHTML = html;
  document.getElementById('editBrandsModal').dataset.uid = id;
  document.getElementById('editBrandsModal').classList.remove('hide');
}

function closeEditBrands() {
  document.getElementById('editBrandsModal').classList.add('hide');
}

function editBrandsAll(checked) {
  document.querySelectorAll('.edit-brand-cb').forEach(cb => { cb.checked = checked; });
}

async function saveEditBrands() {
  const id = document.getElementById('editBrandsModal').dataset.uid;
  const sel = Array.from(document.querySelectorAll('.edit-brand-cb:checked')).map(cb => cb.value);
  if (!sel.length) { toast('최소 1개 이상의 브랜드를 선택하세요.'); return; }
  await sbUpd('users', id, { brands: sel });
  closeEditBrands();
  await loadUsers();
  renderAdmin();
  toast('브랜드 권한이 저장되었습니다.');
}

async function delUser(id) {
  await sbDel('users', id);
  await loadUsers();
  renderAdmin();
  toast('삭제되었습니다.');
}

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

// 신규 계정용 브랜드 / 영역 체크박스 그리드 렌더
function renderNewBrandPicker() {
  const grid = document.getElementById('newBrandGrid');
  if (!grid) return;
  grid.innerHTML = BRANDS.map(b =>
    `<label class="brand-pick-opt"><input type="checkbox" class="new-brand-cb" value="${b}"> ${b}</label>`
  ).join('');
}
function renderNewTypePicker() {
  const grid = document.getElementById('newTypeGrid');
  if (!grid) return;
  grid.innerHTML = TYPES.map(t =>
    `<label class="brand-pick-opt"><input type="checkbox" class="new-type-cb" value="${t}"> ${t}</label>`
  ).join('');
}

function newBrandAll(checked) {
  document.querySelectorAll('.new-brand-cb').forEach(cb => { cb.checked = checked; });
}
function newTypeAll(checked) {
  document.querySelectorAll('.new-type-cb').forEach(cb => { cb.checked = checked; });
}

// 권한이 admin이면 브랜드/영역 picker 숨김 (admin은 전체)
function toggleNewBrandPicker() {
  const role = document.getElementById('new-role').value;
  const show = role === 'admin' ? 'none' : '';
  document.getElementById('newBrandWrap').style.display = show;
  const tw = document.getElementById('newTypeWrap');
  if (tw) tw.style.display = show;
}

async function createUser() {
  const n  = document.getElementById('new-name').value.trim();
  const id = document.getElementById('new-id').value.trim();
  const pw = document.getElementById('new-pw').value.trim();
  const role = document.getElementById('new-role').value;
  const brands = role === 'admin'
    ? []
    : Array.from(document.querySelectorAll('.new-brand-cb:checked')).map(cb => cb.value);
  const types = role === 'admin'
    ? []
    : Array.from(document.querySelectorAll('.new-type-cb:checked')).map(cb => cb.value);

  if (!n || !id || !pw) { toast('모든 항목을 입력하세요.'); return; }
  // 아이디는 영문/숫자/._- 만 허용 — 인라인 핸들러 JS 인젝션과 URL/SQL 이상문자 방지
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) { toast('아이디는 영문/숫자/.-_만 사용할 수 있습니다.'); return; }
  if (pw.length < 4) { toast('비밀번호는 4자 이상이어야 합니다.'); return; }
  if (role === 'user' && !brands.length) { toast('브랜드장 계정은 접근 브랜드를 1개 이상 선택해야 합니다.'); return; }
  if (role === 'user' && !types.length)  { toast('브랜드장 계정은 확인 가능 영역을 1개 이상 선택해야 합니다.'); return; }

  await loadUsers();
  if (users.find(u => u.id === id)) { toast('이미 사용 중인 아이디입니다.'); return; }

  const ok = await sbIns('users', { id, name: n, pw: hp(pw), role, joined: td(), brands, types, status: 'active' });
  if (!ok) {
    toast('계정 추가 실패 — ' + (window.__sbLastErr || '콘솔(F12) 확인'));
    return;
  }
  const roleLabel = role === 'admin'
    ? '관리자'
    : `브랜드장 (${brands.join(', ')} / 영역: ${types.join(', ')})`;
  document.getElementById('newUserInfo').textContent = `아이디: ${id} / 임시 비밀번호: ${pw} / 권한: ${roleLabel}`;
  document.getElementById('newUserResult').style.display = '';
  document.getElementById('new-name').value = '';
  document.getElementById('new-id').value   = '';
  document.getElementById('new-pw').value   = '';
  document.getElementById('new-role').value = 'user';
  toggleNewBrandPicker();
  newBrandAll(false);
  newTypeAll(false);

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
  renderNewTypePicker();
  toggleNewBrandPicker();
  renderThresholdTable();
  await loadUsers();

  // 가입 신청 대기 (status='pending') 분리
  const pending = users.filter(u => u.status === 'pending');
  const active  = users.filter(u => u.status !== 'pending');
  renderPendingList(pending);

  document.getElementById('userTbody').innerHTML = active.map(u => {
    const isProtected = u.id === ADMIN;
    const uBrands = Array.isArray(u.brands) ? u.brands : [];
    const uTypes  = Array.isArray(u.types)  ? u.types  : [];
    // u.id를 인라인 핸들러 JS 문자열에 직접 박지 않고 data-uid 속성으로 분리 → HTML escape만으로 안전
    const uidAttr = esc(u.id);
    const roleSel = isProtected
      ? '<span class="adm-badge">관리자</span>'
      : `<select class="st-sel role-sel" data-uid="${uidAttr}" onchange="updRole(this.dataset.uid, this.value)">
           <option value="user"${u.role==='user'?' selected':''}>브랜드장</option>
           <option value="admin"${u.role==='admin'?' selected':''}>관리자</option>
         </select>`;
    const brandsTxt = uBrands.length ? uBrands.map(esc).join(', ') : '미지정';
    const brandsCell = u.role === 'admin'
      ? '<span class="cell-muted">전체</span>'
      : `<button class="brand-edit-btn" data-uid="${uidAttr}" onclick="editBrands(this.dataset.uid)">${brandsTxt} ✎</button>`;
    const typesTxt = uTypes.length ? uTypes.map(esc).join(', ') : '미지정';
    const typesCell = u.role === 'admin'
      ? '<span class="cell-muted">전체</span>'
      : `<button class="brand-edit-btn" data-uid="${uidAttr}" onclick="editTypes(this.dataset.uid)">${typesTxt} ✎</button>`;
    const nameCell = isProtected
      ? esc(u.name)
      : `<button class="name-edit-btn" data-uid="${uidAttr}" onclick="editName(this.dataset.uid)">${esc(u.name)} ✎</button>`;
    return `<tr>
      <td>${esc(u.id)}</td>
      <td>${nameCell}</td>
      <td>${roleSel}</td>
      <td>${brandsCell}</td>
      <td>${typesCell}</td>
      <td>${esc(u.joined || '-')}</td>
      <td>${isProtected ? '' : `<button class="del-btn" data-uid="${uidAttr}" onclick="delUser(this.dataset.uid)">✕</button>`}</td>
    </tr>`;
  }).join('');
}

// ── 가입 신청 대기 ──────────────────────────────────
function renderPendingList(pending) {
  const sec   = document.getElementById('pendingSec');
  const tbody = document.getElementById('pendingTbody');
  const badge = document.getElementById('pendingCntBadge');
  if (!sec || !tbody) return;
  if (!pending.length) { sec.style.display = 'none'; tbody.innerHTML = ''; return; }
  sec.style.display = '';
  badge.textContent = pending.length;
  tbody.innerHTML = pending.map(u => {
    const uidAttr = esc(u.id);
    const brandsTxt = (Array.isArray(u.brands) && u.brands.length) ? u.brands.map(esc).join(', ') : '미지정';
    return `<tr>
      <td>${esc(u.id)}</td>
      <td>${esc(u.name)}</td>
      <td>${brandsTxt}</td>
      <td>${esc(u.joined || '-')}</td>
      <td>
        <button class="btn-pri btn-mini" data-uid="${uidAttr}" onclick="approveUser(this.dataset.uid)">승인</button>
        <button class="btn-sec btn-mini" data-uid="${uidAttr}" onclick="rejectUser(this.dataset.uid)">거절</button>
      </td>
    </tr>`;
  }).join('');
}

// 승인 — 모달 띄워서 브랜드/영역 권한을 함께 지정
function approveUser(id) {
  const u = users.find(x => x.id === id);
  if (!u) return;
  const curB = Array.isArray(u.brands) ? u.brands : [];
  const curT = Array.isArray(u.types)  ? u.types  : [];
  document.getElementById('apprTitle').textContent = `${u.name} (${u.id}) 가입 승인`;
  document.getElementById('apprBrandGrid').innerHTML = BRANDS.map(b =>
    `<label class="brand-pick-opt"><input type="checkbox" class="appr-brand-cb" value="${b}"${curB.includes(b)?' checked':''}> ${b}</label>`
  ).join('');
  document.getElementById('apprTypeGrid').innerHTML = TYPES.map(t =>
    `<label class="brand-pick-opt"><input type="checkbox" class="appr-type-cb" value="${t}"${curT.includes(t)?' checked':''}> ${t}</label>`
  ).join('');
  document.getElementById('apprModal').dataset.uid = id;
  document.getElementById('apprModal').classList.remove('hide');
}
function closeApproveModal() {
  document.getElementById('apprModal').classList.add('hide');
}
function apprBrandAll(c) { document.querySelectorAll('.appr-brand-cb').forEach(cb => { cb.checked = c; }); }
function apprTypeAll(c)  { document.querySelectorAll('.appr-type-cb').forEach(cb => { cb.checked = c; }); }
async function confirmApprove() {
  const id = document.getElementById('apprModal').dataset.uid;
  const brands = Array.from(document.querySelectorAll('.appr-brand-cb:checked')).map(cb => cb.value);
  const types  = Array.from(document.querySelectorAll('.appr-type-cb:checked')).map(cb => cb.value);
  if (!brands.length) { toast('접근 브랜드를 1개 이상 선택하세요.'); return; }
  if (!types.length)  { toast('확인 가능 영역을 1개 이상 선택하세요.'); return; }
  const ok = await sbUpd('users', id, { brands, types, status: 'active' });
  if (!ok) { toast('승인 저장 실패 — ' + (window.__sbLastErr || '콘솔(F12) 확인')); return; }
  closeApproveModal();
  await loadUsers();
  renderAdmin();
  toast('가입 신청을 승인했습니다.');
}

async function rejectUser(id) {
  if (!confirm('이 가입 신청을 거절(삭제)할까요?')) return;
  await sbDel('users', id);
  await loadUsers();
  renderAdmin();
  toast('가입 신청을 거절했습니다.');
}

// ── 이름 편집 ───────────────────────────────────────
function editName(id) {
  const u = users.find(x => x.id === id);
  if (!u) return;
  document.getElementById('editNameTitle').textContent = `${u.id} 이름 변경`;
  document.getElementById('editNameInput').value = u.name || '';
  document.getElementById('editNameModal').dataset.uid = id;
  document.getElementById('editNameModal').classList.remove('hide');
  setTimeout(() => { const f = document.getElementById('editNameInput'); if (f) { f.focus(); f.select(); } }, 30);
}
function closeEditName() {
  document.getElementById('editNameModal').classList.add('hide');
}
async function saveEditName() {
  const id = document.getElementById('editNameModal').dataset.uid;
  const n  = document.getElementById('editNameInput').value.trim();
  if (!n) { toast('이름을 입력하세요.'); return; }
  await sbUpd('users', id, { name: n });
  closeEditName();
  await loadUsers();
  renderAdmin();
  toast('이름이 변경되었습니다.');
}

async function updRole(id, role) {
  if (id === ADMIN) return;
  // admin으로 바꾸면 brands·types는 비움 (전체 의미)
  const patch = role === 'admin' ? { role, brands: [], types: [] } : { role };
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
  const ok = await sbUpd('users', id, { brands: sel });
  if (!ok) { toast('저장 실패 — ' + (window.__sbLastErr || '콘솔(F12) 확인')); return; }
  closeEditBrands();
  await loadUsers();
  renderAdmin();
  toast('브랜드 권한이 저장되었습니다.');
}

// ── 영역 권한 편집 ──────────────────────────────────
function editTypes(id) {
  const u = users.find(x => x.id === id);
  if (!u) return;
  const cur = Array.isArray(u.types) ? u.types : [];
  document.getElementById('editTypesTitle').textContent = `${u.name} (${u.id}) 영역 권한`;
  document.getElementById('editTypesGrid').innerHTML = TYPES.map(t =>
    `<label class="brand-pick-opt"><input type="checkbox" class="edit-type-cb" value="${t}"${cur.includes(t)?' checked':''}> ${t}</label>`
  ).join('');
  document.getElementById('editTypesModal').dataset.uid = id;
  document.getElementById('editTypesModal').classList.remove('hide');
}
function closeEditTypes() {
  document.getElementById('editTypesModal').classList.add('hide');
}
function editTypesAll(checked) {
  document.querySelectorAll('.edit-type-cb').forEach(cb => { cb.checked = checked; });
}
async function saveEditTypes() {
  const id = document.getElementById('editTypesModal').dataset.uid;
  const sel = Array.from(document.querySelectorAll('.edit-type-cb:checked')).map(cb => cb.value);
  if (!sel.length) { toast('최소 1개 이상의 영역을 선택하세요.'); return; }
  const ok = await sbUpd('users', id, { types: sel });
  if (!ok) { toast('저장 실패 — ' + (window.__sbLastErr || '콘솔(F12) 확인')); return; }
  closeEditTypes();
  await loadUsers();
  renderAdmin();
  toast('영역 권한이 저장되었습니다.');
}

async function delUser(id) {
  await sbDel('users', id);
  await loadUsers();
  renderAdmin();
  toast('삭제되었습니다.');
}

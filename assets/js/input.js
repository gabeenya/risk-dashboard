// ── 데이터 입력 ──────────────────────────────────────
function renderInputPg() {
  document.getElementById('inputLock').style.display  = user ? 'none' : '';
  document.getElementById('inputForm').style.display  = user ? '' : 'none';
  if (user) renderInputTable();
}

async function addRecord() {
  const date  = document.getElementById('f-date').value;
  const type  = curType;
  const sub   = document.getElementById('f-subtype').value;
  const brand = document.getElementById('f-brand').value;
  const count = parseInt(document.getElementById('f-count').value) || 0;
  const note  = document.getElementById('f-note').value;
  if (!date || !brand || count < 1) { toast('필수 항목을 모두 입력해 주세요.'); return; }

  const btn = document.getElementById('submitBtn');
  const ind = document.getElementById('savInd');
  btn.disabled = true;
  ind.classList.add('show');

  await sbIns('records', {
    id: Date.now(), date, type,
    subtype: sub || '-', brand,
    status: '모니터링', count, note,
    author: user.name
  });
  await loadData();

  btn.disabled = false;
  ind.classList.remove('show');
  renderInputTable();
  toast('저장 완료!');
  resetForm();
}

async function updStatus(id, s) {
  await sbUpd('records', id, { status: s });
  await loadData();
  renderInputTable();
  toast(`상태 → "${s}"`);
}

async function updNote(id, note, btnEl) {
  const ok = await sbUpd('records', id, { note });
  if (!ok) return;
  btnEl.textContent = '완료 ✓';
  btnEl.classList.add('saved');
  await loadData();
  setTimeout(() => { btnEl.textContent = '저장'; btnEl.classList.remove('saved'); }, 1500);
  toast('비고가 저장되었습니다.');
}

async function delRecord(id) {
  const rec = records.find(r => r.id === id);
  if (!rec) return;
  deleted = rec;
  await sbDel('records', id);
  await loadData();
  renderInputTable();
  showUndo();
}

function showUndo() {
  const t = document.getElementById('undoToast');
  t.classList.add('show');
  if (uTimer) clearTimeout(uTimer);
  uTimer = setTimeout(() => { t.classList.remove('show'); deleted = null; }, 5000);
}

async function undoDelete() {
  if (!deleted) return;
  await sbIns('records', deleted);
  await loadData();
  renderInputTable();
  document.getElementById('undoToast').classList.remove('show');
  clearTimeout(uTimer);
  deleted = null;
  toast('복원되었습니다.');
}

function resetForm() {
  document.getElementById('f-date').value    = new Date().toISOString().split('T')[0];
  document.getElementById('f-brand').value   = '';
  document.getElementById('f-subtype').value = '';
  document.getElementById('f-count').value   = 1;
  document.getElementById('f-note').value    = '';
}

function renderInputTable() {
  const tb = document.getElementById('inputTbody');
  const fl = records.filter(r => r.type === curType);
  if (!fl.length) {
    tb.innerHTML = '<tr><td colspan="9"><div class="empty">입력된 데이터가 없습니다</div></td></tr>';
    return;
  }
  tb.innerHTML = fl.map(r => `<tr>
    <td>${r.date}</td>
    <td>${r.type}</td>
    <td class="cell-sub">${r.subtype||'-'}</td>
    <td>${r.brand}</td>
    <td>${r.count.toLocaleString()}</td>
    <td>
      <select class="st-sel" onchange="updStatus(${r.id},this.value)">
        ${STATS.map(s => `<option value="${s}"${r.status===s?' selected':''}>${s}</option>`).join('')}
      </select>
    </td>
    <td>
      <div class="note-wrap">
        <input type="text" class="note-inp" id="note-inp-${r.id}"
          value="${(r.note||'').replace(/"/g,'&quot;')}" placeholder="-"
          onkeydown="if(event.key==='Enter'){const b=document.getElementById('note-btn-${r.id}');updNote(${r.id},this.value,b)}">
        <button class="note-save-btn" id="note-btn-${r.id}"
          onclick="updNote(${r.id},document.getElementById('note-inp-${r.id}').value,this)">저장</button>
      </div>
    </td>
    <td class="cell-muted">${r.author||'-'}</td>
    <td><button class="del-btn" onclick="delRecord(${r.id})">✕</button></td>
  </tr>`).join('');
}

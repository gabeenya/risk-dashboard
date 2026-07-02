// ── 데이터 입력 ──────────────────────────────────────
function renderInputPg() {
  document.getElementById('inputForm').style.display = user ? '' : 'none';
  if (user) { renderInputTable(); renderNotesList(); }
}

// ── 영역별 특이사항 ───────────────────────────────────
function renderNotesList() {
  const badge = document.getElementById('notesAreaBadge');
  if (badge) badge.textContent = curType;
  const dateFld = document.getElementById('ni-date');
  if (dateFld && !dateFld.value) dateFld.value = td();

  const list = document.getElementById('notesInputList');
  if (!list) return;
  const filtered = notes.filter(n => n.type === curType)
                        .sort((a, b) => b.date.localeCompare(a.date));
  if (!filtered.length) {
    list.innerHTML = '<span class="ni-empty">등록된 특이사항 없음</span>';
    return;
  }
  const canEdit = isAdmin();
  list.innerHTML = filtered.map(n => {
    const p = parseNoteContent(n.content);
    return `<div class="ni-item">` +
      `<div class="ni-item-hd">` +
      `<input type="date" class="ni-item-date-inp" id="ni-nd-${n.id}" value="${esc(n.date)}" ${canEdit?'':'readonly'}>` +
      `<span class="ni-item-author">${esc(n.author||'')}</span>` +
      (canEdit ? `<button class="ni-save-btn" onclick="saveNote(${n.id})">저장</button><button class="ni-del-btn" onclick="deleteNote(${n.id})">×</button>` : '') +
      `</div>` +
      `<div class="ni-item-fields">` +
      `<div class="ni-field-row"><label class="ni-label">주요이슈</label><input type="text" class="ni-text-inp ni-item-inp" id="ni-m-${n.id}" value="${esc(p.m)}" ${canEdit?'':'readonly'}></div>` +
      `<div class="ni-field-row"><label class="ni-label">이슈상세</label><input type="text" class="ni-text-inp ni-item-inp" id="ni-d-${n.id}" value="${esc(p.d)}" ${canEdit?'':'readonly'}></div>` +
      `<div class="ni-field-row"><label class="ni-label">조치완료 사항</label><input type="text" class="ni-text-inp ni-item-inp" id="ni-a-${n.id}" value="${esc(p.a)}" ${canEdit?'':'readonly'}></div>` +
      `</div>` +
      `</div>`;
  }).join('');
}

async function addNote() {
  const date   = document.getElementById('ni-date').value;
  const main   = (document.getElementById('ni-main')?.value || '').trim();
  const detail = (document.getElementById('ni-detail')?.value || '').trim();
  const action = (document.getElementById('ni-action')?.value || '').trim();
  if (!date || !main) { toast('날짜와 주요이슈를 입력하세요.'); return; }
  const btn = document.getElementById('ni-add-btn');
  if (btn) btn.disabled = true;
  const content = serializeNote(main, detail, action);
  console.log('[addNote] main:', main, '| detail:', detail, '| action:', action, '| content:', content);
  // id: Date.now()은 int4(최대 21억) 오버플로우 → 초 단위(~17.5억)로 int4 범위 내 사용
  const ok = await sbIns('notes', [{ id: Math.floor(Date.now() / 1000), date, type: curType, content, author: user.name }]);
  if (btn) btn.disabled = false;
  if (!ok) {
    const raw = window.__sbLastErr || '알 수 없는 오류';
    toast('저장 실패 — ' + raw.slice(0, 120));
    return;
  }
  const fetched = await sbGet('notes');
  notes = (fetched || []).sort((a, b) => b.date.localeCompare(a.date));
  const mainEl = document.getElementById('ni-main');
  const detailEl = document.getElementById('ni-detail');
  const actionEl = document.getElementById('ni-action');
  if (mainEl) mainEl.value = '';
  if (detailEl) detailEl.value = '';
  if (actionEl) actionEl.value = '';
  renderNotesList();
  renderNotesSection(curFilter);
  toast('특이사항이 추가되었습니다.');
}

async function saveNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  const dateInp = document.getElementById(`ni-nd-${id}`);
  const mInp    = document.getElementById(`ni-m-${id}`);
  const dInp    = document.getElementById(`ni-d-${id}`);
  const aInp    = document.getElementById(`ni-a-${id}`);
  if (!mInp) return;
  const date    = dateInp ? dateInp.value : note.date;
  const content = serializeNote(mInp.value.trim(), dInp ? dInp.value.trim() : '', aInp ? aInp.value.trim() : '');
  const ok = await sbUpd('notes', id, { date, content });
  if (!ok) {
    let em = window.__sbLastErr || '';
    try { em = JSON.parse(em).message || em; } catch {}
    toast('수정 실패 — ' + (em.slice(0, 100) || '알 수 없는 오류'));
    return;
  }
  note.date = date;
  note.content = content;
  renderNotesList();
  renderNotesSection(curFilter);
  toast('수정되었습니다.');
}

async function deleteNote(id) {
  if (!confirm('이 특이사항을 삭제하시겠습니까?')) return;
  const ok = await sbDel('notes', id);
  if (!ok) { toast('삭제 실패'); return; }
  notes = notes.filter(n => n.id !== id);
  renderNotesList();
  renderNotesSection(curFilter);
  toast('삭제되었습니다.');
}

async function addRecord() {
  const date   = document.getElementById('f-date').value;
  const type   = curType;
  const sub    = document.getElementById('f-subtype').value;
  const brand  = document.getElementById('f-brand').value;
  const count  = parseInt(document.getElementById('f-count').value) || 0;
  const status = document.getElementById('f-status').value || '모니터링';
  const note   = document.getElementById('f-note').value;
  // 정식 컬럼으로 저장 (마이그레이션 완료 후)
  const jg_name   = type === '감사'   ? (document.getElementById('f-jg-name')?.value  || '') : null;
  const jg_sent   = type === '감사'   ? (document.getElementById('f-jg-sent')?.value  || '') : null;
  const bc_amount = (type === '부실채권' && BC_AMT_SUBS.includes(sub))
    ? (parseInt(document.getElementById('f-amount')?.value) || null) : null;
  const exposed = document.getElementById('f-exposed')?.checked || false;
  if (!date || !brand || count < 1) { toast('필수 항목을 모두 입력해 주세요.'); return; }

  const btn = document.getElementById('submitBtn');
  const ind = document.getElementById('savInd');
  btn.disabled = true;
  ind.classList.add('show');

  const ok = await sbIns('records', {
    id: Math.floor(Date.now() / 1000), date, type,
    subtype: sub || '-', brand,
    status, count, note,
    jg_name, jg_sent, bc_amount, exposed,
    author: user.name
  });

  btn.disabled = false;
  ind.classList.remove('show');

  if (!ok) {
    const raw = window.__sbLastErr || '알 수 없는 오류';
    toast('저장 실패 — ' + raw.slice(0, 120));
    return;
  }

  await loadData();
  renderInputTable();
  toast('저장 완료!');
  resetForm();
}

async function updJgName(id, val, btnEl) {
  const ok = await sbUpd('records', id, { jg_name: val });
  if (!ok) { toast('저장 실패'); return; }
  if (btnEl) { btnEl.textContent = '완료 ✓'; btnEl.classList.add('saved'); setTimeout(() => { btnEl.textContent = '저장'; btnEl.classList.remove('saved'); }, 1500); }
  const rec = records.find(r => r.id === id); if (rec) rec.jg_name = val;
}
async function updJgSent(id, val, btnEl) {
  const ok = await sbUpd('records', id, { jg_sent: val });
  if (!ok) { toast('저장 실패'); return; }
  if (btnEl) { btnEl.textContent = '완료 ✓'; btnEl.classList.add('saved'); setTimeout(() => { btnEl.textContent = '저장'; btnEl.classList.remove('saved'); }, 1500); }
  const rec = records.find(r => r.id === id); if (rec) rec.jg_sent = val;
}
async function updBcAmount(id, val, btnEl) {
  const amt = parseInt(val) || null;
  const ok = await sbUpd('records', id, { bc_amount: amt });
  if (!ok) { toast('저장 실패'); return; }
  if (btnEl) { btnEl.textContent = '완료 ✓'; btnEl.classList.add('saved'); setTimeout(() => { btnEl.textContent = '저장'; btnEl.classList.remove('saved'); }, 1500); }
  const rec = records.find(r => r.id === id); if (rec) rec.bc_amount = amt;
}
async function updExposed(id, exposed) {
  const ok = await sbUpd('records', id, { exposed });
  if (!ok) { toast('저장 실패'); return; }
  const rec = records.find(r => r.id === id);
  if (rec) rec.exposed = exposed;
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

async function updDate(id, date) {
  if (!date) return;
  await sbUpd('records', id, { date });
  await loadData();
  renderInputTable();
  toast(`날짜 → "${date}"`);
}

async function updBrand(id, brand) {
  if (!brand) return;
  await sbUpd('records', id, { brand });
  await loadData();
  renderInputTable();
  toast(`브랜드 → "${brand}"`);
}

async function updSubtype(id, subtype) {
  await sbUpd('records', id, { subtype: subtype || '-' });
  await loadData();
  renderInputTable();
  toast(`상세유형 → "${subtype || '-'}"`);
}

async function updCount(id, count, btnEl) {
  const n = parseInt(count) || 0;
  if (n < 1) { toast('건수는 1 이상이어야 합니다.'); return; }
  const ok = await sbUpd('records', id, { count: n });
  if (!ok) return;
  btnEl.textContent = '완료 ✓';
  btnEl.classList.add('saved');
  await loadData();
  setTimeout(() => { btnEl.textContent = '저장'; btnEl.classList.remove('saved'); }, 1500);
  toast('건수가 저장되었습니다.');
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
  document.getElementById('f-status').value  = (curType === '감사' || curType === '부실채권') ? '위반(처리중)' : '모니터링';
  document.getElementById('f-note').value    = '';
  const expCb = document.getElementById('f-exposed');
  if (expCb) expCb.checked = false;
  // 금액·징계 필드 초기화 (비고는 항상 유지)
  const amtW = document.getElementById('f-amount-wrap');
  const amtI = document.getElementById('f-amount');
  if (amtI) amtI.value = '';
  if (amtW) amtW.style.display = 'none';
  const jgNI = document.getElementById('f-jg-name');
  const jgSI = document.getElementById('f-jg-sent');
  if (jgNI) jgNI.value = '';
  if (jgSI) jgSI.value = '';
}

// 부실채권 금액 입력란 표시/숨김 — 상세유형 변경 시 호출
function checkBcAmtField() {
  const sub  = document.getElementById('f-subtype')?.value || '';
  const amtW = document.getElementById('f-amount-wrap');
  const amtI = document.getElementById('f-amount');
  if (!amtW) return;
  const show = curType === '부실채권' && BC_AMT_SUBS.includes(sub);
  amtW.style.display = show ? '' : 'none';
  if (!show && amtI) amtI.value = '';
}

// 데이터 목록 — 상세유형/브랜드 필터 옵션을 현재 영역(curType)에 맞춰 갱신
// 영역을 바꿀 때, 페이지 진입 시 호출. 보존 가능한 값(전체)이면 유지, 아니면 'all'로 초기화.
function refreshInpFilterOpts() {
  const sub = document.getElementById('inpSubFilter');
  const brn = document.getElementById('inpBrandFilter');
  if (!sub || !brn) return;
  // 상세유형: 현재 영역의 상세유형 목록 + '-' (상세 없음 데이터용)
  const subs = SUB[curType] || [];
  // 데이터에 존재하는 '-' (subtype 미입력) 케이스 노출
  const hasDash = records.some(r => r.type === curType && (!r.subtype || r.subtype === '-'));
  const subOpts = ['<option value="all">전체</option>']
    .concat(subs.map(s => `<option value="${s}">${s}</option>`));
  if (hasDash) subOpts.push('<option value="-">(상세 없음)</option>');
  sub.innerHTML = subOpts.join('');
  if (inpSub !== 'all' && !subs.includes(inpSub) && !(inpSub === '-' && hasDash)) inpSub = 'all';
  sub.value = inpSub;
  // 브랜드: 현재 영역에 데이터가 있는 브랜드만 노출 (없는 브랜드 숨겨 깔끔하게)
  const brandsInData = Array.from(new Set(records.filter(r => r.type === curType).map(r => r.brand))).filter(Boolean);
  const orderedBrands = BRANDS.filter(b => brandsInData.includes(b));
  brn.innerHTML = ['<option value="all">전체</option>']
    .concat(orderedBrands.map(b => `<option value="${b}">${b}</option>`))
    .join('');
  if (inpBrand !== 'all' && !orderedBrands.includes(inpBrand)) inpBrand = 'all';
  brn.value = inpBrand;
  // 상태: 현재 영역(curType)의 표시 라벨로 옵션 구성 (클레임은 접수/처리중/처리완료)
  const stt = document.getElementById('inpStatFilter');
  if (stt) {
    const availSt = (['감사','부실채권','안전','클레임'].includes(curType)) ? STATS.filter(s => s !== '모니터링') : STATS;
    stt.innerHTML = ['<option value="all">전체</option>']
      .concat(availSt.map(s => `<option value="${esc(s)}">${esc(statLbl(s, curType))}</option>`))
      .join('');
    if (inpStat !== 'all' && !availSt.includes(inpStat)) inpStat = 'all';
    stt.value = inpStat;
  }
}

function setInpSubFilter(v)   { inpSub = v;   renderInputTable(); }
function setInpBrandFilter(v) { inpBrand = v; renderInputTable(); }
function setInpStatFilter(v)  { inpStat = v;  renderInputTable(); }
function resetInpFilters() {
  inpSub = 'all'; inpBrand = 'all'; inpStat = 'all';
  const sub = document.getElementById('inpSubFilter');
  const brn = document.getElementById('inpBrandFilter');
  const stt = document.getElementById('inpStatFilter');
  if (sub) sub.value = 'all';
  if (brn) brn.value = 'all';
  if (stt) stt.value = 'all';
  renderInputTable();
}

// 현재 영역(curType) + 필터(상세유형/브랜드)에 맞는 레코드 목록 — 렌더와 전체선택이 공유
function filteredInputRecords() {
  let fl = records.filter(r => r.type === curType);
  if (inpSub !== 'all') {
    if (inpSub === '-') fl = fl.filter(r => !r.subtype || r.subtype === '-');
    else                fl = fl.filter(r => r.subtype === inpSub);
  }
  if (inpBrand !== 'all') fl = fl.filter(r => r.brand === inpBrand);
  if (inpStat !== 'all')  fl = fl.filter(r => r.status === inpStat);
  return fl;
}

function renderInputTable() {
  refreshInpFilterOpts();
  const tb  = document.getElementById('inputTbody');
  const th  = document.getElementById('inputThead');
  const cnt = document.getElementById('inpFilterCnt');
  const total = records.filter(r => r.type === curType).length;
  const fl = filteredInputRecords();
  const isJg = curType === '감사';
  const isBc = curType === '부실채권';
  const colSpan = isJg ? 13 : isBc ? 12 : 11;

  // 동적 헤더
  if (th) {
    th.innerHTML = `<tr>
      <th class="chk-col"><input type="checkbox" id="inpChkAll" title="현재 목록 전체 선택" onchange="toggleInpSelAll(this.checked)"></th>
      <th>날짜</th><th>유형</th><th>상세</th><th>브랜드</th><th>건수</th><th>상태</th>
      ${isJg ? '<th>성명</th><th>양형</th>' : ''}
      ${isBc ? '<th>금액</th>' : ''}
      <th>비고</th>
      <th class="exp-th">외부노출</th>
      <th>작성자</th><th>삭제</th>
    </tr>`;
  }

  if (cnt) cnt.textContent = (inpSub === 'all' && inpBrand === 'all' && inpStat === 'all')
    ? `총 ${total}건`
    : `${fl.length}건 / 총 ${total}건`;
  if (!fl.length) {
    tb.innerHTML = `<tr><td colspan="${colSpan}"><div class="empty">조건에 해당하는 데이터가 없습니다</div></td></tr>`;
    updInpBulkUI();
    return;
  }
  tb.innerHTML = fl.map(r => {
    const rid = Number(r.id) || 0;
    const subs = SUB[r.type] || [];
    const subCell = subs.length === 0
      ? '<span class="cell-sub">-</span>'
      : `<select class="st-sel sub-sel" onchange="updSubtype(${rid},this.value)">
           <option value="">-</option>
           ${subs.map(s => `<option${r.subtype===s?' selected':''}>${esc(s)}</option>`).join('')}
         </select>`;
    const over = isSlaOver(r);

    // 영역별 전용 컬럼 + 비고
    let specialCols = '';
    if (isJg) {
      let _name = '', _sent = '', _noteText = '';
      if (r.jg_name != null || r.jg_sent != null) {
        _name = r.jg_name || ''; _sent = r.jg_sent || ''; _noteText = r.note || '';
      } else {
        const _jg = parseJgRecord(r);
        if (_jg) { _name = _jg.name; _sent = _jg.sent; _noteText = _jg.note; }
      }
      specialCols = `
        <td><div class="note-wrap"><input type="text" class="note-inp" id="jgname-inp-${rid}" value="${esc(_name)}" placeholder="-"
          onkeydown="if(event.key==='Enter'){const b=document.getElementById('jgname-btn-${rid}');updJgName(${rid},this.value,b)}">
          <button class="note-save-btn" id="jgname-btn-${rid}" onclick="updJgName(${rid},document.getElementById('jgname-inp-${rid}').value,this)">저장</button></div></td>
        <td><div class="note-wrap"><input type="text" class="note-inp" id="jgsent-inp-${rid}" value="${esc(_sent)}" placeholder="-"
          onkeydown="if(event.key==='Enter'){const b=document.getElementById('jgsent-btn-${rid}');updJgSent(${rid},this.value,b)}">
          <button class="note-save-btn" id="jgsent-btn-${rid}" onclick="updJgSent(${rid},document.getElementById('jgsent-inp-${rid}').value,this)">저장</button></div></td>
        <td><div class="note-wrap"><input type="text" class="note-inp" id="note-inp-${rid}" value="${esc(_noteText)}" placeholder="-"
          onkeydown="if(event.key==='Enter'){const b=document.getElementById('note-btn-${rid}');updNote(${rid},this.value,b)}">
          <button class="note-save-btn" id="note-btn-${rid}" onclick="updNote(${rid},document.getElementById('note-inp-${rid}').value,this)">저장</button></div></td>`;
    } else if (isBc) {
      const hasBcAmt = BC_AMT_SUBS.includes(r.subtype);
      let _amt = null;
      if (r.bc_amount != null) { _amt = Number(r.bc_amount); }
      else { const _old = parseBcAmt(r); if (_old !== null) _amt = _old; }
      const _bcNote = r.bc_amount != null ? (r.note || '') : parseBcNote(r);
      specialCols = `
        <td>${hasBcAmt ? `<div class="note-wrap"><input type="number" min="0" step="1000" class="note-inp" id="bcamt-inp-${rid}" value="${_amt != null ? _amt : ''}" placeholder="-"
          onkeydown="if(event.key==='Enter'){const b=document.getElementById('bcamt-btn-${rid}');updBcAmount(${rid},this.value,b)}">
          <button class="note-save-btn" id="bcamt-btn-${rid}" onclick="updBcAmount(${rid},document.getElementById('bcamt-inp-${rid}').value,this)">저장</button></div>` : '<span class="cell-muted">-</span>'}</td>
        <td><div class="note-wrap"><input type="text" class="note-inp" id="note-inp-${rid}" value="${esc(_bcNote)}" placeholder="-"
          onkeydown="if(event.key==='Enter'){const b=document.getElementById('note-btn-${rid}');updNote(${rid},this.value,b)}">
          <button class="note-save-btn" id="note-btn-${rid}" onclick="updNote(${rid},document.getElementById('note-inp-${rid}').value,this)">저장</button></div></td>`;
    } else {
      specialCols = `
        <td><div class="note-wrap"><input type="text" class="note-inp" id="note-inp-${rid}" value="${esc(r.note||'')}" placeholder="-"
          onkeydown="if(event.key==='Enter'){const b=document.getElementById('note-btn-${rid}');updNote(${rid},this.value,b)}">
          <button class="note-save-btn" id="note-btn-${rid}" onclick="updNote(${rid},document.getElementById('note-inp-${rid}').value,this)">저장</button></div></td>`;
    }

    return `<tr${over ? ' class="sla-over"' : ''}>
    <td class="chk-cell"><input type="checkbox" class="inp-chk"${inpSelected.has(rid) ? ' checked' : ''} onchange="toggleInpSel(${rid},this.checked)"></td>
    <td><input type="date" class="st-sel date-sel" value="${esc(r.date)}" onchange="updDate(${rid},this.value)">${over ? ` <span class="sla-badge" title="${daysSince(r.date)}일 경과">${daysSince(r.date)}일</span>` : ''}</td>
    <td>${esc(r.type)}</td>
    <td>${subCell}</td>
    <td><select class="st-sel brand-sel" onchange="updBrand(${rid},this.value)">
        ${BRANDS.map(b => `<option${r.brand===b?' selected':''}>${esc(b)}</option>`).join('')}
      </select></td>
    <td><div class="note-wrap count-wrap">
        <input type="number" min="1" class="note-inp count-inp" id="cnt-inp-${rid}" value="${Number(r.count) || 0}"
          onkeydown="if(event.key==='Enter'){const b=document.getElementById('cnt-btn-${rid}');updCount(${rid},this.value,b)}">
        <button class="note-save-btn" id="cnt-btn-${rid}" onclick="updCount(${rid},document.getElementById('cnt-inp-${rid}').value,this)">저장</button>
      </div></td>
    <td><select class="st-sel" onchange="updStatus(${rid},this.value)">
        ${(()=>{ const _av = (['감사','부실채권','안전','클레임'].includes(r.type)) ? STATS.filter(s => s !== '모니터링') : STATS; const _opts = _av.includes(r.status) ? _av : [r.status, ..._av]; return _opts.map(s=>`<option value="${esc(s)}"${r.status===s?' selected':''}>${esc(statLbl(s,r.type))}</option>`).join(''); })()}
      </select></td>
    ${specialCols}
    <td class="exp-td"><input type="checkbox" title="외부노출" ${r.exposed?'checked':''} onchange="updExposed(${rid},this.checked)"></td>
    <td class="cell-muted">${esc(r.author||'-')}</td>
    <td><button class="del-btn" onclick="delRecord(${rid})">✕</button></td>
  </tr>`;
  }).join('');
  updInpBulkUI();
}

// ── 다중 선택 / 다중·전체 삭제 ─────────────────────────
function toggleInpSel(id, checked) {
  const rid = Number(id) || 0;
  if (checked) inpSelected.add(rid); else inpSelected.delete(rid);
  updInpBulkUI();
}

// 헤더 체크박스 — 현재 필터에 보이는 행 전체를 선택/해제
function toggleInpSelAll(checked) {
  filteredInputRecords().forEach(r => {
    const rid = Number(r.id) || 0;
    if (checked) inpSelected.add(rid); else inpSelected.delete(rid);
  });
  renderInputTable();
}

// 선택 개수 표시·삭제 버튼 활성화·헤더 체크박스 상태(전체/일부)를 갱신
function updInpBulkUI() {
  const fl = filteredInputRecords();
  const selInView = fl.reduce((n, r) => n + (inpSelected.has(Number(r.id) || 0) ? 1 : 0), 0);
  const cnt = document.getElementById('inpBulkCnt');
  const btn = document.getElementById('inpBulkDelBtn');
  const all = document.getElementById('inpChkAll');
  if (cnt) cnt.textContent = `${selInView}건 선택됨`;
  if (btn) btn.disabled = selInView === 0;
  // 일괄 상태 변경 — 현재 영역(curType)의 표시 라벨로 선택지 갱신(선택값 보존), 버튼 활성화
  const stBtn = document.getElementById('inpBulkStatBtn');
  const stSel = document.getElementById('inpBulkStatSel');
  if (stSel) {
    const availSt = (['감사','부실채권','안전','클레임'].includes(curType)) ? STATS.filter(s => s !== '모니터링') : STATS;
    const cur = stSel.value || availSt[0];
    stSel.innerHTML = availSt.map(s => `<option value="${esc(s)}">${esc(statLbl(s, curType))}</option>`).join('');
    stSel.value = availSt.includes(cur) ? cur : availSt[0];
  }
  if (stBtn) stBtn.disabled = selInView === 0;
  if (all) {
    all.checked = fl.length > 0 && selInView === fl.length;
    all.indeterminate = selInView > 0 && selInView < fl.length;
  }
}

async function bulkDelSelected() {
  // 현재 필터에 보이는 선택 항목만 삭제 대상으로 (다른 영역의 잔여 선택 제외)
  const ids = filteredInputRecords()
    .map(r => Number(r.id) || 0)
    .filter(rid => rid && inpSelected.has(rid));
  if (!ids.length) { toast('선택된 항목이 없습니다.'); return; }
  if (!confirm(`선택한 ${ids.length}건을 삭제합니다.\n이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?`)) return;

  const btn = document.getElementById('inpBulkDelBtn');
  if (btn) { btn.disabled = true; btn.textContent = '삭제 중...'; }

  const ok = await sbDelMany('records', ids);

  if (btn) btn.textContent = '선택 삭제';
  if (!ok) {
    if (btn) btn.disabled = false;
    toast('삭제 중 오류가 발생했습니다.');
    return;
  }
  ids.forEach(id => inpSelected.delete(id));
  await loadData();
  renderInputTable();
  toast(`${ids.length}건이 삭제되었습니다.`);
}

// 선택한 항목(현재 필터에 보이는 건)의 상태를 일괄 변경
async function bulkUpdStatusSelected() {
  const sel = document.getElementById('inpBulkStatSel');
  const status = sel ? sel.value : '';
  if (!STATS.includes(status)) { toast('상태 값이 올바르지 않습니다.'); return; }
  // 현재 필터에 보이는 선택 항목만 대상으로 (다른 영역의 잔여 선택 제외)
  const ids = filteredInputRecords()
    .map(r => Number(r.id) || 0)
    .filter(rid => rid && inpSelected.has(rid));
  if (!ids.length) { toast('선택된 항목이 없습니다.'); return; }

  const btn = document.getElementById('inpBulkStatBtn');
  if (btn) { btn.disabled = true; btn.textContent = '변경 중...'; }

  const ok = await sbUpdMany('records', ids, { status });

  if (btn) btn.textContent = '선택 상태 변경';
  if (!ok) {
    if (btn) btn.disabled = false;
    toast('상태 변경 중 오류가 발생했습니다.');
    return;
  }
  await loadData();
  renderInputTable();
  toast(`${ids.length}건 → "${statLbl(status, curType)}"`);
}

// ── 엑셀 일괄 업로드 ──────────────────────────────────
// 검증된 행을 임시로 보관 (확정 시 INSERT)
let xlParsed = [];

// 영역별 유효 상태 라벨 (엑셀 표시용 — validateXlRow에서 DB 값으로 정규화)
function _areaStats(type) {
  if (type === '클레임')                              return ['접수/처리중','처리완료'];
  if (type === '안전')                                return ['발생','조치완료'];
  if (['감사','부실채권'].includes(type))             return ['위반(처리중)','완료'];
  return ['모니터링','위반(처리중)','완료'];
}

async function downloadExcelTemplate() {
  if (typeof ExcelJS === 'undefined') { toast('엑셀 라이브러리 로드 실패'); return; }
  const wb   = new ExcelJS.Workbook();
  const today = td();
  const MAX_ROWS = 500;
  const aType = curType;      // 현재 선택된 영역
  const isJg  = aType === '감사';
  const isBc  = aType === '부실채권';

  const aStats = _areaStats(aType);
  const aSubs  = SUB[aType] || [];

  // ── 헤더 / 열 너비 ──────────────────────
  const headers = ['날짜','영역','상세유형','브랜드','건수','상태','비고','노출여부'];
  const widths  = [12,    10,    24,       14,    7,    12,   30,   10   ];
  if (isJg) { headers.push('성명','양형'); widths.push(14, 14); }
  if (isBc) { headers.push('금액');       widths.push(12);      }

  // ── 시트1: 데이터 ─────────────────────────
  const ws1 = wb.addWorksheet('데이터');
  ws1.columns = headers.map((h, i) => ({ header: h, width: widths[i] }));
  ws1.getColumn('A').numFmt = '@';

  const exSub  = aSubs[0] || '';
  const exStat = aStats[0];
  const exRow  = [today, aType, exSub, '애슐리', 1, exStat, '예시 행 — 삭제 후 입력하세요', ''];
  if (isJg) exRow.push('', '');
  if (isBc) exRow.push('');
  ws1.addRow(exRow);
  ws1.getRow(1).font = { bold: true };
  ws1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };

  // ── 시트2: 참고_유효값 ──────────────────
  // A=상세유형, B=브랜드, C=상태
  const ws2 = wb.addWorksheet('참고_유효값');
  ws2.addRow(['상세유형', '브랜드', '상태']);
  ws2.getRow(1).font = { bold: true };
  const refLen = Math.max(aSubs.length, BRANDS.length, aStats.length);
  for (let i = 0; i < refLen; i++) {
    ws2.addRow([aSubs[i] || '', BRANDS[i] || '', aStats[i] || '']);
  }
  ws2.columns = [{ width: 24 }, { width: 14 }, { width: 16 }];

  if (aSubs.length > 0) {
    wb.definedNames.add(`참고_유효값!$A$2:$A$${1 + aSubs.length}`, aType);
  }
  wb.definedNames.add(`참고_유효값!$B$2:$B$${1 + BRANDS.length}`, '브랜드목록');
  wb.definedNames.add(`참고_유효값!$C$2:$C$${1 + aStats.length}`, '상태목록');

  // ── 데이터 유효성 검사 ───────────────────
  const lastRow = 1 + MAX_ROWS;
  for (let r = 2; r <= lastRow; r++) {
    ws1.getCell(`B${r}`).dataValidation = {
      type: 'list', allowBlank: true, showErrorMessage: false,
      formulae: [`"${aType}"`]
    };
    if (aSubs.length > 0) {
      ws1.getCell(`C${r}`).dataValidation = {
        type: 'list', allowBlank: true, showErrorMessage: true,
        errorStyle: 'warning', errorTitle: '상세유형', error: '목록에서 선택하세요.',
        formulae: [`참고_유효값!$A$2:$A$${1 + aSubs.length}`]
      };
    }
    ws1.getCell(`D${r}`).dataValidation = {
      type: 'list', allowBlank: true, showErrorMessage: true,
      errorStyle: 'warning', errorTitle: '브랜드', error: '목록에서 선택하세요.',
      formulae: [`참고_유효값!$B$2:$B$${1 + BRANDS.length}`]
    };
    ws1.getCell(`F${r}`).dataValidation = {
      type: 'list', allowBlank: true, showErrorMessage: true,
      errorStyle: 'warning', errorTitle: '상태', error: '목록에서 선택하세요.',
      formulae: [`참고_유효값!$C$2:$C$${1 + aStats.length}`]
    };
    ws1.getCell(`H${r}`).dataValidation = {
      type: 'list', allowBlank: true, showErrorMessage: false,
      formulae: ['"O"']
    };
    if (isBc) {
      ws1.getCell(`I${r}`).dataValidation = {
        type: 'decimal', allowBlank: true, showErrorMessage: true,
        errorStyle: 'warning', errorTitle: '금액', error: '숫자만 입력하세요.',
        operator: 'greaterThanOrEqual', formulae: [0]
      };
    }
  }

  // ── 다운로드 ────────────────────────────
  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `리스크데이터_양식_${aType}_${today}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function handleExcelFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  document.getElementById('xlFileName').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const ws = wb.Sheets['데이터'] || wb.Sheets[wb.SheetNames[0]];
      if (!ws) { toast('시트를 찾을 수 없습니다.'); return; }
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      if (!rows.length) { toast('데이터가 비어 있습니다.'); return; }
      const validated = rows.map((row, i) => validateXlRow(row, i + 2));
      xlParsed = validated;
      renderXlPreview(validated);
    } catch (err) {
      toast('엑셀 파싱 실패: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
  // 같은 파일을 다시 선택할 수 있도록 input 초기화
  ev.target.value = '';
}

function validateXlRow(row, lineNo) {
  const errs = [];
  let date = row['날짜'];
  if (date instanceof Date && !isNaN(date)) {
    date = date.toISOString().split('T')[0];
  } else if (typeof date === 'number') {
    // 엑셀 시리얼 → JS Date
    const d = new Date(Math.round((date - 25569) * 86400 * 1000));
    if (!isNaN(d)) date = d.toISOString().split('T')[0];
    else errs.push('날짜 형식');
  } else if (typeof date === 'string') {
    date = date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // YYYY-MM-DD: 정상
    } else if (/^\d{4}[./]\d{1,2}[./]\d{1,2}$/.test(date)) {
      // YYYY.MM.DD / YYYY/MM/DD
      const parts = date.split(/[./]/);
      date = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
    } else if (/^\d{1,2}[-./]\d{1,2}$/.test(date)) {
      // MM-DD / MM.DD — 당해 연도로 자동 완성
      const parts = date.split(/[-./]/);
      date = `${new Date().getFullYear()}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
    } else if (date) {
      errs.push('날짜 형식 오류 (YYYY-MM-DD 로 입력)');
      date = '';
    }
  } else {
    date = '';
  }
  if (!date) errs.push('날짜 필수');

  const type = String(row['영역'] || '').trim();
  if (!type) errs.push('영역 필수');
  else if (!TYPES.includes(type)) errs.push(`영역 (${type}) 알 수 없음`);

  let subtype = String(row['상세유형'] || '').trim();
  if (type && TYPES.includes(type)) {
    const subs = SUB[type] || [];
    if (subtype && subs.length > 0 && !subs.includes(subtype)) {
      errs.push(`상세유형 (${subtype}) — '${type}' 영역에 없음`);
    }
    if (!subtype) subtype = '-';
  }

  const brand = String(row['브랜드'] || '').trim();
  if (!brand) errs.push('브랜드 필수');
  else if (!BRANDS.includes(brand)) errs.push(`브랜드 (${brand}) 알 수 없음`);

  const countRaw = row['건수'];
  const count = parseInt(countRaw);
  if (!count || count < 1 || isNaN(count)) errs.push('건수는 1 이상 정수');

  let status = String(row['상태'] || '').trim();
  // 영역별 표시 라벨 → DB 값 정규화
  const __STAT_ALIAS = {
    '접수/처리중': '위반(처리중)', '처리완료': '완료',   // 클레임
    '발생':        '위반(처리중)', '조치완료':  '완료',  // 안전
  };
  if (__STAT_ALIAS[status]) status = __STAT_ALIAS[status];
  if (!status) status = (['안전','클레임'].includes(type)) ? '위반(처리중)' : '모니터링';
  else if (!STATS.includes(status)) errs.push(`상태 (${status}) 알 수 없음`);

  const note = String(row['비고'] || '').trim();
  const _expRaw = String(row['노출여부'] || '').trim().toUpperCase();
  const exposed = ['O', 'Y', '예', '✓', 'V', 'TRUE', '1'].includes(_expRaw);
  // 징계 전용
  const jg_name = type === '감사' ? String(row['성명'] || '').trim() || null : null;
  const jg_sent = type === '감사' ? String(row['양형'] || '').trim() || null : null;
  // 부실채권 금액 전용
  const _amtStr = String(row['금액'] || '').replace(/[,원\s]/g, '');
  const _amtVal = parseInt(_amtStr);
  const bc_amount = (type === '부실채권' && BC_AMT_SUBS.includes(subtype) && !isNaN(_amtVal) && _amtVal > 0) ? _amtVal : null;

  return {
    lineNo, date, type, subtype, brand, count: count || 0, status, note, exposed,
    jg_name, jg_sent, bc_amount,
    errs, ok: errs.length === 0
  };
}

function renderXlPreview(rows) {
  const ok  = rows.filter(r => r.ok).length;
  const err = rows.length - ok;
  document.getElementById('xlOkCnt').textContent  = ok;
  document.getElementById('xlErrCnt').textContent = err;
  document.getElementById('xlTotCnt').textContent = rows.length;
  document.getElementById('xlConfirmBtn').disabled = ok === 0;

  // 업로드된 데이터의 영역으로 컬럼 결정 (없으면 curType)
  const detectedType = (rows[0] && rows[0].type) || curType;
  const isJg = detectedType === '감사';
  const isBc = detectedType === '부실채권';

  // 헤더 동적 업데이트
  const thead = document.querySelector('#xlPreview .xl-pv-tbl thead tr');
  if (thead) {
    thead.innerHTML = `<th>#</th><th>날짜</th><th>영역</th><th>상세유형</th><th>브랜드</th><th>건수</th><th>상태</th><th>비고</th><th>노출여부</th>
      ${isJg ? '<th>성명</th><th>양형</th>' : ''}
      ${isBc ? '<th>금액</th>' : ''}
      <th>결과</th>`;
  }

  const tb = document.getElementById('xlPvTbody');
  tb.innerHTML = rows.map(r => {
    const errsTxt = r.errs.join(' / ');
    return `<tr class="${r.ok?'xl-row-ok':'xl-row-err'}">
    <td>${r.lineNo}</td>
    <td>${esc(r.date||'-')}</td>
    <td>${esc(r.type||'-')}</td>
    <td>${esc(r.subtype||'-')}</td>
    <td>${esc(r.brand||'-')}</td>
    <td>${r.count||'-'}</td>
    <td>${esc(r.status ? statLbl(r.status, r.type) : '-')}</td>
    <td>${esc(r.note||'')}</td>
    <td>${r.exposed ? 'O' : ''}</td>
    ${isJg ? `<td>${esc(r.jg_name||'')}</td><td>${esc(r.jg_sent||'')}</td>` : ''}
    ${isBc ? `<td>${r.bc_amount != null ? r.bc_amount.toLocaleString() : ''}</td>` : ''}
    <td>${r.ok?'<span class="xl-badge xl-badge-ok">유효</span>':`<span class="xl-badge xl-badge-err" title="${esc(errsTxt)}">${esc(errsTxt)}</span>`}</td>
  </tr>`;
  }).join('');

  document.getElementById('xlPreview').classList.remove('hide');
}

async function confirmBulkUpload() {
  const okRows = xlParsed.filter(r => r.ok);
  if (!okRows.length) { toast('업로드할 유효한 행이 없습니다.'); return; }
  if (!confirm(`${okRows.length}건을 업로드합니다. 계속하시겠습니까?`)) return;

  const btn = document.getElementById('xlConfirmBtn');
  btn.disabled = true;
  const origLabel = btn.textContent;
  btn.textContent = '업로드 중...';

  // 배열 POST로 일괄 INSERT (Supabase REST는 array body 지원)
  // ID 중복 방지를 위해 lineNo 기반 오프셋 부여; 초 단위로 int4 범위 내 유지
  const base = Math.floor(Date.now() / 1000);
  const payload = okRows.map((r, i) => ({
    id: base + i,
    date: r.date, type: r.type, subtype: r.subtype,
    brand: r.brand, count: r.count, status: r.status, note: r.note,
    exposed: r.exposed || false,
    jg_name: r.jg_name || null, jg_sent: r.jg_sent || null, bc_amount: r.bc_amount || null,
    author: user.name
  }));

  // 너무 크면 200건 단위로 끊어 보내기
  const CHUNK = 200;
  let inserted = 0, failed = 0;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK);
    const ok = await sbIns('records', slice);
    if (ok) inserted += slice.length; else failed += slice.length;
  }

  btn.textContent = origLabel;
  btn.disabled = false;

  await loadData();
  renderInputTable();
  cancelBulkUpload();

  if (failed === 0) toast(`✓ ${inserted}건 업로드 완료`);
  else toast(`업로드: 성공 ${inserted}건 / 실패 ${failed}건`);
}

function cancelBulkUpload() {
  xlParsed = [];
  document.getElementById('xlPreview').classList.add('hide');
  document.getElementById('xlPvTbody').innerHTML = '';
  document.getElementById('xlFileName').textContent = '선택된 파일 없음';
}

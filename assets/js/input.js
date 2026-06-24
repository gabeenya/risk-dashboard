// ── 데이터 입력 ──────────────────────────────────────
function renderInputPg() {
  // 비로그인 시에는 switchTab에서 진입을 막으므로 폼만 렌더한다
  document.getElementById('inputForm').style.display = user ? '' : 'none';
  if (user) renderInputTable();
}

async function addRecord() {
  const date   = document.getElementById('f-date').value;
  const type   = curType;
  const sub    = document.getElementById('f-subtype').value;
  const brand  = document.getElementById('f-brand').value;
  const count  = parseInt(document.getElementById('f-count').value) || 0;
  const status = document.getElementById('f-status').value || '모니터링';
  // 부실채권 미입금·2개월초과 미입금: 금액+비고를 '_amt:숫자|비고' 형식으로 저장
  let note = document.getElementById('f-note').value;
  if (type === '부실채권' && BC_AMT_SUBS.includes(sub)) {
    const amt = parseInt(document.getElementById('f-amount')?.value) || 0;
    note = `_amt:${amt}|${note}`;
  }
  if (!date || !brand || count < 1) { toast('필수 항목을 모두 입력해 주세요.'); return; }

  const btn = document.getElementById('submitBtn');
  const ind = document.getElementById('savInd');
  btn.disabled = true;
  ind.classList.add('show');

  await sbIns('records', {
    id: Date.now(), date, type,
    subtype: sub || '-', brand,
    status, count, note,
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
  document.getElementById('f-status').value  = (curType === '징계' || curType === '부실채권') ? '위반(처리중)' : '모니터링';
  document.getElementById('f-note').value    = '';
  // 금액 필드 초기화 및 숨김 (비고는 항상 유지)
  const amtW = document.getElementById('f-amount-wrap');
  const amtI = document.getElementById('f-amount');
  if (amtI) amtI.value = '';
  if (amtW) amtW.style.display = 'none';
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
    const availSt = (curType === '징계' || curType === '부실채권') ? STATS.filter(s => s !== '모니터링') : STATS;
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
  const cnt = document.getElementById('inpFilterCnt');
  const total = records.filter(r => r.type === curType).length;
  const fl = filteredInputRecords();
  if (cnt) cnt.textContent = (inpSub === 'all' && inpBrand === 'all' && inpStat === 'all')
    ? `총 ${total}건`
    : `${fl.length}건 / 총 ${total}건`;
  if (!fl.length) {
    tb.innerHTML = '<tr><td colspan="10"><div class="empty">조건에 해당하는 데이터가 없습니다</div></td></tr>';
    updInpBulkUI();
    return;
  }
  tb.innerHTML = fl.map(r => {
    // r.id는 Date.now() 기반 정수여야 하지만, RLS off 상태에서 외부 조작 가능성 → 강제 정수 캐스팅으로 인라인 핸들러 JS 인젝션 차단
    const rid = Number(r.id) || 0;
    const subs = SUB[r.type] || [];
    const subCell = subs.length === 0
      ? '<span class="cell-sub">-</span>'
      : `<select class="st-sel sub-sel" onchange="updSubtype(${rid},this.value)">
           <option value="">-</option>
           ${subs.map(s => `<option${r.subtype===s?' selected':''}>${esc(s)}</option>`).join('')}
         </select>`;
    const over = isSlaOver(r);
    return `<tr${over ? ' class="sla-over"' : ''}>
    <td class="chk-cell"><input type="checkbox" class="inp-chk"${inpSelected.has(rid) ? ' checked' : ''} onchange="toggleInpSel(${rid},this.checked)"></td>
    <td><input type="date" class="st-sel date-sel" value="${esc(r.date)}" onchange="updDate(${rid},this.value)">${over ? ` <span class="sla-badge" title="${daysSince(r.date)}일 경과">${daysSince(r.date)}일</span>` : ''}</td>
    <td>${esc(r.type)}</td>
    <td>${subCell}</td>
    <td>
      <select class="st-sel brand-sel" onchange="updBrand(${rid},this.value)">
        ${BRANDS.map(b => `<option${r.brand===b?' selected':''}>${esc(b)}</option>`).join('')}
      </select>
    </td>
    <td>
      <div class="note-wrap count-wrap">
        <input type="number" min="1" class="note-inp count-inp" id="cnt-inp-${rid}"
          value="${Number(r.count) || 0}"
          onkeydown="if(event.key==='Enter'){const b=document.getElementById('cnt-btn-${rid}');updCount(${rid},this.value,b)}">
        <button class="note-save-btn" id="cnt-btn-${rid}"
          onclick="updCount(${rid},document.getElementById('cnt-inp-${rid}').value,this)">저장</button>
      </div>
    </td>
    <td>
      <select class="st-sel" onchange="updStatus(${rid},this.value)">
        ${((r.type === '징계' || r.type === '부실채권') ? STATS.filter(s => s !== '모니터링') : STATS).map(s => `<option value="${esc(s)}"${r.status===s?' selected':''}>${esc(statLbl(s, r.type))}</option>`).join('')}
      </select>
    </td>
    <td>${(()=>{
      const _bcAmt = parseBcAmt(r);
      if (_bcAmt !== null) {
        const _bcNote = parseBcNote(r);
        return `<span class="bc-amt-cell">${_bcAmt.toLocaleString()}원${_bcNote ? ' · ' + esc(_bcNote) : ''}</span>`;
      }
      return `<div class="note-wrap">
        <input type="text" class="note-inp" id="note-inp-${rid}"
          value="${esc(r.note||'')}" placeholder="-"
          onkeydown="if(event.key==='Enter'){const b=document.getElementById('note-btn-${rid}');updNote(${rid},this.value,b)}">
        <button class="note-save-btn" id="note-btn-${rid}"
          onclick="updNote(${rid},document.getElementById('note-inp-${rid}').value,this)">저장</button>
      </div>`;
    })()}</td>
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
    const availSt = (curType === '징계' || curType === '부실채권') ? STATS.filter(s => s !== '모니터링') : STATS;
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

// 헤더 키 (양식 다운로드 + 업로드 파싱 시 공통으로 사용)
const XL_HEADERS = ['날짜','영역','상세유형','브랜드','건수','상태','비고'];

async function downloadExcelTemplate() {
  if (typeof ExcelJS === 'undefined') { toast('엑셀 라이브러리 로드 실패'); return; }
  const wb = new ExcelJS.Workbook();
  const today = td();
  const MAX_ROWS = 500; // 데이터 입력 가능 행 수

  // ── 시트1: 데이터 ─────────────────────────
  const ws1 = wb.addWorksheet('데이터');
  ws1.columns = XL_HEADERS.map((h, i) => ({
    header: h,
    width: [12,10,24,14,7,12,30][i]
  }));
  ws1.addRow([today, '가맹', '예상매출액 임의산정', '애슐리', 1, '모니터링', '예시 행 — 삭제 후 입력하세요']);
  ws1.getRow(1).font = { bold: true };
  ws1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };

  // ── 시트2: 참고_유효값 ────────────────────
  // 컬럼 레이아웃: A=영역, B=상태, C=브랜드, D~ = 각 영역별 상세유형
  const ws2 = wb.addWorksheet('참고_유효값');
  const refHeader = ['영역', '상태', '브랜드', ...TYPES];
  ws2.addRow(refHeader);
  ws2.getRow(1).font = { bold: true };

  const subLists = TYPES.map(t => SUB[t] || []);
  const maxLen = Math.max(TYPES.length, STATS.length, BRANDS.length, ...subLists.map(s => s.length));
  for (let i = 0; i < maxLen; i++) {
    ws2.addRow([
      TYPES[i] || '',
      STATS[i] || '',
      BRANDS[i] || '',
      ...subLists.map(s => s[i] || '')
    ]);
  }
  ws2.columns = [{ width: 14 }, { width: 14 }, { width: 14 }, ...TYPES.map(() => ({ width: 22 }))];

  // ── 클레임 전용 상태(접수/처리중/처리완료) 열 추가 ───
  // 클레임 영역만 UI 표시 라벨이 다르므로 별도 드롭다운 소스를 둠
  const CLAIM_STATS = ['접수', '처리중', '처리완료'];
  const claimStatCol = 4 + TYPES.length;
  ws2.getCell(1, claimStatCol).value = '클레임_상태';
  ws2.getCell(1, claimStatCol).font = { bold: true };
  CLAIM_STATS.forEach((s, i) => { ws2.getCell(i + 2, claimStatCol).value = s; });
  ws2.getColumn(claimStatCol).width = 14;
  const claimStatLetter = ws2.getColumn(claimStatCol).letter;

  // ── 정의된 이름(영역별 상세유형 범위 + 상태 범위) ─────
  // 영역명이 그대로 정의된 이름이 되어 INDIRECT($B2) 로 참조됨
  TYPES.forEach((t, idx) => {
    const subsLen = subLists[idx].length;
    if (subsLen === 0) return;
    const colLetter = ws2.getColumn(4 + idx).letter;
    const ref = `참고_유효값!$${colLetter}$2:$${colLetter}$${1 + subsLen}`;
    wb.definedNames.add(ref, t);
  });
  wb.definedNames.add(`참고_유효값!$B$2:$B$${1 + STATS.length}`, '상태_기본');
  wb.definedNames.add(`참고_유효값!$${claimStatLetter}$2:$${claimStatLetter}$${1 + CLAIM_STATS.length}`, '상태_클레임');

  // ── 데이터 시트 유효성 검사 ───────────────
  const typesEnd  = 1 + TYPES.length;
  const statsEnd  = 1 + STATS.length;
  const brandsEnd = 1 + BRANDS.length;
  const lastRow   = 1 + MAX_ROWS;

  for (let r = 2; r <= lastRow; r++) {
    ws1.getCell(`B${r}`).dataValidation = {
      type: 'list', allowBlank: true, showErrorMessage: true,
      errorStyle: 'warning', errorTitle: '영역', error: '목록에서 선택하세요.',
      formulae: [`참고_유효값!$A$2:$A$${typesEnd}`]
    };
    ws1.getCell(`C${r}`).dataValidation = {
      type: 'list', allowBlank: true, showErrorMessage: true,
      errorStyle: 'warning', errorTitle: '상세유형', error: '영역에 맞는 값을 선택하세요.',
      formulae: [`INDIRECT($B${r})`]
    };
    ws1.getCell(`D${r}`).dataValidation = {
      type: 'list', allowBlank: true, showErrorMessage: true,
      errorStyle: 'warning', errorTitle: '브랜드', error: '목록에서 선택하세요.',
      formulae: [`참고_유효값!$C$2:$C$${brandsEnd}`]
    };
    ws1.getCell(`F${r}`).dataValidation = {
      type: 'list', allowBlank: true, showErrorMessage: true,
      errorStyle: 'warning', errorTitle: '상태', error: '목록에서 선택하세요.',
      formulae: [`INDIRECT(IF($B${r}="클레임","상태_클레임","상태_기본"))`]
    };
  }

  // ── 파일 다운로드 ────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `리스크데이터_양식_${today}.xlsx`;
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
  // 날짜 — Date 객체 또는 YYYY-MM-DD 문자열, 엑셀 시리얼 숫자도 허용
  let date = row['날짜'];
  if (date instanceof Date && !isNaN(date)) {
    date = date.toISOString().split('T')[0];
  } else if (typeof date === 'string') {
    date = date.trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.push('날짜 형식 (YYYY-MM-DD)');
  } else if (typeof date === 'number') {
    // 엑셀 시리얼 → JS Date
    const d = new Date(Math.round((date - 25569) * 86400 * 1000));
    if (!isNaN(d)) date = d.toISOString().split('T')[0];
    else errs.push('날짜 형식');
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
  // 클레임 표시 라벨(접수/처리중/처리완료)도 받아 DB값(STATS)으로 정규화
  const __STAT_ALIAS = { '접수':'모니터링', '처리중':'위반(처리중)', '처리완료':'완료' };
  if (__STAT_ALIAS[status]) status = __STAT_ALIAS[status];
  if (!status) status = '모니터링';
  else if (!STATS.includes(status)) errs.push(`상태 (${status}) 알 수 없음`);

  const note = String(row['비고'] || '').trim();

  return {
    lineNo, date, type, subtype, brand, count: count || 0, status, note,
    errs, ok: errs.length === 0
  };
}

function renderXlPreview(rows) {
  const ok = rows.filter(r => r.ok).length;
  const err = rows.length - ok;
  document.getElementById('xlOkCnt').textContent = ok;
  document.getElementById('xlErrCnt').textContent = err;
  document.getElementById('xlTotCnt').textContent = rows.length;
  document.getElementById('xlConfirmBtn').disabled = ok === 0;

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
  // ID 중복 방지를 위해 lineNo 기반 오프셋 부여
  const base = Date.now();
  const payload = okRows.map((r, i) => ({
    id: base + i,
    date: r.date, type: r.type, subtype: r.subtype,
    brand: r.brand, count: r.count, status: r.status, note: r.note,
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
  const sf = document.getElementById('safeFileName');
  if (sf) sf.textContent = '선택된 파일 없음';
}

// ── 안전 영역 전용 일괄 업로드 ────────────────────────
// 안전 점검표(다중이용업소 시트)는 양식이 일반 양식과 달라 별도 파서를 둠.
// · 첫 시트만 읽음 / 헤더 행은 '브랜드'가 있는 행으로 자동 감지(이 파일은 2행)
// · 헤더 바로 윗행의 항목번호(1,2,3,…)로 점검 항목 컬럼 범위를 식별
// · 상세유형은 병합 헤더(중처법/게시물/교육/작업장/기타/소방)로, 각 유형은 여러 항목 컬럼 묶음
// · 항목 값 0 → 모니터링, 0이 아니면(1·2·3·5 = 배점) 위반(처리중), 빈칸 → 제외 (항목 개수만큼 집계)
// · 브랜드(A열)는 세로 병합이라 위에서 이어받음 / 매장명(B) → 비고 / 점검일자(F) → 날짜 / 영역은 '안전' 고정

// 파일 브랜드명 → DB 브랜드(BRANDS) 매핑
const SAFE_BRAND_MAP = { '애슐리퀸즈': '애슐리', '테루': '프랜차이즈', '반궁': '프랜차이즈' };
function mapSafeBrand(raw) {
  const b = String(raw || '').trim();
  return SAFE_BRAND_MAP[b] || b;
}

// 헤더 텍스트(공백·오타 차이 흡수) → 안전 상세유형(SUB['안전'])
function matchSafeSub(raw) {
  let s = String(raw || '').replace(/\s+/g, '');
  if (!s) return null;
  s = s.replace('중처범', '중처법'); // 파일 오타 보정
  for (const sub of (SUB['안전'] || [])) {
    if (sub.replace(/\s+/g, '') === s) return sub;
  }
  return null;
}

function handleSafetyFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  document.getElementById('safeFileName').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) { toast('첫 번째 시트를 찾을 수 없습니다.'); return; }
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
      const rows = parseSafetyGrid(grid);
      if (rows === null) { toast('안전 점검표 형식을 인식하지 못했습니다. (헤더에 \'브랜드\'·\'점검일자\'가 있는지 확인)'); return; }
      if (!rows.length) { toast('등록할 점검 데이터가 없습니다.'); return; }
      xlParsed = rows;
      renderXlPreview(rows);
    } catch (err) {
      toast('파일 파싱 실패: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
  ev.target.value = '';
}

// grid(배열의 배열) → 검증된 record 행 목록. 형식 미인식 시 null 반환.
function parseSafetyGrid(grid) {
  const norm = v => String(v == null ? '' : v).trim();

  // 헤더 행 찾기 ('브랜드' 셀이 있는 행)
  let hr = -1;
  for (let i = 0; i < grid.length; i++) {
    if ((grid[i] || []).some(c => norm(c) === '브랜드')) { hr = i; break; }
  }
  if (hr < 0) return null;
  const header = grid[hr] || [];

  // 주요 컬럼 위치
  let colBrand = -1, colNote = -1, colDate = -1;
  header.forEach((c, ci) => {
    const t = norm(c);
    if (colBrand < 0 && t === '브랜드') colBrand = ci;
    if (colNote < 0 && t.includes('매장')) colNote = ci;
    if (colDate < 0 && t.includes('점검일')) colDate = ci;
  });
  if (colBrand < 0 || colNote < 0 || colDate < 0) return null;

  // 상세유형(병합 헤더) 위치 → 컬럼별 소속 유형 결정
  const catCols = [];
  header.forEach((c, ci) => { const s = matchSafeSub(c); if (s) catCols.push({ col: ci, sub: s }); });
  if (!catCols.length) return null;
  catCols.sort((a, b) => a.col - b.col);
  const subForCol = ci => { let s = null; for (const c of catCols) { if (c.col <= ci) s = c.sub; else break; } return s; };

  // 항목 컬럼 = 헤더 윗행(항목번호 행)에 숫자가 있는 컬럼
  const numRow = hr > 0 ? (grid[hr - 1] || []) : [];
  const itemCols = [];
  numRow.forEach((c, ci) => {
    if (typeof c === 'number' && isFinite(c) && ci >= catCols[0].col) {
      const sub = subForCol(ci);
      if (sub) itemCols.push({ col: ci, sub });
    }
  });
  if (!itemCols.length) return null;

  // 데이터 행 순회 (헤더 다음 행부터)
  const out = [];
  let lastBrand = '';
  for (let r = hr + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const note = norm(row[colNote]);
    if (!note || /^\d+(\.\d+)?$/.test(note)) continue; // 매장명 없는/숫자 행(요약 등) 제외

    const rawBrand = norm(row[colBrand]);
    if (rawBrand) lastBrand = mapSafeBrand(rawBrand);
    const brand = lastBrand;
    const date = parseSafeDate(row[colDate]);
    const origRow = r + 1;

    // 유형별 위반/모니터링 항목 수 집계
    const tally = {}; // sub → {vio, mon}
    for (const ic of itemCols) {
      const cell = row[ic.col];
      if (cell == null || norm(cell) === '') continue; // 빈칸 제외
      const n = Number(cell);
      if (!isFinite(n)) continue;
      const t = tally[ic.sub] || (tally[ic.sub] = { vio: 0, mon: 0 });
      if (n === 0) t.mon++; else t.vio++;
    }

    for (const sub of Object.keys(tally)) {
      const t = tally[sub];
      if (t.vio > 0) out.push(buildSafeRow(origRow, date, sub, brand, t.vio, '위반(처리중)', note));
      if (t.mon > 0) out.push(buildSafeRow(origRow, date, sub, brand, t.mon, '모니터링', note));
    }
  }
  return out;
}

function buildSafeRow(lineNo, date, subtype, brand, count, status, note) {
  const errs = [];
  if (!date) errs.push('점검일자 없음');
  if (!brand) errs.push('브랜드 없음');
  else if (!BRANDS.includes(brand)) errs.push(`브랜드 (${brand}) 알 수 없음`);
  return { lineNo, date, type: '안전', subtype, brand, count, status, note, errs, ok: errs.length === 0 };
}

function parseSafeDate(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().split('T')[0];
  if (typeof v === 'number' && isFinite(v)) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? '' : d.toISOString().split('T')[0];
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    return isNaN(d) ? '' : d.toISOString().split('T')[0];
  }
  return '';
}

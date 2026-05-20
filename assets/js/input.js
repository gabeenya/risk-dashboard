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
  const note   = document.getElementById('f-note').value;
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
  document.getElementById('f-status').value  = '모니터링';
  document.getElementById('f-note').value    = '';
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
}

function setInpSubFilter(v)   { inpSub = v;   renderInputTable(); }
function setInpBrandFilter(v) { inpBrand = v; renderInputTable(); }
function resetInpFilters() {
  inpSub = 'all'; inpBrand = 'all';
  const sub = document.getElementById('inpSubFilter');
  const brn = document.getElementById('inpBrandFilter');
  if (sub) sub.value = 'all';
  if (brn) brn.value = 'all';
  renderInputTable();
}

function renderInputTable() {
  refreshInpFilterOpts();
  const tb  = document.getElementById('inputTbody');
  const cnt = document.getElementById('inpFilterCnt');
  let fl = records.filter(r => r.type === curType);
  const total = fl.length;
  if (inpSub !== 'all') {
    if (inpSub === '-') fl = fl.filter(r => !r.subtype || r.subtype === '-');
    else                fl = fl.filter(r => r.subtype === inpSub);
  }
  if (inpBrand !== 'all') fl = fl.filter(r => r.brand === inpBrand);
  if (cnt) cnt.textContent = (inpSub === 'all' && inpBrand === 'all')
    ? `총 ${total}건`
    : `${fl.length}건 / 총 ${total}건`;
  if (!fl.length) {
    tb.innerHTML = '<tr><td colspan="9"><div class="empty">조건에 해당하는 데이터가 없습니다</div></td></tr>';
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
        ${STATS.map(s => `<option value="${esc(s)}"${r.status===s?' selected':''}>${esc(statLbl(s, r.type))}</option>`).join('')}
      </select>
    </td>
    <td>
      <div class="note-wrap">
        <input type="text" class="note-inp" id="note-inp-${rid}"
          value="${esc(r.note||'')}" placeholder="-"
          onkeydown="if(event.key==='Enter'){const b=document.getElementById('note-btn-${rid}');updNote(${rid},this.value,b)}">
        <button class="note-save-btn" id="note-btn-${rid}"
          onclick="updNote(${rid},document.getElementById('note-inp-${rid}').value,this)">저장</button>
      </div>
    </td>
    <td class="cell-muted">${esc(r.author||'-')}</td>
    <td><button class="del-btn" onclick="delRecord(${rid})">✕</button></td>
  </tr>`;
  }).join('');
}

// ── 엑셀 일괄 업로드 ──────────────────────────────────
// 검증된 행을 임시로 보관 (확정 시 INSERT)
let xlParsed = [];

// 헤더 키 (양식 다운로드 + 업로드 파싱 시 공통으로 사용)
const XL_HEADERS = ['날짜','영역','상세유형','브랜드','건수','상태','비고'];

function downloadExcelTemplate() {
  if (typeof XLSX === 'undefined') { toast('엑셀 라이브러리 로드 실패'); return; }
  const wb = XLSX.utils.book_new();

  // 시트1: 데이터 — 헤더 + 예시 1행
  const today = td();
  const sample = [XL_HEADERS,
    [today, '가맹', '예상매출액 임의산정', '애슐리', 1, '모니터링', '예시 행 — 삭제 후 입력하세요'],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sample);
  ws1['!cols'] = [{wch:12},{wch:10},{wch:24},{wch:14},{wch:7},{wch:12},{wch:30}];
  XLSX.utils.book_append_sheet(wb, ws1, '데이터');

  // 시트2: 참고_유효값 — 영역/상태/브랜드/영역별 상세유형
  const ref = [];
  ref.push(['영역', '상태', '브랜드']);
  const maxLen = Math.max(TYPES.length, STATS.length, BRANDS.length);
  for (let i = 0; i < maxLen; i++) {
    ref.push([TYPES[i]||'', STATS[i]||'', BRANDS[i]||'']);
  }
  ref.push([]);
  ref.push(['영역별 상세유형 (영역 선택에 맞는 값을 사용)']);
  ref.push(['영역', '상세유형']);
  TYPES.forEach(t => {
    const subs = SUB[t] || [];
    if (subs.length === 0) ref.push([t, '(상세유형 없음)']);
    else subs.forEach(s => ref.push([t, s]));
  });
  const ws2 = XLSX.utils.aoa_to_sheet(ref);
  ws2['!cols'] = [{wch:14},{wch:28},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws2, '참고_유효값');

  XLSX.writeFile(wb, `리스크데이터_양식_${today}.xlsx`);
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
    <td>${esc(r.status||'-')}</td>
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
}

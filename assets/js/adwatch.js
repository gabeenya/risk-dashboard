// ── 표시광고 "뒷광고 의심" 자동 모니터링 ───────────────
// 네이버 검색 API + Claude 1차 판별(Edge Function ad-watch-scan) 결과를
// 검수 큐로 보여주고, 사람이 확인 후 '적발등록'(records를 위반(처리중)으로 생성) /
// '모니터링'(records를 모니터링으로 생성) 처리한다.

function renderAdWatchPanel() {
  renderHgBrandGrid();
  const fromEl = document.getElementById('hgFrom');
  const toEl   = document.getElementById('hgTo');
  if (fromEl && toEl && !fromEl.value && !toEl.value) {
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    fromEl.value = from.toISOString().split('T')[0];
    toEl.value   = td();
  }
  loadAdWatchCandidates();
}

function renderHgBrandGrid() {
  const grid = document.getElementById('hgBrandGrid');
  if (!grid || grid.dataset.rendered) return; // 체크 상태 유지를 위해 최초 1회만 렌더
  grid.innerHTML = BRANDS.map(b =>
    `<label class="ai-brand-opt"><input type="checkbox" class="hg-brand-cb" value="${esc(b)}"> ${esc(b)}</label>`
  ).join('');
  grid.dataset.rendered = '1';
}

function hgBrandAll(checked) {
  document.querySelectorAll('.hg-brand-cb').forEach(cb => { cb.checked = checked; });
}

async function loadAdWatchCandidates() {
  try {
    const rows = await sbGet('ad_watch_candidates');
    adWatchCandidates = (rows || []).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  } catch (e) {
    console.error('[loadAdWatchCandidates]', e);
    adWatchCandidates = [];
  }
  const liveIds = new Set(adWatchCandidates.map(c => Number(c.id) || 0));
  hgSelected.forEach(id => { if (!liveIds.has(id)) hgSelected.delete(id); });
  renderAdWatchList();
}

async function runAdWatchScan() {
  const from = document.getElementById('hgFrom')?.value || '';
  const to   = document.getElementById('hgTo')?.value || '';
  if (!from || !to) { toast('기간을 지정해주세요.'); return; }
  if (from > to) { toast('시작일이 종료일보다 늦을 수 없습니다.'); return; }
  const checked = Array.from(document.querySelectorAll('.hg-brand-cb:checked')).map(cb => cb.value);
  const brands = checked.length ? checked : BRANDS;

  const btn = document.getElementById('hgScanBtn');
  const ind = document.getElementById('hgScanInd');
  const summaryEl = document.getElementById('hgScanSummary');
  btn.disabled = true;
  ind.classList.add('show');
  if (summaryEl) summaryEl.textContent = '';

  try {
    const r = await fetch(`${SB_URL}/functions/v1/ad-watch-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      body: JSON.stringify({ from, to, brands }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);

    await loadAdWatchCandidates();
    if (summaryEl) {
      const savedCnt = Array.isArray(data.inserted) ? data.inserted.length : 0;
      summaryEl.textContent = `이번 스캔: 검색된 게시물 ${data.totalFound ?? 0}건 중 ${savedCnt}건 저장`
        + (data.truncated ? ' — 처리 상한을 초과했습니다. 기간/브랜드를 좁혀 재스캔하면 더 볼 수 있습니다.' : '');
    }
    toast('스캔이 완료되었습니다.');
  } catch (e) {
    console.error('[runAdWatchScan]', e);
    toast('스캔 실패 — ' + String(e.message || e).slice(0, 120));
  } finally {
    btn.disabled = false;
    ind.classList.remove('show');
  }
}

function hgVerdictBadge(verdict, bodyOk, imageCount) {
  const cls = verdict === '의심' ? 'hg-verdict-high'
            : verdict === '주의' ? 'hg-verdict-mid'
            : verdict === '낮음' ? 'hg-verdict-low'
            : 'hg-verdict-none';
  const label = verdict || 'AI 미분류';
  const warn = bodyOk === false
    ? ' <span class="hg-body-warn" title="본문 수집 실패 — 검색 요약(스니펫)만으로 판별되어 정확도가 낮을 수 있습니다">본문 미확인</span>'
    : '';
  const imgBadge = imageCount > 0
    ? ` <span class="hg-img-badge" title="사진 ${imageCount}장을 함께 분석했습니다">🖼 ${imageCount}</span>`
    : '';
  return `<span class="hg-verdict ${cls}">${esc(label)}</span>${warn}${imgBadge}`;
}

function hgStatusClass(status) {
  return status === '적발등록' ? 's-done' : status === '오탐제외' ? 'hg-status-dismiss' : 's-mon';
}

function renderAdWatchList() {
  const tb = document.getElementById('adWatchTbody');
  if (!tb) return;
  if (!adWatchCandidates.length) {
    tb.innerHTML = '<tr><td colspan="9"><div class="empty">스캔 결과가 없습니다</div></td></tr>';
    updHgBulkUI();
    return;
  }
  tb.innerHTML = adWatchCandidates.map(c => {
    const rid = Number(c.id) || 0;
    const actions = c.status === '검토대기'
      ? `<button class="btn-sec hg-act-btn" onclick="registerAdWatchAsRecord(${rid})">적발등록</button>
         <button class="btn-sec hg-act-btn" onclick="dismissAdWatchCandidate(${rid})">모니터링</button>`
      : '<span class="cell-muted">-</span>';
    return `<tr>
      <td class="chk-cell"><input type="checkbox" class="inp-chk"${hgSelected.has(rid) ? ' checked' : ''} onchange="toggleHgSel(${rid},this.checked)"></td>
      <td>${esc(c.brand)}</td>
      <td>${esc(c.platform)}</td>
      <td><a href="${esc(c.link)}" target="_blank" rel="noopener noreferrer">${esc(c.title)}</a></td>
      <td>${esc(c.post_date || '미상')}</td>
      <td>${hgVerdictBadge(c.ai_verdict, c.body_fetch_ok, Number(c.image_count) || 0)}</td>
      <td class="hg-reason-cell">${esc(c.ai_reason || '-')}</td>
      <td><span class="st ${hgStatusClass(c.status)}">${esc(c.status)}</span></td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
  updHgBulkUI();
}

async function registerAdWatchAsRecord(id) {
  const cand = adWatchCandidates.find(c => Number(c.id) === Number(id));
  if (!cand) return;
  if (!confirm(`이 게시물을 표시광고/뒷광고 적발 건으로 등록하시겠습니까?\n\n${cand.title}`)) return;

  setInputType(null, '표시광고');
  document.getElementById('f-date').value = cand.post_date || td();
  const subSel = document.getElementById('f-subtype');
  if (subSel) subSel.value = '뒷광고';
  const brandSel = document.getElementById('f-brand');
  if (brandSel && BRANDS.includes(cand.brand)) brandSel.value = cand.brand;
  document.getElementById('f-status').value = '위반(처리중)';
  document.getElementById('f-count').value = 1;
  document.getElementById('f-note').value = `[자동탐지] ${cand.link}\n${cand.ai_reason || ''}`.trim();

  await addRecord();

  const ok = await sbUpd('ad_watch_candidates', id, { status: '적발등록', reviewed_by: user?.name || null });
  if (ok) {
    cand.status = '적발등록';
    renderAdWatchList();
  }
}

async function dismissAdWatchCandidate(id) {
  const cand = adWatchCandidates.find(c => Number(c.id) === Number(id));
  if (!cand) return;
  if (!confirm(`이 게시물을 모니터링 건으로 등록하시겠습니까?(적발 아님)\n\n${cand.title}`)) return;

  setInputType(null, '표시광고');
  document.getElementById('f-date').value = cand.post_date || td();
  const subSel = document.getElementById('f-subtype');
  if (subSel) subSel.value = '뒷광고';
  const brandSel = document.getElementById('f-brand');
  if (brandSel && BRANDS.includes(cand.brand)) brandSel.value = cand.brand;
  document.getElementById('f-status').value = '모니터링';
  document.getElementById('f-count').value = 1;
  document.getElementById('f-note').value = `[자동탐지] ${cand.link}\n${cand.ai_reason || ''}`.trim();

  await addRecord();

  const ok = await sbUpd('ad_watch_candidates', id, { status: '오탐제외', reviewed_by: user?.name || null });
  if (!ok) { toast('처리 실패'); return; }
  cand.status = '오탐제외';
  renderAdWatchList();
  toast('모니터링 건으로 등록되었습니다.');
}

// ── 다중 선택 / 다중 삭제 ─────────────────────────
function toggleHgSel(id, checked) {
  const rid = Number(id) || 0;
  if (checked) hgSelected.add(rid); else hgSelected.delete(rid);
  updHgBulkUI();
}

function toggleHgSelAll(checked) {
  adWatchCandidates.forEach(c => {
    const rid = Number(c.id) || 0;
    if (checked) hgSelected.add(rid); else hgSelected.delete(rid);
  });
  renderAdWatchList();
}

function updHgBulkUI() {
  const selCnt = adWatchCandidates.reduce((n, c) => n + (hgSelected.has(Number(c.id) || 0) ? 1 : 0), 0);
  const cnt = document.getElementById('hgBulkCnt');
  const btn = document.getElementById('hgBulkDelBtn');
  const all = document.getElementById('hgChkAll');
  if (cnt) cnt.textContent = `${selCnt}개 선택됨`;
  if (btn) btn.disabled = selCnt === 0;
  if (all) {
    all.checked = adWatchCandidates.length > 0 && selCnt === adWatchCandidates.length;
    all.indeterminate = selCnt > 0 && selCnt < adWatchCandidates.length;
  }
}

async function bulkDelHgSelected() {
  const ids = adWatchCandidates.map(c => Number(c.id) || 0).filter(rid => rid && hgSelected.has(rid));
  if (!ids.length) { toast('선택된 항목이 없습니다.'); return; }
  if (!confirm(`선택한 ${ids.length}건을 삭제합니다.\n이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?`)) return;

  const btn = document.getElementById('hgBulkDelBtn');
  if (btn) { btn.disabled = true; btn.textContent = '삭제 중...'; }

  const ok = await sbDelMany('ad_watch_candidates', ids);

  if (btn) btn.textContent = '선택 삭제';
  if (!ok) {
    if (btn) btn.disabled = false;
    toast('삭제 중 오류가 발생했습니다.');
    return;
  }
  ids.forEach(id => hgSelected.delete(id));
  adWatchCandidates = adWatchCandidates.filter(c => !ids.includes(Number(c.id) || 0));
  renderAdWatchList();
  toast(`${ids.length}건이 삭제되었습니다.`);
}

// ── 표시광고 "뒷광고 의심" 자동 모니터링 ───────────────
// 네이버 검색 API + Claude 1차 판별(Edge Function ad-watch-scan) 결과를
// 검수 큐로 보여주고, 사람이 확인 후 '적발 등록'(records 생성) / '오탐 제외' 처리한다.

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
    tb.innerHTML = '<tr><td colspan="8"><div class="empty">스캔 결과가 없습니다</div></td></tr>';
    return;
  }
  tb.innerHTML = adWatchCandidates.map(c => {
    const rid = Number(c.id) || 0;
    const actions = c.status === '검토대기'
      ? `<button class="btn-sec hg-act-btn" onclick="registerAdWatchAsRecord(${rid})">적발 등록</button>
         <button class="btn-sec hg-act-btn" onclick="dismissAdWatchCandidate(${rid})">오탐 제외</button>`
      : '<span class="cell-muted">-</span>';
    return `<tr>
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
  if (!confirm('이 게시물을 오탐(광고 표시 문제 없음)으로 제외하시겠습니까?')) return;
  const ok = await sbUpd('ad_watch_candidates', id, { status: '오탐제외', reviewed_by: user?.name || null });
  if (!ok) { toast('처리 실패'); return; }
  const cand = adWatchCandidates.find(c => Number(c.id) === Number(id));
  if (cand) cand.status = '오탐제외';
  renderAdWatchList();
  toast('오탐 제외 처리되었습니다.');
}

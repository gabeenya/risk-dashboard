// ── AI 분석 ──────────────────────────────────────────
const AI_SECTIONS = {
  risk:    { label: '위험도 식별', instr: '위험도가 높은 영역과 상세 유형을 식별하고 그 이유를 설명' },
  trend:   { label: '트렌드 분석', instr: '월별 데이터 기반 트렌드 분석 및 향후 예측' },
  rate:    { label: '완료율',     instr: '조치 완료율과 처리 진행 상황을 수치 기반으로 평가' },
  advice:  { label: '권고사항',   instr: '현황 개선을 위한 구체적이고 실행 가능한 권고사항' },
  plan:    { label: '액션 플랜',  instr: '단기·중기 액션 플랜과 우선순위를 표 또는 목록으로 제시' },
  compare: { label: '브랜드별 비교', instr: '선택된 브랜드들 간 리스크 패턴 비교 — 강점/약점, 상대적 위험도, 브랜드 단위 권고사항' }
};

function aiOptAll(checked) {
  document.querySelectorAll('.ai-opt-cb').forEach(cb => { cb.checked = checked; });
}

function aiPeriodClear() {
  const f = document.getElementById('aiDateFrom');
  const t = document.getElementById('aiDateTo');
  if (f) f.value = '';
  if (t) t.value = '';
}

function renderBrandPicker() {
  const grid = document.getElementById('aiBrandGrid');
  if (!grid) return;
  // 사용자 권한이 바뀔 때(로그아웃 → 다른 계정 로그인)에도 다시 그려야 하므로 매번 렌더
  const list = isAdmin() ? BRANDS : userBrands().filter(b => BRANDS.includes(b));
  grid.innerHTML = list.map(b =>
    `<label class="ai-brand-opt"><input type="checkbox" class="ai-brand-cb" value="${b}" checked> ${b}</label>`
  ).join('');
}

function aiBrandAll(checked) {
  document.querySelectorAll('.ai-brand-cb').forEach(cb => { cb.checked = checked; });
}

async function runAI() {
  console.log('[AI] runAI 진입 — records:', records?.length);
  if (!records || !records.length) {
    alert('분석할 데이터가 없습니다. 데이터를 먼저 입력해주세요.');
    return;
  }
  const selected = Array.from(document.querySelectorAll('.ai-opt-cb:checked')).map(cb => cb.value);
  console.log('[AI] 선택된 항목:', selected);
  if (!selected.length) { alert('분석할 항목을 1개 이상 선택해 주세요.'); return; }

  // 1단계: 분석 대상 브랜드. 전체이거나 미선택이면 권한 내 전체 브랜드.
  const allowedBrands = isAdmin() ? BRANDS : userBrands().filter(b => BRANDS.includes(b));
  const brandChecked  = Array.from(document.querySelectorAll('.ai-brand-cb:checked')).map(cb => cb.value);
  const isAllBrands   = !brandChecked.length || brandChecked.length === allowedBrands.length;
  const targetBrands  = isAllBrands ? allowedBrands : brandChecked;
  console.log('[AI] 분석 대상 브랜드:', isAllBrands ? '(전체)' : targetBrands.join(', '));

  document.getElementById('aiBtn').disabled = true;
  document.getElementById('aiLoad').style.display = 'block';
  document.getElementById('aiResult').style.display = 'none';
  document.getElementById('aiEmpty').style.display = 'none';

  // 분석 기간 필터
  const dateFrom = document.getElementById('aiDateFrom')?.value || '';
  const dateTo   = document.getElementById('aiDateTo')?.value   || '';

  // 선택된 브랜드 + 기간으로 데이터 필터링
  const scoped = (isAllBrands ? records : records.filter(r => targetBrands.includes(r.brand)))
    .filter(r => {
      if (!r.date) return true;
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo   && r.date > dateTo)   return false;
      return true;
    });

  const tot  = scoped.reduce((s, r) => s + r.count, 0);
  const byT  = TYPES.map(t => ({ type: t, cnt: scoped.filter(r => r.type === t).reduce((s, r) => s + r.count, 0) }));
  const byB  = targetBrands.map(b => ({ brand: b, cnt: scoped.filter(r => r.brand === b).reduce((s, r) => s + r.count, 0) })).filter(b => b.cnt > 0);
  const vio  = scoped.filter(r => r.status === '위반(처리중)').reduce((s, r) => s + r.count, 0);
  const done = scoped.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
  const now  = new Date();
  const monthly = Array(12).fill(0).map((_, i) => {
    const ym = now.getFullYear() + '-' + String(i+1).padStart(2,'0');
    return {
      m: i+1,
      t: scoped.filter(r => r.date.startsWith(ym)).reduce((s, r) => s + r.count, 0),
      v: scoped.filter(r => r.date.startsWith(ym) && (r.status === '위반(처리중)' || r.status === '완료')).reduce((s, r) => s + r.count, 0)
    };
  }).filter(m => m.t > 0);

  // 브랜드별 상세 통계 — 분석 대상 브랜드에 한해 영역별 분포까지 제공
  const brandDetail = targetBrands.map(b => {
    const rs = scoped.filter(r => r.brand === b);
    if (!rs.length) return `- ${b}: 데이터 없음`;
    const t   = rs.reduce((s, r) => s + r.count, 0);
    const v   = rs.filter(r => r.status === '위반(처리중)').reduce((s, r) => s + r.count, 0);
    const dn  = rs.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
    const tBy = TYPES.map(t2 => {
      const c = rs.filter(r => r.type === t2).reduce((s, r) => s + r.count, 0);
      return c > 0 ? `${t2} ${c}` : null;
    }).filter(Boolean).join(', ');
    return `- ${b}: 총 ${t}건 (위반(처리중) ${v}, 완료 ${dn}) — 영역: ${tBy || '없음'}`;
  }).join('\n');

  // 분석 항목별 지시사항. 분석 대상 브랜드 컨텍스트를 모든 항목에 적용하도록 명시한다.
  const brandScopeNote = isAllBrands ? '전체 브랜드' : `지정 ${targetBrands.length}개 브랜드 (${targetBrands.join(', ')})`;
  const periodNote = (dateFrom || dateTo)
    ? `${dateFrom || '전체'} ~ ${dateTo || '전체'}`
    : '전체 기간';
  const sectionList = selected.map((k, i) =>
    `${i+1}. **${AI_SECTIONS[k].label}** — ${AI_SECTIONS[k].instr}`
  ).join('\n');

  // 사용자 추가 컨텍스트 (선택). 비어있으면 섹션 자체를 생략.
  const userCtx = (document.getElementById('aiContext')?.value || '').trim();
  const ctxSection = userCtx
    ? '## 사용자 요청 컨텍스트 (반드시 반영)\n'
      + userCtx + '\n'
      + '※ 위 관점·요구사항을 모든 분석 항목에 일관되게 반영하세요.\n\n'
    : '';
  console.log('[AI] 사용자 컨텍스트:', userCtx || '(없음)');

  const prompt = '외식BG RO실의 리스크 현황을 분석해주세요.\n\n'
    + ctxSection
    + `## 분석 대상 브랜드 (반드시 이 범위 안에서만 분석)\n${brandScopeNote}\n`
    + '※ 모든 분석 항목은 위 브랜드의 데이터에 한정해 작성하세요. 범위 밖 브랜드는 언급하지 마세요.\n\n'
    + `## 분석 기간\n${periodNote}\n\n`
    + '## 전체 현황 (분석 대상 브랜드 기준)\n'
    + '- 총 모니터링: ' + tot + '건 | 위반(처리중): ' + vio + '건 | 완료: ' + done + '건\n'
    + '- 위반율: ' + (tot ? (((vio+done)/tot)*100).toFixed(1) : 0) + '% | 처리완료율: ' + ((vio+done) ? ((done/(vio+done))*100).toFixed(1) : 0) + '%\n\n'
    + '## 영역별\n' + byT.map(t => '- ' + t.type + ': ' + t.cnt + '건').join('\n') + '\n\n'
    + '## 브랜드별 상세\n' + (brandDetail || '데이터 없음') + '\n\n'
    + '## 월별 추이\n' + (monthly.length ? monthly.map(m => '- ' + m.m + '월: 모니터링 ' + m.t + '건, 위반 ' + m.v + '건').join('\n') : '데이터 없음') + '\n\n'
    + '다음 항목들에 대해서만 한국어로 분석해주세요. 선택되지 않은 항목은 다루지 마세요:\n'
    + sectionList;

  console.log('[AI] prompt 길이:', prompt.length, 'chars');

  const theme = localStorage.getItem('aiStyle') || 'notion';
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);

  try {
    console.log('[AI] fetch 시작 (스트리밍)');
    const res = await fetch(`${SB_URL}/functions/v1/ai-analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY
      },
      body: JSON.stringify({ prompt }),
      signal: ctrl.signal
    });
    console.log('[AI] HTTP 응답:', res.status, res.statusText);

    if (!res.ok) {
      const errText = await res.text();
      let errData;
      try { errData = JSON.parse(errText); } catch { errData = { error: errText }; }
      const msg = (typeof errData.error === 'string') ? errData.error : (errData.error?.message || errText.slice(0, 100));
      throw new Error(`서버 오류 (HTTP ${res.status}): ${msg}`);
    }

    // 결과 영역 준비
    document.getElementById('aiResult').innerHTML =
      `<div class="ai-result-body"><div class="ai-md theme-${theme}" id="aiStreamContent"></div></div>` +
      `<div class="ai-result-foot" id="aiResultFoot" style="display:none">` +
      `<p class="ai-meta">분석 기준: ${now.toLocaleDateString('ko-KR')}</p>` +
      `<button class="ai-copy-btn" onclick="copyAI()">복사</button></div>`;
    document.getElementById('aiLoad').style.display  = 'none';
    document.getElementById('aiResult').style.display = 'block';

    const contentEl = document.getElementById('aiStreamContent');
    const reader    = res.body.getReader();
    const decoder   = new TextDecoder();
    let buffer  = '';
    let rawText = '';
    let renderPending = false;

    const flushRender = () => {
      renderPending = false;
      const html = (typeof marked !== 'undefined' && marked.parse)
        ? marked.parse(rawText)
        : rawText.replace(/\n/g, '<br>');
      contentEl.innerHTML = html;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        try {
          const evt = JSON.parse(dataStr);
          if (evt.error) throw new Error(evt.error);
          if (evt.t) {
            rawText += evt.t;
            if (!renderPending) { renderPending = true; setTimeout(flushRender, 40); }
          }
        } catch(parseErr) {
          if (parseErr instanceof SyntaxError) continue;
          throw parseErr;
        }
      }
    }

    flushRender();
    document.getElementById('aiResultFoot').style.display = '';
    console.log('[AI] 스트리밍 완료, 텍스트 길이:', rawText.length);
  } catch(e) {
    console.error('[AI 분석] 오류 발생:', e);
    const msg = e.name === 'AbortError'
      ? '120초 내에 응답 없음 (네트워크 또는 서버 지연)'
      : ((e && e.message) || String(e));
    document.getElementById('aiResult').innerHTML =
      `<div class="ai-error"><strong>분석 오류</strong><br><small>${msg}</small><br><small style="color:#94a3b8">F12 → Console 탭에서 [AI] 로그 확인</small></div>`;
    document.getElementById('aiResult').style.display = 'block';
  } finally {
    clearTimeout(timer);
    document.getElementById('aiLoad').style.display  = 'none';
    document.getElementById('aiBtn').disabled = false;
  }
}

function copyAI() {
  navigator.clipboard.writeText(document.getElementById('aiResult').innerText).then(() => toast('복사되었습니다!'));
}

function changeAIStyle() {
  const style = document.getElementById('aiStyle').value;
  localStorage.setItem('aiStyle', style);
  const md = document.querySelector('#aiResult .ai-md');
  if (md) md.className = 'ai-md theme-' + style;
}

function initAIStyle() {
  const saved = localStorage.getItem('aiStyle') || 'notion';
  const sel = document.getElementById('aiStyle');
  if (sel) sel.value = saved;
}

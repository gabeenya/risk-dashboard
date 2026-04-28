// ── AI 분석 ──────────────────────────────────────────
const AI_SECTIONS = {
  risk:   { label: '위험도 식별',   instr: '위험도가 높은 브랜드와 영역을 식별하고 그 이유를 설명' },
  trend:  { label: '트렌드 분석',   instr: '월별 데이터 기반 트렌드 분석 및 향후 예측' },
  rate:   { label: '완료율',       instr: '조치 완료율과 처리 진행 상황을 수치 기반으로 평가' },
  advice: { label: '권고사항',     instr: '현황 개선을 위한 구체적이고 실행 가능한 권고사항' },
  plan:   { label: '액션 플랜',    instr: '단기·중기 액션 플랜과 우선순위를 표 또는 목록으로 제시' },
  brand:  { label: '브랜드별 분석', instr: '주요 브랜드별 리스크 패턴, 강점/약점, 브랜드 단위 권고사항' }
};

function aiOptAll(checked) {
  document.querySelectorAll('.ai-opt-cb').forEach(cb => { cb.checked = checked; });
  const brandCb = document.querySelector('.ai-opt-cb[value="brand"]');
  if (brandCb) toggleBrandPicker(brandCb);
}

function toggleBrandPicker(cb) {
  const picker = document.getElementById('aiBrandPicker');
  if (!picker) return;
  if (cb.checked) {
    renderBrandPicker();
    picker.style.display = '';
  } else {
    picker.style.display = 'none';
  }
}

function renderBrandPicker() {
  const grid = document.getElementById('aiBrandGrid');
  if (!grid || grid.dataset.rendered === '1') return;
  grid.innerHTML = BRANDS.map(b =>
    `<label class="ai-brand-opt"><input type="checkbox" class="ai-brand-cb" value="${b}" checked> ${b}</label>`
  ).join('');
  grid.dataset.rendered = '1';
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

  document.getElementById('aiBtn').disabled = true;
  document.getElementById('aiLoad').style.display = 'block';
  document.getElementById('aiResult').style.display = 'none';
  document.getElementById('aiEmpty').style.display = 'none';

  // 브랜드별 분석을 선택했고 일부 브랜드만 골랐다면, 그 브랜드 목록 추출
  let selectedBrands = null;
  if (selected.includes('brand')) {
    const checked = Array.from(document.querySelectorAll('.ai-brand-cb:checked')).map(cb => cb.value);
    if (checked.length && checked.length < BRANDS.length) selectedBrands = checked;
  }

  const tot  = records.reduce((s, r) => s + r.count, 0);
  const byT  = TYPES.map(t => ({ type: t, cnt: records.filter(r => r.type === t).reduce((s, r) => s + r.count, 0) }));
  const byB  = BRANDS.map(b => ({ brand: b, cnt: records.filter(r => r.brand === b).reduce((s, r) => s + r.count, 0) })).filter(b => b.cnt > 0);
  const vio  = records.filter(r => r.status === '위반(처리중)').reduce((s, r) => s + r.count, 0);
  const done = records.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
  const now  = new Date();
  const monthly = Array(12).fill(0).map((_, i) => {
    const ym = now.getFullYear() + '-' + String(i+1).padStart(2,'0');
    return {
      m: i+1,
      t: records.filter(r => r.date.startsWith(ym)).reduce((s, r) => s + r.count, 0),
      v: records.filter(r => r.date.startsWith(ym) && (r.status === '위반(처리중)' || r.status === '완료')).reduce((s, r) => s + r.count, 0)
    };
  }).filter(m => m.t > 0);

  // 브랜드별 상세 통계 (선택된 항목이 'brand'인 경우에만 prompt에 추가)
  const brandTargets = selectedBrands || BRANDS;
  const brandDetail = brandTargets.map(b => {
    const rs   = records.filter(r => r.brand === b);
    if (!rs.length) return null;
    const t    = rs.reduce((s, r) => s + r.count, 0);
    const v    = rs.filter(r => r.status === '위반(처리중)').reduce((s, r) => s + r.count, 0);
    const dn   = rs.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0);
    const tBy  = TYPES.map(t2 => {
      const c = rs.filter(r => r.type === t2).reduce((s, r) => s + r.count, 0);
      return c > 0 ? `${t2} ${c}` : null;
    }).filter(Boolean).join(', ');
    return `- ${b}: 총 ${t}건 (위반(처리중) ${v}, 완료 ${dn}) — 영역: ${tBy || '없음'}`;
  }).filter(Boolean).join('\n');

  // 선택된 항목별 지시사항. 'brand'에 선택 브랜드 명시
  const sectionList = selected.map((k, i) => {
    if (k === 'brand' && selectedBrands) {
      return `${i+1}. **${AI_SECTIONS[k].label}** (지정 브랜드: ${selectedBrands.join(', ')}) — ${AI_SECTIONS[k].instr}. 지정된 브랜드만 다루세요.`;
    }
    return `${i+1}. **${AI_SECTIONS[k].label}** — ${AI_SECTIONS[k].instr}`;
  }).join('\n');

  const brandSection = selected.includes('brand')
    ? '\n## 브랜드별 상세' + (selectedBrands ? ` (지정 ${selectedBrands.length}개)` : '') + '\n' + (brandDetail || '데이터 없음') + '\n'
    : '## 브랜드별\n' + byB.sort((a,b) => b.cnt - a.cnt).slice(0, 13).map(b => '- ' + b.brand + ': ' + b.cnt + '건').join('\n') + '\n';

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
    + '## 전체 현황\n'
    + '- 총 모니터링: ' + tot + '건 | 위반(처리중): ' + vio + '건 | 완료: ' + done + '건\n'
    + '- 위반율: ' + (tot ? (((vio+done)/tot)*100).toFixed(1) : 0) + '% | 처리완료율: ' + ((vio+done) ? ((done/(vio+done))*100).toFixed(1) : 0) + '%\n\n'
    + '## 영역별\n' + byT.map(t => '- ' + t.type + ': ' + t.cnt + '건').join('\n') + '\n\n'
    + brandSection + '\n'
    + '## 월별 추이\n' + monthly.map(m => '- ' + m.m + '월: 모니터링 ' + m.t + '건, 위반 ' + m.v + '건').join('\n') + '\n\n'
    + '다음 항목들에 대해서만 한국어로 분석해주세요. 선택되지 않은 항목은 다루지 마세요:\n'
    + sectionList;

  console.log('[AI] prompt 길이:', prompt.length, 'chars');

  // 60초 타임아웃 설정 (Anthropic은 보통 5-30초)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);

  try {
    console.log('[AI] fetch 시작:', SB_URL + '/functions/v1/ai-analyze');
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

    const rawText = await res.text();
    console.log('[AI] 응답 본문 (첫 200자):', rawText.slice(0, 200));

    let data;
    try { data = JSON.parse(rawText); }
    catch { throw new Error(`JSON 파싱 실패 (HTTP ${res.status}): ${rawText.slice(0,100)}`); }

    if (!res.ok) {
      const msg = (typeof data.error === 'string') ? data.error : (data.error?.message || JSON.stringify(data.error));
      throw new Error(`서버 오류 (HTTP ${res.status}): ${msg}`);
    }
    if (data.type === 'error') {
      throw new Error(`Anthropic API 오류: ${data.error?.message || JSON.stringify(data.error)}`);
    }
    if (!data.content || !Array.isArray(data.content) || !data.content[0]?.text) {
      throw new Error('응답에 분석 텍스트 없음. 응답 키: ' + Object.keys(data).join(','));
    }

    const text  = data.content[0].text;
    console.log('[AI] 분석 텍스트 길이:', text.length, 'chars');
    const theme = localStorage.getItem('aiStyle') || 'notion';
    const html  = (typeof marked !== 'undefined' && marked.parse) ? marked.parse(text) : text.replace(/\n/g, '<br>');
    document.getElementById('aiResult').innerHTML =
      `<div class="ai-result-body"><div class="ai-md theme-${theme}">${html}</div></div>` +
      `<div class="ai-result-foot"><p class="ai-meta">분석 기준: ${now.toLocaleDateString('ko-KR')}</p>` +
      `<button class="ai-copy-btn" onclick="copyAI()">복사</button></div>`;
    document.getElementById('aiResult').style.display = 'block';
    console.log('[AI] 완료');
  } catch(e) {
    console.error('[AI 분석] 오류 발생:', e);
    const msg = e.name === 'AbortError' ? '60초 내에 응답 없음 (네트워크 또는 서버 지연)' : ((e && e.message) || String(e));
    document.getElementById('aiResult').innerHTML =
      `<div class="ai-error"><strong>분석 오류</strong><br><small>${msg}</small><br><small style="color:#94a3b8">F12 → Console 탭에서 [AI] 로그 확인</small></div>`;
    document.getElementById('aiResult').style.display = 'block';
  } finally {
    clearTimeout(timer);
    document.getElementById('aiLoad').style.display = 'none';
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

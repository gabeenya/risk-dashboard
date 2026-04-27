// ── AI 분석 ──────────────────────────────────────────
async function runAI() {
  if (!records.length) { alert('분석할 데이터가 없습니다.'); return; }
  document.getElementById('aiBtn').disabled = true;
  document.getElementById('aiLoad').style.display = '';
  document.getElementById('aiResult').style.display = 'none';
  document.getElementById('aiEmpty').style.display = 'none';

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

  const prompt = '당신은 기업 법무팀의 공정거래 리스크 분석 전문가입니다. 외식BG RO실의 리스크 현황을 종합 분석해주세요.\n\n'
    + '## 전체 현황\n'
    + '- 총 모니터링: ' + tot + '건 | 위반(처리중): ' + vio + '건 | 완료: ' + done + '건\n'
    + '- 위반율: ' + (tot ? (((vio+done)/tot)*100).toFixed(1) : 0) + '% | 처리완료율: ' + ((vio+done) ? ((done/(vio+done))*100).toFixed(1) : 0) + '%\n\n'
    + '## 영역별\n' + byT.map(t => '- ' + t.type + ': ' + t.cnt + '건').join('\n') + '\n\n'
    + '## 브랜드별\n' + byB.sort((a,b) => b.cnt - a.cnt).slice(0, 8).map(b => '- ' + b.brand + ': ' + b.cnt + '건').join('\n') + '\n\n'
    + '## 월별 추이\n' + monthly.map(m => '- ' + m.m + '월: 모니터링 ' + m.t + '건, 위반 ' + m.v + '건').join('\n') + '\n\n'
    + '다음을 포함해 한국어로 분석해주세요:\n'
    + '1. **위험도 높은 브랜드/영역 식별**\n'
    + '2. **월별 트렌드 분석 및 예측**\n'
    + '3. **조치 완료율 및 처리 현황**\n'
    + '4. **개선 권고사항 및 액션 플랜**\n'
    + '5. **종합 리스크 등급 (상/중/하)**';

  try {
    const res = await fetch(`${SB_URL}/functions/v1/ai-analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API 오류 (' + res.status + ')');
    const text  = data.content[0].text;
    const theme = localStorage.getItem('aiStyle') || 'notion';
    const html  = marked.parse(text);
    document.getElementById('aiResult').innerHTML =
      `<div class="ai-result-body"><div class="ai-md theme-${theme}">${html}</div></div>` +
      `<div class="ai-result-foot"><p class="ai-meta">분석 기준: ${now.toLocaleDateString('ko-KR')}</p>` +
      `<button class="ai-copy-btn" onclick="copyAI()">복사</button></div>`;
    document.getElementById('aiResult').style.display = '';
  } catch(e) {
    document.getElementById('aiResult').innerHTML =
      `<div class="ai-error">분석 오류 (Edge Function 또는 API 키 확인 필요)<br><small>${e.message}</small></div>`;
    document.getElementById('aiResult').style.display = '';
  }

  document.getElementById('aiLoad').style.display = 'none';
  document.getElementById('aiBtn').disabled = false;
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

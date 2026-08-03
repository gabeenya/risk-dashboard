// Supabase Edge Function: weekly-report
// pg_cron(매주 금요일 15:00 KST)이 트리거 → 전체 11개 리스크 영역(records)에 대해
// 영역별 KPI·전주 대비 추이·SLA 초과(14일 이상 미해결)·전월 대비 임계치 경보·
// 최근 60일 반복/고위험 항목을 집계하고, Claude로 진단 요약 + 영역별 권고 조치를
// 생성한 뒤 Resend REST API로 이메일 발송한다.
//
// 필요 시크릿: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY(자동 제공), ANTHROPIC_API_KEY(ai-analyze와 공유),
//              RESEND_API_KEY, RESEND_SENDER_EMAIL(선택, 기본 onboarding@resend.dev — Resend 샌드박스 발신 주소),
//              RESEND_SENDER_NAME(선택), REPORT_RECIPIENTS(콤마 구분 수신자 목록)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Rec = { date: string; type: string; subtype?: string; brand: string; count: number; status: string };

const TYPES = ['불법파견', '표시광고', '가맹', 'IP', '노무', '영업비밀', '부실채권', '위생', '안전', '클레임', '감사'];
const THRESHOLDS_DEFAULT: Record<string, { delta: number; mom: number }> = Object.fromEntries(
  TYPES.map(t => [t, { delta: 10, mom: 50 }])
);
const SLA_DAYS = 14;
const REPEAT_LOOKBACK_DAYS = 60;   // 반복/고위험 항목 판단 기간
const REPEAT_MIN_INCIDENTS = 2;    // 이 기간 내 발생 회차(날짜 수)가 이 값 이상이면 "반복"
const REPEAT_MIN_COUNT = 5;        // 또는 누적 건수가 이 값 이상이면 "고위험"

function daysSince(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function esc(s: unknown) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// Supabase REST는 한 응답에 최대 1000행만 반환 — Range로 페이지네이션(assets/js/config.js sbGet과 동일 패턴)
async function fetchAll<T>(table: string, select: string, filter = ''): Promise<T[]> {
  const out: T[] = [];
  const STEP = 1000;
  let from = 0, total = Infinity;
  while (from < total) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}${filter}`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${from}-${from + STEP - 1}`,
        Prefer: 'count=exact',
      },
    });
    if (!r.ok) { if (from === 0) throw new Error(`${table} 조회 실패: HTTP ${r.status}`); break; }
    const batch = await r.json();
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
    const cr = r.headers.get('content-range');
    if (cr?.includes('/')) { const t = parseInt(cr.split('/')[1], 10); if (!isNaN(t)) total = t; }
    from += batch.length;
  }
  return out;
}

function buildPrompt(d: {
  weekTotal: number; weekByType: { type: string; cnt: number }[]; topBrands: [string, number][];
  slaCnt: number; slaTop: { type: string; brand: string; days: number; count: number }[];
  alerts: { type: string; curr: number; prev: number; delta: number | null; pct: number | null }[];
  totMon: number; totVio: number; totDone: number; weekFrom: string; today: string;
  repeatHighRisk: { type: string; brand: string; incidentCnt: number; totalCount: number }[];
}) {
  return `외식BG RO실의 주간 리스크 현황을 이메일로 보낼 진단 요약과 영역별 권고 조치를 작성해주세요.

## 집계 기간
${d.weekFrom} ~ ${d.today} (최근 7일)

## 이번 주 신규 등록 (전체 영역)
- 총 ${d.weekTotal}건
- 영역별: ${d.weekByType.map(t => `${t.type} ${t.cnt}건`).join(', ') || '없음'}
- 상위 브랜드: ${d.topBrands.map(([b, c]) => `${b} ${c}건`).join(', ') || '없음'}

## 누적 현황 (전체 기간)
모니터링 ${d.totMon}건 / 위반(처리중) ${d.totVio}건 / 완료 ${d.totDone}건

## 14일 이상 미해결(SLA 초과) 위반(처리중)
총 ${d.slaCnt}건${d.slaTop.length ? '\n' + d.slaTop.map(r => `- ${r.type}/${r.brand}: ${r.days}일 경과, ${r.count}건`).join('\n') : ' (없음)'}

## 전월 대비 급증 경보 (임계치 초과 영역)
${d.alerts.length ? d.alerts.map(a => `- ${a.type}: 전월 ${a.prev}건 → 이번 달 ${a.curr}건${a.delta !== null ? ` (+${a.delta}건)` : ''}${a.pct !== null ? ` (+${a.pct}%)` : ''}`).join('\n') : '없음'}

## 최근 ${REPEAT_LOOKBACK_DAYS}일 반복/고위험 항목
${d.repeatHighRisk.length ? d.repeatHighRisk.map(g => `- ${g.type}/${g.brand}: ${g.incidentCnt}회 발생, 누적 ${g.totalCount}건`).join('\n') : '없음'}

## 작성 지침
- 한국어로 작성. 이메일 본문에 바로 삽입할 HTML 조각만 출력 (h3, h4, p, ul/li, strong 태그만 사용, markdown/코드펜스 금지, <html>/<body> 태그 금지)
- 구성:
  1) <h3>이번 주 진단 요약</h3> — 위 데이터에서 가장 주목할 위험 신호(SLA 초과·급증 경보·반복/고위험 항목 중심)를 1~2문장으로 요약
  2) <h3>영역별 권고 조치</h3> — 아래 11개 영역 이름을 **모두** 사용해 각 영역마다 <h4>영역명</h4><ul><li>...</li></ul> 형식으로 최소 1개 이상의 구체적 권고 조치를 작성. 해당 영역에 이번 주 특이사항이 없으면 "특이사항 없음 — 현행 모니터링 유지"처럼 간단히 작성해도 됨. 11개 영역(이 순서대로): ${TYPES.join(', ')}
- 데이터에 없는 내용은 추측하지 말 것. 전체 500단어 이내로 간결하게`;
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic API 오류: HTTP ${r.status} — ${await r.text()}`);
  const data = await r.json();
  return data?.content?.[0]?.text ?? '';
}

async function sendResendEmail(subject: string, html: string): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const senderEmail = Deno.env.get('RESEND_SENDER_EMAIL') || 'onboarding@resend.dev';
  const senderName = Deno.env.get('RESEND_SENDER_NAME') || '외식BG RO실 리스크 대시보드';
  const recipients = (Deno.env.get('REPORT_RECIPIENTS') || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY not configured' };
  if (!recipients.length) return { sent: false, reason: 'REPORT_RECIPIENTS not configured (콤마로 구분된 이메일 목록 필요)' };

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from: `${senderName} <${senderEmail}>`, to: recipients, subject, html }),
  });
  if (!r.ok) return { sent: false, reason: `Resend 발송 실패: HTTP ${r.status} — ${await r.text()}` };
  return { sent: true };
}

// 이메일 클라이언트 호환성을 위해 외부 차트 이미지 대신 중첩 테이블(너비%)로 막대를 그린다
// (div/border-radius 대신 테이블 셀 너비를 쓰는 게 Outlook 등에서 가장 안정적으로 렌더링됨).
function bar(pct: number, color: string) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e2e8f0;border-radius:3px;"><tr>
    <td width="${p}%" style="background:${color};height:9px;font-size:1px;line-height:9px;border-radius:3px;">&nbsp;</td>
    <td style="font-size:1px;line-height:9px;">&nbsp;</td>
  </tr></table>`;
}

function buildEmailHtml(d: {
  today: string;
  kpiByType: { type: string; weekNew: number; mon: number; vio: number; done: number }[];
  trend: { type: string; prev: number; curr: number; maxVal: number }[];
  slaCnt: number;
  alerts: { type: string; curr: number; prev: number; delta: number | null; pct: number | null }[];
  repeatHighRisk: { type: string; brand: string; incidentCnt: number; totalCount: number }[];
  aiHtml: string;
}) {
  const kpiRows = d.kpiByType.map(k => `
    <tr>
      <td style="padding:6px 10px;font-size:13px;border-bottom:1px solid #e2e8f0;">${esc(k.type)}</td>
      <td style="padding:6px 10px;font-size:13px;text-align:center;border-bottom:1px solid #e2e8f0;color:#4f86c6;font-weight:600;">${k.weekNew}</td>
      <td style="padding:6px 10px;font-size:13px;text-align:center;border-bottom:1px solid #e2e8f0;color:#5eba8a;">${k.mon}</td>
      <td style="padding:6px 10px;font-size:13px;text-align:center;border-bottom:1px solid #e2e8f0;color:#d95757;">${k.vio}</td>
      <td style="padding:6px 10px;font-size:13px;text-align:center;border-bottom:1px solid #e2e8f0;color:#9b7ed4;">${k.done}</td>
    </tr>`).join('');

  const trendRows = d.trend.map(t => {
    const delta = t.curr - t.prev;
    const deltaStr = delta === 0 ? '±0' : (delta > 0 ? `+${delta}` : `${delta}`);
    const deltaColor = delta > 0 ? '#d95757' : (delta < 0 ? '#5eba8a' : '#94a3b8');
    return `
    <tr>
      <td style="padding:8px 10px;font-size:13px;white-space:nowrap;vertical-align:middle;">${esc(t.type)}</td>
      <td style="padding:8px 10px;vertical-align:middle;">
        <div style="margin-bottom:3px;">${bar((t.prev / t.maxVal) * 100, '#94a3b8')}</div>
        <div>${bar((t.curr / t.maxVal) * 100, '#4f86c6')}</div>
      </td>
      <td style="padding:8px 10px;font-size:12px;text-align:right;white-space:nowrap;vertical-align:middle;color:#64748b;">
        지난주 ${t.prev} → 이번주 ${t.curr}<br><span style="color:${deltaColor};font-weight:600;">${deltaStr}</span>
      </td>
    </tr>`;
  }).join('');

  const alertBlock = d.alerts.length
    ? `<ul style="margin:8px 0;padding-left:20px;">${d.alerts.map(a =>
        `<li><strong>${esc(a.type)}</strong>: 전월 ${a.prev}건 → 이번 달 ${a.curr}건${a.delta !== null ? ` (+${a.delta}건)` : ''}${a.pct !== null ? ` (+${a.pct}%)` : ''}</li>`
      ).join('')}</ul>`
    : `<p style="color:#64748b;margin:8px 0;">이번 달 급증 경보 없음</p>`;

  const repeatBlock = d.repeatHighRisk.length
    ? `<ul style="margin:8px 0;padding-left:20px;">${d.repeatHighRisk.map(g =>
        `<li><strong>${esc(g.type)}/${esc(g.brand)}</strong>: 최근 ${REPEAT_LOOKBACK_DAYS}일 ${g.incidentCnt}회 발생, 누적 ${g.totalCount}건</li>`
      ).join('')}</ul>`
    : `<p style="color:#64748b;margin:8px 0;">반복/고위험으로 분류된 항목 없음</p>`;

  return `
  <div style="max-width:680px;margin:0 auto;font-family:-apple-system,'Segoe UI',sans-serif;color:#1e293b;">
    <div style="padding:24px 0 16px;border-bottom:2px solid #1e3a5f;">
      <h2 style="margin:0;font-size:20px;color:#1e3a5f;">외식BG RO실 주간 리스크 진단 리포트</h2>
      <p style="margin:4px 0 0;color:#64748b;font-size:13px;">기준일: ${d.today}</p>
    </div>

    <h3 style="font-size:15px;color:#1e3a5f;border-left:4px solid #1e3a5f;padding-left:8px;">영역별 KPI</h3>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
      <tr style="background:#f8fafc;">
        <th style="padding:6px 10px;font-size:12px;color:#64748b;text-align:left;">영역</th>
        <th style="padding:6px 10px;font-size:12px;color:#64748b;">이번 주 신규</th>
        <th style="padding:6px 10px;font-size:12px;color:#64748b;">모니터링</th>
        <th style="padding:6px 10px;font-size:12px;color:#64748b;">위반(처리중)</th>
        <th style="padding:6px 10px;font-size:12px;color:#64748b;">완료</th>
      </tr>
      ${kpiRows}
    </table>

    <h3 style="font-size:15px;color:#1e3a5f;border-left:4px solid #1e3a5f;padding-left:8px;">전주 대비 추이</h3>
    <p style="margin:6px 0;color:#94a3b8;font-size:12px;">회색 = 지난주 · 파랑 = 이번주</p>
    <table style="width:100%;border-collapse:collapse;margin:4px 0 16px;">
      ${trendRows}
    </table>

    <h3 style="font-size:15px;color:#1e3a5f;border-left:4px solid #1e3a5f;padding-left:8px;">14일 이상 미해결 (SLA 초과)</h3>
    <p style="margin:8px 0;">총 <strong style="color:#d95757;">${d.slaCnt}건</strong></p>

    <h3 style="font-size:15px;color:#1e3a5f;border-left:4px solid #1e3a5f;padding-left:8px;">전월 대비 급증 경보</h3>
    ${alertBlock}

    <h3 style="font-size:15px;color:#1e3a5f;border-left:4px solid #1e3a5f;padding-left:8px;">반복/고위험 항목 (최근 ${REPEAT_LOOKBACK_DAYS}일)</h3>
    ${repeatBlock}

    <div style="font-size:14px;line-height:1.6;margin-top:8px;">${d.aiHtml}</div>

    <p style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;">
      본 리포트는 매주 금요일 오후 3시(KST) 자동 발송됩니다. 상세 내역은 대시보드에서 확인하세요.
    </p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const records = await fetchAll<Rec>('records', '*');
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const weekFrom = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const prevWeekFrom = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);

    const weekRecs = records.filter(r => r.date && r.date >= weekFrom);
    const weekTotal = weekRecs.reduce((s, r) => s + r.count, 0);
    const weekByType = TYPES.map(t => ({ type: t, cnt: weekRecs.filter(r => r.type === t).reduce((s, r) => s + r.count, 0) })).filter(t => t.cnt > 0);
    const weekByBrand: Record<string, number> = {};
    weekRecs.forEach(r => { weekByBrand[r.brand] = (weekByBrand[r.brand] || 0) + r.count; });
    const topBrands = Object.entries(weekByBrand).sort((a, b) => b[1] - a[1]).slice(0, 5) as [string, number][];

    // 전주 대비 추이 — 지난주(8~14일 전) vs 이번주(0~7일 전) 영역별 신규 건수
    const prevWeekRecs = records.filter(r => r.date && r.date >= prevWeekFrom && r.date < weekFrom);
    const prevWeekByType: Record<string, number> = {};
    prevWeekRecs.forEach(r => { prevWeekByType[r.type] = (prevWeekByType[r.type] || 0) + r.count; });
    const curWeekByType: Record<string, number> = {};
    weekRecs.forEach(r => { curWeekByType[r.type] = (curWeekByType[r.type] || 0) + r.count; });
    const trendMax = Math.max(1, ...TYPES.map(t => Math.max(prevWeekByType[t] || 0, curWeekByType[t] || 0)));
    const trend = TYPES.map(t => ({ type: t, prev: prevWeekByType[t] || 0, curr: curWeekByType[t] || 0, maxVal: trendMax }));

    // 영역별 KPI
    const kpiByType = TYPES.map(t => ({
      type: t,
      weekNew: curWeekByType[t] || 0,
      mon: records.filter(r => r.type === t && r.status === '모니터링').reduce((s, r) => s + r.count, 0),
      vio: records.filter(r => r.type === t && r.status === '위반(처리중)').reduce((s, r) => s + r.count, 0),
      done: records.filter(r => r.type === t && r.status === '완료').reduce((s, r) => s + r.count, 0),
    }));

    const slaList = records
      .filter(r => r.status === '위반(처리중)' && daysSince(r.date) >= SLA_DAYS)
      .map(r => ({ type: r.type, brand: r.brand, count: r.count, days: daysSince(r.date) }))
      .sort((a, b) => b.days - a.days);
    const slaCnt = slaList.reduce((s, r) => s + r.count, 0);
    const slaTop = slaList.slice(0, 5);

    const ym = today.slice(0, 7);
    const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYm = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
    const alerts: { type: string; curr: number; prev: number; delta: number | null; pct: number | null }[] = [];
    TYPES.forEach(type => {
      const t = THRESHOLDS_DEFAULT[type];
      const curr = records.filter(r => r.type === type && r.date?.startsWith(ym) && r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
      const prev = records.filter(r => r.type === type && r.date?.startsWith(prevYm) && r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
      const delta = curr - prev;
      const hitDelta = delta >= t.delta && t.delta > 0;
      const pct = prev > 0 ? ((curr - prev) / prev) * 100 : null;
      const hitMom = pct !== null && pct >= t.mom && t.mom > 0;
      if (hitDelta || hitMom) alerts.push({ type, curr, prev, delta: hitDelta ? delta : null, pct: hitMom ? Math.round(pct!) : null });
    });

    // 반복/고위험 항목 — 최근 N일 내 같은 (영역, 브랜드) 조합이 여러 번 발생했거나 누적 건수가 많은 경우
    const repeatLookbackFrom = new Date(now.getTime() - REPEAT_LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
    const recentRecs = records.filter(r => r.date && r.date >= repeatLookbackFrom);
    const groupMap: Record<string, { type: string; brand: string; totalCount: number; dates: Set<string> }> = {};
    recentRecs.forEach(r => {
      const key = `${r.type}|${r.brand}`;
      if (!groupMap[key]) groupMap[key] = { type: r.type, brand: r.brand, totalCount: 0, dates: new Set() };
      groupMap[key].totalCount += r.count;
      groupMap[key].dates.add(r.date);
    });
    const repeatHighRisk = Object.values(groupMap)
      .map(g => ({ type: g.type, brand: g.brand, incidentCnt: g.dates.size, totalCount: g.totalCount }))
      .filter(g => g.incidentCnt >= REPEAT_MIN_INCIDENTS || g.totalCount >= REPEAT_MIN_COUNT)
      .sort((a, b) => (b.incidentCnt - a.incidentCnt) || (b.totalCount - a.totalCount))
      .slice(0, 10);

    const prompt = buildPrompt({
      weekTotal, weekByType, topBrands, slaCnt, slaTop, alerts,
      totMon: records.filter(r => r.status === '모니터링').reduce((s, r) => s + r.count, 0),
      totVio: records.filter(r => r.status === '위반(처리중)').reduce((s, r) => s + r.count, 0),
      totDone: records.filter(r => r.status === '완료').reduce((s, r) => s + r.count, 0),
      weekFrom, today, repeatHighRisk,
    });
    const aiHtml = await callClaude(prompt);
    const emailHtml = buildEmailHtml({ today, kpiByType, trend, slaCnt, alerts, repeatHighRisk, aiHtml });

    const er = await sendResendEmail(`[외식BG RO실] 주간 리스크 진단 리포트 (${today})`, emailHtml);
    if (!er.sent) console.error('[weekly-report] email not sent:', er.reason);

    return json({ ok: true, weekTotal, slaCnt, alerts: alerts.length, repeatHighRisk: repeatHighRisk.length, emailSent: er.sent, emailError: er.sent ? undefined : er.reason });
  } catch (e) {
    console.error('[weekly-report] error', e);
    return json({ error: String(e) }, 500);
  }
});

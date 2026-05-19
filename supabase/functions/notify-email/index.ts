// Supabase Edge Function: notify-email
//
// 임계치 초과·SLA 초과·주간 요약 이메일을 Resend API로 발송.
//
// 사전 준비 (Supabase 시크릿에 등록):
//   - RESEND_API_KEY      : Resend의 API 키
//   - NOTIFY_FROM         : 발신 주소 (예: "리스크관리 <alerts@yourdomain.com>") — Resend에서 도메인 인증 필요
//   - NOTIFY_TO           : 수신 주소(들) — 쉼표로 구분 가능 (예: "admin@company.com,manager@company.com")
//   - SUPABASE_URL        : 프로젝트 URL (records 테이블 읽기용; 자동 주입되는 경우 생략 가능)
//   - SUPABASE_SERVICE_ROLE_KEY : 서비스 롤 키 (RLS 우회해 전수 데이터 조회용)
//
// 호출 방식 (3가지):
//   1) 수동: POST /functions/v1/notify-email   { "kind": "summary" | "threshold" | "sla" }
//   2) 자동: pg_cron 또는 외부 스케줄러(예: GitHub Actions, cron-job.org)에서 위 URL을 주기 호출.
//   3) 즉시: 클라이언트(또는 다른 함수)에서 위반 등록 직후 호출 가능.
//
// 임계치는 클라이언트 localStorage에 저장되므로 서버측은 동일한 기본값(THRESHOLDS_DEFAULT 사본)을 사용한다.
// 운영 단계에서는 thresholds 테이블을 Supabase에 만들고 그쪽에서 읽도록 확장 권장.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const TYPES = ['가맹','불법파견','표시광고','노무','영업비밀','IP','부실채권','징계'] as const;
type Type = typeof TYPES[number];

// 클라이언트 constants.js의 THRESHOLDS_DEFAULT 사본 — 동기화 유지 필요
const THRESHOLDS_DEFAULT: Record<Type, { abs: number; mom: number }> = {
  '가맹':    { abs: 30, mom: 50 },
  '불법파견': { abs: 50, mom: 50 },
  '표시광고': { abs: 20, mom: 50 },
  '노무':    { abs: 30, mom: 50 },
  '영업비밀': { abs: 10, mom: 50 },
  'IP':      { abs: 10, mom: 50 },
  '부실채권': { abs: 10, mom: 50 },
  '징계':    { abs: 10, mom: 50 },
};

const SLA_DAYS = 14;

type Record_ = { id: number; date: string; type: Type; subtype: string; brand: string; count: number; status: string; note?: string; author?: string };

async function fetchRecords(): Promise<Record_[]> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
  const r = await fetch(`${url}/rest/v1/records?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`records fetch failed: ${r.status}`);
  return await r.json() as Record_[];
}

function ymOf(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`; }
function daysSince(s: string) { const d = new Date(s); return isNaN(d.getTime()) ? 0 : Math.floor((Date.now() - d.getTime()) / 86400000); }

function checkThresholds(recs: Record_[]) {
  const alerts: Array<{ type: Type; kind: 'abs'|'mom'; curr: number; prev?: number; pct?: number; threshold?: number }> = [];
  const now = new Date();
  const ym = ymOf(now);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYm = ymOf(prev);
  for (const type of TYPES) {
    const t = THRESHOLDS_DEFAULT[type];
    const currVio = recs.filter(r => r.type === type && r.date?.startsWith(ym) && r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
    const prevVio = recs.filter(r => r.type === type && r.date?.startsWith(prevYm) && r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
    if (currVio >= t.abs && t.abs > 0) alerts.push({ type, kind: 'abs', curr: currVio, threshold: t.abs });
    if (prevVio > 0) {
      const pct = Math.round(((currVio - prevVio) / prevVio) * 100);
      if (pct >= t.mom && t.mom > 0) alerts.push({ type, kind: 'mom', curr: currVio, prev: prevVio, pct });
    }
  }
  return alerts;
}

function findSlaOver(recs: Record_[]) {
  return recs.filter(r => r.status === '위반(처리중)' && daysSince(r.date) >= SLA_DAYS)
    .sort((a, b) => daysSince(b.date) - daysSince(a.date));
}

function buildSummaryHtml(recs: Record_[]) {
  const now = new Date();
  const ym = ymOf(now);
  const tot = recs.reduce((s, r) => s + r.count, 0);
  const vio = recs.filter(r => r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
  const mTot = recs.filter(r => r.date?.startsWith(ym)).reduce((s, r) => s + r.count, 0);
  const mVio = recs.filter(r => r.date?.startsWith(ym) && r.status !== '모니터링').reduce((s, r) => s + r.count, 0);
  const slas = findSlaOver(recs);
  const alerts = checkThresholds(recs);

  const alertRows = alerts.length
    ? alerts.map(a => a.kind === 'abs'
        ? `<li><b>${a.type}</b> · 당월 위반 <b>${a.curr}건</b> (임계 ${a.threshold}+)</li>`
        : `<li><b>${a.type}</b> · 전월 대비 <b>+${a.pct}%</b> (${a.prev}→${a.curr})</li>`).join('')
    : '<li style="color:#94a3b8">초과 항목 없음</li>';

  const slaRows = slas.slice(0, 10).map(r =>
    `<tr><td>${r.date}</td><td>${r.type}</td><td>${r.brand}</td><td>${r.subtype || '-'}</td><td>${daysSince(r.date)}일</td><td>${r.author || '-'}</td></tr>`
  ).join('');

  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:680px;margin:0 auto;padding:20px">
    <h2 style="margin:0 0 4px">외식BG RO 리스크 주간 요약</h2>
    <p style="color:#64748b;margin:0 0 20px">${now.toLocaleDateString('ko-KR')} 기준</p>

    <h3 style="margin:18px 0 8px">현황 요약</h3>
    <p>누적 모니터링 <b>${tot.toLocaleString()}</b>건 · 위반 <b>${vio.toLocaleString()}</b>건<br>
       당월(${ym}) 모니터링 <b>${mTot.toLocaleString()}</b>건 · 위반 <b>${mVio.toLocaleString()}</b>건</p>

    <h3 style="margin:18px 0 8px;color:#b91c1c">⚠ 임계치 알림 (${alerts.length}건)</h3>
    <ul>${alertRows}</ul>

    <h3 style="margin:18px 0 8px;color:#b91c1c">⏱ SLA(${SLA_DAYS}일) 초과 위반(처리중) (${slas.length}건)</h3>
    ${slas.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f8fafc"><th style="text-align:left;padding:6px">발생일</th><th style="text-align:left;padding:6px">영역</th><th style="text-align:left;padding:6px">브랜드</th><th style="text-align:left;padding:6px">상세</th><th style="text-align:left;padding:6px">경과</th><th style="text-align:left;padding:6px">작성자</th></tr></thead>
          <tbody>${slaRows}</tbody>
        </table>${slas.length > 10 ? `<p style="color:#94a3b8;font-size:12px">외 ${slas.length - 10}건…</p>` : ''}`
      : '<p style="color:#94a3b8">초과 항목 없음</p>'}

    <p style="margin-top:24px;color:#94a3b8;font-size:11px">※ 영업비밀 모니터링 건수는 대시보드에서 10:1 환산 표시되나, 본 메일의 위반 건수는 모두 원값입니다.</p>
  </body></html>`;
}

async function sendMail(html: string, subject: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NOTIFY_FROM');
  const to = (Deno.env.get('NOTIFY_TO') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!apiKey || !from || !to.length) throw new Error('RESEND_API_KEY / NOTIFY_FROM / NOTIFY_TO must be set');

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Resend send failed: ${r.status} ${txt}`);
  }
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let kind = 'summary';
  try { const body = await req.json(); kind = body?.kind || 'summary'; } catch { /* default */ }

  try {
    const recs = await fetchRecords();
    let subject = '';
    let html = '';
    if (kind === 'summary') {
      subject = '[리스크 관리] 주간 요약';
      html = buildSummaryHtml(recs);
    } else if (kind === 'threshold') {
      const alerts = checkThresholds(recs);
      if (!alerts.length) return json({ ok: true, skipped: 'no alerts' });
      subject = `[리스크 알림] 임계치 초과 ${alerts.length}건`;
      html = buildSummaryHtml(recs);
    } else if (kind === 'sla') {
      const slas = findSlaOver(recs);
      if (!slas.length) return json({ ok: true, skipped: 'no SLA over' });
      subject = `[리스크 알림] SLA ${SLA_DAYS}일 초과 ${slas.length}건`;
      html = buildSummaryHtml(recs);
    } else {
      return json({ error: 'unknown kind' }, 400);
    }
    const r = await sendMail(html, subject);
    return json({ ok: true, kind, sent: r });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});

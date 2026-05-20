// ── Supabase 설정 + REST 헬퍼 ─────────────────────────
// 주의: SB_KEY는 publishable 키이므로 RLS와 함께 동작하도록 설계됨.
// 변경 전 Supabase 콘솔의 RLS 정책을 먼저 확인할 것.
const SB_URL = 'https://acbimacjlslxzzjutqyt.supabase.co';
const SB_KEY = 'sb_publishable_iB1ahsakvCxgpZd9s86kBw_oPD7r9PB';
const H = { 'Content-Type':'application/json', 'apikey':SB_KEY, 'Authorization':'Bearer '+SB_KEY };

const sbGet = async t => {
  const r = await fetch(`${SB_URL}/rest/v1/${t}?select=*`, { headers: H });
  return r.ok ? r.json() : [];
};
// 마지막 에러 메시지 (UI 토스트에서 참조). console에도 자동 기록됨.
window.__sbLastErr = '';
const sbIns = async (t, d) => {
  const r = await fetch(`${SB_URL}/rest/v1/${t}`, {
    method: 'POST',
    headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify(d)
  });
  if (!r.ok) { const msg = await r.text(); console.error('[sbIns]', t, r.status, msg); window.__sbLastErr = msg; return false; }
  window.__sbLastErr = '';
  return true;
};
const sbUpd = async (t, id, d) => {
  const r = await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify(d)
  });
  if (!r.ok) { const msg = await r.text(); console.error('[sbUpd]', t, id, r.status, msg); window.__sbLastErr = msg; return false; }
  window.__sbLastErr = '';
  return true;
};
const sbDel = async (t, id) => {
  const r = await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`, { method: 'DELETE', headers: H });
  if (!r.ok) { const msg = await r.text(); console.error('[sbDel]', t, id, r.status, msg); window.__sbLastErr = msg; return false; }
  window.__sbLastErr = '';
  return true;
};

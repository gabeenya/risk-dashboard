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
const sbIns = async (t, d) => {
  const r = await fetch(`${SB_URL}/rest/v1/${t}`, {
    method: 'POST',
    headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify(d)
  });
  return r.ok;
};
const sbUpd = async (t, id, d) => {
  const r = await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify(d)
  });
  return r.ok;
};
const sbDel = async (t, id) => {
  const r = await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`, { method: 'DELETE', headers: H });
  return r.ok;
};

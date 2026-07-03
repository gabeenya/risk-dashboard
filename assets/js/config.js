// ── Supabase 설정 + REST 헬퍼 ─────────────────────────
// 주의: SB_KEY는 publishable 키이므로 RLS와 함께 동작하도록 설계됨.
// 변경 전 Supabase 콘솔의 RLS 정책을 먼저 확인할 것.
const SB_URL = 'https://acbimacjlslxzzjutqyt.supabase.co';
const SB_KEY = 'sb_publishable_iB1ahsakvCxgpZd9s86kBw_oPD7r9PB';
const H = { 'Content-Type':'application/json', 'apikey':SB_KEY, 'Authorization':'Bearer '+SB_KEY };

// Supabase REST는 한 응답에 최대 1000행만 반환(서버 max-rows). 전체를 가져오려면
// Range 헤더로 페이지네이션해야 한다 — 안 그러면 1000행 초과 데이터가 잘려 보인다.
const sbGet = async t => {
  const STEP = 1000;
  let out = [], from = 0, total = Infinity;
  while (from < total) {
    const r = await fetch(`${SB_URL}/rest/v1/${t}?select=*`, {
      headers: { ...H, 'Range': `${from}-${from + STEP - 1}`, 'Prefer': 'count=exact' }
    });
    if (!r.ok) {
      if (from === 0) throw new Error(`HTTP ${r.status}`); // 첫 배치 실패 → throw → Promise rejected → records 보존
      return out;                                           // 중간 배치 실패 → 부분 결과 반환
    }
    const batch = await r.json();
    if (!Array.isArray(batch)) {
      if (from === 0) throw new Error('non-array response');
      return out;
    }
    out = out.concat(batch);
    const cr = r.headers.get('content-range'); // 예: "0-999/1446"
    if (cr && cr.includes('/')) { const tot = parseInt(cr.split('/')[1], 10); if (!isNaN(tot)) total = tot; }
    if (!batch.length) break;
    from += batch.length;
  }
  return out;
};
// 마지막 에러 메시지 (UI 토스트에서 참조). console에도 자동 기록됨.
window.__sbLastErr = '';
const sbIns = async (t, d) => {
  const r = await fetch(`${SB_URL}/rest/v1/${t}`, {
    method: 'POST',
    headers: { ...H, 'Prefer': 'return=minimal' },
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
// 다중 수정 — id=in.(...) 한 번에 같은 값으로 PATCH. URL 길이 한계 때문에 200개씩 끊어 보낸다.
const sbUpdMany = async (t, ids, d) => {
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const r = await fetch(`${SB_URL}/rest/v1/${t}?id=in.(${slice.join(',')})`, {
      method: 'PATCH',
      headers: { ...H, 'Prefer': 'return=minimal' },
      body: JSON.stringify(d)
    });
    if (!r.ok) { const msg = await r.text(); console.error('[sbUpdMany]', t, r.status, msg); window.__sbLastErr = msg; return false; }
  }
  window.__sbLastErr = '';
  return true;
};
// 다중 삭제 — id=in.(...) 한 번에. URL 길이 한계 때문에 200개씩 끊어 보낸다.
const sbDelMany = async (t, ids) => {
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const r = await fetch(`${SB_URL}/rest/v1/${t}?id=in.(${slice.join(',')})`, { method: 'DELETE', headers: H });
    if (!r.ok) { const msg = await r.text(); console.error('[sbDelMany]', t, r.status, msg); window.__sbLastErr = msg; return false; }
  }
  window.__sbLastErr = '';
  return true;
};

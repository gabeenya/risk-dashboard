// Supabase Edge Function: admin-users
// 관리자 페이지(사용자 승인/역할변경/브랜드·영역 권한/이름 수정/삭제)의 users 테이블 쓰기를
// 서버(service role)에서 처리한다. 예전에는 admin.js가 anon key로 users 테이블을 직접
// PATCH/DELETE/INSERT 했는데, isAdmin()/isOwner() 같은 권한 판별이 전부 클라이언트 JS라
// devtools에서 role='admin' PATCH를 그대로 보내면 막을 방법이 없었다(RLS가 이를 막지
// 못하면 그대로 통과). 이 함수는 auth-login이 발급한 서명 토큰을 서버에서 검증하고,
// 토큰 주인이 OWNER_IDS(최상위 관리자)인지 재확인한 뒤에만 service role로 대신 처리한다.
//
// action:
//   'list'          { token }                                        → { ok, users }  (pw 필드 제외)
//   'create'        { token, id, name, pw, role, brands, types }      → { ok }
//   'approve'       { token, id, brands, types }                     → { ok }
//   'reject'        { token, id }                                    → { ok }
//   'updateName'    { token, id, name }                               → { ok }
//   'updateRole'    { token, id, role }                               → { ok }
//   'updateBrands'  { token, id, brands }                             → { ok }
//   'updateTypes'   { token, id, types }                              → { ok }
//   'delete'        { token, id }                                     → { ok }
//
// 필요 시크릿: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY(자동 제공),
//              AUTH_TOKEN_SECRET(auth-login과 동일 — 프로젝트 시크릿은 모든 함수가 공유하므로 추가 설정 불필요)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TOKEN_SECRET = Deno.env.get('AUTH_TOKEN_SECRET') ?? '';

// 최상위 관리자 ID 목록 — assets/js/constants.js의 OWNER_IDS와 반드시 동일하게 유지할 것.
// (클라이언트 상수를 서버가 그대로 읽을 수 없어 부득이 중복 정의함)
const OWNER_IDS = ['131122', 'admin', 'lee_gabeen'];
const PROTECTED_ID = 'admin'; // 이 계정은 삭제 불가 (admin.js의 isProtected와 동일 규칙)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function toB64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmacSign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(TOKEN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return toB64Url(new Uint8Array(sig));
}
// auth-login이 발급한 토큰과 동일한 형식(payload.sig)을 검증
async function verifyToken(token: string): Promise<{ id: string } | null> {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectSig = await hmacSign(payload);
  if (sig !== expectSig) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64Url(payload)));
    if (!data.id || !data.exp || Date.now() >= data.exp) return null;
    return { id: data.id };
  } catch { return null; }
}
// 호출자가 최상위 관리자인지 서버에서 재확인 (클라이언트 isOwner()를 신뢰하지 않음)
async function requireOwner(token: string): Promise<string | null> {
  const v = await verifyToken(token);
  if (!v || !OWNER_IDS.includes(v.id)) return null;
  return v.id;
}

async function strongHash(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  return `pbkdf2:${toB64Url(salt)}:${toB64Url(new Uint8Array(bits))}`;
}

async function restFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}
function toProfile(u: any) {
  return { id: u.id, name: u.name, role: u.role, brands: u.brands || [], types: u.types || [], status: u.status, joined: u.joined };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!TOKEN_SECRET) return json({ ok: false, error: 'AUTH_TOKEN_SECRET not configured' }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'invalid json body' }, 400); }
  const action = body?.action;

  const ownerId = await requireOwner(String(body?.token || ''));
  if (!ownerId) return json({ ok: false, error: '권한이 없습니다.' }, 403);

  try {
    if (action === 'list') {
      const r = await restFetch('users?select=*');
      if (!r.ok) return json({ ok: false, error: 'HTTP ' + r.status });
      const rows = await r.json();
      return json({ ok: true, users: (Array.isArray(rows) ? rows : []).map(toProfile) });
    }

    if (action === 'create') {
      const id = String(body?.id || '').trim();
      const name = String(body?.name || '').trim();
      const pw = String(body?.pw || '');
      const role = body?.role === 'admin' ? 'admin' : 'user';
      const brands = role === 'admin' ? [] : (Array.isArray(body?.brands) ? body.brands : []);
      const types = role === 'admin' ? [] : (Array.isArray(body?.types) ? body.types : []);
      if (!id || !name || !pw) return json({ ok: false, error: '모든 항목을 입력하세요.' });
      if (!/^[a-zA-Z0-9._-]+$/.test(id)) return json({ ok: false, error: '아이디는 영문/숫자/.-_만 사용할 수 있습니다.' });
      if (pw.length < 4) return json({ ok: false, error: '비밀번호는 4자 이상이어야 합니다.' });

      const existing = await restFetch(`users?id=eq.${encodeURIComponent(id)}&select=id`);
      const existingRows = await existing.json().catch(() => []);
      if (Array.isArray(existingRows) && existingRows.length) return json({ ok: false, error: '이미 사용 중인 아이디입니다.' });

      const today = new Date().toISOString().split('T')[0];
      const r = await restFetch('users', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ id, name, pw: await strongHash(pw), role, joined: today, brands, types, status: 'active' }),
      });
      if (!r.ok) return json({ ok: false, error: await r.text() });
      return json({ ok: true });
    }

    if (action === 'approve') {
      const id = String(body?.id || '');
      const brands = Array.isArray(body?.brands) ? body.brands : [];
      const types = Array.isArray(body?.types) ? body.types : [];
      if (!id || !brands.length || !types.length) return json({ ok: false, error: '접근 브랜드와 확인 가능 영역을 선택하세요.' });
      const r = await restFetch(`users?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ brands, types, status: 'active' }),
      });
      if (!r.ok) return json({ ok: false, error: await r.text() });
      return json({ ok: true });
    }

    if (action === 'reject' || action === 'delete') {
      const id = String(body?.id || '');
      if (!id) return json({ ok: false, error: 'id required' });
      if (action === 'delete' && id === PROTECTED_ID) return json({ ok: false, error: '이 계정은 삭제할 수 없습니다.' });
      const r = await restFetch(`users?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      if (!r.ok) return json({ ok: false, error: await r.text() });
      return json({ ok: true });
    }

    if (action === 'updateName') {
      const id = String(body?.id || '');
      const name = String(body?.name || '').trim();
      if (!id || !name) return json({ ok: false, error: '이름을 입력하세요.' });
      const r = await restFetch(`users?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ name }),
      });
      if (!r.ok) return json({ ok: false, error: await r.text() });
      return json({ ok: true });
    }

    if (action === 'updateRole') {
      const id = String(body?.id || '');
      if (!id || id === PROTECTED_ID) return json({ ok: false, error: '권한을 변경할 수 없는 계정입니다.' });
      const role = body?.role === 'admin' ? 'admin' : 'user';
      const patch = role === 'admin' ? { role, brands: [], types: [] } : { role };
      const r = await restFetch(`users?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch),
      });
      if (!r.ok) return json({ ok: false, error: await r.text() });
      return json({ ok: true });
    }

    if (action === 'updateBrands') {
      const id = String(body?.id || '');
      const brands = Array.isArray(body?.brands) ? body.brands : [];
      if (!id || !brands.length) return json({ ok: false, error: '최소 1개 이상의 브랜드를 선택하세요.' });
      const r = await restFetch(`users?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ brands }),
      });
      if (!r.ok) return json({ ok: false, error: await r.text() });
      return json({ ok: true });
    }

    if (action === 'updateTypes') {
      const id = String(body?.id || '');
      const types = Array.isArray(body?.types) ? body.types : [];
      if (!id || !types.length) return json({ ok: false, error: '최소 1개 이상의 영역을 선택하세요.' });
      const r = await restFetch(`users?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ types }),
      });
      if (!r.ok) return json({ ok: false, error: await r.text() });
      return json({ ok: true });
    }

    return json({ ok: false, error: 'unknown action' }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

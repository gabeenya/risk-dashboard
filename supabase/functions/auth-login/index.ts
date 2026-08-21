// Supabase Edge Function: auth-login
// 로그인 검증 · 세션 발급/검증/갱신 · 비밀번호 변경을 서버(service role)에서 처리한다.
// 기존에는 클라이언트가 users 테이블 전체(비밀번호 해시 포함)를 내려받아 로컬에서
// hp(pw)===해시 비교를 했는데, 이러면 로그인 여부와 무관하게 누구나 REST API를 직접 호출해
// 전 계정의 비밀번호 해시를 통째로 가져갈 수 있었다. 이 함수는 그 경로를 없애고,
// 세션도 서명된 토큰(HMAC)으로 발급해 sessionStorage 조작만으로 로그인 우회를 하지 못하게 막는다.
//
// action:
//   'login'          { id, pw }                         → { ok, token, exp, profile }
//   'verify'         { token }                           → { ok, profile }
//   'refresh'        { token }                           → { ok, token, exp, profile }  (세션 연장)
//   'changePassword' { token, curPw, newPw }              → { ok }
//
// 필요 시크릿: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY(Edge Function에 자동 제공),
//              AUTH_TOKEN_SECRET(신규 — 32바이트 이상의 임의 랜덤 문자열. 예: `openssl rand -hex 32`)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TOKEN_SECRET = Deno.env.get('AUTH_TOKEN_SECRET') ?? '';
const SESSION_MS = 3 * 60 * 60 * 1000; // 3시간 — 기존 클라이언트 세션 정책과 동일

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── 레거시 djb2 해시 (기존 계정 검증 호환용) — assets/js/utils.js의 이전 hp()와 동일 로직 ──
function djb2(pw: string): string {
  let h = 0;
  for (let i = 0; i < pw.length; i++) { h = ((h << 5) - h) + pw.charCodeAt(i); h |= 0; }
  return h.toString(36);
}

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

// ── 강한 비밀번호 해시: PBKDF2-SHA256, salt 포함 — "pbkdf2:salt:hash" 형식 ──
async function strongHash(pw: string, saltB64?: string): Promise<string> {
  const salt = saltB64 ? fromB64Url(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  return `pbkdf2:${toB64Url(salt)}:${toB64Url(new Uint8Array(bits))}`;
}
async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith('pbkdf2:')) {
    const parts = stored.split(':');
    const check = await strongHash(pw, parts[1]);
    return check === stored;
  }
  return djb2(pw) === stored; // 레거시 계정
}

async function makeToken(id: string): Promise<{ token: string; exp: number }> {
  const exp = Date.now() + SESSION_MS;
  const payload = toB64Url(new TextEncoder().encode(JSON.stringify({ id, exp })));
  const sig = await hmacSign(payload);
  return { token: `${payload}.${sig}`, exp };
}
async function verifyToken(token: string): Promise<{ id: string } | null> {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectSig = await hmacSign(payload);
  if (sig !== expectSig) return null; // 서명 위조 — 시크릿 없이는 만들 수 없음
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64Url(payload)));
    if (!data.id || !data.exp || Date.now() >= data.exp) return null;
    return { id: data.id };
  } catch { return null; }
}

async function fetchUser(id: string): Promise<any | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(id)}&select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
async function patchUser(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  return r.ok;
}
// 클라이언트로 내려보낼 프로필 — pw 필드는 절대 포함하지 않음
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

  try {
    if (action === 'login') {
      const id = String(body?.id || '').trim();
      const pw = String(body?.pw || '');
      if (!id || !pw) return json({ ok: false, error: '아이디와 비밀번호를 입력하세요.' });
      const u = await fetchUser(id);
      if (!u || !(await verifyPassword(pw, u.pw))) return json({ ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
      if (u.status === 'pending') return json({ ok: false, error: '관리자 승인 대기 중인 계정입니다.' });
      // 레거시 djb2 해시였다면 로그인 성공 시점에 강한 해시로 자동 승격 (비밀번호 재설정 요구 없이)
      if (!String(u.pw).startsWith('pbkdf2:')) await patchUser(id, { pw: await strongHash(pw) });
      const { token, exp } = await makeToken(id);
      return json({ ok: true, token, exp, profile: toProfile(u) });
    }

    if (action === 'verify') {
      const v = await verifyToken(String(body?.token || ''));
      if (!v) return json({ ok: false });
      const u = await fetchUser(v.id);
      if (!u || u.status === 'pending') return json({ ok: false });
      return json({ ok: true, profile: toProfile(u) });
    }

    if (action === 'refresh') {
      const v = await verifyToken(String(body?.token || ''));
      if (!v) return json({ ok: false });
      const u = await fetchUser(v.id);
      if (!u || u.status === 'pending') return json({ ok: false });
      const { token, exp } = await makeToken(v.id);
      return json({ ok: true, token, exp, profile: toProfile(u) });
    }

    if (action === 'changePassword') {
      const v = await verifyToken(String(body?.token || ''));
      if (!v) return json({ ok: false, error: '세션이 만료되었습니다. 다시 로그인해 주세요.' });
      const cur = String(body?.curPw || '');
      const next = String(body?.newPw || '');
      if (next.length < 4) return json({ ok: false, error: '새 비밀번호는 4자 이상이어야 합니다.' });
      const u = await fetchUser(v.id);
      if (!u || !(await verifyPassword(cur, u.pw))) return json({ ok: false, error: '현재 비밀번호가 올바르지 않습니다.' });
      const ok = await patchUser(v.id, { pw: await strongHash(next) });
      if (!ok) return json({ ok: false, error: '변경 실패 — 잠시 후 다시 시도해 주세요.' });
      return json({ ok: true });
    }

    return json({ ok: false, error: 'unknown action' }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

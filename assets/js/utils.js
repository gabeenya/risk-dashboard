// ── 작은 헬퍼 ────────────────────────────────────────
// strongHash(pw): PBKDF2-SHA256(100000회, salt 16바이트) → "pbkdf2:salt:hash" 형식.
// 신규 계정 생성(가입 신청/관리자의 계정 추가)에서만 사용 — 로그인 검증은 supabase/functions/auth-login이
// 서버(service role)에서 처리하므로 클라이언트는 더 이상 비밀번호 해시를 비교하지 않는다.
// 기존에 저장된 레거시 djb2 해시 계정은 auth-login이 로그인 성공 시점에 이 형식으로 자동 승격한다.
async function strongHash(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return `pbkdf2:${b64url(salt)}:${b64url(bits)}`;
}

// 오늘 날짜 (YYYY-MM-DD)
function td() { return new Date().toISOString().split('T')[0]; }

// 상태 → CSS 클래스
function sc(s) {
  return s === '완료' ? 's-done'
       : s === '위반(처리중)' ? 's-ing'
       : 's-mon';
}

// 영역별 상태 표시 라벨. DB에는 STATS(모니터링/위반(처리중)/완료)로 저장하되,
// 클레임·안전·징계·부실채권은 모니터링 옵션 없이 2단계만 사용.
const __STAT_CS_LBL = { '위반(처리중)':'접수/처리중', '완료':'처리완료' };
const __STAT_AN_LBL = { '위반(처리중)':'발생', '완료':'조치완료' };
const __STAT_JG_LBL = { '위반(처리중)':'적발', '완료':'조치완료' };
const __STAT_BC_LBL = { '위반(처리중)':'발생', '완료':'해결' };
// 위생: 상태를 '모니터링' 단일값으로만 사용하되 화면엔 '해충반품'으로 표시
const __STAT_HY_LBL = { '모니터링':'해충반품' };
function statLbl(status, type) {
  if (type === '클레임')   return __STAT_CS_LBL[status] || status;
  if (type === '안전')     return __STAT_AN_LBL[status] || status;
  if (type === '감사')     return __STAT_JG_LBL[status] || status;
  if (type === '부실채권') return __STAT_BC_LBL[status] || status;
  if (type === '위생')     return __STAT_HY_LBL[status] || status;
  return status;
}

// 영역별로 선택 가능한 상태 목록. 감사·부실채권·안전·클레임은 '모니터링' 옵션 없이 2단계,
// 위생은 '모니터링'(표시상 '해충반품') 단일 상태만 사용. 나머지는 3단계 전체(STATS) 사용.
function availStatuses(type) {
  if (type === '위생') return ['모니터링'];
  return (['감사','부실채권','안전','클레임'].includes(type)) ? STATS.filter(s => s !== '모니터링') : STATS;
}

// 동기화 배지 문구/색 갱신
function setSy(t, c, b) {
  const el = document.getElementById('syncBadge');
  el.textContent = t;
  el.style.color = c;
  el.style.background = b;
}

// 토스트 (오른쪽 하단)
function toast(m) {
  const t = document.getElementById('toast');
  t.textContent = m;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// 폼 에러 텍스트 표시/숨김
function err(id, m) {
  const el = document.getElementById(id);
  el.textContent = m;
  el.classList.toggle('show', !!m);
}

// HTML escape — innerHTML/속성값에 사용자 입력 들어갈 때 반드시 거치기.
// records/users 테이블의 자유 입력 필드(note·author·name·id 등)와
// (RLS off 상태에서) 외부에서 조작될 수 있는 모든 DB 값에 적용한다.
const __ESC_MAP = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => __ESC_MAP[c]);
}

// 징계 성명·양형 레코드 파서 — note 필드에 '_jg:{성명}|{양형}|{비고}' 형식으로 임시 저장
function parseJgRecord(r) {
  if (r.type !== '감사') return null;
  if (!r.note || !r.note.startsWith('_jg:')) return null;
  const parts = r.note.slice(4).split('|');
  return { name: parts[0] || '', sent: parts[1] || '', note: parts[2] || '' };
}

// 부실채권 금액 입력 대상 상세유형
const BC_AMT_SUBS = ['미입금', '2개월 초과 미입금'];

// 감사(징계) 영역 징계유형 선택지
const JNG_TYPES = ['금전회수', '경징계', '중징계', '형사고발'];

// 부실채권 금액 레코드 파서 — note 필드에 '_amt:{숫자}' 형식으로 임시 저장
function parseBcAmt(r) {
  if (r.type !== '부실채권' || !BC_AMT_SUBS.includes(r.subtype)) return null;
  if (!r.note || !r.note.startsWith('_amt:')) return null;
  const pipeIdx = r.note.indexOf('|');
  const numStr  = pipeIdx >= 0 ? r.note.slice(5, pipeIdx) : r.note.slice(5);
  const v = Number(numStr);
  return isNaN(v) ? null : v;
}
// 특이사항 content JSON 파서/직렬화 (m=주요이슈, d=이슈상세, a=조치완료)
// Supabase jsonb 컬럼은 이미 파싱된 object로 반환될 수 있어 typeof 분기 처리
function parseNoteContent(content) {
  if (!content) return { m: '', d: '', a: '' };
  if (typeof content === 'object') return { m: content.m||'', d: content.d||'', a: content.a||'' };
  try {
    const s = String(content);
    if (s.trim().startsWith('{')) {
      const p = JSON.parse(s);
      return { m: p.m||'', d: p.d||'', a: p.a||'' };
    }
    return { m: s, d: '', a: '' };
  } catch { return { m: String(content), d: '', a: '' }; }
}
function serializeNote(m, d, a) { return JSON.stringify({ m: m||'', d: d||'', a: a||'' }); }

// 부실채권 금액 레코드의 비고 텍스트 추출
function parseBcNote(r) {
  if (!r.note || !r.note.startsWith('_amt:')) return r.note || '';
  const pipeIdx = r.note.indexOf('|');
  return pipeIdx >= 0 ? r.note.slice(pipeIdx + 1) : '';
}

// 로고 클릭 → 대시보드 + 전체 필터로 복귀
function goHome() {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  document.getElementById('page-dashboard').classList.add('on');
  document.getElementById('tabDashboard').classList.add('on');
  curFilter = 'all';
  curBrand = 'all';
  curDashCat = 'all';
  const catSel = document.getElementById('dashCatSel');
  if (catSel) catSel.value = 'all';
  setTopbarTitle('dashboard');
  closeSidebar();
  loadData();
}

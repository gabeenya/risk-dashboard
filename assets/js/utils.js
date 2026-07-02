// ── 작은 헬퍼 ────────────────────────────────────────
// hp(pw): djb2 변형 해시. 암호학적 해시가 아니므로 데모용.
function hp(pw) {
  let h = 0;
  for (let i = 0; i < pw.length; i++) {
    h = ((h << 5) - h) + pw.charCodeAt(i);
    h |= 0;
  }
  return h.toString(36);
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
function statLbl(status, type) {
  if (type === '클레임')   return __STAT_CS_LBL[status] || status;
  if (type === '안전')     return __STAT_AN_LBL[status] || status;
  if (type === '징계')     return __STAT_JG_LBL[status] || status;
  if (type === '부실채권') return __STAT_BC_LBL[status] || status;
  return status;
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
  if (r.type !== '징계') return null;
  if (!r.note || !r.note.startsWith('_jg:')) return null;
  const parts = r.note.slice(4).split('|');
  return { name: parts[0] || '', sent: parts[1] || '', note: parts[2] || '' };
}

// 부실채권 금액 입력 대상 상세유형
const BC_AMT_SUBS = ['미입금', '2개월 초과 미입금'];

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

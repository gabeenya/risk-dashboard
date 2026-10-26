// Supabase Edge Function: ad-watch-scan
// 표시광고 "뒷광고 의심" 자동 모니터링 — 네이버 검색 API(블로그/카페)로 기간 내
// 브랜드 언급 게시물을 찾고, 본문을 가져와 Claude로 광고 표시 누락 의심 여부를
// 1차 판별한 뒤 ad_watch_candidates 테이블에 저장한다. 사람이 검수 후 최종 등록.
// 스캔이 끝나면 이번 스캔의 등급별 집계 + '의심' 후보 목록을 Resend로 즉시 이메일 발송한다
// (전체 영역 정기 리포트는 별도 함수 weekly-report 참조).
//
// 필요 시크릿: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET,
//              ANTHROPIC_API_KEY(ai-analyze와 공유),
//              SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY(Edge Function에 자동 제공),
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

const MAX_PAGES_PER_QUERY = 5;   // 브랜드×블로그당 최대 페이지(100건×5=500건) — 조기 중단과 함께 과호출 방지
const MAX_CAFE_PER_BRAND = 10;   // 카페는 검색 API가 게시일을 안 주므로 상위 일부만 후보로
const MAX_CANDIDATES = 100;      // 스캔 1회당 처리 상한(Edge Function 실행시간 제한) — 늘릴수록 타임아웃 위험 증가, CONCURRENCY와 함께 조정
const CONCURRENCY = 8;           // 본문수집+AI분류 동시 처리 개수 — MAX_CANDIDATES 상향에 맞춰 함께 올림
const BODY_MAX_CHARS = 4000;
const MAX_IMAGES_PER_POST = 3;   // 게시물당 비전 분석에 사용할 이미지 상한(비용/시간 제한)
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024; // Claude 비전 API 이미지 1장 상한(약 5MB)에 여유를 둠 — 넘으면 Claude가 거부하므로 미리 제외
const MAX_HTML_BYTES = 1.5 * 1024 * 1024; // 본문 HTML 다운로드 상한 — 비정상적으로 큰 페이지 하나가 워커 메모리를 다 쓰지 않도록
const SCAN_DEADLINE_MS = 110_000; // 이 시간이 지나면 새 후보 처리를 멈추고 지금까지 결과만 저장(Edge Function 실행시간 제한 546 방지)
const MIN_IMAGE_BYTES = 3000;    // 이보다 작으면 아이콘/장식 이미지로 간주해 제외

type SearchItem = {
  brand: string;
  platform: '네이버블로그' | '네이버카페';
  title: string;
  link: string;
  snippet: string;
  bloggerName: string;
  postDate: string; // YYYY-MM-DD, 없으면 ''
};

function stripHtmlTags(s: string): string {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// 응답 본문을 maxBytes까지만 읽는다. Content-Length가 상한을 넘으면 아예 받지 않고,
// 헤더가 없거나 거짓이어도 스트림 누적량이 상한을 넘는 순간 중단 — 거대한 파일 하나를
// 통째로 메모리에 올렸다가 버리는 일이 없도록(546 WORKER_LIMIT 메모리 초과 방지).
async function readCapped(r: Response, maxBytes: number): Promise<Uint8Array | null> {
  const len = Number(r.headers.get('content-length') || 0);
  if (len > maxBytes) { r.body?.cancel().catch(() => {}); return null; }
  if (!r.body) return new Uint8Array(await r.arrayBuffer());
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

function htmlToText(html: string): string {
  return stripHtmlTags(
    html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  ).replace(/\s+/g, ' ').trim();
}

// 본문 HTML에서 이미지 URL을 추출한다(태그 스트립 전에 호출해야 함).
// 아이콘/로고/장식 이미지로 보이는 것은 파일명 패턴으로 걸러내고, 상한 개수만 반환.
// 네이버 블로그 프로필 사진(blogpfthumb)·스티커(storep)·사이트 공용 이미지(ssl.pstatic.net/static)·
// 링크 미리보기 썸네일(dthumb)은 본문 사진이 아니라 OCR 대상에서 뺀다 — 이게 앞쪽 슬롯을 차지해
// 실제 사진이 분석되지 못하던 문제가 있었음.
// 협찬 표시는 글 첫 사진(상단 고지)이나 마지막 사진(체험단 배너 "~로부터 제공받아 작성")에 몰려
// 있는 경우가 많아, 앞에서 MAX-1장 + 맨 마지막 1장을 고른다.
function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let src = m[1];
    if (src.startsWith('//')) {
      src = 'https:' + src;
    } else if (src.startsWith('/')) {
      try { src = new URL(src, baseUrl).toString(); } catch { continue; }
    } else if (!/^https?:\/\//i.test(src)) {
      continue; // data URI 등은 스킵
    }
    if (/icon|logo|btn_|blank\.gif|profile|sprite|spacer/i.test(src)) continue;
    if (/blogpfthumb-phinf|storep-phinf|dthumb-phinf|ssl\.pstatic\.net\/static/i.test(src)) continue;
    urls.push(src);
  }
  const uniq = Array.from(new Set(urls));
  if (uniq.length <= MAX_IMAGES_PER_POST) return uniq;
  return [...uniq.slice(0, MAX_IMAGES_PER_POST - 1), uniq[uniq.length - 1]];
}

// 이미지는 서버에서 내려받아 base64로 바꾸지 않고 URL만 Claude에 넘긴다(Claude가 직접 가져감).
// base64 변환은 1MB 사진 한 장에 ~100ms CPU가 들어, 사진 많은 브랜드(예: 자연별곡)에서
// Edge Function CPU 한도(2초)를 넘겨 "CPU Time exceeded"(546)로 죽던 원인이었음.
// 여기서는 HEAD 요청(본문 없이 헤더만, CPU 거의 0)으로 형식·용량만 확인해 부적합한 것을 거른다.
async function checkImageUrl(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RiskDashboardBot/1.0)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return false;
    const mediaType = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) return false;
    const len = Number(r.headers.get('content-length') || 0);
    if (len && (len > MAX_IMAGE_BYTES || len < MIN_IMAGE_BYTES)) return false;
    return true;
  } catch {
    return false;
  }
}

function blogPostdateToYmd(postdate: string): string {
  if (!/^\d{8}$/.test(postdate)) return '';
  return `${postdate.slice(0, 4)}-${postdate.slice(4, 6)}-${postdate.slice(6, 8)}`;
}

function extractDateFromText(text: string): string {
  const m = text.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

// 일부 브랜드명은 흔한 인명/단어라서 그대로 검색하면 무관한 결과가 많이 섞임
// (예: "애슐리"는 인명으로도 흔히 쓰임) — 검색어만 더 구체적인 표현으로 바꾸고,
// 저장되는 brand 값은 원래 브랜드명("애슐리")을 그대로 유지한다.
const SEARCH_QUERY_ALIAS: Record<string, string> = {
  '애슐리': '애슐리퀸즈',
};
function searchQueryFor(brand: string): string {
  return SEARCH_QUERY_ALIAS[brand] || brand;
}

async function naverSearch(kind: 'blog' | 'cafearticle', query: string, start: number): Promise<any> {
  const clientId = Deno.env.get('NAVER_CLIENT_ID');
  const clientSecret = Deno.env.get('NAVER_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('NAVER_CLIENT_ID/SECRET not configured');
  const url = `https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(query)}&display=100&start=${start}&sort=date`;
  const r = await fetch(url, {
    headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
  });
  if (!r.ok) throw new Error(`Naver ${kind} 검색 실패: HTTP ${r.status}`);
  return r.json();
}

// 후보 링크의 본문 전체를 가져온다. 네이버 블로그는 모바일 버전(m.blog.naver.com)이
// iframe 없이 본문을 바로 렌더링하므로 호스트를 치환한다.
// 로그인 필요(비공개 카페 등)로 본문을 못 가져온 경우 ok:false로 표시하고 폴백은 호출부에서 처리.
async function fetchBody(link: string): Promise<{ text: string; ok: boolean; imageUrls: string[] }> {
  let url = link;
  try {
    const u = new URL(link);
    if (u.hostname === 'blog.naver.com') { u.hostname = 'm.blog.naver.com'; url = u.toString(); }
  } catch { /* URL 파싱 실패 시 원본 링크 그대로 시도 */ }

  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RiskDashboardBot/1.0)' },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!r || !r.ok) return { text: '', ok: false, imageUrls: [] };
  const raw = await readCapped(r, MAX_HTML_BYTES).catch(() => null);
  if (!raw) return { text: '', ok: false, imageUrls: [] };
  const html = new TextDecoder().decode(raw);
  const text = htmlToText(html).slice(0, BODY_MAX_CHARS);
  const loginWall = text.length < 400 && /로그인|카페\s*가입|비공개\s*게시물/.test(text);
  if (text.length < 200 || loginWall) return { text, ok: false, imageUrls: [] };
  return { text, ok: true, imageUrls: extractImageUrls(html, url) };
}

async function classifyWithClaude(
  brand: string, text: string, images: string[]
): Promise<{ verdict: string | null; reason: string; usedImages: number }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const imgNote = images.length > 0
    ? `게시물에 첨부된 사진 ${images.length}장도 함께 제공됩니다(본문 앞부분 사진과 맨 마지막 사진). 사진 속 글자를 꼼꼼히 읽어(OCR) 협찬/광고 워터마크, "~로부터 제공받아 작성" 같은 체험단 배너, 촬영된 안내문 등이 있는지 확인하고, 발견하면 그 문구를 reason에 그대로 인용하세요.`
    : '이 게시물에는 분석 가능한 사진이 첨부되지 않아, 아래 텍스트만으로 판단합니다.';
  const promptText = `다음은 '${brand}' 브랜드가 언급된 게시물의 본문(또는 검색 요약)입니다. ${imgNote}

이 게시물이 "뒷광고"(경제적 대가를 받고 작성했음에도 이를 명확히 표시하지 않은 광고)로 의심되는지 판단해주세요.
공정거래위원회 추천·보증 등에 관한 표시·광고 심사지침 기준:
- "협찬", "제공받음", "유료광고", "광고" 등 표시가 게시물(또는 사진) 앞부분(또는 첫 화면)에 명확한 문구로 있어야 함
- 본문 맨 끝 해시태그 더미에 묻혀 있거나 "정보 전달 목적" 같은 모호한 표현만 있는 경우는 미흡으로 간주
- 표시가 전혀 없는데 특정 제품/브랜드를 구체적으로 체험·리뷰하며 홍보성 어조가 강하면(사진도 제품 협찬을 강하게 암시하면) 의심을 강화

본문:
"""
${text.slice(0, 4000)}
"""

다음 JSON 형식으로만 응답하세요 (다른 설명 금지):
{"verdict":"의심 | 주의 | 낮음","reason":"판단 근거 1~2문장"}`;

  async function callClaude(withImages: boolean) {
    const content: Record<string, unknown>[] = withImages
      ? images.map(url => ({ type: 'image', source: { type: 'url', url } }))
      : [];
    content.push({ type: 'text', text: promptText });
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 300, messages: [{ role: 'user', content }] }),
    });
  }

  let usedImages = images.length;
  let r = await callClaude(usedImages > 0);
  // 이미지 포함 요청이 실패하면(예: Claude 쪽에서 네이버 이미지 URL을 못 가져오거나
  // 디코딩 못 해 400을 내는 경우) 이미지를 빼고 텍스트만으로 1회 재시도 —
  // 이미지 한 장 때문에 분류 전체가 실패하지 않도록. 이때 사진 수는 0으로 기록.
  if (!r.ok && usedImages > 0) {
    r = await callClaude(false);
    usedImages = 0;
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${await r.text().catch(() => '(본문 읽기 실패)')}`);
  const data = await r.json();
  const raw: string = data?.content?.[0]?.text ?? '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { verdict: null, reason: 'AI 응답 파싱 실패', usedImages };
  try {
    const parsed = JSON.parse(match[0]);
    const verdict = ['의심', '주의', '낮음'].includes(parsed.verdict) ? parsed.verdict : null;
    return { verdict, reason: String(parsed.reason || ''), usedImages };
  } catch {
    return { verdict: null, reason: 'AI 응답 파싱 실패', usedImages };
  }
}

function esc(s: unknown) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
}

// Resend 샌드박스 모드는 계정 가입 이메일로만 수신 가능 — 도메인 인증 전까지는
// RESEND_SENDER_EMAIL을 onboarding@resend.dev로 두고 REPORT_RECIPIENTS에 그 주소만 넣어 사용.
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

function buildScanEmailHtml(d: {
  from: string; to: string; brands: string[]; totalFound: number; savedCnt: number; truncated: boolean;
  byVerdict: Record<string, number>;
  suspects: { brand: string; title: string; link: string; reason: string }[];
}) {
  const verdictBox = (label: string, key: string, color: string) => `
    <td style="padding:10px 14px;text-align:center;border-radius:8px;background:#f8fafc;">
      <div style="font-size:12px;color:#64748b;margin-bottom:4px;">${label}</div>
      <div style="font-size:20px;font-weight:700;color:${color};">${d.byVerdict[key] || 0}</div>
    </td>`;

  const suspectList = d.suspects.length
    ? `<ul style="margin:8px 0;padding-left:20px;">${d.suspects.map(s =>
        `<li><strong>${esc(s.brand)}</strong> — <a href="${esc(s.link)}" style="color:#4f86c6;">${esc(s.title)}</a><br><span style="color:#64748b;font-size:13px;">${esc(s.reason)}</span></li>`
      ).join('')}</ul>`
    : `<p style="color:#64748b;margin:8px 0;">'의심' 등급 후보 없음</p>`;

  return `
  <div style="max-width:640px;margin:0 auto;font-family:-apple-system,'Segoe UI',sans-serif;color:#1e293b;">
    <div style="padding:24px 0 16px;border-bottom:2px solid #1e3a5f;">
      <h2 style="margin:0;font-size:20px;color:#1e3a5f;">표시광고 뒷광고 모니터링 스캔 결과</h2>
      <p style="margin:4px 0 0;color:#64748b;font-size:13px;">기간: ${d.from} ~ ${d.to} · 브랜드: ${esc(d.brands.join(', '))}</p>
    </div>

    <p style="margin:16px 0;">검색된 게시물 <strong>${d.totalFound}건</strong> 중 <strong>${d.savedCnt}건</strong> 저장${d.truncated ? ' (처리 상한 초과 — 기간/브랜드를 좁혀 재스캔 권장)' : ''}</p>

    <table style="width:100%;border-collapse:separate;border-spacing:8px;margin:16px 0;">
      <tr>
        ${verdictBox('의심', '의심', '#d95757')}
        ${verdictBox('주의', '주의', '#e0a83a')}
        ${verdictBox('낮음', '낮음', '#5eba8a')}
      </tr>
    </table>

    <h3 style="font-size:15px;color:#1e3a5f;border-left:4px solid #1e3a5f;padding-left:8px;">'의심' 등급 후보</h3>
    ${suspectList}

    <p style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;">
      검수는 대시보드 '표시광고 모니터링' 탭에서 진행하세요.
    </p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: { from?: string; to?: string; brands?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }
  const { from, to, brands } = body;
  if (!from || !to || !Array.isArray(brands) || !brands.length) {
    return json({ error: 'from, to (YYYY-MM-DD), brands(string[]) required' }, 400);
  }

  try {
  const scanId = Date.now();
  const deadline = scanId + SCAN_DEADLINE_MS;
  const allItems: SearchItem[] = [];

  try {
    for (const brand of brands) {
      const q = searchQueryFor(brand);
      // 블로그: postdate가 있어 최신순 페이징 중 기간 이전으로 넘어가면 조기 중단 가능
      let start = 1;
      for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
        const data = await naverSearch('blog', q, start);
        const items = data?.items ?? [];
        if (!items.length) break;
        let stop = false;
        for (const it of items) {
          const postDate = blogPostdateToYmd(it.postdate || '');
          if (postDate && postDate < from) { stop = true; break; }
          if (postDate && postDate > to) continue;
          allItems.push({
            brand, platform: '네이버블로그',
            title: stripHtmlTags(it.title || ''), link: it.link,
            snippet: stripHtmlTags(it.description || ''),
            bloggerName: it.bloggername || '', postDate,
          });
        }
        if (stop || items.length < 100) break;
        start += 100;
      }

      // 카페: 검색 API가 게시일을 반환하지 않음(Naver API 제약) — 상위 일부만 후보로 삼고
      // 본문 수집 후 텍스트에서 날짜 추출을 시도한다(실패 시 게시일 미상으로 표시).
      const cafeData = await naverSearch('cafearticle', q, 1).catch(() => null);
      const cafeItems = (cafeData?.items ?? []).slice(0, MAX_CAFE_PER_BRAND);
      for (const it of cafeItems) {
        allItems.push({
          brand, platform: '네이버카페',
          title: stripHtmlTags(it.title || ''), link: it.link,
          snippet: stripHtmlTags(it.description || ''),
          bloggerName: it.cafename || '', postDate: '',
        });
      }
    }
  } catch (e) {
    return json({ error: `검색 단계 오류: ${String(e)}` }, 502);
  }

  // 이미 저장된 링크는 다시 넣지 않음 — 상태(검토대기/적발등록/오탐제외)와 무관하게 확인.
  // (주의) 사람이 '선택 삭제'로 후보를 지우면 이 표에서 이력이 완전히 사라지므로,
  // 같은 게시물이 다음 스캔에서 새 후보로 다시 나타날 수 있음 — 재등장을 막으려면
  // 삭제 대신 '모니터링'(오탐제외) 처리로 이력을 남겨둘 것.
  let existingLinks = new Set<string>();
  try {
    const linkRes = await fetch(`${SUPABASE_URL}/rest/v1/ad_watch_candidates?select=link`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (linkRes.ok) {
      const rows: { link: string }[] = await linkRes.json();
      existingLinks = new Set(rows.map(r => r.link));
    }
  } catch { /* 조회 실패 시 dedup 없이 기존 동작대로 진행 */ }

  const newItems = allItems.filter(it => !existingLinks.has(it.link));

  const totalFound = allItems.length;
  let truncated = newItems.length > MAX_CANDIDATES;
  const candidates = newItems.slice(0, MAX_CANDIDATES);

  const results: Record<string, unknown>[] = [];
  let idx = 0;
  async function worker() {
    while (idx < candidates.length) {
      if (Date.now() > deadline) { truncated = true; return; }
      const item = candidates[idx++];
      const { text: bodyText, ok: bodyOk, imageUrls } = await fetchBody(item.link);
      const finalText = bodyOk && bodyText ? bodyText : item.snippet;

      let postDate = item.postDate;
      if (!postDate) postDate = extractDateFromText(finalText);
      if (postDate && (postDate < from || postDate > to)) continue; // 기간 밖으로 판명 — 저장 생략

      // 본문 수집에 성공한 경우에만 이미지도 함께 분석(스니펫만 있을 땐 이미지 URL이 없음).
      // 카페는 본문이 iframe 안에 있어 PC 페이지에서 잡히는 img가 카페 대표 배너/썸네일뿐이라
      // 판별에 도움이 안 되고 요청만 늘어 제외한다.
      const images: string[] = [];
      if (bodyOk && item.platform === '네이버블로그') {
        for (const imgUrl of imageUrls) {
          if (await checkImageUrl(imgUrl)) images.push(imgUrl);
        }
      }

      let verdict: string | null = null;
      let reason = '';
      let imageCount = 0;
      try {
        const c = await classifyWithClaude(item.brand, finalText, images);
        verdict = c.verdict; reason = c.reason; imageCount = c.usedImages;
      } catch (e) {
        reason = `AI 분류 실패: ${String(e)}`;
      }
      results.push({
        scan_id: scanId, period_from: from, period_to: to,
        brand: item.brand, platform: item.platform,
        title: item.title, link: item.link, snippet: item.snippet,
        blogger_name: item.bloggerName, post_date: postDate || null,
        body_fetch_ok: bodyOk, image_count: imageCount,
        ai_verdict: verdict, ai_reason: reason,
        status: '검토대기',
      });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const byVerdict: Record<string, number> = {};
  for (const r of results) {
    const v = (r.ai_verdict as string | null) || '미분류';
    byVerdict[v] = (byVerdict[v] || 0) + 1;
  }
  const suspects = results
    .filter(r => r.ai_verdict === '의심')
    .slice(0, 10)
    .map(r => ({ brand: r.brand as string, title: r.title as string, link: r.link as string, reason: r.ai_reason as string }));

  async function notifyByEmail(savedCnt: number): Promise<boolean> {
    try {
      const html = buildScanEmailHtml({ from: from!, to: to!, brands: brands!, totalFound, savedCnt, truncated, byVerdict, suspects });
      const er = await sendResendEmail(`[외식BG RO실] 표시광고 모니터링 스캔 결과 (${to})`, html);
      if (!er.sent) console.error('[ad-watch-scan] email not sent:', er.reason);
      return er.sent;
    } catch (e) {
      console.error('[ad-watch-scan] email send error', e);
      return false;
    }
  }

  if (!results.length) {
    const emailSent = await notifyByEmail(0);
    return json({ ok: true, scanId, inserted: [], totalFound, truncated, emailSent });
  }

  const insRes = await fetch(`${SUPABASE_URL}/rest/v1/ad_watch_candidates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(results),
  });
  if (!insRes.ok) {
    return json({ error: `저장 실패: HTTP ${insRes.status} — ${await insRes.text()}` }, 502);
  }
  const inserted = await insRes.json();
  const emailSent = await notifyByEmail(results.length);

  return json({ ok: true, scanId, inserted, totalFound, truncated, emailSent });
  } catch (e) {
    console.error('[ad-watch-scan] unhandled error', e);
    return json({ error: `처리 중 오류: ${String(e)}` }, 500);
  }
});

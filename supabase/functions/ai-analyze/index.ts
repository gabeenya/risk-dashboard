// Supabase Edge Function: ai-analyze
// Anthropic SSE를 직접 파싱 → 단순화된 { t } SSE로 재전송 (Supabase 프록시 호환)

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let prompt: string | undefined;
  try {
    const body = await req.json();
    prompt = body?.prompt;
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }
  if (!prompt || typeof prompt !== 'string') {
    return json({ error: 'prompt (string) required' }, 400);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok || !r.body) {
      const errData = await r.json().catch(() => ({ error: 'unknown error' }));
      return json(errData, r.status);
    }

    // Anthropic SSE를 파싱해서 { t } / { error } 이벤트만 클라이언트로 재전송
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    const enc = new TextEncoder();
    let buf = '';

    const outStream = new ReadableStream({
      async start(ctrl) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const s = line.slice(6).trim();
              if (!s || s === '[DONE]') continue;
              try {
                const ev = JSON.parse(s);
                if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
                  ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ t: ev.delta.text })}\n\n`));
                } else if (ev.type === 'error') {
                  ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ error: ev.error?.message ?? 'API error' })}\n\n`));
                }
              } catch { /* malformed JSON 무시 */ }
            }
          }
        } finally {
          ctrl.enqueue(enc.encode('data: [DONE]\n\n'));
          ctrl.close();
        }
      },
    });

    return new Response(outStream, {
      headers: {
        ...CORS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});

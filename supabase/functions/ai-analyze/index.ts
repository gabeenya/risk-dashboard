// Supabase Edge Function: ai-analyze
// 클라이언트(GitHub Pages)에서 prompt를 받아 Anthropic API로 프록시 호출.
// ANTHROPIC_API_KEY는 Supabase Edge Function 시크릿에 보관.

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
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok || !r.body) {
      const errData = await r.json().catch(() => ({ error: 'unknown error' }));
      return json(errData, r.status);
    }

    // Anthropic SSE 스트림을 클라이언트로 그대로 중계
    return new Response(r.body, {
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

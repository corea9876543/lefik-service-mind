// Cloudflare Worker — 질문(/ask, 항상) + 실시간 상태(/status, KV 연결 시).
// 의존성 없음(raw fetch) → `wrangler deploy` 만으로 끝. npm install 불필요.
//
// 시크릿(필수):  npx wrangler secret put ANTHROPIC_API_KEY
// (모니터링까지 쓰려면 KV 'STATUS' 바인딩 + STATUS_WRITE_KEY 시크릿 추가 — wrangler.toml 참고)

const GLANCE_SYSTEM =
  '너는 AR 글래스용 글랜스 비서다. 평문으로 1~3문장, 마크다운/목록 없이 핵심만 간결하게 답하라. ' +
  '한국어로 물으면 한국어로 답한다.';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-write-key',
};
const json = (code, body) =>
  new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);

    // ── 실시간 상태 (KV 'STATUS' 바인딩이 있을 때만 동작) ──
    if (url.pathname === '/status') {
      if (!env.STATUS) return json(200, { state: 'offline', headline: '상태 저장소 미설정', step: { current: 0, total: 0 } });
      if (request.method === 'GET') {
        const cur = await env.STATUS.get('current');
        return json(200, cur ? JSON.parse(cur) : { state: 'offline', headline: '상태 없음', step: { current: 0, total: 0 } });
      }
      if (request.method === 'POST') {
        if (request.headers.get('x-write-key') !== env.STATUS_WRITE_KEY) return json(401, { error: 'unauthorized' });
        let b; try { b = await request.json(); } catch { return json(400, { error: 'invalid JSON' }); }
        b.updatedAt = new Date().toISOString();
        await env.STATUS.put('current', JSON.stringify(b));
        return json(200, { ok: true });
      }
    }

    // ── 질문 (경로 A: 모델에게) ──
    if (request.method === 'POST' && url.pathname === '/ask') {
      let b; try { b = await request.json(); } catch { return json(400, { error: 'invalid JSON' }); }
      const question = (b.question || '').trim();
      if (!question) return json(400, { error: 'question required' });
      if (b.target === 'session') return json(400, { error: '세션 질문은 로컬 Node 서버(ask-server.mjs)를 사용하세요.' });

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'accept': 'application/json',
          'user-agent': 'rayban-glance/1.0 (+https://github.com/corea9876543/lefik-service-mind)',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-8',
          max_tokens: 1024,
          system: GLANCE_SYSTEM,
          messages: [{ role: 'user', content: question }],
        }),
      });
      const raw = await r.text();
      let data; try { data = JSON.parse(raw); } catch { data = null; }
      if (!r.ok) {
        const msg = (data && data.error && data.error.message) || raw.slice(0, 300) || 'api error';
        return json(r.status, { error: msg, status: r.status });
      }
      const answer = ((data && data.content) || []).filter((x) => x.type === 'text').map((x) => x.text).join('').trim();
      return json(200, { target: 'model', answer });
    }

    return json(404, { error: 'not found' });
  },
};

// Cloudflare Worker — 실시간 상태(/status, KV) + 질문(/ask, 경로 A).
// "항상 켜져 있는" 옵션. (KV는 글로벌 최종 일관성이라 갱신 반영이 수 초~최대 ~1분 지연될 수 있음.
//  진짜 즉시 반영이 필요하면 같은 머신에서 도는 Node 서버(ask-server.mjs)+cloudflared 권장.)
//
//   GET  /status        현재 상태 (안경 폴링)
//   POST /status        상태 갱신 (x-write-key 헤더 필요). 작업 세션 훅이 push.
//   POST /ask           모델에게 질문 (경로 A)
//
// 시크릿:  npx wrangler secret put ANTHROPIC_API_KEY   /   npx wrangler secret put STATUS_WRITE_KEY
// KV:      npx wrangler kv namespace create STATUS  → 나온 id를 wrangler.toml 에 기입
// 배포:    npx wrangler deploy

import Anthropic from '@anthropic-ai/sdk';

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

    // ── 실시간 상태 ──
    if (url.pathname === '/status') {
      if (request.method === 'GET') {
        const cur = await env.STATUS.get('current');
        return json(200, cur ? JSON.parse(cur) : { state: 'offline', headline: '상태 없음', step: { current: 0, total: 0 } });
      }
      if (request.method === 'POST') {
        if (request.headers.get('x-write-key') !== env.STATUS_WRITE_KEY) return json(401, { error: 'unauthorized' });
        let body; try { body = await request.json(); } catch { return json(400, { error: 'invalid JSON' }); }
        body.updatedAt = new Date().toISOString();
        await env.STATUS.put('current', JSON.stringify(body));
        return json(200, { ok: true });
      }
    }

    // ── 질문 (경로 A) ──
    if (request.method === 'POST' && url.pathname === '/ask') {
      let body; try { body = await request.json(); } catch { return json(400, { error: 'invalid JSON' }); }
      const question = (body.question || '').trim();
      const target = body.target === 'session' ? 'session' : 'model';
      if (!question) return json(400, { error: 'question required' });
      if (target === 'session') return json(400, { error: '세션 질문(경로 B)은 Node 서버(ask-server.mjs)를 사용하세요.' });
      try {
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
        const stream = client.messages.stream({
          model: 'claude-opus-4-8', max_tokens: 1024, system: GLANCE_SYSTEM,
          thinking: { type: 'adaptive' }, output_config: { effort: 'low' },
          messages: [{ role: 'user', content: question }],
        });
        const msg = await stream.finalMessage();
        return json(200, { target, answer: msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() });
      } catch (e) { return json(500, { error: String(e?.message || e) }); }
    }

    return json(404, { error: 'not found' });
  },
};

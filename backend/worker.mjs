// Cloudflare Worker — 경로 A(모델에게 질문) 서버리스 버전.
//   POST /ask { question, target } → Claude API 호출, 짧은 글랜스 답변 반환.
// 키는 Worker 시크릿(ANTHROPIC_API_KEY). 클라이언트엔 절대 두지 않음.
//
// 배포:
//   cd backend
//   npx wrangler secret put ANTHROPIC_API_KEY    # 키 입력
//   npx wrangler deploy
//
// 참고: 경로 B(작업 중 세션에 질문)는 세션이 도는 레포 옆 Node 서버(ask-server.mjs)가 담당.
//        Worker는 상태가 없어 큐를 못 들고 있으므로, 여기서는 안내만 반환한다.

import Anthropic from '@anthropic-ai/sdk';

const GLANCE_SYSTEM =
  '너는 AR 글래스용 글랜스 비서다. 평문으로 1~3문장, 마크다운/목록 없이 핵심만 간결하게 답하라. ' +
  '한국어로 물으면 한국어로 답한다.';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (code, body) =>
  new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/ask') return json(404, { error: 'not found' });

    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'invalid JSON' }); }
    const question = (body.question || '').trim();
    const target = body.target === 'session' ? 'session' : 'model';
    if (!question) return json(400, { error: 'question required' });

    if (target === 'session') {
      return json(400, { error: '세션 질문(경로 B)은 레포 옆 Node 서버(ask-server.mjs)를 사용하세요.' });
    }

    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const stream = client.messages.stream({
        model: 'claude-opus-4-8',
        max_tokens: 1024,
        system: GLANCE_SYSTEM,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: question }],
      });
      const msg = await stream.finalMessage();
      const answer = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      return json(200, { target, answer });
    } catch (e) {
      return json(500, { error: String(e?.message || e) });
    }
  },
};

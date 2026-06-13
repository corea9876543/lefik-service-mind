// 레이밴/폰 → Claude 질문 백엔드.
//
//   POST /ask  { "question": "...", "target": "model" | "session" }
//     - target=model   : Claude API에 직접 물어 답을 반환 (경로 A)
//     - target=session : ../inbox.json 큐에 질문을 적재하고 id를 반환 (경로 B).
//                        지금 작업 중인 Claude Code 세션이 read-inbox.sh로 읽고
//                        answer-inbox.sh로 답을 써넣는다.
//
//   GET  /inbox/:id    경로 B 질문의 처리/답변 상태 폴링용
//
// 키는 서버에만: 환경변수 ANTHROPIC_API_KEY 필요. 클라이언트(렌즈 JS)엔 절대 두지 않음.
// 실행: cd backend && npm install && ANTHROPIC_API_KEY=... npm start

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INBOX = join(__dirname, '..', 'inbox.json');
const PORT = process.env.PORT || 8787;

const client = new Anthropic(); // ANTHROPIC_API_KEY 환경변수에서 읽음

// 렌즈/폰은 글랜스 화면 → 짧게 답하도록 지시
const GLANCE_SYSTEM =
  '너는 AR 글래스용 글랜스 비서다. 평문으로 1~3문장, 마크다운/목록 없이 핵심만 간결하게 답하라. ' +
  '한국어로 물으면 한국어로 답한다.';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (res, code, body) =>
  res.writeHead(code, { 'Content-Type': 'application/json', ...CORS }).end(JSON.stringify(body));

async function readInbox() {
  try { return JSON.parse(await readFile(INBOX, 'utf8')); }
  catch { return []; }
}
async function writeInbox(items) {
  await writeFile(INBOX, JSON.stringify(items, null, 2) + '\n');
}

async function askModel(question) {
  // 짧은 답이라 max_tokens는 작게, 빠른 글랜스용으로 effort low + 적응형 사고.
  const stream = client.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: GLANCE_SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: question }],
  });
  const msg = await stream.finalMessage();
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end();

  // 경로 B 폴링: GET /inbox/:id
  if (req.method === 'GET' && req.url.startsWith('/inbox/')) {
    const id = decodeURIComponent(req.url.slice('/inbox/'.length));
    const item = (await readInbox()).find((q) => q.id === id);
    return item ? json(res, 200, item) : json(res, 404, { error: 'not found' });
  }

  if (req.method === 'POST' && req.url === '/ask') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body;
    try { body = JSON.parse(raw || '{}'); }
    catch { return json(res, 400, { error: 'invalid JSON' }); }

    const question = (body.question || '').trim();
    const target = body.target === 'session' ? 'session' : 'model';
    if (!question) return json(res, 400, { error: 'question required' });

    try {
      if (target === 'model') {
        const answer = await askModel(question);
        return json(res, 200, { target, answer });
      }
      // 경로 B: 큐에 적재
      const items = await readInbox();
      const entry = {
        id: 'q_' + Date.now().toString(36),
        question,
        status: 'pending',          // pending → answered
        answer: null,
        createdAt: new Date().toISOString(),
      };
      items.push(entry);
      await writeInbox(items);
      return json(res, 200, { target, id: entry.id, status: entry.status });
    } catch (e) {
      console.error(e);
      return json(res, 500, { error: String(e?.message || e) });
    }
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => console.log(`ask-server on :${PORT}`));

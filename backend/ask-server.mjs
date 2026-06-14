// 레이밴/폰 → Claude 질문 + 실시간 상태 백엔드 (Node, 메모리 기반 = 즉시 반영).
//
//   GET  /status          현재 작업 상태 (안경이 폴링)
//   POST /status          상태 갱신 (작업 세션의 훅이 push). x-write-key 헤더로 보호(설정 시)
//   POST /ask  { question, target }
//     - target=model   : Claude API 직접 (경로 A)
//     - target=session : inbox.json 큐 적재 (경로 B)
//   GET  /inbox/:id       경로 B 답변 폴링
//
// 키는 서버에만: ANTHROPIC_API_KEY 필요. 선택: STATUS_WRITE_KEY(상태 push 보호).
// 실행: cd backend && npm install && ANTHROPIC_API_KEY=... npm start
// 자기 컴퓨터에서 작업을 모니터링하는 용도면 이걸 로컬 실행 + cloudflared 로 노출하는 게 가장 실시간.

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INBOX = join(__dirname, '..', 'inbox.json');
const PORT = process.env.PORT || 8787;
const WRITE_KEY = process.env.STATUS_WRITE_KEY || ''; // 비우면 보호 없음(로컬 전용 시)

const client = new Anthropic();

// 메모리에 보관 = 폴링 시 즉시 반영(캐시 지연 없음)
let currentStatus = {
  session: 'idle', state: 'offline', headline: '대기 중', task: '',
  step: { current: 0, total: 0 }, needsInput: false, updatedAt: new Date().toISOString(),
};

const GLANCE_SYSTEM =
  '너는 AR 글래스용 글랜스 비서다. 평문으로 1~3문장, 마크다운/목록 없이 핵심만 간결하게 답하라. ' +
  '한국어로 물으면 한국어로 답한다.';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-write-key',
};
const json = (res, code, body) =>
  res.writeHead(code, { 'Content-Type': 'application/json', ...CORS }).end(JSON.stringify(body));

async function readInbox() { try { return JSON.parse(await readFile(INBOX, 'utf8')); } catch { return []; } }
async function writeInbox(items) { await writeFile(INBOX, JSON.stringify(items, null, 2) + '\n'); }

async function askModel(question) {
  const stream = client.messages.stream({
    model: 'claude-opus-4-8', max_tokens: 1024, system: GLANCE_SYSTEM,
    thinking: { type: 'adaptive' }, output_config: { effort: 'low' },
    messages: [{ role: 'user', content: question }],
  });
  const msg = await stream.finalMessage();
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end();
  const url = new URL(req.url, 'http://x');

  // ── 실시간 상태 ──
  if (url.pathname === '/status') {
    if (req.method === 'GET') return json(res, 200, currentStatus);
    if (req.method === 'POST') {
      if (WRITE_KEY && req.headers['x-write-key'] !== WRITE_KEY) return json(res, 401, { error: 'unauthorized' });
      let raw = ''; for await (const c of req) raw += c;
      let body; try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'invalid JSON' }); }
      currentStatus = { ...currentStatus, ...body, updatedAt: new Date().toISOString() };
      return json(res, 200, { ok: true });
    }
  }

  // ── 경로 B 폴링 ──
  if (req.method === 'GET' && url.pathname.startsWith('/inbox/')) {
    const id = decodeURIComponent(url.pathname.slice('/inbox/'.length));
    const item = (await readInbox()).find((q) => q.id === id);
    return item ? json(res, 200, item) : json(res, 404, { error: 'not found' });
  }

  // ── 질문 ──
  if (req.method === 'POST' && url.pathname === '/ask') {
    let raw = ''; for await (const c of req) raw += c;
    let body; try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'invalid JSON' }); }
    const question = (body.question || '').trim();
    const target = body.target === 'session' ? 'session' : 'model';
    if (!question) return json(res, 400, { error: 'question required' });
    try {
      if (target === 'model') return json(res, 200, { target, answer: await askModel(question) });
      const items = await readInbox();
      const entry = { id: 'q_' + Date.now().toString(36), question, status: 'pending', answer: null, createdAt: new Date().toISOString() };
      items.push(entry); await writeInbox(items);
      return json(res, 200, { target, id: entry.id, status: entry.status });
    } catch (e) { console.error(e); return json(res, 500, { error: String(e?.message || e) }); }
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => console.log(`ask-server on :${PORT}`));

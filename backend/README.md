# 질문 백엔드 — 두 가지 배포

| 파일 | 용도 | 경로 | 호스팅 |
|------|------|------|--------|
| `worker.mjs` + `wrangler.toml` | **경로 A**(모델에게 질문) | 무상태 | Cloudflare Worker (무료, 글로벌) |
| `ask-server.mjs` | **경로 A + B**(모델 + 작업 중 세션) | 큐 파일 사용 | 세션이 도는 레포 옆(VM/로컬) |

> **왜 둘?** 경로 B(작업 중 세션에 질문)는 큐(`../inbox.json`)를 세션 옆에서 읽고/써야 해서,
> 무상태 서버리스(Worker)로는 안 됩니다. "그냥 Claude에게 질문"(경로 A)은 Worker로 충분.

## ⚡ 가장 쉬운 시작 (실시간 모니터 + 질문 한 방에)

작업하는 **본인 컴퓨터**에서:
```bash
export ANTHROPIC_API_KEY=sk-ant-...     # 질문용(모니터링만이면 아무 값)
cd backend && ./start-local.sh          # 백엔드 + cloudflared 터널 자동, 다음 단계까지 출력
```
출력된 안내대로 ① `./set-backend.sh <URL>` 후 "머지해줘" ② 작업 셸에 `export STATUS_ENDPOINT/STATUS_WRITE_KEY` 하면 끝.
(`cloudflared` 필요: `brew install cloudflared`)

아래는 수동/세부 옵션입니다.

## A) Cloudflare Worker — 경로 A (추천: 글랜스에서 모델 질문)
```bash
cd backend
npm install
npx wrangler login                      # 브라우저 로그인
npx wrangler secret put ANTHROPIC_API_KEY   # 키 입력(코드/파일에 안 남음)
npx wrangler deploy                      # → https://claude-glasses-ask.<계정>.workers.dev
```
배포된 주소를 `glasses/app.js`의 `CONFIG.askBackend` 와 `ask.html?api=` 에 넣으면 끝.

## B) Node 서버 — 경로 A + B (작업 중 세션에 질문까지)
세션이 도는 곳(레포가 있는 머신)에서 실행:
```bash
cd backend
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start    # :8787
```
- 경로 B 질문은 `../inbox.json`에 쌓이고, 세션이 `../read-inbox.sh` / `../answer-inbox.sh`로 처리.
- 공개 접근이 필요하면 `cloudflared tunnel` 등으로 HTTPS 노출.

## 공통
- 모델 `claude-opus-4-8`, 글랜스용 1~3문장 system 지시 + effort `low`.
- **키는 서버에만.** 클라이언트(렌즈/폰 JS)엔 절대 두지 않음 → 그래서 백엔드가 필수.

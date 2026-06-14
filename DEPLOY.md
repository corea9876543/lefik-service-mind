# 배포 가이드 — 레이밴 안경에서 쓰기까지

세 조각: ①안경 웹 앱 호스팅 → ②질문 백엔드 → ③안경 등록. (+선택: 음성 네이티브)

```
[glasses/ 웹 앱]  ──HTTPS──▶  레이밴 렌즈 (Meta AI 앱으로 등록)
       │ 질문 시
       ▼
[backend/ Worker or Node]  ──▶  Claude API / 세션 큐(inbox.json)
```

---

## ① 안경 웹 앱 호스팅 (`glasses/`)

웹 앱은 **공개 HTTPS URL**이 필요. 둘 중 하나:

### A. Vercel (공식 권장, publish-to-vercel 규격 — `server.js`/`vercel.json` 이미 포함)
```bash
cd glasses
npx vercel --yes --prod        # 최초 1회 로그인 필요 → https://<프로젝트>.vercel.app
```
> 배포 후 Vercel 인증 보호 해제 필요 시: 대시보드 → Project → Settings → Deployment Protection → 끄기.

### B. GitHub Pages (토글만, 제가 못 누름)
리포 **Settings → Pages → Source: 이 브랜치** 지정 →
`https://corea9876543.github.io/lefik-service-mind/glasses/`

## ② 질문 백엔드 (`backend/`)

### 경로 A(모델 질문) — Cloudflare Worker (무료)
```bash
cd backend && npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY    # 키는 시크릿
npx wrangler deploy                          # → https://claude-glasses-ask.<계정>.workers.dev
```

### 경로 B(작업 중 세션에 질문) — Node 서버 (세션 옆에서)
```bash
cd backend && npm install && ANTHROPIC_API_KEY=... npm start   # :8787
```

### 백엔드 주소 연결
`glasses/app.js`의 `CONFIG.askBackend` 를 위 배포 주소로 바꾸고 ①을 다시 배포.

## ③ 안경에 등록 (정식 등록/승인 불필요 — Developer Mode 토글만)

**먼저 Developer Mode 켜기** (한 번만):
- 폰 **Meta AI 앱 → Settings → App Info → 앱 버전 번호 5번 탭 → Developer Mode 토글 ON**

**그다음 웹 앱 추가:**
- **App Connections → Web Apps → Add a web app**
- 이름: `Claude`
- URL: ① 에서 받은 HTTPS 주소 (`…/glasses/` 또는 `…vercel.app`)
- → 안경 앱 그리드 맨 아래에 바로 나타남

> 본인 안경 테스트는 개발자 프리뷰 등록 없이 가능. 타인에게 공유하려면 그 사람도 Developer Mode ON 필요(공개 스토어 배포는 프리뷰라 아직 불가).

### QR로 한 번에 (선택)
딥링크 포맷:
```
fb-viewapp://web_app_deep_link?appName=Claude&appUrl=<URL-인코딩된-주소>
```
공식 스타터킷의 `qr-code` 스킬 또는 임의 QR 생성기로 만들어 폰 카메라로 스캔.

## (선택) 음성 — 네이티브
`companion/README.md` 참고. 폰 마이크+STT → 백엔드 → 렌즈 표시. MockDevice로 하드웨어 없이 디스플레이 흐름 테스트 가능.

---

## 제가 못 하는 것 (님 손 필요)
- **ANTHROPIC_API_KEY 발급** + Worker 시크릿/Node 환경변수에 주입
- **Vercel/Cloudflare 로그인** (대화형) 및 **GitHub Pages 토글**
- **Meta AI 앱에서 Developer Mode 토글** (정식 등록 불필요 / 일반 배포만 파트너 제한)
- **실제 안경/Xcode/Android Studio 빌드** (음성 네이티브)

이 4가지만 통과하면 안경에서 **모니터링 + 텍스트/핸드라이팅 질문**이 작동합니다.

---

## ★ 실시간 모니터링 (지금 작업을 안경에서 라이브로)

기본 모니터는 `raw.githubusercontent`를 읽어 **CDN 캐시로 수십 초~5분 지연**됩니다(=실시간 아님).
실시간으로 하려면 **작업 세션이 상태를 백엔드에 push → 안경이 백엔드를 폴링**합니다.

```
작업 세션(.claude/settings.json 훅) ─ status-push.sh ─▶ 백엔드 /status ◀─ 폴링 ─ 안경
```

### 1) 백엔드 띄우기 — 두 옵션
- **(추천, 진짜 실시간) Node + cloudflared**: 작업하는 그 컴퓨터에서
  ```bash
  cd backend && npm install
  ANTHROPIC_API_KEY=sk-ant-... STATUS_WRITE_KEY=mysecret npm start   # :8787, 메모리=즉시
  cloudflared tunnel --url http://localhost:8787                      # → https://xxxx.trycloudflare.com
  ```
- **(항상 켜짐) Cloudflare Worker + KV**: `backend/README.md` 참고. KV는 ~수 초~1분 지연 가능.

### 2) 안경 앱에 백엔드 연결
`glasses/app.js`의 `CONFIG.backend` 를 위 주소(예: `https://xxxx.trycloudflare.com`)로 설정 → main에 머지(자동 재배포).

### 3) 작업 세션에서 상태 push 켜기
`.claude/settings.json` 에 훅이 이미 들어있음(매 턴 시작=running, 종료=waiting 자동 push).
작업하는 셸에 환경변수만 주면 동작:
```bash
export STATUS_ENDPOINT=https://xxxx.trycloudflare.com/status
export STATUS_WRITE_KEY=mysecret
```
(`STATUS_ENDPOINT` 없으면 훅은 조용히 무동작 → 다른 세션에 안전)

> 더 세밀한 상태가 필요하면 작업 중 직접: `./status-push.sh --state running --headline "테스트 실행" --step 3/5`

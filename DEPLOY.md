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

## ③ 안경에 등록

**Meta AI 앱 → Devices → Display Glasses settings → App connections → Web apps → Add a web app**
- 이름: `Claude`
- URL: ① 에서 받은 HTTPS 주소 (`…/glasses/` 또는 `…vercel.app`)

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
- **메타 개발자 프리뷰 등록 + 본인 안경 페어링** (본인 안경 테스트는 가능, 일반 배포는 파트너 제한)
- **실제 안경/Xcode/Android Studio 빌드** (음성 네이티브)

이 4가지만 통과하면 안경에서 **모니터링 + 텍스트/핸드라이팅 질문**이 작동합니다.

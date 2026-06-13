# 레이밴 디스플레이 웹 앱 — Claude 모니터 + 질문

Meta Ray-Ban Display 렌즈에서 도는 웹 앱. 모니터링(읽기) + 질문(텍스트/핸드라이팅) 두 화면.

| 파일 | 역할 |
|------|------|
| `index.html` | 600×600 / 두 화면(모니터·질문) / D-pad 내비 마크업 |
| `styles.css` | 검정 배경(=렌즈 투명) · 고대비 · `.focusable` 포커스 링 |
| `app.js` | D-pad(방향키) 내비 + `status.json` 폴링 + 백엔드 질문(A/B) |

> 스펙 출처: Meta Wearables 웹 앱 가이드 — 600×600, 검정 배경(검정=투명), **D-pad 내비게이션만**, 고대비, `.focusable`.

## 0) 한 번만 — 배포 주소 설정
`app.js` 상단 두 상수:
- `STATUS_URL` — `status.json` 공개 URL (이미 이 레포 raw URL로 설정됨)
- `ASK_BACKEND` — `backend/ask-server.mjs` 배포 주소 (질문 기능에 필요)

## 1) 브라우저에서 테스트 (안경 없이)
- `index.html`을 로컬에서 열기 (또는 정적 서버)
- **화살표키 = D-pad**, **Enter = 선택**
- 입력칸 선택 → 타이핑(= 안경에선 Neural Handwriting) → Enter로 전송
- Chrome DevTools(F12) → More tools → Sensors 로 위치/방향 시뮬레이션 가능

## 2) 공개 HTTPS에 올리기
웹 앱은 **공개 HTTPS URL**이 필요합니다 (Vercel/Netlify/Cloudflare Pages/GitHub Pages 등).
GitHub Pages면: Settings → Pages → 이 브랜치 → `…/glasses/` 경로로 접근.

## 3) 안경에 등록
**Meta AI 앱 → Devices → Display Glasses → App connections → Web apps → "Add a web app"** → 위 HTTPS URL 입력.
(메타 공식 스타터킷 `facebookincubator/meta-wearables-webapp`의 publish 스킬로 QR 생성도 가능.)

## 현실 체크
- **본인 안경 테스트는 가능**, 일반 배포(타인에게 공개)는 프리뷰 기간 파트너 제한.
- 메타 개발자 프리뷰/계정 요건이 있을 수 있음 — 등록 화면에서 안내를 따르세요.
- **음성**: 웹 앱 경로 입력은 D-pad + 핸드라이팅. **렌즈 마이크 음성**은 네이티브(Swift/Kotlin) 경로라 별도(`../companion/`).
- 저는 이 환경에서 **실제 안경에 빌드/테스트는 못 합니다** — 위 3단계는 안경을 가진 님이 진행.

## 공식 스타터킷 (선택)
Claude Code에서 메타 공식 플러그인으로 스캐폴딩/검증하고 싶다면:
```
/plugin marketplace add https://github.com/facebookincubator/meta-wearables-webapp
/plugin install meta-wearables-webapp@meta-wearables
```
문서: https://wearables.developer.meta.com/docs/develop/webapps

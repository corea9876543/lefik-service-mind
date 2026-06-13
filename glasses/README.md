# 레이밴 디스플레이 웹 앱 — Claude 모니터 + 질문

Meta Ray-Ban Display 렌즈용 웹 앱. **공식 스타터킷(`facebookincubator/meta-wearables-webapp`) 디자인 시스템·구조에 맞춤.**

| 파일 | 역할 |
|------|------|
| `index.html` | `#app` + `.screen`/`.hidden` 두 화면(모니터·질문), `mrbd-web-app-capable`, manifest |
| `styles.css` | 600×600 / `#000`=투명 / UI 표면 `#1C1E21` / 88dp 버튼 / 포커스 스케일 / 토스트 |
| `app.js` | 네이티브 포커스 D-pad 내비, `data-action` 디스패치, `status.json` 폴링, 질문(A/B) |
| `manifest.webmanifest` | 웹앱 매니페스트 |
| `server.js` `package.json` `vercel.json` | Vercel 정적 배포(publish-to-vercel 규격) |

## 공식 가이드 준수 사항
- 600×600dp, additive 디스플레이 → `body` 검정(투명), UI 표면은 `#1C1E21`(떠 보이게)
- 입력: 터치/마우스 없음 → **D-pad 포커스 이동 + 선택**. 브라우저 테스트는 **화살표키 + Enter**
- 텍스트는 포커스된 `input`에 **Neural Handwriting**로 입력
- `.focusable` 요소만 포커스 순회, 8dp 세이프 마진, 88dp 탭 타깃

## 설정 (배포 시)
`app.js` 상단 `CONFIG`:
- `statusUrl` — `status.json` 공개 URL (이미 이 레포 raw URL)
- `askBackend` — `../backend/` 배포 주소 (질문 기능용)

## 배포 + 안경 등록
→ 루트 **`DEPLOY.md`** 참고 (Vercel/Pages 호스팅 → 백엔드 → Meta AI 앱 'Add a web app' / QR)

## 공식 플러그인으로 검증/보강 (선택)
```
/plugin marketplace add https://github.com/facebookincubator/meta-wearables-webapp
/plugin install meta-wearables-webapp@meta-wearables
```
스킬: `create-webapp` `add-ui` `connect-api` `add-device-sensors` `test-on-device` `publish-to-vercel` `qr-code`.
문서: https://wearables.developer.meta.com/docs/develop/webapps

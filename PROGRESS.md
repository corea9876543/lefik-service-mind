# 진행 상황 (Meta Ray-Ban Display 프로젝트)

> 이 파일만 보면 어디까지 했고 다음에 뭘 할지 바로 이어갈 수 있게 정리한 문서.
> 마지막 갱신: 2026-06-16

## 공통 인프라 (이미 됨)
- **레포**: `corea9876543/lefik-service-mind` · 기본 브랜치 `main` · 개발 브랜치 `claude/rayban-remote-monitoring-5x34bs`
- **안경 웹 앱(라이브)**: `https://corea9876543.github.io/lefik-service-mind/glasses/`
  - GitHub Pages 자동 배포 (`.github/workflows/pages.yml`, **main에 push하면 자동 재배포**)
  - 안경 등록: Meta AI 앱 → Settings → App Info → 버전 5번 탭 → **Developer Mode ON** → App Connections → Web Apps → Add a web app → 위 주소
- **앱 설정 위치**: `glasses/app.js` 상단 `CONFIG`
  - `askBackend` = 질문/음성용 (현재: `https://claude-glasses-ask.yongyongyo.workers.dev`)
  - `statusBackend` = 실시간 모니터용 (현재: **비어 있음** → 느린 github 폴백 사용 중)
- 변경을 라이브에 반영하려면 → **main에 머지** (Claude에게 "머지해줘")

---

## 트랙 1: 실시간 모니터링 (안경에서 작업 진행 보기)

### 된 것
- 안경 모니터 화면 라이브 (현재 `status.json`을 github raw로 읽음 → **최대 수분 지연**)
- 실시간 파이프 1회 검증 성공: 로컬 Node 백엔드(`backend/ask-server.mjs`)의 `/status` ←→ cloudflared 터널 ←→ 안경. 한 줄 push하니 안경이 몇 초 만에 바뀜 (확인됨)
- 상태 push 도구: `status-push.sh`, 자동 훅 `.claude/settings.json`(UserPromptSubmit=running / Stop=waiting)
- 원샷 실행기: `backend/start-windows.bat` (윈도우), `backend/start-local.sh` (mac/linux)

### 현재 상태 / 한계
- `statusBackend`가 비어 있어 지금은 **느린 github 폴백**으로만 모니터됨
- 실시간으로 쓰려면 백엔드가 떠 있어야 하는데, **cloudflared 임시 터널은 창 닫으면 죽고 주소도 매번 바뀜** (실사용에 약함)

### 다음 할 일 (택1)
- **(권장: 영구) Worker + KV로 상태도 처리** — `backend/wrangler.toml`에 KV `STATUS` 추가하고
  `npx wrangler kv namespace create STATUS` → id 기입 → `npx wrangler secret put STATUS_WRITE_KEY` → 재배포.
  그다음 `glasses/app.js`의 `statusBackend`를 `https://claude-glasses-ask.yongyongyo.workers.dev`로 설정 + main 머지.
  (KV는 수 초~1분 지연 가능. 항상 켜짐 = 창/터널 불필요)
- **(즉시·진짜 실시간) 로컬 Node + 터널** — `backend/start-windows.bat` 실행 → 나온 터널 주소를 `statusBackend`에 넣고 머지. 단 창 유지 + 주소 매번 바뀜.
- **자동 push 켜기**: 작업하는 셸에 `STATUS_ENDPOINT`(=백엔드/status), `STATUS_WRITE_KEY` 환경변수 설정.
  - "내 컴퓨터에서 도는 Claude Code 작업"을 보려면 → 로컬에 Claude Code 설치 후 이 레포에서 작업 (훅이 자동 push)

---

## 트랙 2: 안경에서 질문 / 음성

### 된 것
- 안경 "묻기" 화면 (`glasses/` D-pad + 핸드라이팅 입력)
- **영구 백엔드(Cloudflare Worker) 배포 완료**: `https://claude-glasses-ask.yongyongyo.workers.dev` (계정 `yongyongyo`)
  - 코드 `backend/worker.mjs` (의존성 없는 raw fetch `/ask`), 배포기 `backend/deploy-worker-windows.bat`
  - 시크릿 `ANTHROPIC_API_KEY` 설정됨, 키 자체는 **직접 호출로 정상 확인됨**
- `glasses/app.js`의 `askBackend`가 이 Worker로 연결됨

### 현재 상태 / 막힌 곳 ⛔
- Worker `/ask` 호출 시 **`{"error":"Request not allowed"}`** 발생 → 원인 디버깅 중
- 최신 수정(커밋 `068420e`): `/ask`에서 `output_config` 제거(검증된 최소 요청으로) + **업스트림 에러 원문을 그대로 surface**하도록 변경 (아직 **재배포 전**)

### 다음 할 일 (바로 이어서)
1. **Worker 재배포**: 바탕화면 `deploy-worker.bat` 다시 더블클릭 → STEP 2에서 **정상 확인된 그 키** 재입력 → 배포
2. **재테스트** (PowerShell):
   ```
   Invoke-RestMethod -Method Post -Uri "https://claude-glasses-ask.yongyongyo.workers.dev/ask" -ContentType "application/json" -Body '{"question":"Reply with a one-sentence hello.","target":"model"}'
   ```
   - 성공 → 안경 "묻기"(텍스트/핸드라이팅) 완성
   - 실패 → 이번엔 진짜 원인 문구가 보임 → 그걸로 해결
   - (빠른 확인) 브라우저로 `https://claude-glasses-ask.yongyongyo.workers.dev/status` 열어 `{"state":"offline",...}` 뜨면 Worker 정상

### 음성 (트랙 2의 확장)
- **폰 음성**: `ask.html`(브라우저 Web Speech) → `askBackend`(Worker)에 연결만 하면 됨. **다음 작업 대기**
- **안경 렌즈 마이크 음성**: 웹 앱은 마이크 불가 → **네이티브 앱(Swift/Kotlin) 별도 프로젝트** (`companion/`에 골격·SDK 좌표 있음, Mac/Android Studio + 실제 안경 필요)

---

## 환경 제약 (참고)
- 이 클라우드 Claude 세션의 샌드박스는 외부(`*.workers.dev`, `github.io`, `trycloudflare.com`) **아웃바운드 차단** → Claude가 직접 그 URL을 못 열어 검증 불가. 라이브 확인은 사용자가 브라우저/안경으로.
- `CLAUDE.md` 규칙 준수: 코드는 올리기 전 실행/문법 검증, 답변 전 자체 점검.

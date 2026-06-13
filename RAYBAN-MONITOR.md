# 밖에서 Claude 세션 모니터링 + 질문 — 폰 & 레이밴 디스플레이

폰과 Meta Ray-Ban Display 렌즈에서 **같은 글랜스 페이지**로 Claude 작업을 **보고(모니터링)** + **묻는(질문)** 구성.

## 구성 파일

| 파일 | 역할 |
|------|------|
| `monitor.html` | 글랜스 모니터. `status.json`을 폴링해 상태를 표시. 폰=풀뷰 / 좁은 렌즈 뷰포트=초압축 모드 자동 전환 |
| `status.json` | 현재 세션 상태 데이터 |
| `update-status.sh` | 상태를 `status.json`으로 기록(+선택적 push)하는 헬퍼 |
| `ask.html` | 글랜스 질문 페이지. 텍스트(핸드라이팅)·브라우저 음성 입력 → 답을 렌즈/폰에 표시 |
| `backend/ask-server.mjs` | Claude API 호출(경로 A) + 세션 큐 적재(경로 B). 공식 SDK 사용, 키는 서버에만 |
| `inbox.json` | 경로 B 질문 큐 |
| `read-inbox.sh` / `answer-inbox.sh` | 세션이 큐의 질문을 읽고 답을 써넣는 헬퍼 |
| `companion/` | 렌즈 마이크 음성용 네이티브(Swift/Kotlin) 골격 + 가이드 |

## 데이터 흐름

```
Claude Code (클라우드 세션)
   │  update-status.sh 로 status.json 기록 → git push
   ▼
GitHub Pages (정적 호스팅: monitor.html + status.json)
   │  monitor.html 이 5초마다 status.json 폴링
   ├───────────────┬──────────────────────────
   ▼               ▼
폰 브라우저       레이밴 디스플레이 (웹뷰)
```

## 1) 상태 갱신

수동:
```bash
./update-status.sh --state running --headline "테스트 실행 중" --step 3/5 --push
./update-status.sh --state waiting --headline "입력 필요"      --need   --push
./update-status.sh --state done    --headline "작업 완료"               --push
```

자동(권장) — Claude Code **Stop 훅**에 물려서 매 턴 종료 시 갱신:
`.claude/settings.json`
```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command",
      "command": "./update-status.sh --state waiting --headline \"턴 종료, 대기 중\" --push" }]}]
  }
}
```

## 2) 호스팅 (GitHub Pages)

리포 Settings → Pages → Branch를 이 브랜치로 지정하면:
- 폰: `https://<user>.github.io/<repo>/monitor.html`
- `status.json`이 같은 출처에 있어 추가 설정 불필요

> 정적 호스팅 없이 raw 파일을 보려면:
> `monitor.html?src=https://raw.githubusercontent.com/<user>/<repo>/<branch>/status.json`

옵션 파라미터: `?poll=3` (폴링 주기 초), `?src=` (status.json 위치 덮어쓰기).

## 3) 레이밴 디스플레이에서 보기

레이밴 디스플레이는 **Meta Wearables Device Access Toolkit**의 웹 경로로 콘텐츠를 렌즈에 띄운다.

- `monitor.html`은 **검정 배경 + 고대비 밝은 텍스트**로 설계됨 → 렌즈에서 검정은 투명하게 렌더링되므로 글자만 떠 보임
- 좁은/정사각 뷰포트에서 자동으로 **초압축 글랜스 모드**(상태·헤드라인·진행률만)로 전환
- 컴패니언 앱/웹 스타터킷이 이 URL을 띄우도록 연결하면 렌즈에 그대로 표시

### 현실적 한계 (2025~2026 프리뷰 기준)
- Toolkit은 개발자 프리뷰 단계. **자기 안경에 테스트는 가능**하지만 **일반 배포는 선정 파트너만** (2026년 중 확대 예정)
- 안경은 독립 기기가 아니라 **폰 컴패니언 앱의 출력 화면** → 원격 연결·로직은 폰/클라우드가 담당
- 그래서 렌즈에는 "전체 로그"가 아니라 **한두 줄 글랜스**(지금 무슨 단계 / 막혔나)가 적합

## 질문하기 (ask) — 경로 A & B

`ask.html`은 모니터와 같은 글랜스 규격(검정 배경·고대비)이라 폰과 렌즈에서 같이 작동한다.

```
입력(텍스트/핸드라이팅/음성) → ask.html → POST {backend}/ask
   ├─ target=model   → Claude API 직접 호출 → 답을 화면에 표시          (경로 A)
   └─ target=session → inbox.json 큐 적재 → 세션이 read/answer → 폴링 수신  (경로 B)
```

### 백엔드 실행
```bash
cd backend && npm install
ANTHROPIC_API_KEY=sk-ant-... npm start    # :8787
```
- **키는 서버에만.** 클라이언트(렌즈 JS)에 절대 두지 않음 → 그래서 백엔드가 필수.
- 모델은 `claude-opus-4-8`, 글랜스용으로 1~3문장 짧게 답하도록 system 지시 + effort `low`.
- 페이지에서 백엔드 주소 지정: `ask.html?api=https://your-backend.example.com`

### 경로 B — 작업 중 세션에 질문/답
안경에서 온 질문은 `inbox.json`에 쌓인다. 세션(나)은:
```bash
./read-inbox.sh                       # 대기 중 질문 보기
./answer-inbox.sh q_abc123 "여기에 답"  # 답 써넣기 (--push로 Pages 갱신)
```
`ask.html`이 `GET /inbox/:id`를 폴링해 답을 받아 렌즈에 표시한다.

### 음성
- **폰/브라우저**: `ask.html`의 🎙️ 버튼 = Web Speech API(`ko-KR`). 지금 작동, 말 끝나면 자동 전송.
- **렌즈 마이크**: 모바일 SDK의 오디오 딥 액세스 필요 → `companion/` 의 Swift/Kotlin 골격으로 구현.
  같은 `backend/ask-server.mjs`를 공유하므로 로직 중복 없음.

## 상태 스키마 (`status.json`)
```json
{
  "session":   "브랜치/세션 이름",
  "state":     "running | waiting | done | error",
  "headline":  "한 줄 요약 (렌즈 메인 텍스트)",
  "task":      "세부 작업명 (폰에서만 표시)",
  "step":      { "current": 3, "total": 5 },
  "needsInput": false,
  "updatedAt": "ISO8601 (90초 넘으면 OFFLINE 처리)"
}
```

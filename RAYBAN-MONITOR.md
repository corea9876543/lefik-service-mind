# 밖에서 Claude 세션 모니터링 — 폰 & 레이밴 디스플레이

폰과 Meta Ray-Ban Display 렌즈에서 **같은 글랜스 페이지**로 Claude 작업 진행을 보는 구성.

## 구성 파일

| 파일 | 역할 |
|------|------|
| `monitor.html` | 글랜스 모니터. `status.json`을 폴링해 상태를 표시. 폰=풀뷰 / 좁은 렌즈 뷰포트=초압축 모드 자동 전환 |
| `status.json` | 현재 세션 상태 데이터 |
| `update-status.sh` | 상태를 `status.json`으로 기록(+선택적 push)하는 헬퍼 |

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

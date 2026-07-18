# P5 alerts 발신 연동 지시서

## 1. 웹훅 스펙 요약

- URL: `https://claude-glasses-ask.yongyongyo.workers.dev/alerts/push`
- Method: `POST`
- Headers:
  - `Content-Type: application/json; charset=utf-8`
  - `x-write-key: <키>`
- Body:

```json
{
  "level": "vip",
  "title": "K님(VIP) 도착",
  "body": "3F 데스크 · D+케어 대상",
  "ts": "2026-07-18T10:30:00+09:00",
  "source": "n8n-desk-escalation"
}
```

`title`은 필수입니다. `body`, `ts`, `source`는 선택이며, `source` 기본값은 `unknown`입니다. 레벨은 다음 기준으로 사용합니다.

- `vip`: VIP 내원 감지
- `escalation`: 해외환자 응대 에스컬레이션
- `info`: 참고성 알림(전체화면 플래시 없음)

## 2. ⚠ 마스킹 규칙 (발신측 의무)

`title`과 `body`에 환자 성명 전체, 전화번호, 차트번호, 생년월일, 진단·시술 상세를 절대 넣지 마십시오.

- 성명은 이니셜 1자와 구분 표기만 사용: `K님(VIP) 도착 · 3F 데스크`
- 진단·시술 내용은 상황 요약으로 대체: `D+케어 대상`, `응대 지연`
- 국적·언어는 응대에 꼭 필요할 때만 허용: `EN 환자`

Worker는 길이만 제한하며 민감정보를 검열하지 못합니다. 마스킹과 전송 데이터의 적정성은 전적으로 발신측 책임입니다.

## 3. ① n8n 연동

기존 에스컬레이션 워크플로에서 텔레그램 발송 노드 직전 분기점에 `HTTP Request` 노드 하나를 병렬로 추가합니다. 텔레그램 노드를 대체하거나 그 뒤에 직렬로 연결하지 않습니다.

1. Node type: `HTTP Request`
2. Method: `POST`
3. URL: `https://claude-glasses-ask.yongyongyo.workers.dev/alerts/push`
4. Authentication: `None`
5. Headers에 `Content-Type = application/json; charset=utf-8`와 `x-write-key`를 추가합니다. 키는 n8n Credentials 또는 환경변수에서 참조하고 워크플로 JSON에 평문으로 넣지 않습니다.
6. Body Content Type: `JSON`
7. 기존 텔레그램 메시지 필드를 expression으로 매핑하되, §2 마스킹을 먼저 적용합니다. 예: `title = {{ $json.alertTitle }}`, `body = {{ $json.alertSummary }}`, `ts = {{ $json.eventAt }}`.
8. Settings에서 `Continue On Fail`을 활성화합니다. 알림 글랜스는 부가 채널이므로 실패가 텔레그램 본선을 중단시키면 안 됩니다.

에스컬레이션 예시:

```json
{
  "level": "escalation",
  "title": "W님 응대 지연",
  "body": "EN 환자 · 통역 지원 필요",
  "ts": "{{ $json.eventAt }}",
  "source": "n8n-desk-escalation"
}
```

VIP 예시:

```json
{
  "level": "vip",
  "title": "K님(VIP) 도착",
  "body": "3F 데스크 · D+케어 대상",
  "ts": "{{ $json.eventAt }}",
  "source": "n8n-vip-arrival"
}
```

## 4. ② NAS ops 연동 (Windows)

키는 NAS 환경변수 `ALERT_KEY` 또는 기존 ops secrets 파일에 추가합니다. secrets 파일은 BOM 없는 UTF-8로 저장하십시오. 스크립트나 명령에 실제 키를 평문 하드코딩하지 않습니다.

ASCII payload만 보낼 때의 `cmd.exe` 한 줄 예시:

```bat
curl -s -X POST "https://claude-glasses-ask.yongyongyo.workers.dev/alerts/push" -H "x-write-key: %ALERT_KEY%" -H "Content-Type: application/json; charset=utf-8" --data-binary "{\"level\":\"info\",\"title\":\"VIP arrival\",\"body\":\"3F desk\",\"source\":\"nas-ops\"}"
```

한글 payload는 Git Bash/curl 인라인 문자열로 만들지 마십시오. 인코딩 손상을 막기 위해 Python으로 BOM 없는 UTF-8 JSON 파일을 만든 뒤 전송합니다.

```bat
python -c "import json,pathlib; pathlib.Path('alert.json').write_text(json.dumps({'level':'vip','title':'K님(VIP) 도착','body':'3F 데스크 · D+케어 대상','source':'nas-ops'},ensure_ascii=False),encoding='utf-8')"
curl -s -X POST "https://claude-glasses-ask.yongyongyo.workers.dev/alerts/push" -H "x-write-key: %ALERT_KEY%" -H "Content-Type: application/json; charset=utf-8" --data-binary @alert.json
```

`alert.json`을 직접 준비하는 경우에도 UTF-8(BOM 없음)로 저장한 다음 두 번째 명령만 실행합니다. PowerShell에서는 환경변수 표기가 `$env:ALERT_KEY`이므로 위 명령은 `cmd.exe` 기준임에 유의하십시오.

## 5. 검증법

1. 전송 응답의 `ok: true`만으로 완료 판단하지 않습니다.
2. 브라우저에서 `https://claude-glasses-ask.yongyongyo.workers.dev/alerts`를 열어 `alerts[0]`이 방금 보낸 내용인지 확인합니다.
3. 안경 또는 폰에서 Pages의 `glasses/alerts.html`을 열고, 새 `vip`/`escalation` 알림이 5초 안에 플래시되는지 확인합니다. 페이지를 처음 연 시점의 기존 알림은 재플래시되지 않으므로 페이지를 연 뒤 테스트 알림을 보내십시오.

## 추가 주의 (QA 검증 반영, 2026-07-18)
- **절단 규칙**: 제목은 20자, 본문은 60자를 넘으면 서버가 말없이 잘라낸다(말줄임표 처리). 발신측에서 미리 길이를 맞출 것.
- **level 값 주의**: `vip`/`escalation`/`info` 외의 값(오타 포함)은 경고 없이 `info`로 강등되어 **플래시가 뜨지 않는다**. n8n expression에서 오타에 특히 주의.

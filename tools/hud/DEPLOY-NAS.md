# 레픽 운영 HUD — NAS 배포 절차

대상은 병원 LAN의 NAS PC(`192.168.0.99`)입니다. 이 PC에서는 사설망 ops 및 실데이터 검증을 완료할 수 없으므로, 아래 절차를 NAS의 Claude 세션에서 순서대로 수행합니다. 환자 성명, 차트번호, 시술명, 개별 금액은 코드·로그·payload·채팅에 남기지 않습니다.

## 1. 미확정 TODO 해소

1. NAS에서 `repic-ops` 설치 경로를 찾고 코드를 읽습니다.
2. 기존 API 중 오늘 예약 총계, 내원, 노쇼, 취소, 남은 예약 및 다음 예약 시각/동시 예약 건수를 집계할 수 있는 endpoint와 응답 필드를 확인합니다. 환자 목록 API를 사용해야 한다면 함수 내부에서 즉시 숫자와 `HH:MM`만 집계하고 원본을 반환하거나 기록하지 않습니다.
3. 에스컬레이션 테이블과 “열림”을 뜻하는 정확한 상태값을 확인합니다.
4. ops SQLite 파일의 실제 경로와 예약/에스컬레이션 테이블·컬럼을 확인합니다. DB 연결은 반드시 `mode=ro` URI를 사용합니다.
5. `push_hud.py`의 `CONFIG["OPS_DB_PATH"]`, `_get_ops_from_api()`, `_get_ops_from_sqlite()` TODO를 실제 구조에 맞게 구현합니다. API 우선, SQLite 폴백 순서를 유지하고 두 경로 모두 실패하면 `source="error"`와 `None` 필드를 반환해야 합니다.
6. `[레픽]일간매출` 시트의 `일일매출내역` 탭을 열어 B열 날짜의 실제 표기 형식을 확인합니다. `_parse_sheet_date()`가 그 형식을 처리하는지 검증하고 필요할 때만 형식을 추가합니다. 매출은 H열 수납액만 합산하며 다른 금액 필드는 사용하지 않습니다.

## 2. 비밀 파일 준비

- 대표가 이 PC의 `~/.claude/.status-write-key` 정본을 안전한 전달 수단으로 옮깁니다. 키 자체를 지시서, 코드, 커밋, 로그 또는 채팅에 평문으로 남기지 않습니다.
- NAS의 제한된 안전 경로에 BOM 없는 UTF-8, 개행 없는 파일로 저장하고 `CONFIG["WRITE_KEY_FILE"]`에 그 경로를 입력합니다. 새 키를 만들지 않습니다.
- `sheet-writer-yong@claude-test-497610.iam.gserviceaccount.com` 서비스 계정 키 JSON의 승인된 사본을 안전 경로에 확보하고 `CONFIG["SA_KEY_JSON"]`에 입력합니다.
- `CONFIG["LOG_PATH"]`도 NAS의 실제 로그 경로로 확정합니다.

## 3. 수동 1회 검증

실제 Python 실행 파일과 스크립트 경로를 확정한 뒤 다음을 실행합니다.

```powershell
python push_hud.py --dry-run
```

stdout payload에 PHI가 없고 숫자, 다음 예약 시각, `sources`가 타당한지 육안 확인합니다. 이어서 실제 push를 실행합니다.

```powershell
python push_hud.py
$LASTEXITCODE
```

종료코드 `0`을 확인합니다. 부분 데이터 push도 성공이면 `0`이고, 네트워크 오류나 401 등 push 자체 실패만 `1`입니다.

## 4. 원격 데이터 대조

```powershell
Invoke-RestMethod "https://claude-glasses-ask.yongyongyo.workers.dev/hud"
```

응답의 예약/내원/노쇼/취소, 다음 예약, 열린 에스컬레이션, H열 매출 합계가 ops 화면 및 시트와 일치하는지 대조합니다. `updatedAt`은 Worker 서버 시각이어야 합니다.

## 5. 작업 스케줄러 등록

실제 Python 절대경로와 스크립트 절대경로를 사용합니다. 작업 디렉터리가 필요한 환경이면 별도 래퍼를 안전한 경로에 두고 그 경로를 확정합니다.

```powershell
schtasks /Create /TN "repic-hud-push" /SC MINUTE /MO 5 /TR "python C:\<경로>\push_hud.py" /F
```

병원 PC Python SPOF 이슈와 별개로 유지되는 런타임인지, 재부팅 후에도 같은 Python과 `openssl`이 PATH에서 실행되는지 확인합니다.

## 6. 등록 후 재조회 및 기록

등록 직후의 성공만으로 완료 처리하지 않습니다. 5~10분 기다린 뒤 `/hud`를 다시 조회해 `updatedAt`이 새 실행 시각으로 갱신됐는지 확인합니다. `push_hud.log`의 한 줄 결과와 스케줄러 최근 실행 결과도 대조하고, 확인 시각·sources·숫자 대조 결과·PHI 미포함 여부를 NAS측 셀프 검토 기록에 남깁니다. 비밀 값과 환자 단위 정보는 기록하지 않습니다.

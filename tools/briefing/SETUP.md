# 아침 브리핑 설정

이 저장소는 공개 GitHub Pages 저장소입니다. `briefing.env`, 서비스 계정 JSON, 쓰기 키 등 실제 자격증명은 **절대 저장소에 복사하거나 커밋하지 마세요**. `tools/briefing/logs/`도 `.gitignore` 대상이며 커밋하지 않습니다.

## 1. Python 의존성

Python 3.10 이상과 `claude` CLI를 설치한 뒤 현재 사용자 터미널에서 실행합니다.

```powershell
python -m pip install requests google-auth gspread
```

## 2. 자격증명 파일

`C:\Users\admin\.claude\briefing.env`를 UTF-8 텍스트로 만들고 아래 틀을 채웁니다. 실제 비밀 값은 이 문서에 기록하지 않습니다.

```text
BRIEF_WORKER_BASE=https://claude-glasses-ask.yongyongyo.workers.dev
BRIEF_WRITE_KEY_FILE=C:/Users/admin/.claude/.status-write-key
SALES_SA_JSON=
SALES_SHEET_ID=
NOTION_API_KEY=
NOTION_BOARD_DB_ID=
CLAUDE_CLI=
```

TODO 체크리스트:

- [ ] 매출 시트용 서비스 계정 JSON의 PC 내 절대경로를 확인해 `SALES_SA_JSON`에 적고, 그 서비스 계정 이메일을 `[레픽]일간매출` 시트에 **뷰어**로 공유합니다.
- [ ] `[레픽]일간매출` URL에서 시트 ID(`1MZd…` 부분)를 확인해 `SALES_SHEET_ID`에 적습니다.
- [ ] Notion integration을 생성하고 관제탑 DB에 connection으로 추가한 뒤 `NOTION_API_KEY`와 부모 관제탑 DB의 `NOTION_BOARD_DB_ID`를 적습니다. 상태 속성명도 이때 확인합니다.
- [ ] `where.exe claude`로 CLI 위치를 확인해 `CLAUDE_CLI`에 절대경로를 적습니다. Windows의 `.cmd` shim 실행에 문제가 있으면 `.cmd`가 아닌 실제 실행 파일의 절대경로를 사용합니다.
- [ ] `BRIEF_WRITE_KEY_FILE`이 기존 Worker 쓰기 키 파일을 가리키는지 확인합니다.

먼저 자격증명을 쓰지 않는 소스까지 포함한 동작과 출력 제한을 확인합니다.

```powershell
python C:\Users\admin\Desktop\service-mind\tools\briefing\make_briefing.py --dry-run
```

## 3. 작업 스케줄러

관리자 권한 없이 현재 사용자 작업으로 등록합니다. `<python 절대경로>`는 `where.exe python` 결과로 바꿉니다.

```powershell
schtasks /Create /TN "RepicMorningBriefing" /TR "\"<python 절대경로>\" \"C:\Users\admin\Desktop\service-mind\tools\briefing\make_briefing.py\"" /SC DAILY /ST 06:30 /F
schtasks /Run /TN "RepicMorningBriefing"
schtasks /Delete /TN "RepicMorningBriefing" /F
```

PC가 06:30에 켜져 있어야 합니다. 절전 해제가 필요하면 `taskschd.msc`에서 작업 속성을 열어 “이 작업을 실행하기 위해 절전 모드 해제” 옵션을 수동으로 체크합니다. 수동 실행 뒤 `tools/briefing/logs/briefing-YYYY-MM-DD.log` 생성과 Worker의 `/briefing` 갱신을 확인합니다.

## 4. Worker 배포

별도 Worker 빌드에서 `routes/briefing.mjs`가 추가된 뒤 한 번 배포합니다.

```powershell
cd C:\Users\admin\Desktop\claude-worker
npx wrangler deploy
```

## 5. 프론트 배포

`service-mind`에서 기능 브랜치를 만들고 변경을 push한 다음 PR로 `main`에 병합합니다. `main` 직접 push는 금지되어 있습니다.

```powershell
git switch -c feature/morning-briefing
git add glasses/briefing.html glasses/js/briefing.js tools/briefing/make_briefing.py tools/briefing/SETUP.md
git push -u origin feature/morning-briefing
```

커밋과 PR 생성은 저장소 운영 절차에 따라 직접 수행합니다.

## 추가 주의 (QA 검증 반영, 2026-07-18)
- **CLAUDE_CLI는 절대경로 필수**: 이 PC의 claude CLI는 PATH 탐색으로 안 잡힐 수 있다(MSIX Python의 AppData 가상화).
  `CLAUDE_CLI=C:\Users\admin\.local\bin\claude.exe` 로 지정할 것. 미지정 시 LLM 요약이 항상 실패하고 템플릿 폴백으로만 발행된다.
- **수동 curl로 한글 push 금지**: Windows에서 인라인 `-d '{한글}'`은 CP949로 깨진다. 반드시 UTF-8 파일 + `--data-binary @파일` 경유.

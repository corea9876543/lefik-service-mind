"""Poll the glasses command queue and run one secured Claude CLI job at a time."""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ENDPOINT = os.environ.get("AGENT_ENDPOINT", "https://claude-glasses-ask.yongyongyo.workers.dev").rstrip("/")
POLL_SEC = int(os.environ.get("AGENT_POLL_SEC", "5"))
EXEC_TIMEOUT_SEC = int(os.environ.get("AGENT_EXEC_TIMEOUT_SEC", "180"))
MAX_AGE_SEC = int(os.environ.get("AGENT_MAX_AGE_SEC", "600"))
SUMMARY_MAX = 280
ROOT = Path("C:/Users/admin/Desktop/service-mind")
HERE = Path(__file__).resolve().parent
PRESETS_PATH = HERE / "presets.json"
LOG_PATH = HERE / "listener.log"
KEY_PATH = Path.home() / ".claude" / ".status-write-key"
READONLY_TOOLS = ["Read", "Glob", "Grep"]
ANSWER_RULES = "\n\n답변 규칙: 한국어 평문 1~3문장. 마크다운·목록·코드블록 금지. 환자 성명 등 개인정보 금지."


def api_request(method, path, key, body=None):
    data = None
    headers = {"Accept": "application/json", "x-write-key": key}
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    request = urllib.request.Request(ENDPOINT + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def push_payload(key, payload, retries=1):
    body = {"queue": "to-glasses", "payload": payload}
    for attempt in range(retries):
        try:
            api_request("POST", "/inbox/push", key, body)
            return True
        except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
            print(f"push failed ({attempt + 1}/{retries}): {exc}")
            if attempt + 1 < retries:
                time.sleep(30)
    return False


def load_presets():
    with PRESETS_PATH.open(encoding="utf-8") as stream:
        return json.load(stream)


def parse_created_at(value):
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def validate_item(item, config):
    payload = item.get("payload") if isinstance(item, dict) else None
    if not isinstance(payload, dict) or payload.get("type") != "command":
        return None

    req_id = str(payload.get("reqId") or "")[:80]
    created = parse_created_at(item.get("createdAt"))
    if created is None or (datetime.now(timezone.utc) - created).total_seconds() > MAX_AGE_SEC:
        return {"reqId": req_id, "status": "expired", "label": "만료된 명령", "summary": "명령 유효 시간이 지나 실행하지 않았습니다."}

    preset_id = payload.get("presetId")
    if preset_id:
        preset = next((entry for entry in config.get("presets", []) if entry.get("id") == preset_id), None)
        if preset is None:
            return {"reqId": req_id, "presetId": preset_id, "status": "denied", "label": "알 수 없는 프리셋", "summary": "등록되지 않은 프리셋이라 실행하지 않았습니다."}
        mode = preset.get("mode", "readonly")
        tools = preset.get("allowedTools", READONLY_TOOLS) if mode == "action" else READONLY_TOOLS
        if mode == "action" and (not isinstance(tools, list) or not all(isinstance(tool, str) and tool for tool in tools)):
            return {"reqId": req_id, "presetId": preset_id, "status": "denied", "label": preset.get("label", preset_id), "summary": "action 도구 허용 목록이 올바르지 않습니다."}
        return {"reqId": req_id, "presetId": preset_id, "status": "ready", "label": preset.get("label", preset_id), "mode": mode, "cwd": preset.get("cwd") or str(ROOT), "prompt": str(preset.get("prompt") or ""), "tools": tools}

    prompt = payload.get("prompt")
    free_text = config.get("freeText", {})
    if not free_text.get("enabled") or not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 500:
        return {"reqId": req_id, "status": "denied", "label": "직접 입력", "summary": "직접 입력이 비활성화되었거나 명령 길이가 올바르지 않습니다."}
    return {"reqId": req_id, "presetId": None, "status": "ready", "label": "직접 입력", "mode": "readonly", "cwd": str(ROOT), "prompt": prompt.strip(), "tools": READONLY_TOOLS}


def compact_summary(text):
    summary = text.strip() or "(빈 응답)"
    return summary if len(summary) <= SUMMARY_MAX else summary[: SUMMARY_MAX - 1] + "…"


def first_error_line(text):
    for line in text.splitlines():
        if line.strip():
            return compact_summary(line)
    return "Claude CLI 실행에 실패했습니다."


def execute_command(command, claude_path, dry_run):
    if dry_run:
        return "ok", f"[dry-run] {command['label']}"
    cwd = Path(command["cwd"])
    if not cwd.is_dir():
        return "error", "작업 디렉터리에 접근할 수 없습니다."
    args = [claude_path, "-p", command["prompt"] + ANSWER_RULES, "--allowedTools", *command["tools"], "--max-turns", "12"]
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    try:
        result = subprocess.run(args, cwd=str(cwd), shell=False, capture_output=True, encoding="utf-8", errors="replace", env=env, timeout=EXEC_TIMEOUT_SEC)
    except subprocess.TimeoutExpired:
        return "timeout", "실행 제한 시간을 초과했습니다."
    except OSError as exc:
        return "error", compact_summary(str(exc))
    if result.returncode != 0:
        return "error", first_error_line(result.stderr)
    return "ok", compact_summary(result.stdout)


def log_command(command, status, elapsed):
    record = {
        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reqId": command.get("reqId"),
        "presetId": command.get("presetId"),
        "mode": command.get("mode", "readonly"),
        "status": status,
        "elapsedSec": round(elapsed, 1),
        "promptHead": command.get("prompt", "")[:80],
    }
    with LOG_PATH.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, ensure_ascii=False) + "\n")


def result_payload(command, status, summary, elapsed):
    return {
        "type": "agent-result",
        "reqId": command.get("reqId", ""),
        "status": status,
        "label": command.get("label", "에이전트 명령"),
        "summary": compact_summary(summary),
        "elapsedSec": round(elapsed, 1),
        "finishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }


def process_item(item, key, claude_path, dry_run):
    try:
        config = load_presets()
        command = validate_item(item, config)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"presets load failed: {exc}")
        return
    if command is None:
        print("ignored non-command item")
        return

    started = time.monotonic()
    if command["status"] != "ready":
        elapsed = time.monotonic() - started
        push_payload(key, result_payload(command, command["status"], command["summary"], elapsed), retries=4)
        log_command(command, command["status"], elapsed)
        return

    push_payload(key, {"type": "agent-ack", "reqId": command["reqId"], "status": "running", "label": command["label"]})
    status, summary = execute_command(command, claude_path, dry_run)
    elapsed = time.monotonic() - started
    push_payload(key, result_payload(command, status, summary, elapsed), retries=4)
    log_command(command, status, elapsed)


def main():
    parser = argparse.ArgumentParser(description="Glasses command queue listener")
    parser.add_argument("--once", action="store_true", help="poll once and exit")
    parser.add_argument("--dry-run", action="store_true", help="skip Claude CLI execution")
    args = parser.parse_args()

    if not KEY_PATH.is_file() or not (key := KEY_PATH.read_text(encoding="utf-8").strip("\r\n")):
        print(f"write key not found: {KEY_PATH}")
        return 1
    claude_path = shutil.which("claude")
    if not claude_path:
        print("claude CLI not found")
        return 1
    backoff = 5

    try:
        while True:
            try:
                query = urllib.parse.urlencode({"queue": "to-claude"})
                response = api_request("GET", "/inbox/pop?" + query, key)
                backoff = 5
            except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
                print(f"poll failed; retrying in {backoff}s: {exc}")
                if args.once:
                    return 1
                time.sleep(backoff)
                backoff = 10 if backoff == 5 else 30
                continue

            item = response.get("item")
            if item is not None:
                process_item(item, key, claude_path, args.dry_run)
            if args.once:
                return 0
            if item is None:
                time.sleep(POLL_SEC)
    except KeyboardInterrupt:
        print("listener stopped")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Push the PHI-free Repic Gangnam operations HUD summary to the Worker."""

import argparse
import base64
import datetime as dt
import json
import os
import sqlite3
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request


CONFIG = {
    "WORKER_URL": "https://claude-glasses-ask.yongyongyo.workers.dev",
    "WRITE_KEY_FILE": r"C:\repic\secrets\status-write-key.txt",  # TODO(NAS): 실제 경로 확정
    "OPS_BASE": "http://localhost:8000",
    "OPS_DB_PATH": r"",  # TODO(NAS): repic-ops SQLite 파일 경로 확인 후 기입 (API 폴백용)
    "SHEET_ID": "1MZdcWTOQx0_UjIcK9LD0eonu9j7HPkW8x4S-GcEj8Kc",
    "SHEET_TAB": "일일매출내역",
    "SA_KEY_JSON": r"",  # TODO(NAS): sheet-writer-yong SA 키 JSON 경로
    "LOG_PATH": r"C:\repic\logs\push_hud.log",  # TODO(NAS): 경로 확정
}

KST = dt.timezone(dt.timedelta(hours=9))


def _utc_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _request_json(url, method="GET", headers=None, body=None, timeout=10):
    request = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _get_ops_from_api():
    # TODO(NAS): repic-ops 코드를 확인해 기존 집계 endpoint와 응답 매핑을 구현한다.
    # 환자 단위 응답을 그대로 반환하거나 로그에 남기지 말고 집계 숫자/HH:MM만 만든다.
    raise RuntimeError("ops API mapping is not configured")


def _get_ops_from_sqlite():
    # TODO(NAS): 실제 테이블/컬럼 및 열린 에스컬레이션 상태값을 확인한 뒤 read-only 쿼리를 구현한다.
    # 연결 예: sqlite3.connect("file:" + urllib.parse.quote(path) + "?mode=ro", uri=True)
    if not CONFIG["OPS_DB_PATH"]:
        raise RuntimeError("OPS_DB_PATH is not configured")
    raise RuntimeError("ops SQLite mapping is not configured")


def get_ops_summary() -> dict:
    """Prefer the local ops API and fall back to read-only SQLite."""
    try:
        result = _get_ops_from_api()
        result["source"] = "api"
        return result
    except Exception:
        try:
            result = _get_ops_from_sqlite()
            result["source"] = "sqlite"
            return result
        except Exception:
            return {
                "reservations": None,
                "nextReservation": None,
                "escalations": None,
                "source": "error",
            }


def _b64url(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _sheet_access_token(sa):
    now = int(dt.datetime.now(dt.timezone.utc).timestamp())
    header = _b64url(json.dumps({"alg": "RS256", "typ": "JWT"}, separators=(",", ":")).encode("ascii"))
    claims = {
        "iss": sa["client_email"],
        "scope": "https://www.googleapis.com/auth/spreadsheets.readonly",
        "aud": sa.get("token_uri", "https://oauth2.googleapis.com/token"),
        "iat": now,
        "exp": now + 3600,
    }
    payload = _b64url(json.dumps(claims, separators=(",", ":")).encode("utf-8"))
    signing_input = (header + "." + payload).encode("ascii")

    key_path = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".pem", delete=False) as key_file:
            key_file.write(sa["private_key"])
            key_path = key_file.name
        signed = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", key_path],
            input=signing_input,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        ).stdout
    finally:
        if key_path and os.path.exists(key_path):
            os.remove(key_path)

    assertion = header + "." + payload + "." + _b64url(signed)
    token_body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": assertion,
    }).encode("ascii")
    token = _request_json(
        claims["aud"],
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        body=token_body,
    )
    return token["access_token"]


def _parse_sheet_date(value, today):
    text = str(value).strip()
    for pattern in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%m/%d", "%m-%d"):
        try:
            parsed = dt.datetime.strptime(text, pattern).date()
            if "%Y" not in pattern:
                parsed = parsed.replace(year=today.year)
            return parsed
        except ValueError:
            pass
    # TODO(NAS): 실데이터의 B열 날짜 표기 형식을 확인하고 필요한 형식을 추가한다.
    return None


def _parse_krw(value):
    cleaned = str(value).replace(",", "").replace("₩", "").strip()
    if not cleaned:
        return 0
    return int(float(cleaned))


def get_revenue_today() -> dict:
    """Sum only column H for rows whose column B date is today in KST."""
    try:
        if not CONFIG["SA_KEY_JSON"]:
            raise RuntimeError("SA_KEY_JSON is not configured")
        with open(CONFIG["SA_KEY_JSON"], "r", encoding="utf-8-sig") as sa_file:
            sa = json.load(sa_file)
        token = _sheet_access_token(sa)
        sheet_range = "%s!A:J" % CONFIG["SHEET_TAB"]
        url = "https://sheets.googleapis.com/v4/spreadsheets/%s/values/%s" % (
            CONFIG["SHEET_ID"], urllib.parse.quote(sheet_range, safe=""))
        data = _request_json(url, headers={"Authorization": "Bearer " + token})
        today = dt.datetime.now(KST).date()
        amount = 0
        count = 0
        for row in data.get("values", []):
            # C/D(차트번호/이름)는 참조·보관·로그하지 않는다.
            if len(row) > 7 and _parse_sheet_date(row[1], today) == today:
                amount += _parse_krw(row[7])
                count += 1
        del data
        return {
            "revenue": {"amountKrw": amount, "txCount": count, "asOf": _utc_iso()},
            "source": "ok",
        }
    except Exception:
        return {"revenue": None, "source": "error"}


def build_payload(ops: dict, rev: dict) -> dict:
    return {
        "schema": 1,
        "date": dt.datetime.now(KST).date().isoformat(),
        "clinic": "repic-gangnam",
        "reservations": ops.get("reservations"),
        "nextReservation": ops.get("nextReservation"),
        "revenue": rev.get("revenue"),
        "escalations": ops.get("escalations"),
        "sources": {"ops": ops.get("source", "error"), "sheet": rev.get("source", "error")},
        "generatedAt": _utc_iso(),
    }


def push(payload: dict) -> bool:
    try:
        with open(CONFIG["WRITE_KEY_FILE"], "r", encoding="utf-8-sig") as key_file:
            write_key = key_file.read().strip()
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        result = _request_json(
            CONFIG["WORKER_URL"].rstrip("/") + "/hud/push",
            method="POST",
            headers={"Content-Type": "application/json; charset=utf-8", "x-write-key": write_key},
            body=body,
        )
        return result.get("ok") is True
    except (OSError, ValueError, KeyError, urllib.error.URLError):
        return False


def _log_run(payload, result):
    path = CONFIG["LOG_PATH"]
    try:
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        mode = "w" if os.path.exists(path) and os.path.getsize(path) > 1024 * 1024 else "a"
        sources = payload["sources"]
        with open(path, mode, encoding="utf-8") as log_file:
            log_file.write("%s ops=%s sheet=%s push=%s\n" % (
                _utc_iso(), sources["ops"], sources["sheet"], result))
    except OSError:
        pass


def _mock_ops():
    return {
        "reservations": {"total": 24, "arrived": 15, "noshow": 1, "cancelled": 2, "remaining": 6},
        "nextReservation": {"time": "15:30", "count": 2},
        "escalations": {"open": 2},
        "source": "api",
    }


def main(argv) -> int:
    parser = argparse.ArgumentParser(description="Push the Repic operations HUD aggregate")
    parser.add_argument("--dry-run", action="store_true", help="print payload without pushing")
    parser.add_argument("--mock-ops", action="store_true", help="use a fixed PHI-free ops fixture")
    args = parser.parse_args(argv)

    ops = _mock_ops() if args.mock_ops else get_ops_summary()
    revenue = get_revenue_today()
    payload = build_payload(ops, revenue)
    if args.dry_run:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        _log_run(payload, "dry-run")
        return 0
    succeeded = push(payload)
    _log_run(payload, "ok" if succeeded else "failed")
    return 0 if succeeded else 1


if __name__ == "__main__":
    raise SystemExit(main(None))

#!/usr/bin/env python3
"""P5 alerts webhook smoke test (Python 3 standard library only)."""

import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE_URL = "https://claude-glasses-ask.yongyongyo.workers.dev"
KEY_PATH = Path.home() / ".claude" / ".status-write-key"


def load_key():
    try:
        key = KEY_PATH.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        print(f"오류: 쓰기 키 파일이 없습니다: {KEY_PATH}", file=sys.stderr)
        raise SystemExit(1)
    except OSError as error:
        print(f"오류: 쓰기 키 파일을 읽을 수 없습니다: {error}", file=sys.stderr)
        raise SystemExit(1)
    if not key:
        print(f"오류: 쓰기 키 파일이 비어 있습니다: {KEY_PATH}", file=sys.stderr)
        raise SystemExit(1)
    return key


def request_json(path, method="GET", payload=None, key=None):
    body = None if payload is None else json.dumps(
        payload, ensure_ascii=False
    ).encode("utf-8")
    # User-Agent 필수: 기본 Python-urllib UA는 Cloudflare가 403으로 차단함
    headers = {"Accept": "application/json", "User-Agent": "glasses-alerts-test/1.0"}
    if body is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
    if key:
        headers["x-write-key"] = key
    request = Request(BASE_URL + path, data=body, headers=headers, method=method)
    try:
        with urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        print(f"HTTP {error.code}: {detail}", file=sys.stderr)
        raise SystemExit(1)
    except (URLError, TimeoutError) as error:
        print(f"요청 실패: {error}", file=sys.stderr)
        raise SystemExit(1)


def push_and_verify(payload, key):
    status, result = request_json("/alerts/push", "POST", payload, key)
    alert_id = result.get("id")
    if status != 200 or not result.get("ok") or not alert_id:
        print(f"push 실패: {result}", file=sys.stderr)
        return False

    _, current = request_json("/alerts")
    stored = current.get("alerts", [])
    if stored and stored[0].get("id") == alert_id:
        print(f"push 성공 + GET 재조회에서 [0] 일치: {alert_id}")
        return True
    actual = stored[0].get("id") if stored else "목록 비어 있음"
    print(f"검증 실패: 전송 id={alert_id}, GET [0]={actual}", file=sys.stderr)
    return False


def sample_payload(level, title=None, body=None):
    defaults = {
        "vip": ("K님(VIP) 도착", "3F 데스크 · D+케어 대상"),
        "escalation": ("W님 응대 지연", "EN 환자 · 통역 지원 필요"),
        "info": ("L님 안내 참고", "2F 데스크 확인 요청"),
    }
    sample_title, sample_body = defaults[level]
    return {
        "level": level,
        "title": title if title is not None else sample_title,
        "body": body if body is not None else sample_body,
        "source": "test-alert-python",
    }


def main():
    parser = argparse.ArgumentParser(description="P5 alerts webhook 테스트")
    parser.add_argument("--level", choices=("vip", "escalation", "info"), default="vip")
    parser.add_argument("--title")
    parser.add_argument("--body")
    parser.add_argument("--burst", action="store_true", help="서로 다른 레벨 3건 발사")
    parser.add_argument("--ack-all", action="store_true", help="모든 알림 읽음 처리")
    args = parser.parse_args()
    key = load_key()

    if args.ack_all:
        _, result = request_json("/alerts/ack", "POST", {"all": True})
        _, current = request_json("/alerts")
        all_acked = current.get("unread") == 0 and all(
            alert.get("ack") is True for alert in current.get("alerts", [])
        )
        if result.get("ok") and all_acked:
            print(f"ack-all 성공 + GET 재조회 확인: acked={result.get('acked', 0)}, unread=0")
            return 0
        print(f"ack-all 검증 실패: 응답={result}, 조회={current}", file=sys.stderr)
        return 1

    if args.burst:
        payloads = [sample_payload(level) for level in ("vip", "escalation", "info")]
    else:
        payloads = [sample_payload(args.level, args.title, args.body)]

    results = [push_and_verify(payload, key) for payload in payloads]
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())

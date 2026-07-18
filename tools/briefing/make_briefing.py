#!/usr/bin/env python3
"""Collect morning briefing sources, summarize them, and publish the result."""

from __future__ import annotations

import argparse
import json
import logging
import re
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

import requests

KST = timezone(timedelta(hours=9))
ENV_PATH = Path("C:/Users/admin/.claude/briefing.env")
ORDER = ("sales", "reservations", "projects", "alerts", "summary")
SOURCE_NAMES = ("sales", "reservations", "notion", "alerts", "memory")
SCRIPT_DIR = Path(__file__).resolve().parent
LOG_DIR = SCRIPT_DIR / "logs"


def load_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def setup_logger(target_date: date) -> logging.Logger:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("briefing")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    handler = logging.FileHandler(
        LOG_DIR / f"briefing-{target_date.isoformat()}.log", encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
    return logger


def parse_target_date(value: str | None) -> date:
    return date.fromisoformat(value) if value else datetime.now(KST).date()


def digits_to_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    cleaned = re.sub(r"[^0-9.-]", "", str(value))
    if not cleaned or cleaned in {"-", ".", "-."}:
        return None
    try:
        return int(float(cleaned))
    except ValueError:
        return None


def date_matches(value: Any, wanted: date) -> bool:
    text = str(value).strip()
    candidates = {
        wanted.isoformat(), wanted.strftime("%Y.%m.%d"), wanted.strftime("%Y/%m/%d"),
        wanted.strftime("%m-%d"), wanted.strftime("%m/%d"),
        f"{wanted.month}월 {wanted.day}일", f"{wanted.month}/{wanted.day}",
    }
    return text in candidates or any(text.startswith(item + " ") for item in candidates)


def collect_sales(config: dict[str, str], target_date: date) -> dict[str, int]:
    import gspread  # Imported only when this source is configured.
    from gspread.http_client import BackOffHTTPClient

    class TimedHTTPClient(BackOffHTTPClient):
        def request(self, *args: Any, **kwargs: Any) -> Any:
            kwargs.setdefault("timeout", 15)
            return super().request(*args, **kwargs)

    client = gspread.service_account(
        filename=config["SALES_SA_JSON"], http_client=TimedHTTPClient
    )
    book = client.open_by_key(config["SALES_SHEET_ID"])
    total = 0
    count = 0
    wanted = target_date - timedelta(days=1)
    for worksheet in book.worksheets():
        rows = worksheet.get_all_values()
        sheet_is_date = date_matches(worksheet.title, wanted)
        for row in rows:
            if len(row) < 8 or (not sheet_is_date and not any(date_matches(cell, wanted) for cell in row)):
                continue
            amount = digits_to_int(row[7])
            if amount is not None:
                total += amount
                count += 1
    return {"total": total, "count": count}


def collect_reservations(config: dict[str, str], _target_date: date) -> Any:
    response = requests.get(config["BRIEF_WORKER_BASE"].rstrip("/") + "/hud", timeout=10)
    response.raise_for_status()
    return response.text[:2000]


def rich_text(prop: Any) -> str:
    if not isinstance(prop, dict):
        return ""
    items = prop.get("title") or prop.get("rich_text") or []
    if isinstance(prop.get("select"), dict):
        return str(prop["select"].get("name", ""))
    if isinstance(prop.get("status"), dict):
        return str(prop["status"].get("name", ""))
    return "".join(str(item.get("plain_text", "")) for item in items if isinstance(item, dict))


def extract_projects(payload: dict[str, Any]) -> list[dict[str, str]]:
    projects: list[dict[str, str]] = []
    for page in payload.get("results", [])[:20]:
        properties = page.get("properties", {}) if isinstance(page, dict) else {}
        title = ""
        status = ""
        for prop in properties.values():
            if isinstance(prop, dict) and prop.get("type") == "title":
                title = rich_text(prop)
            elif isinstance(prop, dict) and prop.get("type") in {"status", "select"}:
                candidate = rich_text(prop)
                if candidate:
                    status = candidate
        if title and status.lower() not in {"완료", "done", "complete", "completed"}:
            projects.append({"title": title[:100], "status": status[:40]})
    return projects


def collect_projects(config: dict[str, str], _target_date: date) -> list[dict[str, str]]:
    url = "https://api.notion.com/v1/databases/{}/query".format(config["NOTION_BOARD_DB_ID"])
    headers = {
        "Authorization": "Bearer " + config["NOTION_API_KEY"],
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }
    # The status property name is deliberately not assumed. Try common names, then retry unfiltered.
    payload = None
    for property_name in ("상태", "Status"):
        response = requests.post(url, headers=headers, json={
            "page_size": 20,
            "filter": {"property": property_name, "status": {"does_not_equal": "완료"}},
        }, timeout=15)
        if response.ok:
            payload = response.json()
            break
    if payload is None:
        response = requests.post(url, headers=headers, json={"page_size": 20}, timeout=15)
        response.raise_for_status()
        payload = response.json()
    return extract_projects(payload)


def collect_alerts(config: dict[str, str], _target_date: date) -> Any:
    response = requests.get(config["BRIEF_WORKER_BASE"].rstrip("/") + "/alerts", timeout=10)
    if response.status_code == 404:
        raise FileNotFoundError("alerts endpoint not deployed")
    response.raise_for_status()
    return response.text[:2000]


def collect_memory(config: dict[str, str], _target_date: date) -> str:
    """MEMORY.md(프로젝트 관제탑 로컬 SoT)에서 미결·대기 항목 줄만 추출."""
    text = Path(config["MEMORY_MD_PATH"]).read_text(encoding="utf-8")
    markers = ("남음", "미결", "대기", "다음:", "⚠")
    lines = [line for line in text.splitlines() if any(marker in line for marker in markers)]
    return "\n".join(lines)[:4000]


def collect_sources(config: dict[str, str], target_date: date, logger: logging.Logger) -> tuple[dict[str, str], dict[str, Any]]:
    required = {
        "sales": ("SALES_SA_JSON", "SALES_SHEET_ID"),
        "reservations": ("BRIEF_WORKER_BASE",),
        "notion": ("NOTION_API_KEY", "NOTION_BOARD_DB_ID"),
        "alerts": ("BRIEF_WORKER_BASE",),
        "memory": ("MEMORY_MD_PATH",),
    }
    collectors: dict[str, Callable[[dict[str, str], date], Any]] = {
        "sales": collect_sales, "reservations": collect_reservations,
        "notion": collect_projects, "alerts": collect_alerts,
        "memory": collect_memory,
    }
    statuses = {name: "skip" for name in SOURCE_NAMES}
    results: dict[str, Any] = {}
    for name in SOURCE_NAMES:
        if any(not config.get(key) for key in required[name]):
            logger.info("source=%s status=skip reason=not configured", name)
            continue
        try:
            results[name] = collectors[name](config, target_date)
            statuses[name] = "ok"
            logger.info("source=%s status=ok", name)
        except FileNotFoundError as exc:
            statuses[name] = "skip" if name == "alerts" else "fail"
            logger.warning("source=%s status=%s reason=%s", name, statuses[name], exc)
        except Exception as exc:  # Each source must remain isolated.
            statuses[name] = "skip" if name == "alerts" else "fail"
            logger.warning("source=%s status=%s reason=%s", name, statuses[name], type(exc).__name__)
    return statuses, results


def fallback_cards(results: dict[str, Any]) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    if "sales" in results:
        sales = results["sales"]
        cards.append({"id": "sales", "title": f"어제 매출 {sales['total']//10000:,}만원", "lines": [f"수납 {sales['count']}건"], "sensitive": True})
    if "reservations" in results:
        data = results["reservations"]
        count = len(data) if isinstance(data, list) else (data.get("count") if isinstance(data, dict) else None)
        cards.append({"id": "reservations", "title": "오늘 예약", "lines": [f"예약 {count}건"] if isinstance(count, int) else ["예약 현황 확인"], "sensitive": False})
    if "notion" in results:
        projects = results["notion"]
        cards.append({"id": "projects", "title": f"미결 프로젝트 {len(projects)}건", "lines": [item["title"] for item in projects[:3]], "sensitive": False})
    if "alerts" in results:
        alerts = results["alerts"]
        count = len(alerts) if isinstance(alerts, list) else (alerts.get("count") if isinstance(alerts, dict) else None)
        cards.append({"id": "alerts", "title": "오늘 알림", "lines": [f"알림 {count}건"] if isinstance(count, int) else ["알림 현황 확인"], "sensitive": False})
    return cards


def prompt_for(results: dict[str, Any]) -> str:
    rules = (
        "성공한 소스만으로 카드 3~5장을 생성하세요. 출력은 JSON 배열만 쓰고 마크다운과 설명은 금지합니다. "
        "각 카드는 {id,title,lines,sensitive}이며 id는 sales/reservations/projects/alerts/summary 중 하나입니다. "
        "title은 한 줄 18자 이하, lines는 최대 3개이고 각 26자 이하입니다. 금액 노출 카드는 sensitive:true입니다. "
        "환자 성명 등 개인정보는 금지하고 집계와 이니셜만 사용합니다. 한국어로 작성하세요. "
        "memory 소스는 프로젝트 관제탑의 미결 항목 원장입니다 — 중요한 미결 상위 2~3개를 골라 projects 카드로 요약하세요.\n"
    )
    safe_sources = {("projects" if key == "notion" else key): value for key, value in results.items()}
    return rules + json.dumps(safe_sources, ensure_ascii=False, separators=(",", ":"))


def run_claude(config: dict[str, str], results: dict[str, Any]) -> list[dict[str, Any]]:
    cli = config.get("CLAUDE_CLI", "claude")
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".txt", delete=False) as handle:
        prompt_path = Path(handle.name)
        handle.write(prompt_for(results))
    try:
        with prompt_path.open("r", encoding="utf-8") as stdin:
            completed = subprocess.run(
                [cli, "-p"], stdin=stdin, capture_output=True, encoding="utf-8",
                timeout=180, shell=False, check=True,
            )
        output = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", completed.stdout.strip(), flags=re.I)
        parsed = json.loads(output)
        if not isinstance(parsed, list) or not parsed:
            raise ValueError("claude returned no cards")
        return parsed
    finally:
        prompt_path.unlink(missing_ok=True)


def normalize_cards(raw_cards: list[Any], fallback: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates = list(raw_cards) + list(fallback)
    by_id: dict[str, dict[str, Any]] = {}
    for raw in candidates:
        if not isinstance(raw, dict) or raw.get("id") not in ORDER or raw["id"] in by_id:
            continue
        title = str(raw.get("title", "")).replace("\n", " ").strip()[:18]
        if not title:
            continue
        lines = raw.get("lines", [])
        if not isinstance(lines, list):
            lines = []
        by_id[raw["id"]] = {
            "id": raw["id"], "title": title,
            "lines": [str(line).replace("\n", " ").strip()[:26] for line in lines[:3]],
            "sensitive": bool(raw.get("sensitive", False)),
        }
    ordered = [by_id[item] for item in ORDER if item in by_id][:5]
    # Fallback cards already joined the candidates, so this reaches three whenever distinct source cards exist.
    return ordered


def publish(config: dict[str, str], envelope: dict[str, Any], logger: logging.Logger) -> bool:
    base = config.get("BRIEF_WORKER_BASE", "").rstrip("/")
    key_path = Path(config.get("BRIEF_WRITE_KEY_FILE", ""))
    if not base or not key_path.is_file():
        logger.error("push failed: worker base or write key file missing")
        return False
    write_key = key_path.read_text(encoding="utf-8-sig").strip()
    # User-Agent 필수: 기본 python-requests UA는 Cloudflare가 403으로 차단할 수 있음
    ua = {"User-Agent": "glasses-briefing-push/1.0"}
    response = requests.post(base + "/briefing/push", json=envelope, headers={"x-write-key": write_key, **ua}, timeout=15)
    response.raise_for_status()
    logger.info("push status=%s", response.status_code)
    check = requests.get(base + "/briefing", headers=ua, timeout=15)
    check.raise_for_status()
    stored = check.json()
    valid = stored.get("date") == envelope["date"] and len(stored.get("cards", [])) == len(envelope["cards"])
    logger.info("verification=%s", "ok" if valid else "mismatch")
    return valid


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--date")
    args = parser.parse_args(argv)
    try:
        target_date = parse_target_date(args.date)
    except ValueError:
        print("--date must be YYYY-MM-DD", file=sys.stderr)
        return 1
    logger = setup_logger(target_date)
    try:
        config = load_env(ENV_PATH)
        statuses, results = collect_sources(config, target_date, logger)
        fallback = fallback_cards(results)
        try:
            raw_cards = run_claude(config, results) if results else fallback
        except Exception as exc:
            logger.warning("claude status=fail fallback=template reason=%s", type(exc).__name__)
            raw_cards = fallback
        cards = normalize_cards(raw_cards, fallback)
        envelope = {
            "date": target_date.isoformat(),
            "generatedAt": datetime.now(KST).isoformat(timespec="seconds"),
            "sources": statuses,
            "cards": cards,
        }
        logger.info("cardCount=%d", len(cards))
        if args.dry_run:
            print(json.dumps(envelope, ensure_ascii=False, indent=2))
            return 0 if cards else 1
        if not cards:
            logger.error("push skipped: no cards")
            return 1
        return 0 if publish(config, envelope, logger) else 1
    except Exception as exc:  # Last-resort guard for scheduled execution.
        logger.exception("fatal error: %s", type(exc).__name__)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

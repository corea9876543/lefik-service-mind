(function () {
  "use strict";

  if (!window.G || typeof window.G.get !== "function" || typeof window.G.input !== "function") {
    document.body.textContent = "공용 입력 모듈이 필요합니다";
    return;
  }

  var MASK_KEY = "brief:mask";
  var REFRESH_CARD = { id: "refresh", title: "새로고침", lines: ["선택하면 다시 불러옵니다"], sensitive: false };
  var cards = [];
  var current = 0;
  var maskOn = localStorage.getItem(MASK_KEY) !== "off";
  var failCount = 0;
  var envelopeDate = null;
  var loading = false;

  var dateNode = document.getElementById("brief-date");
  var positionNode = document.getElementById("brief-position");
  var lockNode = document.getElementById("brief-lock");
  var staleNode = document.getElementById("stale-badge");
  var stateNode = document.getElementById("brief-state");
  var cardNode = document.getElementById("brief-card");
  var titleNode = document.getElementById("brief-title");
  var linesNode = document.getElementById("brief-lines");
  var warningNode = document.getElementById("source-warning");
  var dotsNode = document.getElementById("brief-dots");

  function kstParts(date) {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date || new Date());
    var values = {};
    parts.forEach(function (part) { values[part.type] = part.value; });
    return { year: values.year, month: values.month, day: values.day };
  }

  function todayKst() {
    var p = kstParts();
    return p.year + "-" + p.month + "-" + p.day;
  }

  function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "";
    var date = new Date(value + "T12:00:00+09:00");
    var weekday = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" }).format(date);
    return Number(value.slice(5, 7)) + "/" + Number(value.slice(8, 10)) + " " + weekday;
  }

  function mask(text) {
    // 단위가 붙은 경우만 단위까지 함께 가림("1.8억원"→●●●), 단위 없으면 숫자만(공백 미흡수)
    return String(text).replace(/[0-9][0-9,.]*(?:\s*(?:억원|만원|억|만|원|%|건))?/g, "●●●");
  }

  function displayText(text, card) {
    return maskOn && card.sensitive ? mask(text) : String(text);
  }

  function renderDots() {
    dotsNode.textContent = "";
    cards.forEach(function (_card, index) {
      var dot = document.createElement("span");
      dot.className = "briefing-dot" + (index === current ? " current" : "");
      dot.setAttribute("aria-label", (index + 1) + "번째 카드");
      dotsNode.appendChild(dot);
    });
  }

  function render() {
    lockNode.textContent = maskOn ? "🔒" : "";
    lockNode.setAttribute("aria-label", maskOn ? "금액 마스킹 켜짐" : "금액 마스킹 꺼짐");
    dateNode.textContent = formatDate(envelopeDate);
    staleNode.hidden = !envelopeDate || envelopeDate === todayKst();

    if (!cards.length) {
      cardNode.hidden = true;
      stateNode.hidden = false;
      stateNode.textContent = loading ? "브리핑 불러오는 중…" : "오늘 브리핑 없음";
      positionNode.textContent = "";
      dotsNode.textContent = "";
      return;
    }

    var card = cards[current];
    stateNode.hidden = true;
    cardNode.hidden = false;
    positionNode.textContent = (current + 1) + "/" + cards.length;
    titleNode.textContent = displayText(card.title, card);
    linesNode.textContent = "";
    (Array.isArray(card.lines) ? card.lines.slice(0, 3) : []).forEach(function (line) {
      var item = document.createElement("li");
      item.textContent = displayText(line, card);
      linesNode.appendChild(item);
    });
    warningNode.hidden = failCount === 0 || card.id === "refresh";
    warningNode.textContent = failCount ? "일부 소스 누락(" + failCount + ")" : "";
    renderDots();
  }

  function fetchBriefing() {
    if (loading) return;
    loading = true;
    render();
    window.G.get("/briefing").then(function (data) {
      data = data || {};
      envelopeDate = typeof data.date === "string" ? data.date : null;
      failCount = Object.keys(data.sources || {}).filter(function (key) { return data.sources[key] === "fail"; }).length;
      var sourceCards = Array.isArray(data.cards) ? data.cards.filter(function (card) {
        return card && typeof card.title === "string";
      }) : [];
      cards = sourceCards.length ? sourceCards.concat([REFRESH_CARD]) : [];
      current = 0;
    }).catch(function () {
      // 일시 오류 시 기존 카드 유지 — 화면이 비어 고착되지 않게(Codex #8)
    }).finally(function () {
      loading = false;
      render();
    });
  }

  function onNav(direction) {
    // 첫 카드(또는 빈 상태)에서 왼쪽 = 허브 복귀 (안경에는 Escape가 없음)
    if (direction === "left" && (current === 0 || !cards.length)) { window.location.href = G.withKey("index.html"); return; }
    if (!cards.length || loading) return;
    var step = direction === "right" || direction === "down" ? 1 : -1;
    current = (current + step + cards.length) % cards.length;
    render();
  }

  function onSelect() {
    if (loading) return;
    if (!cards.length) { fetchBriefing(); return; } // 빈 화면에서 선택 = 재시도(Codex #8)
    if (cards[current].id === "refresh") {
      fetchBriefing();
      return;
    }
    maskOn = !maskOn;
    localStorage.setItem(MASK_KEY, maskOn ? "on" : "off");
    render();
  }

  window.G.input({ onNav: onNav, onSelect: onSelect });
  fetchBriefing();
}());

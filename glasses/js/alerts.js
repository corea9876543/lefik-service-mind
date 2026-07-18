(function () {
  "use strict";

  var POLL_MS = 5000;
  var FLASH_TIMEOUT_MS = 15000;
  var LAST_FLASHED_KEY = "alert:lastFlashedId";
  var alerts = [];
  var seenIds = new Set();
  var cursor = 0;
  var state = "IDLE";
  var firstLoad = true;
  var polling = false;
  var flashTimer = null;

  var flash = document.getElementById("flash");
  var flashCard = document.getElementById("flash-card");
  var flashLevel = document.getElementById("flash-level");
  var flashTitle = document.getElementById("flash-title");
  var flashBody = document.getElementById("flash-body");
  var flashTime = document.getElementById("flash-time");
  var list = document.getElementById("list");
  var empty = document.getElementById("empty");

  function timestampFromId(id) {
    var value = Number.parseInt(String(id || "").split("-")[0], 10);
    return Number.isFinite(value) ? value : 0;
  }

  function readLastFlashedId() {
    try {
      return localStorage.getItem(LAST_FLASHED_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function storeLastFlashedId(id) {
    try {
      localStorage.setItem(LAST_FLASHED_KEY, id);
    } catch (error) {
      // The in-memory seen set still prevents repeat flashes in this session.
    }
  }

  function relativeTime(alert) {
    var eventTime = new Date(alert.ts || alert.receivedAt).getTime();
    var elapsedMinutes = Math.max(0, Math.floor((Date.now() - eventTime) / 60000));
    if (!Number.isFinite(eventTime) || elapsedMinutes < 1) return "방금";
    return elapsedMinutes + "분 전";
  }

  function levelLabel(level) {
    if (level === "vip") return "VIP";
    if (level === "escalation") return "에스컬레이션";
    return "정보";
  }

  function renderList() {
    var selectedId = alerts[cursor] && alerts[cursor].id;
    list.replaceChildren();

    alerts.forEach(function (alert, index) {
      var item = document.createElement("li");
      var top = document.createElement("div");
      var title = document.createElement("span");
      var time = document.createElement("span");
      var body = document.createElement("p");

      item.className = "alert-item";
      item.dataset.level = alert.level;
      item.dataset.ack = String(Boolean(alert.ack));
      item.setAttribute("aria-current", String(index === cursor));
      item.setAttribute("aria-label", levelLabel(alert.level) + ", " + alert.title);
      top.className = "alert-item__top";
      title.className = "alert-item__title";
      time.className = "alert-item__time";
      body.className = "alert-item__body";
      title.textContent = alert.title;
      time.textContent = relativeTime(alert);
      body.textContent = alert.body || "";
      top.append(title, time);
      item.append(top, body);
      list.append(item);
    });

    if (selectedId) {
      var retained = alerts.findIndex(function (alert) { return alert.id === selectedId; });
      if (retained >= 0) cursor = retained;
    }
  }

  function showList() {
    state = alerts.length ? "LIST" : "IDLE";
    flash.hidden = true;
    list.hidden = alerts.length === 0;
    empty.hidden = alerts.length !== 0;
    clearTimeout(flashTimer);
    flashTimer = null;
    renderList();
  }

  function showFlash(alert) {
    state = "FLASH";
    flashCard.dataset.alertId = alert.id;
    flashCard.dataset.level = alert.level;
    flashLevel.textContent = levelLabel(alert.level);
    flashTitle.textContent = alert.title;
    flashBody.textContent = alert.body || "";
    flashBody.hidden = !alert.body;
    flashTime.textContent = relativeTime(alert);
    list.hidden = true;
    empty.hidden = true;
    flash.hidden = false;
    flash.classList.remove("is-entering");
    void flash.offsetWidth;
    flash.classList.add("is-entering");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(showList, FLASH_TIMEOUT_MS);
  }

  function acknowledge(alert) {
    if (!alert || alert.ack) return;
    alert.ack = true;
    renderList();

    G.post("/alerts/ack", { ids: [alert.id] }, G.writeKey()).catch(function (error) {
      alert.ack = false;
      renderList();
      console.warn("알림 읽음 처리 실패", error);
    });
  }

  function applyPollResult(data) {
    var incoming = Array.isArray(data && data.alerts) ? data.alerts : [];
    alerts = incoming;
    cursor = Math.min(cursor, Math.max(0, alerts.length - 1));

    if (firstLoad) {
      incoming.forEach(function (alert) { seenIds.add(alert.id); });
      firstLoad = false;
      showList();
      return;
    }

    var lastFlashedTime = timestampFromId(readLastFlashedId());
    var unseen = incoming.filter(function (alert) {
      return !seenIds.has(alert.id);
    });
    if (state === "FLASH") {
      unseen.filter(function (alert) {
        return alert.level === "info" || alert.ack !== false;
      }).forEach(function (alert) { seenIds.add(alert.id); });
      renderList();
      return;
    }
    unseen.forEach(function (alert) { seenIds.add(alert.id); });

    var candidate = unseen.find(function (alert) {
      return alert.ack === false && alert.level !== "info" &&
        timestampFromId(alert.id) > lastFlashedTime;
    });

    renderList();
    if (candidate) {
      storeLastFlashedId(candidate.id);
      showFlash(candidate);
    } else {
      showList();
    }
  }

  function pollNow() {
    if (polling || document.hidden) return;
    polling = true;
    G.get("/alerts")
      .then(applyPollResult)
      .catch(function (error) { console.warn("알림 조회 실패", error); })
      .finally(function () { polling = false; });
  }

  function onNav(direction) {
    // 목록에서 왼쪽 = 허브 복귀 (안경에는 Escape가 없음)
    if (direction === "left" && state !== "FLASH") { window.location.href = G.withKey("index.html"); return; }
    if (state === "FLASH" || alerts.length === 0) return;
    if (direction === "up") cursor = Math.max(0, cursor - 1);
    if (direction === "down") cursor = Math.min(alerts.length - 1, cursor + 1);
    renderList();
  }

  function onSelect() {
    if (state === "FLASH") {
      var flashedId = flashCard.dataset.alertId;
      acknowledge(alerts.find(function (alert) { return alert.id === flashedId; }));
      showList();
      return;
    }
    acknowledge(alerts[cursor]);
  }

  G.input({
    onNav: onNav,
    onSelect: onSelect,
    onBack: function () { window.location.href = G.withKey("index.html"); }
  });
  G.poll(pollNow, POLL_MS);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) pollNow();
  });
  pollNow();
}());

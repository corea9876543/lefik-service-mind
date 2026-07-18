(function () {
  "use strict";

  var cards = Array.from(document.querySelectorAll(".hud-card"));
  var dots = Array.from(document.querySelectorAll(".hud-dots span"));
  var dotLabels = ["첫 번째 카드", "두 번째 카드", "세 번째 카드"];
  var activeCard = 0;
  var payload = null;
  var revenueMasked = true;
  var remaskTimer = null;

  function text(id, value) {
    document.getElementById(id).textContent = value;
  }

  function freshness(updatedAt) {
    var updated = new Date(updatedAt);
    if (!updatedAt || Number.isNaN(updated.getTime())) {
      return { label: "OFFLINE", state: "offline" };
    }
    var age = Date.now() - updated.getTime();
    var time = G.fmtTime(updatedAt);
    return age <= 20 * 60 * 1000
      ? { label: time + " ✓", state: "fresh" }
      : { label: "STALE " + time, state: "stale" };
  }

  function renderFreshness(status) {
    document.querySelectorAll(".freshness").forEach(function (badge) {
      badge.textContent = status.label;
      badge.className = "freshness " + status.state;
    });
  }

  function formatRevenue(amount) {
    var formatted = Math.max(0, Number(amount) || 0).toLocaleString("ko-KR");
    if (!revenueMasked) return "₩" + formatted;
    return "₩ " + formatted.replace(/\d/g, "●");
  }

  function renderData() {
    if (!payload || payload.state === "offline") {
      renderFreshness({ label: "OFFLINE", state: "offline" });
      text("reservation-primary", "연결할 수 없음");
      text("reservation-secondary", "");
      text("next-reservation", "");
      text("revenue-amount", "매출 수집 실패");
      text("revenue-count", "");
      text("escalation-open", "연결할 수 없음");
      return;
    }

    renderFreshness(freshness(payload.updatedAt));
    if (payload.reservations) {
      text("reservation-primary", "예약 " + payload.reservations.total + " · 내원 " + payload.reservations.arrived);
      text("reservation-secondary", "노쇼 " + payload.reservations.noshow + " · 취소 " + payload.reservations.cancelled);
      text("next-reservation", payload.nextReservation
        ? "다음 " + payload.nextReservation.time + " (" + payload.nextReservation.count + "명)"
        : "다음 예약 없음");
    } else {
      text("reservation-primary", "ops 수집 실패");
      text("reservation-secondary", "");
      text("next-reservation", "");
    }

    if (payload.revenue) {
      text("revenue-amount", formatRevenue(payload.revenue.amountKrw));
      text("revenue-count", "결제 " + payload.revenue.txCount + "건");
    } else {
      text("revenue-amount", "매출 수집 실패");
      text("revenue-count", "");
    }

    if (payload.escalations && payload.escalations.open !== null) {
      text("escalation-open", payload.escalations.open === 0 ? "이상 없음" : "열림 " + payload.escalations.open + "건");
    } else {
      text("escalation-open", "ops 수집 실패");
    }
  }

  function renderCard() {
    cards.forEach(function (card, index) { card.hidden = index !== activeCard; });
    dots.forEach(function (dot, index) {
      dot.textContent = index === activeCard ? "●" : "○";
      dot.classList.toggle("active", index === activeCard);
    });
    document.querySelector(".hud-dots").setAttribute("aria-label", dotLabels[activeCard]);
  }

  function fetchHud() {
    return G.get("/hud")
      .then(function (data) { payload = data; })
      .catch(function () { payload = { state: "offline" }; })
      .then(renderData);
  }

  G.input({
    onNav: function (direction) {
      if (direction !== "left" && direction !== "right") return;
      activeCard = (activeCard + (direction === "right" ? 1 : -1) + cards.length) % cards.length;
      renderCard();
    },
    onSelect: function () {
      if (activeCard !== 1) {
        fetchHud();
        return;
      }
      revenueMasked = !revenueMasked;
      if (remaskTimer) clearTimeout(remaskTimer);
      if (!revenueMasked) {
        remaskTimer = setTimeout(function () {
          revenueMasked = true;
          remaskTimer = null;
          renderData();
        }, 10000);
      }
      renderData();
    },
    onBack: function () { window.location.href = G.withKey("index.html"); }
  });

  renderCard();
  fetchHud();
  G.poll(fetchHud, 30000);
}());

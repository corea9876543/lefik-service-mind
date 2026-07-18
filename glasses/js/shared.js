(function () {
  "use strict";

  var G = {};
  G.BASE = "https://claude-glasses-ask.yongyongyo.workers.dev";

  function request(path, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 8000);
    var url = /^https?:\/\//.test(path) ? path : G.BASE + path;

    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
      .then(function (response) {
        if (!response.ok) {
          throw new Error("요청 실패: " + response.status);
        }
        if (response.status === 204) {
          return null;
        }
        return response.json();
      })
      .catch(function (error) {
        if (error.name === "AbortError") {
          throw new Error("요청 시간 초과");
        }
        throw error;
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  G.get = function (path) {
    return request(path, { method: "GET", headers: { Accept: "application/json" } });
  };

  G.post = function (path, body, writeKey) {
    var headers = { Accept: "application/json", "Content-Type": "application/json" };
    if (writeKey) {
      headers["X-Write-Key"] = writeKey;
    }
    return request(path, { method: "POST", headers: headers, body: JSON.stringify(body) });
  };

  G.poll = function (fn, ms) {
    var timer = null;
    var stopped = false;

    function start() {
      if (!stopped && !document.hidden && timer === null) {
        timer = setInterval(fn, ms);
      }
    }

    function pause() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    }

    function onVisibilityChange() {
      if (document.hidden) pause();
      else start();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    start();

    return function stop() {
      stopped = true;
      pause();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  };

  G.input = function (handlers) {
    handlers = handlers || {};
    var touchStart = null;

    function nav(direction) {
      if (handlers.onNav) handlers.onNav(direction);
    }

    function onKeyDown(event) {
      var directions = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right"
      };
      if (directions[event.key]) {
        event.preventDefault();
        nav(directions[event.key]);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (handlers.onSelect) handlers.onSelect();
      } else if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        if (handlers.onBack) handlers.onBack();
      }
    }

    function onTouchStart(event) {
      var touch = event.changedTouches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
    }

    function onTouchEnd(event) {
      if (!touchStart) return;
      var touch = event.changedTouches[0];
      var dx = touch.clientX - touchStart.x;
      var dy = touch.clientY - touchStart.y;
      touchStart = null;

      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) {
        if (handlers.onSelect) handlers.onSelect();
      } else if (Math.abs(dx) > Math.abs(dy)) {
        nav(dx > 0 ? "right" : "left");
      } else {
        nav(dy > 0 ? "down" : "up");
      }
    }

    function onWheel(event) {
      if (event.deltaY === 0) return;
      event.preventDefault();
      nav(event.deltaY > 0 ? "down" : "up");
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: false });

    return function removeInputHandlers() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("wheel", onWheel);
    };
  };

  // 키 보관: localStorage가 유지되지 않는 웹뷰(안경)를 위해 메모리 폴백 + URL 전파를 병행한다.
  var memKey = null;

  G.writeKey = function () {
    var stored = null;
    try { stored = localStorage.getItem("glassesWriteKey"); } catch (err) {}
    return stored || memKey;
  };

  G.setWriteKey = function (key) {
    memKey = key;
    try { localStorage.setItem("glassesWriteKey", key); } catch (err) {}
  };

  G.clearWriteKey = function () {
    memKey = null;
    try { localStorage.removeItem("glassesWriteKey"); } catch (err) {}
  };

  // 페이지 이동 주소에 키를 실어 보낸다 — 도착 페이지의 captureKeyParam이 다시 잡는다.
  G.withKey = function (href) {
    var key = G.writeKey();
    if (!key || href.indexOf("key=") !== -1) return href;
    return href + (href.indexOf("?") !== -1 ? "&" : "?") + "key=" + encodeURIComponent(key);
  };

  // 진입 페이지가 어디든 ?key= 를 잡아 저장. localStorage 유지가 확인될 때만 주소에서 제거
  // (유지 안 되는 환경에서는 주소에 남겨 새로고침/이동에도 키가 살아있게 한다).
  (function captureKeyParam() {
    try {
      var params = new URLSearchParams(window.location.search);
      var key = params.get("key");
      if (!key) return;
      G.setWriteKey(key);
      var persisted = null;
      try { persisted = localStorage.getItem("glassesWriteKey"); } catch (err) {}
      if (persisted === key) {
        params.delete("key");
        var query = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (query ? "?" + query : "") + window.location.hash);
      }
    } catch (err) { /* 어떤 환경에서도 페이지 렌더는 계속돼야 함 */ }
  })();

  G.fmtTime = function (iso) {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(iso));
  };

  window.G = G;
}());

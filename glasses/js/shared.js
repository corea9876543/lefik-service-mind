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

  G.writeKey = function () {
    return localStorage.getItem("glassesWriteKey");
  };

  G.setWriteKey = function (key) {
    localStorage.setItem("glassesWriteKey", key);
  };

  // 진입 페이지가 어디든(허브 포함) ?key= 를 잡아 저장하고 주소에서 제거.
  // 안경 등록 URL(허브)로 들어와도 이후 모든 모듈이 localStorage로 키를 읽는다.
  (function captureKeyParam() {
    try {
      var params = new URLSearchParams(window.location.search);
      var key = params.get("key");
      if (key) {
        G.setWriteKey(key);
        params.delete("key");
        var query = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (query ? "?" + query : "") + window.location.hash);
      }
    } catch (err) { /* localStorage 불가 환경에서도 페이지는 동작해야 함 */ }
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

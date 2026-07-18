(function () {
  "use strict";

  var DEFAULT_BASE = "https://claude-glasses-ask.yongyongyo.workers.dev";
  var FALLBACK_CONFIG = {
    version: 1,
    freeText: { enabled: true, mode: "readonly" },
    presets: [
      { id: "sales_today", label: "오늘 매출 요약", mode: "readonly", cwd: "C:/Users/admin/Desktop/service-mind", prompt: "[레픽] 일간매출 SoT 시트 접근 수단이 있으면 오늘 수납액 합계와 어제 대비 증감을 요약하라. 접근 수단이 없으면 '이 위치에서는 매출 시트 접근 불가'라고 한 문장으로 답하라. 환자 성명 등 PHI를 출력하지 마라." },
      { id: "sales_vs_yesterday", label: "어제 대비 매출", mode: "readonly", cwd: "C:/Users/admin/Desktop/service-mind", prompt: "[레픽] 매출 SoT 접근 수단이 있으면 오늘과 어제 수납액을 비교해 금액 및 증감률을 요약하라. 접근할 수 없으면 그 사유만 한 문장으로 답하라. 환자 성명 등 PHI를 출력하지 마라." },
      { id: "mission_control", label: "관제탑 미결 요약", mode: "readonly", cwd: "C:/Users/admin/.claude/projects/C--Users-admin/memory", prompt: "MEMORY.md의 프로젝트 목록에서 남음 또는 미결로 표시된 항목 상위 3개를 중요도 순으로 요약하라. 파일에 접근할 수 없으면 그 사유만 한 문장으로 답하라. 환자 성명 등 PHI를 출력하지 마라." },
      { id: "reservations_today", label: "오늘 예약 현황", mode: "readonly", cwd: "C:/Users/admin/Desktop/service-mind", prompt: "오늘 예약 데이터 접근 수단이 있으면 개인 식별정보 없이 총 건수와 시간대별 혼잡도만 요약하라. 접근할 수 없으면 그 사유만 한 문장으로 답하라. 환자 성명 등 PHI를 출력하지 마라." },
      { id: "todo_brief", label: "오늘 할 일 브리핑", mode: "readonly", cwd: "C:/Users/admin/.claude/projects/C--Users-admin/memory", prompt: "MEMORY.md와 접근 가능한 메모에서 오늘 처리할 일 중 중요한 항목 최대 3개를 요약하라. 접근할 수 없으면 그 사유만 한 문장으로 답하라. 환자 성명 등 PHI를 출력하지 마라." },
      { id: "git_status", label: "Git 상태 요약", mode: "readonly", cwd: "C:/Users/admin/Desktop/service-mind", prompt: "현재 service-mind 저장소의 읽을 수 있는 Git 메타데이터와 작업 파일을 바탕으로 변경 상태를 1~3문장으로 요약하라. 확인할 수 없으면 그 사유만 한 문장으로 답하라. 환자 성명 등 PHI를 출력하지 마라." },
      { id: "ops_health", label: "NAS 상태 확인", mode: "action", cwd: "C:/Users/admin/Desktop/service-mind", allowedTools: ["Read", "Glob", "Grep", "Bash(curl:*)"], prompt: "curl을 사용해 http://192.168.0.99:8000 의 응답 여부만 확인하고 상태를 요약하라. 응답하지 않거나 접근할 수 없으면 그 사유만 한 문장으로 답하라. 어떠한 변경 요청도 보내지 마라. 환자 성명 등 PHI를 출력하지 마라." },
      { id: "inbox_check", label: "기타 알림 요약", mode: "readonly", cwd: "C:/Users/admin/Desktop/service-mind", prompt: "접근 가능한 로컬 자료에서 to-claude 명령 큐를 제외한 최근 알림을 최대 3개 요약하라. 알림 데이터에 접근할 수 없으면 그 사유만 한 문장으로 답하라. 환자 성명 등 PHI를 출력하지 마라." },
      { id: "trend_today", label: "오늘 트렌드", mode: "readonly", cwd: "C:/Users/admin/Desktop/repic-trend-followup", prompt: "로컬에 저장된 오늘 트렌드 다이제스트가 있으면 핵심 내용 최대 3개를 요약하라. 자료가 없거나 접근할 수 없으면 그 사유만 한 문장으로 답하라. 환자 성명 등 PHI를 출력하지 마라." },
      { id: "free_hint", label: "명령 도움말", mode: "readonly", cwd: "C:/Users/admin/Desktop/service-mind/tools/agent-listener", prompt: "presets.json을 읽고 사용 가능한 프리셋 명령의 종류와 직접 입력 기능을 간단히 안내하라. 파일에 접근할 수 없으면 그 사유만 한 문장으로 답하라. 환자 성명 등 PHI를 출력하지 마라." }
    ]
  };

  var root = document.getElementById("agent-root");
  var hint = document.getElementById("agent-hint");
  var params = new URLSearchParams(window.location.search);
  var base = (params.get("api") || (window.G && G.BASE) || DEFAULT_BASE).replace(/\/$/, "");
  var pollSeconds = Math.max(5, Number(params.get("poll")) || 5);
  var state = "KEY";
  var config = FALLBACK_CONFIG;
  var cursor = 0;
  var selected = null;
  var activeReqId = null;
  var activeLabel = "";
  var pollStop = null;
  var pollCount = 0;
  var pollStartedAt = 0;
  var speech = null;

  if (window.G) G.BASE = base;
  if (params.get("key")) {
    G.setWriteKey(params.get("key"));
  }

  function key() {
    return (window.G && G.writeKey()) || "";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function setView(html, help) {
    root.innerHTML = html;
    hint.textContent = help || "";
  }

  function renderKey(message) {
    state = "KEY";
    stopPolling();
    setView(
      '<div class="agent-card agent-form"><h1 class="agent-heading">쓰기 키 입력</h1>' +
      (message ? '<p class="agent-meta">' + escapeHtml(message) + "</p>" : "") +
      '<label for="write-key">Worker 쓰기 키</label><input id="write-key" class="agent-input agent-key" type="password" autocomplete="off" aria-label="Worker 쓰기 키"></div>',
      "키 입력 후 선택"
    );
    document.getElementById("write-key").focus();
  }

  function paletteItems() {
    return config.presets.concat([{ id: null, label: "직접 입력", mode: "readonly" }]);
  }

  function renderPalette() {
    state = "PALETTE";
    selected = null;
    stopPolling();
    var items = paletteItems();
    cursor = Math.max(0, Math.min(cursor, items.length - 1));
    setView(
      '<h1 class="agent-heading">에이전트 명령</h1><ul class="agent-list" role="listbox">' +
      items.map(function (item, index) {
        return '<li><button type="button" class="agent-option' + (index === cursor ? " focused" : "") + '" data-index="' + index + '" role="option" aria-selected="' + (index === cursor) + '">' + escapeHtml(item.label) + (item.mode === "action" ? " · 쓰기" : "") + "</button></li>";
      }).join("") + "</ul>",
      "위·아래 이동 · 선택 실행"
    );
    var focused = root.querySelector(".focused");
    if (focused) focused.scrollIntoView({ block: "nearest" });
  }

  function renderConfirm() {
    state = "CONFIRM";
    setView('<div class="agent-card"><h1 class="agent-heading">' + escapeHtml(selected.label) + '</h1><p>쓰기 작업입니다 — 다시 선택하면 실행</p></div>', "선택 실행 · 왼쪽 취소");
  }

  function renderInput() {
    state = "INPUT";
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setView(
      '<div class="agent-form"><h1 class="agent-heading">직접 입력</h1><label for="command-text">명령 (최대 500자)</label><textarea id="command-text" class="agent-input" maxlength="500"></textarea><div class="agent-actions">' +
      (SpeechRecognition ? '<button id="mic-button" class="agent-button agent-secondary" type="button" aria-pressed="false">마이크</button>' : "") +
      '<button id="send-button" class="agent-button" type="button">보내기</button></div></div>',
      "텍스트 입력 후 선택"
    );
    document.getElementById("send-button").addEventListener("click", sendFreeText);
    document.getElementById("command-text").focus();
    if (SpeechRecognition) setupSpeech(SpeechRecognition);
  }

  function setupSpeech(SpeechRecognition) {
    speech = new SpeechRecognition();
    speech.lang = "ko-KR";
    speech.interimResults = true;
    speech.continuous = false;
    var button = document.getElementById("mic-button");
    var listening = false;
    button.addEventListener("click", function () {
      if (listening) speech.stop(); else speech.start();
    });
    speech.onstart = function () { listening = true; button.setAttribute("aria-pressed", "true"); button.textContent = "듣는 중"; };
    speech.onend = function () { listening = false; button.setAttribute("aria-pressed", "false"); button.textContent = "마이크"; };
    speech.onerror = function (event) { hint.textContent = "음성 오류: " + event.error; };
    speech.onresult = function (event) {
      var text = "";
      for (var index = 0; index < event.results.length; index += 1) text += event.results[index][0].transcript;
      document.getElementById("command-text").value = text.slice(0, 500);
      if (event.results[event.results.length - 1].isFinal) window.setTimeout(sendFreeText, 200);
    };
  }

  function request(path, options) {
    return fetch(base + path, options).then(function (response) {
      if (response.status === 401) {
        G.clearWriteKey();
        renderKey("키가 올바르지 않습니다.");
        throw new Error("unauthorized");
      }
      if (!response.ok) throw new Error("요청 실패: " + response.status);
      return response.json();
    });
  }

  function authHeaders(withJson) {
    var headers = { Accept: "application/json", "x-write-key": key() };
    if (withJson) headers["Content-Type"] = "application/json";
    return headers;
  }

  function makeReqId() {
    return "c-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  }

  function sendFreeText() {
    if (state !== "INPUT") return;
    var textarea = document.getElementById("command-text");
    var prompt = textarea.value.trim().slice(0, 500);
    if (!prompt) { hint.textContent = "명령을 입력하세요."; return; }
    sendCommand({ presetId: null, prompt: prompt, label: "직접 입력" });
  }

  function sendPreset() {
    sendCommand({ presetId: selected.id, prompt: selected.label, label: selected.label });
  }

  function sendCommand(command) {
    activeReqId = makeReqId();
    activeLabel = command.label;
    state = "SENT";
    setView('<div class="agent-card"><h1 class="agent-heading">' + escapeHtml(activeLabel) + '</h1><p>전송 중…</p></div>', "PC 리스너에 연결 중");
    request("/inbox/push", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ queue: "to-claude", payload: { type: "command", reqId: activeReqId, presetId: command.presetId, prompt: command.prompt, source: "glasses" } })
    }).then(function () {
      renderSent("전송됨 · 실행 대기");
      startPolling();
    }).catch(function (error) {
      if (error.message !== "unauthorized") renderResult({ status: "error", label: activeLabel, summary: error.message, elapsedSec: 0 });
    });
  }

  function renderSent(message) {
    state = "SENT";
    setView('<div class="agent-card"><h1 class="agent-heading">' + escapeHtml(activeLabel) + "</h1><p>" + escapeHtml(message) + "</p></div>", "결과를 기다리는 중");
  }

  function startPolling() {
    stopPolling();
    pollCount = 0;
    pollStartedAt = Date.now();
    pollStop = window.setInterval(pollOnce, pollSeconds * 1000);
  }

  function stopPolling() {
    if (pollStop !== null) window.clearInterval(pollStop);
    pollStop = null;
  }

  function pollingExpired() {
    return pollCount >= 60 || Date.now() - pollStartedAt >= 300000;
  }

  function renderListenerTimeout() {
    stopPolling();
    renderResult({ status: "timeout", label: activeLabel, summary: "리스너 응답 없음 — PC에서 run-listener.bat 확인", elapsedSec: 0 });
  }

  function pollOnce() {
    pollCount += 1;
    request("/inbox/pop?queue=to-glasses", { method: "GET", headers: authHeaders(false) })
      .then(function (data) {
        if (data.item) handleInboxItem(data.item);
        else if (pollingExpired()) renderListenerTimeout();
      })
      .catch(function (error) {
        if (error.message !== "unauthorized") {
          if (pollingExpired()) renderListenerTimeout(); else hint.textContent = error.message;
        }
      });
  }

  function handleInboxItem(item) {
    var payload = item.payload || {};
    if (payload.type === "agent-ack") {
      if (payload.reqId === activeReqId) renderSent("실행 중…");
      else showOther("agent-ack");
      return;
    }
    if (payload.type === "agent-result") {
      stopPolling();
      if (payload.reqId !== activeReqId) payload.label = "(이전) " + (payload.label || "에이전트 결과");
      renderResult(payload);
      return;
    }
    showOther(payload.type || "unknown");
  }

  function showOther(type) {
    setView('<div class="agent-card"><p>기타 알림: ' + escapeHtml(type) + "</p></div>", "명령 결과도 계속 기다리는 중");
    window.setTimeout(function () { if (state === "SENT") renderSent("실행 결과 대기"); }, Math.min(3000, pollSeconds * 500));
  }

  function renderResult(result) {
    state = "RESULT";
    var ok = result.status === "ok";
    var icon = ok ? "OK" : "오류";
    var elapsed = Number(result.elapsedSec) > 0 ? " · " + Number(result.elapsedSec).toFixed(1) + "초" : "";
    setView(
      '<div class="agent-card"><h1 class="agent-heading">' + icon + " · " + escapeHtml(result.label || "에이전트 결과") + '</h1><p class="agent-summary">' + escapeHtml(result.summary || "결과가 없습니다.") + '</p><p class="agent-meta">' + escapeHtml(result.status || "error") + elapsed + "</p></div>",
      "선택하면 명령 목록"
    );
  }

  function onNav(direction) {
    if (state === "PALETTE" && (direction === "up" || direction === "down")) {
      var count = paletteItems().length;
      cursor = (cursor + (direction === "down" ? 1 : -1) + count) % count;
      renderPalette();
    } else if (state === "CONFIRM" && direction === "left") {
      renderPalette();
    } else if (state === "INPUT" && direction === "left") {
      renderPalette();
    }
  }

  function onSelect() {
    if (state === "KEY") {
      var input = document.getElementById("write-key");
      if (input && input.value.trim()) { G.setWriteKey(input.value.trim()); loadConfig(); }
      return;
    }
    if (state === "PALETTE") {
      selected = paletteItems()[cursor];
      if (!selected.id) renderInput();
      else if (selected.mode === "action") renderConfirm();
      else sendPreset();
    } else if (state === "CONFIRM") sendPreset();
    else if (state === "INPUT") sendFreeText();
    else if (state === "RESULT") { cursor = 0; renderPalette(); }
  }

  function loadConfig() {
    fetch("../tools/agent-listener/presets.json", { headers: { Accept: "application/json" } })
      .then(function (response) { if (!response.ok) throw new Error("preset fetch failed"); return response.json(); })
      .then(function (loaded) { if (!loaded || !Array.isArray(loaded.presets)) throw new Error("invalid presets"); config = loaded; })
      .catch(function () { config = FALLBACK_CONFIG; })
      .finally(renderPalette);
  }

  G.input({
    onNav: onNav,
    onSelect: onSelect,
    onBack: function () {
      if (state === "PALETTE" || state === "KEY") window.location.href = G.withKey("index.html");
      else renderPalette();
    }
  });

  if (key()) loadConfig(); else renderKey("");
}());

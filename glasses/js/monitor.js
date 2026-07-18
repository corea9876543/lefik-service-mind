(function () {
  "use strict";

  var DEFAULT_CHOICES = ["예", "아니오", "보류"];
  var POLL_MS = 5000;
  var storage = window.localStorage;
  var currentStatus = null;
  var currentQuestion = null;
  var view = "status";
  var selectedIndex = 0;
  var fetching = false;
  var toastTimer = null;

  var statusCard = document.getElementById("status-card");
  var answerCard = document.getElementById("answer-card");
  var statusLabel = document.getElementById("status-label");
  var relativeTime = document.getElementById("relative-time");
  var headline = document.getElementById("headline");
  var progressRow = document.getElementById("progress-row");
  var progressTrack = progressRow.querySelector(".progress-track");
  var progressBar = document.getElementById("progress-bar");
  var stepLabel = document.getElementById("step-label");
  var questionHint = document.getElementById("question-hint");
  var questionText = document.getElementById("question-text");
  var choiceList = document.getElementById("choice-list");
  var toast = document.getElementById("toast");

  function captureWriteKey() {
    var params = new URLSearchParams(window.location.search);
    var key = params.get("key");
    if (!key) return;
    storage.setItem("glasses_write_key", key);
    params.delete("key");
    var query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? "?" + query : "") + window.location.hash);
  }

  function showToast(message, isError) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = "toast" + (isError ? " error" : "");
    toast.hidden = false;
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2800);
  }

  function statusQuestion(status) {
    var question;
    var choices;
    if (!status || status.state !== "waiting" || status.needsInput !== true) return null;
    if (status.question && typeof status.question.text === "string" && status.question.text) {
      question = status.question;
      choices = Array.isArray(question.choices) ? question.choices.slice(0, 4) : [];
      choices = choices.filter(function (choice) { return typeof choice === "string" && choice.length > 0; });
      return {
        id: String(question.id || "legacy-" + (status.updatedAt || "unknown")),
        text: question.text,
        choices: choices.length ? choices : DEFAULT_CHOICES.slice()
      };
    }
    return {
      id: "legacy-" + (status.updatedAt || "unknown"),
      text: status.headline || "응답이 필요합니다",
      choices: DEFAULT_CHOICES.slice()
    };
  }

  function secondsSince(iso) {
    var time = Date.parse(iso || "");
    if (!isFinite(time)) return 0;
    return Math.max(0, Math.floor((Date.now() - time) / 1000));
  }

  function relativeLabel(iso) {
    var seconds = secondsSince(iso);
    if (seconds < 60) return seconds + "초 전";
    if (seconds < 3600) return Math.floor(seconds / 60) + "분 전";
    return Math.floor(seconds / 3600) + "시간 전";
  }

  function leaveAnswerView() {
    view = "status";
    statusCard.classList.remove("hidden");
    answerCard.classList.remove("active");
  }

  function renderStatus(offline) {
    var status = currentStatus || {};
    var state = offline ? "offline" : String(status.state || "offline").toLowerCase();
    var allowed = { running: true, waiting: true, done: true, error: true, offline: true };
    var step = status.step || {};
    var current = Number(step.current) || 0;
    var total = Number(step.total) || 0;
    var stale = offline || secondsSince(status.updatedAt) >= 120;
    var answered = currentQuestion && storage.getItem("glasses_answered_qid") === currentQuestion.id;

    if (!allowed[state]) state = "error";
    statusLabel.className = "status-label " + state;
    statusLabel.textContent = "● " + state.toUpperCase();
    relativeTime.textContent = status.updatedAt ? relativeLabel(status.updatedAt) : "";
    headline.textContent = status.headline || "상태 없음";
    if (stale) {
      headline.textContent = "";
      headline.appendChild(document.createTextNode((status.headline || "상태 없음") + " "));
      var badge = document.createElement("span");
      badge.className = "stale-badge";
      badge.textContent = "STALE";
      headline.appendChild(badge);
    }

    progressRow.hidden = total <= 0;
    if (total > 0) {
      progressBar.style.width = Math.max(0, Math.min(100, Math.round(current / total * 100))) + "%";
      stepLabel.textContent = current + " / " + total;
      progressTrack.setAttribute("aria-valuemax", String(total));
      progressTrack.setAttribute("aria-valuenow", String(current));
    }
    questionHint.hidden = !currentQuestion;
    if (currentQuestion) {
      questionHint.textContent = answered ? "✓ 답변 전송됨 — 대기 중" : "▶ 질문 있음 — 탭하여 응답";
    }
  }

  function renderChoices() {
    choiceList.textContent = "";
    currentQuestion.choices.forEach(function (choice, index) {
      var item = document.createElement("li");
      var selected = index === selectedIndex;
      item.className = "choice" + (selected ? " selected" : "");
      item.setAttribute("aria-selected", selected ? "true" : "false");
      item.appendChild(document.createTextNode((selected ? "▸ " : "  ") + choice));
      if (index === currentQuestion.choices.length - 1) {
        var back = document.createElement("span");
        back.className = "back-hint";
        back.textContent = "◀ 뒤로";
        item.appendChild(back);
      }
      choiceList.appendChild(item);
    });
  }

  function enterAnswerView() {
    if (!currentQuestion || storage.getItem("glasses_answered_qid") === currentQuestion.id) return;
    view = "answer";
    selectedIndex = 0;
    questionText.textContent = "질문: " + currentQuestion.text;
    renderChoices();
    statusCard.classList.add("hidden");
    answerCard.classList.add("active");
  }

  function applyStatus(status) {
    var previousId = currentQuestion && currentQuestion.id;
    currentStatus = status || {};
    currentQuestion = statusQuestion(currentStatus);
    if (view === "answer" && (!currentQuestion || currentQuestion.id !== previousId)) leaveAnswerView();
    renderStatus(false);
  }

  function tick() {
    if (fetching) return;
    fetching = true;
    G.get("/status?monitor=" + Date.now()).then(function (status) {
      applyStatus(status);
    }).catch(function () {
      renderStatus(true);
    }).then(function () {
      fetching = false;
    });
  }

  function sendAnswer() {
    var key = storage.getItem("glasses_write_key");
    var question = currentQuestion;
    if (!question) {
      leaveAnswerView();
      return;
    }
    if (!key) {
      showToast("키 미설정: ?key= 로 1회 접속", true);
      return;
    }
    G.post("/inbox/push", {
      queue: "to-claude",
      payload: {
        type: "answer",
        sessionId: currentStatus.session || "",
        questionId: question.id,
        answer: question.choices[selectedIndex]
      }
    }, key).then(function () {
      storage.setItem("glasses_answered_qid", question.id);
      showToast("전송됨", false);
      leaveAnswerView();
      renderStatus(false);
    }).catch(function (error) {
      showToast("전송 오류: " + (error && error.message ? error.message : "요청 실패"), true);
    });
  }

  function onNav(direction) {
    if (view !== "answer" || !currentQuestion) return;
    if (direction === "left") {
      leaveAnswerView();
      return;
    }
    if (direction !== "up" && direction !== "down") return;
    selectedIndex = (selectedIndex + (direction === "down" ? 1 : -1) + currentQuestion.choices.length) % currentQuestion.choices.length;
    renderChoices();
  }

  function onSelect() {
    if (view === "answer") sendAnswer();
    else if (currentQuestion && storage.getItem("glasses_answered_qid") !== currentQuestion.id) enterAnswerView();
    else tick();
  }

  captureWriteKey();
  G.input({ onNav: onNav, onSelect: onSelect });
  tick();
  G.poll(tick, POLL_MS);
}());

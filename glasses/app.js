(function () {
  'use strict';

  // ==================== CONFIG (배포 시 여기만 수정) ====================
  var CONFIG = {
    // backend 설정 시: 실시간 상태(/status) + 질문(/ask) 사용.
    // 비우면 아래 statusFallback(raw URL)로 상태만 표시(CDN 캐시로 수십 초~분 지연).
    backend: 'https://gene-tools-referral-momentum.trycloudflare.com',   // 예: 'https://claude-glasses-ask.<계정>.workers.dev' 또는 cloudflared 주소
    statusFallback: 'https://raw.githubusercontent.com/corea9876543/lefik-service-mind/claude/rayban-remote-monitoring-5x34bs/status.json',
    pollMs: 4000,
  };
  function statusUrl() { return CONFIG.backend ? CONFIG.backend + '/status' : CONFIG.statusFallback; }
  function askBase() { return CONFIG.backend; }

  // ==================== STATE ====================
  var state = { currentScreen: 'monitor', history: [], target: 'model', lastUpdated: null, pollTimer: null, askPoll: null };
  var screens = {};

  // ==================== NAV (공식 스캐폴드 패턴) ====================
  function collectScreens() {
    document.querySelectorAll('.screen').forEach(function (s) { if (s.id) screens[s.id] = s; });
  }
  function navigateTo(id, opts) {
    opts = opts || {};
    if (opts.addToHistory !== false && state.currentScreen) state.history.push(state.currentScreen);
    Object.values(screens).forEach(function (s) { s.classList.add('hidden'); });
    if (!screens[id]) return;
    screens[id].classList.remove('hidden');
    state.currentScreen = id;
    onScreenEnter(id);
    focusFirst(screens[id]);
  }
  function navigateBack() { if (state.history.length) navigateTo(state.history.pop(), { addToHistory: false }); }

  // ==================== FOCUS (네이티브 DOM 포커스, D-pad로 이동) ====================
  function focusFirst(c) { var el = c.querySelector('.focusable:not([disabled]):not(.hidden)'); if (el) el.focus(); }
  function moveFocus(dir) {
    var c = screens[state.currentScreen]; if (!c) return;
    var items = Array.from(c.querySelectorAll('.focusable:not([disabled]):not(.hidden)'));
    if (!items.length) return;
    var idx = items.indexOf(document.activeElement);
    if (idx === -1) { focusFirst(c); return; }
    var next = (dir === 'up' || dir === 'left') ? (idx > 0 ? idx - 1 : items.length - 1)
                                                : (idx < items.length - 1 ? idx + 1 : 0);
    items[next].focus();
    items[next].scrollIntoView({ block: 'nearest' });
  }

  // ==================== API + UI 헬퍼 ====================
  function apiGet(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function showToast(msg, type) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast' + (type ? ' ' + type : ''); t.offsetHeight;
    t.classList.add('visible'); setTimeout(function () { t.classList.remove('visible'); }, 2800);
  }

  // ==================== 모니터 화면 ====================
  var LABEL = { running: 'RUNNING', waiting: 'WAITING', done: 'DONE', error: 'ERROR' };
  function tickMonitor() {
    apiGet(statusUrl() + '?t=' + Date.now()).then(function (s) {
      var st = (s.state || 'running').toLowerCase();
      document.body.dataset.state = LABEL[st] ? st : 'running';
      document.body.classList.toggle('live', st === 'running');
      document.body.classList.remove('stale');
      document.getElementById('m-state').textContent = LABEL[st] || st.toUpperCase();
      document.getElementById('m-headline').textContent = s.headline || '(상태 없음)';
      var cur = (s.step && s.step.current) || 0, tot = (s.step && s.step.total) || 0;
      document.getElementById('m-bar').style.width = (tot ? Math.round(cur / tot * 100) : (st === 'done' ? 100 : 0)) + '%';
      document.getElementById('m-step').textContent = tot ? (cur + ' / ' + tot + ' 단계') : '';
      state.lastUpdated = s.updatedAt ? new Date(s.updatedAt) : new Date();
    }).catch(function () {
      document.body.classList.add('stale');
      document.getElementById('m-state').textContent = 'OFFLINE';
    }).then(relTime);
  }
  function relTime() {
    var el = document.getElementById('m-rel');
    if (!state.lastUpdated) { el.textContent = '—'; return; }
    var s = Math.max(0, Math.round((Date.now() - state.lastUpdated) / 1000));
    el.textContent = s < 60 ? (s + '초 전') : s < 3600 ? (Math.floor(s / 60) + '분 전') : (Math.floor(s / 3600) + '시간 전');
  }

  // ==================== 질문 화면 ====================
  function setTarget(t) {
    state.target = t;
    document.getElementById('a-target').textContent = '대상: ' + (t === 'model' ? '모델' : '세션');
  }
  function askSend() {
    var q = document.getElementById('a-input').value.trim();
    if (!q) { showToast('질문을 입력하세요', 'error'); return; }
    if (!askBase()) { showToast('백엔드 미설정 (CONFIG.backend)', 'error'); return; }
    var ans = document.getElementById('a-answer');
    ans.textContent = ''; clearInterval(state.askPoll);
    showToast(state.target === 'model' ? '생각 중…' : '세션에 전달 중…');
    fetch(askBase() + '/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, target: state.target }),
    }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || r.status); return d; }); })
      .then(function (d) {
        if (state.target === 'model') { ans.textContent = d.answer || '(빈 응답)'; showToast('완료', 'success'); }
        else { showToast('세션 대기 중…'); pollSession(d.id, ans); }
      }).catch(function (e) { showToast('오류: ' + e.message, 'error'); });
  }
  function pollSession(id, ans) {
    state.askPoll = setInterval(function () {
      apiGet(askBase() + '/inbox/' + encodeURIComponent(id) + '?t=' + Date.now())
        .then(function (it) { if (it.status === 'answered') { clearInterval(state.askPoll); ans.textContent = it.answer; showToast('세션이 답함', 'success'); } })
        .catch(function () {});
    }, 3000);
  }

  // ==================== 화면 진입 훅 ====================
  function onScreenEnter(id) {
    if (id === 'monitor') { tickMonitor(); }   // 들어올 때 즉시 갱신 (폴링은 항상 가동)
  }

  // ==================== ACTION 디스패치 ====================
  function handleAction(action) {
    switch (action) {
      case 'back': navigateBack(); break;
      case 'refresh': tickMonitor(); showToast('새로고침'); break;
      case 'go-ask': navigateTo('ask'); break;
      case 'toggle-target': setTarget(state.target === 'model' ? 'session' : 'model'); break;
      case 'ask-send': askSend(); break;
    }
  }

  // ==================== EVENTS ====================
  function setupEvents() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-action]'); if (el) handleAction(el.dataset.action);
    });
    document.addEventListener('keydown', function (e) {
      var isInput = document.activeElement && document.activeElement.tagName === 'INPUT';
      if (isInput && e.key !== 'Escape' && e.key !== 'Enter') return;
      switch (e.key) {
        case 'ArrowUp': moveFocus('up'); e.preventDefault(); break;
        case 'ArrowDown': moveFocus('down'); e.preventDefault(); break;
        case 'ArrowLeft': moveFocus('left'); e.preventDefault(); break;
        case 'ArrowRight': moveFocus('right'); e.preventDefault(); break;
        case 'Enter':
          if (isInput) { document.activeElement.blur(); handleAction(document.activeElement.dataset.submitAction); }
          else if (document.activeElement && document.activeElement.classList.contains('focusable')) document.activeElement.click();
          e.preventDefault(); break;
        case 'Escape': if (isInput) document.activeElement.blur(); else navigateBack(); e.preventDefault(); break;
      }
    });
  }

  // ==================== INIT ====================
  function init() {
    collectScreens(); setupEvents(); setTarget('model');
    state.pollTimer = setInterval(tickMonitor, CONFIG.pollMs);
    setInterval(relTime, 1000);
    navigateTo('monitor', { addToHistory: false });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

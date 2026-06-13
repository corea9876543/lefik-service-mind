// 레이밴 디스플레이 웹 앱 로직.
// 입력은 D-pad(방향키 ↑↓←→) + 선택(Enter/Space)만. 텍스트는 포커스된 input에 Neural Handwriting로 입력.
// 브라우저 테스트: 화살표키로 포커스 이동, Enter로 선택.

// ── 설정 (배포 시 여기만 바꾸면 됨) ──
const STATUS_URL  = 'https://raw.githubusercontent.com/corea9876543/lefik-service-mind/claude/rayban-remote-monitoring-5x34bs/status.json';
const ASK_BACKEND = 'https://your-backend.example.com';   // backend/ask-server.mjs 배포 주소
const POLL_MS = 5000;

const $ = id => document.getElementById(id);
const screens = { 'screen-monitor': $('screen-monitor'), 'screen-ask': $('screen-ask') };
let current = 'screen-monitor';

// ===== 화면 전환 =====
function show(id){
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[id].classList.add('active');
  current = id;
  refocus();
}

// ===== D-pad 포커스 관리 =====
// 현재 화면의 .focusable 요소들을 DOM 순서로 두고 ↑↓로 이동, Enter로 활성화.
function focusables(){ return [...screens[current].querySelectorAll('.focusable')]; }
let focusIdx = 0;

function refocus(){
  focusIdx = 0;
  applyFocus();
}
function applyFocus(){
  const items = focusables();
  items.forEach((el, i) => el.classList.toggle('focused', i === focusIdx));
  items[focusIdx]?.scrollIntoView({ block:'nearest' });
}
function moveFocus(delta){
  const n = focusables().length;
  if(!n) return;
  focusIdx = (focusIdx + delta + n) % n;
  applyFocus();
}
function activate(){
  const el = focusables()[focusIdx];
  if(!el) return;
  if(el.tagName === 'INPUT'){ el.focus(); return; }   // 핸드라이팅 입력 시작
  el.click();
}

document.addEventListener('keydown', (e) => {
  // input에 포커스가 들어가 글자 입력 중이면 D-pad 가로채지 않음 (Escape로 빠져나옴)
  if(document.activeElement?.tagName === 'INPUT' && e.key !== 'Escape' && e.key !== 'Enter') return;
  switch(e.key){
    case 'ArrowDown': case 'ArrowRight': moveFocus(1); e.preventDefault(); break;
    case 'ArrowUp':   case 'ArrowLeft':  moveFocus(-1); e.preventDefault(); break;
    case 'Enter': case ' ':
      if(document.activeElement?.tagName === 'INPUT'){ document.activeElement.blur(); send(); }
      else activate();
      e.preventDefault(); break;
    case 'Escape': document.activeElement?.blur?.(); break;
  }
});

// nav 버튼들: data-goto 로 화면 전환
document.querySelectorAll('[data-goto]').forEach(b =>
  b.addEventListener('click', () => show(b.dataset.goto)));

// ===== 모니터: status.json 폴링 =====
const LABEL = { running:'RUNNING', waiting:'WAITING', done:'DONE', error:'ERROR' };
let lastUpdated = null;

async function tick(){
  try{
    const r = await fetch(STATUS_URL + '?t=' + Date.now(), { cache:'no-store' });
    if(!r.ok) throw 0;
    const s = await r.json();
    const state = (s.state || 'running').toLowerCase();
    document.body.dataset.state = LABEL[state] ? state : 'running';
    document.body.classList.toggle('live', state === 'running');
    document.body.classList.remove('stale');
    $('m-state').textContent = LABEL[state] || state.toUpperCase();
    $('m-headline').textContent = s.headline || '(상태 없음)';
    const cur = s.step?.current ?? 0, tot = s.step?.total ?? 0;
    $('m-bar').style.width = (tot ? Math.round(cur/tot*100) : (state==='done'?100:0)) + '%';
    $('m-step').textContent = tot ? `${cur}/${tot}` : '';
    lastUpdated = s.updatedAt ? new Date(s.updatedAt) : new Date();
  }catch{
    document.body.classList.add('stale');
    $('m-state').textContent = 'OFFLINE';
  }
  rel();
}
function rel(){
  if(!lastUpdated){ $('m-rel').textContent = '—'; return; }
  const s = Math.max(0, Math.round((Date.now()-lastUpdated)/1000));
  $('m-rel').textContent = s<60 ? `${s}초 전` : s<3600 ? `${Math.floor(s/60)}분 전` : `${Math.floor(s/3600)}시간 전`;
}
setInterval(tick, POLL_MS); setInterval(rel, 1000); tick();

// ===== 질문 화면 =====
$('a-target').addEventListener('click', () => {
  const b = $('a-target');
  const next = b.dataset.target === 'model' ? 'session' : 'model';
  b.dataset.target = next;
  b.textContent = '대상: ' + (next === 'model' ? '모델' : '세션');
});

function meta(t, cls=''){ const m = $('a-meta'); m.textContent = t; m.className = 'meta ' + cls; }
let pollTimer = null;

async function send(){
  const q = $('a-input').value.trim();
  if(!q) return;
  const target = $('a-target').dataset.target;
  $('a-answer').textContent = ''; clearInterval(pollTimer);
  meta(target === 'model' ? '생각 중…' : '세션에 전달 중…', 'busy');
  try{
    const r = await fetch(ASK_BACKEND + '/ask', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ question:q, target }),
    });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error || r.status);
    if(target === 'model'){ $('a-answer').textContent = d.answer || '(빈 응답)'; meta('완료','ok'); }
    else { meta('세션 대기 중…','busy'); pollSession(d.id); }
  }catch(e){ meta('오류: ' + e.message); }
}
$('a-send').addEventListener('click', send);

function pollSession(id){
  pollTimer = setInterval(async () => {
    try{
      const r = await fetch(`${ASK_BACKEND}/inbox/${encodeURIComponent(id)}?t=${Date.now()}`);
      if(!r.ok) return;
      const it = await r.json();
      if(it.status === 'answered'){ clearInterval(pollTimer); $('a-answer').textContent = it.answer; meta('세션이 답함','ok'); }
    }catch{}
  }, 3000);
}

// 초기 포커스
refocus();

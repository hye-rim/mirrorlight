'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 거울 빛: 화면·입력·소리. 규칙은 logic.js (LOGIC_ML), 레벨은 levels.js (LEVELS_ML).
const L = LOGIC_ML, LV = LEVELS_ML;
const $ = (id) => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 계속 */ } },
};

let starsSaved = store.get('mlStars', []);        // 레벨별 별 개수 (0 = 아직 못 품)
if (!Array.isArray(starsSaved)) starsSaved = [];
let soundOn = store.get('mlSound', true);
let cur = 0, G = null, size = 360, cell = 40, anim = []; // anim: 돌아가는 중인 거울 { i, t }
let sparks = [], litAt = [], hintIdx = -1, hintT = 0, winT = 0, shownSolve = false;

const totalStars = () => LV.LEVELS.reduce((s, _, i) => s + (starsSaved[i] || 0), 0);
const isOpen = (i) => i === 0 || (starsSaved[i - 1] || 0) > 0;
const saveBest = () => store.set('mlBest', totalStars());

// ---------- 소리 ----------
let audio = null;
function tone(freq, dur, type = 'sine', vol = 0.05, slide = 0, delay = 0) {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audio.currentTime + delay, o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0); if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(audio.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) { /* 소리가 안 나도 게임은 계속 */ }
}
const sfx = {
  turn() { tone(520, 0.07, 'triangle', 0.05, -120); },
  lit(n) { tone(660 + n * 120, 0.18, 'sine', 0.06, 200); },
  unlit() { tone(300, 0.08, 'sine', 0.03, -80); },
  win() { [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.22, 'triangle', 0.06, 0, k * 0.1)); },
  hint() { tone(880, 0.1, 'sine', 0.04); tone(1175, 0.14, 'sine', 0.04, 0, 0.1); },
  no() { tone(180, 0.1, 'square', 0.03); },
};

// ---------- 레벨 ----------
function load(i) {
  cur = Math.max(0, Math.min(LV.LEVELS.length - 1, i));
  G = L.newGame(LV.LEVELS[cur]); L.refresh(G);
  anim = []; sparks = []; litAt = []; hintIdx = -1; shownSolve = false; winT = 0;
  G.lit.forEach((li) => (litAt[li] = 1));
  $('ovWin').classList.add('hidden'); $('msg').textContent = '';
  updateHud(); resize();
}
function updateHud() {
  const w = LV.WORLD_OF[cur];
  $('title').textContent = `${w.world + 1}-${w.no}  ${LV.WORLDS[w.world].name || ''}`.trim();
  $('sub').textContent = `${G.moves}번 돌림 · 최소 ${G.par}번 · 수정 ${G.lit.length}/${G.level.targets.length}`;
  $('btnUndo').disabled = !G.history.length || G.solved;
  $('btnReset').disabled = !G.moves && !G.solved;
  $('btnHint').disabled = G.solved;
}

// ---------- 그리기 ----------
function resize() {
  const wrap = $('boardWrap'), W = wrap.clientWidth, H = wrap.clientHeight;
  size = Math.max(200, Math.floor(Math.min(W, H, 560)));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.style.width = size + 'px'; cv.style.height = size + 'px';
  cv.width = Math.floor(size * dpr); cv.height = Math.floor(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cell = size / G.level.w; draw();
}
const cx = (x) => (x + 0.5) * cell;
const ease = (t) => 1 - Math.pow(1 - t, 3);
const angleOf = (o) => (o === 0 ? -Math.PI / 4 : Math.PI / 4);      // '/' 와 '\' 의 기울기

function drawMirror(x, y, o, kind, glow) {
  const c = cell, px = cx(x), py = cx(y), r = c * 0.36, a = angleOf(o);
  ctx.save(); ctx.translate(px, py); ctx.rotate(a);
  if (kind === 'fixed') { ctx.strokeStyle = '#8a97b5'; ctx.lineWidth = Math.max(4, c * 0.14); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke(); ctx.fillStyle = '#c9d3ea'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r, 0, c * 0.06, 0, 7); ctx.fill(); } }
  else {
    ctx.shadowColor = kind === 'p' ? '#c58bff' : '#6fe6ff'; ctx.shadowBlur = glow ? c * 0.4 : c * 0.18;
    ctx.strokeStyle = kind === 'p' ? '#d9b3ff' : '#bff4ff'; ctx.lineWidth = Math.max(4, c * 0.12); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
    if (kind === 'p') { ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(217,179,255,.45)'; ctx.lineWidth = Math.max(2, c * 0.05); ctx.setLineDash([c * 0.07, c * 0.07]); ctx.beginPath(); ctx.moveTo(-r, c * 0.12); ctx.lineTo(r, c * 0.12); ctx.stroke(); ctx.setLineDash([]); }
  }
  ctx.restore();
}

function draw() {
  if (!G) return;
  const lv = G.level, n = lv.w, c = cell;
  ctx.clearRect(0, 0, size, size);
  const bg = ctx.createLinearGradient(0, 0, size, size); bg.addColorStop(0, '#0d1530'); bg.addColorStop(1, '#0a1022');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(120,150,220,.12)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let k = 1; k < n; k++) { ctx.moveTo(k * c, 0); ctx.lineTo(k * c, size); ctx.moveTo(0, k * c); ctx.lineTo(size, k * c); } ctx.stroke();

  // 벽
  for (const [x, y] of lv.walls) { ctx.fillStyle = '#1e2740'; ctx.fillRect(x * c + 2, y * c + 2, c - 4, c - 4); ctx.strokeStyle = '#3a4772'; ctx.lineWidth = 2; ctx.strokeRect(x * c + 3, y * c + 3, c - 6, c - 6); ctx.beginPath(); ctx.moveTo(x * c + 6, y * c + 6); ctx.lineTo(x * c + c - 6, y * c + c - 6); ctx.moveTo(x * c + c - 6, y * c + 6); ctx.lineTo(x * c + 6, y * c + c - 6); ctx.strokeStyle = 'rgba(90,110,170,.45)'; ctx.stroke(); }

  // 빛
  const r = L.trace(lv, currentAngles());
  const col = G.solved ? '#fff3b0' : '#ff5a6a';
  for (const pass of [0, 1]) {
    ctx.lineCap = 'round';
    for (const s of r.segs) {
      ctx.beginPath(); ctx.moveTo(cx(s[0]), cx(s[1])); ctx.lineTo(cx(s[2]), cx(s[3]));
      if (pass === 0) { ctx.strokeStyle = G.solved ? 'rgba(255,230,120,.28)' : 'rgba(255,70,90,.25)'; ctx.lineWidth = c * 0.3; }
      else { ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, c * 0.08); ctx.shadowColor = col; ctx.shadowBlur = c * 0.25; }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
  }

  // 레이저 발사기
  { const s = lv.src, px = cx(s.x), py = cx(s.y), a = Math.atan2(s.dy, s.dx);
    ctx.save(); ctx.translate(px, py); ctx.rotate(a);
    ctx.fillStyle = '#2a3560'; ctx.strokeStyle = '#7f95d8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-c * 0.34, -c * 0.3, c * 0.68, c * 0.6, c * 0.12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff5a6a'; ctx.shadowColor = '#ff5a6a'; ctx.shadowBlur = c * 0.3; ctx.beginPath(); ctx.arc(c * 0.18, 0, c * 0.11, 0, 7); ctx.fill(); ctx.restore(); }

  // 거울
  for (const f of lv.fixed) drawMirror(f.x, f.y, f.o, 'fixed');
  lv.rot.forEach((m, i) => {
    const a = anim.find((q) => q.i === i);
    let o = G.state[i]; ctx.save();
    if (a) { const t = ease(Math.min(1, a.t)); const from = angleOf(1 - o), to = angleOf(o); const ang = from + (to - from) * t; ctx.translate(cx(m.x), cx(m.y)); ctx.rotate(ang - angleOf(o)); ctx.translate(-cx(m.x), -cx(m.y)); }
    // 받침
    ctx.restore(); ctx.save();
    ctx.fillStyle = 'rgba(111,230,255,.10)'; ctx.strokeStyle = hintIdx === i ? '#ffe08a' : 'rgba(111,230,255,.35)'; ctx.lineWidth = hintIdx === i ? 3 : 1.5;
    if (hintIdx === i) { ctx.shadowColor = '#ffe08a'; ctx.shadowBlur = c * 0.35 * (0.6 + 0.4 * Math.sin(hintT * 6)); }
    ctx.beginPath(); ctx.arc(cx(m.x), cx(m.y), c * 0.42, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.save();
    if (a) { const t = ease(Math.min(1, a.t)); const from = angleOf(1 - o), to = angleOf(o); ctx.translate(cx(m.x), cx(m.y)); ctx.rotate((from + (to - from) * t) - angleOf(o)); ctx.translate(-cx(m.x), -cx(m.y)); }
    drawMirror(m.x, m.y, o, m.kind, true); ctx.restore();
  });

  // 수정
  lv.targets.forEach(([x, y], i) => {
    const on = G.lit.includes(i), px = cx(x), py = cx(y), k = on ? 1 : 0, pul = on ? 1 + 0.08 * Math.sin(winT * 8 + i) : 1;
    ctx.save(); ctx.translate(px, py); ctx.scale(pul, pul);
    if (on) { ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = c * 0.6; }
    ctx.fillStyle = on ? '#ffe27a' : '#26304f'; ctx.strokeStyle = on ? '#fff6c8' : '#6f82bf'; ctx.lineWidth = 2.5;
    ctx.beginPath(); const R = c * 0.3; for (let q = 0; q < 6; q++) { const aa = (Math.PI / 3) * q - Math.PI / 2; ctx[q ? 'lineTo' : 'moveTo'](Math.cos(aa) * R, Math.sin(aa) * R * 1.1); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = on ? 'rgba(255,255,255,.8)' : 'rgba(160,180,240,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-R * 0.35, -R * 0.1); ctx.lineTo(0, -R * 0.55); ctx.lineTo(R * 0.35, -R * 0.1); ctx.stroke();
    ctx.restore(); void k;
  });

  // 반짝이
  for (const s of sparks) { ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.life, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
}
// 돌리는 중에도 규칙 판정은 이미 끝난 상태. 그림은 G.state 그대로
function currentAngles() { return G.state; }

function burst(x, y, color, n) { for (let k = 0; k < n; k++) { const a = Math.random() * 6.283, v = 40 + Math.random() * 120; sparks.push({ x: cx(x), y: cx(y), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, r: 2 + Math.random() * 3, color }); } }

// ---------- 입력 ----------
function tapAt(px, py) {
  if (!G || G.solved || isOverlayOpen()) return;
  const x = Math.floor(px / cell), y = Math.floor(py / cell);
  if (x < 0 || y < 0 || x >= G.level.w || y >= G.level.h) return;
  const i = G.level.rot.findIndex((m) => m.x === x && m.y === y);
  if (i < 0) { sfx.no(); return; }
  doFlip(i);
}
function doFlip(i) {
  if (!L.flip(G, i)) return;
  hintIdx = -1; anim.push({ i, t: 0 });
  sfx.turn(); tutorialSignal('rotate');
  let nl = 0;
  for (const e of G.events) {
    if (e.t === 'lit') { litAt[e.i] = 1; sfx.lit(nl++); const [tx, ty] = G.level.targets[e.i]; burst(tx, ty, '#ffe27a', 14); tutorialSignal('lit'); }
    else if (e.t === 'unlit') { sfx.unlit(); litAt[e.i] = 0; }
    else if (e.t === 'solved') onSolved(e);
  }
  updateHud();
}
function onSolved(e) {
  const prev = starsSaved[cur] || 0;
  if (e.stars > prev) { starsSaved[cur] = e.stars; store.set('mlStars', starsSaved); }
  saveBest(); shownSolve = true;
  setTimeout(() => { sfx.win(); }, 150);
  tutorialSignal('solved');
  setTimeout(showWin, 900);
}
function showWin() {
  if (!G || !G.solved) return;
  const s = G.stars;
  $('stars').textContent = '★'.repeat(s) + '☆'.repeat(3 - s);
  $('winTitle').textContent = s === 3 ? '완벽해요!' : '해결!';
  $('winText').innerHTML = `<b>${G.moves}번</b> 돌려서 풀었어요 (최소 ${G.par}번)` + (G.hinted ? '<br>힌트를 써서 별은 최대 2개예요.' : '') + (s < 3 && !G.hinted ? '<br>더 적게 돌리면 별 3개!' : '');
  const last = cur >= LV.LEVELS.length - 1;
  $('btnNext').textContent = last ? '처음 레벨로' : '다음 레벨';
  $('ovWin').classList.remove('hidden');
}
const isOverlayOpen = () => ['ovStart', 'ovLevels', 'ovWin'].some((id) => !$(id).classList.contains('hidden'));

cv.addEventListener('pointerdown', (e) => { const r = cv.getBoundingClientRect(); tapAt((e.clientX - r.left) * (size / r.width), (e.clientY - r.top) * (size / r.height)); e.preventDefault(); });

$('btnUndo').onclick = () => { if (L.undo(G)) { sfx.turn(); const i = G.events[0].i; anim.push({ i, t: 0 }); G.lit.forEach((li) => (litAt[li] = 1)); updateHud(); tutorialSignal('undo'); } };
$('btnReset').onclick = () => { load(cur); tutorialSignal('reset'); };
$('btnHint').onclick = () => {
  if (G.solved) return;
  const i = L.hint(G); if (i < 0) return;
  hintIdx = i; hintT = 0; sfx.hint(); $('msg').textContent = '💡 반짝이는 거울을 눌러 보세요 (별은 최대 2개)'; tutorialSignal('hint');
};
$('btnSound').onclick = () => { soundOn = !soundOn; store.set('mlSound', soundOn); $('btnSound').textContent = soundOn ? '🔊' : '🔇'; if (soundOn) sfx.turn(); };
$('btnPlay').onclick = () => { $('ovStart').classList.add('hidden'); const first = LV.LEVELS.findIndex((_, i) => !(starsSaved[i] > 0)); load(first < 0 ? 0 : first); openLevels(); tutorialSignal('start'); };
$('btnMenu').onclick = () => openLevels();
$('btnCloseLevels').onclick = () => $('ovLevels').classList.add('hidden');
$('btnWinMenu').onclick = () => { $('ovWin').classList.add('hidden'); openLevels(); };
$('btnAgain').onclick = () => { load(cur); };
$('btnNext').onclick = () => { load(cur >= LV.LEVELS.length - 1 ? 0 : cur + 1); };
window.addEventListener('keydown', (e) => { if (e.key === 'z' || e.key === 'Z') $('btnUndo').click(); else if (e.key === 'r' || e.key === 'R') $('btnReset').click(); else if (e.key === 'h' || e.key === 'H') $('btnHint').click(); });

function openLevels() {
  const box = $('worlds'); box.innerHTML = '';
  LV.WORLDS.forEach((w, wi) => {
    const sec = document.createElement('div'); const h = document.createElement('h3'); h.textContent = `세계 ${wi + 1}${w.name ? ' · ' + w.name : ''}`; sec.appendChild(h);
    const g = document.createElement('div'); g.className = 'grid';
    LV.WORLD_OF.forEach((o, i) => {
      if (o.world !== wi) return;
      const b = document.createElement('button'); b.className = 'lv' + (isOpen(i) ? '' : ' locked') + (i === cur ? ' cur' : ''); b.setAttribute('data-level', i);
      const s = starsSaved[i] || 0; b.innerHTML = `${o.no}<small>${isOpen(i) ? '★'.repeat(s) + '☆'.repeat(3 - s) : '🔒'}</small>`;
      b.onclick = () => { if (!isOpen(i)) return; $('ovLevels').classList.add('hidden'); load(i); tutorialSignal('pick'); };
      g.appendChild(b);
    });
    sec.appendChild(g); box.appendChild(sec);
  });
  $('totalStars').innerHTML = `모은 별 <b>${totalStars()}</b> / ${LV.LEVELS.length * 3}`;
  $('ovLevels').classList.remove('hidden');
}

// ---------- 반복 ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); requestAnimationFrame(frame);
}
function step(dt) {
  if (!G) return;
  for (const a of anim) a.t += dt / 0.18; anim = anim.filter((a) => a.t < 1);
  for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 90 * dt; s.life -= dt * 1.4; } sparks = sparks.filter((s) => s.life > 0);
  hintT += dt; winT += dt; draw();
}
window.addEventListener('resize', () => G && resize());
$('btnSound').textContent = soundOn ? '🔊' : '🔇';
G = L.newGame(LV.LEVELS[0]); L.refresh(G); updateHud(); resize();
requestAnimationFrame(frame);

/* @test-hooks:start */
window.__ml = { get G() { return G; }, load, get cur() { return cur; }, step, tapAt, get cell() { return cell; }, get stars() { return starsSaved; } };
/* @test-hooks:end */

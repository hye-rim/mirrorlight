'use strict';
// 거울 빛 규칙 (DOM 없음). 화면은 game.js, 레벨은 levels.js, 시험은 test/logic.test.js
// 레이저가 나오는 곳에서 빛이 한 줄로 나아가고, 거울에 닿으면 꺾인다. 거울을 눌러 방향을 바꿔서 모든 수정에 빛이 닿게 한다.
// 거울은 '/' (0) 와 '\' (1) 두 방향뿐이라 누를 때마다 바뀐다. 분할기는 빛을 곧게 보내면서 동시에 꺾어서도 보낸다.
const LOGIC_ML = (() => {
  // (dx, dy) 로 오던 빛이 거울을 만나면: '/' 는 오른쪽→위, 위→오른쪽, 왼쪽→아래, 아래→왼쪽 / '\' 는 오른쪽→아래, 아래→오른쪽, 왼쪽→위, 위→왼쪽
  const reflect = (o, dx, dy) => (o === 0 ? [0 - dy, 0 - dx] : [0 + dy, 0 + dx]);
  const ORIENT = ['/', '\\'];
  const MAX_ROT = 18;

  // 레벨 모양: { w, h, src:{x,y,dx,dy}, walls:[[x,y]], fixed:[{x,y,o}], rot:[{x,y,kind:'m'|'p'}], targets:[[x,y]], start:[0/1...], solution?, par? }
  // 칸 찾기 표: 한 번만 만든다
  const cache = new WeakMap();
  function prep(level) {
    if (cache.has(level)) return cache.get(level);
    const m = new Map(); const key = (x, y) => y * 100 + x;
    for (const [x, y] of level.walls) m.set(key(x, y), { t: 'wall' });
    level.fixed.forEach((f) => m.set(key(f.x, f.y), { t: 'fixed', o: f.o }));
    level.rot.forEach((r, i) => m.set(key(r.x, r.y), { t: r.kind === 'p' ? 'split' : 'mirror', i }));
    level.targets.forEach(([x, y], i) => m.set(key(x, y), { t: 'target', i }));
    m.set(key(level.src.x, level.src.y), { t: 'source' });
    const p = { m, key };
    cache.set(level, p);
    return p;
  }
  // 빛을 따라가 본다. state[i] 는 i 번째 돌릴 수 있는 거울의 방향.
  // 돌려주는 것: { segs: 빛이 지나간 선분들 [x0,y0,x1,y1,끝난 이유](칸 가운데 좌표), lit: 빛이 닿은 수정 번호 목록(오름차순), all: 모두 닿았나 }
  function trace(level, state) {
    const { m, key } = prep(level);
    const segs = [], lit = new Set(), seen = new Set(), q = [{ x: level.src.x, y: level.src.y, dx: level.src.dx, dy: level.src.dy }];
    while (q.length) {
      let { x, y, dx, dy } = q.pop(); let sx = x, sy = y;
      for (let guard = 0; guard < 500; guard++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= level.w || ny >= level.h) { segs.push([sx, sy, x + dx * 0.5, y + dy * 0.5, 'edge']); break; }
        const c = m.get(key(nx, ny));
        if (c && c.t === 'wall') { segs.push([sx, sy, x + dx * 0.5, y + dy * 0.5, 'wall']); break; }
        x = nx; y = ny;
        if (c && c.t === 'source') { segs.push([sx, sy, x, y, 'source']); break; }
        if (c && c.t === 'target') { lit.add(c.i); segs.push([sx, sy, x, y, 'target']); break; }
        const k = x + ',' + y + ',' + dx + ',' + dy;
        if (seen.has(k)) { segs.push([sx, sy, x, y, 'loop']); break; }                           // 빙글빙글 도는 길은 한 바퀴만
        seen.add(k);
        if (c && (c.t === 'mirror' || c.t === 'fixed' || c.t === 'split')) {
          const o = c.t === 'fixed' ? c.o : state[c.i];
          const [rx, ry] = reflect(o, dx, dy);
          segs.push([sx, sy, x, y, 'mirror']);
          if (c.t === 'split') q.push({ x, y, dx, dy });                                           // 분할기: 곧게 가는 빛은 따로 이어 간다
          dx = rx; dy = ry; sx = x; sy = y;
        }
      }
    }
    const litArr = [...lit].sort((a, b) => a - b);
    return { segs, lit: litArr, all: litArr.length === level.targets.length };
  }
  const solved = (level, state) => trace(level, state).all;

  // 모든 방향 조합을 해 보고, 처음 모양에서 가장 적게 바꿔서 푸는 방법을 찾는다 (돌릴 수 있는 거울은 MAX_ROT 개까지)
  function solve(level) {
    const n = level.rot.length;
    if (n > MAX_ROT) return null;
    let best = null, count = 0;
    for (let mask = 0; mask < (1 << n); mask++) {
      const st = new Array(n); for (let i = 0; i < n; i++) st[i] = (mask >> i) & 1;
      if (!solved(level, st)) continue;
      count++;
      let d = 0; for (let i = 0; i < n; i++) if (st[i] !== level.start[i]) d++;
      if (!best || d < best.flips) best = { state: st, flips: d };
    }
    return best ? { state: best.state, flips: best.flips, solutions: count } : { state: null, flips: -1, solutions: 0 };
  }

  // ---------- 게임 ----------
  function newGame(level) {
    return { level, state: level.start.slice(), moves: 0, history: [], solved: false, hinted: false, events: [], lit: [] , par: level.par };
  }
  function refresh(st) { const r = trace(st.level, st.state); st.lit = r.lit; return r; }
  function flip(st, i) {
    st.events = [];
    if (i < 0 || i >= st.state.length || st.solved) return false;
    const before = new Set(trace(st.level, st.state).lit);
    st.state[i] ^= 1; st.history.push(i); st.moves = st.history.length;
    st.events.push({ t: 'flip', i });
    const r = refresh(st);
    for (const li of r.lit) if (!before.has(li)) st.events.push({ t: 'lit', i: li });
    for (const li of before) if (!r.lit.includes(li)) st.events.push({ t: 'unlit', i: li });
    if (r.all) { st.solved = true; st.stars = stars(st); st.events.push({ t: 'solved', stars: st.stars, moves: st.moves }); }
    return true;
  }
  function flipAt(st, x, y) { const i = st.level.rot.findIndex((r) => r.x === x && r.y === y); return i >= 0 ? flip(st, i) : false; }
  function undo(st) {
    st.events = [];
    if (!st.history.length || st.solved) return false;
    const i = st.history.pop(); st.state[i] ^= 1; st.moves = st.history.length; refresh(st); st.events.push({ t: 'undo', i }); return true;
  }
  function reset(st) { st.state = st.level.start.slice(); st.history = []; st.moves = 0; st.solved = false; st.events = []; refresh(st); }
  // 힌트: 가장 가까운 풀이 쪽으로 가려면 눌러야 하는 거울 하나. 쓰면 별이 최대 2개
  function hint(st) {
    if (st.solved) return -1;
    const sol = solveFrom(st.level, st.state);
    if (!sol || !sol.state) return -1;
    st.hinted = true;
    for (let i = 0; i < sol.state.length; i++) if (sol.state[i] !== st.state[i]) return i;
    return -1;
  }
  // 지금 모양에서 가장 적게 바꿔서 푸는 풀이
  function solveFrom(level, cur) {
    const n = level.rot.length; let best = null;
    for (let mask = 0; mask < (1 << n); mask++) {
      const s = new Array(n); for (let i = 0; i < n; i++) s[i] = (mask >> i) & 1;
      if (!solved(level, s)) continue;
      let d = 0; for (let i = 0; i < n; i++) if (s[i] !== cur[i]) d++;
      if (!best || d < best.flips) best = { state: s, flips: d };
    }
    return best;
  }
  // 별: 가장 적게 바꾼 횟수(par) 이하면 3개, 2번까지 더 써도 2개, 그 밖에는 1개. 힌트를 썼으면 최대 2개
  function stars(st) { const over = st.moves - st.par; let s = over <= 0 ? 3 : over <= 2 ? 2 : 1; if (st.hinted) s = Math.min(s, 2); return s; }

  return { reflect, ORIENT, MAX_ROT, prep, trace, solved, solve, solveFrom, newGame, flip, flipAt, undo, reset, hint, stars, refresh };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_ML;

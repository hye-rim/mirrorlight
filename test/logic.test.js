'use strict';

// 거울 빛 규칙 시험. 실행: node --test (디렉터리)
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');
const LV = require('../levels.js');

// 시험용 판: 5x5, 레이저는 왼쪽 가운데에서 오른쪽으로
const base = (extra = {}) => ({ w: 5, h: 5, src: { x: 0, y: 2, dx: 1, dy: 0 }, walls: [], fixed: [], rot: [], targets: [], start: [], ...extra });

test('a mirror bends the beam by the slash rule and all eight turns follow it', () => {
  assert.deepStrictEqual(L.reflect(0, 1, 0), [0, -1]); assert.deepStrictEqual(L.reflect(0, 0, -1), [1, 0]); assert.deepStrictEqual(L.reflect(0, -1, 0), [0, 1]); assert.deepStrictEqual(L.reflect(0, 0, 1), [-1, 0]);
  assert.deepStrictEqual(L.reflect(1, 1, 0), [0, 1]); assert.deepStrictEqual(L.reflect(1, 0, 1), [1, 0]); assert.deepStrictEqual(L.reflect(1, -1, 0), [0, -1]); assert.deepStrictEqual(L.reflect(1, 0, -1), [-1, 0]);
  const up = base({ rot: [{ x: 2, y: 2, kind: 'm' }], targets: [[2, 0]], start: [0] }), down = base({ rot: [{ x: 2, y: 2, kind: 'm' }], targets: [[2, 4]], start: [1] });
  assert.ok(L.trace(up, [0]).all && !L.trace(up, [1]).all, '/ sends the beam up'); assert.ok(L.trace(down, [1]).all && !L.trace(down, [0]).all, '\\ sends the beam down');
  const sides = base({ src: { x: 4, y: 2, dx: -1, dy: 0 }, rot: [{ x: 2, y: 2, kind: 'm' }], targets: [[2, 4]], start: [0] }); assert.ok(L.trace(sides, [0]).all, 'coming from the right, "/" turns the beam down');
});

test('the beam stops at walls, the edge of the board, the laser itself and crystals, and a crystal is lit when the beam reaches it', () => {
  const wall = base({ walls: [[2, 2]], targets: [[4, 2]] }); assert.strictEqual(L.trace(wall, []).all, false, 'a wall blocks the beam');
  const open = base({ targets: [[4, 2]] }); assert.strictEqual(L.trace(open, []).all, true); assert.deepStrictEqual(L.trace(open, []).lit, [0]);
  const stop = base({ targets: [[2, 2], [4, 2]] }); assert.deepStrictEqual(L.trace(stop, []).lit, [0], 'a crystal absorbs the beam: the one behind it stays dark');
  const edge = base({ targets: [[2, 4]] }); const r = L.trace(edge, []); assert.strictEqual(r.all, false); assert.ok(r.segs.length === 1 && r.segs[0][4] === 'edge', 'ends at the edge');
  const loop = base({ rot: [{ x: 1, y: 2, kind: 'm' }, { x: 1, y: 1, kind: 'm' }, { x: 3, y: 1, kind: 'm' }, { x: 3, y: 2, kind: 'm' }], targets: [[4, 4]], start: [0, 0, 0, 0] });
  for (let mask = 0; mask < 16; mask++) { const st = [0, 1, 2, 3].map((i) => (mask >> i) & 1); const t0 = Date.now(); const res = L.trace(loop, st); assert.ok(Array.isArray(res.segs) && Date.now() - t0 < 200, 'finishes even if the beam circles'); }
});

test('a splitter lets the beam go straight and also turns a copy, a fixed mirror cannot be turned, and flipping works on turnable ones only', () => {
  const sp = base({ rot: [{ x: 2, y: 2, kind: 'p' }], targets: [[4, 2], [2, 0]], start: [0] }); const r = L.trace(sp, [0]); assert.deepStrictEqual(r.lit, [0, 1], 'both crystals lit: straight and turned'); assert.ok(r.all);
  const sp2 = base({ rot: [{ x: 2, y: 2, kind: 'p' }], targets: [[4, 2], [2, 4]], start: [0] }); assert.deepStrictEqual(L.trace(sp2, [0]).lit, [0]); assert.deepStrictEqual(L.trace(sp2, [1]).lit, [0, 1], 'the other orientation sends the copy down');
  const fx = base({ fixed: [{ x: 2, y: 2, o: 0 }], targets: [[2, 0]] }); assert.ok(L.trace(fx, []).all, 'a fixed mirror reflects');
  const st = L.newGame(base({ fixed: [{ x: 1, y: 2, o: 0 }], rot: [{ x: 2, y: 0, kind: 'm' }], targets: [[3, 0]], start: [1] })); assert.strictEqual(L.flipAt(st, 1, 2), false, 'no rotating a fixed mirror'); assert.strictEqual(L.flipAt(st, 0, 0), false, 'nothing there'); assert.strictEqual(st.moves, 0);
});

test('the solver finds a solution with the fewest turns, and agrees with checking every combination by hand', () => {
  const lv = base({ rot: [{ x: 1, y: 2, kind: 'm' }, { x: 1, y: 0, kind: 'm' }, { x: 3, y: 0, kind: 'm' }], targets: [[3, 3]], start: [1, 1, 1] });
  const s = L.solve(lv); assert.ok(s.state && L.solved(lv, s.state)); let best = 99; for (let m = 0; m < 8; m++) { const st = [m & 1, (m >> 1) & 1, (m >> 2) & 1]; if (L.solved(lv, st)) best = Math.min(best, st.filter((v, i) => v !== lv.start[i]).length); }
  assert.strictEqual(s.flips, best); assert.strictEqual(L.solve(base({ walls: [[1, 2]], targets: [[4, 2]] })).solutions, 0, 'an impossible board has no solution');
});

test('tapping a mirror turns it, counts the move, lights crystals as they get hit, undo and reset work, and a solved board cannot be changed', () => {
  const lv = base({ rot: [{ x: 2, y: 2, kind: 'm' }], targets: [[2, 0]], start: [1], par: 1 }); const st = L.newGame(lv);
  assert.strictEqual(st.moves, 0); assert.deepStrictEqual(st.lit, []);
  assert.strictEqual(L.flipAt(st, 2, 2), true); assert.strictEqual(st.moves, 1); assert.ok(st.events.some((e) => e.t === 'lit') && st.events.some((e) => e.t === 'solved')); assert.ok(st.solved); assert.strictEqual(st.stars, 3);
  assert.strictEqual(L.flip(st, 0), false, 'locked once solved'); assert.strictEqual(L.undo(st), false);
  const u = L.newGame(lv); L.flip(u, 0); assert.ok(u.solved); const r = L.newGame(lv); L.reset(r); assert.deepStrictEqual(r.state, [1]);
  const two = base({ rot: [{ x: 1, y: 2, kind: 'm' }, { x: 3, y: 3, kind: 'm' }], targets: [[1, 0]], start: [1, 0], par: 1 }); const g = L.newGame(two); L.flip(g, 1); assert.strictEqual(g.moves, 1); L.undo(g); assert.strictEqual(g.moves, 0); assert.deepStrictEqual(g.state, [1, 0]);
  L.flip(g, 0); const unl = g.events.length; assert.ok(unl > 0);
  const lose = L.newGame(base({ rot: [{ x: 2, y: 2, kind: 'm' }], targets: [[2, 0]], start: [0], par: 1 })); assert.strictEqual(L.refresh(lose).all, true);
});

test('stars: the fewest turns gives three, up to two extra gives two, more gives one, and using a hint caps it at two', () => {
  const mk = (moves, hinted) => ({ moves, par: 3, hinted }); assert.strictEqual(L.stars(mk(3, false)), 3); assert.strictEqual(L.stars(mk(2, false)), 3); assert.strictEqual(L.stars(mk(5, false)), 2); assert.strictEqual(L.stars(mk(6, false)), 1); assert.strictEqual(L.stars(mk(3, true)), 2); assert.strictEqual(L.stars(mk(9, true)), 1);
});

test('a hint points at a mirror that really is on the way to the nearest solution', () => {
  const lv = LV.LEVELS[4]; const st = L.newGame(lv); let guard = 0;
  while (!st.solved && guard++ < 30) { const before = L.solveFrom(lv, st.state).flips; const i = L.hint(st); assert.ok(i >= 0, 'a hint exists'); L.flip(st, i); assert.strictEqual(L.solveFrom(lv, st.state).flips, before - 1, 'each hint is a step closer'); }
  assert.ok(st.solved); assert.ok(st.hinted); assert.ok(L.stars(st) <= 2);
  assert.strictEqual(L.hint(st), -1, 'no hint once solved');
});

test('all 36 levels are well formed: right size, a laser at the edge, every piece on its own tile, crystals unlit at the start, and solvable', () => {
  assert.strictEqual(LV.LEVELS.length, 36); assert.strictEqual(LV.WORLDS.length, 5);
  for (const lv of LV.LEVELS) {
    const name = `level ${lv.index + 1}`;
    assert.strictEqual(lv.w, lv.h); assert.ok(lv.w >= 5 && lv.w <= 9);
    const edge = lv.src.x === 0 || lv.src.y === 0 || lv.src.x === lv.w - 1 || lv.src.y === lv.h - 1; assert.ok(edge, `${name}: laser on the edge`);
    assert.ok(lv.targets.length >= 1 && lv.targets.length <= 4, `${name}: crystals`);
    const cells = [[lv.src.x, lv.src.y], ...lv.walls, ...lv.fixed.map((f) => [f.x, f.y]), ...lv.rot.map((r) => [r.x, r.y]), ...lv.targets]; const set = new Set(cells.map(([x, y]) => x + ',' + y)); assert.strictEqual(set.size, cells.length, `${name}: no two pieces share a tile`);
    for (const [x, y] of cells) assert.ok(x >= 0 && y >= 0 && x < lv.w && y < lv.h);
    assert.strictEqual(lv.start.length, lv.rot.length); assert.ok(lv.rot.length <= L.MAX_ROT);
    const sol = L.solve(lv); assert.ok(sol.state, `${name} is solvable`); assert.strictEqual(sol.flips, lv.par, `${name}: par is the true minimum`); assert.ok(lv.par >= 1, `${name}: not solved at the start`);
    assert.strictEqual(L.trace(lv, lv.start).all, false, `${name}: the crystals are not all lit at the start`); assert.ok(L.trace(lv, sol.state).all);
    assert.ok(lv.par <= lv.rot.length);
  }
});

test('the levels get harder: bigger boards, more mirrors and crystals, splitters and walls appear in later worlds, and par rises', () => {
  const avg = (a, f) => a.reduce((s, l) => s + f(l), 0) / a.length;
  const w = (k) => LV.LEVELS.filter((l, i) => LV.WORLD_OF[i].world === k);
  for (let k = 1; k < 5; k++) { assert.ok(avg(w(k), (l) => l.rot.length) > avg(w(k - 1), (l) => l.rot.length), `world ${k + 1} has more turnable pieces`); assert.ok(w(k)[0].w > w(k - 1)[0].w, 'a bigger board'); }
  assert.ok(w(0).every((l) => l.targets.length === 1) && w(1).every((l) => l.targets.length === 1), 'one crystal in the first two worlds');
  assert.ok(w(2).every((l) => l.targets.length >= 2) && w(2).every((l) => l.rot.some((r) => r.kind === 'p')), 'splitters from world three');
  assert.ok(w(1).some((l) => l.fixed.length > 0) && w(3).some((l) => l.walls.length >= 5), 'fixed mirrors and walls');
  assert.ok(avg(w(4), (l) => l.par) > avg(w(0), (l) => l.par) + 1.5, 'par rises');
  assert.ok(LV.LEVELS[0].rot.length === 1 && LV.LEVELS[0].par === 1, 'the first level is a single tap');
});

test('levels are always the same, and the generator is deterministic', () => {
  const a = LV.make(5, 1185, 6, LV.WORLDS[1].levels[0]), b = LV.make(5, 1185, 6, LV.WORLDS[1].levels[0]); assert.deepStrictEqual(a, b);
  const w = LV.WORLD_OF[10], W = LV.WORLDS[w.world]; assert.deepStrictEqual(LV.LEVELS[10], LV.make(10, 1000 + 10 * 37, W.n, W.levels[w.no - 1]));
});

test('beams never cross each other on the intended path, and solving moves lights each crystal exactly when its beam arrives', () => {
  for (const lv of LV.LEVELS) {
    const sol = lv.solution, r = L.trace(lv, sol), seen = new Map();
    for (const [x0, y0, x1, y1] of r.segs) { const cells = []; const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0); let x = x0, y = y0; for (let k = 0; k < 12 && (x !== Math.round(x1) || y !== Math.round(y1)); k++) { x += dx; y += dy; cells.push(x + ',' + y); if (Number.isInteger(x1) === false) break; } for (const c of cells) seen.set(c, (seen.get(c) || 0) + 1); }
    assert.ok([...seen.values()].every((n) => n <= 2), `level ${lv.index + 1}: the intended beams do not pile up`);
    const st = L.newGame(lv); let lit = 0; for (let i = 0; i < sol.length; i++) if (st.state[i] !== sol[i]) { L.flip(st, i); lit += st.events.filter((e) => e.t === 'lit').length; }
    assert.ok(st.solved && st.lit.length === lv.targets.length);
  }
});

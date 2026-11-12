'use strict';
// 거울 빛의 레벨 36개(세계 5개). 레벨은 고정된 난수(시드)로 만들어서 언제나 같다.
// 만드는 법: 레이저에서 시작해 빛이 갈 길을 먼저 그리고(곧게 가다가 거울에서 꺾이다가 수정에서 끝난다), 그 길의 거울 방향을 일부러 흐트러뜨린다.
// 그래서 모든 레벨은 풀 수 있다. 길 밖에는 길을 어지럽히는 가짜 거울과 벽을 놓는다. 분할기가 있으면 길이 둘로 갈라지고 수정도 둘 이상이다.
const LEVELS_ML = (() => {
  const ML = (typeof module !== 'undefined' && module.exports) ? require('./logic.js') : LOGIC_ML;
  const rng = (seed) => {                                    // mulberry32
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const WORLDS = [
    { name: '빛의 시작', n: 5, levels: [{ m: 1 }, { m: 2 }, { m: 2, decoy: 1 }, { m: 3 }, { m: 3, decoy: 1, wall: 1 }, { m: 3, decoy: 2, wall: 1 }] },
    { name: '거울 숲', n: 6, levels: [{ m: 3, decoy: 1, wall: 1 }, { m: 4, decoy: 1, wall: 1 }, { m: 4, decoy: 2, wall: 2 }, { m: 4, decoy: 2, fixed: 1, wall: 2 }, { m: 5, decoy: 2, wall: 2 }, { m: 5, decoy: 3, fixed: 1, wall: 2 }, { m: 5, decoy: 3, fixed: 1, wall: 3 }, { m: 6, decoy: 3, fixed: 1, wall: 3 }] },
    { name: '갈라지는 빛', n: 7, levels: [{ m: 3, split: 1, decoy: 1, wall: 2 }, { m: 4, split: 1, decoy: 1, wall: 2 }, { m: 4, split: 1, decoy: 2, wall: 3 }, { m: 5, split: 1, decoy: 2, fixed: 1, wall: 3 }, { m: 5, split: 1, decoy: 3, fixed: 1, wall: 3 }, { m: 6, split: 1, decoy: 3, fixed: 1, wall: 4 }, { m: 6, split: 2, decoy: 2, fixed: 1, wall: 4 }, { m: 7, split: 2, decoy: 2, fixed: 1, wall: 4 }] },
    { name: '거울 미로', n: 8, levels: [{ m: 5, split: 1, decoy: 3, fixed: 1, wall: 5 }, { m: 6, split: 1, decoy: 3, fixed: 1, wall: 5 }, { m: 6, split: 2, decoy: 3, fixed: 2, wall: 5 }, { m: 7, split: 2, decoy: 3, fixed: 2, wall: 6 }, { m: 7, split: 2, decoy: 3, fixed: 2, wall: 6 }, { m: 8, split: 2, decoy: 3, fixed: 2, wall: 6 }, { m: 8, split: 2, decoy: 3, fixed: 2, wall: 7 }, { m: 8, split: 3, decoy: 2, fixed: 2, wall: 7 }] },
    { name: '빛의 궁전', n: 9, levels: [{ m: 7, split: 2, decoy: 3, fixed: 2, wall: 6 }, { m: 8, split: 2, decoy: 3, fixed: 2, wall: 7 }, { m: 8, split: 3, decoy: 3, fixed: 2, wall: 7 }, { m: 9, split: 3, decoy: 3, fixed: 2, wall: 8 }, { m: 9, split: 3, decoy: 3, fixed: 3, wall: 8 }, { m: 10, split: 3, decoy: 2, fixed: 3, wall: 8 }] },
  ];

  function tryGen(r, n, spec) {
    const occ = new Set(), key = (x, y) => y * 100 + x;
    const free = (x, y) => x >= 0 && y >= 0 && x < n && y < n && !occ.has(key(x, y));
    const mirrors = [], splits = [], targets = [];                                // 길 위의 거울·분할기: { x, y, o }
    const side = Math.floor(r() * 4), pos = 1 + Math.floor(r() * (n - 2));
    const src = side === 0 ? { x: 0, y: pos, dx: 1, dy: 0 } : side === 1 ? { x: n - 1, y: pos, dx: -1, dy: 0 } : side === 2 ? { x: pos, y: 0, dx: 0, dy: 1 } : { x: pos, y: n - 1, dx: 0, dy: -1 };
    occ.add(key(src.x, src.y));
    const orient = (dx, dy, ndx, ndy) => (ndx === -dy && ndy === -dx ? 0 : 1);
    function branch(cx, cy, dx, dy, mcount, scount) {
      let x = cx, y = cy;
      for (let m = 0; m <= mcount; m++) {
        const run = 1 + Math.floor(r() * 4); let moved = 0;
        for (let i = 0; i < run; i++) { const nx = x + dx, ny = y + dy; if (!free(nx, ny)) break; x = nx; y = ny; occ.add(key(x, y)); moved++; }
        if (!moved) return false;
        if (m === mcount) { targets.push([x, y]); return true; }
        const turns = r() < 0.5 ? [[-dy, dx], [dy, -dx]] : [[dy, -dx], [-dy, dx]];
        const t = turns.find(([ndx, ndy]) => free(x + ndx, y + ndy));
        if (!t) return false;
        const [ndx, ndy] = t, o = orient(dx, dy, ndx, ndy);
        const left = mcount - m - 1;
        if (scount > 0 && left >= 1 && r() < 0.6) {                               // 분할기: 곧게 가는 길과 꺾이는 길 둘로 갈라진다
          splits.push({ x, y, o });
          const a = Math.floor(left / 2), b = left - a, sa = scount - 1 > 0 ? 1 : 0;
          return branch(x, y, dx, dy, a, sa ? scount - 1 : 0) && branch(x, y, ndx, ndy, b, Math.max(0, scount - 1 - (sa ? 1 : 0)));
        }
        mirrors.push({ x, y, o });
        dx = ndx; dy = ndy;
      }
      return false;
    }
    if (!branch(src.x, src.y, src.dx, src.dy, spec.m, spec.split || 0)) return null;
    if ((spec.split || 0) > 0 && splits.length === 0) return null;
    // 일부 거울은 돌릴 수 없는 고정 거울로
    const fixed = []; const pool = mirrors.slice(); const nf = Math.min(spec.fixed || 0, Math.max(0, pool.length - 2));
    for (let i = 0; i < nf; i++) { const j = Math.floor(r() * pool.length); fixed.push(pool.splice(j, 1)[0]); }
    const rot = [];
    for (const mm of pool) rot.push({ x: mm.x, y: mm.y, kind: 'm', sol: mm.o });
    for (const sp of splits) rot.push({ x: sp.x, y: sp.y, kind: 'p', sol: sp.o });
    // 길 밖: 가짜 거울과 벽
    const freeCells = []; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (free(x, y)) freeCells.push([x, y]);
    for (let i = freeCells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [freeCells[i], freeCells[j]] = [freeCells[j], freeCells[i]]; }
    const walls = [], decoys = [];
    for (let i = 0; i < (spec.decoy || 0) && freeCells.length; i++) { const [x, y] = freeCells.pop(); decoys.push({ x, y, kind: 'm', sol: 0 }); }
    for (let i = 0; i < (spec.wall || 0) && freeCells.length; i++) { const [x, y] = freeCells.pop(); walls.push([x, y]); }
    const all = rot.concat(decoys);
    const start = all.map((q) => (decoys.includes(q) ? (r() < 0.5 ? 0 : 1) : (r() < 0.5 ? q.sol : 1 - q.sol)));
    return { w: n, h: n, src, walls, fixed: fixed.map((f) => ({ x: f.x, y: f.y, o: f.o })), rot: all.map((q) => ({ x: q.x, y: q.y, kind: q.kind })), targets, start, pathRot: rot.length };
  }
  function make(index, seed, n, spec) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const r = rng(seed * 1000 + attempt), lv = tryGen(r, n, spec);
      if (!lv) continue;
      const sol = ML.solve(lv);
      if (!sol || !sol.state) continue;
      if (sol.flips < (n <= 5 ? Math.min(2, lv.pathRot) : Math.ceil(lv.pathRot * 0.6))) continue;        // 처음부터 거의 풀려 있으면 다시 (큰 판일수록 많이 흐트러뜨린다)
      lv.par = sol.flips; lv.solution = sol.state; lv.index = index; lv.attempt = attempt; lv.spec = spec;
      return lv;
    }
    throw new Error('레벨을 만들지 못했다: ' + index);
  }
  const LEVELS = []; const WORLD_OF = [];
  WORLDS.forEach((w, wi) => w.levels.forEach((spec, li) => { const idx = LEVELS.length; LEVELS.push(make(idx, 1000 + idx * 37, w.n, spec)); WORLD_OF.push({ world: wi, no: li + 1 }); }));
  return { LEVELS, WORLDS, WORLD_OF, make, tryGen, rng };
})();
if (typeof module !== 'undefined') module.exports = LEVELS_ML;

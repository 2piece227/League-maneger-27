// 경기 엔진 (임시): 1초 단위 진행. 확률 판정(교전·솔로킬·공성·오브젝트·귀환 결정)은 10초마다 한 번, 이동·귀환·텔레포트는 1초마다. 중계 화면은 js/live.js
// 교전 승률 = 선수 OVR · 챔피언 숙련 · 메타 · 실제 경기 데이터(라인 매치업 · 시간대별 승률 · 시너지)
//   · 조합 성향 · 전술 적합도 · 코치 · 골드 · 버프. 라인전 → 오브젝트 → 한타 → 넥서스.
// 원칙: 모든 사건은 "그 자리에 실제로 있는 선수"끼리만 일어난다. 이동은 라인·정글 길을 따라가고,
//       순간 이동은 귀환 · 부활 · 텔레포트뿐이다. (Sim.audit 을 켜면 이 원칙을 어긴 경우를 기록한다)
// 지형: js/riftwalk.js (맵 이미지에서 뽑은 벽 격자). 이동은 벽을 피해 걷고(Rift.path), 한타는 챔피언 유형별 진형(Sim.form)으로 싸운다
// TODO: 시야 판정, 스킬

// ---------- 맵 (assets/map/rift.webp 기준 %, 블루 = 왼쪽 아래) ----------
const Rift = {
  BLUE: { F: [7, 93], N: [14, 85], T1: [11, 31], T2: [11, 50], T3: [11, 66], M1: [41, 56], M2: [34, 63], M3: [28, 69], B1: [69, 90], B2: [47, 90], B3: [32, 90],
    JB: [24, 50], JG: [16, 45], JW: [25, 60], JR: [43, 64], JD: [49, 74], JK: [55, 83], RE: [26, 38] },
  NEUTRAL: { TOPC: [13.5, 11.5], BOTC: [87.5, 88.5], MID: [50, 48], BAR: [35.5, 30], DRA: [64.6, 68.2], RVt: [19, 22], RVb: [81, 78], RVtm: [43, 40], RVbm: [57, 57] },
  MIRN: { TOPC: 'BOTC', BOTC: 'TOPC', MID: 'MID', BAR: 'DRA', DRA: 'BAR', RVt: 'RVb', RVb: 'RVt', RVtm: 'RVbm', RVbm: 'RVtm' },
  EDGES: [['F', 'N'], ['N', 'T3'], ['T3', 'T2'], ['T2', 'T1'], ['T1', 'TOPC'], ['N', 'M3'], ['M3', 'M2'], ['M2', 'M1'], ['M1', 'MID'], ['N', 'B3'], ['B3', 'B2'], ['B2', 'B1'], ['B1', 'BOTC'],
    ['T2', 'JG'], ['JG', 'JB'], ['JB', 'JW'], ['JW', 'M2'], ['JB', 'RE'], ['RE', 'T1'], ['RE', 'RVt'], ['RE', 'BAR'], ['JW', 'JR'], ['JR', 'M1'], ['JR', 'JD'], ['JD', 'JK'], ['JK', 'B2'], ['JR', 'RVbm'], ['JD', 'DRA'], ['JK', 'B1']],
  NEDGES: [['RVt', 'TOPC'], ['RVt', 'BAR'], ['BAR', 'RVtm'], ['RVtm', 'MID'], ['MID', 'RVbm'], ['RVbm', 'DRA'], ['DRA', 'RVb'], ['RVb', 'BOTC']],
  LANES: { top: ['bN', 'bT3', 'bT2', 'bT1', 'TOPC', 'rB1', 'rB2', 'rB3', 'rN'], mid: ['bN', 'bM3', 'bM2', 'bM1', 'MID', 'rM1', 'rM2', 'rM3', 'rN'], bot: ['bN', 'bB3', 'bB2', 'bB1', 'BOTC', 'rT1', 'rT2', 'rT3', 'rN'] },
  TOWER: { B: { top: ['bT1', 'bT2', 'bT3'], mid: ['bM1', 'bM2', 'bM3'], bot: ['bB1', 'bB2', 'bB3'] }, R: { top: ['rB1', 'rB2', 'rB3'], mid: ['rM1', 'rM2', 'rM3'], bot: ['rT1', 'rT2', 'rT3'] } },
  INHIB: { B: { top: [11, 73], mid: [24, 74], bot: [27, 89] }, R: { top: [73, 11], mid: [76, 26], bot: [89, 27] } },
  CAMPS: ['JB', 'JG', 'JW', 'JR', 'JD', 'JK'],
  MOUTH: { BAR: [33, 35.5], DRA: [67, 63.5] },   // 둥지 입구 (강 쪽). 둥지는 이쪽으로만 드나든다
  init() {
    if (this.N) return;
    const m = ([x, y]) => [100 - x, 100 - y], N = {}, adj = {};
    Object.entries(this.BLUE).forEach(([k, p]) => { N['b' + k] = p; N['r' + k] = m(p); });
    Object.assign(N, this.NEUTRAL);
    this.terrain();
    Object.keys(N).forEach(k => { N[k] = /^[br][TB]\d$/.test(k) ? this.center(N[k], 2) : this.snap(N[k], /F$/.test(k) ? 0 : 2); });   // 사이드 라인 노드는 통로 한가운데로   // 그림과 어긋나 벽에 걸친 노드는 가장 가까운 길 위로
    const link = (a, b) => { const d = Math.hypot(N[a][0] - N[b][0], N[a][1] - N[b][1]); (adj[a] ||= []).push([b, d]); (adj[b] ||= []).push([a, d]); };
    const bn = k => this.NEUTRAL[k] ? k : 'b' + k, rn = k => this.NEUTRAL[k] ? this.MIRN[k] : 'r' + k;
    this.EDGES.forEach(([a, b]) => { link(bn(a), bn(b)); link(rn(a), rn(b)); });
    this.NEDGES.forEach(([a, b]) => link(a, b));
    this.N = N; this.adj = adj; this.cache = {}; this.L = {}; this.nav();
    Object.keys(this.LANES).forEach(l => { const pts = this.LANES[l].map(n => N[n]), cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); this.L[l] = { pts, cum, len: cum[cum.length - 1] }; });
  },
  pos(n) { return this.N[n]; },
  // 라인 위의 점 (s=0 블루 넥서스 → 1 레드 넥서스)
  lane(l, s) {
    const L = this.L[l], rest = Math.max(0, Math.min(1, s)) * L.len;
    for (let i = 1; i < L.pts.length; i++) if (rest <= L.cum[i] || i === L.pts.length - 1) { const f = (rest - L.cum[i - 1]) / ((L.cum[i] - L.cum[i - 1]) || 1); return [L.pts[i - 1][0] + (L.pts[i][0] - L.pts[i - 1][0]) * f, L.pts[i - 1][1] + (L.pts[i][1] - L.pts[i - 1][1]) * f]; }
  },
  // 점을 라인에 내린 위치 { s, d(라인까지 거리) }
  proj(l, p) {
    const L = this.L[l]; let best = { d: 1e9, s: 0 };
    for (let i = 1; i < L.pts.length; i++) {
      const a = L.pts[i - 1], b = L.pts[i], vx = b[0] - a[0], vy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / ((vx * vx + vy * vy) || 1)));
      const d = Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t);
      if (d < best.d) best = { d, s: (L.cum[i - 1] + t * (L.cum[i] - L.cum[i - 1])) / L.len };
    }
    return best;
  },
  // ---------- 지형 (js/riftwalk.js: 0.5% 칸, 1 = 벽) ----------
  terrain() {
    const n = RIFT_WALK.n, w = new Uint8Array(n * n), c = new Float32Array(n * n);
    RIFT_WALK.rows.forEach((row, y) => { for (let i = 0; i < row.length; i++) { const h = parseInt(row[i], 16); for (let b = 0; b < 4; b++) w[y * n + i * 4 + b] = (h >> (3 - b)) & 1; } });
    // 벽까지 거리 (칸 단위, 두 번 훑는 근사)
    for (let i = 0; i < n * n; i++) c[i] = w[i] ? 0 : 99;
    const at = (x, y) => x < 0 || y < 0 || x >= n || y >= n ? 0 : c[y * n + x];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; if (c[i]) c[i] = Math.min(c[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4); }
    for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) { const i = y * n + x; if (c[i]) c[i] = Math.min(c[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4); }
    this.G = n; this.W = w; this.C = c; this.K = n / 100; this.snapC = new Map();
  },
  wall(p) { const x = Math.floor(p[0] * this.K), y = Math.floor(p[1] * this.K); return x < 0 || y < 0 || x >= this.G || y >= this.G || this.W[y * this.G + x] === 1; },
  // 두 점 사이가 벽에 막히지 않았나
  los(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.ceil(Math.hypot(dx, dy) / .2), K = this.K, G = this.G, W = this.W;
    for (let i = 1; i <= n; i++) { const f = i / n, x = Math.floor((a[0] + dx * f) * K), y = Math.floor((a[1] + dy * f) * K); if (x < 0 || y < 0 || x >= G || y >= G || W[y * G + x]) return false; }
    return true;
  },
  // 벽 안(또는 벽에 너무 붙은) 점을 가장 가까운 길 위로. min = 벽에서 떨어져야 하는 칸 수
  snap(p, min = 0) {
    const G = this.G, K = this.K, cx = Math.floor(p[0] * K), cy = Math.floor(p[1] * K), ok = (x, y) => x >= 0 && y >= 0 && x < G && y < G && this.C[y * G + x] > min;
    if (ok(cx, cy)) return p;
    const key = (cy * G + cx) * 8 + min, hit = this.snapC.get(key); if (hit) return hit;
    let best = null, bd = 1e9;
    for (let r = 1; r < 60 && (!best || r <= bd + 1); r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x += (y === cy - r || y === cy + r) ? 1 : 2 * r) {
      if (!ok(x, y)) continue; const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = [(x + .5) / K, (y + .5) / K]; }
    }
    best ||= p; this.snapC.set(key, best); return best;
  },
  // p 근처(r %)에서 벽에서 가장 먼 자리
  center(p, r) {
    const G = this.G, K = this.K, cx = Math.floor(p[0] * K), cy = Math.floor(p[1] * K), R = Math.round(r * K); let best = null, bc = 0;
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) { if (x < 0 || y < 0 || x >= G || y >= G) continue; const c = this.C[y * G + x] - Math.hypot(x - cx, y - cy) * .3; if (c > bc) { bc = c; best = [(x + .5) / K, (y + .5) / K]; } }
    return best || this.snap(p, 2);
  },
  // 길찾기 그물: 이름 있는 노드 + 3% 칸마다 가장 넓은 자리 하나. 서로 보이는(벽에 안 막힌) 가까운 점끼리 잇는다
  nav() {
    const G = this.G, B = 6, D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]); let P = Object.values(this.N).map(p => [...p]);
    for (let by = 0; by < G; by += B) for (let bx = 0; bx < G; bx += B) {
      let best = -1, bc = 0;
      for (let y = by; y < by + B && y < G; y++) for (let x = bx; x < bx + B && x < G; x++) { const c = this.C[y * G + x]; if (c > bc) { bc = c; best = y * G + x; } }
      if (best < 0) continue; const q = [(best % G + .5) / this.K, (Math.floor(best / G) + .5) / this.K];
      if (!P.some(o => D(o, q) < 1.2)) P.push(q);
    }
    const link = () => { const adj = P.map(() => []); for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const d = D(P[i], P[j]); if (d <= 8 && this.los(P[i], P[j])) { adj[i].push([j, d]); adj[j].push([i, d]); } } return adj; };
    let adj = link();
    // 다른 점과 이어지지 않는 외딴 점은 뺀다
    const seen = new Set([0]), todo = [0]; while (todo.length) { const u = todo.pop(); for (const [v] of adj[u]) if (!seen.has(v)) { seen.add(v); todo.push(v); } }
    if (seen.size < P.length) { P = P.filter((_, i) => seen.has(i)); adj = link(); }
    const bk = new Map(), bkey = p => Math.floor(p[1] / 4) * 32 + Math.floor(p[0] / 4);
    P.forEach((p, i) => { const k = bkey(p); bk.has(k) ? bk.get(k).push(i) : bk.set(k, [i]); });
    this.P = P; this.padj = adj; this.bk = bk; this.rc = new Map();
  },
  // p에서 보이는 가장 가까운 그물 점
  nodeNear(p) {
    const cand = [], bx = Math.floor(p[0] / 4), by = Math.floor(p[1] / 4);
    for (let y = by - 2; y <= by + 2; y++) for (let x = bx - 2; x <= bx + 2; x++) { const l = this.bk.get(y * 32 + x); if (l) for (const i of l) cand.push([Math.hypot(this.P[i][0] - p[0], this.P[i][1] - p[1]), i]); }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, i] of cand) if (this.los(p, this.P[i])) return i;
    return cand.length ? cand[0][1] : -1;
  },
  // 그물 위 최단 경로 (A*, 결과는 기억해 둔다)
  route(a, b) {
    const key = a * 4096 + b, hit = this.rc.get(key); if (hit) return hit;
    const P = this.P, n = P.length, gs = new Float32Array(n).fill(1e9), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n), h = i => Math.hypot(P[i][0] - P[b][0], P[i][1] - P[b][1]);
    const heap = [[h(a), a]]; gs[a] = 0;
    const push = e => { let i = heap.push(e) - 1; while (i > 0) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [, u] = pop(); if (done[u]) continue; done[u] = 1; if (u === b) break;
      for (const [v, w] of this.padj[u]) { const g2 = gs[u] + w; if (g2 < gs[v]) { gs[v] = g2; prev[v] = u; push([g2 + h(v), v]); } }
    }
    const out = []; for (let c = b; c >= 0; c = prev[c]) out.unshift(c);
    if (this.rc.size > 30000) this.rc.clear();
    this.rc.set(key, out); return out;
  },
  // 걸어가는 길 (꺾이는 점들): 바로 보이면 곧장, 아니면 그물을 따라가되 보이는 데까지는 질러간다
  path(start, to) {
    if (this.los(start, to)) return [to];
    const a = this.nodeNear(start), b = this.nodeNear(to); if (a < 0 || b < 0) return [to];
    const pts = this.route(a, b).map(i => this.P[i]); pts.push(to);
    const out = []; let cur = start, i = 0;
    while (i < pts.length) { let j = Math.min(pts.length - 1, i + 10); while (j > i && !this.los(cur, pts[j])) j--; out.push(pts[j]); cur = pts[j]; i = j + 1; }
    return out;
  },
  // 걸어서 가는 거리
  wdist(a, b) { if (this.los(a, b)) return Math.hypot(a[0] - b[0], a[1] - b[1]); let d = 0, c = a; for (const q of this.path(a, b)) { d += Math.hypot(q[0] - c[0], q[1] - c[1]); c = q; } return d; },
};

const Sim = {
  PIT: { drag: 'DRA', baron: 'BAR', grubs: 'BAR', herald: 'BAR' },
  OBJ: { drag: '드래곤', grubs: '공허 유충', herald: '전령', baron: '바론' },
  // 오브젝트마다 모이는 포지션 (드래곤은 바텀 쪽 4인, 유충·전령은 탑 쪽, 바론은 5인)
  OBJ_ROLES: { drag: ['JGL', 'MID', 'BOT', 'SUP'], grubs: ['JGL', 'TOP', 'MID'], herald: ['JGL', 'TOP', 'MID', 'SUP'], baron: ['TOP', 'JGL', 'MID', 'BOT', 'SUP'] },
  OBJ_NEED: { drag: 30, grubs: 12, herald: 30, baron: 40 },   // 유충은 한 마리씩 (3마리)
  LANE_OF: { TOP: 'top', MID: 'mid', BOT: 'bot', SUP: 'bot' },
  DRAGONS: [['화염', 'dragon_infernal'], ['바다', 'dragon_ocean'], ['바람', 'dragon_cloud'], ['대지', 'dragon_mountain'], ['마법공학', 'dragon_hextech'], ['화학공학', 'dragon_chemtech']],
  ICON: { baron: 'baron', herald: 'riftherald', grubs: 'grub', tower: 'tower', inhib: 'inhibitor', nexusT: 'tower', nexus: 'nexus' },
  SPEED: 24,   // 10초 동안 걷는 거리 (맵 %). 1초에 SPEED / 10
  TP_CH: 4, RECALL_CH: 8,
  TRADE: .036,
  // 교전 성향: 두 팀 평균 (적극적인 팀이 있으면 싸움이 잦다)
  agr(g) { const f = { safe: .7, norm: 1, aggr: 1.35 }; return (f[g.side.B.ins.aggr] + f[g.side.R.ins.aggr]) / 2; },   // 라인 맞상대가 붙어 있을 때 10초마다 딜교환이 시작될 확률
  SIEGE_K: .6, CLOSE: 3,   // CLOSE: 골드 6천~1만4천 앞설수록 공성이 최대 (1 + CLOSE)배 빨라진다   // 1초 이동으로 바꾸면서 공성 위치 도착이 늦어진 만큼 (검증표의 경기 시간에 맞춘 값)   // 텔레포트 · 귀환 정신집중 (초)
  // 역할별 기본 자리 (같은 팀이 한 점에 겹치지 않게)
  OFF: { TOP: [-2.2, -1.2], JGL: [.4, -2.6], MID: [0, 0], BOT: [2.2, 1.2], SUP: [-.6, 2.4] },
  audit: null, // 배열을 넣으면 원칙 위반을 기록한다 (검사용)

  rng(seed) { let h = 1779033703 ^ seed.length; for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; },
  fountain(k) { return Rift.pos(k === 'B' ? 'bF' : 'rF'); },
  min: g => g.t / 60,
  other: k => k === 'B' ? 'R' : 'B',
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
  clampP: p => Rift.snap([Math.max(4, Math.min(96, p[0])), Math.max(4, Math.min(96, p[1]))]),   // 맵 안 + 벽 밖
  alive(g, k) { return g.pl.filter(p => p.side === k && !p.dead); },
  gold(g, k) { return g.pl.filter(p => p.side === k).reduce((a, p) => a + p.gold, 0); },
  lead(g, k) { return this.gold(g, k) - this.gold(g, this.other(k)); },
  near(g, k, at, r) { return this.alive(g, k).filter(p => !p.recall && this.dist(p.pos, at) <= r); },
  // at에서 자기 우물 쪽으로 d만큼
  toward(at, k, d) { const f = this.fountain(k), L = this.dist(at, f) || 1; return this.clampP([at[0] + (f[0] - at[0]) / L * d, at[1] + (f[1] - at[1]) / L * d]); },
  // 라인 위 구조물 앞(공격하는 쪽 기준 d만큼 못 미친 곳)
  before(lane, pos, k, d) { const pr = Rift.proj(lane, pos); return Rift.lane(lane, pr.s + (k === 'B' ? -1 : 1) * d / Rift.L[lane].len); },
  distLane(at, lane) { return Rift.proj(lane, at).d; },

  // ---------- 준비 ----------
  create(S, gameNo) {
    Rift.init();
    const r = this.rng(S.id + ':sim'), g = { t: 0, r, S, over: null, feed: [], comm: [], ev: [], kills: [], fx: [], calm: 0 };
    g.side = {};
    ['B', 'R'].forEach(k => {
      const t = Draft.side(S, k), co = Draft.coach(t), picks = S.picks[k];
      let syn = 0; picks.forEach((a, i) => picks.slice(i + 1).forEach(b => { const q = Stats.synergy(a.role, a.c, b.role, b.c); if (q) syn += q.wr - .5; }));
      g.side[k] = { k, t, coach: co.r, kills: 0, syn, fit: Draft.fitTotal(S, k) || 50, form: (r() - .5) * 2,   // 그날의 작은 흔들림. 선수 컨디션 · 팀합 · 소통은 js/condition.js
        tac: (S.tactics[k] || {}).team || 'bal', comp: Style.comp(picks.map(x => x.c)),
        towers: { top: 3, mid: 3, bot: 3 }, inhib: { top: 1, mid: 1, bot: 1 }, nexusT: 2, down: 0,
        thp: { top: [1, 1, 1], mid: [1, 1, 1], bot: [1, 1, 1] }, ihp: { top: 1, mid: 1, bot: 1 }, ntp: [1, 1], nxhp: 1,
        drag: [], grubs: 0, herald: 0, baron: 0, baronUntil: 0, push: null, reset: -999, jstart: r() < .5 ? 'top' : 'bot', ins: Draft.insOf(S.tactics[k]) };
      // 공략 라인: 팀 지시, 없으면 라커룸에서 정한 것
      const pl = (k === S.us ? (S.series || {}).plan : S.us ? (S.series || {}).oppPlan : null) || {};
      g.side[k].focus = g.side[k].ins.focus !== 'none' ? g.side[k].ins.focus : pl.focus || null;
    });
    g.pl = [];
    ['B', 'R'].forEach(k => S.picks[k].slice().sort((a, b) => G.ROLES.indexOf(a.role) - G.ROLES.indexOf(b.role)).forEach(x => {
      const hit = x.pid && Player.find(x.pid), p = hit ? hit.p : { id: 'x' + x.role, name: '공석', ovr: 55 }, boost = ((S.series && S.series.boost) || {})[p.id] || 0;   // 라커룸에서 들은 말 (다음 세트만)
      const ms = Draft.mast(p, x.c);
      g.pl.push({ side: k, role: x.role, c: x.c, p, name: p.name, ovr: (p.ovr || 60) + boost + (hit ? Cond.ovr(p) : 0), patch: typeof Patch !== 'undefined' ? Patch.adj(x.c) : 0, m: ms.m, sig: ms.sig, meta: Draft.meta(x.c), st: Style.of(x.c), curve: Stats.curve(x.c),
        k: 0, d: 0, a: 0, cs: 0, gold: 500, spent: 0, inv: [], wards: 0, trinket: null, build: Stats.build(x.c, x.role),
        tp: x.role === 'TOP' || (x.role !== 'JGL' && x.role !== 'SUP' && Stats.tp(x.c)), tpReady: 0, lvl: 1, hp: 1, dead: 0, pos: [...this.fountain(k)], trail: null, warp: 0,
        recall: 0, lastBack: 0, jq: [], cleared: false, roam: 0, roamTo: null, off: [this.OFF[x.role][0] * (k === 'B' ? 1 : -1) + (r() - .5), this.OFF[x.role][1] * (k === 'B' ? 1 : -1) + (r() - .5)], goal: null, hold: null, tpCh: null, tac: ((S.tactics[k] || {}).roles || {})[x.role] });
    }));
    ['B', 'R'].forEach(k => { g.side[k].team = Cond.team(g.side[k].t, g.pl.filter(p => p.side === k && !String(p.p.id).startsWith('x')).map(p => p.p)); });   // 팀합 + 소통
    g.pl.forEach(p => { const o = g.pl.find(q => q.side !== p.side && q.role === p.role); p.mu = o ? Stats.matchup(p.role, p.c, o.c) : { wr: .5, gd: 0, g: 0 }; });
    this.traitsIn(g, S);
    g.pl.forEach(p => { p.kind = this.kindOf(p); p.rng = this.KIND[p.kind].rng; });
    g.pl.forEach(p => this.shop(g, p));
    // 드래곤: 첫 두 마리는 서로 다른 속성, 세 번째부터는 같은 속성(협곡 속성)
    const ds = this.DRAGONS.slice().sort(() => r() - .5); g.dragSeq = [ds[0], ds[1], ds[2]];
    g.obj = { drag: { at: 300, prog: {} }, grubs: { at: 360, prog: {}, until: 840 }, herald: { at: 900, prog: {}, until: 1185 }, baron: { at: 1200, prog: {} } };
    Object.values(g.obj).forEach(ob => this.objGo(g, ob));
    g.wph = { top: r() * 6.283, mid: r() * 6.283, bot: r() * 6.283 };
    g.said = {}; g.fights = []; g.fid = 0; g.core3 = {};
    this.say(g, 'cast', `${this.josa(g.side.B.t.name, '과', '와')} ${g.side.R.t.name}의 ${gameNo ? gameNo + '세트' : '경기'}, 지금 시작합니다!`);
    // 라이벌전 첫 멘트 (점수가 높을수록 들뜬다)
    const rv = typeof Rivalry !== 'undefined' && Rivalry.of(g.side.B.t.id, g.side.R.t.id);
    if (rv) this.say(g, rv.score >= 4.5 ? 'hype' : 'anal', rv.score >= 4.5 ? this.pick(g, [`${rv.name}입니다! 오늘은 순위 같은 거 다 필요 없어요!`, `팬들이 제일 기다리는 경기, ${rv.name}! 분위기가 벌써 뜨겁습니다!`]) : `${this.josa(rv.name, '이', '')}죠. ${rv.desc}`);
    this.say(g, 'anal', `${this.josa(g.side.B.t.short, "은", "는")} ${Draft.TEAM_TAC[g.side.B.tac].n}, ${this.josa(g.side.R.t.short, "은", "는")} ${Draft.TEAM_TAC[g.side.R.tac].n} 전술입니다. ${this.compTalk(g)}`);
    const lop = g.pl.filter(p => p.side === 'B' && p.mu.g >= 5 && Math.abs(p.mu.wr - .5) >= .08)[0];
    if (lop) { const o = g.pl.find(q => q.side === 'R' && q.role === lop.role), fav = lop.mu.wr > .5 ? lop : o; this.say(g, 'anal', `${G.ROLE_KO[lop.role]} 매치업은 ${this.cn(fav)} 쪽이 유리합니다. 프로 경기 ${lop.mu.g}판 기준 승률 ${Math.round((fav === lop ? lop.mu.wr : 1 - lop.mu.wr) * 100)}%예요.`); }
    g.pl.forEach(p => { p.goal = this.target(g, p, 0); });
    return g;
  },
  // 특성 (data/traits.json): 경기 시작 때 정해지는 OVR 보정 · 팀 보정. 경기 중 효과는 tpow · fightTick · laning 등에서 p.fx 로 읽는다
  traitsIn(g, S) {
    const m0 = Schedule.all && S.series && Schedule.all.find(x => x.id === S.series.key), ev = m0 && Schedule.eventOf(m0);
    const big = !!ev && (ev.kind === 'playoffs' || ev.kind === 'intl'), sc = Season.seriesScore(S.series), done = S.series.games.filter(x => x.result).length;
    const decider = (S.series.bo || 1) === 5 && done === 4 && Object.values(sc).every(v => v === 2);
    g.pl.forEach(p => {
      const ids = Traits.cfg ? Traits.of(p.p.id).map(t => t.id) : []; p.fx = {}; ids.forEach(id => Object.assign(p.fx, Traits.byId[id].fx)); p.traits = ids;
      let add = (p.fx.ovr || 0) + (big ? p.fx.bigOvr || 0 : 0) + (decider ? p.fx.decider || 0 : 0);
      if (p.fx.mainOvr) { const top3 = Mastery.pool(p.p.id).slice().sort((a, b) => b.g - a.g).slice(0, 3).map(e => e.c); if (top3.includes(p.c)) add += p.fx.mainOvr; }
      if (p.fx.carryTeam) { const mates = g.pl.filter(q => q.side === p.side && q !== p), avg = mates.reduce((a, q) => a + Cond.of(q.p.id), 0) / (mates.length || 1); if (avg < 0) add += p.fx.carryTeam; }
      p.ovr += add;
    });
    // 상대를 위축시키는 특성 (원딜의 신 · LCK 킬러)
    g.pl.forEach(p => {
      const o = g.pl.find(q => q.side !== p.side && q.role === p.role);
      if (!o) return;
      if (p.fx.enemyBotOvr && p.role === 'BOT') o.ovr += p.fx.enemyBotOvr;
      if (p.fx.lckTop && p.role === 'TOP' && g.side[o.side].t.league === 'LCK') o.ovr += p.fx.lckTop;
    });
    // 팀 사기 (마에스트로 · 리더십): 팀에서 가장 큰 것 하나
    ['B', 'R'].forEach(k => { const v = Math.max(0, ...g.pl.filter(p => p.side === k).map(p => p.fx.teamPow || 0)); g.side[k].team = (g.side[k].team || 0) + v; });
  },
  // 오브젝트가 생기면 팀마다 준비되는 시각이 다르다 (시야 정리 · 라인 정리 · 귀환 타이밍). 생성 직후 바로 싸우지 않는다
  objGo(g, ob) {
    if (!ob.at) return;
    const d = () => Math.round(10 + g.r() * g.r() * 170);
    ob.go = { B: ob.at + d(), R: ob.at + d() };
  },
  compTalk(g) {
    const b = g.side.B.comp, r = g.side.R.comp, B = g.side.B.t.short, R = g.side.R.t.short;
    if (b.early - r.early > .12) return `${this.josa(B, '이', '가')} 초반에 훨씬 강한 그림이에요.`;
    if (r.early - b.early > .12) return `${this.josa(R, '이', '가')} 초반 주도권을 잡을 수 있는 조합입니다.`;
    if (b.late - r.late > .12) return `${this.josa(B, '은', '는')} 후반으로 갈수록 좋아지는 조합이죠.`;
    if (r.late - b.late > .12) return `${this.josa(R, '은', '는')} 시간을 끌면 유리한 조합이에요.`;
    return '양 팀 모두 균형 잡힌 조합이라 운영 싸움이 될 것 같습니다.';
  },
  // 선수 전투력: OVR + 숙련 + 메타 + 레벨 + 완성 아이템 + 시간대별 실제 승률
  ppow(p, m = 15) {
    const ph = m < 22 ? p.curve[0] : m < 30 ? p.curve[1] : p.curve[2], items = p.inv.filter(i => i.gold >= 2000).length;
    return p.ovr * .6 + p.m * .4 + (p.sig ? 2 : 0) + p.meta * 3 + (p.patch || 0) + p.lvl * .2 + items * .6 + (ph - .5) * 20 + Math.min(2.5, p.k * .15) - Math.min(2, p.d * .1) - (1 - p.hp) * 3;
  },
  tpow(g, k, who) {
    const s = g.side[k], ps = (who || this.alive(g, k)), m = this.min(g), c = s.comp;
    if (!ps.length) return 0;
    let v = ps.reduce((a, p) => a + this.ppow(p, m), 0) / ps.length + s.form + s.syn * 8 + (s.team || 0);
    // 클러치 · 중꺾마: 지고 있을 때 오른다 (OVR 환산 → 전투력 0.6배)
    const ld = this.lead(g, k); if (ld < -3000) v += ps.reduce((a, p) => a + ((p.fx || {}).behindOvr || 0) + Math.min(((p.fx || {}).behindScale || 0), -ld / 2000), 0) / ps.length * .6;
    v += m < 14 ? (c.early - .4) * 10 : m < 26 ? ((c.fight + c.engage) / 2 - .4) * 9 : (c.late - .4) * 10;
    v += (s.coach - 10) * .15;   // 전술 적합도 보너스는 없다: 전술은 경기 중 판단(교전·오브젝트·운영·목표·시야)으로만 결과에 닿는다
    v += Math.max(-this.SNOW_MAX, Math.min(this.SNOW_MAX, this.lead(g, k) / 1000 * this.SNOW));   // 스노우볼 (실제: 이긴 팀 골드 +1만, 킬 2배)
    if (s.baronUntil > g.t) v += 6;
    if (s.drag.length >= 4) v += 4;
    if (s.elderUntil > g.t) v += 8;
    return v;
  },
  win(g, kA, a, b, bonus = 0) { const d = this.tpow(g, kA, a) - this.tpow(g, this.other(kA), b) + (a.length - b.length) * 6 + bonus; return g.r() < 1 / (1 + Math.exp(-d / 11.5)); },   // 11.5: 실제 강팀·약팀 승률 곡선에 맞춘 값 (tools/validate-engine.md 참고)

  // ---------- 해설 ----------
  // 중계진 (가상 인물): 캐스터 — 장면을 크게 외친다 / 해설 정민 — 차분한 분석 / 해설 태오 — 텐션 높은 리액션
  CAST: { cast: '캐스터 한도윤', anal: '해설 정민', hype: '해설 태오' },
  // 궁극기 연출: 전장 어디든 합류하는 궁(텔레포트처럼 정신집중 3초) · 멀리서 도망가는 적을 잡는 궁
  ULT_JOIN: ['Shen', 'TwistedFate', 'Galio', 'Pantheon', 'Nocturne', 'Taliyah'],
  ULT_SNIPE: ['Jinx', 'Ezreal', 'Ashe', 'Senna', 'Draven', 'Karthus'],
  rName(p) { const ch = Champions.byId[p.c]; return ((((ch && ch.spells || []).find(s => s.key === 'R') || {}).name) || '궁극기').split('/')[0].trim(); },
  ultReady(g, p) { return !p.dead && !p.recall && !p.tpCh && g.t >= (p.ultAt || 0) && this.min(g) >= 6; },
  useUlt(g, p) { p.ultAt = g.t + (this.min(g) < 14 ? 130 : 90); },
  say(g, who, text) { const n = (g.said ||= {})[text] || 0; if (n >= 2) return; g.said[text] = n + 1; g.comm.push({ t: g.t, who, text }); },   // 같은 문장은 한 경기에 두 번까지
  clock: t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`,
  pick(g, arr) { return arr[Math.floor(g.r() * arr.length)]; },
  cn: p => Champions.byId[p.c].name,
  laneKo: l => ({ top: '탑', mid: '미드', bot: '바텀' })[l],
  // 받침에 맞는 조사 (이/가, 을/를, 과/와, 은/는, 으로/로). 숫자는 읽는 소리, 영문 약칭은 알파벳 이름, 영문 단어는 끝소리로 판정
  // 받침: 0(영)·1(일)·3(삼)·6(육)·7(칠)·8(팔) / L(엘)·M(엠)·N(엔) / 단어 끝 l·m·n·ng. (으)로는 ㄹ 받침이면 '로'
  josa(word, a, b) {
    const w = String(word ?? ''), last = w.slice(-1), ch = w.charCodeAt(w.length - 1), ro = a === '으로';
    let jong = 0, rieul = false;
    if (ch >= 0xAC00 && ch <= 0xD7A3) { jong = (ch - 0xAC00) % 28; rieul = jong === 8; }
    else if (/[0-9]/.test(last)) { jong = '013678'.includes(last) ? 1 : 0; rieul = '178'.includes(last); }
    else if (/[A-Z]/.test(last) && !/[a-z]/.test(w.slice(-2, -1))) { jong = 'LMN'.includes(last) ? 1 : 0; rieul = last === 'L'; }
    else if (/[a-z]/i.test(last)) { jong = /(l|m|n|ng)$/i.test(w) ? 1 : 0; rieul = /l$/i.test(w); }
    return w + (jong && !(ro && rieul) ? a : b);
  },
  // 오브젝트 · 구조물 기록: 기록 목록(ev)과 화면 알림(feed)에 함께 남긴다
  mark(g, side, kind, icon, txt) { const e = { t: g.t, side, kind, icon, txt, obj: true }; g.ev.push(e); g.feed.push(e); },

  // ---------- 상점: 재료부터 사서 완성한다 · 와드 · 장신구 ----------
  free(p) { return p.gold - p.spent; },
  has(p, n) { return p.inv.some(i => i.n === n); },
  owned(p, it, pool = [...p.inv]) {
    const got = [];
    (it.from || []).forEach(n => { const i = pool.findIndex(x => x.n === n); if (i >= 0) got.push(pool.splice(i, 1)[0]); else { const sub = Stats.it(n); if (sub) got.push(...this.owned(p, sub, pool)); } });
    return got;
  },
  nextPart(p, it, money, pool = [...p.inv]) {
    let best = null;
    (it.from || []).forEach(n => {
      const i = pool.findIndex(x => x.n === n);
      if (i >= 0) { pool.splice(i, 1); return; }
      const sub = Stats.it(n); if (!sub) return;
      const need = sub.gold - this.owned(p, sub, [...pool]).reduce((a, x) => a + x.gold, 0);
      if (need <= money && (!best || sub.gold > best.it.gold)) best = { it: sub, need };
      else if (!best) { const deeper = this.nextPart(p, sub, money, pool); if (deeper) best = deeper; }
    });
    return best;
  },
  slots(p) { return p.inv.length + (p.wards ? 1 : 0); },
  buy(p, it, cost, remove = []) { remove.forEach(x => { const i = p.inv.indexOf(x); if (i >= 0) p.inv.splice(i, 1); }); p.inv.push(it); p.spent += cost; },
  shop(g, p) {
    const b = p.build, m = this.min(g);
    if (!p.trinket) p.trinket = Stats.it('Stealth Ward');
    if (p.role === 'SUP' && m >= 4 && b.trinket) p.trinket = b.trinket;
    if (!p.inv.length && b.start && this.free(p) >= b.start.gold) this.buy(p, b.start, b.start.gold);
    if (p.role === 'SUP' && b.sup && m >= 11 && b.start && this.has(p, b.start.n)) { const i = p.inv.findIndex(x => x.n === b.start.n); p.inv[i] = b.sup; }
    const wmax = ['SUP', 'JGL'].includes(p.role) ? 2 : g.t > 300 ? 1 : 0;
    while (p.wards < wmax && this.free(p) >= 75) { p.wards++; p.spent += 75; }
    for (let guard = 0; guard < 10; guard++) {
      const target = b.core.find(it => !this.has(p, it.n)); if (!target) break;
      const parts = this.owned(p, target), cost = target.gold - parts.reduce((a, x) => a + x.gold, 0);
      if (this.free(p) >= cost) {
        if (this.slots(p) - parts.length >= 6) { const sell = p.inv.find(x => x === b.start && p.role !== 'JGL' && p.role !== 'SUP') || null; if (sell) { p.inv.splice(p.inv.indexOf(sell), 1); p.spent -= Math.round(sell.gold * .4); } else break; }
        this.buy(p, target, cost, parts);
        if (g.t > 0 && !target.boots && p.inv.filter(x => x.gold >= 2000 && !x.boots).length === 3 && !(g.core3 ||= {})[p.side] && (g.core3[p.side] = 1)) this.say(g, 'anal', `${p.name}, ${target.ko}까지 3코어 완성! ${this.josa(this.cn(p), '이', '가')} 가장 강해지는 시간입니다.`);
        continue;
      }
      const part = this.nextPart(p, target, this.free(p));
      if (!part || this.slots(p) >= 6) break;
      this.buy(p, part.it, part.need, this.owned(p, part.it));
    }
  },

  // ---------- 처치 · 교전 ----------
  kill(g, killer, victim, assists = [], far = false) {
    if (victim.dead) return;
    if (this.audit && !far && this.dist(killer.pos, victim.pos) > 22) this.audit.push(`${this.clock(g.t)} 먼 거리 처치 ${killer.name}(${killer.pos.map(Math.round)}) → ${victim.name}(${victim.pos.map(Math.round)})`);
    const first = !g.kills.length;
    victim.dead = g.t + Math.round(8 + this.min(g) * 1.3); victim.d++; victim.hp = 0; victim.recall = 0; victim.jq = []; victim.tpCh = null; victim.hold = null; victim.fled = 0;
    killer.k++; killer.gold += 300 + Math.min(700, Math.max(0, victim.k - victim.d) * 100) + (first ? 100 : 0);
    assists.filter(a => a !== killer && !a.dead).forEach(a => { a.a++; a.gold += 120; });
    g.side[killer.side].kills++;
    g.kills.push({ t: g.t, k: killer, v: victim, at: [...victim.pos] });
    g.feed.push({ t: g.t, killer, victim, first });
    if (first) this.say(g, 'cast', `퍼스트 블러드! ${g.side[killer.side].t.short} ${killer.name}, ${this.josa(victim.name, '을', '를')} 잡아냅니다!`);
  },
  pickKiller(g, ps) {
    const w = ps.map(p => ({ p, w: ({ MID: 1.3, BOT: 1.5, JGL: 1.1, TOP: 1, SUP: .35 }[p.role]) * (1 + p.st.pick * .5 + p.st.early * .2) }));
    let x = g.r() * w.reduce((a, o) => a + o.w, 0);
    for (const o of w) { x -= o.w; if (x <= 0) return o.p; }
    return w[0].p;
  },
  // 그 자리 근처(radius)에 실제로 있는 선수끼리만 싸운다. 큰 싸움에는 텔레포트가 있는 선수가 날아올 수 있다
  // 합류 반경: 교전 합류(미드·원딜 join)는 +8, 탑 소규모 교전(skirm)은 강가 쪽 싸움에 +6
  joinR(p, at, r) { return r + (p.tac === 'join' ? 8 : p.tac === 'skirm' && p.role === 'TOP' && Rift.proj('top', at).d > 6 ? 6 : 0); },
  // 교전 시작: 그 자리 근처(radius)에 실제로 있는 선수끼리. 결과는 정하지 않는다 — 매초 체력을 주고받으며(fightTick) 정해진다.
  // 큰 싸움에는 텔레포트가 있는 선수가 정신집중(4초) 뒤 합류할 수 있다
  fightAt(g, at, radius, opt = {}) {
    const pick = k => this.alive(g, k).filter(p => !p.recall && !p.tpCh && !p.fled && this.dist(p.pos, at) <= this.joinR(p, at, radius));
    const A = pick('B'), Bp = pick('R');
    if (!A.length || !Bp.length) return null;
    if (g.fights.some(f => this.dist(f.at, at) < 12)) return null;        // 이미 근처에서 싸우는 중
    if (A.length + Bp.length >= 5 && this.min(g) >= 4) ['B', 'R'].forEach(k => this.alive(g, k).filter(p => p.tp && g.t >= p.tpReady && this.dist(p.pos, at) > 40 && !p.recall && !p.tpCh && g.r() < .55).forEach(p => {
      this.teleport(g, p, this.toward(at, k, 6));
      this.say(g, 'cast', `${p.name}, 순간이동으로 합류합니다!`);
    }));
    // 전장 어디든 합류하는 궁극기 (쉔 · 트페 · 갈리오 · 판테온 · 녹턴 · 탈리야)
    if (A.length + Bp.length >= 4) g.pl.filter(p => this.ULT_JOIN.includes(p.c) && this.ultReady(g, p) && !A.includes(p) && !Bp.includes(p) && this.dist(p.pos, at) > 30 && g.r() < .5).forEach(p => {
      const to = this.toward(at, p.side, 4); this.useUlt(g, p);
      g.fx.push({ type: 'tp', side: p.side, at: to, from: [...p.pos], t: g.t, dur: 3 }); p.tpCh = { to, at: g.t + 3 }; p.hold = null;
      this.say(g, 'cast', `${p.name}, ${this.josa(this.rName(p), '으로', '로')} 날아듭니다! ${this.cn(p)} 합류!`);
    });
    let bonus = opt.bonus ? (opt.bonus.side === 'B' ? opt.bonus.v : -opt.bonus.v) : 0;
    // 자기 포탑 근처에서 싸우는 쪽이 유리하다
    ['B', 'R'].forEach(k => { if (['top', 'mid', 'bot'].some(l => { const st = this.structOf(g, k, l); return st.kind !== 'nexus' && this.dist(st.pos, at) < 12; })) bonus += k === 'B' ? 6 : -6; });
    g.calm = g.t + 40;
    const f = { id: ++g.fid, at: [...at], r: radius + 4, t0: g.t, bonus, where: opt.where || null, onEnd: opt.onEnd || null, kills: { B: 0, R: 0 }, size: A.length + Bp.length, mem: new Set([...A, ...Bp]), dmg: new Map(), quiet: 0 };
    this.form(g, f, [...A, ...Bp]);
    g.fights.push(f);
    g.fx.push({ type: 'fight', at, t: g.t, side: null, dur: 6 });
    f.n0 = { B: A.length, R: Bp.length }; f.lead0 = this.lead(g, 'B');
    if (f.size >= 5) this.sayOpen(g, f, A, Bp);
    return f;
  },
  // 교전 1초: 사거리(7) 안의 상대를 친다. 팀 힘(조합·골드·버프·코치·전술·컨디션: tpow)은 피해 배율로, 개인 실력은 개인 배율로.
  // 체력이 낮고 밀리면 빠진다(뒤쫓기면 맞으면서). 체력이 0이 되면 마지막에 때린 선수가 처치, 피해를 준 선수는 어시스트.
  FIGHT_K: .17, FIGHT_S: 26, RANGE: 7, SNOW: .25, SNOW_MAX: 4,   // SNOW: 골드 1천 차이당 전투력
  TANK: { TOP: .8, JGL: .85, MID: 1.08, BOT: 1.18, SUP: .9 },
  // 챔피언 유형별 한타 행동: 사거리(맵 %) · 주는 피해 · 받는 피해 · 붙는 속도(돌진기)
  //   tank 앞라인·이니시(먼저 들어가 가까운 적과 부딪힌다) / bruiser 브루저(앞라인 뒤를 따라 붙는다) / dive 암살·돌진(옆으로 돌아 딜러를 문다)
  //   adc 원딜(사거리 끝에서 가까운 적부터, 붙으면 물러난다) / mage 메이지 / arti 포킹(가장 멀리서) / ench 보호형 서폿(우리 딜러 곁)
  KIND: { tank: { rng: 4.5, deal: .75, take: .72, dash: 1.3 }, bruiser: { rng: 4.5, deal: .95, take: .88, dash: 1.2 }, dive: { rng: 4.5, deal: 1.2, take: 1, dash: 1.5 },
    adc: { rng: 7.5, deal: 1.25, take: 1.18, dash: 1 }, mage: { rng: 8, deal: 1.1, take: 1.1, dash: 1 }, arti: { rng: 10, deal: 1, take: 1.15, dash: 1 }, ench: { rng: 7, deal: .5, take: 1, dash: 1 } },
  KIND_KO: { tank: '앞라인', bruiser: '브루저', dive: '암살·돌진', adc: '원거리 딜러', mage: '메이지', arti: '포킹', ench: '보호' },
  kindOf(p) {
    const ch = Champions.byId[p.c] || {}, R = ch.roles || [], has = (...a) => a.some(x => R.includes(x)), melee = ch.attackType !== 'RANGED';
    if (!melee && (has('ENCHANTER') || (p.role === 'SUP' && p.st.peel >= .6 && !has('VANGUARD', 'WARDEN')))) return 'ench';
    if (melee && (has('VANGUARD', 'WARDEN') || (has('TANK') && !has('ASSASSIN')) || p.st.engage >= .9)) return 'tank';
    if (melee && has('ASSASSIN', 'DIVER', 'SKIRMISHER')) return 'dive';
    if (melee) return 'bruiser';
    if (has('MARKSMAN') && p.role !== 'SUP') return 'adc';
    if (has('ARTILLERY') || p.st.poke >= .9) return 'arti';
    return 'mage';
  },
  isCarry: p => p.kind === 'adc' || p.kind === 'mage' || p.kind === 'arti',
  // 한타 진형: 매초 유형에 맞는 자리를 정한다 (이동은 walk가 벽을 피해 간다)
  form(g, f, live) {
    const D = this.dist, cen = ps => [ps.reduce((a, p) => a + p.pos[0], 0) / ps.length, ps.reduce((a, p) => a + p.pos[1], 0) / ps.length];
    const unit = (a, b) => { const d = D(a, b) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
    ['B', 'R'].forEach(k => {
      const us = live.filter(p => p.side === k), foes = live.filter(p => p.side !== k); if (!us.length) return;
      if (!foes.length) { us.forEach(p => { p.hold = { to: this.clampP([f.at[0] + p.off[0], f.at[1] + p.off[1]]), until: g.t + 2 }; }); return; }
      const O = cen(us), E = cen(foes), u = unit(O, E), front = us.some(p => p.kind === 'tank' || p.kind === 'bruiser'), taken = [];
      us.forEach((p, i) => {
        const nf = foes.slice().sort((a, b) => D(a.pos, p.pos) - D(b.pos, p.pos))[0], dn = D(nf.pos, p.pos), K = this.KIND[p.kind];
        const stick = (t, gap) => { const v = unit(t.pos, p.pos); return [t.pos[0] + v[0] * gap, t.pos[1] + v[1] * gap]; };
        let to;
        if (p.kind === 'tank' || p.kind === 'bruiser') {
          // 앞라인: 가장 가까운 적에게 붙는다. 브루저는 앞라인이 있으면 한 박자 늦게
          to = p.kind === 'bruiser' && front && us.some(q => q.kind === 'tank') && g.t - f.t0 < 2 ? [O[0] + u[0] * 2, O[1] + u[1] * 2] : stick(nf, 3.2);
        } else if (p.kind === 'dive') {
          // 암살·돌진: 앞라인이 부딪히는 동안 옆으로 돌고, 그다음 상대 딜러에게
          const tg = foes.filter(q => this.isCarry(q) || q.kind === 'ench').sort((a, b) => (a.hp - b.hp) + (D(a.pos, p.pos) - D(b.pos, p.pos)) * .03)[0] || nf;
          if (front && foes.length >= 2 && g.t - f.t0 < 3) { const sg = (g.pl.indexOf(p) % 2 ? 1 : -1); to = [E[0] - u[1] * 6 * sg - u[0] * 1, E[1] + u[0] * 6 * sg - u[1] * 1]; p.flank = f.id; }
          else to = stick(tg, 3.2);
        } else if (p.kind === 'ench') {
          // 보호: 우리 딜러 바로 뒤
          const c = us.filter(q => q !== p && this.isCarry(q)).sort((a, b) => (a.kind === 'adc' ? 0 : 1) - (b.kind === 'adc' ? 0 : 1) || a.hp - b.hp)[0] || us.filter(q => q !== p).sort((a, b) => a.hp - b.hp)[0];
          to = c ? [c.pos[0] - u[0] * 2 + u[1] * 2.4, c.pos[1] - u[1] * 2 - u[0] * 2.4] : stick(nf, K.rng - .8);
        } else {
          // 원거리 딜러: 사거리 끝을 유지한다. 근접이 붙으면 뒤로 빠지면서 친다
          const th = foes.filter(q => this.KIND[q.kind].rng < 5 && D(q.pos, p.pos) < 5.5).sort((a, b) => D(a.pos, p.pos) - D(b.pos, p.pos))[0];
          if (th) { const v = unit(th.pos, p.pos); to = [p.pos[0] + v[0] * 2.4 - u[0] * 1.2, p.pos[1] + v[1] * 2.4 - u[1] * 1.2]; }
          else if (dn > K.rng - .5) to = stick(nf, K.rng - .8);
          else to = [p.pos[0] + u[1] * Math.sin((g.t + i * 3) / 2) * .8, p.pos[1] - u[0] * Math.sin((g.t + i * 3) / 2) * .8];
        }
        // 같은 팀끼리 겹쳐 서지 않는다 (3 이상 벌린다)
        for (let n = 0; n < 3; n++) for (const q of taken) { const d = D(to, q); if (d < 3) { const v = d > .05 ? [(to[0] - q[0]) / d, (to[1] - q[1]) / d] : [-u[1] * (i % 2 ? 1 : -1), u[0] * (i % 2 ? 1 : -1)]; to = [q[0] + v[0] * 3, q[1] + v[1] * 3]; } }
        taken.push(to);
        p.hold = { to: this.clampP(to), until: g.t + 2 }; p.dash = g.t + 1;
      });
    });
  },
  fightTick(g) {
    if (!g.fights.length) return;
    const m = this.min(g);
    g.fights.forEach(f => {
      // 참가자: 근처에 있는 살아 있는 선수 (도망 중이 아닌)
      g.pl.forEach(p => { if (!p.dead && !p.recall && !p.tpCh && !p.fled && this.dist(p.pos, f.at) <= f.r) f.mem.add(p); });
      const mem = [...f.mem].filter(p => !p.dead && !p.recall && !p.tpCh && this.dist(p.pos, f.at) <= f.r + 6);
      f.mem = new Set(mem);
      const side = k => mem.filter(p => p.side === k && !p.fled);
      const B = side('B'), R = side('R');
      if (!B.length || !R.length || g.t - f.t0 > 20) { f.quiet++; if (f.quiet >= 2 || g.t - f.t0 > 20) f.done = true; return; }
      f.quiet = 0;
      const d = this.tpow(g, 'B', B) - this.tpow(g, 'R', R) + f.bonus, mult = { B: Math.exp(d / (2 * this.FIGHT_S)), R: Math.exp(-d / (2 * this.FIGHT_S)) };
      const avg = (ps) => ps.reduce((a, p) => a + this.ppow(p, m), 0) / ps.length, av = { B: avg(B), R: avg(R) };
      const early = m < 10 ? .7 : m < 18 ? .9 : 1;                     // 초반은 피해가 낮다 (레벨·아이템)
      const hits = [];
      [...B, ...R].forEach(a => {
        const KA = this.KIND[a.kind], near = q => Math.max(0, (a.rng - this.dist(q.pos, a.pos)) / a.rng);
        const foes = g.pl.filter(q => q.side !== a.side && !q.dead && !q.recall && !q.tpCh && this.dist(q.pos, a.pos) <= a.rng && (f.mem.has(q) || q.fled === f.id) && (a.rng > 6 || Rift.los(a.pos, q.pos)));   // 근접은 벽 너머를 못 친다
        if (!foes.length) return;
        // 대상: 체력이 낮고 몸이 약한 쪽을 노린다 (가끔 앞라인)
        // 대상: 한타 목표 지시 — 딜러 노리기(원딜·미드) / 앞라인부터(가까운 적) / 보호(평소대로)
        const tg = g.side[a.side].ins.target, carry = q => q.role === 'BOT' || q.role === 'MID';
        // 유형별 대상: 앞라인·원딜은 가까운 적부터, 암살자는 딜러, 메이지는 약한 쪽
        const kf = q => a.kind === 'tank' ? .5 + near(q) * 1.5 : a.kind === 'bruiser' ? .8 + near(q) * .7 : a.kind === 'dive' ? (this.isCarry(q) || q.kind === 'ench' ? 1.7 : .7) : a.kind === 'adc' ? .7 + near(q) : a.kind === 'ench' ? .6 + near(q) : 1;
        const v = foes.map(q => ({ q, w: (1.4 - q.hp) * this.KIND[q.kind].take * kf(q) * (q.fled ? .6 : 1) * (tg === 'carry' ? (carry(q) ? 1.6 : .75) : tg === 'front' ? (carry(q) ? .8 : 1.25) + near(q) * .5 : 1) + g.r() * .5 })).sort((x, y) => y.w - x.w)[0].q;
        // 보호 지시: 우리 딜러가 받는 피해가 줄고, 대신 우리 딜은 조금 준다
        const peel = (g.side[v.side].ins.target === 'peel' && carry(v) ? .8 : 1) * (tg === 'peel' ? .93 : 1);
        // 특성: 받는 피해(살신성인 ↑ · 불사대마왕 · 빛나는 왕관 ↓) · 주는 피해(온신) · 마무리(킬 캐치) · 퍼블 · 아기 고양이 · 인간 넥서스 · 살신성인 팀 효과
        const af = a.fx || {}, vf = v.fx || {}, kit = v.role === 'BOT' && g.pl.some(q => q.side === v.side && q.role === 'SUP' && !q.dead && (q.fx || {}).adcGuard && this.dist(q.pos, v.pos) < 8);
        const tfx = (af.dmg || 1) * (af.finish && v.hp < .35 ? af.finish : 1) * (af.firstBlood && !g.kills.length ? af.firstBlood : 1) * (vf.takeDmg || 1) * (kit ? .88 : 1) * (vf.lateGuard && m >= 25 ? vf.lateGuard : 1)
          * (mem.some(q => q.side === a.side && (q.fx || {}).teamDmg) ? 1.03 : 1);
        const guard = mem.some(q => q.side === v.side && q !== v && q.kind === 'ench' && !q.dead && this.dist(q.pos, v.pos) < 6) ? .9 : 1;   // 보호형 서폿 곁에서는 덜 아프다
        const dmg = tfx * peel * guard * this.FIGHT_K * KA.deal * early * mult[a.side] * (1 + (this.ppow(a, m) - av[a.side]) / 40) * this.KIND[v.kind].take * (.75 + g.r() * .5) * (v.fled ? .55 : 1);
        hits.push([a, v, dmg]); a.hitTo = v; a.hitAt = g.t;   // 중계 화면의 공격선
      });
      hits.forEach(([a, v, dmg]) => {
        if (v.dead) return;
        v.hp -= dmg;
        const ctb = f.dmg.get(v) || new Map(); ctb.set(a, (ctb.get(a) || 0) + dmg); f.dmg.set(v, ctb); v.lastHit = a;
        if (v.hp <= 0) {
          const helpers = [...ctb.keys()].filter(x => x !== a && !x.dead);
          this.kill(g, a, v, helpers); f.kills[a.side]++; (f.kb ||= new Map()).set(a, (f.kb.get(a) || 0) + 1);
          if (f.size >= 5 && f.kills.B + f.kills.R === 1 && this.isCarry(v) && v.role !== 'SUP') this.say(g, 'hype', `${this.josa(v.name, '이', '가')} 먼저 잘렸어요! ${this.josa(this.cn(v), '이', '가')} 없으면 딜이 안 나옵니다!`);
          if (a.kind === 'dive' && a.flank === f.id && this.isCarry(v) && f.size >= 5 && g.r() < .7) this.say(g, 'hype', this.pick(g, [`${a.name}, 옆으로 돌아 들어가서 ${this.josa(v.name, '을', '를')} 물었습니다! ${this.cn(v)} 삭제!`, `측면을 파고든 ${a.name}의 ${this.cn(a)}! 뒷라인이 무너집니다!`]));
        }
      });
      // 후퇴: 체력이 낮고 밀리면 (숫자 · 남은 체력)
      const thr0 = m < 10 ? .45 : m < 20 ? .35 : .3, AGR = { safe: .08, norm: 0, aggr: -.07 };
      // 양 팀이 같은 순간을 보고 동시에 판단한다 (먼저 판단한 쪽이 불리해지지 않게)
      const snap = { B: B.filter(x => !x.dead), R: R.filter(x => !x.dead) }, hpS = k => snap[k].reduce((a, x) => a + x.hp, 0);
      const go = [...snap.B, ...snap.R].filter(p => { const o = this.other(p.side), thr = thr0 + AGR[g.side[p.side].ins.aggr]; return p.hp < thr && (snap[p.side].length < snap[o].length || hpS(p.side) < hpS(o) * .85 || p.hp < .12) && g.r() < .7; });
      // 팀 단위 후퇴: 이 싸움에서 둘 이상 잘렸고 숫자에서 밀리면 남은 팀원도 빠진다 (실제 한타는 끝까지 다 죽지 않는다)
      ['B', 'R'].forEach(k => { const o = this.other(k); if (f.kills[o] >= 2 && snap[k].length < snap[o].length) snap[k].forEach(p => { if (!go.includes(p) && g.r() < .75) go.push(p); }); });
      go.forEach(p => { p.fled = f.id; this.retreat(g, p, 18); });
      // 멀리서 잡는 궁극기 (징크스 · 이즈리얼 · 애쉬 · 세나 · 드레이븐 · 카서스): 체력이 바닥난 채 도망가는 적
      g.pl.filter(v => v.fled === f.id && !v.dead && v.hp < .22).forEach(v => {
        const s = g.pl.find(p => p.side !== v.side && this.ULT_SNIPE.includes(p.c) && this.ultReady(g, p));
        if (!s || g.r() > .3) return;
        this.useUlt(g, s); this.kill(g, s, v, [], true); f.kills[s.side]++;
        this.say(g, 'cast', `${s.name}, ${this.rName(s)}! 도망가던 ${this.josa(v.name, '을', '를')} 끝까지 잡아냅니다!`);
      });
      // 서로 붙어 있도록 중심을 참가자 쪽으로
      const live = mem.filter(p => !p.dead && !p.fled);
      if (live.length) f.at = [live.reduce((a, p) => a + p.pos[0], 0) / live.length, live.reduce((a, p) => a + p.pos[1], 0) / live.length];
      this.form(g, f, live);
    });
    g.fights.filter(f => f.done).forEach(f => this.fightEnd(g, f));
    g.fights = g.fights.filter(f => !f.done);
  },
  // ---------- 설명하는 해설: 엔진이 아는 사실(인원 · 텔레포트 · 골드 · 조합 · 시야)을 말로 풀어 준다 ----------
  // 한타가 열릴 때: 누가 먼저 들어가나, 인원이 왜 다른가
  sayOpen(g, f, A, Bp) {
    const where = f.where ? f.where + '에서 ' : '', all = [...A, ...Bp], E = k => { const ps = k === 'B' ? Bp : A; return [ps.reduce((a, p) => a + p.pos[0], 0) / ps.length, ps.reduce((a, p) => a + p.pos[1], 0) / ps.length]; };
    const ini = all.filter(p => p.kind === 'tank' || p.kind === 'dive').sort((a, b) => this.dist(a.pos, E(a.side)) - this.dist(b.pos, E(b.side)))[0];
    const nm = f.size >= 7 ? '한타가' : '교전이';
    this.say(g, 'cast', ini ? `${where}${nm} 열립니다! ${ini.name}의 ${this.josa(this.cn(ini), '이', '가')} 먼저 들어가요!` : `${where}양 팀이 붙습니다! 사거리 싸움이에요!`);
    if (A.length === Bp.length) return;
    const big = A.length > Bp.length ? 'B' : 'R', small = this.other(big), ins = small === 'B' ? A : Bp;
    const miss = g.pl.filter(p => p.side === small && !ins.includes(p)).sort((a, b) => (a.dead ? 0 : 1) - (b.dead ? 0 : 1))[0];
    let why = '';
    if (miss) {
      const lane = ['top', 'mid', 'bot'].sort((x, y) => this.distLane(miss.pos, x) - this.distLane(miss.pos, y))[0];
      why = miss.tpCh ? `${this.josa(miss.name, '이', '가')} 아직 순간이동으로 오는 중이라 ` : miss.dead ? `${this.josa(miss.name, '이', '가')} 죽어 있어서 ` : miss.recall ? `${this.josa(miss.name, '이', '가')} 귀환 중이라 ` : `${this.josa(miss.name, '이', '가')} ${this.laneKo(lane)} 쪽에 떨어져 있어서 `;
      if (!miss.dead && !miss.recall && !miss.tpCh && miss.tp) why += g.t >= miss.tpReady ? '(텔레포트는 있습니다) ' : '(텔레포트도 빠져 있어요) ';
    }
    this.say(g, 'anal', `${g.side[big].t.short} ${Math.max(A.length, Bp.length)}명 대 ${g.side[small].t.short} ${Math.min(A.length, Bp.length)}명. ${why}${this.josa(g.side[small].t.short, '이', '가')} 수에서 밀립니다.`);
  },
  // 한타가 끝난 뒤: 왜 이겼나 (인원 · 골드 · 조합 · 앞라인)
  sayWhy(g, f, res) {
    if (f.size < 5 || res.n + res.t < 2 || !f.n0) return;
    const w = res.wk, l = this.other(w), ws = g.side[w].t.short, ls = g.side[l].t.short, ld = w === 'B' ? f.lead0 : -f.lead0, cw = g.side[w].comp, cl = g.side[l].comp;
    const star = f.kb && [...f.kb.entries()].filter(([p]) => p.side === w).sort((a, b) => b[1] - a[1])[0];
    let t;
    if (f.n0[w] > f.n0[l]) t = `시작부터 ${f.n0[w]} 대 ${f.n0[l]}였죠. ${this.josa(ws, '이', '가')} 수적 우위를 그대로 살렸습니다.`;
    else if (f.n0[w] < f.n0[l]) t = `${this.josa(ws, '이', '가')} 한 명 적은데도 이겼어요! ${this.josa(ls, '은', '는')} 들어가는 타이밍이 다 따로였습니다.`;
    else if (g.side[w].baronUntil > g.t || g.side[w].elderUntil > g.t) t = `버프 차이가 그대로 나왔습니다. ${g.side[w].elderUntil > g.t ? '장로' : '바론'} 버프를 든 ${ws}와는 정면으로 못 싸워요.`;
    else if (ld > 3000) t = `골드 ${(ld / 1000).toFixed(1)}K 차이가 한타에서 그대로 보입니다. 아이템 한두 개 차이예요.`;
    else if (ld < -2000) t = `골드는 ${(-ld / 1000).toFixed(1)}K 뒤졌는데 한타를 이겼습니다! ${star ? `${this.josa(star[0].name, '이', '가')} 다 해 줬어요.` : '조합의 힘이죠.'}`;
    else if (cw.engage - cl.engage > .12) t = `이니시 차이입니다. ${ws} 쪽이 먼저, 원하는 자리에서 싸움을 열었어요.`;
    else if (cw.fight - cl.fight > .12) t = `한타 조합의 차이죠. 붙어서 싸우면 ${ws} 쪽이 더 셉니다.`;
    else { const fr = g.pl.find(p => p.side === w && p.kind === 'tank' && !p.dead); t = fr ? `${this.josa(fr.name, '이', '가')} 앞에서 버텨 준 덕에 뒤에서 딜러들이 편하게 쳤습니다.` : `집중 공격이 더 좋았어요. ${this.josa(ws, '은', '는')} 한 명씩 차례로 녹였습니다.`; }
    this.say(g, 'anal', t);
  },
  // 오브젝트가 나오기 1분 전
  preObj(g) {
    for (const o of ['drag', 'grubs', 'herald', 'baron']) {
      const ob = g.obj[o]; if (!ob.at || ob.ann === ob.at || ob.at - g.t > 60 || ob.at - g.t <= 40 || (ob.until && g.t >= ob.until)) continue;
      ob.ann = ob.at;
      const B = g.side.B, R = g.side.R, ahead = this.lead(g, 'B') >= 0 ? B : R;
      if (o === 'drag') {
        if (this.elder(g)) { this.say(g, 'cast', '1분 뒤 장로 드래곤입니다! 이 한타에 경기가 걸려 있어요!'); continue; }
        const s3 = [B, R].find(x => x.drag.length === 3), s2 = [B, R].find(x => x.drag.length === 2);
        this.say(g, 'anal', s3 ? `1분 뒤 드래곤. ${this.josa(s3.t.short, '이', '가')} 먹으면 영혼입니다. 상대는 무조건 막아야 해요.` : s2 ? `1분 뒤 드래곤입니다. ${this.josa(s2.t.short, '은', '는')} 이번에 먹으면 3스택, 영혼이 눈앞이에요.` : `1분 뒤 드래곤이 나옵니다. 바텀 주도권이 있는 쪽이 먼저 자리를 잡겠죠.`);
      } else if (o === 'baron') this.say(g, 'anal', `바론이 곧 나옵니다. ${this.josa(ahead.t.short, '이', '가')} 앞서 있으니 시야를 먼저 잡고 상대를 불러낼 거예요.`);
      else if (o === 'herald') this.say(g, 'anal', '1분 뒤 전령입니다. 먹는 쪽이 포탑 하나를 더 가져갑니다.');
      else this.say(g, 'anal', '곧 공허 유충이 나옵니다. 탑 · 정글이 먼저 움직이는 쪽이 챙겨요.');
    }
  },
  // 흐름 해설 재료: 운영 구도 · 조합 · 사이드
  flow(g, m) {
    const out = [];
    ['B', 'R'].forEach(k => {
      const s = g.side[k], n = s.t.short, top = g.pl.find(p => p.side === k && p.role === 'TOP'), bot = g.pl.find(p => p.side === k && p.role === 'BOT'), o = g.side[this.other(k)];
      if (s.ins.setup === '131') out.push(`${this.josa(n, '은', '는')} 1-3-1 구도입니다. ${this.josa(top.name, '과', '와')} ${this.josa(bot.name, '이', '가')} 양 사이드를 밀고 가운데 셋이 버텨요.`);
      if (s.ins.setup === 'five' && m >= 18) out.push(`${this.josa(n, '은', '는')} 다섯이 뭉쳐 다닙니다. 운영보다 한타로 풀겠다는 거죠.`);
      if (top.tac === 'split' && !top.dead) out.push(`${this.josa(top.name, '이', '가')} 탑 사이드를 계속 밉니다. 상대는 누군가 막으러 가야 해요.`);
      if (s.comp.late - o.comp.late > .12 && this.lead(g, k) < 2000) out.push(`${this.josa(n, '은', '는')} 후반 조합이라 급할 게 없습니다. 시간을 끌수록 유리해요.`);
      if (s.comp.early - o.comp.early > .12 && m >= 18 && this.lead(g, k) < 2000) out.push(`${this.josa(n, '은', '는')} 초반 조합인데 격차를 못 벌렸어요. 여기서 더 끌리면 힘듭니다.`);
      if (s.ins.vision === 'deep') out.push(`${this.josa(n, '은', '는')} 상대 정글 깊숙이 와드를 박고 있습니다. 동선은 보이지만 와드 박다 잘릴 수도 있어요.`);
      if (s.ins.aggr === 'aggr') out.push(`${n} 쪽은 싸움을 계속 겁니다. 교전 성향이 아주 적극적이에요.`);
      const carry = g.pl.filter(p => p.side === k && this.isCarry(p)).sort((a, b) => b.gold - a.gold)[0];
      if (carry && carry.k >= 4 && carry.d <= 1) out.push(`${this.josa(carry.name, '이', '가')} ${carry.k}킬 ${carry.d}데스로 잘 컸습니다. 한타에서 ${this.josa(this.cn(carry), '을', '를')} 누가 막느냐가 관건이에요.`);
    });
    out.push('사이드 라인 관리가 중요한 시간입니다.', '다음 오브젝트 앞 시야 싸움이 시작됩니다.');
    return this.pick(g, out);
  },
  fightEnd(g, f) {
    g.pl.forEach(p => { if (p.fled === f.id) p.fled = 0; });
    const nB = f.kills.B, nR = f.kills.R;
    const aB = this.alive(g, 'B').filter(p => this.dist(p.pos, f.at) < f.r + 6).length, aR = this.alive(g, 'R').filter(p => this.dist(p.pos, f.at) < f.r + 6).length;
    const wk = nB !== nR ? (nB > nR ? 'B' : 'R') : aB !== aR ? (aB > aR ? 'B' : 'R') : g.r() < .5 ? 'B' : 'R';
    const ace = (nB || nR) && this.alive(g, this.other(wk)).length === 0;
    const res = { wk, n: f.kills[wk], t: f.kills[this.other(wk)], ace, big: f.size >= 6, size: f.size, at: f.at };
    // 이긴 쪽이 숫자가 남으면 가장 가까운 라인으로 밀고 들어간다
    const wl = this.alive(g, wk).filter(p => this.dist(p.pos, f.at) < 30).length, deadL = g.pl.filter(p => p.side !== wk && p.dead).length;
    if (wl >= 3 && deadL >= 2 && this.min(g) >= 10) { const lane = ['top', 'mid', 'bot'].sort((a, b) => this.distLane(f.at, a) - this.distLane(f.at, b))[0]; g.side[wk].push = { lane, until: g.t + (ace ? 110 : 70) }; }
    if (f.onEnd) f.onEnd(res); else this.sayFight(g, res, f.where);
    this.sayWhy(g, f, res);
    // 궁극기 장면: 그 싸움에서 가장 많이 잡은 선수
    const star = f.kb && [...f.kb.entries()].filter(([p]) => p.side === wk).sort((a, b) => b[1] - a[1])[0];
    if (star && star[1] >= 2 && g.r() < .8) {
      const [p] = star, R = this.rName(p);
      this.say(g, 'cast', res.big ? `${p.name}! ${this.cn(p)}의 ${this.josa(R, '으로', '로')} 한타를 승리합니다!` : `${p.name}의 ${R}! 진영을 휩쓸며 ${f.where ? f.where + ' ' : ''}교전을 가져옵니다!`);
      if (res.big && g.r() < .6) this.say(g, 'hype', this.pick(g, [`와 이건 ${this.josa(p.name, '이', '가')} 다 했어요! ${R} 각을 너무 잘 봤습니다!`, `${p.name} 미쳤습니다! 저 ${R} 하나로 한타가 끝났어요!`]));
    }
  },
  sayFight(g, f, where) {
    if (!f) return;
    const ws = g.side[f.wk].t.short;
    if (!f.n && !f.t) { if (f.size >= 4 && g.r() < .4) this.say(g, 'anal', `${where ? where + '에서 ' : ''}부딪혔지만 둘 다 빠집니다. 킬 없이 체력만 주고받았어요.`); return; }
    if (f.ace) { this.say(g, 'cast', `에이스! ${this.josa(ws, '이', '가')} 상대를 전멸시킵니다!`); this.say(g, 'hype', this.pick(g, ['다 잡았어요! 이제 넥서스까지 갈 수 있습니다!', '전멸! 이건 경기 끝날 수도 있어요!'])); }
    // '대규모 교전'은 킬이 4개 이상 오간 한타에만 (킬 2~3개짜리에 붙던 문제)
    else if (f.big && f.n + f.t >= 4) this.say(g, 'cast', this.pick(g, [`한타 열립니다! ${this.josa(ws, '이', '가')} ${f.n}킬을 가져가요!`, `대규모 교전! ${ws} 쪽으로 기웁니다, ${f.n} 대 ${f.t}!`]));
    else if (f.big && f.n + f.t >= 3) this.say(g, 'cast', `한타 열립니다! ${this.josa(ws, '이', '가')} ${f.n}킬을 가져가요!`);
    else if (where === '정글' && f.n && !f.t && f.size <= 4 && g.r() < .6) this.say(g, 'anal', `시야 없는 정글에서 ${this.josa(g.side[this.other(f.wk)].t.short, '이', '가')} 끊겼습니다. 이런 데스가 제일 아파요.`);
    else if (where) this.say(g, 'cast', f.t ? `${where} 교전, ${f.n} 대 ${f.t}로 ${this.josa(ws, '이', '가')} 조금 더 챙깁니다.` : `${where} 교전, ${this.josa(ws, '이', '가')} ${f.n}킬을 챙깁니다.`);
  },
  // 텔레포트: 4초 정신집중(도착 지점에 효과) 뒤 도착. 그동안은 제자리
  teleport(g, p, to) {
    to = this.clampP(to);
    g.fx.push({ type: 'tp', side: p.side, at: to, from: [...p.pos], t: g.t, dur: this.TP_CH });
    p.tpCh = { to, at: g.t + this.TP_CH }; p.tpReady = g.t + (this.min(g) < 14 ? 360 : 240); p.hold = null;
  },
  // 교전 자리로 다가간다 (평소 속도, 몇 초 동안)
  engage(g, p, at, sec = 5) { p.hold = { to: this.clampP([at[0] + p.off[0] * .7, at[1] + p.off[1] * .7]), until: g.t + sec }; },
  // 본진 쪽으로 d만큼 물러난다
  retreat(g, p, d, wait = 0) { p.hold = { to: this.toward(p.pos, p.side, d), until: g.t + wait + Math.ceil(d / (this.SPEED / 10)) }; },

  // ---------- 구조물 ----------
  structOf(g, o, lane) {
    const s = g.side[o], nx = Rift.pos(o === 'B' ? 'bN' : 'rN');
    for (let i = 0; i < 3; i++) if (s.thp[lane][i] > 0) return { kind: 'tower', i, pos: Rift.pos(Rift.TOWER[o][lane][i]) };
    if (s.ihp[lane] > 0) return { kind: 'inhib', pos: Rift.INHIB[o][lane] };
    const ti = s.ntp.findIndex(h => h > 0);
    if (ti >= 0) return { kind: 'nexusT', i: ti, pos: [nx[0] + (o === 'B' ? 3 : -3) * (ti ? -1 : 1), nx[1] + (o === 'B' ? -3 : 3)] };
    return { kind: 'nexus', pos: nx };
  },
  hit(g, k, lane, st, dmg) {
    const o = this.other(k), s = g.side[o], lk = this.laneKo(lane), ks = g.side[k].t.short;
    if (st.kind === 'tower') {
      s.thp[lane][st.i] -= dmg; if (s.thp[lane][st.i] > 0) return;
      s.thp[lane][st.i] = 0; s.towers[lane]--; s.down++;
      const nm = ['외곽 포탑', '내부 포탑', '억제기 포탑'][st.i];
      g.pl.filter(p => p.side === k && !p.dead).forEach(p => { p.gold += st.i === 0 && this.min(g) < 14 ? 250 : 120; });
      this.mark(g, k, 'tower', 'tower', `${lk} ${nm} 파괴`); g.fx.push({ type: 'tower', at: st.pos, t: g.t, side: k });
      if (g.r() < .6) this.say(g, 'anal', `${this.josa(ks, '이', '가')} ${lk} ${this.josa(nm, '을', '를')} 철거합니다.`);
    } else if (st.kind === 'inhib') {
      s.ihp[lane] -= dmg; if (s.ihp[lane] > 0) return;
      s.ihp[lane] = 0; s.inhib[lane] = 0;
      this.mark(g, k, 'inhib', 'inhibitor', `${lk} 억제기 파괴`); g.fx.push({ type: 'tower', at: st.pos, t: g.t, side: k });
      this.say(g, 'cast', `억제기까지 깨집니다! ${this.josa(ks, '이', '가')} 슈퍼 미니언을 앞세웁니다.`);
    } else if (st.kind === 'nexusT') {
      s.ntp[st.i] -= dmg; if (s.ntp[st.i] > 0) return;
      s.ntp[st.i] = 0; s.nexusT--; s.down++; this.mark(g, k, 'nexusT', 'tower', '쌍둥이 포탑 파괴'); g.fx.push({ type: 'tower', at: st.pos, t: g.t, side: k });
    } else { s.nxhp -= dmg; if (s.nxhp <= 0) this.endGame(g, k); }
  },
  // 공성: 구조물 옆에 있는 인원만큼 깎는다. 수비가 있으면 2명 이상 많을 때만
  siege(g, m) {
    // 넥서스 쪽 공격부터 처리한다 (넥서스가 깨지는 순간에 진 팀이 다른 구조물을 가져가지 않게)
    const order = ['B', 'R'].flatMap(k => ['top', 'mid', 'bot'].map(lane => [k, lane])).sort((x, y) => (/nexus/.test(this.structOf(g, this.other(y[0]), y[1]).kind) ? 1 : 0) - (/nexus/.test(this.structOf(g, this.other(x[0]), x[1]).kind) ? 1 : 0));
    order.forEach(([k, lane]) => {
      if (g.over) return;
      const o = this.other(k), st = this.structOf(g, o, lane);
      const atk = this.near(g, k, st.pos, 9); if (!atk.length) return;
      const def = this.near(g, o, st.pos, 13).length;
      if (def && atk.length < def + 2) return;
      const plate = st.kind === 'tower' && st.i === 0 && m < 14;
      // 포탑 하나에 4명이 붙어 약 30초. 너무 이른 시간에는 안쪽 구조물이 잘 안 깨진다 (내부 16분 · 억제기 20분 전)
      const deep = st.kind === 'inhib' || (st.kind === 'tower' && st.i === 2) || st.kind === 'nexusT' || st.kind === 'nexus';
      if ((deep && m < 14) || ((st.kind === 'nexusT' || st.kind === 'nexus') && m < 21)) return;   // 실제 경기에서 이 시간 전에는 거의 안 깨진다
      const early = st.kind === 'tower' && st.i === 1 && m < 14 ? .6 : deep && m < 23 ? .18 : deep && m < 28 ? .45 : 1;
      const dmg = atk.length * (plate ? .05 : st.kind === 'nexus' ? .2 : st.i === 0 ? .14 : deep ? .14 : .11) * (g.side[k].baronUntil > g.t ? 1.6 : 1) * early * this.SIEGE_K * (1 + Math.max(0, Math.min(1, (this.lead(g, k) - 6000) / 8000)) * this.CLOSE);   // 크게 앞선 팀은 킬을 쌓지 않고 경기를 끝낸다
      this.hit(g, k, lane, st, dmg);
    });
    // 웨이브 압박: 전선이 상대 포탑 앞까지 밀리면 미니언이 (수비가 있어도) 포탑을 깎는다. 라인에 아군이 있어야 웨이브가 버틴다
    if (m >= 4) ['top', 'mid', 'bot'].forEach(lane => {
      const fr = this.front(g, lane);
      ['B', 'R'].forEach(k => {
        const o = this.other(k), st = this.structOf(g, o, lane); if (st.kind !== 'tower' || g.over) return;
        const pr = g.pl.some(q => q.side === k && !q.dead && q.tac === 'press' && this.LANE_OF[q.role] === lane && q.role !== 'SUP') ? .09 : .06;   // 압박 전술은 포탑을 더 자주 두드린다
        const ts = Rift.proj(lane, st.pos).s, reach = k === 'B' ? fr >= ts - pr : fr <= ts + pr;
        if (!reach || !this.near(g, k, st.pos, 22).length) return;
        const deep = st.i === 2 && m < 22 ? .3 : st.i === 1 && m < 14 ? .5 : 1;
        this.hit(g, k, lane, st, (m < 14 ? .035 : .05) * deep);
      });
    });
    // 억제기가 깨진 라인은 슈퍼 미니언이 계속 밀고 들어간다
    ['B', 'R'].forEach(k => ['top', 'mid', 'bot'].forEach(lane => {
      const o = this.other(k); if (g.over || g.side[o].ihp[lane] > 0) return;
      const st = this.structOf(g, o, lane); if ((st.kind === 'nexusT' || st.kind === 'nexus') && !this.near(g, o, st.pos, 15).length) this.hit(g, k, lane, st, .05);
    }));
  },

  // ---------- 오브젝트 ----------
  // 오브젝트 우선순위 (+1 우선 · 0 · -1 양보)
  objPri(g, k, o) { const x = g.side[k].ins.obj; if (x === 'bal') return 0; const top = o === 'grubs' || o === 'herald' || o === 'baron'; return x === 'top' ? (top ? 1 : -1) : (top ? (o === 'baron' ? 0 : -1) : 1); },
  // 이 팀 쪽 라인에 시야가 있나 (깊은 시야는 늘, 시야 서폿은 와드 동선 뒤 잠시)
  wardOn(g, k, lane) { const s = g.side[k]; return s.ins.vision === 'deep' || (s.ward && s.ward.until > g.t && s.ward.lanes.includes(lane)) || (lane !== 'top' && g.pl.some(p => p.side === k && !p.dead && (p.fx || {}).vision)); },   // 천리안: 바텀·미드는 늘
  elder(g) { return g.side.B.drag.length >= 4 || g.side.R.drag.length >= 4; },
  objUp(g, o) { const ob = g.obj[o]; return ob.at && g.t >= ob.at && (!ob.until || g.t < ob.until); },
  baronCall(g, k) {
    if (!this.objUp(g, 'baron')) return false;
    const deadO = g.pl.filter(p => p.side !== k && p.dead).length, deadK = g.pl.filter(p => p.side === k && p.dead).length;
    const m = this.min(g), lead = this.lead(g, k);
    const mine = lead > 7000 || (deadO - deadK >= 3 && lead > -2000) || (m >= 24 && (lead > 3000 || deadO - deadK >= 2)) || (m >= 30 && lead > 1500) || m >= 38;
    const contest = this.near(g, this.other(k), Rift.pos('BAR'), 18).length >= 3 && this.lead(g, k) > -6000;
    return mine || contest;
  },
  objFor(g, p, m) {
    for (const o of ['drag', 'grubs', 'herald', 'baron']) {
      const ob = g.obj[o]; if (!ob.at || (ob.until && g.t >= ob.until)) continue;
      const pri = this.objPri(g, p.side, o), vis = { deep: 20, norm: 0, home: -20 }[g.side[p.side].ins.vision];
      const go = (ob.go && ob.go[p.side]) || ob.at, early = ((p.role === 'JGL' && p.tac === 'obj') || (p.role === 'MID' && p.tac === 'join') ? 40 : 0) + pri * 30 + vis;   // 우선 오브젝트·깊은 시야는 먼저 자리 잡는다
      if (o === 'baron' ? !this.baronCall(g, p.side) || g.t < go - 30 - early : go - g.t > 60 + early) continue;
      const roles = m >= 20 && o === 'drag' ? ['JGL', 'MID', 'BOT', 'SUP', p.tac === 'split' ? '' : 'TOP'] : this.OBJ_ROLES[o];
      if (!roles.includes(p.role)) continue;
      // 많이 밀리거나 2명 이상 죽었으면 내준다
      const k = p.side, deadK = g.pl.filter(q => q.side === k && q.dead).length, deadO = g.pl.filter(q => q.side !== k && q.dead).length;
      if (o !== 'baron' && (deadK - deadO >= 2 + (pri > 0 ? 1 : 0) || (1 / (1 + Math.exp(-(this.tpow(g, k) - this.tpow(g, this.other(k))) / 13)) < (pri > 0 ? .2 : pri < 0 ? .5 : .33)))) continue;   // 우선 오브젝트는 끝까지, 나머지는 쉽게 내준다
      const pit = Rift.pos(this.PIT[o]), spot = [pit[0] + p.off[0], pit[1] + p.off[1]];
      return g.t >= go ? spot : this.toward(spot, p.side, 6);             // 준비가 끝나기 전에는 강 입구에서 대기
    }
    return null;
  },
  objectives(g, m) {
    for (const o of ['drag', 'grubs', 'herald', 'baron']) {
      if (!this.objUp(g, o) || g.over) continue;
      const ob = g.obj[o], pit = Rift.pos(this.PIT[o]), ready = k => g.t >= ((ob.go && ob.go[k]) || ob.at);
      const nb = ready('B') ? this.near(g, 'B', pit, 16) : [], nr = ready('R') ? this.near(g, 'R', pit, 16) : [];
      let wk = null;
      if (g.fights.some(f => this.dist(f.at, pit) < 22)) continue;          // 둥지 앞에서 싸우는 중에는 못 친다
      if (nb.length && nr.length && !ob.fought) {
        ob.fought = true;                                              // 오브젝트 한타는 생성마다 한 번
        this.fightAt(g, pit, 20, { where: `${this.OBJ[o]} 앞` });
        continue;
      } else if (nb.length && nr.length) {
        const db = this.tpow(g, 'B', nb) + nb.length * 6 - this.tpow(g, 'R', nr) - nr.length * 6, k = db > 0 || (db === 0 && g.r() < .5) ? 'B' : 'R';
        this.near(g, this.other(k), pit, 20).forEach(p => this.retreat(g, p, 16));
        ob.prog[k] = (ob.prog[k] || 0) + 10 * this.near(g, k, pit, 20).length; if (ob.prog[k] >= this.OBJ_NEED[o]) wk = k;
      } else for (const [k, ps] of [['B', nb], ['R', nr]]) {
        if (!ps.length) continue;
        ob.prog[k] = (ob.prog[k] || 0) + 10 * ps.length;
        if (ob.prog[k] >= this.OBJ_NEED[o]) { wk = k; if (g.r() < .5) this.say(g, 'anal', `${this.josa(g.side[this.other(k)].t.short, '이', '가')} 대응을 못 합니다. ${this.josa(g.side[k].t.short, '이', '가')} ${this.josa(this.OBJ[o], '을', '를')} 챙겨요.`); }
      }
      if (!wk) continue;
      // 오브젝트 도둑: 상대가 치는 걸 가로챈다
      const thief = this.near(g, this.other(wk), pit, 16).find(p => (p.fx || {}).steal && g.r() < p.fx.steal);
      if (thief) { this.say(g, 'cast', `${thief.name}의 스틸! ${this.josa(this.OBJ[o], '을', '를')} 빼앗아 갑니다!`); wk = thief.side; }
      const s = g.side[wk];
      ob.prog = {}; if (o !== 'grubs' || (ob.left ?? 3) <= 1) ob.fought = false;
      if (o === 'drag') {
        if (this.elder(g)) {
          // 영혼이 나온 뒤에는 장로 드래곤: 2분 30초 동안 강력한 버프
          s.elder = (s.elder || 0) + 1; s.elderUntil = g.t + 150;
          this.mark(g, wk, 'drag', 'dragon_elder', '장로 드래곤 처치');
          this.say(g, 'cast', `${s.t.short}, 장로 드래곤 획득! 지금 싸우면 녹아내립니다!`);
          ob.at = g.t + 360; this.objGo(g, ob);
        } else {
          const n = g.side.B.drag.length + g.side.R.drag.length, d = g.dragSeq[Math.min(n, 2)]; s.drag.push(d);
          this.mark(g, wk, 'drag', d[1], `${d[0]} 드래곤 처치`);
          if (s.drag.length === 3) this.say(g, 'anal', `${s.t.short} 드래곤 3스택! 다음 용이 영혼입니다.`);
          if (s.drag.length === 4) { this.say(g, 'cast', `${s.t.short}, ${d[0]} 드래곤 영혼 획득! 한타 주도권이 넘어갑니다!`); ob.at = g.t + 360; }
          else ob.at = g.t + 330;
          this.objGo(g, ob);
        }
      } else if (o === 'grubs') {
        // 유충 3마리는 한 마리씩: 상대가 오면 나눠 먹기도 한다
        ob.left = (ob.left ?? 3) - 1; s.grubs++;
        this.mark(g, wk, 'grubs', 'grub', `공허 유충 처치 (${3 - ob.left}/3)`);
        if (ob.left > 0) continue;
        const o2 = g.side[this.other(wk)];
        if (o2.grubs) this.say(g, 'anal', `유충은 ${s.t.short} ${s.grubs}마리, ${o2.t.short} ${o2.grubs}마리로 나눠 가졌습니다.`);
        ob.at = null;
      }
      else if (o === 'herald') { s.herald++; this.mark(g, wk, 'herald', 'riftherald', '전령 처치'); ob.at = null; s.push = { lane: g.r() < .5 ? 'top' : 'mid', until: g.t + 60 }; this.say(g, 'anal', `${this.josa(s.t.short, '이', '가')} 전령을 ${this.laneKo(s.push.lane)}에 풀러 갑니다.`); }
      else {
        s.baron++; s.baronUntil = g.t + 180; this.mark(g, wk, 'baron', 'baron', '바론 처치'); ob.at = g.t + 420; this.objGo(g, ob);
        this.say(g, 'cast', `${s.t.short}, 바론 획득! 정비하고 공성을 시작합니다.`);
        s.push = { lane: ['mid', 'bot', 'top'].sort((a, b) => g.side[this.other(wk)].towers[a] - g.side[this.other(wk)].towers[b])[0], until: g.t + 170 };
      }
      s.reset = g.t;   // 오브젝트 뒤에는 다 같이 귀환해서 정비
    }
  },

  // ---------- 정글러 ----------
  // 첫 정글: 버프에서 시작해 6캠프 → 바위게 → 갱 또는 캠프. 갱은 상대 라이너에게 실제로 걸어가서 건다
  jungle(g, p, m) {
    const own = n => Rift.pos((p.side === 'B' ? 'b' : 'r') + n), s = g.side[p.side];
    if (!p.jq.length) {
      if (g.t < 90) p.jq = [{ pos: own(s.jstart === 'top' ? 'JB' : 'JD'), wait: 99, until: 90 }];
      else if (!p.cleared) {
        const order = s.jstart === 'top' ? ['JB', 'JG', 'JW', 'JR', 'JD', 'JK'] : ['JD', 'JK', 'JR', 'JW', 'JB', 'JG'];
        p.jq = order.map(n => ({ pos: own(n), wait: 15 }));
        p.jq.push({ pos: Rift.pos(s.jstart === 'top' ? (p.side === 'B' ? 'RVbm' : 'RVtm') : (p.side === 'B' ? 'RVtm' : 'RVbm')), wait: 10, kind: 'crab' });
        p.cleared = true;
      } else {
        const gankRate = .35 + p.st.early * .3 + (p.tac === 'gank' ? .25 : 0) - (p.tac === 'farm' ? .2 : 0) - (p.tac === 'invade' ? .1 : 0);
        if (m < 15 && g.r() < gankRate) {
          const L = ['top', 'mid', 'bot'].map(l => { const e = g.pl.find(q => q.side !== p.side && !q.dead && !q.recall && this.LANE_OF[q.role] === l && q.role !== 'SUP' && this.distLane(q.pos, l) < 6 && this.dist(q.pos, this.fountain(q.side)) > 40); return { l, e, w: e ? (1.3 - e.hp) + g.r() * .6 + (s.focus === l ? .5 : 0) : 0 }; }).sort((a, b) => b.w - a.w)[0];   // 라커룸에서 정한 공략 라인을 먼저
          // 상대 서폿이 시야를 깔아 둔 쪽(바텀·미드)은 동선이 들켜 갱을 접기도 한다
          const seen = L.e && this.wardOn(g, this.other(p.side), L.l) && g.r() < .35;
          if (L.e && !seen) { p.jq = [{ kind: 'gank', e: L.e, lane: L.l, pos: L.e.pos, left: 6 }]; if (g.r() < .45) this.say(g, 'anal', L.e.hp < .6 ? `${p.name}, ${this.josa(this.laneKo(L.l), '으로', '로')} 방향을 틉니다. ${L.e.name}의 체력이 ${Math.round(L.e.hp * 100)}%밖에 안 돼요.` : `${p.name}, ${this.laneKo(L.l)} 갱킹 각을 봅니다. 그쪽에 상대 시야가 없어요.`); }
          else if (L.e && seen && g.r() < .6) this.say(g, 'anal', `${p.name}의 동선이 와드에 보였습니다. ${this.laneKo(L.l)} 갱킹은 접어요.`);
        }
        // 카정: 상대 정글 안쪽이 아닌 강가 쪽 캠프로 들어간다
        const foe = n => Rift.pos((p.side === 'B' ? 'r' : 'b') + n);
        if (!p.jq.length && (p.tac === 'invade' || (p.fx || {}).invade) && m < 15 && g.r() < (g.side[this.other(p.side)].ins.vision === 'home' ? .2 : .4) * ((p.fx || {}).invade || 1) * (p.tac === 'invade' ? 1 : .5)) {   /* 상대가 자기 정글 시야를 잡고 있으면 카정이 어렵다 */ p.jq = [{ pos: foe(g.r() < .5 ? 'JW' : 'JR'), wait: 15, invade: true }]; p.invades = (p.invades || 0) + 1; }
        // 오브젝트 중심: 생성 75초 전부터 그쪽 강가에서 시야를 잡고 기다린다
        const nextObj = ['drag', 'grubs', 'herald'].find(o => { const ob = g.obj[o]; return ob.at && (!ob.until || g.t < ob.until) && ob.at - g.t > 0 && ob.at - g.t <= 75; });
        if (!p.jq.length && p.tac === 'obj' && nextObj) p.jq = [{ pos: this.toward(Rift.pos(this.PIT[nextObj]), p.side, 8), wait: 20, kind: 'setup' }];
        if (!p.jq.length) p.jq = Rift.CAMPS.slice().sort(() => g.r() - .5).slice(0, 2).map(n => ({ pos: own(n), wait: 15 }));
      }
    }
    const head = p.jq[0];
    if (head.kind === 'gank') {
      // 대상이 죽었거나 귀환했거나 너무 오래 걸리면 포기
      if (head.e.dead || head.e.recall || --head.left < 0 || this.dist(head.e.pos, this.fountain(head.e.side)) < 40) { p.jq = []; return p.pos; }   // 본진까지는 쫓아가지 않는다
      head.pos = this.toward(head.e.pos, p.side, 2);
      if (this.dist(p.pos, head.pos) < 6) {
        p.jq.shift();
        this.fightAt(g, head.e.pos, 12, { bonus: { side: p.side, v: 6 }, onEnd: f => { if (f.n) this.say(g, f.wk === p.side ? 'cast' : 'anal', f.wk === p.side ? `${p.name}의 갱킹! ${this.laneKo(head.lane)}에서 킬이 나옵니다!` : `갱킹을 받아쳤어요! ${this.josa(g.side[f.wk].t.short, '이', '가')} 잘 대응합니다.`); else if (g.r() < .4) this.say(g, 'anal', `${p.name}의 갱킹, 점멸 빼고 살아 나갑니다.`); } });
        return p.pos;
      }
      return head.pos;
    }
    if (head.until && g.t >= head.until) { p.jq.shift(); return this.jungle(g, p, m); }
    if (this.dist(p.pos, head.pos) < 3) {
      head.wait -= 10;
      if (head.wait <= 0) p.jq.shift();
      if (!head.until) { p.cs += head.kind ? (head.kind === 'crab' ? 1 : 0) : 3.6; p.gold += head.kind === 'setup' ? 0 : head.kind ? 40 : 45; }   // 캠프 하나 약 7 CS (실제 10분 정글 CS 약 60)
    }
    return head.pos;
  },

  // ---------- 위치 ----------
  // 라인 전선: 웨이브가 밀고 당겨지고, 포탑·골드·매치업에 따라 기운다. 맞상대와는 사거리만큼 떨어져 선다
  // 라인 전선 (블루 기준 s, 0=블루 넥서스): 웨이브가 밀고 당겨지고, 포탑·골드·매치업에 따라 기운다
  front(g, lane) {
    // 웨이브 흐름: 경기·라인마다 위상이 다르다 (위상이 고정이면 웨이브 압박이 시작되는 4분 직후에 늘 같은 쪽이 밀려 레드가 유리했다)
    const m = this.min(g), wave = Math.sin(g.t / 26 + ((g.wph ||= { top: g.r() * 6.283, mid: g.r() * 6.283, bot: g.r() * 6.283 })[lane])) * (m < 14 ? .13 : .16);
    const mu = ((g.pl.find(q => q.side === 'B' && this.LANE_OF[q.role] === lane && q.role !== 'SUP') || { mu: { wr: .5 } }).mu.wr - .5) * .2;
    // 라인 전술: 압박은 전선을 앞으로, 버티기는 자기 포탑 쪽으로
    const tac = k => { const q = g.pl.find(x => x.side === k && !x.dead && this.LANE_OF[x.role] === lane && x.role !== 'SUP'); return q ? q.tac : null; };
    const lean = (tac('B') === 'press' ? .03 : tac('B') === 'hold' ? -.045 : 0) - (tac('R') === 'press' ? .03 : tac('R') === 'hold' ? -.045 : 0);
    const f = .5 + ((3 - g.side.R.towers[lane]) - (3 - g.side.B.towers[lane])) * .08 + Math.max(-.08, Math.min(.08, this.lead(g, 'B') / 20000)) + mu + wave + lean;
    // 전선은 양 팀의 맨 앞 구조물 사이에서만 움직인다 (살아 있는 포탑을 넘어 서지 않는다)
    const hi = Rift.proj(lane, this.structOf(g, 'R', lane).pos).s - .02, lo = Rift.proj(lane, this.structOf(g, 'B', lane).pos).s + .02;
    return Math.max(Math.max(.12, lo), Math.min(Math.min(.88, hi), f));
  },
  laneSpot(g, p, m, lane) {
    const sign = p.side === 'B' ? 1 : -1, front = this.front(g, lane);
    const pt = Rift.lane(lane, front - .03 * sign);
    return this.clampP(p.role === 'SUP' ? [pt[0] + p.off[0] * .6 + sign, pt[1] + p.off[1] * .6 + sign] : [pt[0] + p.off[0] * .4, pt[1] + p.off[1] * .4]);
  },
  // 상대 구조물 앞: 수비가 있고 숫자가 모자라면 포탑 사거리 밖에서 대치, 아니면 붙어서 친다
  siegeSpot(g, p, lane) {
    const o = this.other(p.side), st = this.structOf(g, o, lane);
    const def = this.near(g, o, st.pos, 14).length, atk = this.near(g, p.side, st.pos, 22).length;
    const q = this.before(lane, st.pos, p.side, def >= 2 && atk < def + 2 ? 12 : 3);
    return this.clampP([q[0] + p.off[0], q[1] + p.off[1]]);
  },
  groupSpot(g, p, m) {
    const lead = this.lead(g, p.side);
    if (lead > 2500) return this.siegeSpot(g, p, 'mid');
    if (lead < -2500) { const st = this.structOf(g, p.side, 'mid'), q = this.before('mid', st.pos, this.other(p.side), 2); return this.clampP([q[0] + p.off[0], q[1] + p.off[1]]); }
    return this.laneSpot(g, p, m, 'mid');
  },
  target(g, p, m) {
    const s = g.side[p.side];
    if (s.push && s.push.until > g.t) {
      const st = this.structOf(g, this.other(p.side), s.push.lane), deep = st.kind !== 'tower' || st.i === 2;
      if (!(deep && m < 14)) return this.siegeSpot(g, p, s.push.lane);           // 14분 전에는 억제기 쪽까지 밀고 들어가지 않는다
    }
    const ob = this.objFor(g, p, m); if (ob) return ob;
    if (m < 14) {
      if (p.role === 'JGL') return this.jungle(g, p, m);
      if (p.roam > g.t) return p.roamTo;
      const sideR = 'RVbm', topR = 'RVtm';   // 바텀 쪽 강가 · 탑 쪽 강가
      if (p.role === 'SUP') {
        // 로밍 / 시야 장악(강가·오브젝트 둥지에 와드) / 바텀 고정·원딜 보호(라인을 떠나지 않음)
        if (m >= 3 && g.t % 150 < 10 && !['lane', 'protect'].includes(p.tac)) {
          if (p.tac === 'vision' ? g.r() < .75 : g.r() < (p.tac === 'roam' ? .7 : .3)) {
            p.roam = g.t + 30;
            if (p.tac === 'vision') { p.roamTo = g.r() < .6 ? Rift.pos(sideR) : this.toward(Rift.pos(g.r() < .6 ? 'DRA' : 'BAR'), p.side, 7); g.side[p.side].ward = { until: g.t + 120, lanes: ['bot', 'mid'] }; p.wardTrips = (p.wardTrips || 0) + 1; }
            else { p.roamTo = g.r() < .5 ? this.laneSpot(g, p, m, 'mid') : Rift.pos(sideR); p.roams = (p.roams || 0) + 1; }
            return p.roamTo;
          }
        }
      }
      if (p.role === 'MID' && m >= 3.5 && g.t % 120 < 10 && g.r() < (p.tac === 'roam' ? .55 : p.tac === 'farm' ? .05 : .15) * ((p.fx || {}).roam || 1)) {
        // 미드 로밍: 웨이브를 밀어 두고 사이드 라인·강가로
        const to = g.r(); p.roam = g.t + 35; p.roams = (p.roams || 0) + 1;
        p.roamTo = to < .4 ? this.laneSpot(g, p, m, 'bot') : to < .7 ? this.laneSpot(g, p, m, 'top') : Rift.pos(g.r() < .5 ? sideR : topR);
        return p.roamTo;
      }
      if (p.role === 'TOP' && p.tac === 'skirm' && m >= 5 && g.t % 120 < 10 && g.r() < .35) { p.roam = g.t + 25; p.roams = (p.roams || 0) + 1; p.roamTo = Rift.pos('RVt'); return p.roamTo; }
      return this.laneSpot(g, p, m, this.LANE_OF[p.role]);
    }
    if (p.role === 'SUP' && p.tac === 'protect') { const ad = g.pl.find(q => q.side === p.side && q.role === 'BOT' && !q.dead && !q.recall); if (ad && ad.goal) return this.clampP([ad.goal[0] + p.off[0] * .6, ad.goal[1] + p.off[1] * .6]); }   // 원딜 곁을 떠나지 않는다
    // 중후반: 실제 경기처럼 흩어져 있다 (같이 다니는 인원 20분 약 3명, 30분 약 3.4명 — 솔랭 타임라인). 모이는 건 오브젝트·공성·한타 호출 때만
    // 운영 구도 지시: 5인 뭉치기(18분부터 다 같이) / 1-4(탑이 사이드) / 1-3-1(탑·원딜이 양 사이드)
    const lead = this.lead(g, p.side), call = Math.abs(lead) > 4000 || m >= 30, setup = s.ins.setup;
    if (p.role === 'TOP' && setup === 'five' && m >= 18 && p.tac !== 'split') return this.groupSpot(g, p, m);
    if (p.role === 'TOP' && (setup === '131' || p.tac === 'split' || m < 28 || !call) && !(p.tac === 'skirm' && m >= 18)) return this.laneSpot(g, p, m, 'top');
    if (p.role === 'BOT' && setup === '131' && m < 36) return this.laneSpot(g, p, m, 'bot');
    if (p.role === 'BOT' && m < (setup === 'five' ? 18 : p.tac === 'join' ? 18 : p.tac === 'safe' ? 26 : 23)) return this.laneSpot(g, p, m, 'bot');
    if (p.role === 'SUP' && m < 23) { const ad = g.pl.find(q => q.side === p.side && q.role === 'BOT' && !q.dead); return ad && this.LANE_OF.BOT === 'bot' && ad.goal && this.distLane(ad.goal, 'bot') < 8 ? this.clampP([ad.goal[0] + p.off[0] * .7, ad.goal[1] + p.off[1] * .7]) : this.toward(Rift.pos('DRA'), p.side, 9); }
    if (p.role === 'JGL' && m < 28 && !Object.keys(g.obj).some(k => g.obj[k].at && g.obj[k].at - g.t < 90 && (!g.obj[k].until || g.t < g.obj[k].until))) return this.jungle(g, p, m);
    if (p.role === 'MID' && !call) return this.laneSpot(g, p, m, 'mid');
    return this.groupSpot(g, p, m);
  },

  // ---------- 귀환 ----------
  nextCost(p) { const t = p.build.core.find(it => !this.has(p, it.n)); if (!t) return 9999; const part = this.nextPart(p, t, 99999); return Math.min(t.gold - this.owned(p, t).reduce((a, x) => a + x.gold, 0), part ? Math.max(part.need, 800) : 9999); },
  decideRecalls(g, m) {
    g.pl.forEach(p => {
      if (p.dead || p.recall) return;
      const s = g.side[p.side];
      if (this.dist(p.pos, this.fountain(p.side)) < 14) return;
      if (this.near(g, this.other(p.side), p.pos, 14).length) return;            // 적이 근처에 있으면 못 탄다
      const busy = (s.push && s.push.until > g.t) || this.objFor(g, p, m) || (p.jq[0] && p.jq[0].kind === 'gank');
      const money = this.free(p) >= Math.max(m < 14 ? 1250 : 1100, this.nextCost(p)) && g.t - p.lastBack >= (m < 14 ? 180 : 210) && m >= 3.3;
      const reset = g.t - s.reset < 25 && g.t - p.lastBack > 60;
      if (p.hp < .25 || (!busy && (reset || (money && g.r() < .35)))) {
        p.recall = g.t + this.RECALL_CH; p.jq = []; p.hold = null;
        g.fx.push({ type: 'recall', side: p.side, at: [...p.pos], t: g.t, dur: this.RECALL_CH });
      }
    });
  },
  // 우물 도착: 상점 → 텔레포트가 있으면 자기 라인(아군 쪽 전선)으로만 순간이동
  atBase(g, p, m) {
    p.pos = [...this.fountain(p.side)]; p.trail = [p.pos]; p.warp = g.t; p.hp = 1; p.lastBack = g.t; p.hold = null; p.rt = null; p.fled = 0;
    const big0 = p.inv.filter(i => i.gold >= 2500).length; this.shop(g, p);
    const bigs = p.inv.filter(i => i.gold >= 2500); if (g.t > 0 && bigs.length > big0 && this.isCarry(p) && g.r() < .3) this.say(g, 'anal', `${p.name}, 귀환해서 ${this.josa(bigs[bigs.length - 1].ko, '을', '를')} 완성했습니다. ${bigs.length}코어예요.`);
    if (!p.tp || g.t < p.tpReady || m < 3 || (g.side[p.side].push && g.side[p.side].push.until > g.t)) return;
    const lane = this.LANE_OF[p.role], spot = this.laneSpot(g, p, m, lane);
    if (this.dist(this.target(g, p, m), spot) > 12 || this.dist(p.pos, spot) < 45 || this.near(g, this.other(p.side), spot, 6).length > 1) return;
    this.teleport(g, p, spot);
  },

  // ---------- 진행 (1초) ----------
  // 매초: 텔레포트 도착 · 부활 · 귀환 완료 · 이동(평소 속도) · 미뤄 둔 처치. 10초마다: 성장 · 사건 판정 · 다음 목적지
  step(g) {
    if (g.over) return;
    const prev = this.audit ? g.pl.map(p => [...p.pos]) : null;
    g.t += 1;
    const m = this.min(g), dec = g.t % 10 === 0, v = this.SPEED / 10;
    g.pl.forEach(p => { p.trail = null; p.budget = v; });
    g.pl.forEach(p => {
      if (p.tpCh && g.t >= p.tpCh.at) { p.pos = p.tpCh.to; p.trail = [p.pos]; p.warp = g.t; p.tpCh = null; p.rt = null; }
      if (p.dead && g.t >= p.dead) { p.dead = 0; this.atBase(g, p, m); }
      if (p.dead) { if (p.dead - g.t > 0 && this.dist(p.pos, this.fountain(p.side)) > .1) { p.pos = [...this.fountain(p.side)]; p.trail = [p.pos]; p.warp = g.t; } return; }
      if (p.recall && g.t >= p.recall) { p.recall = 0; this.atBase(g, p, m); }
    });
    // 이동: 목적지(10초마다 정함) 또는 잠깐의 교전·후퇴 지점으로, 1초에 SPEED/10. 서 있을 때는 제자리에서 조금씩 움직인다
    g.pl.forEach((p, i) => {
      if (p.dead || p.recall || p.tpCh || p.warp === g.t) return;
      if (p.hold && p.hold.until <= g.t) p.hold = null;
      let to = p.hold ? p.hold.to : p.goal; if (!to) return;
      if (this.dist(p.pos, to) < 2.5) to = this.clampP([to[0] + Math.sin((g.t + i * 13) / 6) * 1.1, to[1] + Math.cos((g.t + i * 7) / 8) * 1.1]);
      const dv = p.dash >= g.t && p.hold ? v * this.KIND[p.kind].dash : v; p.budget = dv;
      this.walk(p, to, dv);
    });
    this.fightTick(g);
    if (dec && !g.over) this.decide(g, m);
    g.fx = g.fx.filter(f => g.t - f.t <= (f.dur || 2));
    if (prev) g.pl.forEach((p, i) => {
      const d = this.dist(prev[i], p.pos);
      if (d > v * (p.dash >= g.t - 1 ? this.KIND[p.kind].dash : 1) + .6 && p.warp !== g.t && !p.dead) this.audit.push(`${this.clock(g.t)} 순간 이동 ${p.name} ${prev[i].map(Math.round)} → ${p.pos.map(Math.round)} (${d.toFixed(1)})`);
      if (!p.dead && Rift.wall(p.pos)) this.audit.push(`${this.clock(g.t)} 벽 안 ${p.name} ${p.pos.map(v => v.toFixed(1))}`);
      if (p.pos[0] < 2 || p.pos[0] > 98 || p.pos[1] < 2 || p.pos[1] > 98) this.audit.push(`${this.clock(g.t)} 맵 밖 ${p.name} ${p.pos.map(Math.round)}`);
      if (!p.dead && m < 12 && dec && this.dist(p.pos, this.fountain(this.other(p.side))) < 22) this.audit.push(`${this.clock(g.t)} 초반 상대 본진 ${p.name} ${p.pos.map(Math.round)}`);
    });
  },
  // 10초마다: 성장 · 사건 · 귀환 판단 · 다음 목적지
  decide(g, m) {
    ['B', 'R'].forEach(k => { const s = g.side[k]; if (s.push && s.push.until <= g.t) { s.push = null; s.reset = g.t; } });
    g.pl.forEach(p => {
      if (p.dead || p.recall) return;
      const lane = this.LANE_OF[p.role], inLane = p.role !== 'JGL' && p.role !== 'SUP' && this.distLane(p.pos, lane) < 6;
      if (p.role === 'SUP') p.gold += 7;
      const cs = p.role === 'SUP' ? .15 : p.role === 'JGL' ? (m < 14 ? 0 : 1) : (inLane || m >= 14 ? 1.5 : .3) * (['farm', 'safe', 'hold'].includes(p.tac) ? 1.08 : 1);
      const c = cs * (.85 + g.r() * .3) * ((p.fx || {}).cs || 1); p.cs += c; p.gold += 23 + c * 22;
      if (m < 14 && inLane) p.gold += Math.max(0, p.mu.gd) / 6;             // 라인전 매치업 이득 (실제 분당 골드 차이)
      // 포지션별 경험치 속도(실제 30분 기준 탑·미드 16, 원딜·정글 15, 서폿 13 안팎) + 킬·어시 − 데스. 예전에는 30분이면 모두 18이 됐다
      p.lvl = Math.max(1, Math.min(18, Math.floor(1 + m * ({ TOP: .52, MID: .52, BOT: .48, JGL: .48, SUP: .41 })[p.role] + p.k * .15 + p.a * .05 - p.d * .08)));
      if (this.dist(p.pos, this.fountain(p.side)) < 14) p.hp = 1; else p.hp = Math.min(1, p.hp + .02);
    });
    // 사건: 공성(넥서스가 깨지면 이 틱의 다른 일은 없다) · 오브젝트 · 라인전 · 근접 교전 · 귀환
    this.preObj(g);
    this.siege(g, m); if (g.over) return;
    this.objectives(g, m); if (g.over) return;
    if (m < 14) this.laning(g, m);
    this.skirmish(g, m); if (g.over) return;
    this.decideRecalls(g, m);
    this.filler(g, m);
    if (m >= 55) { this.endGame(g, this.lead(g, 'B') >= 0 ? 'B' : 'R'); return; }
    g.pl.forEach(p => { if (!p.dead && !p.recall) p.goal = this.target(g, p, m); });
  },
  // 라인전: 맞상대끼리 붙어 있을 때 가끔 솔로킬 (선수 차이 + 실제 매치업 + 압박 전술), 바텀은 2대2
  laning(g, m) {
    ['TOP', 'MID'].forEach(role => {
      const a = this.alive(g, 'B').find(p => p.role === role), b = this.alive(g, 'R').find(p => p.role === role), lane = this.LANE_OF[role];
      if (g.t < 90 || !a || !b || a.tac === 'hold' || b.tac === 'hold' || a.recall || b.recall || a.tpCh || b.tpCh || this.dist(a.pos, b.pos) > 13 || this.distLane(a.pos, lane) > 5 || this.distLane(b.pos, lane) > 5 || g.r() > this.TRADE * this.agr(g) * Math.max((a && a.fx && a.fx.trade) || 1, (b && b.fx && b.fx.trade) || 1)) return;   // 미니언이 만나기(1:30) 전에는 싸움이 없다
      // 라인 딜교환: 1대1 교전 (매치업·압박 전술은 유리함으로). 대부분 체력만 주고받고 빠진다
      const press = (a.tac === 'press' ? 3 : 0) - (b.tac === 'press' ? 3 : 0) + ((a.fx || {}).duel || 0) - ((b.fx || {}).duel || 0), muE = (a.mu.wr - .5) * 25;   // 독고다이 · 라인전 전문가
      this.fightAt(g, [(a.pos[0] + b.pos[0]) / 2, (a.pos[1] + b.pos[1]) / 2], 8, { bonus: { side: 'B', v: press + muE }, onEnd: f => { if (f.n) { const w = g.pl.find(x => x.side === f.wk && x.role === role), l = g.pl.find(x => x.side !== f.wk && x.role === role); this.say(g, 'cast', this.pick(g, [`${w.name}, ${this.laneKo(lane)} 솔로킬! ${this.cn(w)} 라인전에서 압도합니다!`, `${this.josa(l.name, '이', '가')} 잘렸어요! ${w.name}의 피지컬!`, `${w.name}, 1대1에서 이겨냅니다!`])); } } });
    });
    const bb = this.near(g, 'B', Rift.lane('bot', .5), 60).filter(p => ['BOT', 'SUP'].includes(p.role)), rb = this.near(g, 'R', Rift.lane('bot', .5), 60).filter(p => ['BOT', 'SUP'].includes(p.role));
    if (g.t >= 90 && bb.length && rb.length && this.dist(bb[0].pos, rb[0].pos) < 13 && this.distLane(bb[0].pos, 'bot') < 5 && g.r() < this.TRADE * .9 * this.agr(g)) {
      const at = [(bb[0].pos[0] + rb[0].pos[0]) / 2, (bb[0].pos[1] + rb[0].pos[1]) / 2];
      this.fightAt(g, at, 10, { where: '바텀' });
    }
  },
  // 근접 교전: 로밍 · 인베이드 · 중후반 대치에서 적과 붙으면 싸움이 난다
  skirmish(g, m) {
    if (g.over || g.t < g.calm) return;
    // 대치 중 이니시: 포탑 앞에서 버티는 상대에게, 더 강한 쪽이 확률적으로 들어간다
    if (m >= 14) for (const k of (g.r() < .5 ? ['B', 'R'] : ['R', 'B'])) {   // 매번 어느 쪽부터 볼지 섞는다 (늘 블루부터면 블루만 먼저 다이브했다)
      const o = this.other(k);
      for (const lane of ['mid', 'top', 'bot']) {
        const st = this.structOf(g, o, lane), atk = this.near(g, k, st.pos, 20), def = this.near(g, o, st.pos, 15);
        if (atk.length < 3 || def.length < 1) continue;
        const d = this.tpow(g, k, atk) - this.tpow(g, o, def) + (atk.length - def.length) * 6 - 6, p = 1 / (1 + Math.exp(-d / 13));
        if (g.r() < Math.max(0, p - { safe: .55, norm: .47, aggr: .4 }[g.side[k].ins.aggr]) * (this.min(g) >= 28 ? .8 : .5)) {
          const at = [def.reduce((a, q) => a + q.pos[0], 0) / def.length, def.reduce((a, q) => a + q.pos[1], 0) / def.length];
          this.fightAt(g, at, 18, { where: `${this.laneKo(lane)} 포탑 앞` });
          return;
        }
      }
    }
    let best = null;
    this.alive(g, 'B').forEach(a => this.alive(g, 'R').forEach(b => {
      if (a.recall || b.recall) return;
      const d = this.dist(a.pos, b.pos); if (d > 7) return;
      if (a.role === b.role && a.role !== 'JGL' && (m < 14 || ['TOP', 'BOT'].includes(a.role))) return;      // 라인 맞상대는 laning에서
      if (m < 14 && ['BOT', 'SUP'].includes(a.role) && ['BOT', 'SUP'].includes(b.role)) return;
      if (!best || d < best.d) best = { a, b, d };
    }));
    if (!best) return;
    const at = [(best.a.pos[0] + best.b.pos[0]) / 2, (best.a.pos[1] + best.b.pos[1]) / 2];
    const A = this.near(g, 'B', at, 14), Bp = this.near(g, 'R', at, 14), n = A.length + Bp.length;
    const edge = Math.abs(this.tpow(g, 'B', A) - this.tpow(g, 'R', Bp) + (A.length - Bp.length) * 6);
    const expose = [best.a, best.b].some(x => (x.role === 'SUP' || x.role === 'JGL') && g.side[x.side].ins.vision === 'deep' && this.dist(x.pos, this.fountain(x.side)) > 70) ? 1.25 : 1;   // 깊은 와드를 박다 잡힌다
    if (g.r() > ((n >= 6 ? .055 : .038) + Math.min(.08, edge / 120)) * this.agr(g) * expose) return;
    const lane = ['top', 'mid', 'bot'].sort((x, y) => this.distLane(at, x) - this.distLane(at, y))[0];
    this.fightAt(g, at, 14, { where: this.distLane(at, lane) < 6 ? this.laneKo(lane) : '정글' });
  },
  endGame(g, k) {
    if (g.over) return;
    g.over = { win: k, t: g.t };
    const s = g.side[k], nx = Rift.pos(k === 'B' ? 'rN' : 'bN');
    g.fx.push({ type: 'nexus', at: nx, t: g.t, side: k });
    this.mark(g, k, 'nexus', 'nexus', '넥서스 파괴');
    this.say(g, 'cast', `넥서스 파괴! ${this.josa(s.t.name, '이', '가')} ${this.clock(g.t)}에 승리합니다!`);
    const mvp = g.pl.filter(p => p.side === k).sort((a, b) => (b.k * 3 + b.a * 1.5 - b.d) - (a.k * 3 + a.a * 1.5 - a.d))[0];
    g.over.mvp = mvp;
    this.say(g, 'anal', `오늘의 POG는 ${mvp.name}, ${this.josa(this.cn(mvp), '으로', '로')} ${this.josa(`${mvp.k}/${mvp.d}/${mvp.a}`, '을', '를')} 기록했습니다.`);
  },
  filler(g, m) {
    // 흐름 해설: 3분 전보다 앞서던 팀의 격차가 크게 줄었거나 뒤집혔을 때
    if (g.t % 60 === 0) {
      (g.leadHist ||= []).push(this.lead(g, 'B'));
      const h = g.leadHist, now = h[h.length - 1], before = h[h.length - 4];
      if (before != null && Math.abs(before) > 3000) {
        const k = before > 0 ? 'B' : 'R', o = this.other(k), ks = g.side[k].t.short, os = g.side[o].t.short, cur = k === 'B' ? now : -now, was = Math.abs(before);
        if (cur < 0) { this.say(g, 'hype', `역전입니다! ${this.josa(os, '이', '가')} 골드를 뒤집었어요!`); g.leadHist = [now]; return; }
        if (was - cur > 2500) { this.say(g, 'anal', `사실 조금 전까지는 ${this.josa(ks, '이', '가')} 꽤 유리했거든요. 근데 ${(was / 1000).toFixed(1)}K에서 ${(cur / 1000).toFixed(1)}K까지 많이 따라잡혔습니다.`); g.leadHist = [now]; return; }
      }
    }
    if (g.t % 90 || g.over) return;
    const dg = this.lead(g, 'B'), s = g.side[dg > 0 ? 'B' : 'R'];
    if (Math.abs(dg) > 3000) this.say(g, 'anal', `${this.josa(s.t.short, '이', '가')} 골드 ${(Math.abs(dg) / 1000).toFixed(1)}K 앞서 있습니다. ${m > 25 ? '이제 굳히기에 들어갈 시간이에요.' : '스노우볼을 굴릴 수 있는 차이죠.'}`);
    else if (m < 10) {
      const lp = g.pl.filter(p => p.side === 'B' && p.role !== 'JGL' && p.role !== 'SUP').sort((a, b) => Math.abs(b.mu.gd) - Math.abs(a.mu.gd))[0];
      const o = lp && g.pl.find(q => q.side === 'R' && q.role === lp.role);
      this.say(g, 'anal', lp && Math.abs(lp.mu.gd) > 40 ? `${G.ROLE_KO[lp.role]}는 ${lp.mu.gd > 0 ? lp.name : o.name} 쪽이 CS를 더 챙기고 있어요. 매치업 상성이 그대로 나오네요.` : this.pick(g, ['라인전 단계, 양 팀 모두 CS를 챙기며 탐색전입니다.', '정글러들의 동선 싸움이 중요한 시간대예요.']));
    } else if (m < 20 || g.r() < .6) this.say(g, 'anal', this.flow(g, m));
    else this.say(g, 'cast', this.pick(g, ['아직 승부는 알 수 없습니다!', '한타 한 번에 경기가 끝날 수 있는 시간대예요.', '바론 앞 신경전이 이어집니다.']));
  },

  // ---------- 이동 ----------
  // 짧은 거리를 곧장 다가간다 (교전 중 붙기)
  shift(p, to, maxD) {
    to = this.clampP(to); maxD = Math.min(maxD, p.budget ?? 40); p.budget = (p.budget ?? 40) - Math.min(maxD, this.dist(p.pos, to));
    const d = this.dist(p.pos, to), q = d <= maxD ? to : [p.pos[0] + (to[0] - p.pos[0]) / d * maxD, p.pos[1] + (to[1] - p.pos[1]) / d * maxD];
    p.trail = (p.trail && p.trail.length ? p.trail.slice() : [p.pos]).concat([q]); p.pos = q;
  },
  // 길을 따라 최대 maxD만큼 걷는다 (trail = 이번 틱에 지나간 점). 목적지가 크게 바뀔 때만 길을 다시 찾는다
  walk(p, to, maxD = this.SPEED / 10) {
    to = this.clampP(to); maxD = Math.min(maxD, p.budget ?? maxD);
    const trail = p.trail && p.trail.length ? p.trail.slice() : [p.pos];
    const n0 = p.rt ? p.rt.pts.length : 0;
    if (!p.rt || this.dist(p.rt.to, to) > 3 || !n0 || !Rift.los(n0 > 1 ? p.rt.pts[n0 - 2] : p.pos, to)) p.rt = { to, pts: Rift.path(p.pos, to) };
    else p.rt.pts[n0 - 1] = to;
    let left = maxD, cur = p.pos;
    while (left > 0 && p.rt.pts.length) {
      const q = p.rt.pts[0], d = this.dist(cur, q);
      if (d <= left) { trail.push(q); left -= d; cur = q; p.rt.pts.shift(); }
      else { const f = left / d; cur = [cur[0] + (q[0] - cur[0]) * f, cur[1] + (q[1] - cur[1]) * f]; trail.push(cur); left = 0; }
    }
    if (Rift.wall(cur)) { const q = Rift.snap(cur); cur = this.dist(q, p.pos) <= maxD + .5 ? q : p.pos; trail.push(cur); p.rt = null; }   // 모서리를 스치다 벽 칸에 걸치면 길 위로
    p.pos = cur; p.trail = trail; p.budget = (p.budget ?? maxD) - (maxD - left);
  },
};

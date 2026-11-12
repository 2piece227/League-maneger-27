// 경기 엔진 (임시): 10초 단위 시뮬레이션. 중계 화면은 js/live.js
// 교전 승률 = 선수 OVR · 챔피언 숙련 · 메타 · 실제 경기 데이터(라인 매치업 · 시간대별 승률 · 시너지)
//   · 조합 성향 · 전술 적합도 · 코치 · 골드 · 버프. 라인전 → 오브젝트 → 한타 → 넥서스.
// 원칙: 모든 사건은 "그 자리에 실제로 있는 선수"끼리만 일어난다. 이동은 라인·정글 길을 따라가고,
//       순간 이동은 귀환 · 부활 · 텔레포트뿐이다. (Sim.audit 을 켜면 이 원칙을 어긴 경우를 기록한다)
// TODO: 정식 엔진 — 시야 판정, 스킬·특성·컨디션

// ---------- 맵 (assets/map/rift.webp 기준 %, 블루 = 왼쪽 아래) ----------
const Rift = {
  BLUE: { F: [7, 93], N: [14, 85], T1: [11, 31], T2: [11, 50], T3: [11, 66], M1: [41, 56], M2: [34, 63], M3: [28, 69], B1: [64, 90], B2: [47, 90], B3: [32, 90],
    JB: [24, 50], JG: [16, 45], JW: [25, 60], JR: [43, 64], JD: [49, 74], JK: [55, 83], RE: [26, 38] },
  NEUTRAL: { TOPC: [12, 11], BOTC: [89, 89], MID: [50, 48], BAR: [37, 30], DRA: [64, 69], RVt: [19, 22], RVb: [81, 78], RVtm: [43, 40], RVbm: [57, 57] },
  MIRN: { TOPC: 'BOTC', BOTC: 'TOPC', MID: 'MID', BAR: 'DRA', DRA: 'BAR', RVt: 'RVb', RVb: 'RVt', RVtm: 'RVbm', RVbm: 'RVtm' },
  EDGES: [['F', 'N'], ['N', 'T3'], ['T3', 'T2'], ['T2', 'T1'], ['T1', 'TOPC'], ['N', 'M3'], ['M3', 'M2'], ['M2', 'M1'], ['M1', 'MID'], ['N', 'B3'], ['B3', 'B2'], ['B2', 'B1'], ['B1', 'BOTC'],
    ['T2', 'JG'], ['JG', 'JB'], ['JB', 'JW'], ['JW', 'M2'], ['JB', 'RE'], ['RE', 'T1'], ['RE', 'RVt'], ['RE', 'BAR'], ['JW', 'JR'], ['JR', 'M1'], ['JR', 'JD'], ['JD', 'JK'], ['JK', 'B2'], ['JR', 'RVbm'], ['JD', 'DRA'], ['JK', 'B1']],
  NEDGES: [['RVt', 'TOPC'], ['RVt', 'BAR'], ['BAR', 'RVtm'], ['RVtm', 'MID'], ['MID', 'RVbm'], ['RVbm', 'DRA'], ['DRA', 'RVb'], ['RVb', 'BOTC']],
  LANES: { top: ['bN', 'bT3', 'bT2', 'bT1', 'TOPC', 'rB1', 'rB2', 'rB3', 'rN'], mid: ['bN', 'bM3', 'bM2', 'bM1', 'MID', 'rM1', 'rM2', 'rM3', 'rN'], bot: ['bN', 'bB3', 'bB2', 'bB1', 'BOTC', 'rT1', 'rT2', 'rT3', 'rN'] },
  TOWER: { B: { top: ['bT1', 'bT2', 'bT3'], mid: ['bM1', 'bM2', 'bM3'], bot: ['bB1', 'bB2', 'bB3'] }, R: { top: ['rB1', 'rB2', 'rB3'], mid: ['rM1', 'rM2', 'rM3'], bot: ['rT1', 'rT2', 'rT3'] } },
  INHIB: { B: { top: [11, 73], mid: [24, 74], bot: [27, 89] }, R: { top: [73, 11], mid: [76, 26], bot: [89, 27] } },
  CAMPS: ['JB', 'JG', 'JW', 'JR', 'JD', 'JK'],
  init() {
    if (this.N) return;
    const m = ([x, y]) => [100 - x, 100 - y], N = {}, adj = {};
    Object.entries(this.BLUE).forEach(([k, p]) => { N['b' + k] = p; N['r' + k] = m(p); });
    Object.assign(N, this.NEUTRAL);
    const link = (a, b) => { const d = Math.hypot(N[a][0] - N[b][0], N[a][1] - N[b][1]); (adj[a] ||= []).push([b, d]); (adj[b] ||= []).push([a, d]); };
    const bn = k => this.NEUTRAL[k] ? k : 'b' + k, rn = k => this.NEUTRAL[k] ? this.MIRN[k] : 'r' + k;
    this.EDGES.forEach(([a, b]) => { link(bn(a), bn(b)); link(rn(a), rn(b)); });
    this.NEDGES.forEach(([a, b]) => link(a, b));
    this.N = N; this.adj = adj; this.cache = {}; this.L = {};
    Object.keys(this.LANES).forEach(l => { const pts = this.LANES[l].map(n => N[n]), cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); this.L[l] = { pts, cum, len: cum[cum.length - 1] }; });
  },
  pos(n) { return this.N[n]; },
  near(p) { let best = null, bd = 1e9; for (const [k, q] of Object.entries(this.N)) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = k; } } return best; },
  route(a, b) {
    if (a === b) return [a];
    const key = a + '>' + b; if (this.cache[key]) return this.cache[key];
    const dist = { [a]: 0 }, prev = {}, todo = new Set(Object.keys(this.N));
    while (todo.size) {
      let u = null; for (const k of todo) if (dist[k] != null && (u == null || dist[k] < dist[u])) u = k;
      if (u == null || u === b) break;
      todo.delete(u);
      for (const [v, w] of this.adj[u] || []) if (todo.has(v) && (dist[v] == null || dist[u] + w < dist[v])) { dist[v] = dist[u] + w; prev[v] = u; }
    }
    const out = [b]; let c = b; while (prev[c]) { c = prev[c]; out.unshift(c); }
    return (this.cache[key] = out[0] === a ? out : [a, b]);
  },
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
  // 같은 라인 위 두 위치 사이의 꺾이는 점들 (가는 순서)
  between(l, s1, s2) {
    const L = this.L[l], lo = Math.min(s1, s2), hi = Math.max(s1, s2);
    const vs = L.cum.map((c, i) => ({ s: c / L.len, p: L.pts[i] })).filter(v => v.s > lo + 1e-6 && v.s < hi - 1e-6).map(v => v.p);
    return s1 > s2 ? vs.reverse() : vs;
  },
  // 걸어가는 길: 같은 라인이면 라인을 따라, 아니면 정글·강 길(노드)을 따라
  path(start, to) {
    const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (D(start, to) < 6) return [to];
    let best = null;
    for (const l of ['top', 'mid', 'bot']) { const a = this.proj(l, start), b = this.proj(l, to); if (a.d < 4 && b.d < 4 && (!best || a.d + b.d < best.c)) best = { l, a, b, c: a.d + b.d }; }
    if (best) return [...this.between(best.l, best.a.s, best.b.s), to];
    const pts = [...this.route(this.near(start), this.near(to)).map(n => this.N[n]), to];
    while (pts.length >= 2 && D(start, pts[1]) <= D(pts[0], pts[1]) + 1) pts.shift();                                          // 이미 지나친 첫 노드로 되돌아가지 않는다
    while (pts.length >= 3 && D(pts[pts.length - 3], to) <= D(pts[pts.length - 3], pts[pts.length - 2]) + 1) pts.splice(pts.length - 2, 1);
    return pts;
  },
};

const Sim = {
  PIT: { drag: 'DRA', baron: 'BAR', grubs: 'BAR', herald: 'BAR' },
  OBJ: { drag: '드래곤', grubs: '공허 유충', herald: '전령', baron: '바론' },
  // 오브젝트마다 모이는 포지션 (드래곤은 바텀 쪽 4인, 유충·전령은 탑 쪽, 바론은 5인)
  OBJ_ROLES: { drag: ['JGL', 'MID', 'BOT', 'SUP'], grubs: ['JGL', 'TOP', 'MID'], herald: ['JGL', 'TOP', 'MID', 'SUP'], baron: ['TOP', 'JGL', 'MID', 'BOT', 'SUP'] },
  OBJ_NEED: { drag: 30, grubs: 30, herald: 30, baron: 40 },
  LANE_OF: { TOP: 'top', MID: 'mid', BOT: 'bot', SUP: 'bot' },
  DRAGONS: [['화염', 'dragon_infernal'], ['바다', 'dragon_ocean'], ['바람', 'dragon_cloud'], ['대지', 'dragon_mountain'], ['마법공학', 'dragon_hextech'], ['화학공학', 'dragon_chemtech']],
  ICON: { baron: 'baron', herald: 'riftherald', grubs: 'grub', tower: 'tower', inhib: 'inhibitor', nexusT: 'tower', nexus: 'nexus' },
  SPEED: 24,   // 10초 동안 걷는 거리 (맵 %)
  audit: null, // 배열을 넣으면 원칙 위반을 기록한다 (검사용)

  rng(seed) { let h = 1779033703 ^ seed.length; for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; },
  fountain(k) { return Rift.pos(k === 'B' ? 'bF' : 'rF'); },
  min: g => g.t / 60,
  other: k => k === 'B' ? 'R' : 'B',
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
  clampP: p => [Math.max(4, Math.min(96, p[0])), Math.max(4, Math.min(96, p[1]))],
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
      g.side[k] = { k, t, coach: co.r, kills: 0, syn, fit: Draft.fitTotal(S, k) || 50, form: (r() - .5) * 6,   // form: 그날 컨디션 (임시)
        tac: (S.tactics[k] || {}).team || 'bal', comp: Style.comp(picks.map(x => x.c)),
        towers: { top: 3, mid: 3, bot: 3 }, inhib: { top: 1, mid: 1, bot: 1 }, nexusT: 2, down: 0,
        thp: { top: [1, 1, 1], mid: [1, 1, 1], bot: [1, 1, 1] }, ihp: { top: 1, mid: 1, bot: 1 }, ntp: [1, 1], nxhp: 1,
        drag: [], grubs: 0, herald: 0, baron: 0, baronUntil: 0, push: null, reset: -999, jstart: r() < .5 ? 'top' : 'bot' };
    });
    g.pl = [];
    ['B', 'R'].forEach(k => S.picks[k].slice().sort((a, b) => G.ROLES.indexOf(a.role) - G.ROLES.indexOf(b.role)).forEach(x => {
      const hit = x.pid && Player.find(x.pid), p = hit ? hit.p : { id: 'x' + x.role, name: '공석', ovr: 55 };
      const ms = Draft.mast(p, x.c);
      g.pl.push({ side: k, role: x.role, c: x.c, p, name: p.name, ovr: p.ovr || 60, m: ms.m, sig: ms.sig, meta: Draft.meta(x.c), st: Style.of(x.c), curve: Stats.curve(x.c),
        k: 0, d: 0, a: 0, cs: 0, gold: 500, spent: 0, inv: [], wards: 0, trinket: null, build: Stats.build(x.c, x.role),
        tp: x.role === 'TOP' || (x.role !== 'JGL' && x.role !== 'SUP' && Stats.tp(x.c)), tpReady: 0, lvl: 1, hp: 1, dead: 0, pos: [...this.fountain(k)], trail: null, warp: 0,
        recall: 0, lastBack: 0, jq: [], cleared: false, roam: 0, roamTo: null, off: [(r() - .5) * 3, (r() - .5) * 3], tac: ((S.tactics[k] || {}).roles || {})[x.role] });
    }));
    g.pl.forEach(p => { const o = g.pl.find(q => q.side !== p.side && q.role === p.role); p.mu = o ? Stats.matchup(p.role, p.c, o.c) : { wr: .5, gd: 0, g: 0 }; });
    g.pl.forEach(p => this.shop(g, p));
    // 드래곤: 첫 두 마리는 서로 다른 속성, 세 번째부터는 같은 속성(협곡 속성)
    const ds = this.DRAGONS.slice().sort(() => r() - .5); g.dragSeq = [ds[0], ds[1], ds[2]];
    g.obj = { drag: { at: 300, prog: {} }, grubs: { at: 360, prog: {}, until: 840 }, herald: { at: 900, prog: {}, until: 1185 }, baron: { at: 1200, prog: {} } };
    this.say(g, 'cast', `${this.josa(g.side.B.t.name, '과', '와')} ${g.side.R.t.name}의 ${gameNo ? gameNo + '세트' : '경기'}, 지금 시작합니다!`);
    this.say(g, 'anal', `${g.side.B.t.short}는 ${Draft.TEAM_TAC[g.side.B.tac].n}, ${g.side.R.t.short}는 ${Draft.TEAM_TAC[g.side.R.tac].n} 전술입니다. ${this.compTalk(g)}`);
    const lop = g.pl.filter(p => p.side === 'B' && p.mu.g >= 5 && Math.abs(p.mu.wr - .5) >= .08)[0];
    if (lop) { const o = g.pl.find(q => q.side === 'R' && q.role === lop.role), fav = lop.mu.wr > .5 ? lop : o; this.say(g, 'anal', `${G.ROLE_KO[lop.role]} 매치업은 ${this.cn(fav)} 쪽이 유리합니다. 프로 경기 ${lop.mu.g}판 기준 승률 ${Math.round((fav === lop ? lop.mu.wr : 1 - lop.mu.wr) * 100)}%예요.`); }
    return g;
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
    return p.ovr * .6 + p.m * .4 + (p.sig ? 2 : 0) + p.meta * 3 + p.lvl * .2 + items * .6 + (ph - .5) * 20 + Math.min(2.5, p.k * .15) - Math.min(2, p.d * .1) - (1 - p.hp) * 3;
  },
  tpow(g, k, who) {
    const s = g.side[k], ps = (who || this.alive(g, k)), m = this.min(g), c = s.comp;
    if (!ps.length) return 0;
    let v = ps.reduce((a, p) => a + this.ppow(p, m), 0) / ps.length + s.form + s.syn * 8;
    v += m < 14 ? (c.early - .4) * 10 : m < 26 ? ((c.fight + c.engage) / 2 - .4) * 9 : (c.late - .4) * 10;
    const tacPhase = { early: m < 15, snow: m < 22, fight: m >= 12 && m < 30, late: m >= 25, bal: true }[s.tac];
    v += (s.fit - 50) / 50 * (tacPhase ? 4 : 1.5) + (s.coach - 10) * .15;
    v += Math.max(-9, Math.min(9, this.lead(g, k) / 1000 * .8));   // 스노우볼 (실제: 이긴 팀 골드 +1만, 킬 2배)
    if (s.baronUntil > g.t) v += 6;
    if (s.drag.length >= 4) v += 4;
    return v;
  },
  win(g, kA, a, b, bonus = 0) { const d = this.tpow(g, kA, a) - this.tpow(g, this.other(kA), b) + (a.length - b.length) * 6 + bonus; return g.r() < 1 / (1 + Math.exp(-d / 11.5)); },   // 11.5: 실제 강팀·약팀 승률 곡선에 맞춘 값 (tools/validate-engine.md 참고)

  // ---------- 해설 ----------
  CAST: { cast: '캐스터', anal: '해설' },
  say(g, who, text) { g.comm.push({ t: g.t, who, text }); },
  clock: t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`,
  pick(g, arr) { return arr[Math.floor(g.r() * arr.length)]; },
  cn: p => Champions.byId[p.c].name,
  laneKo: l => ({ top: '탑', mid: '미드', bot: '바텀' })[l],
  // 받침에 맞는 조사 (이/가, 을/를, 과/와, 은/는). 숫자는 읽는 소리로, 영문은 끝 글자로 어림한다
  josa(word, a, b) {
    const w = word || '', ch = w.charCodeAt(w.length - 1);
    if (ch >= 0xAC00 && ch <= 0xD7A3) return w + ((ch - 0xAC00) % 28 ? a : b);
    if (/[0-9]$/.test(w)) return w + ('013678'.includes(w.slice(-1)) ? a : b);
    return w + (/[aeiouyAEIOUY]$/.test(w) ? b : a);
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
        if (g.t > 0 && !target.boots && p.inv.filter(x => x.gold >= 2000 && !x.boots).length === 3) this.say(g, 'anal', `${p.name}, ${target.ko}까지 3코어 완성! ${this.josa(this.cn(p), '이', '가')} 가장 강해지는 시간입니다.`);
        continue;
      }
      const part = this.nextPart(p, target, this.free(p));
      if (!part || this.slots(p) >= 6) break;
      this.buy(p, part.it, part.need, this.owned(p, part.it));
    }
  },

  // ---------- 처치 · 교전 ----------
  kill(g, killer, victim, assists = []) {
    if (victim.dead) return;
    if (this.audit && this.dist(killer.pos, victim.pos) > 22) this.audit.push(`${this.clock(g.t)} 먼 거리 처치 ${killer.name}(${killer.pos.map(Math.round)}) → ${victim.name}(${victim.pos.map(Math.round)})`);
    const first = !g.kills.length;
    victim.dead = g.t + Math.round(8 + this.min(g) * 1.3); victim.d++; victim.hp = 0; victim.recall = 0; victim.jq = [];
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
  fightAt(g, at, radius, opt = {}) {
    const A = this.near(g, 'B', at, radius), Bp = this.near(g, 'R', at, radius);
    if (!A.length || !Bp.length) return null;
    if (A.length + Bp.length >= 5 && this.min(g) >= 4) ['B', 'R'].forEach(k => this.alive(g, k).filter(p => p.tp && g.t >= p.tpReady && this.dist(p.pos, at) > 40 && !p.recall && g.r() < .55).forEach(p => {
      this.teleport(g, p, this.toward(at, k, 6));
      (k === 'B' ? A : Bp).push(p);
      this.say(g, 'cast', `${p.name}, 순간이동으로 합류합니다!`);
    }));
    // 싸우는 자리로 붙는다
    [...A, ...Bp].forEach(p => { if (this.dist(p.pos, at) > 5) this.shift(p, [at[0] + p.off[0] * 1.3, at[1] + p.off[1] * 1.3], Math.max(0, this.dist(p.pos, at) - 4)); });
    let bonus = opt.bonus ? (opt.bonus.side === 'B' ? opt.bonus.v : -opt.bonus.v) : 0;
    // 자기 포탑 근처에서 싸우는 쪽이 유리하다
    ['B', 'R'].forEach(k => { if (['top', 'mid', 'bot'].some(l => { const st = this.structOf(g, k, l); return st.kind !== 'nexus' && this.dist(st.pos, at) < 12; })) bonus += k === 'B' ? 6 : -6; });
    g.calm = g.t + 60;
    const bWin = this.win(g, 'B', A, Bp, bonus), W = bWin ? A : Bp, L = bWin ? Bp : A, wk = bWin ? 'B' : 'R';
    const big = A.length + Bp.length >= 6;
    const nK = Math.min(L.length, big ? 1 + Math.floor(g.r() * g.r() * (L.length + .2)) : g.r() < .85 ? 1 : Math.min(2, L.length));
    const cap = this.min(g) < 10 ? (big ? 2 : 1) : 5;     // 초반 교전은 킬이 적게 난다
    const nT = this.min(g) < 10 ? (g.r() < .1 ? 1 : 0) : big ? Math.floor(g.r() * g.r() * Math.min(W.length, 2.4)) : g.r() < .12 ? 1 : 0;
    const vict = L.slice().sort(() => g.r() - .5).slice(0, Math.min(nK, cap)), trade = W.slice().sort(() => g.r() - .5).slice(0, nT);
    vict.forEach(v => this.kill(g, this.pickKiller(g, W.filter(p => !p.dead)) || W[0], v, W));
    trade.forEach(v => { const ks = L.filter(p => !p.dead); if (ks.length) this.kill(g, this.pickKiller(g, ks), v, ks); });
    W.forEach(p => { if (!p.dead) p.hp = Math.max(.15, p.hp - .15 - g.r() * .35); }); L.forEach(p => { if (!p.dead) p.hp = Math.max(.08, p.hp - .35 - g.r() * .3); });
    L.filter(p => !p.dead).forEach(p => this.walk(p, this.fountain(p.side), 14));          // 진 쪽 생존자는 본진 쪽으로 빠진다
    g.fx.push({ type: 'fight', at, t: g.t, side: wk });
    const ace = this.alive(g, this.other(wk)).length === 0, f = { wk, n: vict.length, t: trade.length, ace, big, W, L, size: A.length + Bp.length };
    // 이긴 쪽이 숫자가 남으면 가장 가까운 라인으로 밀고 들어간다
    const wl = W.filter(p => !p.dead).length, deadL = g.pl.filter(p => p.side !== wk && p.dead).length;
    if (wl >= 3 && deadL >= 2 && this.min(g) >= 10) { const lane = ['top', 'mid', 'bot'].sort((a, b) => this.distLane(at, a) - this.distLane(at, b))[0]; g.side[wk].push = { lane, until: g.t + (ace ? 110 : 70) }; }
    return f;
  },
  sayFight(g, f, where) {
    if (!f || (!f.n && !f.t)) return;
    const ws = g.side[f.wk].t.short;
    if (f.ace) this.say(g, 'cast', `에이스! ${this.josa(ws, '이', '가')} 상대를 전멸시킵니다!`);
    else if (f.big) this.say(g, 'cast', this.pick(g, [`한타 열립니다! ${this.josa(ws, '이', '가')} ${f.n}킬을 가져가요!`, `대규모 교전! ${ws} 쪽으로 기웁니다, ${f.n} 대 ${f.t}!`]));
    else if (where) this.say(g, 'cast', `${where} 교전, ${this.josa(ws, '이', '가')} ${f.n}킬을 챙깁니다.`);
  },
  // 텔레포트: 화면에 효과를 남기고 순간 이동
  teleport(g, p, to) {
    to = this.clampP(to);
    g.fx.push({ type: 'tp', side: p.side, at: to, from: [...p.pos], t: g.t });
    p.pos = to; p.trail = [to]; p.warp = g.t; p.tpReady = g.t + (this.min(g) < 14 ? 360 : 240);
  },

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
    ['B', 'R'].forEach(k => ['top', 'mid', 'bot'].forEach(lane => {
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
      const dmg = atk.length * (plate ? .05 : st.kind === 'nexus' ? .2 : st.i === 0 ? .14 : deep ? .14 : .11) * (g.side[k].baronUntil > g.t ? 1.6 : 1) * early;
      this.hit(g, k, lane, st, dmg);
    }));
    // 웨이브 압박: 전선이 상대 포탑 앞까지 밀리면 미니언이 (수비가 있어도) 포탑을 깎는다. 라인에 아군이 있어야 웨이브가 버틴다
    if (m >= 4) ['top', 'mid', 'bot'].forEach(lane => {
      const fr = this.front(g, lane);
      ['B', 'R'].forEach(k => {
        const o = this.other(k), st = this.structOf(g, o, lane); if (st.kind !== 'tower' || g.over) return;
        const ts = Rift.proj(lane, st.pos).s, reach = k === 'B' ? fr >= ts - .06 : fr <= ts + .06;
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
  objUp(g, o) { const ob = g.obj[o]; return ob.at && g.t >= ob.at && (!ob.until || g.t < ob.until); },
  baronCall(g, k) {
    if (!this.objUp(g, 'baron')) return false;
    const deadO = g.pl.filter(p => p.side !== k && p.dead).length, deadK = g.pl.filter(p => p.side === k && p.dead).length;
    const m = this.min(g), lead = this.lead(g, k);
    const mine = lead > 7000 || (deadO - deadK >= 3 && lead > -2000) || (m >= 25 && (lead > 3500 || deadO - deadK >= 2)) || (m >= 34 && lead > 2500) || m >= 45;
    const contest = this.near(g, this.other(k), Rift.pos('BAR'), 18).length >= 3 && this.lead(g, k) > -6000;
    return mine || contest;
  },
  objFor(g, p, m) {
    for (const o of ['drag', 'grubs', 'herald', 'baron']) {
      const ob = g.obj[o]; if (!ob.at || (ob.until && g.t >= ob.until)) continue;
      if (o === 'baron' ? !this.baronCall(g, p.side) : ob.at - g.t > 60) continue;
      const roles = m >= 20 && o === 'drag' ? ['JGL', 'MID', 'BOT', 'SUP', p.tac === 'split' ? '' : 'TOP'] : this.OBJ_ROLES[o];
      if (!roles.includes(p.role)) continue;
      // 많이 밀리거나 2명 이상 죽었으면 내준다
      const k = p.side, deadK = g.pl.filter(q => q.side === k && q.dead).length, deadO = g.pl.filter(q => q.side !== k && q.dead).length;
      if (o !== 'baron' && (deadK - deadO >= 2 || (1 / (1 + Math.exp(-(this.tpow(g, k) - this.tpow(g, this.other(k))) / 13)) < .33))) continue;
      const pit = Rift.pos(this.PIT[o]), spot = [pit[0] + p.off[0], pit[1] + p.off[1]];
      return g.t >= ob.at ? spot : this.toward(spot, p.side, 6);          // 생성 전에는 강 입구에서 대기
    }
    return null;
  },
  objectives(g, m) {
    for (const o of ['drag', 'grubs', 'herald', 'baron']) {
      if (!this.objUp(g, o) || g.over) continue;
      const ob = g.obj[o], pit = Rift.pos(this.PIT[o]);
      const nb = this.near(g, 'B', pit, 16), nr = this.near(g, 'R', pit, 16);
      let wk = null;
      if (nb.length && nr.length && !ob.fought) {
        ob.fought = true;                                              // 오브젝트 한타는 생성마다 한 번
        const f = this.fightAt(g, pit, 20); this.sayFight(g, f, `${this.OBJ[o]} 앞`);
        if (f) { const n = this.near(g, f.wk, pit, 20).length; ob.prog[f.wk] = (ob.prog[f.wk] || 0) + 10 * n; if (ob.prog[f.wk] >= this.OBJ_NEED[o]) wk = f.wk; }
      } else if (nb.length && nr.length) {
        const k = this.tpow(g, 'B', nb) + nb.length * 6 >= this.tpow(g, 'R', nr) + nr.length * 6 ? 'B' : 'R';
        this.near(g, this.other(k), pit, 20).forEach(p => this.walk(p, this.fountain(p.side), 16));
        ob.prog[k] = (ob.prog[k] || 0) + 10 * this.near(g, k, pit, 20).length; if (ob.prog[k] >= this.OBJ_NEED[o]) wk = k;
      } else for (const [k, ps] of [['B', nb], ['R', nr]]) {
        if (!ps.length) continue;
        ob.prog[k] = (ob.prog[k] || 0) + 10 * ps.length;
        if (ob.prog[k] >= this.OBJ_NEED[o]) { wk = k; if (g.r() < .5) this.say(g, 'anal', `${this.josa(g.side[this.other(k)].t.short, '이', '가')} 대응을 못 합니다. ${this.josa(g.side[k].t.short, '이', '가')} ${this.josa(this.OBJ[o], '을', '를')} 챙겨요.`); }
      }
      if (!wk) continue;
      const s = g.side[wk];
      ob.prog = {}; ob.fought = false;
      if (o === 'drag') {
        const n = g.side.B.drag.length + g.side.R.drag.length, d = g.dragSeq[Math.min(n, 2)]; s.drag.push(d);
        this.mark(g, wk, 'drag', d[1], `${d[0]} 드래곤 처치`);
        if (s.drag.length === 4) this.say(g, 'cast', `${s.t.short}, ${d[0]} 드래곤 영혼 획득! 한타 주도권이 넘어갑니다!`);
        ob.at = g.t + 330;
      } else if (o === 'grubs') { s.grubs += 3; this.mark(g, wk, 'grubs', 'grub', '공허 유충 처치'); ob.at = null; }
      else if (o === 'herald') { s.herald++; this.mark(g, wk, 'herald', 'riftherald', '전령 처치'); ob.at = null; s.push = { lane: g.r() < .5 ? 'top' : 'mid', until: g.t + 60 }; this.say(g, 'anal', `${this.josa(s.t.short, '이', '가')} 전령을 ${this.laneKo(s.push.lane)}에 풀러 갑니다.`); }
      else {
        s.baron++; s.baronUntil = g.t + 180; this.mark(g, wk, 'baron', 'baron', '바론 처치'); ob.at = g.t + 420;
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
        const gankRate = .35 + p.st.early * .3 + (p.tac === 'gank' ? .25 : 0) - (p.tac === 'farm' ? .2 : 0);
        if (m < 15 && g.r() < gankRate) {
          const L = ['top', 'mid', 'bot'].map(l => { const e = g.pl.find(q => q.side !== p.side && !q.dead && !q.recall && this.LANE_OF[q.role] === l && q.role !== 'SUP' && this.distLane(q.pos, l) < 6 && this.dist(q.pos, this.fountain(q.side)) > 40); return { l, e, w: e ? (1.3 - e.hp) + g.r() * .6 : 0 }; }).sort((a, b) => b.w - a.w)[0];
          if (L.e) p.jq = [{ kind: 'gank', e: L.e, lane: L.l, pos: L.e.pos, left: 6 }];
        }
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
        const f = this.fightAt(g, head.e.pos, 12, { bonus: { side: p.side, v: 6 } });
        if (f && f.n) this.say(g, f.wk === p.side ? 'cast' : 'anal', f.wk === p.side ? `${p.name}의 갱킹! ${this.laneKo(head.lane)}에서 킬이 나옵니다!` : `갱킹을 받아쳤어요! ${this.josa(g.side[f.wk].t.short, '이', '가')} 잘 대응합니다.`);
        return p.pos;
      }
      return head.pos;
    }
    if (head.until && g.t >= head.until) { p.jq.shift(); return this.jungle(g, p, m); }
    if (this.dist(p.pos, head.pos) < 3) {
      head.wait -= 10;
      if (head.wait <= 0) p.jq.shift();
      if (!head.until) { p.cs += head.kind ? 0 : 1.6; p.gold += head.kind ? 40 : 45; }
    }
    return head.pos;
  },

  // ---------- 위치 ----------
  // 라인 전선: 웨이브가 밀고 당겨지고, 포탑·골드·매치업에 따라 기운다. 맞상대와는 사거리만큼 떨어져 선다
  // 라인 전선 (블루 기준 s, 0=블루 넥서스): 웨이브가 밀고 당겨지고, 포탑·골드·매치업에 따라 기운다
  front(g, lane) {
    const m = this.min(g), wave = Math.sin(g.t / 26 + lane.length * 2 + (g.side.B.jstart === 'top' ? 1 : 0)) * (m < 14 ? .13 : .16);
    const mu = ((g.pl.find(q => q.side === 'B' && this.LANE_OF[q.role] === lane && q.role !== 'SUP') || { mu: { wr: .5 } }).mu.wr - .5) * .2;
    const f = .5 + ((3 - g.side.R.towers[lane]) - (3 - g.side.B.towers[lane])) * .08 + Math.max(-.08, Math.min(.08, this.lead(g, 'B') / 20000)) + mu + wave;
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
      if (p.role === 'SUP') {
        if (p.roam > g.t) return p.roamTo;
        if (m >= 3 && g.t % 150 < 10 && g.r() < (p.tac === 'roam' ? .7 : .3)) { p.roam = g.t + 30; p.roamTo = g.r() < .5 ? this.laneSpot(g, p, m, 'mid') : Rift.pos(p.side === 'B' ? 'RVbm' : 'RVtm'); return p.roamTo; }
      }
      return this.laneSpot(g, p, m, this.LANE_OF[p.role]);
    }
    if (p.role === 'TOP' && (p.tac === 'split' || m < 25)) return this.laneSpot(g, p, m, 'top');
    if (p.role === 'BOT' && m < 20) return this.laneSpot(g, p, m, 'bot');
    if (p.role === 'JGL' && m < 25 && !Object.keys(g.obj).some(k => g.obj[k].at && g.obj[k].at - g.t < 90 && (!g.obj[k].until || g.t < g.obj[k].until))) return this.jungle(g, p, m);
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
        p.recall = g.t + 10; p.jq = [];
        g.fx.push({ type: 'recall', side: p.side, at: [...p.pos], t: g.t });
      }
    });
  },
  // 우물 도착: 상점 → 텔레포트가 있으면 자기 라인(아군 쪽 전선)으로만 순간이동
  atBase(g, p, m) {
    p.pos = [...this.fountain(p.side)]; p.trail = [p.pos]; p.warp = g.t; p.hp = 1; p.lastBack = g.t; this.shop(g, p);
    if (!p.tp || g.t < p.tpReady || m < 3 || (g.side[p.side].push && g.side[p.side].push.until > g.t)) return;
    const lane = this.LANE_OF[p.role], spot = this.laneSpot(g, p, m, lane);
    if (this.dist(this.target(g, p, m), spot) > 12 || this.dist(p.pos, spot) < 45 || this.near(g, this.other(p.side), spot, 6).length > 1) return;
    this.teleport(g, p, spot);
  },

  // ---------- 진행 (10초) ----------
  step(g) {
    if (g.over) return;
    const prev = this.audit ? g.pl.map(p => [...p.pos]) : null;
    g.t += 10;
    const m = this.min(g);
    g.pl.forEach(p => { p.trail = null; p.budget = 40; });   // 10초 동안 움직일 수 있는 거리 한도
    ['B', 'R'].forEach(k => { const s = g.side[k]; if (s.push && s.push.until <= g.t) { s.push = null; s.reset = g.t; } });
    // 부활 · 귀환 완료 · 성장
    g.pl.forEach(p => {
      if (p.dead && g.t >= p.dead) { p.dead = 0; this.atBase(g, p, m); }
      if (p.dead) { p.pos = [...this.fountain(p.side)]; p.trail = [p.pos]; p.warp = g.t; return; }
      if (p.recall && g.t >= p.recall) { p.recall = 0; this.atBase(g, p, m); }
      if (p.recall) return;
      const lane = this.LANE_OF[p.role], inLane = p.role !== 'JGL' && p.role !== 'SUP' && this.distLane(p.pos, lane) < 6;
      if (p.role === 'SUP') p.gold += 7;
      const cs = p.role === 'SUP' ? .15 : p.role === 'JGL' ? (m < 14 ? 0 : 1) : (inLane || m >= 14 ? 1.5 : .3) * (['farm', 'safe', 'hold'].includes(p.tac) ? 1.08 : 1);
      const c = cs * (.85 + g.r() * .3); p.cs += c; p.gold += 23 + c * 22;
      if (m < 14 && inLane) p.gold += Math.max(0, p.mu.gd) / 6;             // 라인전 매치업 이득 (실제 분당 골드 차이)
      p.lvl = Math.min(18, Math.floor(1 + m * (p.role === 'SUP' ? .48 : .6) + p.k * .12 + p.a * .04));
      if (this.dist(p.pos, this.fountain(p.side)) < 14) p.hp = 1; else p.hp = Math.min(1, p.hp + .02);
    });
    // 이동
    g.pl.forEach(p => { if (p.dead || p.recall) return; this.walk(p, this.target(g, p, m)); });
    // 사건: 오브젝트 · 라인전 · 근접 교전 · 공성 · 귀환
    this.objectives(g, m);
    if (m < 14) this.laning(g, m);
    this.skirmish(g, m);
    this.siege(g, m);
    this.decideRecalls(g, m);
    this.filler(g, m);
    g.fx = g.fx.filter(f => g.t - f.t <= 20);
    if (m >= 55 && !g.over) this.endGame(g, this.lead(g, 'B') >= 0 ? 'B' : 'R');
    if (prev) g.pl.forEach((p, i) => {
      const d = this.dist(prev[i], p.pos);
      if (d > this.SPEED + 22 && p.warp !== g.t && !p.dead) this.audit.push(`${this.clock(g.t)} 순간 이동 ${p.name} ${prev[i].map(Math.round)} → ${p.pos.map(Math.round)} (${Math.round(d)})`);
      if (p.pos[0] < 2 || p.pos[0] > 98 || p.pos[1] < 2 || p.pos[1] > 98) this.audit.push(`${this.clock(g.t)} 맵 밖 ${p.name} ${p.pos.map(Math.round)}`);
      if (!p.dead && m < 12 && this.dist(p.pos, this.fountain(this.other(p.side))) < 22) this.audit.push(`${this.clock(g.t)} 초반 상대 본진 ${p.name} ${p.pos.map(Math.round)}`);
    });
  },
  // 라인전: 맞상대끼리 붙어 있을 때 가끔 솔로킬 (선수 차이 + 실제 매치업 + 압박 전술), 바텀은 2대2
  laning(g, m) {
    ['TOP', 'MID'].forEach(role => {
      const a = this.alive(g, 'B').find(p => p.role === role), b = this.alive(g, 'R').find(p => p.role === role), lane = this.LANE_OF[role];
      if (!a || !b || a.recall || b.recall || this.dist(a.pos, b.pos) > 13 || this.distLane(a.pos, lane) > 5 || this.distLane(b.pos, lane) > 5 || g.r() > .008) return;
      const press = (a.tac === 'press' ? 3 : 0) - (b.tac === 'press' ? 3 : 0), muE = (a.mu.wr - .5) * 25;
      const [w, l] = g.r() < 1 / (1 + Math.exp(-((this.ppow(a, m) - this.ppow(b, m)) + press + muE) / 9)) ? [a, b] : [b, a];
      this.shift(w, l.pos, 8);
      this.kill(g, w, l);
      this.say(g, 'cast', this.pick(g, [`${w.name}, ${this.laneKo(lane)} 솔로킬! ${this.cn(w)} 라인전에서 압도합니다!`, `${this.josa(l.name, '이', '가')} 잘렸어요! ${w.name}의 피지컬!`, `${w.name}, 1대1에서 이겨냅니다!`]));
    });
    const bb = this.near(g, 'B', Rift.lane('bot', .5), 60).filter(p => ['BOT', 'SUP'].includes(p.role)), rb = this.near(g, 'R', Rift.lane('bot', .5), 60).filter(p => ['BOT', 'SUP'].includes(p.role));
    if (bb.length && rb.length && this.dist(bb[0].pos, rb[0].pos) < 13 && this.distLane(bb[0].pos, 'bot') < 5 && g.r() < .007) {
      const at = [(bb[0].pos[0] + rb[0].pos[0]) / 2, (bb[0].pos[1] + rb[0].pos[1]) / 2];
      this.sayFight(g, this.fightAt(g, at, 10), '바텀');
    }
  },
  // 근접 교전: 로밍 · 인베이드 · 중후반 대치에서 적과 붙으면 싸움이 난다
  skirmish(g, m) {
    if (g.over || g.t < g.calm) return;
    // 대치 중 이니시: 포탑 앞에서 버티는 상대에게, 더 강한 쪽이 확률적으로 들어간다
    if (m >= 14) for (const k of ['B', 'R']) {
      const o = this.other(k);
      for (const lane of ['mid', 'top', 'bot']) {
        const st = this.structOf(g, o, lane), atk = this.near(g, k, st.pos, 20), def = this.near(g, o, st.pos, 15);
        if (atk.length < 3 || def.length < 1) continue;
        const d = this.tpow(g, k, atk) - this.tpow(g, o, def) + (atk.length - def.length) * 6 - 6, p = 1 / (1 + Math.exp(-d / 13));
        if (g.r() < Math.max(0, p - .47) * (this.min(g) >= 28 ? .8 : .5)) {
          const at = [def.reduce((a, q) => a + q.pos[0], 0) / def.length, def.reduce((a, q) => a + q.pos[1], 0) / def.length];
          atk.forEach(q => this.shift(q, at, 14));
          const f = this.fightAt(g, at, 18); if (f) { if (f.wk === k && f.L.filter(x => x.dead).length >= 2) g.side[k].push = { lane, until: g.t + 60 }; this.sayFight(g, f, `${this.laneKo(lane)} 포탑 앞`); }
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
    if (g.r() > (n >= 6 ? .055 : .038) + Math.min(.08, edge / 120)) return;
    const lane = ['top', 'mid', 'bot'].sort((x, y) => this.distLane(at, x) - this.distLane(at, y))[0];
    this.sayFight(g, this.fightAt(g, at, 14), this.distLane(at, lane) < 6 ? this.laneKo(lane) : '정글');
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
    this.say(g, 'anal', `오늘의 POG는 ${mvp.name}, ${this.cn(mvp)}로 ${mvp.k}/${mvp.d}/${mvp.a}를 기록했습니다.`);
  },
  filler(g, m) {
    if (g.t % 90 || g.over) return;
    const dg = this.lead(g, 'B'), s = g.side[dg > 0 ? 'B' : 'R'];
    if (Math.abs(dg) > 3000) this.say(g, 'anal', `${this.josa(s.t.short, '이', '가')} 골드 ${(Math.abs(dg) / 1000).toFixed(1)}K 앞서 있습니다. ${m > 25 ? '이제 굳히기에 들어갈 시간이에요.' : '스노우볼을 굴릴 수 있는 차이죠.'}`);
    else if (m < 10) {
      const lp = g.pl.filter(p => p.side === 'B' && p.role !== 'JGL' && p.role !== 'SUP').sort((a, b) => Math.abs(b.mu.gd) - Math.abs(a.mu.gd))[0];
      const o = lp && g.pl.find(q => q.side === 'R' && q.role === lp.role);
      this.say(g, 'anal', lp && Math.abs(lp.mu.gd) > 40 ? `${G.ROLE_KO[lp.role]}는 ${lp.mu.gd > 0 ? lp.name : o.name} 쪽이 CS를 더 챙기고 있어요. 매치업 상성이 그대로 나오네요.` : this.pick(g, ['라인전 단계, 양 팀 모두 CS를 챙기며 탐색전입니다.', '정글러들의 동선 싸움이 중요한 시간대예요.']));
    } else if (m < 20) this.say(g, 'anal', this.pick(g, ['사이드 라인 관리가 중요한 시간입니다. 4대1 구도가 보이네요.', '다음 오브젝트 앞 시야 싸움이 시작됩니다.']));
    else this.say(g, 'cast', this.pick(g, ['아직 승부는 알 수 없습니다!', '한타 한 번에 경기가 끝날 수 있는 시간대예요.', '바론 앞 신경전이 이어집니다.']));
  },

  // ---------- 이동 ----------
  // 짧은 거리를 곧장 다가간다 (교전 중 붙기)
  shift(p, to, maxD) {
    to = this.clampP(to); maxD = Math.min(maxD, p.budget ?? 40); p.budget = (p.budget ?? 40) - Math.min(maxD, this.dist(p.pos, to));
    const d = this.dist(p.pos, to), q = d <= maxD ? to : [p.pos[0] + (to[0] - p.pos[0]) / d * maxD, p.pos[1] + (to[1] - p.pos[1]) / d * maxD];
    p.trail = (p.trail && p.trail.length ? p.trail.slice() : [p.pos]).concat([q]); p.pos = q;
  },
  // 길을 따라 최대 maxD만큼 걷는다. 같은 10초 안에 여러 번 불리면 이어서 걷는다 (trail = 이번 10초 동안 지나간 점)
  walk(p, to, maxD = this.SPEED) {
    to = this.clampP(to); maxD = Math.min(maxD, p.budget ?? 40);
    const trail = p.trail && p.trail.length ? p.trail.slice() : [p.pos];
    let left = maxD, cur = p.pos;
    for (const q of Rift.path(cur, to)) {
      if (left <= 0) break;
      const d = this.dist(cur, q);
      if (d <= left) { trail.push(q); left -= d; cur = q; }
      else { const f = left / d; cur = [cur[0] + (q[0] - cur[0]) * f, cur[1] + (q[1] - cur[1]) * f]; trail.push(cur); left = 0; }
    }
    p.pos = cur; p.trail = trail; p.budget = (p.budget ?? 40) - (maxD - left);
  },
};

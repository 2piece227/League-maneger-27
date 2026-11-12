// 경기 엔진 (임시) + 옵저버 중계 화면
// 10초 단위 시뮬레이션. 교전 승률 = 선수 OVR · 챔피언 숙련 · 메타 · 실제 경기 데이터(라인 매치업 · 시간대별 승률 · 시너지)
//   · 조합 성향 · 전술 적합도 · 코치 · 골드 · 버프. 라인전 → 오브젝트 → 한타 → 넥서스.
// 챔피언은 맵의 길(노드 그래프)을 따라 움직이고, 귀환 · 텔레포트 · 아이템 구매를 한다.
// TODO: 정식 엔진 — 시야 → 교전 판단 → 물림/미끼 → 진영 붕괴 순 오브젝트 판정, 스킬·특성·컨디션

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
    this.N = N; this.adj = adj; this.cache = {};
  },
  pos(n) { return this.N[n]; },
  near(p) { let best = null, bd = 1e9; for (const [k, q] of Object.entries(this.N)) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = k; } } return best; },
  // 최단 경로 (노드 이름 목록)
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
    const pts = this.LANES[l].map(n => this.N[n]), seg = [];
    let total = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
    let rest = Math.max(0, Math.min(1, s)) * total;
    for (let i = 0; i < seg.length; i++) { if (rest <= seg[i]) { const f = rest / seg[i]; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; } rest -= seg[i]; }
    return pts[pts.length - 1];
  },
};

const Sim = {
  PIT: { drag: 'DRA', baron: 'BAR', grubs: 'BAR', herald: 'BAR' },
  OBJ: { drag: '드래곤', grubs: '공허 유충', herald: '전령', baron: '바론' },
  // 오브젝트마다 모이는 포지션 (프로 경기 기본 그림: 드래곤은 바텀 쪽 4인, 유충·전령은 탑 쪽, 바론은 5인)
  OBJ_ROLES: { drag: ['JGL', 'MID', 'BOT', 'SUP'], grubs: ['JGL', 'TOP', 'MID'], herald: ['JGL', 'TOP', 'MID', 'SUP'], baron: ['TOP', 'JGL', 'MID', 'BOT', 'SUP'] },
  OBJ_NEED: { drag: 30, grubs: 30, herald: 30, baron: 40 },   // 혼자 잡는 데 걸리는 시간(초, 인원수로 나눔)
  LANE_OF: { TOP: 'top', MID: 'mid', BOT: 'bot', SUP: 'bot' },
  DRAGONS: [['화염', '🔥'], ['바다', '🌊'], ['바람', '🌪'], ['대지', '⛰'], ['마법공학', '⚡'], ['화학공학', '☣']],
  SPEED: 24,   // 10초 동안 움직이는 거리 (맵 %). 이동 속도 약 380 기준

  rng(seed) { let h = 1779033703 ^ seed.length; for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; },
  fountain(k) { return Rift.pos(k === 'B' ? 'bF' : 'rF'); },
  min: g => g.t / 60,
  other: k => k === 'B' ? 'R' : 'B',
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
  alive(g, k) { return g.pl.filter(p => p.side === k && !p.dead); },
  gold(g, k) { return g.pl.filter(p => p.side === k).reduce((a, p) => a + p.gold, 0); },
  lead(g, k) { return this.gold(g, k) - this.gold(g, this.other(k)); },
  near(g, k, at, r) { return this.alive(g, k).filter(p => this.dist(p.pos, at) <= r); },
  // 자기 진영 쪽으로 d만큼 물러난 점
  back(at, k, d) { return k === 'B' ? [at[0] - d * .7, at[1] + d * .7] : [at[0] + d * .7, at[1] - d * .7]; },

  // ---------- 준비 ----------
  create(S, gameNo) {
    Rift.init();
    const r = this.rng(S.id + ':sim'), g = { t: 0, r, S, over: null, feed: [], comm: [], ev: [], kills: [], fx: [] };
    g.side = {};
    ['B', 'R'].forEach(k => {
      const t = Draft.side(S, k), co = Draft.coach(t), picks = S.picks[k];
      let syn = 0; picks.forEach((a, i) => picks.slice(i + 1).forEach(b => { const q = Stats.synergy(a.role, a.c, b.role, b.c); if (q) syn += q.wr - .5; }));
      g.side[k] = { k, t, coach: co.r, kills: 0, syn, fit: Draft.fitTotal(S, k) || 50, form: (r() - .5) * 7,   // form: 그날 컨디션 (임시)
        tac: (S.tactics[k] || {}).team || 'bal', comp: Style.comp(picks.map(x => x.c)),
        towers: { top: 3, mid: 3, bot: 3 }, inhib: { top: 1, mid: 1, bot: 1 }, nexusT: 2,
        thp: { top: [1, 1, 1], mid: [1, 1, 1], bot: [1, 1, 1] }, ihp: { top: 1, mid: 1, bot: 1 }, ntp: [1, 1], nxhp: 1,
        drag: [], grubs: 0, herald: 0, baron: 0, baronUntil: 0, push: null, reset: -999, jstart: r() < .5 ? 'top' : 'bot' };
    });
    g.pl = [];
    ['B', 'R'].forEach(k => S.picks[k].slice().sort((a, b) => G.ROLES.indexOf(a.role) - G.ROLES.indexOf(b.role)).forEach(x => {
      const hit = x.pid && Player.find(x.pid), p = hit ? hit.p : { id: 'x' + x.role, name: '공석', ovr: 55 };
      const ms = Draft.mast(p, x.c);
      g.pl.push({ side: k, role: x.role, c: x.c, p, name: p.name, ovr: p.ovr || 60, m: ms.m, sig: ms.sig, meta: Draft.meta(x.c), st: Style.of(x.c), curve: Stats.curve(x.c),
        k: 0, d: 0, a: 0, cs: 0, gold: 500, spent: 0, inv: [], wards: 0, trinket: null, build: Stats.build(x.c, x.role),
        tp: x.role === 'TOP' || (x.role !== 'JGL' && Stats.tp(x.c)), tpReady: 0, lvl: 1, hp: 1, dead: 0, pos: [...this.fountain(k)], trail: null,
        recall: 0, lastBack: 0, jq: [], cleared: false, roam: 0, roamTo: null, off: [(r() - .5) * 3, (r() - .5) * 3], tac: ((S.tactics[k] || {}).roles || {})[x.role] });
    }));
    g.pl.forEach(p => { const o = g.pl.find(q => q.side !== p.side && q.role === p.role); p.mu = o ? Stats.matchup(p.role, p.c, o.c) : { wr: .5, gd: 0, g: 0 }; });
    g.pl.forEach(p => this.shop(g, p));
    g.obj = { drag: { at: 300, prog: {} }, grubs: { at: 360, prog: {}, until: 840 }, herald: { at: 900, prog: {}, until: 1185 }, baron: { at: 1200, prog: {} } };
    this.say(g, 'cast', `${g.side.B.t.name}와 ${g.side.R.t.name}의 ${gameNo ? gameNo + '세트' : '경기'}, 지금 시작합니다!`);
    this.say(g, 'anal', `${g.side.B.t.short}는 ${Draft.TEAM_TAC[g.side.B.tac].n}, ${g.side.R.t.short}는 ${Draft.TEAM_TAC[g.side.R.tac].n} 전술입니다. ${this.compTalk(g)}`);
    const lop = g.pl.filter(p => p.side === 'B' && p.mu.g >= 5 && Math.abs(p.mu.wr - .5) >= .08)[0];
    if (lop) { const o = g.pl.find(q => q.side === 'R' && q.role === lop.role), fav = lop.mu.wr > .5 ? lop : o; this.say(g, 'anal', `${G.ROLE_KO[lop.role]} 매치업은 ${this.cn(fav)} 쪽이 유리합니다. 프로 경기 ${lop.mu.g}판 기준 승률 ${Math.round((fav === lop ? lop.mu.wr : 1 - lop.mu.wr) * 100)}%예요.`); }
    return g;
  },
  compTalk(g) {
    const b = g.side.B.comp, r = g.side.R.comp, B = g.side.B.t.short, R = g.side.R.t.short;
    if (b.early - r.early > .12) return `${B}가 초반에 훨씬 강한 그림이에요.`;
    if (r.early - b.early > .12) return `${R}가 초반 주도권을 잡을 수 있는 조합입니다.`;
    if (b.late - r.late > .12) return `${B}는 후반으로 갈수록 좋아지는 조합이죠.`;
    if (r.late - b.late > .12) return `${R}는 시간을 끌면 유리한 조합이에요.`;
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
    v += Math.max(-5, Math.min(5, this.lead(g, k) / 1000 * .55));
    if (s.baronUntil > g.t) v += 6;
    if (s.drag.length >= 4) v += 4;
    return v;
  },
  // 교전 승리 확률: 양쪽 전투력 차이 + 인원 차이
  win(g, kA, a, b, bonus = 0) { const d = this.tpow(g, kA, a) - this.tpow(g, this.other(kA), b) + (a.length - b.length) * 6 + bonus; return g.r() < 1 / (1 + Math.exp(-d / 13)); },

  // ---------- 해설 ----------
  CAST: { cast: '캐스터', anal: '해설' },
  say(g, who, text) { g.comm.push({ t: g.t, who, text }); },
  clock: t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`,
  pick(g, arr) { return arr[Math.floor(g.r() * arr.length)]; },
  cn: p => Champions.byId[p.c].name,
  laneKo: l => ({ top: '탑', mid: '미드', bot: '바텀' })[l],
  // 받침에 맞는 조사: 이/가, 을/를, 와/과, 은/는
  josa(word, a, b) { const ch = (word || '').charCodeAt((word || '').length - 1); if (ch >= 0xAC00 && ch <= 0xD7A3) return word + ((ch - 0xAC00) % 28 ? a : b); if (/[0-9]$/.test(word)) return word + ('013678'.includes(word.slice(-1)) ? a : b); return word + (/[aeiouyAEIOUY]$/.test(word) ? b : a); },   // 숫자는 읽는 소리(일·삼·육…)로

  // ---------- 상점: 재료부터 사서 완성한다 · 와드 · 장신구 ----------
  free(p) { return p.gold - p.spent; },
  has(p, n) { return p.inv.some(i => i.n === n); },
  // 이 아이템을 만들 때 이미 가진 재료 (가진 것만, 재귀)
  owned(p, it, pool = [...p.inv]) {
    const got = [];
    (it.from || []).forEach(n => { const i = pool.findIndex(x => x.n === n); if (i >= 0) got.push(pool.splice(i, 1)[0]); else { const sub = Stats.it(n); if (sub) got.push(...this.owned(p, sub, pool)); } });
    return got;
  },
  // 다음에 살 재료: 하위 트리에서 아직 없는 것 중 지금 살 수 있는 가장 비싼 것
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
    if (p.role === 'SUP' && m >= 4 && b.trinket) p.trinket = b.trinket;                 // 서폿: 첫 귀환 후 렌즈
    if (!p.inv.length && b.start && this.free(p) >= b.start.gold) this.buy(p, b.start, b.start.gold);
    if (p.role === 'SUP' && b.sup && m >= 11 && this.has(p, b.start.n)) { const i = p.inv.findIndex(x => x.n === b.start.n); p.inv[i] = b.sup; }   // 서폿 퀘스트 완료
    // 제어 와드: 서폿·정글은 2개까지, 나머지는 1개
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
    const first = !g.kills.length;
    victim.dead = g.t + Math.round(8 + this.min(g) * 1.3); victim.d++; victim.hp = 0; victim.recall = 0; victim.jq = [];
    killer.k++; killer.gold += 300 + Math.min(700, Math.max(0, victim.k - victim.d) * 100) + (first ? 100 : 0);
    assists.filter(a => a !== killer && !a.dead).forEach(a => { a.a++; a.gold += 120; });
    g.side[killer.side].kills++;
    g.kills.push({ t: g.t, k: killer, v: victim });
    g.feed.push({ t: g.t, killer, victim, first, n: g.feed.length });
    if (first) this.say(g, 'cast', `퍼스트 블러드! ${g.side[killer.side].t.short} ${killer.name}, ${this.josa(victim.name, '을', '를')} 잡아냅니다!`);
  },
  pickKiller(g, ps) {
    const w = ps.map(p => ({ p, w: ({ MID: 1.3, BOT: 1.5, JGL: 1.1, TOP: 1, SUP: .35 }[p.role]) * (1 + p.st.pick * .5 + p.st.early * .2) }));
    let x = g.r() * w.reduce((a, o) => a + o.w, 0);
    for (const o of w) { x -= o.w; if (x <= 0) return o.p; }
    return w[0].p;
  },
  // 그 자리 근처(radius)에 있는 선수끼리만 싸운다. 텔레포트가 있는 선수는 큰 싸움에 날아온다
  fightAt(g, at, radius, opt = {}) {
    let A = this.near(g, 'B', at, radius), Bp = this.near(g, 'R', at, radius);
    if (!A.length || !Bp.length) return null;
    if (A.length + Bp.length >= 5 && this.min(g) >= 4) ['B', 'R'].forEach(k => this.alive(g, k).filter(p => p.tp && g.t >= p.tpReady && this.dist(p.pos, at) > 40 && !p.recall && g.r() < .55).forEach(p => {
      const to = this.back(at, k, 5); g.fx.push({ type: 'tp', side: k, at: to, from: [...p.pos], t: g.t }); p.pos = to; p.trail = [to]; p.tpReady = g.t + 240;
      if (k === 'B') A.push(p); else Bp.push(p);
      this.say(g, 'cast', `${p.name}, 순간이동으로 합류합니다!`);
    }));
    [...A, ...Bp].forEach(p => { p.recall = 0; });
    let bonus = opt.bonus ? (opt.bonus.side === 'B' ? opt.bonus.v : -opt.bonus.v) : 0;
    // 자기 포탑 근처에서 싸우는 쪽이 유리하다 (포탑 공격)
    ['B', 'R'].forEach(k => { if (['top', 'mid', 'bot'].some(l => { const st = this.structOf(g, k, l); return st.kind !== 'nexus' && this.dist(st.pos, at) < 12; })) bonus += k === 'B' ? 6 : -6; });
    g.calm = g.t + 60;
    const bWin = this.win(g, 'B', A, Bp, bonus), W = bWin ? A : Bp, L = bWin ? Bp : A, wk = bWin ? 'B' : 'R';
    const big = A.length + Bp.length >= 6;
    const nK = Math.min(L.length, big ? 1 + Math.floor(g.r() * g.r() * (L.length + .5)) : g.r() < .75 ? 1 : Math.min(2, L.length));
    const nT = big ? Math.floor(g.r() * Math.min(W.length, 2.4)) : g.r() < .2 ? 1 : 0;
    const vict = L.slice().sort(() => g.r() - .5).slice(0, nK), trade = W.slice().sort(() => g.r() - .5).slice(0, nT);
    vict.forEach(v => this.kill(g, this.pickKiller(g, W.filter(p => !p.dead)) || W[0], v, W));
    trade.forEach(v => { const ks = L.filter(p => !p.dead); if (ks.length) this.kill(g, this.pickKiller(g, ks), v, ks); });
    W.forEach(p => { if (!p.dead) p.hp = Math.max(.15, p.hp - .15 - g.r() * .35); }); L.forEach(p => { if (!p.dead) p.hp = Math.max(.08, p.hp - .35 - g.r() * .3); });
    // 진 쪽 생존자는 빠진다
    L.filter(p => !p.dead).forEach(p => this.walk(p, this.back(p.pos, p.side, 14)));
    g.fx.push({ type: 'fight', at, t: g.t, side: wk });
    const ace = this.alive(g, this.other(wk)).length === 0, f = { wk, n: vict.length, t: trade.length, ace, big, W, L, size: A.length + Bp.length };
    // 이긴 쪽이 숫자가 남으면 가까운 라인 포탑으로 밀고 들어간다
    const wl = W.filter(p => !p.dead).length, deadL = this.other(wk) && g.pl.filter(p => p.side !== wk && p.dead).length;
    if (wl >= 3 && deadL >= 2 && this.min(g) >= 10) { const lane = ['top', 'mid', 'bot'].sort((a, b) => this.distLane(at, a) - this.distLane(at, b))[0]; g.side[wk].push = { lane, until: g.t + (ace ? 90 : 50) }; }
    return f;
  },
  distLane(at, lane) { let best = 1e9; for (let s = 0; s <= 1; s += .05) best = Math.min(best, this.dist(at, Rift.lane(lane, s))); return best; },
  sayFight(g, f, where) {
    if (!f || (!f.n && !f.t)) return;
    const ws = g.side[f.wk].t.short;
    if (f.ace) this.say(g, 'cast', `에이스! ${this.josa(ws, '이', '가')} 상대를 전멸시킵니다!`);
    else if (f.big) this.say(g, 'cast', this.pick(g, [`한타 열립니다! ${this.josa(ws, '이', '가')} ${f.n}킬을 가져가요!`, `대규모 교전! ${ws} 쪽으로 기웁니다, ${f.n} 대 ${f.t}!`]));
    else if (where) this.say(g, 'cast', `${where} 교전, ${this.josa(ws, '이', '가')} ${f.n}킬을 챙깁니다.`);
  },

  // ---------- 구조물 ----------
  // o 진영의 이 라인 맨 앞 구조물 (포탑 → 억제기 → 쌍둥이 포탑 → 넥서스)
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
      s.thp[lane][st.i] = 0; s.towers[lane]--;
      const nm = ['외곽 포탑', '내부 포탑', '억제기 포탑'][st.i];
      g.pl.filter(p => p.side === k && !p.dead).forEach(p => { p.gold += st.i === 0 && this.min(g) < 14 ? 250 : 120; });
      g.ev.push({ t: g.t, side: k, ic: '🏰', txt: `${lk} ${nm}` }); g.fx.push({ type: 'tower', at: st.pos, t: g.t, side: k });
      if (g.r() < .6) this.say(g, 'anal', `${this.josa(ks, '이', '가')} ${lk} ${this.josa(nm, '을', '를')} 철거합니다.`);
    } else if (st.kind === 'inhib') {
      s.ihp[lane] -= dmg; if (s.ihp[lane] > 0) return;
      s.ihp[lane] = 0; s.inhib[lane] = 0;
      g.ev.push({ t: g.t, side: k, ic: '💠', txt: `${lk} 억제기` }); g.fx.push({ type: 'tower', at: st.pos, t: g.t, side: k });
      this.say(g, 'cast', `억제기까지 깨집니다! ${this.josa(ks, '이', '가')} 슈퍼 미니언을 앞세웁니다.`);
    } else if (st.kind === 'nexusT') {
      s.ntp[st.i] -= dmg; if (s.ntp[st.i] > 0) return;
      s.ntp[st.i] = 0; s.nexusT--; g.ev.push({ t: g.t, side: k, ic: '🗼', txt: '쌍둥이 포탑' }); g.fx.push({ type: 'tower', at: st.pos, t: g.t, side: k });
    } else { s.nxhp -= dmg; if (s.nxhp <= 0) this.endGame(g, k); }
  },
  // 공성: 수비가 없을 때 구조물 근처에 있는 인원만큼 깎는다
  siege(g, m) {
    ['B', 'R'].forEach(k => ['top', 'mid', 'bot'].forEach(lane => {
      if (g.over) return;
      const o = this.other(k), st = this.structOf(g, o, lane);
      const atk = this.near(g, k, st.pos, 9).filter(p => !p.recall); if (!atk.length) return;
      const def = this.near(g, o, st.pos, 13).length;
      if (def && atk.length < def + 2) return;                                    // 수비가 있으면 2명 이상 많을 때만
      const plate = st.kind === 'tower' && st.i === 0 && m < 14;
      const dmg = atk.length * (plate ? .035 : st.kind === 'nexus' ? .2 : .15) * (g.side[k].baronUntil > g.t ? 1.6 : 1) * (st.kind === 'tower' && st.i === 1 && m < 16 ? .6 : 1);
      this.hit(g, k, lane, st, dmg);
    }));
    // 억제기가 깨진 라인은 슈퍼 미니언이 계속 밀고 들어간다
    ['B', 'R'].forEach(k => ['top', 'mid', 'bot'].forEach(lane => {
      const o = this.other(k); if (g.over || g.side[o].ihp[lane] > 0) return;
      const st = this.structOf(g, o, lane); if (st.kind === 'nexusT' || st.kind === 'nexus') { if (!this.near(g, o, st.pos, 15).length) this.hit(g, k, lane, st, .05); }
    }));
  },

  // ---------- 오브젝트 ----------
  objUp(g, o) { const ob = g.obj[o]; return ob.at && g.t >= ob.at && (!ob.until || g.t < ob.until); },
  // 바론은 앞선 팀(또는 상대가 많이 죽었을 때)이 시도하고, 상대는 막으러 온다
  baronCall(g, k) {
    if (!this.objUp(g, 'baron')) return false;
    const deadO = g.pl.filter(p => p.side !== k && p.dead).length, deadK = g.pl.filter(p => p.side === k && p.dead).length;
    const mine = this.lead(g, k) > 4000 || deadO - deadK >= 2 || (this.min(g) >= 30 && this.lead(g, k) > 1500) || this.min(g) >= 40;
    const contest = this.near(g, this.other(k), Rift.pos('BAR'), 18).length >= 3 && this.lead(g, k) > -6000;
    return mine || contest;
  },
  objFor(g, p, m) {
    for (const o of ['drag', 'grubs', 'herald', 'baron']) {
      const ob = g.obj[o]; if (!ob.at || (ob.until && g.t >= ob.until)) continue;
      if (o === 'baron' ? !this.baronCall(g, p.side) : ob.at - g.t > 60) continue;
      const roles = m >= 20 && o === 'drag' ? ['JGL', 'MID', 'BOT', 'SUP', p.tac === 'split' ? '' : 'TOP'] : this.OBJ_ROLES[o];
      if (!roles.includes(p.role)) continue;
      const k = p.side, deadK = g.pl.filter(q => q.side === k && q.dead).length, deadO = g.pl.filter(q => q.side !== k && q.dead).length;
      if (o !== 'baron' && (deadK - deadO >= 2 || (1 / (1 + Math.exp(-(this.tpow(g, k) - this.tpow(g, this.other(k))) / 13)) < .33))) continue;
      const pit = Rift.pos(this.PIT[o]), up = g.t >= ob.at;
      return up ? [pit[0] + p.off[0], pit[1] + p.off[1]] : this.back([pit[0] + p.off[0], pit[1] + p.off[1]], p.side, 6);   // 생성 전에는 강 입구에서 시야 잡고 대기
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
        // 오브젝트 한타는 생성 한 번에 한 번. 진 쪽은 빠지고 이긴 쪽이 챙긴다
        ob.fought = true;
        const f = this.fightAt(g, pit, 20); this.sayFight(g, f, `${this.OBJ[o]} 앞`);
        if (f && this.near(g, f.wk, pit, 20).length) { ob.prog[f.wk] = (ob.prog[f.wk] || 0) + 10 * this.near(g, f.wk, pit, 20).length; if (ob.prog[f.wk] >= this.OBJ_NEED[o]) wk = f.wk; }
      } else if (nb.length && nr.length) {
        const k = this.tpow(g, 'B', nb) + nb.length * 6 >= this.tpow(g, 'R', nr) + nr.length * 6 ? 'B' : 'R';
        this.near(g, this.other(k), pit, 20).forEach(p => this.walk(p, this.back(p.pos, p.side, 16)));
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
        const d = this.DRAGONS[Math.floor(g.r() * this.DRAGONS.length)]; s.drag.push(d);
        g.ev.push({ t: g.t, side: wk, ic: d[1], txt: `${d[0]} 드래곤` });
        if (s.drag.length === 4) this.say(g, 'cast', `${s.t.short}, 드래곤 영혼 획득! 한타 주도권이 넘어갑니다!`);
        ob.at = g.t + 300;
      } else if (o === 'grubs') { s.grubs += 3; g.ev.push({ t: g.t, side: wk, ic: '🐛', txt: '공허 유충' }); ob.at = null; }
      else if (o === 'herald') { s.herald++; g.ev.push({ t: g.t, side: wk, ic: '🦀', txt: '전령' }); ob.at = null; s.push = { lane: g.r() < .5 ? 'top' : 'mid', until: g.t + 60 }; this.say(g, 'anal', `${this.josa(s.t.short, '이', '가')} 전령을 ${this.laneKo(s.push.lane)}에 풀러 갑니다.`); }
      else { s.baron++; s.baronUntil = g.t + 180; g.ev.push({ t: g.t, side: wk, ic: '👾', txt: '바론' }); ob.at = g.t + 360; this.say(g, 'cast', `${s.t.short}, 바론 획득! 정비하고 공성을 시작합니다.`); }
      s.reset = g.t;
      if (o === 'baron') s.push = { lane: ['mid', 'bot', 'top'].sort((a, b) => g.side[this.other(wk)].towers[a] - g.side[this.other(wk)].towers[b])[0], until: g.t + 170 };   // 바론 버프로 바로 공성 (귀환 후 합류)   // 오브젝트 뒤에는 다 같이 귀환해서 정비
    }
  },

  // ---------- 정글러 ----------
  // 첫 정글: 버프에서 시작해 6캠프 풀클리어 → 바위게 → 갱 또는 귀환. 이후에는 캠프와 갱을 번갈아.
  jungle(g, p, m) {
    const own = n => Rift.pos((p.side === 'B' ? 'b' : 'r') + n), s = g.side[p.side];
    if (!p.jq.length) {
      if (g.t < 90) p.jq = [{ pos: own(s.jstart === 'top' ? 'JB' : 'JD'), wait: 99 }];
      else if (!p.cleared) {
        const order = s.jstart === 'top' ? ['JB', 'JG', 'JW', 'JR', 'JD', 'JK'] : ['JD', 'JK', 'JR', 'JW', 'JB', 'JG'];
        p.jq = order.map(n => ({ pos: own(n), wait: 15 }));
        p.jq.push({ pos: Rift.pos(s.jstart === 'top' ? (p.side === 'B' ? 'RVbm' : 'RVtm') : (p.side === 'B' ? 'RVtm' : 'RVbm')), wait: 10, kind: 'crab' });
        p.cleared = true;
      } else {
        const gankRate = .35 + p.st.early * .3 + (p.tac === 'gank' ? .25 : 0) - (p.tac === 'farm' ? .2 : 0);
        if (m < 15 && g.r() < gankRate) {
          // 갱 갈 라인: 상대 라이너 체력이 낮거나 우리 라이너가 압박 중인 곳
          const lanes = ['top', 'mid', 'bot'].map(l => { const e = g.pl.find(q => q.side !== p.side && !q.dead && this.LANE_OF[q.role] === l && q.role !== 'SUP'); return { l, e, w: e ? (1.3 - e.hp) + g.r() * .6 : 0 }; }).sort((a, b) => b.w - a.w);
          const L = lanes[0];
          if (L.e) { const spot = this.back(L.e.pos, p.side, -2); p.jq = [{ pos: this.back(spot, p.side, 9), wait: 0 }, { pos: spot, wait: 0, kind: 'gank', lane: L.l }]; }
        }
        if (!p.jq.length) { const camps = Rift.CAMPS.slice().sort(() => g.r() - .5).slice(0, 2); p.jq = camps.map(n => ({ pos: own(n), wait: 15 })); }
      }
    }
    const head = p.jq[0];
    if (this.dist(p.pos, head.pos) < 3) {
      if (head.kind === 'gank') { p.jq.shift(); const f = this.fightAt(g, head.pos, 13, { bonus: { side: p.side, v: 6 } }); if (f && f.n) this.say(g, f.wk === p.side ? 'cast' : 'anal', f.wk === p.side ? `${p.name}의 갱킹! ${this.laneKo(head.lane)}에서 킬이 나옵니다!` : `갱킹을 받아쳤어요! ${this.josa(g.side[f.wk].t.short, '이', '가')} 잘 대응합니다.`); else if (!f) p.jq = []; return p.pos; }
      head.wait -= 10;
      if (head.kind === 'crab' && head.wait <= 0 && !p.crabSaid) { p.crabSaid = true; }
      if (head.wait <= 0) p.jq.shift();
      p.cs += head.kind ? 0 : 1.6; p.gold += head.kind ? 40 : 45;
    }
    return head.pos;
  },

  // ---------- 위치 ----------
  laneSpot(g, p, m, lane) {
    const o = this.other(p.side), me = g.side[p.side], op = g.side[o], sign = p.side === 'B' ? 1 : -1;
    const wave = Math.sin(g.t / 26 + lane.length * 2 + (g.side.B.jstart === 'top' ? 1 : 0)) * (m < 14 ? .13 : .16);
    let front = .5 + ((3 - op.towers[lane]) - (3 - me.towers[lane])) * .08 * sign + Math.max(-.08, Math.min(.08, this.lead(g, p.side) / 20000)) * sign + (p.mu.wr - .5) * .2 * sign + wave;
    front = Math.max(.12, Math.min(.88, front));
    const pt = Rift.lane(lane, front - .045 * sign);   // 라인 맞상대와 사거리만큼 떨어져 선다
    return p.role === 'SUP' ? [pt[0] + p.off[0] + 1, pt[1] + p.off[1] - 1] : [pt[0] + p.off[0] * .5, pt[1] + p.off[1] * .5];
  },
  // 4인 그룹 위치: 미드 전선. 크게 앞서면 상대 미드 구조물 앞, 크게 밀리면 우리 포탑 앞
  groupSpot(g, p, m) {
    const lead = this.lead(g, p.side), o = this.other(p.side);
    if (lead > 2500) { const st = this.structOf(g, o, 'mid'), def = this.near(g, o, st.pos, 14).length >= 2; return this.back([st.pos[0] + p.off[0], st.pos[1] + p.off[1]], p.side, def ? 12 : 3); }
    if (lead < -2500) { const st = this.structOf(g, p.side, 'mid'); return this.back([st.pos[0] + p.off[0], st.pos[1] + p.off[1]], p.side, 2); }
    return this.laneSpot(g, p, m, 'mid');
  },
  target(g, p, m) {
    const s = g.side[p.side], o = this.other(p.side);
    if (s.push && s.push.until > g.t) { const st = this.structOf(g, o, s.push.lane); return this.back([st.pos[0] + p.off[0], st.pos[1] + p.off[1]], p.side, 3); }   // 교전 승리 후: 밀고 들어간다
    const ob = this.objFor(g, p, m); if (ob) return ob;
    if (m < 14) {
      if (p.role === 'JGL') return this.jungle(g, p, m);
      if (p.role === 'SUP') {
        // 서폿: 3분 이후 가끔 강가 시야·미드 로밍
        if (p.roam > g.t) return p.roamTo;
        if (m >= 3 && g.t % 150 < 10 && g.r() < (p.tac === 'roam' ? .7 : .3)) { p.roam = g.t + 30; p.roamTo = g.r() < .5 ? Rift.lane('mid', .5) : Rift.pos(p.side === 'B' ? 'RVbm' : 'RVtm'); return p.roamTo; }
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
      const busy = (s.push && s.push.until > g.t) || this.objFor(g, p, m) || (p.role === 'JGL' && p.jq[0] && p.jq[0].kind === 'gank');
      const money = this.free(p) >= Math.max(m < 14 ? 1250 : 1100, this.nextCost(p)) && g.t - p.lastBack >= (m < 14 ? 180 : 210) && m >= 3.3;
      const reset = g.t - s.reset < 25 && g.t - p.lastBack > 60;
      if (p.hp < .25 || (!busy && (reset || (money && g.r() < .35)))) {
        p.recall = g.t + 10; p.jq = [];
        g.fx.push({ type: 'recall', side: p.side, at: [...p.pos], t: g.t });
      }
    });
  },
  // 우물에서 나갈 때: 목적지가 멀고 텔레포트가 있으면 순간이동
  leaveBase(g, p, m) {
    this.shop(g, p); p.lastBack = g.t; p.hp = 1;
    if (!p.tp || g.t < p.tpReady || m < 3 || p.role === 'JGL') return;
    const to = this.target(g, p, m);
    if (this.dist(this.fountain(p.side), to) < 45) return;
    g.fx.push({ type: 'tp', side: p.side, at: to, from: [...p.pos], t: g.t }); p.pos = to; p.trail = [to]; p.tpReady = g.t + (m < 14 ? 360 : 240);
  },

  // ---------- 진행 (10초) ----------
  step(g) {
    if (g.over) return;
    g.t += 10;
    const m = this.min(g);
    g.pl.forEach(p => { p.trail = null; });
    ['B', 'R'].forEach(k => { const s = g.side[k]; if (s.push && s.push.until <= g.t) { s.push = null; s.reset = g.t; } });
    // 부활 · 귀환 완료 · 성장
    g.pl.forEach(p => {
      if (p.dead && g.t >= p.dead) { p.dead = 0; p.pos = [...this.fountain(p.side)]; p.trail = [p.pos]; this.leaveBase(g, p, m); }
      if (p.dead) { p.pos = [...this.fountain(p.side)]; p.trail = [p.pos]; return; }
      if (p.recall && g.t >= p.recall) { p.recall = 0; p.pos = [...this.fountain(p.side)]; p.trail = [p.pos]; this.leaveBase(g, p, m); }
      if (p.recall) return;
      const inLane = p.role !== 'JGL' && p.role !== 'SUP' && this.distLane(p.pos, this.LANE_OF[p.role] || 'mid') < 8;
      if (p.role === 'SUP') p.gold += 7;                                         // 서폿 퀘스트 아이템 수급
      const cs = p.role === 'SUP' ? .15 : p.role === 'JGL' ? (m < 14 ? 0 : 1) : (inLane || m >= 14 ? 1.5 : .3) * (['farm', 'safe', 'hold'].includes(p.tac) ? 1.08 : 1);
      const c = cs * (.85 + g.r() * .3); p.cs += c; p.gold += 20 + c * 21;
      if (m < 14 && inLane) p.gold += Math.max(0, p.mu.gd) / 6;             // 라인전 매치업 이득 (실제 분당 골드 차이)
      p.lvl = Math.min(18, Math.floor(1 + m * (p.role === 'SUP' ? .48 : .6) + p.k * .12 + p.a * .04));
      if (this.dist(p.pos, this.fountain(p.side)) < 14) p.hp = 1; else p.hp = Math.min(1, p.hp + .02);
    });
    // 이동
    g.pl.forEach(p => { if (p.dead || p.recall || (p.trail && p.trail.length > 1)) return; this.walk(p, this.target(g, p, m)); });
    // 사건: 오브젝트 · 라인전 · 근접 교전 · 공성 · 귀환
    this.objectives(g, m);
    if (m < 14) this.laning(g, m);
    this.skirmish(g, m);
    this.siege(g, m);
    this.decideRecalls(g, m);
    this.filler(g, m);
    g.fx = g.fx.filter(f => g.t - f.t <= 20);
    if (m >= 55 && !g.over) this.endGame(g, this.lead(g, 'B') >= 0 ? 'B' : 'R');
  },
  // 라인전: 맞상대끼리 가끔 솔로킬 (선수 차이 + 실제 매치업 + 압박 전술), 바텀은 2대2
  laning(g, m) {
    ['TOP', 'MID'].forEach(role => {
      const a = this.alive(g, 'B').find(p => p.role === role), b = this.alive(g, 'R').find(p => p.role === role);
      if (!a || !b || a.recall || b.recall || this.dist(a.pos, b.pos) > 10 || g.r() > .008) return;
      const press = (a.tac === 'press' ? 3 : 0) - (b.tac === 'press' ? 3 : 0), muE = (a.mu.wr - .5) * 25;
      const [w, l] = g.r() < 1 / (1 + Math.exp(-((this.ppow(a, m) - this.ppow(b, m)) + press + muE) / 9)) ? [a, b] : [b, a];
      this.kill(g, w, l);
      this.say(g, 'cast', this.pick(g, [`${w.name}, 솔로킬! ${this.cn(w)} 라인전에서 압도합니다!`, `${this.josa(l.name, '이', '가')} 잘렸어요! ${w.name}의 피지컬!`, `${w.name}, 1대1에서 이겨냅니다!`]));
    });
    const bb = this.alive(g, 'B').filter(p => ['BOT', 'SUP'].includes(p.role) && !p.recall), rb = this.alive(g, 'R').filter(p => ['BOT', 'SUP'].includes(p.role) && !p.recall);
    if (bb.length && rb.length && this.dist(bb[0].pos, rb[0].pos) < 10 && g.r() < .007) {
      const at = [(bb[0].pos[0] + rb[0].pos[0]) / 2, (bb[0].pos[1] + rb[0].pos[1]) / 2];
      this.sayFight(g, this.fightAt(g, at, 10), '바텀');
    }
  },
  // 근접 교전: 라인 맞상대가 아닌 적과 가까이 붙으면 싸움이 난다 (로밍 · 인베이드 · 중후반 대치)
  skirmish(g, m) {
    if (g.over) return;
    // 대치 중 이니시: 포탑 앞에서 버티는 상대에게, 더 강한 쪽이 확률적으로 들어간다
    if (m >= 14 && !(g.calm && g.t < g.calm)) for (const k of ['B', 'R']) {
      const o = this.other(k);
      for (const lane of ['mid', 'top', 'bot']) {
        const st = this.structOf(g, o, lane), atk = this.near(g, k, st.pos, 20), def = this.near(g, o, st.pos, 15);
        if (atk.length < 3 || def.length < 1) continue;
        const d = this.tpow(g, k, atk) - this.tpow(g, o, def) + (atk.length - def.length) * 6 - 6, p = 1 / (1 + Math.exp(-d / 13));
        if (g.r() < Math.max(0, p - .46) * .6) {
          const at = [def.reduce((a, q) => a + q.pos[0], 0) / def.length, def.reduce((a, q) => a + q.pos[1], 0) / def.length];
          atk.forEach(q => this.walk(q, at, 14));
          const f = this.fightAt(g, at, 18); if (f) { if (f.wk === k && f.L.filter(x => x.dead).length >= 2) g.side[k].push = { lane, until: g.t + 60 }; this.sayFight(g, f, `${this.laneKo(lane)} 포탑 앞`); }
          return;
        }
      }
    }
    let best = null;
    this.alive(g, 'B').forEach(a => this.alive(g, 'R').forEach(b => {
      if (a.recall || b.recall) return;
      const d = this.dist(a.pos, b.pos); if (d > 7) return;
      if (a.role === b.role && a.role !== 'JGL' && (m < 14 || ['TOP', 'BOT'].includes(a.role))) return;          // 라인 맞상대(사이드 1대1)는 laning에서
      if (m < 14 && ['BOT', 'SUP'].includes(a.role) && ['BOT', 'SUP'].includes(b.role)) return;
      if (!best || d < best.d) best = { a, b, d };
    }));
    if (!best || (g.calm && g.t < g.calm)) return;
    const at = [(best.a.pos[0] + best.b.pos[0]) / 2, (best.a.pos[1] + best.b.pos[1]) / 2];
    const A = this.near(g, 'B', at, 16), Bp = this.near(g, 'R', at, 16), n = A.length + Bp.length;
    const edge = Math.abs(this.tpow(g, 'B', A) - this.tpow(g, 'R', Bp) + (A.length - Bp.length) * 6);
    if (g.r() > (n >= 6 ? .06 : .04) + Math.min(.1, edge / 100)) return;
    const lane = ['top', 'mid', 'bot'].sort((x, y) => this.distLane(at, x) - this.distLane(at, y))[0];
    this.sayFight(g, this.fightAt(g, at, 16), this.distLane(at, lane) < 8 ? this.laneKo(lane) : '정글');
  },
  endGame(g, k) {
    if (g.over) return;
    g.over = { win: k, t: g.t };
    const s = g.side[k], nx = Rift.pos(k === 'B' ? 'rN' : 'bN');
    g.fx.push({ type: 'nexus', at: nx, t: g.t, side: k });
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
  // 길(노드 그래프)을 따라 최대 maxD만큼 걷는다. 지나간 점은 trail에 남겨 중계 화면이 그 길로 그린다
  walk(p, to, maxD = this.SPEED) {
    if (this.fast) { const d = this.dist(p.pos, to); p.pos = d <= maxD ? to : [p.pos[0] + (to[0] - p.pos[0]) / d * maxD, p.pos[1] + (to[1] - p.pos[1]) / d * maxD]; p.trail = [p.pos]; return; }
    const start = p.pos;
    if (this.dist(start, to) < 5) { p.pos = to; p.trail = [start, to]; return; }
    const nodes = Rift.route(Rift.near(start), Rift.near(to)).map(n => Rift.pos(n));
    const pts = [...nodes.slice(this.dist(start, nodes[0]) < 4 ? 1 : 0), to];
    const trail = [start]; let left = maxD, cur = start;
    for (let i = 0; i < pts.length && left > 0; i++) {
      const d = this.dist(cur, pts[i]);
      if (d <= left) { trail.push(pts[i]); left -= d; cur = pts[i]; }
      else { const f = left / d; cur = [cur[0] + (pts[i][0] - cur[0]) * f, cur[1] + (pts[i][1] - cur[1]) * f]; trail.push(cur); left = 0; }
    }
    p.pos = cur; p.trail = trail;
  },
};

// ---------- 중계 화면 ----------
const Live = {
  g: null, speed: 1, timer: null, raf: null, tickAt: 0, feedSeen: 0, banners: [], bannerOn: false,
  SPEEDS: [1, 2, 4, 8],
  start(S) { this.g = Sim.create(S, S.game); this.speed = 1; this.feedSeen = 0; this.banners = []; Router.go('match-live'); },
  // 인벤토리: 아이템 6칸(제어 와드 포함) + 장신구
  inventory(p) { return [...p.inv.map(it => Stats.icon(it)), p.wards ? `<span class="it-w">${Stats.icon(p.build.ward)}<b>${p.wards}</b></span>` : '', p.trinket ? `<span class="it-t">${Stats.icon(p.trinket)}</span>` : ''].join(''); },
  // 가운데 처치 알림: 하나씩 1.6초 (여러 명이 한 번에 죽으면 차례로, 많이 밀리면 건너뛴다)
  banner() {
    if (this.bannerOn || !this.el) return;
    const box = this.el.querySelector('.lv-feed'); if (!box) return;
    if (this.banners.length > 3) this.banners = this.banners.slice(-2);
    const f = this.banners.shift(); if (!f) { box.innerHTML = ''; return; }
    const g = this.g; this.bannerOn = true;
    box.innerHTML = `<div class="lv-kill ${f.killer.side === 'B' ? 'b' : 'r'}">${SoloQ.ic(f.killer.c)}<span><b>${UI.esc(g.side[f.killer.side].t.short)} ${UI.esc(f.killer.name)}</b> ${f.first ? '퍼스트 블러드!' : '처치'} <b>${UI.esc(g.side[f.victim.side].t.short)} ${UI.esc(f.victim.name)}</b></span>${SoloQ.ic(f.victim.c)}</div>`;
    setTimeout(() => { this.bannerOn = false; this.banner(); }, 1600);
  },
  async render(el) {
    await Promise.all([Portal.ready, Mastery.load(), Champions.load(), Stats.load()]);
    clearInterval(this.timer); cancelAnimationFrame(this.raf); this.el = el;
    if (!this.g) return this.empty(el);
    const g = this.g, B = g.side.B.t, R = g.side.R.t;
    el.innerHTML = `
      <div class="lv-wrap">
        <div class="lv-bc">
          <div class="lv-top">
            <div class="lv-tm blue">${G.team(B, 'sm')}<b>${UI.esc(B.short)}</b></div>
            <div class="lv-sc">
              <span class="lv-tw b"></span><span class="lv-gd b"></span><b class="lv-k b"></b><i>⚔</i><b class="lv-k r"></b><span class="lv-gd r"></span><span class="lv-tw r"></span>
              <div class="lv-sub"><span class="lv-dr b"></span><em class="lv-clock"></em><span class="lv-dr r"></span></div>
            </div>
            <div class="lv-tm red"><b>${UI.esc(R.short)}</b>${G.team(R, 'sm')}</div>
          </div>
          <div class="lv-mid">
            <div class="lv-side b"></div>
            <div class="lv-map"><img class="lv-bg" src="assets/map/rift.webp" alt=""><svg class="lv-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${this.structures()}</svg><div class="lv-fx"></div><div class="lv-icons"></div><div class="lv-feed"></div><div class="lv-klog"></div><div class="lv-over"></div></div>
            <div class="lv-side r"></div>
          </div>
          <div class="lv-bot">
            <div class="lv-cam b"></div>
            <div class="lv-stats"></div>
            <div class="lv-cam r"></div>
          </div>
        </div>
        <div class="lv-panel">
          <div class="lv-ctrl">
            <button class="btn-ghost lv-pause">일시정지</button>
            <div class="seg lv-speed">${this.SPEEDS.map(s => `<button class="${this.speed === s ? 'on' : ''}" data-s="${s}">${s}x</button>`).join('')}</div>
            <button class="btn-ghost lv-skip">결과로</button>
          </div>
          <div class="lv-evs"></div>
          <div class="lv-comm"></div>
        </div>
      </div>`;
    $('.lv-speed', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.speed = +b.dataset.s; $$('.lv-speed button', el).forEach(x => x.classList.toggle('on', x === b)); this.loop(); };
    $('.lv-pause', el).onclick = e => { if (this.timer) { clearInterval(this.timer); this.timer = null; e.target.textContent = '계속'; } else { e.target.textContent = '일시정지'; this.loop(); } };
    $('.lv-skip', el).onclick = () => { clearInterval(this.timer); this.timer = null; while (!g.over) Sim.step(g); this.feedSeen = g.feed.length; this.banners = []; this.tickAt = 0; this.draw(); this.finish(); };
    this.feedSeen = Math.max(this.feedSeen, g.feed.length); this.banners = []; this.bannerOn = false;
    this.tickAt = performance.now(); this.draw(); this.animate();
    if (g.over) this.finish(); else this.loop();
  },
  structures() {
    Rift.init();
    const out = [];
    ['B', 'R'].forEach(k => ['top', 'mid', 'bot'].forEach(l => {
      Rift.TOWER[k][l].forEach((n, i) => { const [x, y] = Rift.pos(n); out.push(`<circle class="tw ${k.toLowerCase()}" data-tw="${k}-${l}-${i}" cx="${x}" cy="${y}" r="1.25"/>`); });
      const [x, y] = Rift.INHIB[k][l]; out.push(`<circle class="ih ${k.toLowerCase()}" data-ih="${k}-${l}" cx="${x}" cy="${y}" r="1.4"/>`);
    }));
    return out.join('');
  },
  loop() {
    clearInterval(this.timer);
    if (this.g.over) return;
    this.timer = setInterval(() => {
      if (!document.body.contains(this.el)) { clearInterval(this.timer); return; }
      Sim.step(this.g); this.tickAt = performance.now(); this.draw();
      if (this.g.over) { clearInterval(this.timer); this.timer = null; setTimeout(() => this.finish(), 900 / this.speed); }
    }, 1000 / this.speed);
  },
  // 틱 사이: 각 선수의 이동 경로(trail)를 따라 부드럽게 그린다
  at(trail, f) {
    if (!trail || trail.length < 2) return trail ? trail[trail.length - 1] : null;
    let total = 0; const seg = [];
    for (let i = 1; i < trail.length; i++) { const d = Math.hypot(trail[i][0] - trail[i - 1][0], trail[i][1] - trail[i - 1][1]); seg.push(d); total += d; }
    let rest = f * total;
    for (let i = 0; i < seg.length; i++) { if (rest <= seg[i] || i === seg.length - 1) { const q = seg[i] ? Math.min(1, rest / seg[i]) : 1; return [trail[i][0] + (trail[i + 1][0] - trail[i][0]) * q, trail[i][1] + (trail[i + 1][1] - trail[i][1]) * q]; } rest -= seg[i]; }
    return trail[trail.length - 1];
  },
  animate() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.el || !document.body.contains(this.el)) return;
      const g = this.g, f = this.tickAt ? Math.min(1, (performance.now() - this.tickAt) / (1000 / this.speed)) : 1;
      $$('.lv-ic', this.el).forEach(ic => { const p = g.pl[ic.dataset.i], pos = this.at(p.trail, f) || p.pos; ic.style.left = pos[0] + '%'; ic.style.top = pos[1] + '%'; });
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },
  draw() {
    const g = this.g, el = this.el; if (!el || !document.body.contains(el)) return;
    const gb = Sim.gold(g, 'B'), gr = Sim.gold(g, 'R'), twLeft = k => 11 - Object.values(g.side[k].towers).reduce((a, v) => a + v, 0) - (2 - g.side[k].nexusT);
    $('.lv-k.b', el).textContent = g.side.B.kills; $('.lv-k.r', el).textContent = g.side.R.kills;
    $('.lv-gd.b', el).textContent = (gb / 1000).toFixed(1) + 'K'; $('.lv-gd.r', el).textContent = (gr / 1000).toFixed(1) + 'K';
    $('.lv-tw.b', el).textContent = '🏰 ' + twLeft('R'); $('.lv-tw.r', el).textContent = twLeft('B') + ' 🏰';
    $('.lv-dr.b', el).innerHTML = g.side.B.drag.map(d => `<i title="${d[0]}">${d[1]}</i>`).join('') + (g.side.B.baronUntil > g.t ? '<i class="bn">👾</i>' : '');
    $('.lv-dr.r', el).innerHTML = (g.side.R.baronUntil > g.t ? '<i class="bn">👾</i>' : '') + g.side.R.drag.map(d => `<i title="${d[0]}">${d[1]}</i>`).join('');
    $('.lv-clock', el).textContent = Sim.clock(g.t);
    // 양옆 선수 · 맵 아이콘: 처음 한 번 만들고 값만 바꾼다
    if (!el.querySelector('.lv-pl')) {
      ['B', 'R'].forEach(k => {
        $('.lv-side.' + k.toLowerCase(), el).innerHTML = g.pl.filter(p => p.side === k).map(p => `
          <div class="lv-pl" data-i="${g.pl.indexOf(p)}">
            <div class="lv-pic">${SoloQ.ic(p.c)}<i></i><em></em></div>
            <div class="lv-pi"><small>${UI.esc(g.side[k].t.short)} ${UI.esc(p.name)}</small><div class="lv-hp"><i></i></div><div class="lv-items"></div></div>
          </div>`).join('');
      });
      $('.lv-icons', el).innerHTML = g.pl.map((p, i) => `<div class="lv-ic ${p.side === 'B' ? 'b' : 'r'}" data-i="${i}" title="${UI.esc(p.name)}"><img src="${Champions.byId[p.c].icon}" alt=""></div>`).join('');
    }
    $$('.lv-pl', el).forEach(row => {
      const p = g.pl[row.dataset.i];
      row.classList.toggle('dead', !!p.dead); row.querySelector('.lv-pic i').textContent = p.lvl;
      row.querySelector('.lv-pic em').textContent = p.dead ? Math.max(0, p.dead - g.t) : '';
      row.querySelector('.lv-hp i').style.width = Math.round(p.hp * 100) + '%';
      const its = row.querySelector('.lv-items'), key = p.inv.map(x => x.id).join(',') + '|' + p.wards + '|' + (p.trinket ? p.trinket.id : '');
      if (its.dataset.k !== key) { its.dataset.k = key; its.innerHTML = this.inventory(p); }
    });
    $$('.lv-ic', el).forEach(ic => { const p = g.pl[ic.dataset.i]; ic.classList.toggle('dead', !!p.dead); ic.classList.toggle('recalling', !!p.recall); });
    // 포탑 · 억제기
    ['B', 'R'].forEach(k => ['top', 'mid', 'bot'].forEach(l => {
      Rift.TOWER[k][l].forEach((n, i) => { const c = el.querySelector(`[data-tw="${k}-${l}-${i}"]`); if (c) c.classList.toggle('down', g.side[k].towers[l] <= 2 - i); });
      const ih = el.querySelector(`[data-ih="${k}-${l}"]`); if (ih) ih.classList.toggle('down', !g.side[k].inhib[l]);
    }));
    // 효과: 귀환 · 텔레포트 · 교전 · 포탑 파괴
    const dur = (1 / this.speed).toFixed(2);
    $('.lv-fx', el).innerHTML = g.fx.filter(f => g.t - f.t <= 10).map(f => {
      const [x, y] = f.at, sd = f.side === 'B' ? 'b' : 'r';
      if (f.type === 'tp') return `<div class="lv-fx-tp ${sd}" style="left:${x}%;top:${y}%;--d:${dur}s"></div><div class="lv-fx-tpo ${sd}" style="left:${f.from[0]}%;top:${f.from[1]}%;--d:${dur}s"></div>`;
      if (f.type === 'recall') return `<div class="lv-fx-rc ${sd}" style="left:${x}%;top:${y}%;--d:${dur}s"></div>`;
      if (f.type === 'fight') return `<div class="lv-fx-fight" style="left:${x}%;top:${y}%;--d:${dur}s"></div>`;
      return `<div class="lv-fx-boom ${sd}" style="left:${x}%;top:${y}%;--d:${dur}s"></div>`;
    }).join('');
    // 처치: 오른쪽 위 킬 로그(최근 5개) + 가운데 알림은 새 처치마다 한 번씩
    $('.lv-klog', el).innerHTML = g.feed.slice(-5).reverse().map(f => `<div class="lv-kl ${f.killer.side === 'B' ? 'b' : 'r'}"><span>${Sim.clock(f.t)}</span>${SoloQ.ic(f.killer.c)}<i>⚔</i>${SoloQ.ic(f.victim.c)}</div>`).join('');
    for (; this.feedSeen < g.feed.length; this.feedSeen++) this.banners.push(g.feed[this.feedSeen]);
    this.banner();
    // 하단 선수 캠
    ['B', 'R'].forEach(k => {
      const recent = g.feed.slice().reverse().find(x => x.killer.side === k && g.t - x.t <= 40);
      const ps = g.pl.filter(p => p.side === k), p = recent ? recent.killer : ps[Math.floor(g.t / 60 + (k === 'B' ? 0 : 2)) % 5];
      const cam = $('.lv-cam.' + k.toLowerCase(), el);
      if (cam.dataset.pid !== p.p.id) { cam.dataset.pid = p.p.id; cam.innerHTML = `${p.p.photo ? `<img src="${p.p.photo}" alt="">` : `<div class="lv-cam-empty">${UI.esc(p.name[0] || '?')}</div>`}<b>${UI.esc(p.name)}</b>`; }
    });
    // 스탯표 (아이템 포함)
    $('.lv-stats', el).innerHTML = G.ROLES.map(r => { const a = g.pl.find(p => p.side === 'B' && p.role === r), b = g.pl.find(p => p.side === 'R' && p.role === r); return `
      <div class="lv-st"><span class="its">${this.inventory(a)}</span>${SoloQ.ic(a.c)}<span class="kda">${a.k}/${a.d}/${a.a}</span><span class="cs">${Math.round(a.cs)}</span><em class="${a.gold >= b.gold ? 'b' : 'r'}">${a.gold >= b.gold ? '◀' : '▶'} ${(Math.abs(a.gold - b.gold) / 1000).toFixed(1)}K</em><span class="cs">${Math.round(b.cs)}</span><span class="kda">${b.k}/${b.d}/${b.a}</span>${SoloQ.ic(b.c)}<span class="its r">${this.inventory(b)}</span></div>`; }).join('');
    $('.lv-evs', el).innerHTML = g.ev.slice(-8).reverse().map(e => `<div class="lv-ev ${e.side === 'B' ? 'b' : 'r'}"><span>${Sim.clock(e.t)}</span>${e.ic} ${UI.esc(g.side[e.side].t.short)} ${UI.esc(e.txt)}</div>`).join('') || '<p class="cr-dim">오브젝트 기록</p>';
    const comm = $('.lv-comm', el);
    if (comm.dataset.n != g.comm.length) {
      comm.dataset.n = g.comm.length;
      comm.innerHTML = g.comm.slice(-30).map(c => `<div class="lv-line ${c.who}"><span>${Sim.clock(c.t)}</span><b>${Sim.CAST[c.who]}</b><p>${UI.esc(c.text)}</p></div>`).join('');
      comm.scrollTop = comm.scrollHeight;
    }
  },
  finish() {
    const g = this.g, w = g.side[g.over.win], el = this.el, S = g.S;
    if (!el || !document.body.contains(el) || !el.querySelector('.lv-over')) return;
    const game = S.series.games.find(x => x.game === S.game); if (game && !game.result) game.result = Season.gameResult(g);
    const plan = (App.state.plans || {})[S.series.key]; if (plan) plan.series = S.series;
    const my = App.state.teamId, sc = Season.seriesScore(S.series), over = Season.seriesOver(S.series);
    if (over && S.official) Season.recordSeries(S.series.key, S.series);
    const mine = w.t.id === my, opp = Object.keys(sc).find(k => k !== my);
    $('.lv-over', el).innerHTML = `<div class="lv-res ${mine ? 'win' : 'lose'}"><small>${Sim.clock(g.t)}${S.series.bo > 1 ? ` · ${S.game}세트` : ''}</small><b>${mine ? 'VICTORY' : 'DEFEAT'}</b><span>${G.team(w.t, 'sm')} ${UI.esc(w.t.name)} 승리 · ${g.side.B.kills} : ${g.side.R.kills}</span>
      ${S.series.bo > 1 ? `<span class="lv-series">시리즈 ${sc[my] || 0} : ${sc[opp] || 0}${over ? ' · 종료' : ''}</span>` : ''}
      <div class="lv-mvp">${SoloQ.ic(g.over.mvp.c)}<div><small>POG</small><b>${UI.esc(g.over.mvp.name)}</b><span>${g.over.mvp.k}/${g.over.mvp.d}/${g.over.mvp.a}</span></div></div>
      <div class="lv-res-btn">${!over ? '<button class="btn-primary lv-next">다음 세트 밴픽 →</button>' : ''}<button class="btn-ghost lv-back">밴픽 화면으로</button></div></div>`;
    $('.lv-back', el).onclick = () => Router.go('match-draft');
    const nx = $('.lv-next', el);
    if (nx) nx.onclick = () => {
      const oppT = Draft.side(S, S.us === 'B' ? 'R' : 'B'), lost = g.over.win !== S.us;
      // 진 팀이 다음 세트 진영을 고른다 (블루를 가져간다고 본다)
      Draft.start({ opp: oppT.id, side: lost ? 'B' : 'R', mode: S.mode, bo: S.series.bo, key: S.official ? S.series.key : null, continueSeries: true });
      Router.go('match-draft');
    };
  },
  empty(el) {
    el.innerHTML = `<div class="cr-page">${Career.head('경기 관전', '밴픽과 전술을 확정하면 경기를 옵저버 화면으로 볼 수 있습니다.')}
      <div class="card fx-empty"><b>관전할 경기가 없습니다</b><span>밴픽 준비에서 밴픽을 마치거나, 코치에게 맡겨 바로 시작할 수 있습니다.</span>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:12px"><a class="btn-ghost" href="#match-draft">밴픽 준비</a><button class="btn-primary lv-quick">빠른 경기 (양 팀 코치 밴픽)</button></div></div></div>`;
    $('.lv-quick', el).onclick = () => {
      const my = Roster.team(), nm = Schedule.next(my.id, Clock.today()), opp = (nm && Schedule.opponent(nm, my.id)) || App.db.teams.find(t => t.league === my.league && t.id !== my.id);
      Draft.start({ opp: opp.id, side: 'B', mode: 'delegate', bo: 1 });
      const S = Draft.st(); while (!S.done) Draft.aiAct(S); Draft.confirm(S);
      this.start(S); this.render(el);
    };
  },
};

Views['match-live'] = el => Live.render(el);

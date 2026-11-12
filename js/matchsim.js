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
  LANE_OF: { TOP: 'top', MID: 'mid', BOT: 'bot', SUP: 'bot' },
  DRAGONS: [['화염', '🔥'], ['바다', '🌊'], ['바람', '🌪'], ['대지', '⛰'], ['마법공학', '⚡'], ['화학공학', '☣']],
  SPEED: 24,   // 10초 동안 움직이는 거리 (맵 %)

  rng(seed) { let h = 1779033703 ^ seed.length; for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; },
  fountain(k) { return Rift.pos(k === 'B' ? 'bF' : 'rF'); },

  // ---------- 준비 ----------
  create(S, gameNo) {
    Rift.init();
    const r = this.rng(S.id + ':sim'), g = { t: 0, r, S, over: null, feed: [], comm: [], ev: [], kills: [], fx: [] };
    g.side = {};
    ['B', 'R'].forEach(k => {
      const t = Draft.side(S, k), co = Draft.coach(t), picks = S.picks[k];
      // 실데이터 시너지: 같은 팀 짝(바텀 듀오 등) 승률 합
      let syn = 0; picks.forEach((a, i) => picks.slice(i + 1).forEach(b => { const q = Stats.synergy(a.role, a.c, b.role, b.c); if (q) syn += q.wr - .5; }));
      g.side[k] = { k, t, coach: co.r, kills: 0, towers: { top: 3, mid: 3, bot: 3 }, inhib: { top: 1, mid: 1, bot: 1 }, nexusT: 2, drag: [], grubs: 0, herald: 0, baron: 0, baronUntil: 0,
        fit: Draft.fitTotal(S, k) || 50, form: (r() - .5) * 7, syn,   // form: 그날 컨디션 (임시)
        tac: (S.tactics[k] || {}).team || 'bal', comp: Style.comp(picks.map(x => x.c)) };
    });
    g.pl = [];
    ['B', 'R'].forEach(k => S.picks[k].slice().sort((a, b) => G.ROLES.indexOf(a.role) - G.ROLES.indexOf(b.role)).forEach(x => {
      const hit = x.pid && Player.find(x.pid), p = hit ? hit.p : { id: 'x' + x.role, name: '공석', ovr: 55 };
      const ms = Draft.mast(p, x.c), build = Stats.build(x.c);
      g.pl.push({ side: k, role: x.role, c: x.c, p, name: p.name, ovr: p.ovr || 60, m: ms.m, sig: ms.sig, meta: Draft.meta(x.c), st: Style.of(x.c), curve: Stats.curve(x.c),
        k: 0, d: 0, a: 0, cs: 0, gold: 500, spent: 0, items: [], build, tp: x.role === 'TOP' || Stats.tp(x.c), tpReady: 0,
        lvl: 1, hp: 1, dead: 0, pos: [...this.fountain(k)], trail: null, recall: 0, tac: ((S.tactics[k] || {}).roles || {})[x.role] });
    }));
    // 라인 매치업 (실데이터): 같은 포지션 맞상대 승률 · 분당 골드 차이
    g.pl.forEach(p => { const o = g.pl.find(q => q.side !== p.side && q.role === p.role); p.mu = o ? Stats.matchup(p.role, p.c, o.c) : { wr: .5, gd: 0, g: 0 }; });
    g.pl.forEach(p => this.shop(g, p));
    g.next = { drag: 300, grubs: 360, herald: 900, baron: 1200 };
    g.focus = null;
    this.say(g, 'cast', `${g.side.B.t.name}와 ${g.side.R.t.name}의 ${gameNo ? gameNo + '세트' : '경기'}, 지금 시작합니다!`);
    this.say(g, 'anal', `${g.side.B.t.short}는 ${Draft.TEAM_TAC[g.side.B.tac].n}, ${g.side.R.t.short}는 ${Draft.TEAM_TAC[g.side.R.tac].n} 전술입니다. ${this.compTalk(g)}`);
    const lop = g.pl.filter(p => p.side === 'B' && p.mu.g >= 5 && Math.abs(p.mu.wr - .5) >= .08)[0];
    if (lop) { const o = g.pl.find(q => q.side === 'R' && q.role === lop.role), fav = lop.mu.wr > .5 ? lop : o; this.say(g, 'anal', `${G.ROLE_KO[lop.role]} 매치업은 ${Champions.byId[fav.c].name} 쪽이 유리합니다. 프로 경기 ${lop.mu.g}판 기준 승률 ${Math.round((fav === lop ? lop.mu.wr : 1 - lop.mu.wr) * 100)}%예요.`); }
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
  min: g => g.t / 60,
  alive(g, k) { return g.pl.filter(p => p.side === k && !p.dead); },
  gold(g, k) { return g.pl.filter(p => p.side === k).reduce((a, p) => a + p.gold, 0); },
  other: k => k === 'B' ? 'R' : 'B',
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
  // 선수 전투력: OVR + 숙련 + 메타 + 레벨 + 아이템 + 시간대별 실제 승률
  ppow(p, m = 15) { const ph = m < 22 ? p.curve[0] : m < 30 ? p.curve[1] : p.curve[2]; return p.ovr * .6 + p.m * .4 + (p.sig ? 2 : 0) + p.meta * 3 + p.lvl * .2 + p.items.length * .5 + (ph - .5) * 20 + Math.min(2.5, p.k * .15) - Math.min(2, p.d * .1); },
  tpow(g, k, who) {
    const s = g.side[k], ps = (who || g.pl.filter(p => p.side === k && !p.dead)), m = this.min(g), c = s.comp;
    if (!ps.length) return 0;
    let v = ps.reduce((a, p) => a + this.ppow(p, m), 0) / ps.length + (ps.length - 5) * 3 + s.form + s.syn * 8;
    v += m < 14 ? (c.early - .4) * 10 : m < 26 ? ((c.fight + c.engage) / 2 - .4) * 9 : (c.late - .4) * 10;
    const tacPhase = { early: m < 15, snow: m < 22, fight: m >= 12 && m < 30, late: m >= 25, bal: true }[s.tac];
    v += (s.fit - 50) / 50 * (tacPhase ? 4 : 1.5) + (s.coach - 10) * .15;
    v += Math.max(-5, Math.min(5, (this.gold(g, k) - this.gold(g, this.other(k))) / 1000 * .55));
    if (s.baronUntil > g.t) v += 6;
    if (s.drag.length >= 4) v += 4;
    return v;
  },
  win(g, kA, a, b) { const d = this.tpow(g, kA, a) - this.tpow(g, this.other(kA), b); return g.r() < 1 / (1 + Math.exp(-d / 13)); },

  // ---------- 해설 ----------
  CAST: { cast: '캐스터', anal: '해설' },
  say(g, who, text) { g.comm.push({ t: g.t, who, text }); },
  clock: t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`,
  pick(g, arr) { return arr[Math.floor(g.r() * arr.length)]; },
  cn: p => Champions.byId[p.c].name,
  laneKo: l => ({ top: '탑', mid: '미드', bot: '바텀' })[l],

  // ---------- 상점 ----------
  shop(g, p) {
    if (!p.items.length && p.build.start && p.gold - p.spent >= p.build.start.gold) { p.items.push(p.build.start); p.spent += p.build.start.gold; }
    for (const it of p.build.core) {
      if (p.items.includes(it)) continue;
      if (p.gold - p.spent < it.gold) break;
      if (p.items.length >= 6) p.items = p.items.filter(x => x !== p.build.start);
      p.items.push(it); p.spent += it.gold;
      if (g.t > 0 && !it.boots && p.items.filter(x => x.gold >= 2000 && !x.boots).length === 3) this.say(g, 'anal', `${p.name}, ${it.ko}까지 3코어 완성! 이제 ${this.cn(p)}가 제일 강할 시간입니다.`);
    }
  },

  // ---------- 처치 ----------
  kill(g, killer, victim, assists = []) {
    if (victim.dead) return;
    const first = !g.kills.length;
    victim.dead = g.t + Math.round(8 + this.min(g) * 1.3); victim.d++; victim.hp = 0; victim.recall = 0;
    killer.k++; killer.gold += 300 + Math.min(700, Math.max(0, victim.k - victim.d) * 100) + (first ? 100 : 0);
    assists.filter(a => a !== killer && !a.dead).forEach(a => { a.a++; a.gold += 120; });
    g.side[killer.side].kills++;
    g.kills.push({ t: g.t, k: killer, v: victim });
    g.feed.push({ t: g.t, killer, victim, first });
    if (first) this.say(g, 'cast', `퍼스트 블러드! ${g.side[killer.side].t.short} ${killer.name}, ${this.cn(killer)}로 ${victim.name}를 잡아냅니다!`);
  },
  pickKiller(g, ps) {
    const w = ps.map(p => ({ p, w: ({ MID: 1.3, BOT: 1.5, JGL: 1.1, TOP: 1, SUP: .35 }[p.role]) * (1 + p.st.pick * .5 + p.st.early * .2) }));
    let x = g.r() * w.reduce((a, o) => a + o.w, 0);
    for (const o of w) { x -= o.w; if (x <= 0) return o.p; }
    return w[0].p;
  },
  // 교전 장소로 모이기: 가까운 선수는 걸어가고, 텔레포트가 있으면 순간이동
  gather(g, k, n, at) {
    const list = this.alive(g, k).sort((a, b) => this.dist(a.pos, at) - this.dist(b.pos, at)).slice(0, n);
    list.forEach(p => {
      p.recall = 0;
      const far = this.dist(p.pos, at) > this.SPEED * 1.6;
      if (far && p.tp && g.t >= p.tpReady && this.min(g) >= 3) {
        const to = [at[0] + (g.r() - .5) * 6, at[1] + (g.r() - .5) * 6];
        g.fx.push({ type: 'tp', side: p.side, at: to, from: [...p.pos], t: g.t, c: p.c });
        p.pos = to; p.trail = [to]; p.tpReady = g.t + (this.min(g) < 14 ? 360 : 240);
        if (g.r() < .5) this.say(g, 'cast', `${p.name}, 순간이동으로 합류합니다!`);
      } else this.walk(p, [at[0] + (g.r() - .5) * 7, at[1] + (g.r() - .5) * 7], this.SPEED * 1.6);
    });
    return list;
  },
  fight(g, kind, at, nB, nR) {
    const A = this.gather(g, 'B', nB, at), Bp = this.gather(g, 'R', nR, at);
    if (!A.length || !Bp.length) return null;
    const bWin = this.win(g, 'B', A, Bp), W = bWin ? A : Bp, L = bWin ? Bp : A, wk = bWin ? 'B' : 'R';
    const big = A.length + Bp.length >= 7;
    const nK = Math.min(L.length, big ? 1 + Math.floor(g.r() * g.r() * (L.length + .5)) : g.r() < .8 ? 1 : 2);
    const nT = big ? Math.floor(g.r() * Math.min(W.length, 2.4)) : g.r() < .25 ? 1 : 0;
    const vict = L.slice().sort(() => g.r() - .5).slice(0, nK), trade = W.slice().sort(() => g.r() - .5).slice(0, nT);
    vict.forEach(v => this.kill(g, this.pickKiller(g, W.filter(p => !p.dead)) || W[0], v, W));
    trade.forEach(v => { const ks = L.filter(p => !p.dead); if (ks.length) this.kill(g, this.pickKiller(g, ks), v, ks); });
    W.forEach(p => { if (!p.dead) p.hp = Math.max(.15, p.hp - .2 - g.r() * .4); }); L.forEach(p => { if (!p.dead) p.hp = Math.max(.08, p.hp - .4 - g.r() * .3); });
    g.fx.push({ type: 'fight', at, t: g.t, side: wk });
    const ace = this.alive(g, this.other(wk)).length === 0;
    return { wk, bWin, n: vict.length, t: trade.length, ace, big, W, L };
  },

  // ---------- 진행 ----------
  step(g) {
    if (g.over) return;
    g.t += 10;
    const m = this.min(g);
    g.pl.forEach(p => { p.trail = null; p.from = [...p.pos]; });
    // 성장 · 부활 · 귀환
    g.pl.forEach(p => {
      if (p.dead && g.t >= p.dead) { p.dead = 0; p.hp = 1; p.pos = [...this.fountain(p.side)]; p.trail = [p.pos]; this.shop(g, p); this.tpOut(g, p); }
      if (p.dead) { p.pos = [...this.fountain(p.side)]; p.trail = [p.pos]; return; }
      if (p.recall && g.t >= p.recall) {   // 귀환 완료: 우물 → 상점 → (텔레포트로) 복귀
        p.recall = 0; p.hp = 1; p.pos = [...this.fountain(p.side)]; p.trail = [p.pos]; this.shop(g, p); this.tpOut(g, p);
      }
      const cs = { TOP: 1.45, MID: 1.5, BOT: 1.6, JGL: 1.05, SUP: .18 }[p.role] * (['farm', 'safe', 'hold'].includes(p.tac) ? 1.08 : 1) * (.85 + g.r() * .3) * (p.recall ? 0 : 1);
      p.cs += cs; p.gold += 20 + cs * 21;
      if (m < 14 && p.role !== 'JGL') p.gold += Math.max(0, p.mu.gd) / 6;      // 라인전 매치업 이득 (실제 분당 골드 차이)
      p.lvl = Math.min(18, Math.floor(1 + m * (p.role === 'SUP' ? .48 : .6) + p.k * .12 + p.a * .04));
      p.hp = Math.min(1, p.hp + (p.recall ? 0 : .05));
    });
    // 오브젝트: 30초 전부터 모인다
    const objs = [['drag', g.next.drag], ['grubs', g.next.grubs], ['herald', g.next.herald], ['baron', g.next.baron]].filter(([, at]) => at && g.t >= at - 30 && g.t <= at + 30);
    g.focus = objs.length ? objs[0][0] : null;
    const objNow = objs.find(([, at]) => g.t >= at);
    if (objNow) this.objective(g, objNow[0]);
    else if (!g.focus) this.random(g, m);
    if (!g.over && m >= 20) ['B', 'R'].forEach(k => { const lead = this.gold(g, k) - this.gold(g, this.other(k)); if ((g.side[k].baronUntil > g.t || lead > 6000) && g.r() < .12) this.push(g, k, false); });
    this.decideRecalls(g, m);
    this.move(g, m);
    this.filler(g, m);
    g.fx = g.fx.filter(f => g.t - f.t <= 20);
    if (m >= 55) this.endGame(g, this.gold(g, 'B') >= this.gold(g, 'R') ? 'B' : 'R');
  },
  // 귀환 판단: 체력이 낮거나 돈이 모였고, 근처 오브젝트가 없을 때
  decideRecalls(g, m) {
    g.pl.forEach(p => {
      if (p.dead || p.recall || g.focus || (p.trail && p.trail.length > 1)) return;
      if (this.dist(p.pos, this.fountain(p.side)) < 14) return;
      const next = p.build.core.find(it => !p.items.includes(it)), money = next && p.gold - p.spent >= next.gold;
      if (p.hp < .35 || (money && m >= 3 && g.r() < .35) || (m < 14 && g.t % 240 < 10 && g.r() < .3)) {
        p.recall = g.t + 10;
        g.fx.push({ type: 'recall', side: p.side, at: [...p.pos], t: g.t, c: p.c });
      }
    });
  },
  // 우물에서 나가기: 텔레포트가 준비됐으면 라인으로 순간이동
  tpOut(g, p) {
    const m = this.min(g);
    if (!p.tp || g.t < p.tpReady || m < 2 || p.role === 'JGL') return;
    const to = this.laneSpot(g, p, m);
    g.fx.push({ type: 'tp', side: p.side, at: to, from: [...p.pos], t: g.t, c: p.c });
    p.pos = to; p.trail = [to]; p.tpReady = g.t + (m < 14 ? 360 : 240);
  },
  laneSpot(g, p, m) {
    const lane = m < 14 ? this.LANE_OF[p.role] : p.role === 'TOP' && p.tac === 'split' ? 'top' : ['mid', 'bot', 'top'][Math.floor(g.t / 150 + (p.side === 'B' ? 0 : 1)) % 3];
    const o = g.side[this.other(p.side)], me = g.side[p.side];
    // 라인 전선: 포탑이 깨질수록 밀린 쪽으로, 웨이브처럼 앞뒤로 출렁인다
    let front = .5 + ((3 - o.towers[lane]) - (3 - me.towers[lane])) * (p.side === 'B' ? .07 : -.07) + Math.sin(g.t / 45 + lane.length) * .05;
    front = Math.max(.15, Math.min(.85, front));
    const pt = Rift.lane(lane, front + (p.side === 'B' ? -.03 : .03));
    return p.role === 'SUP' ? [pt[0] + 1.5, pt[1] - 1.5] : pt;
  },
  objective(g, o) {
    const at = Rift.pos(this.PIT[o]), name = { drag: '드래곤', grubs: '공허 유충', herald: '전령', baron: '바론' }[o];
    const contest = g.r() < (o === 'baron' ? .75 : .5);
    let wk;
    if (contest) {
      const f = this.fight(g, o, at, o === 'grubs' ? 3 : 5, o === 'grubs' ? 3 : 5);
      wk = f ? f.wk : 'B';
      if (f && f.n) this.say(g, 'cast', `${name} 앞 한타! ${g.side[f.wk].t.short}가 ${f.n}킬을 따내며 ${name}까지 가져갑니다!${f.ace ? ' 에이스!' : ''}`);
      if (f && f.ace) this.push(g, f.wk, true);
    } else {
      wk = this.win(g, 'B') ? 'B' : 'R';
      this.say(g, 'anal', `${g.side[this.other(wk)].t.short}가 시야를 못 잡았어요. ${g.side[wk].t.short}가 ${name}를 조용히 챙깁니다.`);
    }
    const s = g.side[wk];
    if (o === 'drag') {
      const d = this.DRAGONS[Math.floor(g.r() * this.DRAGONS.length)]; s.drag.push(d);
      g.ev.push({ t: g.t, side: wk, ic: d[1], txt: `${d[0]} 드래곤` });
      if (s.drag.length === 4) this.say(g, 'cast', `${s.t.short}, 드래곤 영혼 획득! 한타 주도권이 넘어갑니다!`);
      g.next.drag = g.t + (s.drag.length >= 4 || g.side[this.other(wk)].drag.length >= 4 ? 360 : 300);
    } else if (o === 'grubs') { s.grubs++; g.ev.push({ t: g.t, side: wk, ic: '🐛', txt: '공허 유충' }); g.next.grubs = 0; }
    else if (o === 'herald') { s.herald++; g.ev.push({ t: g.t, side: wk, ic: '🦀', txt: '전령' }); g.next.herald = 0; this.towerDown(g, wk, ['top', 'mid', 'bot'][Math.floor(g.r() * 3)]); }
    else { s.baron++; s.baronUntil = g.t + 180; g.ev.push({ t: g.t, side: wk, ic: '👾', txt: '바론' }); g.next.baron = g.t + 360; this.say(g, 'anal', `바론 버프를 두른 ${s.t.short}, 이제 공성을 시작합니다.`); }
  },
  random(g, m) {
    const r = g.r();
    if (m < 14) {
      if (r < .035) {   // 갱킹
        const k = this.gankSide(g), jg = this.alive(g, k).find(p => p.role === 'JGL');
        if (!jg) return;
        const lane = ['top', 'mid', 'bot'][Math.floor(g.r() * 3)], at = Rift.lane(lane, .5);
        const f = this.fight(g, 'gank', at, lane === 'bot' ? 3 : 2, lane === 'bot' ? 2 : 1);
        if (f && f.n) this.say(g, f.wk === k ? 'cast' : 'anal', f.wk === k ? `${jg.name}의 갱킹! ${this.laneKo(lane)}에서 킬이 나옵니다!` : `갱킹을 받아쳤어요! ${g.side[f.wk].t.short}의 대응이 좋습니다.`);
      } else if (r < .05) {   // 솔로킬: 선수 차이 + 실제 매치업 승률 + 라인전 압박 전술
        const role = ['TOP', 'MID', 'BOT'][Math.floor(g.r() * 3)];
        const a = this.alive(g, 'B').find(p => p.role === role), b = this.alive(g, 'R').find(p => p.role === role);
        if (!a || !b || a.recall || b.recall) return;
        const press = (a.tac === 'press' ? 3 : 0) - (b.tac === 'press' ? 3 : 0), muE = (a.mu.wr - .5) * 25;
        const bWin = g.r() < 1 / (1 + Math.exp(-((this.ppow(a, m) - this.ppow(b, m)) + press + muE) / 9));
        const [w, l] = bWin ? [a, b] : [b, a];
        if (g.r() < .6) {
          const at = Rift.lane(this.LANE_OF[role], .5); this.walk(w, at, this.SPEED * 1.5); this.walk(l, at, this.SPEED * 1.5);
          this.kill(g, w, l);
          this.say(g, 'cast', this.pick(g, [`${w.name}, 솔로킬! ${this.cn(w)} 라인전에서 압도합니다!`, `${l.name}가 잘렸어요! ${w.name}의 피지컬!`, `${w.name}, 1대1에서 이겨냅니다!`]));
        }
      }
      if (m >= 11 && g.r() < .05) this.siege(g);
    } else {
      const fightP = m < 25 ? .025 : m < 35 ? .035 : .05;
      if (r < fightP) {
        const lane = ['top', 'mid', 'bot', 'mid'][Math.floor(g.r() * 4)], at = Rift.lane(lane, .42 + g.r() * .16);
        const big = g.r() < (m < 25 ? .45 : .7);
        const f = this.fight(g, 'fight', at, big ? 5 : 2 + Math.floor(g.r() * 2), big ? 5 : 2 + Math.floor(g.r() * 2));
        if (f && (f.n || f.t)) {
          const ws = g.side[f.wk].t.short;
          this.say(g, 'cast', f.ace ? `에이스! ${ws}가 전멸시킵니다!` : big ? this.pick(g, [`한타 열립니다! ${ws}가 ${f.n}킬을 가져가요!`, `대규모 교전! ${ws} 쪽으로 기웁니다, ${f.n} 대 ${f.t}!`]) : `${this.laneKo(lane)} 쪽 교전, ${ws}가 이득을 봅니다.`);
          if (f.ace || (big && f.n - f.t >= 2)) this.push(g, f.wk, f.ace || (m >= 30 && f.n - f.t >= 3));
        }
      } else if (r < fightP + (m < 20 ? .05 : .09)) this.siege(g);
    }
  },
  gankSide(g) {
    const sc = k => { const s = g.side[k], jg = g.pl.find(p => p.side === k && p.role === 'JGL'); return (jg ? jg.st.early + jg.st.pick * .5 : .5) + (jg && jg.tac === 'gank' ? .4 : 0) + (s.tac === 'early' ? .3 : 0); };
    return g.r() < sc('B') / (sc('B') + sc('R')) ? 'B' : 'R';
  },
  siege(g) {
    const k = this.win(g, 'B') ? 'B' : 'R', o = this.other(k), lane = ['top', 'mid', 'bot'][Math.floor(g.r() * 3)];
    if (g.side[o].towers[lane] <= 0 && g.side[o].inhib[lane] <= 0) return;
    const split = this.alive(g, k).find(p => p.role === 'TOP' && p.tac === 'split');
    this.towerDown(g, k, split && g.r() < .5 ? 'top' : lane);
  },
  towerDown(g, k, lane) {
    const o = g.side[this.other(k)], m = this.min(g);
    if (o.towers[lane] > 0) {
      if (o.towers[lane] === 1 && m < 18) return;
      o.towers[lane]--; g.pl.filter(p => p.side === k && !p.dead).forEach(p => { p.gold += 150; });
      const nm = ['억제기 포탑', '내부 포탑', '외곽 포탑'][o.towers[lane]];
      const node = Rift.TOWER[this.other(k)][lane][2 - o.towers[lane]];
      g.fx.push({ type: 'tower', at: Rift.pos(node), t: g.t, side: k });
      this.alive(g, k).filter(p => !p.recall && !(p.trail && p.trail.length)).slice(0, 3).forEach(p => this.walk(p, Rift.pos(node), this.SPEED));
      g.ev.push({ t: g.t, side: k, ic: '🏰', txt: `${this.laneKo(lane)} ${nm}` });
      if (g.r() < .5) this.say(g, 'anal', `${g.side[k].t.short}, ${this.laneKo(lane)} ${nm}을 철거합니다.`);
    } else if (o.inhib[lane] > 0 && m >= 20) {
      o.inhib[lane] = 0; g.ev.push({ t: g.t, side: k, ic: '💠', txt: `${this.laneKo(lane)} 억제기` });
      g.fx.push({ type: 'tower', at: Rift.INHIB[this.other(k)][lane], t: g.t, side: k });
      this.say(g, 'cast', `억제기까지 깨집니다! ${g.side[k].t.short}가 슈퍼 미니언을 앞세웁니다.`);
    }
  },
  push(g, k, ace) {
    const o = g.side[this.other(k)], m = this.min(g);
    const lane = ['top', 'mid', 'bot'].sort((a, b) => o.towers[a] - o.towers[b])[0];
    this.towerDown(g, k, lane);
    const inhibDown = Object.values(o.inhib).some(v => !v);
    if (ace && m >= 22 && inhibDown) {
      if (o.nexusT > 0) { o.nexusT = 0; g.ev.push({ t: g.t, side: k, ic: '🗼', txt: '쌍둥이 포탑' }); }
      if (g.r() < .7) this.endGame(g, k);
    } else if (ace) this.towerDown(g, k, lane);
    else if (m >= 25 && inhibDown && g.r() < .35) { if (o.nexusT > 0) { o.nexusT = 0; g.ev.push({ t: g.t, side: k, ic: '🗼', txt: '쌍둥이 포탑' }); } else this.endGame(g, k); }
  },
  endGame(g, k) {
    if (g.over) return;
    g.over = { win: k, t: g.t };
    const s = g.side[k], nx = Rift.pos(k === 'B' ? 'rN' : 'bN');
    this.alive(g, k).forEach(p => { p.recall = 0; this.walk(p, nx, 99); });
    g.fx.push({ type: 'nexus', at: nx, t: g.t, side: k });
    this.say(g, 'cast', `넥서스 파괴! ${s.t.name}가 ${this.clock(g.t)}에 승리합니다!`);
    const mvp = g.pl.filter(p => p.side === k).sort((a, b) => (b.k * 3 + b.a * 1.5 - b.d) - (a.k * 3 + a.a * 1.5 - a.d))[0];
    g.over.mvp = mvp;
    this.say(g, 'anal', `오늘의 POG는 ${mvp.name}, ${this.cn(mvp)}로 ${mvp.k}/${mvp.d}/${mvp.a}를 기록했습니다.`);
  },
  filler(g, m) {
    if (g.t % 90 || g.over) return;
    const dg = this.gold(g, 'B') - this.gold(g, 'R'), lead = dg > 0 ? 'B' : 'R', s = g.side[lead];
    if (Math.abs(dg) > 3000) this.say(g, 'anal', `${s.t.short}가 골드 ${(Math.abs(dg) / 1000).toFixed(1)}K 앞서 있습니다. ${m > 25 ? '이제 굳히기에 들어갈 시간이에요.' : '스노우볼을 굴릴 수 있는 차이죠.'}`);
    else if (m < 10) {
      const lp = g.pl.filter(p => p.side === 'B' && p.role !== 'JGL' && p.role !== 'SUP').sort((a, b) => Math.abs(b.mu.gd) - Math.abs(a.mu.gd))[0];
      const o = lp && g.pl.find(q => q.side === 'R' && q.role === lp.role);
      this.say(g, 'anal', lp && Math.abs(lp.mu.gd) > 40 ? `${G.ROLE_KO[lp.role]}는 ${lp.mu.gd > 0 ? lp.name : o.name} 쪽이 CS를 더 챙기고 있어요. 매치업 상성이 그대로 나오네요.` : this.pick(g, ['라인전 단계, 양 팀 모두 CS를 챙기며 탐색전입니다.', '정글러들의 동선 싸움이 중요한 시간대예요.']));
    } else this.say(g, 'cast', this.pick(g, ['아직 승부는 알 수 없습니다!', '시야 싸움이 치열합니다.', '다음 오브젝트를 두고 양 팀이 움직입니다.']));
  },

  // ---------- 이동 ----------
  // 길(노드 그래프)을 따라 최대 maxD만큼 걷는다. 지나간 점은 trail에 남겨 중계 화면이 그 길로 그린다
  walk(p, to, maxD = this.SPEED) {
    if (this.fast) { p.pos = to; p.trail = [to]; return; }   // 화면 없이 결과만 낼 때는 경로 계산 생략
    const start = p.pos;
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
  move(g, m) {
    g.pl.forEach((p, i) => {
      if (p.dead || p.recall || (p.trail && p.trail.length)) return;   // 이미 이번 틱에 움직였거나 귀환 중
      let tgt;
      const own = n => (p.side === 'B' ? 'b' : 'r') + n;
      if (g.focus) { const at = Rift.pos(this.PIT[g.focus]); tgt = [at[0] + (p.side === 'B' ? -5 : 5) + (i % 5 - 2) * 1.5, at[1] + (p.side === 'B' ? 5 : -5) + (i % 3 - 1) * 1.5]; }
      else if (p.role === 'JGL') tgt = m < 14 ? Rift.pos(own(Rift.CAMPS[Math.floor(g.t / 40 + i) % Rift.CAMPS.length])) : Rift.lane('mid', p.side === 'B' ? .4 : .6);
      else if (m >= 25 && p.role !== 'TOP') tgt = Rift.lane('mid', p.side === 'B' ? .42 : .58);
      else tgt = this.laneSpot(g, p, m);
      this.walk(p, [tgt[0] + (g.r() - .5) * 1.5, tgt[1] + (g.r() - .5) * 1.5]);
    });
  },
};

// ---------- 중계 화면 ----------
const Live = {
  g: null, speed: 1, timer: null, raf: null, tickAt: 0,
  SPEEDS: [1, 2, 4, 8],
  start(S) { this.g = Sim.create(S, S.game); this.speed = 1; Router.go('match-live'); },
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
            <div class="lv-map"><img class="lv-bg" src="assets/map/rift.webp" alt=""><svg class="lv-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${this.structures()}</svg><div class="lv-fx"></div><div class="lv-icons"></div><div class="lv-feed"></div><div class="lv-over"></div></div>
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
    $('.lv-skip', el).onclick = () => { clearInterval(this.timer); this.timer = null; while (!g.over) Sim.step(g); this.tickAt = 0; this.draw(); this.finish(); };
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
      const its = row.querySelector('.lv-items'), key = p.items.map(x => x.id).join(',');
      if (its.dataset.k !== key) { its.dataset.k = key; its.innerHTML = p.items.map(it => Stats.icon(it)).join(''); }
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
    // 처치 알림
    const f = g.feed[g.feed.length - 1];
    $('.lv-feed', el).innerHTML = f && g.t - f.t <= 20 ? `<div class="lv-kill ${f.killer.side === 'B' ? 'b' : 'r'}">${SoloQ.ic(f.killer.c)}<span><b>${UI.esc(g.side[f.killer.side].t.short)} ${UI.esc(f.killer.name)}</b> ${f.first ? '퍼스트 블러드!' : '처치'} <b>${UI.esc(g.side[f.victim.side].t.short)} ${UI.esc(f.victim.name)}</b></span>${SoloQ.ic(f.victim.c)}</div>` : '';
    // 하단 선수 캠
    ['B', 'R'].forEach(k => {
      const recent = g.feed.slice().reverse().find(x => x.killer.side === k && g.t - x.t <= 40);
      const ps = g.pl.filter(p => p.side === k), p = recent ? recent.killer : ps[Math.floor(g.t / 60 + (k === 'B' ? 0 : 2)) % 5];
      const cam = $('.lv-cam.' + k.toLowerCase(), el);
      if (cam.dataset.pid !== p.p.id) { cam.dataset.pid = p.p.id; cam.innerHTML = `${p.p.photo ? `<img src="${p.p.photo}" alt="">` : `<div class="lv-cam-empty">${UI.esc(p.name[0] || '?')}</div>`}<b>${UI.esc(p.name)}</b>`; }
    });
    // 스탯표 (아이템 포함)
    $('.lv-stats', el).innerHTML = G.ROLES.map(r => { const a = g.pl.find(p => p.side === 'B' && p.role === r), b = g.pl.find(p => p.side === 'R' && p.role === r); return `
      <div class="lv-st"><span class="its">${a.items.map(it => Stats.icon(it)).join('')}</span>${SoloQ.ic(a.c)}<span class="kda">${a.k}/${a.d}/${a.a}</span><span class="cs">${Math.round(a.cs)}</span><em class="${a.gold >= b.gold ? 'b' : 'r'}">${a.gold >= b.gold ? '◀' : '▶'} ${(Math.abs(a.gold - b.gold) / 1000).toFixed(1)}K</em><span class="cs">${Math.round(b.cs)}</span><span class="kda">${b.k}/${b.d}/${b.a}</span>${SoloQ.ic(b.c)}<span class="its r">${b.items.map(it => Stats.icon(it)).join('')}</span></div>`; }).join('');
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

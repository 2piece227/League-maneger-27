// 시야: 와드 설치 · 제거 · 시야 장악률. 경기 엔진(Sim)에 붙는다.
//  - 장신구(투명 와드): 라이너 · 정글이 와드 자리 근처를 지날 때 (재사용 약 90~120초, 지속 90초)
//  - 서포터: 서폿 아이템 충전으로 자주 박고(지속 150초), 4분 이후 렌즈로 근처 상대 투명 와드를 지운다
//  - 제어 와드: 산 만큼 박는다(사람당 하나, 상대에게 들키면 부서진다). 근처의 상대 투명 와드를 지운다
//  - 와드 자리는 팀 지시(시야: 깊게 · 보통 · 우리 정글)와 다음 오브젝트에 따라 고른다
//  - 갱 회피(Sim.wardOn)는 실제로 그 라인 강가 근처에 와드가 있을 때만
const Vision = {
  // 와드 자리 (맵 %): 강가 · 둥지 입구 · 정글 입구. own: 블루 기준 자기 정글 쪽, foe: 상대 정글 쪽 (레드는 뒤집는다)
  RIVER: [[19, 22], [81, 78], [43, 40], [57, 58], [36, 37], [63, 63], [46, 52], [54, 47], [13, 17], [87, 83], [29, 30], [71, 70], [24, 27], [76, 73], [40, 33], [60, 67], [50, 50], [33, 44], [67, 56]],
  OWN: [[24, 58], [38, 70], [28, 44], [47, 80], [17, 40], [33, 60], [58, 86], [12, 55], [44, 64]],
  LANE_PTS: { top: [[19, 22], [13, 17], [29, 30]], mid: [[43, 40], [57, 58], [46, 52], [54, 47]], bot: [[81, 78], [87, 83], [71, 70]] },
  mir: p => [100 - p[0], 100 - p[1]],
  spots(g, k) {
    const ins = g.side[k].ins.vision, own = this.OWN.map(p => k === 'B' ? p : this.mir(p)), foe = this.OWN.map(p => k === 'B' ? this.mir(p) : p);
    return ins === 'deep' ? [...this.RIVER, ...foe] : ins === 'home' ? [...own, ...this.RIVER.slice(0, 6)] : [...this.RIVER, ...own.slice(0, 2)];
  },
  near(arr, at, r) { return arr.find(w => Sim.dist(w.at, at) < r); },
  // 설치 한도: 투명 와드는 한 사람당 3개(넘으면 가장 오래된 것이 사라진다), 제어 와드는 한 사람당 1개
  LIMIT: { stealth: 3, control: 1 },
  place(g, p, type, at, life) {
    const own = g.wards.filter(w => w.by === p && w.type === type).sort((a, b) => a.t - b.t);
    if (own.length >= this.LIMIT[type]) { const old = own[0]; g.wards = g.wards.filter(w => w !== old); }
    g.wards.push({ side: p.side, type, at: [at[0] + (g.r() - .5) * 2, at[1] + (g.r() - .5) * 2], t: g.t, until: type === 'control' ? 1e9 : g.t + life, by: p });
    p.wardsPlaced = (p.wardsPlaced || 0) + 1;
  },
  // 사람이 떠나도 남는 시야(와드 · 포탑 · 우물)가 이미 비추는 자리인가. 예전에는 '내 와드가 7 안에 있나'만 봐서 포탑 · 팀원 와드가 이미 비추는 곳에 박곤 했다 (베타 피드백)
  lit(g, k, at, exact) {
    if ((g.wards || []).some(w => w.side === k && Sim.dist(w.at, at) < (w.type === 'control' ? 8 : 9) - (exact ? 0 : 2))) return true;
    if (['top', 'mid', 'bot'].some(l => Rift.TOWER[k][l].some((n, i) => g.side[k].thp[l][i] > 0 && Sim.dist(Rift.pos(n), at) < 10))) return true;
    return Sim.dist(Sim.fountain(k), at) < 16;
  },
  // 그 자리에 와드를 박으면 새로 밝아지는 비율 (와드 시야 원 안 13점 중 아직 어두운 점)
  gain(g, k, at) {
    let n = 0, d = 0;
    for (let i = -1; i < 12; i++) { const q = i < 0 ? at : [at[0] + Math.cos(i * Math.PI / 6) * 6, at[1] + Math.sin(i * Math.PI / 6) * 6]; n++; if (!this.lit(g, k, q, true)) d++; }
    return d / n;
  },
  lens(p) { return p.trinket && p.trinket.n === 'Oracle Lens'; },
  glaive(p) { return p.inv.some(i => i.n === 'Umbral Glaive'); },
  kill(g, w, by) { g.wards = g.wards.filter(x => x !== w); const k = this.other(w.side); g.side[k].wardsKilled = (g.side[k].wardsKilled || 0) + 1; if (by) by.wardsKilled = (by.wardsKilled || 0) + 1; },
  // 10초마다 (Sim.decide)
  tick(g, m) {
    if (!g.wards) g.wards = [];
    g.wards = g.wards.filter(w => w.until > g.t);
    const objK = ['drag', 'baron', 'herald', 'grubs'].find(o => { const ob = g.obj[o]; return ob.at && ob.at - g.t < 90 && ob.at - g.t > -60 && (!ob.until || g.t < ob.until); }), obj = objK && g.obj[objK];
    // 정글은 중반부터 렌즈로 바꾸기도 한다 (우물에서)
    g.pl.forEach(p => { if (p.role === 'JGL' && m >= 8 && !this.lens(p) && Sim.dist(p.pos, Sim.fountain(p.side)) < 14 && g.r() < .5) p.trinket = Stats.it('Oracle Lens') || p.trinket; });
    g.pl.forEach(p => {
      if (p.dead || p.recall || p.tpCh || g.t < 90) return;
      const mine = g.wards.filter(w => w.side === p.side), sp = this.spots(g, p.side);
      // 다음 오브젝트 앞이면 둥지 입구가 먼저
      const pref = objK ? [Sim.toward(Rift.pos(Sim.PIT[objK]), p.side, 7), ...sp] : sp;
      // 서폿 아이템 퀘스트 완료(7분쯤): 우물에 안 가도 자동으로 바뀐다
      if (p.role === 'SUP' && m >= 7 && p.build.sup && p.build.start && p.inv.some(i => i.n === p.build.start.n)) { const i = p.inv.findIndex(x => x.n === p.build.start.n); p.inv[i] = p.build.sup; }
      // 서폿은 와드 자리를 찾아 넓게(14), 다른 포지션은 지나가는 길에(10)
      // 새로 밝아지는 면적이 가장 큰 자리 (우리 와드 · 포탑 · 우물이 이미 비추는 곳과 절반 넘게 겹치면 박지 않는다). 우선 자리(오브젝트 입구 등)는 조금 더 쳐준다
      const cand = pref.filter(s => Sim.dist(s, p.pos) < (p.role === 'SUP' ? 18 : 10)).map((s, i) => ({ s, v: this.gain(g, p.side, s) + (objK && i === 0 ? .2 : 0) - i * .005 })).filter(x => x.v >= .5).sort((a, b) => b.v - a.v);
      const free = cand.length ? cand[0].s : null;
      if (!free) return;
      if (p.role === 'SUP' && m >= 2 && g.t >= (p.supCd || 0)) { this.place(g, p, 'stealth', free, 150); p.supCd = g.t + 18 + g.r() * 10; return; }
      if (p.wards > 0 && (obj || !g.wards.some(w => w.by === p && w.type === 'control')) && (obj || g.r() < .55)) { this.place(g, p, 'control', free); p.wards--; return; }
      if (!this.lens(p) && g.t >= (p.trkCd || 0)) { this.place(g, p, 'stealth', free, 90); p.trkCd = g.t + (m < 10 ? 120 : 90) + g.r() * 20; }
    });
    // 제거
    //  - 제어 와드: 보이는 와드라 상대가 근처(4)에 오면 부순다
    //  - 투명 와드: 렌즈(재사용 약 75초, 반경 7)로 드러내 부수거나, 그림자 검을 든 선수 근처(6)에서, 또는 상대 제어 와드가 드러낸 것(8 안)을 그쪽 선수가 근처(7)에 와서 부순다
    g.pl.forEach(q => {
      if (q.dead || q.recall || !this.lens(q) || g.t < (q.lensCd || 0) || m < 4) return;
      const hit = g.wards.filter(w => w.side !== q.side && w.type === 'stealth' && Sim.dist(w.at, q.pos) < 7);
      if (!hit.length) return;
      q.lensCd = g.t + 75; hit.forEach(w => { if (g.r() < .85) this.kill(g, w, q); });
    });
    g.wards.slice().forEach(w => {
      const foes = g.pl.filter(q => q.side !== w.side && !q.dead && !q.recall);
      if (w.type === 'control') { const q = foes.find(q => Sim.dist(q.pos, w.at) < 4); if (q && g.r() < .6) this.kill(g, w, q); return; }
      const gl = foes.find(q => this.glaive(q) && Sim.dist(q.pos, w.at) < 6);
      if (gl && g.r() < .7) return this.kill(g, w, gl);
      const ctl = g.wards.some(c => c.side !== w.side && c.type === 'control' && Sim.dist(c.at, w.at) < 8), q = ctl && foes.find(q => Sim.dist(q.pos, w.at) < 7);
      if (q && g.r() < .6) this.kill(g, w, q);
    });
    // 시야 장악률 (맵을 25×24 칸으로 나눠 그 팀이 보는 칸의 비율)
    if (g.t % 30 === 0) g.vis = { B: this.cover(g, 'B'), R: this.cover(g, 'R') };
  },
  other: k => k === 'B' ? 'R' : 'B',
  // 그 팀의 시야 원 [x, y, r]
  sources(g, k) {
    const out = [];
    g.pl.forEach(p => { if (p.side === k && !p.dead) out.push([p.pos[0], p.pos[1], 10]); });
    (g.wards || []).forEach(w => { if (w.side === k) out.push([w.at[0], w.at[1], w.type === 'control' ? 8 : 9]); });
    ['top', 'mid', 'bot'].forEach(l => Rift.TOWER[k][l].forEach((n, i) => { if (g.side[k].thp[l][i] > 0) { const q = Rift.pos(n); out.push([q[0], q[1], 11]); } }));
    // 미니언 웨이브도 시야를 준다 (미니언 시야 약 1,100 → 맵 7%)
    if (g.wv) ['top', 'mid', 'bot'].forEach(l => g.wv[l][k].forEach(w => { if (w.n > .05) out.push([w.p[0], w.p[1], 7]); }));
    const f = Sim.fountain(k); out.push([f[0], f[1], 14]);
    return out;
  },
  cover(g, k) {
    const src = this.sources(g, k); let n = 0, c = 0;
    for (let y = 2; y < 100; y += 4) for (let x = 2; x < 100; x += 4) { n++; if (src.some(([sx, sy, r]) => (sx - x) ** 2 + (sy - y) ** 2 < r * r)) c++; }
    return Math.round(c / n * 100);
  },
  // 부쉬 (맵 그림 기준 [x, y, 반지름] %, 아래쪽 절반만 적고 위쪽은 점대칭으로)
  BUSH0: [[56.5, 57, 1.3], [59.5, 54.5, 1.3], [66.9, 57.9, 1.4], [69.8, 70.6, 1.4], [57, 66.1, 1.3], [83.6, 84.3, 1.8], [87, 80.3, 1.3], [79.5, 88, 1.4],
    [60.5, 82, 1.3], [45.3, 65.5, 1.3], [74.8, 71.4, 1.4], [67.5, 77.2, 1.2], [77.5, 65.9, 1.2]],
  get BUSH() { return this._b ||= this.BUSH0.concat(this.BUSH0.map(([x, y, r]) => [100 - x, 100 - y, r])); },
  // 그 자리가 들어 있는 부쉬 (없으면 -1). 몸이 걸치면 안으로 친다
  bushAt(pos) { const B = this.BUSH; for (let i = 0; i < B.length; i++) { const [x, y, r] = B[i]; if ((x - pos[0]) ** 2 + (y - pos[1]) ** 2 < (r + .6) ** 2) return i; } return -1; },
  // k팀이 그 자리를 보나: 시야 원 안 + 부쉬 안이면 같은 부쉬에 들어가 있거나(바로 옆 2.5 포함) 그 부쉬에 와드가 있어야 보인다
  seen(g, k, pos) {
    if (!this.sources(g, k).some(([x, y, r]) => (x - pos[0]) ** 2 + (y - pos[1]) ** 2 < r * r)) return false;
    const b = this.bushAt(pos); if (b < 0) return true;
    return g.pl.some(p => p.side === k && !p.dead && (this.bushAt(p.pos) === b || Sim.dist(p.pos, pos) < 2.5)) || (g.wards || []).some(w => w.side === k && this.bushAt(w.at) === b);
  },
};
// 엔진에 붙이기: 와드 목록 · 10초마다 시야 처리 · 갱 회피는 실제 와드로
(() => {
  const create = Sim.create.bind(Sim);
  Sim.create = (S, n) => { const g = create(S, n); g.wards = []; g.vis = { B: 0, R: 0 }; return g; };
  const decide = Sim.decide.bind(Sim);
  Sim.decide = (g, m) => { decide(g, m); if (!g.over) Vision.tick(g, m); };
  Sim.wardOn = (g, k, lane) => {
    const pts = Vision.LANE_PTS[lane] || [];
    if ((g.wards || []).some(w => w.side === k && pts.some(q => Sim.dist(q, w.at) < 12))) return true;
    return lane !== 'top' && g.pl.some(p => p.side === k && !p.dead && (p.fx || {}).vision);   // 천리안: 바텀·미드는 늘
  };
})();

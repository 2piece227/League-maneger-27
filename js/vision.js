// 시야: 와드 설치 · 제거 · 시야 장악률. 경기 엔진(Sim)에 붙는다.
//  - 장신구(투명 와드): 라이너 · 정글이 와드 자리 근처를 지날 때 (재사용 약 90~120초, 지속 90초)
//  - 서포터: 서폿 아이템 충전으로 자주 박고(지속 150초), 4분 이후 렌즈로 근처 상대 투명 와드를 지운다
//  - 제어 와드: 산 만큼 박는다(사람당 하나, 상대에게 들키면 부서진다). 근처의 상대 투명 와드를 지운다
//  - 와드 자리는 팀 지시(시야: 깊게 · 보통 · 우리 정글)와 다음 오브젝트에 따라 고른다
//  - 갱 회피(Sim.wardOn)는 실제로 그 라인 강가 근처에 와드가 있을 때만
const Vision = {
  // 와드 자리 (맵 %): 강가 · 둥지 입구 · 정글 입구. own: 블루 기준 자기 정글 쪽, foe: 상대 정글 쪽 (레드는 뒤집는다)
  RIVER: [[19, 22], [81, 78], [43, 40], [57, 58], [36, 37], [63, 63], [46, 52], [54, 47], [13, 17], [87, 83], [29, 30], [71, 70]],
  OWN: [[24, 58], [38, 70], [28, 44], [47, 80], [17, 40]],
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
      const free = pref.find(s => Sim.dist(s, p.pos) < 9 && !this.near(mine, s, 7));
      if (!free) return;
      if (p.role === 'SUP' && m >= 3 && g.t >= (p.supCd || 0)) { this.place(g, p, 'stealth', free, 150); p.supCd = g.t + 35 + g.r() * 15; return; }
      if (p.wards > 0 && (obj || !g.wards.some(w => w.by === p && w.type === 'control')) && (obj || g.r() < .35)) { this.place(g, p, 'control', free); p.wards--; return; }
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
    const f = Sim.fountain(k); out.push([f[0], f[1], 14]);
    return out;
  },
  cover(g, k) {
    const src = this.sources(g, k); let n = 0, c = 0;
    for (let y = 2; y < 100; y += 4) for (let x = 2; x < 100; x += 4) { n++; if (src.some(([sx, sy, r]) => (sx - x) ** 2 + (sy - y) ** 2 < r * r)) c++; }
    return Math.round(c / n * 100);
  },
  seen(g, k, pos) { return this.sources(g, k).some(([x, y, r]) => (x - pos[0]) ** 2 + (y - pos[1]) ** 2 < r * r); },
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

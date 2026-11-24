/* LM 27 — 미니언 웨이브 · 포탑 (js/matchsim.js 의 Sim 에 붙는다)
   웨이브: 60초부터 30초마다 라인별로 6마리(세 번째마다 대포, 억제기가 깨진 라인은 슈퍼 미니언). 라인을 따라 걸어가 상대 웨이브와 만나면 서로 깎고,
           근처 챔피언이 정리 속도를 더한다 (라인 주도권 = 매치업 · 실력 · 전술 · 체력). 죽은 미니언은 근처 챔피언의 CS · 골드가 된다 (없으면 그냥 사라진다).
           상대 웨이브가 없으면 포탑까지 가서 포탑을 친다.
   포탑:   사거리(TW_R) 안의 미니언을 먼저 쏜다. 미니언이 없거나, 사거리 안에서 아군 챔피언을 때린 적이 있으면 그 챔피언을 쏜다 (맞을수록 아프다).
           그래서 챔피언은 자기 웨이브가 포탑에 붙어 있을 때만 들어가고, 아니면 사거리 밖에서 기다린다. 다이브는 유리할 때만 한다.
           외곽 포탑은 14분까지 방패 5장(장당 PLATE_G 골드를 근처 선수끼리), 파괴 골드는 근처 선수 몫 + 팀 전체 몫. */
Object.assign(Sim, {
  LANES3: ['top', 'mid', 'bot'],
  TW_R: 7,          // 포탑 사거리 (맵 %)
  TW_DMG: .11,      // 포탑 한 발 (체력 비율, 초반). 같은 챔피언을 계속 쏘면 발마다 +40% (최대 +120%)
  TW_MIN: .45,      // 포탑이 1초에 잡는 미니언 수
  TW_K: 1.6,          // 챔피언이 포탑에 주는 피해 배율 (검증표의 포탑 수 · 경기 시간에 맞춘 값)
  MIN_V: 2.2,       // 미니언 이동 속도 (맵 % / 초)
  MIN_D: .035,      // 미니언 한 마리가 1초에 상대 웨이브를 깎는 양
  MIN_T: .003,      // 미니언 한 마리가 1초에 포탑을 깎는 양
  MIN_G: 19.5,      // 미니언 한 마리 골드 (근접 21 · 원거리 14 · 대포 60 평균)
  TW_OUT: 2.5, G1: .18, G2: .45, PLATE_G: 120, LH: .78, PUSH: 1, DIVE_P: .7,

  wavesInit(g) {
    g.wv = { top: { B: [], R: [] }, mid: { B: [], R: [] }, bot: { B: [], R: [] } };
    g.tw = {}; g.twShots = 0; g.twKills = 0; g.twExec = 0; g.plateN = 0;
    ['B', 'R'].forEach(k => { g.side[k].plate = { top: 5, mid: 5, bot: 5 }; });
  },
  busySet(g) { if (g.busyT === g.t) return g.busy; const b = new Set(); g.fights.forEach(f => f.mem.forEach(p => b.add(p))); g.busy = b; g.busyT = g.t; return b; },
  buffed(g, k) { return g.side[k].baronUntil > g.t; },
  frontW(g, lane, k) { const W = g.wv[lane][k]; let b = null; for (const w of W) if (w.n > .05 && (!b || (k === 'B' ? w.s > b.s : w.s < b.s))) b = w; return b; },
  // 그 자리 근처에 있는 side 팀 미니언 무리
  minNear(g, side, pos, r) { const out = []; for (const l of this.LANES3) for (const w of g.wv[l][side]) if (w.n > .05 && this.dist(w.p, pos) <= r) out.push(w); return out; },

  // ---------- 포탑 ----------
  twList(g, k) {
    const c = (g.twc ||= {}); if (c.t !== g.t) { g.twc = { t: g.t }; } else if (c[k]) return c[k];
    const s = g.side[k], out = [], nx = Rift.pos(k === 'B' ? 'bN' : 'rN');
    this.LANES3.forEach(l => { for (let i = 0; i < 3; i++) if (s.thp[l][i] > 0) out.push({ key: k + l + i, side: k, pos: Rift.pos(Rift.TOWER[k][l][i]), lane: l, i, hp: s.thp[l][i] }); });
    s.ntp.forEach((h, ti) => { if (h > 0) out.push({ key: k + 'n' + ti, side: k, pos: [nx[0] + (k === 'B' ? 3 : -3) * (ti ? -1 : 1), nx[1] + (k === 'B' ? -3 : 3)], nt: ti, hp: h }); });
    return (g.twc[k] = out);
  },
  // 포탑이 미니언을 쏘고 있나 (상대 미니언이 사거리 안에 충분히 있나). 웨이브가 거의 다 죽으면 챔피언은 미리 빠진다
  tanked(g, tw) { const st = (g.tw[tw.key] ||= { heat: 0 }); if (st.tkT === g.t) return st.tk; st.tkT = g.t; return (st.tk = this.minNear(g, this.other(tw.side), tw.pos, this.TW_R + .5).reduce((a, w) => a + w.n, 0) >= 2); },
  // k팀 챔피언이 pos에 서면 포탑에 맞나: 맞는 포탑을 돌려준다
  danger(g, k, pos, pad = .6, any = false) { for (const tw of this.twList(g, this.other(k))) if (this.dist(pos, tw.pos) < this.TW_R + pad && (any || !this.tanked(g, tw))) return tw; return null; },
  // 목적지가 위험한 포탑 사거리 안이면 사거리 밖(오던 쪽)에서 멈춘다. 다이브 중(p.dive)이면 그대로 들어간다
  safeTo(g, p, to) {
    if (p.dive > g.t) return to;
    const tw = this.danger(g, p.side, to, .6, p.shotT > g.t - 4); if (!tw) return to;   // 방금 포탑에 맞았으면 웨이브가 있어도 빠진다
    const from = this.dist(to, tw.pos) > 1.5 ? to : this.dist(p.pos, tw.pos) > 1 ? p.pos : this.fountain(p.side), d = this.dist(from, tw.pos) || 1;   // 목적지 방향 그대로 사거리 밖으로 민다
    return this.clampP([tw.pos[0] + (from[0] - tw.pos[0]) / d * (this.TW_R + 1.8), tw.pos[1] + (from[1] - tw.pos[1]) / d * (this.TW_R + 1.8)]);
  },
  towers(g, m) {
    const base = this.TW_DMG * (m < 8 ? 1 : Math.max(.55, 1 - (m - 8) * .027));   // 레벨 · 아이템이 오를수록 포탑이 덜 아프다
    ['B', 'R'].forEach(k => {
      const o = this.other(k);
      this.twList(g, k).forEach(tw => {
        const st = (g.tw[tw.key] ||= { heat: 0 });
        const foes = g.pl.filter(p => p.side === o && !p.dead && !p.tpCh && this.dist(p.pos, tw.pos) <= this.TW_R);
        const mins = this.minNear(g, o, tw.pos, this.TW_R + .5);
        if (!foes.length && !mins.length) { st.tg = null; st.heat = 0; return; }
        if (st.tg && !foes.includes(st.tg)) { st.tg = null; st.heat = 0; }
        // 어그로: 사거리 안에서 아군 챔피언을 때린 적 (포탑에 가까운 쪽부터)
        if (!st.tg) { const ag = foes.filter(p => p.hitAt === g.t && p.hitTo && p.hitTo.side === k && this.dist(p.hitTo.pos, tw.pos) <= this.TW_R + 4); if (ag.length) st.tg = ag.sort((x, y) => this.dist(x.pos, tw.pos) - this.dist(y.pos, tw.pos))[0]; }
        if (!st.tg && !mins.length) st.tg = foes.sort((x, y) => this.dist(x.pos, tw.pos) - this.dist(y.pos, tw.pos))[0];
        st.at = g.t;
        if (st.tg) {
          const v = st.tg; st.to = v; g.twShots++;
          v.hp -= base * (1 + .4 * Math.min(3, st.heat)) * this.KIND[v.kind].take; st.heat++;
          if (v.hp <= 0) {
            const lh = v.lastHit && v.lastHit.side === k && g.t - (v.lastHitT || -99) <= 12 ? v.lastHit : this.alive(g, k).filter(q => this.dist(q.pos, v.pos) <= 14).sort((x, y) => this.dist(x.pos, v.pos) - this.dist(y.pos, v.pos))[0];
            if (lh) { this.kill(g, lh, v, [], true); g.twKills++; const f = g.fights.find(x => x.mem.has(v)); if (f) f.kills[k]++; if (g.r() < .6) this.line(g, 'towerKill', { v: v.name }); }
            else this.execute(g, v, k);
            st.tg = null; st.heat = 0;
          } else if (!(v.dive > g.t) || v.hp < .35) { v.dive = 0; v.noDive = g.t + 15; v.shotT = g.t; v.recall = 0; if (!v.hold || this.danger(g, o, v.hold.to)) this.retreat(g, v, 10); }   // 다이브가 아니면 맞는 즉시 빠진다
        } else {
          const w = mins.sort((x, y) => this.dist(x.p, tw.pos) - this.dist(y.p, tw.pos))[0], dn = Math.min(w.n, this.TW_MIN / (this.buffed(g, o) ? 2 : 1) / (w.sup ? 1.5 : 1));
          w.n -= dn; st.heat = 0; st.to = w; this.csGive(g, k, w.p, dn, m, true);
        }
      });
    });
  },
  // 포탑 처형: 근처에 상대가 없는데 포탑에 죽었다 (아무도 골드를 받지 않는다)
  execute(g, v, k) {
    v.dead = g.t + Math.round(8 + this.min(g) * 1.3); v.d++; v.hp = 0; v.recall = 0; v.jq = []; v.tpCh = null; v.hold = null; v.fled = 0; g.twExec++;
    this.mark(g, k, 'exec', 'tower', `포탑이 ${this.josa(v.name, '을', '를')} 처형`);
  },
  // 포탑 방패 · 파괴 골드
  plateCheck(g, k, lane, st) {
    const s = g.side[this.other(k)], m = this.min(g); if (st.i !== 0 || m >= 14) return;
    while (s.plate[lane] > 0 && s.thp[lane][0] <= (s.plate[lane] - 1) * .2 + 1e-9) {
      s.plate[lane]--; g.plateN++;
      const ps = this.alive(g, k).filter(p => this.dist(p.pos, st.pos) <= 14);
      ps.forEach(p => { p.gold += this.PLATE_G / ps.length; });
      if (ps.length && g.r() < .25) this.line(g, 'plate', { p: ps.sort((a, b) => this.dist(a.pos, st.pos) - this.dist(b.pos, st.pos))[0].name, lane: this.laneKo(lane) });
    }
  },
  towerGold(g, k, st) {
    const local = st.kind === 'nexusT' ? 0 : [250, 300, 250][st.i], ps = this.alive(g, k).filter(p => this.dist(p.pos, st.pos) <= 16);
    ps.forEach(p => { p.gold += local / ps.length; });
    g.pl.forEach(p => { if (p.side === k) p.gold += 50; });
    this.bounty(g, k, 'tower');   // 뒤진 팀이 포탑을 깨면 오브젝트 현상금
  },
  // 구조물에 들어가는 피해의 시간대 보정 (실제 경기에서 이 시간 전에는 안쪽 구조물이 거의 안 깨진다)
  gate(st, m) {
    const deep = st.kind === 'inhib' || (st.kind === 'tower' && st.i === 2) || st.kind === 'nexusT' || st.kind === 'nexus';
    if ((deep && m < 14) || ((st.kind === 'nexusT' || st.kind === 'nexus') && m < 21)) return 0;
    return st.kind === 'tower' && st.i === 1 && m < 14 ? .6 : deep && m < 23 ? this.G1 : deep && m < 28 ? this.G2 : st.kind === 'tower' && st.i === 0 && m >= 14 ? this.TW_OUT : 1;   // 방패가 떨어진 외곽 포탑은 무르다
  },
  // 챔피언 한 명이 1초에 구조물에 주는 피해
  ctOf(p, m) { return (m < 14 ? .009 + .0006 * m : .016 + (m - 14) * .0008) * ({ adc: 1.35, mage: .95, arti: .95, bruiser: 1, dive: 1, tank: .75, ench: .5 })[p.kind]; },
  // 공성 (매초): 구조물 옆에 붙은 챔피언이 친다. 미니언 없이 치면 포탑이 단단하다 (백도어 방지)
  siegeTick(g, m) {
    const busy = this.busySet(g), seen = new Set();
    const order = ['B', 'R'].flatMap(k => this.LANES3.map(lane => [k, lane, this.structOf(g, this.other(k), lane)])).sort((x, y) => (/nexus/.test(y[2].kind) ? 1 : 0) - (/nexus/.test(x[2].kind) ? 1 : 0));
    for (const [k, lane, st] of order) {
      if (g.over) return;
      const key = k + st.kind + (st.i ?? '') + (/nexus/.test(st.kind) ? '' : lane); if (seen.has(key)) continue; seen.add(key);
      const atk = this.alive(g, k).filter(p => !p.recall && !p.tpCh && !busy.has(p) && this.dist(p.pos, st.pos) <= 6.5); if (!atk.length) continue;
      const shoot = st.kind === 'tower' || st.kind === 'nexusT', bare = shoot && !this.minNear(g, k, st.pos, this.TW_R + .5).length;
      const dmg = atk.reduce((a, p) => a + this.ctOf(p, m), 0) * (st.kind === 'nexus' ? 1.4 : 1) * (bare ? .4 : 1) * this.gate(st, m) * this.TW_K * (1 + Math.max(0, Math.min(1, (this.lead(g, k) - 6000) / 8000)) * this.CLOSE);
      if (dmg > 0) { atk.forEach(p => { p.hitTw = g.t; p.hitTwAt = st.pos; }); this.hit(g, k, lane, st, dmg); }
    }
  },

  // ---------- 웨이브 ----------
  // 라인 주도권 (-0.5 ~ 0.5): 매치업 승률 · 전투력 · 전술(압박 ↔ 버티기) · 체력. 맞상대가 라인에 없으면 +0.5
  prio(g, p, m) {
    if (p.role === 'JGL') return 0;
    if (p.prC && g.t - p.prC.t < 5) return p.prC.v;
    const key = p.role === 'SUP' ? 'BOT' : p.role, me = p.role === 'SUP' ? (g.pl.find(q => q.side === p.side && q.role === 'BOT') || p) : p, o = g.pl.find(q => q.side !== p.side && q.role === key), lane = this.LANE_OF[key];
    const here = q => !q.dead && !q.recall && this.distLane(q.pos, lane) < 8, tv = q => q.tac === 'press' ? .2 : ['hold', 'safe', 'farm'].includes(q.tac) ? -.2 : 0;
    const v = !o ? 0 : !here(o) || this.dist(o.pos, me.pos) > 25 ? .5 : !here(me) ? -.5 : Math.max(-.5, Math.min(.5, (me.mu.wr - .5) * 2 + (this.ppow(me, m) - this.ppow(o, m)) / 30 + tv(me) - tv(o) + (me.hp - o.hp) * .4));
    p.prC = { t: g.t, v }; return v;
  },
  inLane(p) { return p.role !== 'JGL' && this.distLane(p.pos, this.LANE_OF[p.role]) < 8; },
  // 챔피언이 1초에 정리하는 미니언 수
  pushRate(g, p, m) {
    const kf = ({ mage: 1.2, arti: 1.2, adc: m < 10 ? .85 : 1.1, tank: .85, bruiser: 1, dive: .9, ench: .6 })[p.kind];
    return Math.min(.7, .08 + .017 * m) * kf * (typeof Kits !== 'undefined' ? Kits.clearOf(p.c) : 1) * this.PUSH * (p.role === 'SUP' ? .3 : p.role === 'JGL' ? .6 : 1) * (m < 14 && this.inLane(p) ? 1 + this.prio(g, p, m) : 1);
  },
  // 미니언이 죽으면 근처(10) 챔피언이 막타를 친다. 서폿은 다른 아군이 없을 때만. 자기 포탑 밑에서는 놓치는 게 늘고, 주도권을 내주면 견제 때문에 놓친다
  csGive(g, k, at, dn, m, tower) {
    if (dn <= 0) return;
    this.minionXp(g, k, at, dn, m);   // 경험치는 막타와 상관없이 근처에 있으면 (싸우는 중이어도)
    const busy = this.busySet(g), ps = this.alive(g, k).filter(p => !p.recall && !p.tpCh && !busy.has(p) && this.dist(p.pos, at) <= 10); if (!ps.length) return;
    const main = ps.filter(p => p.role !== 'SUP'), L = main.length ? main : ps, gold = this.MIN_G + m * .25;
    L.forEach(p => {
      const pr = m < 14 && this.inLane(p) ? this.prio(g, p, m) : 0;
      const lh = Math.min(.97, (this.LH + (p.ovr - 75) * .006) * ((p.fx || {}).cs || 1) * (['farm', 'safe', 'hold'].includes(p.tac) ? 1.05 : 1) * (tower ? .8 : 1) * (1 + Math.min(0, pr) * .3)) * (p.role === 'SUP' ? .5 : 1);
      const c = dn / L.length * lh; p.cs += c; p.gold += c * gold;
    });
  },
  waves(g, m) {
    const busy = this.busySet(g), ok = p => !p.recall && !p.tpCh && !busy.has(p);
    if (g.t >= 60 && (g.t - 60) % 30 === 0) {
      const n = (g.t - 60) / 30, cannon = m < 15 ? n % 3 === 2 : m < 25 ? n % 2 === 1 : true;
      this.LANES3.forEach(l => ['B', 'R'].forEach(k => { const sup = g.side[this.other(k)].ihp[l] <= 0, s = k === 'B' ? .02 : .98; g.wv[l][k].push({ s, n: 6 + (sup ? 4 : cannon ? 1.5 : 0), sup, p: Rift.lane(l, s) }); }));
    }
    this.LANES3.forEach(lane => {
      const L = Rift.L[lane].len, W = g.wv[lane], dv = this.MIN_V / L, gap = 1.6 / L, stop = 2.5 / L;
      if (!W.B.length && !W.R.length) return;
      const lim = { B: Rift.proj(lane, this.structOf(g, 'R', lane).pos).s - stop, R: Rift.proj(lane, this.structOf(g, 'B', lane).pos).s + stop };
      W.B.forEach(w => { w.pp = w.p; }); W.R.forEach(w => { w.pp = w.p; });
      // 이동: 상대 맨 앞 무리나 상대 구조물 앞에서 멈춘다 (어느 쪽이 먼저 움직일지는 번갈아)
      const move = k => {
        const e = this.frontW(g, lane, this.other(k));
        if (k === 'B') { const cap = Math.min(lim.B, e ? e.s - gap : 9); W.B.forEach(w => { if (w.s < cap) w.s = Math.min(cap, w.s + dv); }); }
        else { const cap = Math.max(lim.R, e ? e.s + gap : -9); W.R.forEach(w => { if (w.s > cap) w.s = Math.max(cap, w.s - dv); }); }
      };
      (g.t % 2 ? ['B', 'R'] : ['R', 'B']).forEach(move);
      // 뒤따라온 무리는 앞 무리에 합쳐진다
      ['B', 'R'].forEach(k => { const f = this.frontW(g, lane, k); if (!f) return; W[k] = W[k].filter(w => { if (w === f || Math.abs(w.s - f.s) > .9 / L) return true; f.n += w.n; f.sup = f.sup || w.sup; return false; }); });
      W.B.forEach(w => { w.p = Rift.lane(lane, w.s); }); W.R.forEach(w => { w.p = Rift.lane(lane, w.s); });
      const a = this.frontW(g, lane, 'B'), b = this.frontW(g, lane, 'R'), met = a && b && b.s - a.s <= gap * 1.05;
      const pow = (w, k) => w.n * (w.sup ? 1.4 : 1) * (this.buffed(g, k) ? 1.5 : 1), loss = { B: 0, R: 0 };
      if (met) { loss.R += pow(a, 'B') * this.MIN_D / (this.buffed(g, 'R') ? 2 : 1); loss.B += pow(b, 'R') * this.MIN_D / (this.buffed(g, 'B') ? 2 : 1); }
      // 챔피언의 라인 정리 (상대 맨 앞 무리 근처에 있을 때)
      [['B', b], ['R', a]].forEach(([k, w]) => { if (!w) return; let c = 0; this.alive(g, k).forEach(p => { if (ok(p) && this.dist(p.pos, w.p) <= 9) c += this.pushRate(g, p, m); }); loss[this.other(k)] += c / (w.sup ? 1.5 : 1) / (this.buffed(g, this.other(k)) ? 2 : 1); });   // 슈퍼 미니언 · 바론 미니언은 잘 안 죽는다
      [['B', a], ['R', b]].forEach(([k, w]) => { if (!w || !loss[k]) return; const dn = Math.min(w.n, loss[k]); w.n -= dn; this.csGive(g, this.other(k), w.p, dn, m, false); });
      // 막는 웨이브가 없으면 구조물을 친다
      if (!met) [['B', a], ['R', b]].forEach(([k, w]) => {
        if (!w || w.n <= .05 || g.over || Math.abs(w.s - lim[k]) > .3 / L) return;
        const st = this.structOf(g, this.other(k), lane), dmg = pow(w, k) * this.MIN_T * this.gate(st, m);
        if (dmg > 0) this.hit(g, k, lane, st, dmg);
      });
      W.B = W.B.filter(w => w.n > .05); W.R = W.R.filter(w => w.n > .05);
    });
  },
  // k팀 라이너가 설 자리의 기준 (라인 위 s). 우리 웨이브 머리보다 뒤에 서지 않고, 상대 웨이브 머리를 넘어가지 않는다 — 그 사이에서는 서 있던 자리를 지킨다.
  // 그래서 우리 웨이브가 앞서 나가면 따라가고, 상대 웨이브가 밀려오면 그 앞에서 물러난다 (웨이브가 죽을 때마다 앞뒤로 뛰지 않는다). 살아 있는 맨 앞 구조물 사이로 제한
  laneS(g, k, lane) {
    const L = Rift.L[lane].len, own = this.frontW(g, lane, k), e = this.frontW(g, lane, this.other(k)), sg = k === 'B' ? 1 : -1, mem = (g.wf ||= {});
    let f = mem[lane + k] ?? .5;
    // 두 웨이브가 아직 안 만났으면 만날 자리(가운데)로 조금씩 옮겨 간다 — 예전 교전 자리에 멍하니 서 있지 않게 (1초에 한 번)
    if (own && e && mem[lane + k + 't'] !== g.t && (e.s - own.s) * sg > 2 / L) { mem[lane + k + 't'] = g.t; f += ((own.s + e.s) / 2 - f) * .25; }
    if (e && (f - (e.s - sg * 1.6 / L)) * sg > 0) f = e.s - sg * 1.6 / L;
    if (own && (own.s - f) * sg > 0) f = own.s;
    const hi = Rift.proj(lane, this.structOf(g, 'R', lane).pos).s - .02, lo = Rift.proj(lane, this.structOf(g, 'B', lane).pos).s + .02;
    f = Math.max(Math.max(.12, lo), Math.min(Math.min(.88, hi), f)); mem[lane + k] = f; return f;
  },
});

// 챔피언 키트: 사용자가 직접 정한 스킬 운용 (언제 쓰는지 · 색 · 관통 · 고유 자원 · 콤보 · 폼 체인지)
//  수치(피해 · 사거리 · 재사용 · 보호막)는 데이터(js/champstats.js, data/champ-*.json)에서, 운용만 여기서 정한다.
//  키트가 있는 챔피언은 Skills.cast 대신 Kits.cast로 스킬을 고르고, 한타 밖에서도(라인 클리어 · 견제 · 자원 관리) 스킬을 쓴다.
//
//  상황(ctx):  clear 라인 클리어 · poke 견제 · farm 라인이 불리할 때 포탑 밑 미니언 챙기기 · trade 맞딜(라인 교전)
//              tf 한타(4인 이상) · chase 추격 · flee 도주 · pick 암살 · heat 과열 유지(럼블)
//  효과:  p.km 주는 피해 배율 · v.vuln 받는 피해 배율 · v.cc 행동 불가(기절 · 에어본 · 제압) · v.slow 둔화 · 보호막(데이터)
const Kits = {
  // 사거리(게임 단위) → 맵 % (CStats.range와 같은 비율: 몸집 2.77 + 거리/150)
  R: u => 2.77 + u / 150,
  K: {
    // ---------- 럼블: 열기 0~100 (스킬마다 +20), 50 이상 위험 상태(스킬 50% 강화), 100이면 과열(스킬 봉인 · 평타 강화, 1:1 최강) ----------
    Rumble: {
      res: 'heat',
      Q: { shape: 'cone', pierce: true, col: '255,154,60', colHot: '217,86,15', range: 600, clr: .7, use: ['clear', 'poke', 'heat', 'trade', 'tf'] },
      W: { shape: 'self', col: '255,154,60', colHot: '217,86,15', use: ['chase', 'flee', 'heat'] },
      E: { shape: 'line', pierce: false, col: '201,209,219', range: 850, charges: 2, clr: .3, use: ['farm', 'poke', 'heat', 'chase', 'trade'] },
      R: { shape: 'wall', col: '255,138,128', range: 1700, use: ['tf', 'finish'], skill: true },
    },
    // ---------- 암베사: Q 1타를 맞혀야 2타, E는 맞히면 한 번 더. Q · W · E 관통. R 대상에게 기절 + 뒤로 이동 + 능력치 상승 ----------
    Ambessa: {
      Q: { shape: 'cone', pierce: true, col: '255,150,50', range: 475, clr: .5, use: ['trade', 'tf', 'chase', 'flee', 'clear'], next: { key: 'Q', name: '파멸의 일격', shape: 'line', needHit: true } },
      W: { shape: 'self', pierce: true, col: '255,150,50', use: ['trade', 'tf', 'flee', 'chase'] },
      E: { shape: 'circle', pierce: true, col: '201,209,219', range: 350, clr: .4, use: ['trade', 'tf', 'chase', 'flee', 'clear'], next: { key: 'E', shape: 'dash', needHit: true } },
      R: { shape: 'line', col: '235,60,60', range: 1250, use: ['chase', 'pick', 'tf'], ult: 'ambessa' },
    },
    // ---------- 크산테: 기본 ↔ 총공세(R 뒤). Q 3타는 끌어당기며 에어본, W 차징, E 보호막 돌진, R 대상 납치(벽 근처면 벽 끝까지 끌고 가 제압) ----------
    KSante: {
      res: 'allout',
      Q: { shape: 'line', pierce: true, col: '214,184,120', range: 465, clr: .22, use: ['trade', 'clear', 'poke', 'tf', 'chase'] },
      W: { shape: 'line', col: '214,184,120', range: 450, use: ['trade', 'flee', 'tf', 'chase'], charge: true },
      E: { shape: 'dash', col: '214,184,120', range: 250, use: ['trade', 'chase', 'flee', 'tf'] },
      R: { shape: 'target', col: '214,184,120', range: 350, use: ['tf', 'pick', 'trade'], ult: 'ksante' },
    },
  },
  // 챔피언별 라인 클리어 속도 (평타 · 스킬로 웨이브를 정리하는 빠르기, 1 = 보통). 스킬 하나의 클리어량은 각 스킬의 clr
  CLEAR: { Rumble: 1.2, Ambessa: 1, KSante: .7 },
  clearOf(c) { return this.CLEAR[c] ?? 1; },
  has(c) { return !!this.K[c]; },
  D: () => Sim.dist,
  on(p) { return p.kit ||= { cd: {}, heat: 0, lastCast: -99, stack: 0, charges: 2, chT: 0, q: [] }; },
  // 재사용 대기: 실제 값(현재 랭크) × 0.8 (스킬 가속), 총공세 크산테 Q는 더 빠르다
  cdOf(p, key) { const rc = typeof CStats !== 'undefined' && CStats.cd(p, key); return Math.max(1, (rc || ({ Q: 6, W: 10, E: 10, R: 90 })[key]) * (key === 'R' ? .85 : .8) * (p.c === 'KSante' && key === 'Q' && this.allout(p) ? .6 : 1)); },
  allout(p) { return !!(p.kit && p.kit.allout > (Sim.T ?? 0)); },
  hpCap(p, g) { return p.kit && p.kit.allout > g.t ? .65 : 1; },
  vamp(g, a, v, dmg) {
    if (!this.allout(a) || a.dead || typeof CStats === 'undefined') return;
    const A = CStats.now(a), V = CStats.now(v); if (!A || !V) return;
    a.hp = Math.min(.65, a.hp + dmg * V.maxHP / A.maxHP * .2);
  },
  hot(p) { return p.c === 'Rumble' && p.kit && p.kit.heat >= 50; },
  over(p, g) { return p.c === 'Rumble' && p.kit && (p.kit.over || 0) > g.t; },
  ready(g, p, key) {
    const k = this.on(p), d = this.K[p.c][key]; if (!d) return false;
    if (this.over(p, g)) return false;                                     // 과열 중에는 스킬 봉인
    if (key === 'R' && (p.lvl < 6 || (p.kit.rAt || 0) > g.t)) return false;
    if (d.charges) return k.charges > 0 && g.t >= (k.cd[key] || 0);
    if (key !== 'R' && g.t < (k.cd[key] || 0)) return false;
    if (typeof CStats !== 'undefined' && p.mpMax && !this.allout(p) && CStats.cost(p, key) > p.mpCur) return false;   // 총공세 스킬은 소모 없음
    return true;
  },
  // 1초마다 (Sim.step 뒤): 자원 · 충전 · 콤보 대기열 · 한타 밖 스킬
  tick(g) {
    Sim.T = g.t;
    for (const p of g.pl) {
      if (!this.has(p.c)) continue;
      const k = this.on(p), d = this.K[p.c];
      if (p.dead || p.recall) { k.q = []; if (p.dead) { k.heat = 0; k.stack = 0; k.allout = 0; } continue; }
      // 럼블 열기: 3초 동안 스킬을 안 쓰면 초당 10씩 식는다. 과열이 끝나면 0
      if (d.res === 'heat') { if ((k.over || 0) > 0 && k.over <= g.t) { k.over = 0; k.heat = 0; } else if (!k.over && g.t - k.lastCast > 3) k.heat = Math.max(0, k.heat - 10); }
      if (d.E && d.E.charges && k.charges < d.E.charges && g.t >= k.chT) { k.charges++; k.chT = g.t + this.cdOf(p, 'E'); }
      if (this.busy(g, p)) continue;
      // 한타 밖: 라인에서 클리어 · 견제 · 포탑 밑 챙기기 · 과열 유지
      this.laneCast(g, p);
    }
  },
  busy(g, p) { return g.fights.some(f => f.mem.has(p)); },
  // ---------- 한타 밖 ----------
  laneCast(g, p) {
    if (g.t < 90 || (p.kit.lastCast > g.t - 2)) return;
    const lane = Sim.LANE_OF[p.role]; if (!lane || p.role === 'JGL' || Sim.distLane(p.pos, lane) > 6) return;
    const o = Sim.other(p.side), D = Sim.dist, k = p.kit;
    const ew = Sim.minNear(g, o, p.pos, 6.5)[0], foe = g.pl.find(q => q.side === o && !q.dead && !q.recall && D(q.pos, p.pos) < 9 && Rift.los(q.pos, p.pos));
    const myT = Sim.structOf(g, p.side, lane), behind = ew && D(ew.p, myT.pos) < 12;
    const ctxs = [];
    if (behind) ctxs.push('farm');
    if (foe && p.hp > .45 && g.r() < .3) ctxs.push('poke');
    if (ew && ew.n > 1.2) ctxs.push('clear');
    if (p.c === 'Rumble' && k.heat < 50 && (foe || ew) && g.r() < .5) ctxs.push('heat');   // 위험 상태 유지 (넘치지는 않게)
    for (const ctx of ctxs) {
      for (const key of ['Q', 'E', 'W']) {
        const s = this.K[p.c][key];
        if (!s || !s.use.includes(ctx) || !this.ready(g, p, key)) continue;
        if (p.c === 'Rumble' && ctx !== 'trade' && k.heat >= 80) continue;          // 라인에서는 과열까지 가지 않는다
        if (ctx === 'poke' && foe && D(foe.pos, p.pos) > this.R(s.range || 500)) continue;
        const tg = ctx === 'poke' ? foe : null, at = tg ? tg.pos : ew ? ew.p : foe ? foe.pos : p.pos;
        this.fire(g, p, key, { ctx, tg, at, wave: ew, lane: true });
        return;
      }
    }
  },
  // ---------- 한타 안 (Skills.cast에서 키트 챔피언만 넘어온다) ----------
  cast(g, f, p, live) {
    const k = this.on(p), D = Sim.dist;
    if (p.recall || p.tpCh || (p.cc || 0) > g.t) return;
    const foes = live.filter(q => q.side !== p.side && !q.dead), tg0 = p.hitTo && !p.hitTo.dead && foes.includes(p.hitTo) ? p.hitTo : foes.slice().sort((a, b) => D(a.pos, p.pos) - D(b.pos, p.pos))[0];
    // 콤보 대기열 (Q 2타 · E 재사용 · W→Q 등): 조건이 맞으면 바로 이어 쓴다
    if (k.q.length && k.q[0].at <= g.t) {
      const n = k.q.shift(), tg = n.tg && !n.tg.dead ? n.tg : tg0;
      if (tg && D(tg.pos, p.pos) < 9) { this.fire(g, p, n.key, { ctx: 'combo', tg, at: tg.pos, big: f.size >= 4, follow: n }); return; }
    }
    if (g.r() > .6) return;                                                // 1초에 매번 쓰지는 않는다
    const low = p.hp < .3 || p.fled, size = f.size || f.mem.size;
    const fleeing = tg0 && (tg0.fled || (tg0.hp < .25 && D(tg0.pos, p.pos) > p.rng));
    const ctxs = low ? ['flee'] : fleeing ? ['chase', 'finish', 'pick'] : size >= 4 ? ['tf', 'pick', 'trade'] : ['trade', 'pick'];
    if (p.c === 'Rumble' && !low && k.heat < 100) ctxs.push('heat');
    for (const ctx of ctxs) for (const key of ['R', 'E', 'Q', 'W']) {
      const s = this.K[p.c][key];
      if (!s || !s.use.includes(ctx) || !this.ready(g, p, key)) continue;
      const tg = this.target(g, p, key, ctx, foes, tg0); if (!tg && !['W'].includes(key) && s.shape !== 'self') continue;
      if (tg && s.range && D(tg.pos, p.pos) > this.R(s.range) + 1) continue;
      if (key === 'R' && !this.ultOk(g, p, ctx, tg, foes, size)) continue;
      this.fire(g, p, key, { ctx, tg, at: tg ? tg.pos : p.pos, big: size >= 4, foes });
      return;
    }
  },
  target(g, p, key, ctx, foes, tg0) {
    const D = Sim.dist;
    if (ctx === 'pick' || (key === 'R' && this.K[p.c].R.ult)) { const c = foes.filter(q => D(q.pos, p.pos) < this.R(this.K[p.c].R.range) + 1).sort((a, b) => (a.hp - b.hp) - (Sim.isCarry(a) ? .25 : 0) + (Sim.isCarry(b) ? .25 : 0))[0]; return c || tg0; }
    return tg0;
  },
  // 궁: 럼블은 3명 이상 걸리는 한타 · 도망가는 적 마무리, 암베사는 추격 · 암살, 크산테는 납치(딜러) · 이기는 맞딜에서 폼 체인지
  ultOk(g, p, ctx, tg, foes, size) {
    if (!tg) return false;
    const D = Sim.dist;
    if (p.c === 'Rumble') return ctx === 'finish' || ctx === 'chase' ? tg.hp < .35 : foes.filter(q => D(q.pos, tg.pos) < 5).length >= (size >= 6 ? 3 : 2);
    if (p.c === 'Ambessa') return ctx === 'chase' || ctx === 'pick' ? tg.hp < .55 || Sim.isCarry(tg) : size >= 4 && Sim.isCarry(tg) && g.r() < .5;
    if (p.c === 'KSante') return ctx === 'trade' ? p.hp > tg.hp + .1 : Sim.isCarry(tg) || tg.hp < .5;
    return true;
  },
  // ---------- 스킬 하나 쓰기: 재사용 · 자원 · 효과 · 연출 ----------
  fire(g, p, key, o) {
    const k = this.on(p), s = this.K[p.c][key], D = Sim.dist, foesAll = o.foes || g.pl.filter(q => q.side !== p.side && !q.dead && !q.recall);
    let shape = s.shape, name = null, col = s.col, cc = '';
    // 재사용 · 충전 · 마나
    if (o.follow) { shape = o.follow.shape || shape; name = o.follow.name || null; }
    else if (s.charges) { k.charges--; if (k.chT <= g.t) k.chT = g.t + this.cdOf(p, key); k.cd[key] = g.t + .5; }
    else if (key === 'R') k.rAt = g.t + this.cdOf(p, 'R');
    else k.cd[key] = g.t + this.cdOf(p, key);
    if (typeof CStats !== 'undefined' && p.mpMax && !o.follow && !this.allout(p)) p.mpCur = Math.max(0, p.mpCur - CStats.cost(p, key));
    k.lastCast = g.t;
    const tg = o.tg, at = o.at || p.pos;
    // 맞는 대상: 관통이면 경로 위 전부, 아니면 첫 대상 하나
    let hit = [];
    if (tg || shape !== 'self') {
      const seg = (a, b, q) => { const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy || 1, u = Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / L)); return D(q, [a[0] + vx * u, a[1] + vy * u]); };
      const rng = this.R(s.range || 500);
      const cand = shape === 'cone' ? foesAll.filter(q => D(q.pos, p.pos) < rng && D(q.pos, at) < 4) : shape === 'circle' ? foesAll.filter(q => D(q.pos, p.pos) < rng + 1.5)
        : shape === 'line' || shape === 'wall' ? foesAll.filter(q => seg(p.pos, at, q.pos) < (shape === 'wall' ? 2.6 : 1.6)) : tg ? [tg] : [];
      hit = s.pierce || shape === 'cone' || shape === 'circle' || shape === 'wall' ? cand : cand.sort((a, b) => D(a.pos, p.pos) - D(b.pos, p.pos)).slice(0, 1);
      if (o.lane && !o.tg) hit = [];                                       // 미니언에게 쓴 스킬
    }
    // 회피: 논타겟은 빗나갈 수 있다 (크산테 R 같은 대상 지정은 항상)
    const sk0 = Skills.of(p.c).find(x => x.key === key) || {}, fxD = { ...(sk0.fx || {}), s: shape === 'wall' ? 'wall' : shape === 'self' ? 'self' : shape };
    let miss = [];
    if (hit.length && shape !== 'target' && shape !== 'self') { const dg = Skills.dodge(g, p, fxD, hit); hit = dg.hit; miss = dg.miss; }
    // ----- 챔피언별 효과 -----
    const mul = this.hot(p) && key !== 'R' ? 1.5 : 1;                     // 럼블 위험 상태: 스킬 50% 강화
    if (p.c === 'Rumble') {
      if (key !== 'R') { k.heat = Math.min(100, k.heat + 20); if (k.heat >= 100 && !k.over) { k.over = g.t + 2; p.km = { v: 1.35, until: g.t + 2 }; this.say(g, p, `${p.name}, 과열! 평타가 불을 뿜습니다!`); } }
      if (this.hot(p) && s.colHot) col = s.colHot;
      if (key === 'E') hit.forEach(v => { const twice = (v.slow || 0) > g.t; v.slow = g.t + 2; v.vuln = { v: 1 + .06 * (twice ? 2 : 1) * mul, until: g.t + 3 }; }), cc = 'slow';
      if (key === 'W') { p.dash = g.t + 1; }
      if (key === 'R') {
        // 이지선다: 불길을 피해 진형이 무너지거나(물러남), 맞으면서 싸운다(큰 피해). 숙련도가 높을수록 잘 깐다
        const skill = Math.min(1, (p.m || 0) / 20) * .5 + Math.max(0, (p.ovr - 70) / 60);
        hit = hit.filter(() => g.r() < .45 + skill * .4);
        hit.forEach(v => { if (o.ctx !== 'finish' && g.r() < .45) Sim.retreat(g, v, 6); else v.vuln = { v: 1.25, until: g.t + 3 }; v.slow = g.t + 2; });
      }
    } else if (p.c === 'Ambessa') {
      if (key === 'Q' && !o.follow && hit.length) k.q.push({ key: 'Q', at: g.t + 1, tg: hit[0], name: '파멸의 일격', shape: 'line' });   // Q 평 Q
      if (key === 'E' && !o.follow && hit.length) k.q.push({ key: 'E', at: g.t + 1, tg: hit[0], shape: 'dash' });                      // E E 평
      if (key === 'W') { p.km = { v: 1.15, until: g.t + 2 }; }                                                                            // W 평
      if (['Q', 'E'].includes(key) || o.follow) p.dash = g.t + 1;                                                                         // 스킬 뒤 돌진 (추격 · 도주)
      if (key === 'R' && tg) { tg.cc = g.t + 1; cc = 'stun'; p.km = { v: 1.3, until: g.t + 4 }; this.blink(g, p, tg, 1.2); this.say(g, p, `${p.name}의 ${this.nm(p, 'R')}! ${Sim.josa(tg.name, '을', '를')} 꽂고 뒤로 넘어갑니다!`); }
      if (o.follow && o.follow.key === 'Q') hit.forEach(v => { v.vuln = { v: 1.12, until: g.t + 2 }; });
    } else if (p.c === 'KSante') {
      const AO = this.allout(p);
      if (key === 'Q') {
        k.stack = (k.stack || 0) + (hit.length ? 1 : 0);
        if (k.stack >= 3) { k.stack = 0; shape = 'line'; cc = AO ? 'up' : 'pull'; name = (Skills.of(p.c)[0].name) + ' (3타)'; hit.forEach(v => { v.cc = g.t + 1; }); }
        else { cc = AO ? '' : 'slow'; hit.forEach(v => { v.slow = g.t + 2; }); }
        p.km = { v: AO ? 1.4 : 1.1, until: g.t + 2 };                     // Q 다음 패시브 평타가 주력 딜
      }
      if (key === 'W') { if (AO) { p.dash = g.t + 1; hit.forEach(v => { v.vuln = { v: 1.15, until: g.t + 2 }; }); } else { cc = 'back'; hit.forEach(v => { v.cc = g.t + 1; }); if (hit.length) k.q.push({ key: 'Q', at: g.t + 1, tg: hit[0] }); } }   // W 평 Q
      if (key === 'E') p.dash = g.t + 1;
      if (key === 'R' && tg) {
        // 납치: 상대를 뒤로 차 낸다. 뒤에 벽이 가까우면 벽 끝까지 같이 넘어가 제압
        const wall = this.wallBehind(p, tg);
        tg.cc = g.t + (wall ? 2 : 1); cc = wall ? 'stun' : 'back';
        this.kick(g, p, tg, wall);
        // 총공세(실제 15초 ≈ 엔진 7초): 체력 상한 65% (넘는 체력은 깎이고 끝나도 안 돌아온다), 방어 · 마저 ↓ · 공속 · 방관 ↑ (CStats.now), 흡혈 20%, 스킬 소모 없음
        k.allout = g.t + 7; p.hp = Math.min(p.hp, .65);
        this.say(g, p, wall ? `${p.name}, ${Sim.josa(tg.name, '을', '를')} 벽 너머로 끌고 갑니다! 총공세!` : `${p.name}의 납치! ${Sim.josa(tg.name, '을', '를')} 진영 밖으로 걷어찹니다!`);
      }
    }
    // 암베사 패시브(용사냥개의 발걸음): 스킬을 쓸 때마다 짧게 도약 (칼리스타처럼) + 다음 평타 강화.
    //  도주 중이면 뒤로, 대상이 멀면 대상 쪽으로, 붙어 있으면 옆으로 비켜 선다
    if (p.c === 'Ambessa' && key !== 'R') this.hop(g, p, o.ctx, tg || (o.foes || []).find(q => q.side !== p.side));
    // 보호막 (데이터: 럼블 W · 크산테 E 등)
    if (typeof CStats !== 'undefined' && !o.follow) { const sh = CStats.shield(p, key, p); if (sh) p.sh = { v: Math.max(p.sh && p.sh.until > g.t ? p.sh.v : 0, sh.v * mul), until: g.t + Math.max(1, Math.round(sh.dur / 2)) }; }
    // 견제 · 클리어 (한타 밖): 견제는 체력을 조금, 클리어는 웨이브를 깎고 CS
    if (o.lane) {
      if (o.tg && hit.includes(o.tg) && typeof CStats !== 'undefined') { const h = CStats.hit(p, o.tg); if (h != null) o.tg.hp = Math.max(.15, o.tg.hp - h * 1.4 * mul); }
      if (o.wave && (o.ctx === 'clear' || o.ctx === 'farm' || o.ctx === 'heat')) { const dn = Math.min(o.wave.n, (s.clr ?? .3) * mul); o.wave.n -= dn; Sim.csGive(g, p.side, o.wave.p, dn, Sim.min(g), o.ctx === 'farm'); }
    }
    // 연출
    const sk = Skills.of(p.c).find(x => x.key === key) || {};
    (g.sk ||= []).push({ t: g.t, i: g.pl.indexOf(p), key, kind: shape === 'self' ? 'self' : shape === 'dash' ? 'dash' : key === 'R' ? 'init' : 'atk', shape: shape === 'self' || shape === 'dash' ? '' : shape === 'wall' ? 'line' : shape,
      wall: shape === 'wall', cc, name: name || sk.name || key, icon: sk.icon, from: [...p.pos], to: [...at], hit: hit.map(q => g.pl.indexOf(q)), miss: miss.map(q => g.pl.indexOf(q)), ally: [], big: !!o.big || key === 'R', col, fx: sk0.fx || null, pierce: !!s.pierce, rng: this.R(s.range || 500), kit: true, lane: !!o.lane, hot: this.hot(p) });
  },
  nm(p, key) { return (Skills.of(p.c).find(x => x.key === key) || {}).name || key; },
  say(g, p, text) { if (g.r() < .5) Sim.say(g, 'cast', text); },
  hop(g, p, ctx, tg) {
    const D = Sim.dist, d = 2;                                              // 약 300 유닛
    let dir;
    if (ctx === 'flee' || p.hp < .3) { const f = Sim.fountain(p.side), L = D(f, p.pos) || 1; dir = [(f[0] - p.pos[0]) / L, (f[1] - p.pos[1]) / L]; }
    else if (tg) { const dx = tg.pos[0] - p.pos[0], dy = tg.pos[1] - p.pos[1], L = Math.hypot(dx, dy) || 1; dir = L > 2.2 ? [dx / L, dy / L] : (g.r() < .5 ? [-dy / L, dx / L] : [dy / L, -dx / L]); }
    else return;
    const to = Rift.snap(Sim.clampP([p.pos[0] + dir[0] * d, p.pos[1] + dir[1] * d]), 1);
    if (!Rift.los(p.pos, to)) return;
    const from = [...p.pos]; p.pos = to; p.warp = g.t; p.km = { v: Math.max(p.km && p.km.until > g.t ? p.km.v : 1, 1.1), until: g.t + 1 };
    (g.sk ||= []).push({ t: g.t, i: g.pl.indexOf(p), key: 'P', kind: 'dash', shape: '', cc: '', name: '도약', icon: null, from, to: [...to], hit: [], miss: [], ally: [], big: false, col: '255,190,110', kit: true, hop: true });
  },
  // 암베사 R: 대상 뒤로 (벽이면 가까운 길 위로)
  blink(g, p, tg, d) {
    const dx = tg.pos[0] - p.pos[0], dy = tg.pos[1] - p.pos[1], L = Math.hypot(dx, dy) || 1;
    const to = Rift.snap(Sim.clampP([tg.pos[0] + dx / L * d, tg.pos[1] + dy / L * d]), 1);
    p.pos = to; p.warp = g.t; p.dash = g.t + 1;
  },
  // 크산테 R: 대상 뒤 방향에 벽이 있나 (6 이내)
  wallBehind(p, tg) {
    const dx = tg.pos[0] - p.pos[0], dy = tg.pos[1] - p.pos[1], L = Math.hypot(dx, dy) || 1;
    for (let s = 1; s <= 6; s += .5) if (Rift.wall([tg.pos[0] + dx / L * s, tg.pos[1] + dy / L * s])) return true;
    return false;
  },
  kick(g, p, tg, wall) {
    const dx = tg.pos[0] - p.pos[0], dy = tg.pos[1] - p.pos[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    let d = wall ? 0 : 4;
    if (wall) { let s = 1, inW = false; for (; s <= 14; s += .5) { const w = Rift.wall([tg.pos[0] + ux * s, tg.pos[1] + uy * s]); if (w) inW = true; else if (inW) break; } d = Math.min(14, s + .8); }   // 벽 끝까지
    const to = Rift.snap(Sim.clampP([tg.pos[0] + ux * d, tg.pos[1] + uy * d]), 1), me = Rift.snap(Sim.clampP([to[0] - ux * 1.5, to[1] - uy * 1.5]), 1);
    tg.pos = to; tg.warp = g.t; tg.hold = { to: [...to], until: g.t + 2 };
    p.pos = me; p.warp = g.t; p.hold = { to: [...me], until: g.t + 1 };
  },
  // 한타 피해 배율 (엔진 fightTick에서): 주는 쪽 km · 받는 쪽 vuln · 과열 평타
  mul(g, a, v) { return (a.km && a.km.until > g.t ? a.km.v : 1) * (v.vuln && v.vuln.until > g.t ? v.vuln.v : 1); },
};
// 엔진에 붙이기: 매초 키트 처리
(() => {
  if (typeof Sim === 'undefined') return;
  const step = Sim.step.bind(Sim);
  Sim.step = g => { step(g); if (!g.over) Kits.tick(g); };
})();

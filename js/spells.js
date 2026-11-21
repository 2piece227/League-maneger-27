// 소환사 주문: 챔피언별 실제 프로 경기 선택 비율(data/champ-stats.json spells)로 두 개를 든다 (정글은 강타, 텔레포트는 엔진의 기존 순간이동)
//  점멸은 도주만이 아니다 — 점멸 이니시(반응 못 하는 궁) · 점멸 마무리(특히 상대 점멸이 빠졌을 때) · 벽 넘어 도주
//  나머지: 회복 · 방어막 · 정화 · 유체화 · 점화 · 탈진. 재사용 대기는 실제 초(게임 시계 기준)
//  선수 실력(OVR · 챔피언 숙련)이 높을수록 각을 잘 본다
const Spells = {
  CD: { Flash: 300, Heal: 240, Barrier: 180, Cleanse: 210, Ghost: 210, Ignite: 180, Exhaust: 210, Teleport: 300, Smite: 90 },
  IC: { Flash: 'SummonerFlash', Teleport: 'SummonerTeleport', Smite: 'SummonerSmite', Heal: 'SummonerHeal', Barrier: 'SummonerBarrier', Cleanse: 'SummonerBoost', Ghost: 'SummonerHaste', Ignite: 'SummonerDot', Exhaust: 'SummonerExhaust' },
  KO: { Flash: '점멸', Teleport: '순간이동', Smite: '강타', Heal: '회복', Barrier: '방어막', Cleanse: '정화', Ghost: '유체화', Ignite: '점화', Exhaust: '탈진' },
  FLASH: 2.7,                         // 400 유닛
  icon(s) { return `assets/spells/${this.IC[s]}.png`; },
  // 챔피언의 실제 선택 비율에서 두 번째 주문을 뽑는다 (점멸은 거의 모두)
  pick(g, p) {
    const x = typeof Stats !== 'undefined' && Stats.of(p.c), L = x && x.spells ? x.spells.filter(([s]) => this.CD[s]) : [];
    const ss = ['Flash'];
    if (p.role === 'JGL') ss.push('Smite');
    else {
      const pool = L.filter(([s]) => s !== 'Flash' && s !== 'Smite');
      const tot = pool.reduce((a, [, n]) => a + n, 0);
      let s2 = null;
      if (tot > 0) { let r = g.r() * tot; for (const [s, n] of pool) { r -= n; if (r <= 0) { s2 = s; break; } } }
      ss.push(s2 || ({ TOP: 'Teleport', MID: 'Teleport', BOT: 'Heal', SUP: 'Ignite' })[p.role] || 'Ignite');
    }
    p.ss = ss; p.ssCd = {}; p.tp = ss.includes('Teleport');
  },
  has(p, s) { return p.ss && p.ss.includes(s); },
  ready(g, p, s) { return this.has(p, s) && g.t >= (p.ssCd[s] || 0) && !p.dead; },
  use(g, p, s, to, say) {
    p.ssCd[s] = g.t + this.CD[s];
    (g.sk ||= []).push({ t: g.t, i: g.pl.indexOf(p), key: s === 'Flash' ? 'F' : 'D', kind: s === 'Flash' ? 'dash' : 'self', shape: '', cc: '', name: this.KO[s], icon: this.icon(s), from: [...p.pos], to: to ? [...to] : [...p.pos], hit: [], miss: [], ally: [], big: false, col: '255,236,150', kit: true, ss: s });
    // 점멸 도주 · 추격 같은 흔한 장면은 30초에 한 번, 절반만 부른다 (한 경기에 열 번 넘게 나오던 것). 점멸 이니시 · 마무리 같은 큰 장면은 그대로
    const minor = say && /살아 나갑니다|점멸로 빠집니다|벽을 넘어|따라붙습니다|끝까지 따라|정화로|탈진/.test(say);
    if (say && g.r() < .7 && (!minor || (g.t - (g.ssSay ?? -99) >= 30 && g.r() < .5))) { Sim.say(g, 'cast', say); if (minor) g.ssSay = g.t; }
  },
  // 각을 보는 실력 (0.6 ~ 1.2)
  skill(p) { return Math.max(.6, Math.min(1.2, .6 + ((p.ovr || 70) - 60) / 60 + Math.min(1, (p.m || 0) / 30) * .2)); },
  reach(p) { return p.rng < 5 ? p.rng + 1.6 : p.rng; },
  // 점멸: from에서 dir 쪽으로 2.7. 벽이면 넘어간 자리(벽 너머 걸을 수 있는 곳)로, 아니면 갈 수 있는 만큼
  blinkTo(from, dir, d = this.FLASH) {
    const L = Math.hypot(dir[0], dir[1]) || 1, u = [dir[0] / L, dir[1] / L];
    for (let s = d; s >= .8; s -= .3) { const q = Sim.clampP([from[0] + u[0] * s, from[1] + u[1] * s]); if (!Rift.wall(q)) return Rift.snap(q, 1); }
    return null;
  },
  flash(g, p, to, say) {
    const from = [...p.pos]; p.pos = to; p.warp = g.t; p.trail = [to]; p.hold = { to: [...to], until: g.t + 1 };
    this.use(g, p, 'Flash', to, say);
    g.sk[g.sk.length - 1].from = from;
  },
  maxHP(p) { const A = typeof CStats !== 'undefined' && CStats.now(p); return A ? A.maxHP : 2000; },

  // ---------- 교전 1초 앞 (맞기 전에): 점멸 이니시 · 점멸 마무리 · 점화 · 탈진 · 정화 ----------
  pre(g) {
    for (const f of g.fights) {
      const mem = [...f.mem].filter(p => !p.dead && !p.recall && !p.tpCh);
      for (const p of mem) {
        if (!p.ss) continue;
        const foes = g.pl.filter(q => q.side !== p.side && !q.dead && !q.recall && !q.tpCh && (f.mem.has(q) || q.fled === f.id));
        if (!foes.length) continue;
        const D = Sim.dist, sk = this.skill(p), R = this.reach(p);
        // 정화: 묶였으면 바로 푼다
        if ((p.cc || 0) > g.t && this.ready(g, p, 'Cleanse') && p.hp < .85) { p.cc = 0; this.use(g, p, 'Cleanse', null, `${p.name}, 정화로 풀어냅니다!`); }
        if ((p.cc || 0) > g.t || p.fled) continue;
        // 점멸 이니시: 싸움이 막 열릴 때, 묶는 궁(이니시 궁)이 있는 앞라인 · 돌진형이 점멸로 붙어 바로 궁 — 반응할 틈이 없다
        if (g.t - f.t0 <= 1 && f.size >= 3 && !(f.fe && f.fe[p.side]) && this.ready(g, p, 'Flash') && this.initUlt(g, p)) {
          const tg = foes.filter(q => { const d = D(q.pos, p.pos); return d > R && d <= R + this.FLASH + 2 && Rift.los(p.pos, q.pos); })
            .sort((a, b) => (Sim.isCarry(b) ? 1 : 0) - (Sim.isCarry(a) ? 1 : 0) || D(a.pos, p.pos) - D(b.pos, p.pos))[0];
          if (tg && g.r() < .45 * sk) {
            const d = D(tg.pos, p.pos), to = this.blinkTo(p.pos, [tg.pos[0] - p.pos[0], tg.pos[1] - p.pos[1]], Math.min(this.FLASH, d - 1.4));
            if (to) {
              (f.fe ||= {})[p.side] = 1; p.flashEng = g.t; p.forceR = g.t; p.hitTo = tg;
              const rc = ((typeof Skills !== 'undefined' ? Skills.of(p.c) : [])[3] || {}).cc, hit = { up: '그대로 띄워집니다', stun: '그대로 묶입니다', pull: '그대로 끌려옵니다', back: '그대로 밀려납니다' }[rc];   // 묶는 궁일 때만 '묶입니다'
              this.flash(g, p, to, Sim.pick(g, [`점멸 이니시! ${p.name}의 ${Sim.cn(p)}, 반응할 틈이 없습니다!`, hit ? `${p.name}, 점멸 ${this.ultName(p)}! ${Sim.josa(tg.name, '이', '가')} ${hit}!` : `${p.name}, 점멸 ${this.ultName(p)}! 곧바로 ${Sim.josa(tg.name, '을', '를')} 덮칩니다!`, `플래시 궁! ${Sim.josa(p.name, '이', '가')} 한 번에 들어가요!`]));
              continue;
            }
          }
        }
        // 점멸 마무리: 체력이 바닥난 적이 사거리 바로 밖에 있으면 점멸로 붙어 끝낸다 (상대 점멸이 빠졌으면 더 과감하게)
        if (this.ready(g, p, 'Flash') && p.hp > .2) {
          const v = foes.filter(q => { const d = D(q.pos, p.pos); return q.hp < .2 && q.flashChased !== g.t && d > R && d <= R + this.FLASH && Rift.los(p.pos, q.pos); }).sort((a, b) => a.hp - b.hp)[0];   // 한 명을 여럿이 동시에 점멸로 쫓지 않는다
          const noF = v && !this.ready(g, v, 'Flash');
          if (v && g.r() < (noF ? .7 : .4) * sk) {
            const d = D(v.pos, p.pos), to = this.blinkTo(p.pos, [v.pos[0] - p.pos[0], v.pos[1] - p.pos[1]], Math.min(this.FLASH, d - R + .6));
            if (to) { p.hitTo = v; v.flashChased = g.t; this.flash(g, p, to, noF ? `${Sim.josa(v.name, '은', '는')} 점멸이 없어요! ${p.name}, 점멸로 따라붙습니다!` : `${p.name}, 점멸로 끝까지 따라갑니다!`); continue; }
          }
        }
        // 점화: 마무리 각 (고정 피해, 4.5 안)
        if (this.ready(g, p, 'Ignite')) {
          const v = foes.filter(q => q.hp < .3 && D(q.pos, p.pos) <= 4.5 && Rift.los(p.pos, q.pos)).sort((a, b) => a.hp - b.hp)[0];
          if (v && g.r() < .6 * sk) { this.use(g, p, 'Ignite', v.pos); if (typeof Kits !== 'undefined') Kits.deal(g, p, v, { t: 70 + 20 * p.lvl }, f); }
        }
        // 탈진: 우리 딜러를 무는 적 (돌진 · 브루저 · 원딜)에게 — 2초 동안 피해 40% 감소
        if (this.ready(g, p, 'Exhaust')) {
          const us = mem.filter(q => q.side === p.side && Sim.isCarry(q) && q.hp < .7);
          const v = foes.filter(q => (q.kind === 'dive' || q.kind === 'bruiser' || q.kind === 'adc') && D(q.pos, p.pos) <= 4.5 && us.some(c => D(c.pos, q.pos) < 4.5)).sort((a, b) => Sim.ppow(b, Sim.min(g)) - Sim.ppow(a, Sim.min(g)))[0];
          if (v && g.r() < .55 * sk) { v.exh = g.t + 2; this.use(g, p, 'Exhaust', v.pos, g.r() < .4 ? `${p.name}, ${Sim.josa(v.name, '에게', '에게')} 탈진! 딜이 안 들어갑니다!` : null); }
        }
      }
    }
  },
  // ---------- 교전 1초 뒤 (맞은 다음): 점멸 도주 · 회복 · 방어막 · 유체화 ----------
  post(g) {
    for (const f of g.fights) for (const p of [...f.mem]) {
      if (p.dead || p.recall || p.tpCh || !p.ss || (p.cc || 0) > g.t) continue;
      const D = Sim.dist, foes = g.pl.filter(q => q.side !== p.side && !q.dead && !q.recall && f.mem.has(q) && !q.fled);
      const threat = foes.filter(q => D(q.pos, p.pos) <= this.reach(q) + 1.5 && Rift.los(q.pos, p.pos));
      if (!threat.length) continue;
      const sk = this.skill(p), low = p.hp < .22;
      // 방어막 · 회복: 위험할 때 먼저
      if (p.hp < .28 && this.ready(g, p, 'Barrier') && g.r() < .8 * sk) { const v = (95 + 25 * p.lvl) / this.maxHP(p); p.sh = { v: Math.max(p.sh && p.sh.until > g.t ? p.sh.v : 0, v), until: g.t + 2 }; this.use(g, p, 'Barrier'); }
      else if (p.hp < .28 && this.ready(g, p, 'Heal') && g.r() < .8 * sk) {
        const cap = typeof Kits !== 'undefined' ? Kits.hpCap(p, g) : 1, amt = 80 + 15.6 * p.lvl;
        p.hp = Math.min(cap, p.hp + amt / this.maxHP(p));
        const al = [...f.mem].filter(q => q.side === p.side && q !== p && !q.dead && q.hp < .6 && D(q.pos, p.pos) < 5.5).sort((a, b) => a.hp - b.hp)[0];
        if (al) al.hp = Math.min(typeof Kits !== 'undefined' ? Kits.hpCap(al, g) : 1, al.hp + amt / this.maxHP(al));
        this.use(g, p, 'Heal');
      }
      // 점멸 도주: 빠지는 중인데 붙어 있으면 본진 쪽으로, 벽을 넘을 수 있으면 넘는다 (점멸 없는 상대는 못 따라온다)
      if ((p.fled === f.id || low) && p.hp < .3 && this.ready(g, p, 'Flash') && g.r() < .55 * sk) {
        const home = Sim.fountain(p.side), base = Math.atan2(home[1] - p.pos[1], home[0] - p.pos[0]);
        let best = null;
        for (const da of [0, -.5, .5, -1, 1]) {
          const a = base + da, to = this.blinkTo(p.pos, [Math.cos(a), Math.sin(a)]); if (!to) continue;
          const over = !Rift.los(p.pos, to), far = threat.reduce((m, q) => Math.min(m, D(q.pos, to)), 99);
          const sc = far + (over ? 3 : 0) - Math.abs(da);
          if (!best || sc > best.sc) best = { to, sc, over };
        }
        if (best) { this.flash(g, p, best.to, best.over ? `${p.name}, 점멸로 벽을 넘어 빠집니다!` : `살았어요! ${p.name}, 점멸로 빠집니다!`); p.fled = f.id; Sim.retreat(g, p, 18); continue; }
      }
      // 유체화: 도망 · 추격
      if (this.ready(g, p, 'Ghost') && (p.fled === f.id || foes.some(q => q.fled === f.id && q.hp < .3)) && g.r() < .6 * sk) { p.ghost = g.t + 5; Sim.refresh(p); this.use(g, p, 'Ghost'); }
    }
    // 도망가던 적: 쫓아오는 쪽이 점멸로 따라붙는다 (fightTick 추격 단계에서 사거리 밖이면)
  },
  // 묶는 궁(이니시 궁)이 준비됐나
  initUlt(g, p) {
    if (typeof Kits !== 'undefined' && Kits.has(p.c)) return Kits.ready(g, p, 'R') && p.lvl >= 6 && ['KSante', 'Ambessa'].includes(p.c);
    const R = (typeof Skills !== 'undefined' ? Skills.of(p.c) : [])[3];
    return !!R && p.lvl >= 6 && g.t >= (p.rFx || 0) && (R.kind === 'init' || ['up', 'stun', 'pull', 'back'].includes(R.cc)) && !Sim.ULT_JOIN.includes(p.c);
  },
  ultName(p) { const R = (typeof Skills !== 'undefined' ? Skills.of(p.c) : [])[3]; return R ? R.name : '궁'; },
  tick(g) {
    for (const p of g.pl) {
      if (!p.ss) this.pick(g, p);
      if (p.ghost && p.ghost <= g.t) { p.ghost = 0; Sim.refresh(p); }
    }
  },
};
// 엔진에 붙이기
(() => {
  if (typeof Sim === 'undefined') return;
  const ft = Sim.fightTick.bind(Sim), rf = Sim.refresh.bind(Sim), step = Sim.step.bind(Sim), create = Sim.create.bind(Sim);
  Sim.create = (...a) => { const g = create(...a); if (g && g.pl) g.pl.forEach(p => Spells.pick(g, p)); return g; };   // 경기 시작 화면부터 주문이 보이게
  Sim.fightTick = g => { if (g.fights.length) Spells.pre(g); ft(g); if (g.fights.length) Spells.post(g); };
  Sim.refresh = p => { rf(p); if (p.ghost && p.ghost > (Sim.T ?? 0)) p.msF *= 1.3; };
  Sim.step = g => { if (!g.over) Spells.tick(g); step(g); };
})();

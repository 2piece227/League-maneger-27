// 챔피언별 실제 스탯: 체력 · 방어력 · 마법 저항력 · 공격력 · 공격 속도 · 사거리 · 이동 속도 · 마나 (레벨 성장 + 아이템)
// 데이터: data/champ-base.json · data/item-stats.json (tools/scrape/champ-base.mjs, Riot 게임 파일 기반)
// 한타 피해 = (평타 DPS + 스킬 DPS)를 방어력 · 마저로 줄인 값 ÷ 상대 최대 체력. 엔진의 체력은 0~1 비율 그대로.
const CStats = {
  base: {}, items: {},
  load() {
    if (!this._p) this._p = Promise.all([
      fetch('data/champ-base.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('data/item-stats.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('data/champ-shields.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('data/skill-fx.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('data/skill-dmg.json').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([b, i, sh, fx, dm]) => { if (dm) this.dmg = dm.champs; if (b) this.base = b.champs; if (i) this.items = i.items; if (sh) this.shields = sh.champs; if (fx) { this.fx = fx.champs; if (typeof Skills !== 'undefined') Skills.cache = {}; } });
    return this._p;
  },
  // 데이터에 아직 없는 새 챔피언: 같은 공격 방식의 평균으로
  avg(type) {
    const k = 'avg' + type; if (this[k]) return this[k];
    const L = Object.values(this.base).filter(b => b.type === type); if (!L.length) return null;
    const o = { res: 'MANA', type, sk: {} };
    ['hp', 'hpL', 'hp5', 'hp5L', 'mp', 'mpL', 'mp5', 'mp5L', 'arm', 'armL', 'mr', 'mrL', 'ad', 'adL', 'as', 'asL', 'asR', 'range', 'ms'].forEach(f => { o[f] = L.reduce((a, b) => a + (b[f] || 0), 0) / L.length; });
    return (this[k] = o);
  },
  of(c) { const ch = Champions.byId[c] || {}; return this.base[c] || this.avg(ch.attackType === 'RANGED' ? 'RANGED' : 'MELEE'); },
  grow: L => (L - 1) * (.7025 + .0175 * (L - 1)),     // 라이엇 레벨 성장 공식
  // 스킬 피해 비중 (유형별): 메이지 · 포킹은 스킬이 대부분, 원딜은 평타가 대부분
  SPELL_K: .25,
  SPELL: { tank: .5, bruiser: .55, dive: .98, adc: .45, mage: 1.0, arti: .8, ench: .5 },
  AUTO: { tank: .68, bruiser: .82, dive: .9, adc: 1.42, mage: .3, arti: .25, ench: .4 },   // 메이지 · 포킹은 스킬(실제 피해)이 주력이라 평타 몫은 작게
  // 지금 스탯 (레벨 · 아이템이 바뀔 때만 다시 계산)
  now(p) {
    const AO = typeof Kits !== 'undefined' && Kits.allout(p), key = p.lvl + '|' + p.inv.map(i => i.n).join(',') + (AO ? '|AO' : '');
    if (p._cs && p._csk === key) return p._cs;
    const b = this.of(p.c); if (!b) return null;
    const G = this.grow(p.lvl), it = { hp: 0, ad: 0, ap: 0, arm: 0, mr: 0, as: 0, crit: 0, ms: 0, msP: 0, mp: 0, leth: 0, armPen: 0, mpen: 0, mpenP: 0, mp5: 0 };
    let boots = 0;
    p.inv.forEach(i => { const s = this.items[i.n]; if (!s) return; if (i.boots) boots = Math.max(boots, s.ms || 0); Object.keys(it).forEach(k => { if (k !== 'ms' || !i.boots) it[k] += s[k] || 0; }); });
    const ad0 = b.ad + b.adL * G, bonusAS = b.asL * G + it.as;
    const s = {
      maxHP: b.hp + b.hpL * G + it.hp, arm: b.arm + b.armL * G + it.arm, mr: b.mr + b.mrL * G + it.mr,
      ad: ad0 + it.ad, bonusAD: it.ad, ap: it.ap, as: Math.min(2.5, b.as + (b.asR || b.as) * bonusAS / 100), crit: Math.min(1, it.crit / 100),
      leth: it.leth, armPen: it.armPen / 100, mpen: it.mpen, mpenP: it.mpenP / 100,
      ms: (b.ms + boots + it.ms) * (1 + it.msP / 100), mpMax: b.res === 'MANA' ? b.mp + b.mpL * G + it.mp : 0, mp5: (b.mp5 + b.mp5L * G) * (1 + it.mp5 / 100),
    };
    // 크산테 총공세: 방어력 · 마저가 추가 방어 · 마저의 85%만큼 줄고, 공격 속도 40/60/80% · 추가 방어구 관통 50% (대략 방어 관통 35%)
    if (AO) {
      const bArm = s.arm - (b.arm + b.armL * G), bMr = s.mr - (b.mr + b.mrL * G), rk = Math.min(3, Math.max(1, Math.floor((p.lvl - 1) / 5)));
      s.aoB = .01 + bArm / 100 * .01 + bMr / 100 * .01;   // 총공세 추가 피해: 평타 · 스킬마다 대상 최대 체력의 1% (+ 추가 방어 · 마저 100당 1%)
      s.arm = Math.max(0, s.arm - bArm * .85); s.mr = Math.max(0, s.mr - bMr * .85);
      s.as = Math.min(2.5, s.as + b.as * [.4, .6, .8][rk - 1]); s.armPen = Math.min(.6, s.armPen + .35);
    }
    // 스킬 피해 종류 비중 (스킬 데이터의 피해 종류로)
    const dm = Object.values(b.sk || {}).map(x => x.dmg).filter(Boolean), mag = dm.length ? dm.filter(x => /MAGIC/.test(x)).length / dm.length : .5;
    s.magic = mag;
    p._cs = s; p._csk = key; return s;
  },
  // 평타에 붙는 스킬 (스킬 데이터 설명의 'basic attacks ... on-hit / bonus damage for N seconds'): 쓰면 지속 동안 평타마다 그 스킬 피해가 붙는다
  //  d 지속(엔진 초, 실제의 절반) · e 평타 몇 번에 한 번(1 = 매번) · always 패시브처럼 늘 · rep 평타를 대신한다 (아지르 병사 · 제리 Q)
  OH: { Azir: { W: { d: 5, e: 1, rep: 1 } }, Zeri: { Q: { always: 1, e: 1, rep: 1 } }, KogMaw: { W: { d: 4, e: 1 } }, MasterYi: { E: { d: 2.5, e: 1 } },
    Varus: { W: { always: 1, e: .33 } }, Vayne: { W: { always: 1, e: 1 / 3 } }, Vi: { W: { always: 1, e: 1 / 3 } }, Teemo: { E: { always: 1, e: 1 } },
    Gwen: { E: { d: 2, e: 1 } }, Shen: { Q: { d: 4, e: .5 } }, Sett: { Q: { d: 2.5, e: .6 } }, Udyr: { Q: { d: 2, e: .6 } }, Yunara: { Q: { d: 3, e: 1 } },
    Shyvana: { W: { d: 1.5, e: 1 } }, Ivern: { W: { d: 1.5, e: .5 } } },
  ohOn(a, key) { const c = (this.OH[a.c] || {})[key]; return !!c && (c.always || (a.oh && a.oh[key] > (typeof Sim !== 'undefined' ? Sim.T ?? 0 : 0))); },
  // 1초 동안 a가 v에게 주는 피해 (v 최대 체력 대비 비율). 마나가 바닥나면 스킬 피해가 크게 준다
  hit(a, v) {
    const A = this.now(a), V = this.now(v); if (!A || !V) return null;
    let auto = A.ad * A.as * (1 + A.crit * .75) * this.AUTO[a.kind], ohP = 0, ohM = 0, ohT = 0;
    const OH = this.OH[a.c];
    if (OH) for (const [key, c] of Object.entries(OH)) {
      if (!this.ohOn(a, key)) continue;
      const d = this.skillDmg(a, key, v); if (!d) continue;
      const n = A.as * c.e * Math.max(1, this.AUTO[a.kind]);                  // 평타 횟수 (원딜 보정 배율은 그대로)
      ohP += (d.p || 0) * n; ohM += (d.m || 0) * n; ohT += (d.t || 0) * n;
      if (c.rep) auto = 0;                                                    // 병사 · Q가 평타를 대신한다
    }
    const oom = A.mpMax && (a.mpCur ?? A.mpMax) < A.mpMax * .1;
    const spell = this.SPELL_K * this.SPELL[a.kind] * (9 * a.lvl + .6 * A.ap + .35 * A.bonusAD + 20) * (oom ? .35 : 1);   // 스킬 피해는 이제 스킬을 쓸 때 실제로 (Kits.deal) — 여기는 패시브 · 자잘한 효과 몫만
    const ao = A.aoB ? A.aoB * V.maxHP * (A.as * this.AUTO[a.kind] + .35) : 0;   // 총공세: 평타마다 + 스킬 몇 번
    const phys = auto + ao + ohP + spell * (1 - A.magic), mag = spell * A.magic + ohM;
    const ea = Math.max(0, V.arm * (1 - A.armPen) - A.leth), em = Math.max(0, V.mr * (1 - A.mpenP) - A.mpen);
    return (phys * 100 / (100 + ea) + mag * 100 / (100 + em) + ohT) / V.maxHP;
  },
  // 평타 사거리 → 맵 % (맵 가로 약 14,900 = 100%). 아이콘 몸집(서로 닿는 거리 약 3.6)을 더한 실제 거리
  //  근접 125 → 3.6 · 175 → 3.9 · 원딜 550 → 6.4 · 650 → 7.1. 메이지 · 포킹은 스킬 사거리(중간값의 80%, 최대 1000)
  range(p) {
    const b = this.of(p.c); if (!b) return null;
    let R = b.range;
    if (p.kind === 'mage' || p.kind === 'arti') { const rs = Object.values(b.sk || {}).map(x => x.range).filter(x => x && x > 300 && x < 3000).sort((x, y) => x - y); if (rs.length) R = Math.max(R, Math.min(1000, rs[Math.floor(rs.length / 2)] * .8)); }
    return 3.6 + Math.max(0, R - 125) / 150;
  },
  // 보호막: 그 스킬이 주는 보호막 (받는 사람 최대 체력 대비 비율) · 지속(초). 없으면 null
  shields: {}, fx: {}, dmg: {},
  // 스킬 한 방의 피해 (data/skill-dmg.json, 현재 랭크 · 스탯 · 대상 체력으로): { p 물리, m 마법, t 고정 } (실제 수치)
  skillDmg(p, key, v) {
    const d = (this.dmg[p.c] || {})[key], A = this.now(p), V = this.now(v), b = this.of(p.c); if (!d || !A || !V || !b) return null;
    const rank = key === 'R' ? Math.min(3, Math.max(1, Math.floor((p.lvl - 1) / 5))) : Math.min(5, Math.max(1, Math.ceil(p.lvl / 3.6))), at = x => Array.isArray(x) ? x[Math.min(x.length, rank) - 1] : x;
    const G = this.grow(p.lvl), AO = typeof Kits !== 'undefined' && Kits.allout(p), keep = AO ? 1 / .15 : 1;   // 총공세 중에도 계수용 추가 방어 · 마저는 그대로
    const st = { ap: A.ap, ad: A.ad, bad: A.bonusAD, hp: A.maxHP, bhp: A.maxHP - (b.hp + b.hpL * G), arm: A.arm, barm: Math.max(0, A.arm - (b.arm + b.armL * G)) * keep, bmr: Math.max(0, A.mr - (b.mr + b.mrL * G)) * keep, mp: A.mpMax };
    const tHP = V.maxHP, tCur = Math.max(0, v.hp) * tHP;
    let amt = at(d.b) || 0;
    for (const [val, k, ex] of d.r) {
      let pc = at(val); if (ex) for (const [ek, ev] of Object.entries(ex)) pc += ev / 100 * (st[ek] || 0);
      amt += pc / 100 * (k === 'tmax' ? tHP : k === 'tmiss' ? tHP - tCur : k === 'tcur' ? tCur : (st[k] || 0));
    }
    amt *= d.n || 1;
    return d.t === 'p' ? { p: amt } : d.t === 't' ? { t: amt } : d.t === 'x' ? { p: amt / 2, m: amt / 2 } : { m: amt };
  },
  shield(p, key, to = p) {
    const d = (this.shields[p.c] || {})[key], A = this.now(p), T = this.now(to), b = this.of(p.c); if (!d || !A || !T) return null;
    const rank = key === 'R' ? Math.min(3, Math.max(1, Math.floor((p.lvl - 1) / 5))) : Math.min(5, Math.max(1, Math.ceil(p.lvl / 3.6))), at = v => Array.isArray(v) ? v[Math.min(v.length, rank) - 1] : v;
    const G = this.grow(p.lvl), baseHP = b.hp + b.hpL * G, baseArm = b.arm + b.armL * G, baseMR = b.mr + b.mrL * G;
    const st = { ap: A.ap, ad: A.ad, bad: A.bonusAD, hp: A.maxHP, bhp: A.maxHP - baseHP, arm: A.arm - baseArm, mr: A.mr - baseMR, mp: A.mpMax };
    const amt = at(d.b) + d.r.reduce((a, [v, t]) => a + at(v) / 100 * (st[t] || 0), 0);
    return amt > 0 ? { v: amt / T.maxHP, dur: d.dur } : null;
  },
  // 이동 속도 배율 (345 = 1)
  speed(p) { const s = this.now(p); return s ? s.ms / 345 : 1; },
  // 스킬 소모 (현재 레벨의 랭크)
  cost(p, key) {
    const b = this.of(p.c), s = b && b.sk && b.sk[key]; if (!s || !s.cost || (s.resource && !/MANA/.test(s.resource))) return 0;
    const rank = key === 'R' ? Math.min(3, Math.max(1, Math.floor((p.lvl - 1) / 5))) : Math.min(5, Math.max(1, Math.ceil(p.lvl / 3.6)));
    return s.cost[rank - 1] || s.cost[0] || 0;
  },
  // 스킬 재사용 대기 (초, 현재 랭크)
  cd(p, key) {
    const b = this.of(p.c), s = b && b.sk && b.sk[key]; if (!s || !s.cd) return null;
    const rank = key === 'R' ? Math.min(3, Math.max(1, Math.floor((p.lvl - 1) / 5))) : Math.min(5, Math.max(1, Math.ceil(p.lvl / 3.6)));
    return s.cd[rank - 1] || s.cd[0];
  },
};

// 챔피언별 실제 스탯: 체력 · 방어력 · 마법 저항력 · 공격력 · 공격 속도 · 사거리 · 이동 속도 · 마나 (레벨 성장 + 아이템)
// 데이터: data/champ-base.json · data/item-stats.json (tools/scrape/champ-base.mjs, Riot 게임 파일 기반)
// 한타 피해 = (평타 DPS + 스킬 DPS)를 방어력 · 마저로 줄인 값 ÷ 상대 최대 체력. 엔진의 체력은 0~1 비율 그대로.
const CStats = {
  base: {}, items: {},
  load() {
    if (!this._p) this._p = Promise.all([
      fetch('data/champ-base.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('data/item-stats.json').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([b, i]) => { if (b) this.base = b.champs; if (i) this.items = i.items; });
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
  SPELL: { tank: .5, bruiser: .55, dive: .98, adc: .45, mage: 1.0, arti: .8, ench: .5 },
  AUTO: { tank: .68, bruiser: .82, dive: .9, adc: 1.42, mage: .6, arti: .45, ench: .5 },
  // 지금 스탯 (레벨 · 아이템이 바뀔 때만 다시 계산)
  now(p) {
    const key = p.lvl + '|' + p.inv.map(i => i.n).join(',');
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
    // 스킬 피해 종류 비중 (스킬 데이터의 피해 종류로)
    const dm = Object.values(b.sk || {}).map(x => x.dmg).filter(Boolean), mag = dm.length ? dm.filter(x => /MAGIC/.test(x)).length / dm.length : .5;
    s.magic = mag;
    p._cs = s; p._csk = key; return s;
  },
  // 1초 동안 a가 v에게 주는 피해 (v 최대 체력 대비 비율). 마나가 바닥나면 스킬 피해가 크게 준다
  hit(a, v) {
    const A = this.now(a), V = this.now(v); if (!A || !V) return null;
    const auto = A.ad * A.as * (1 + A.crit * .75) * this.AUTO[a.kind];
    const oom = A.mpMax && (a.mpCur ?? A.mpMax) < A.mpMax * .1;
    const spell = this.SPELL[a.kind] * (9 * a.lvl + .6 * A.ap + .35 * A.bonusAD + 20) * (oom ? .35 : 1);
    const phys = auto + spell * (1 - A.magic), mag = spell * A.magic;
    const ea = Math.max(0, V.arm * (1 - A.armPen) - A.leth), em = Math.max(0, V.mr * (1 - A.mpenP) - A.mpen);
    return (phys * 100 / (100 + ea) + mag * 100 / (100 + em)) / V.maxHP;
  },
  // 평타 사거리 → 맵 % (맵 가로 약 14,900 = 100%). 아이콘 몸집(서로 닿는 거리 약 3.6)을 더한 실제 거리
  //  근접 125 → 3.6 · 175 → 3.9 · 원딜 550 → 6.4 · 650 → 7.1. 메이지 · 포킹은 스킬 사거리(중간값의 80%, 최대 1000)
  range(p) {
    const b = this.of(p.c); if (!b) return null;
    let R = b.range;
    if (p.kind === 'mage' || p.kind === 'arti') { const rs = Object.values(b.sk || {}).map(x => x.range).filter(x => x && x > 300 && x < 3000).sort((x, y) => x - y); if (rs.length) R = Math.max(R, Math.min(1000, rs[Math.floor(rs.length / 2)] * .8)); }
    return 3.6 + Math.max(0, R - 125) / 150;
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

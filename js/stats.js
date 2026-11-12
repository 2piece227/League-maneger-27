// 프로 경기 실데이터 조회 (data/champ-stats.json · data/items.json, tools/scrape/champ-stats.mjs · items.mjs)
// - 챔피언 승률 · 경기 시간대별 승률(파워 커브) · 라인 매치업 · 조합 시너지 · 아이템 빌드 · 소환사 주문
// 표본이 적은 값은 50% 쪽으로 당겨서(수축) 쓴다.
const Stats = {
  champs: {}, mu: {}, syn: {}, items: {}, meta: {},
  K: 12,   // 수축 강도: 12판 분량의 50%를 섞는다
  load() {
    if (!this._p) this._p = Promise.all([
      fetch('data/champ-stats.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('data/items.json').then(r => r.ok ? r.json() : null).catch(() => null),
      Champions.load(),
      fetch('data/draft-model.json').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([s, it, , dm]) => {
      if (dm && typeof Draft !== 'undefined') Draft.M = dm;
      if (s) { this.champs = s.champs; this.mu = s.matchups; this.syn = s.synergy; this.meta = s.meta; }
      if (it) this.items = it.items;
      if (typeof Style !== 'undefined') Style.cache = {};
    });
    return this._p;
  },
  name(c) { const ch = Champions.byId[c]; return ch ? ch.nameEn : c; },
  of(c) { return this.champs[this.name(c)] || null; },
  shrink(w, g, k = this.K) { return (w + k * .5) / (g + k); },
  wr(c) { const x = this.of(c); return x ? this.shrink(x.w, x.g) : .5; },
  // 시간대별 승률 [27분 미만, 27~33분, 33분 이상] (수축)
  curve(c) { const x = this.of(c); return x ? x.len.map(([g, w]) => this.shrink(w, g)) : [.5, .5, .5]; },
  // 라인 매치업: a가 b를 상대로 (같은 포지션)
  matchup(role, a, b) {
    const x = this.mu[`${role}|${this.name(a)}|${this.name(b)}`];
    if (!x) return { g: 0, wr: .5, cs: 0, gd: 0 };
    const [g, w, cs, gd] = x, f = g / (g + 8);
    return { g, wr: this.shrink(w, g, 8), cs: cs * f, gd: gd * f };
  },
  PAIRS: [['BOT', 'SUP'], ['JGL', 'MID'], ['JGL', 'TOP'], ['MID', 'SUP']],
  synergy(r1, c1, r2, c2) {
    for (const [a, b] of this.PAIRS) {
      let x = null;
      if (r1 === a && r2 === b) x = this.syn[`${a}-${b}|${this.name(c1)}|${this.name(c2)}`];
      if (r1 === b && r2 === a) x = this.syn[`${a}-${b}|${this.name(c2)}|${this.name(c1)}`];
      if (x) return { g: x[0], wr: this.shrink(x[1], x[0], 8) };
    }
    return null;
  },
  // 텔레포트를 드는 챔피언인지 (실제 경기 30% 이상)
  tp(c) { const x = this.of(c); if (!x) return false; const t = (x.spells.find(([s]) => /Teleport/.test(s)) || [, 0])[1]; return t / x.g >= .3; },
  it(n) { const x = this.items[n]; return x ? { n, ...x } : null; },
  // 아이템 빌드 (실제로 많이 간 순서)
  // start: 시작 아이템 (라이너 도란 · 정글 펫 · 서폿 세계 지도집), sup: 서폿 퀘스트 완성 아이템, core: 핵심 아이템(신발 포함) 최대 6개
  build(c, role) {
    const x = this.of(c), ch = Champions.byId[c] || { roles: [] };
    const list = x ? x.items.map(([n, cnt]) => ({ n, cnt, ...(this.items[n] || {}) })).filter(i => i.id) : [];
    let start = null, sup = null;
    if (role === 'JGL') start = this.it((ch.roles || []).some(r => ['TANK', 'VANGUARD', 'WARDEN', 'JUGGERNAUT'].includes(r)) ? 'Mosstomper Seedling' : (ch.roles || []).some(r => ['ASSASSIN', 'SKIRMISHER', 'DIVER'].includes(r)) ? 'Gustwalker Hatchling' : 'Scorchclaw Pup');
    else if (role === 'SUP') { start = this.it('World Atlas'); sup = list.find(i => (i.tags || []).includes('GoldPer') && i.depth >= 2) || this.it('Celestial Opposition'); }
    else start = list.find(i => /^Doran|Dark Seal|Cull|Tear/.test(i.n) && i.gold <= 500) || this.it(ch.damageType === 'MAGIC_DAMAGE' ? "Doran's Ring" : (ch.roles || []).includes('MARKSMAN') ? "Doran's Blade" : "Doran's Blade");
    const legend = list.filter(i => i.gold >= 2000 && !i.boots), boots = list.find(i => i.boots && i.gold >= 600) || this.it("Plated Steelcaps");
    const core = legend.slice(0, 5);
    if (boots) core.splice(Math.min(1, core.length), 0, boots);
    return { start, sup, core: core.slice(0, 6), trinket: this.it(role === 'SUP' ? 'Oracle Lens' : 'Stealth Ward'), ward: this.it('Control Ward'), pot: this.it('Health Potion') };
  },
  icon(it) { return it ? `<img class="it-ic" src="assets/items/${it.id}.png" alt="" title="${UI.esc(it.ko || it.n)}">` : ''; },
};

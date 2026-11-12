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
    ]).then(([s, it]) => {
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
  // 아이템 빌드: 시작 아이템 1개 + 핵심 아이템(신발 포함) 최대 6개, 실제로 많이 간 순서
  build(c) {
    const x = this.of(c); if (!x) return { start: null, core: [] };
    const list = x.items.map(([n, cnt]) => ({ n, cnt, ...(this.items[n] || {}) })).filter(i => i.id);
    const start = list.find(i => i.gold <= 500 && i.depth <= 1 && !/Ward|Elixir|Potion/.test(i.n)) || null;
    const legend = list.filter(i => i.gold >= 2000 && !i.boots), boots = list.find(i => i.boots && i.gold >= 600);
    const core = legend.slice(0, 5);
    if (boots) core.splice(Math.min(1, core.length), 0, boots);
    return { start, core: core.slice(0, 6) };
  },
  icon(it) { return it ? `<img class="it-ic" src="assets/items/${it.id}.png" alt="" title="${UI.esc(it.ko || it.n)}">` : ''; },
};

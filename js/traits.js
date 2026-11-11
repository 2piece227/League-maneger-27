// 선수 특성(플레이스타일): data/traits.json 정의 + 부여 규칙
// 효과(fx)는 경기 엔진이 생기면 적용한다. TODO: 기능 연결 — 경기 시뮬레이션·숙련도 성장에 fx 반영
const Traits = {
  defs: [],
  byId: {},
  cfg: null,
  cache: null,

  load() {
    if (!this._p) {
      this._p = Promise.all([
        Mastery.load(),
        fetch('data/traits.json').then(r => r.ok ? r.json() : { traits: [] }).catch(() => ({ traits: [] })),
      ]).then(([, d]) => {
        this.cfg = d;
        this.defs = d.traits || [];
        this.byId = Object.fromEntries(this.defs.map(t => [t.id, t]));
        this.cache = null;
      });
    }
    return this._p;
  },

  // 최근 3시즌 프로 기록 요약 (40판 미만은 표본 부족으로 제외)
  summary(pid) {
    const pool = (Mastery.pools && Mastery.pools[pid]) || [];
    const g = pool.reduce((s, e) => s + e.g, 0);
    if (g < 40) return null;
    const sum = k => pool.reduce((s, e) => s + e[k], 0) / g;
    return {
      deathsLow: -sum('d'),
      killsHigh: sum('k'),
      assistsHigh: sum('a'),
      poolWide: pool.filter(e => e.g >= 3).length,
      oneTrick: Math.max(...pool.map(e => e.g)) / g,
    };
  },

  // 기록 기반 특성: 포지션 안에서 상위 top 비율
  statWinners() {
    const players = Player.all().map(x => x.p).filter(p => p.role !== 'COACH');
    const sums = new Map(players.map(p => [p.id, this.summary(p.id)]).filter(([, s]) => s));
    const out = {};
    this.defs.filter(t => t.auto && t.auto.stat).forEach(t => {
      const a = t.auto;
      const byRole = {};
      players.forEach(p => {
        if (!sums.has(p.id) || (a.roles && !a.roles.includes(p.role))) return;
        (byRole[p.role] ||= []).push(p.id);
      });
      Object.values(byRole).forEach(ids => {
        ids.sort((x, y) => sums.get(y)[a.stat] - sums.get(x)[a.stat]);
        ids.slice(0, Math.max(1, Math.round(ids.length * a.top))).forEach(id => (out[id] ||= []).push(t.id));
      });
    });
    return out;
  },

  build() {
    const c = this.cfg || {}, set = c.set || {}, add = c.add || {}, max = c.max || 3;
    const stat = this.statWinners();
    const map = {};
    Player.all().forEach(({ p }) => {
      if (p.role === 'COACH') return;
      if (set[p.id]) { map[p.id] = set[p.id].filter(id => this.byId[id]); return; }
      const got = [...(stat[p.id] || [])];
      this.defs.forEach(t => {
        const a = t.auto;
        if (!a || a.stat || got.includes(t.id)) return;
        if (a.age) {
          if (!p.age || (a.age.max && p.age > a.age.max) || (a.age.min && p.age < a.age.min)) return;
          if (G.rand(p.id, 'tr:' + t.id) < (a.chance ?? 1)) got.push(t.id);
          return;
        }
        const pr = typeof a.rand === 'number' ? a.rand : (a.rand || {})[p.role] || 0;
        if (G.rand(p.id, 'tr:' + t.id) < pr) got.push(t.id);
      });
      map[p.id] = [...new Set([...got.slice(0, max), ...(add[p.id] || [])])].filter(id => this.byId[id]);
    });
    return map;
  },

  of(pid) {
    if (!this.cfg) return [];
    if (!this.cache) this.cache = this.build();
    return (this.cache[pid] || []).map(id => this.byId[id]);
  },

  // 화면 표시: 아이콘만(목록) / 아이콘+이름(프로필)
  icons(pid) {
    return this.of(pid).map(t => `<i class="tr-ic" title="${UI.esc(t.name)}: ${UI.esc(t.desc)}">${t.icon}</i>`).join('');
  },
  chips(pid, empty = '') {
    const list = this.of(pid);
    if (!list.length) return empty;
    return `<div class="tr-chips">${list.map(t => `<span class="tr-chip" title="${UI.esc(t.desc)}"><i>${t.icon}</i>${UI.esc(t.name)}</span>`).join('')}</div>`;
  },
  rows(pid) {
    const list = this.of(pid);
    if (!list.length) return '<p class="ms-none">특별한 특성이 없습니다.</p>';
    return `<ul class="tr-list">${list.map(t => `<li><i>${t.icon}</i><div><b>${UI.esc(t.name)}</b><span>${UI.esc(t.desc)}</span></div></li>`).join('')}</ul>`;
  },
};

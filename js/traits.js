// 선수 특성(플레이스타일): data/traits.json 정의 + 부여 규칙
// 효과(fx)는 경기 엔진(js/matchsim.js) · 컨디션(js/condition.js) · 숙련도(js/mastery.js)가 읽는다
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
        if (Mastery.pools) Mastery.recalc();     // 특성이 숙련 경험치에 닿는다
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

  // 자동 부여 후보: 포지션 안에서 기준 값 상위 top 비율 (능력치 attr · 프로 기록 stat · 숨은 능력치 hidden)
  val(p, a, sum) {
    if (a.stat) return sum ? sum[a.stat] : null;
    if (a.attr) { const A = p.attributes || {}; for (const g of ['physical', 'macro', 'mental', 'role']) if (A[g] && A[g][a.attr] != null) return A[g][a.attr]; return null; }
    return null;
  },
  ranked() {
    const players = Player.all().map(x => x.p).filter(p => p.role !== 'COACH');
    const sums = new Map(players.map(p => [p.id, this.summary(p.id)]));
    const out = {};
    this.defs.filter(t => t.auto && (t.auto.attr || t.auto.stat)).forEach(t => {
      const a = t.auto, byRole = {};
      players.forEach(p => { if (a.roles && !a.roles.includes(p.role)) return; const v = this.val(p, a, sums.get(p.id)); if (v == null) return; (byRole[p.role] ||= []).push([p.id, v]); });
      Object.entries(byRole).forEach(([role, l]) => {
        l.sort((x, y) => y[1] - x[1]);
        const top = a.top * ((a.roleBoost || {})[role] || 1);
        l.slice(0, Math.max(1, Math.round(l.length * top))).forEach(([id]) => { if (G.rand(id, 'tr:' + t.id) < (a.chance ?? 1)) (out[id] ||= []).push(t.id); });
      });
    });
    return out;
  },

  // 부여: 지정(give) 먼저, 그다음 자동 규칙. 한 사람당 최대 max(3)개. 특성이 없는 선수도 있다
  build() {
    const c = this.cfg || {}, give = c.give || {}, max = c.max || 3, ranked = this.ranked(), map = {};
    Player.all().forEach(({ p }) => {
      if (p.role === 'COACH') return;
      const got = [...(give[p.id] || [])];
      const auto = [...(ranked[p.id] || [])];
      this.defs.forEach(t => {
        const a = t.auto; if (!a || a.attr || a.stat) return;
        if (a.hidden) { const v = ((p.attributes || {}).hidden || {})[a.hidden]; if (v == null || (a.min != null && v < a.min) || (a.max != null && v > a.max)) return; if (G.rand(p.id, 'tr:' + t.id) < (a.chance ?? 1)) auto.push(t.id); return; }
        if (a.age) { if (!p.age || (a.age.max && p.age > a.age.max) || (a.age.min && p.age < a.age.min)) return; if (G.rand(p.id, 'tr:' + t.id) < (a.chance ?? 1)) auto.push(t.id); return; }
        const pr = typeof a.rand === 'number' ? a.rand : (a.rand || {})[p.role] || 0;
        if (G.rand(p.id, 'tr:' + t.id) < pr) auto.push(t.id);
      });
      // 자동 특성은 무작위 순서로 (같은 선수는 항상 같은 순서)
      auto.sort((x, y) => G.rand(p.id, 'ord:' + x) - G.rand(p.id, 'ord:' + y));
      map[p.id] = [...new Set([...got, ...auto])].filter(id => this.byId[id]).slice(0, max);
    });
    return map;
  },
  has(pid, id) { if (!this.cfg) return false; if (!this.cache) this.cache = this.build(); return (this.cache[pid] || []).includes(id); },
  // 이 선수 특성들의 효과 값 (없으면 dflt)
  fx(pid, key, dflt) { if (!this.cfg) return dflt; for (const t of this.of(pid)) if (t.fx && t.fx[key] != null) return t.fx[key]; return dflt; },

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

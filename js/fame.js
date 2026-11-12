// 평판: 선수 평판(0~100) · 팀 평판(0~100) · 연봉 계산
// 기준: 문서 "LM 27 연봉·평판·팀 명성 체계" → data/reputation.json (수동) + data/reputation-auto.json (tools/rep-auto.py)
// 연봉 = 실력 연봉(OVR) × 평판 배수. 평판 배수는 리그 인기 계수를 곱한 평판으로 계산한다.
const Fame = {
  cfg: { teams: {}, players: {}, adjust: {}, icon: [], leagueCoef: {}, leagueCap: {} },
  auto: {},
  ICON_REP: 300,                       // 종목 간판: 연봉 계산 때만 이 평판을 쓴다
  TITLES: [[90, '세계적인 선수'], [75, '국제적으로 알려짐'], [55, '리그 전역에 알려짐'], [35, '팀 팬층에 알려짐'], [15, '하부 리그에 알려짐'], [0, '무명']],
  TEAM_TITLES: [[95, '세계적인 명문'], [85, '국제 강호'], [70, '리그 강호'], [55, '리그 중견'], [0, '하위권']],

  load(r, a) {
    this.cfg = { ...this.cfg, ...(r || {}) };
    this.auto = (a && a.players) || {};
  },

  // ---------- 팀 ----------
  team(t) { return t ? (t.fame != null ? t.fame : this.cfg.teams[t.id] != null ? this.cfg.teams[t.id] : 50) : 50; },
  // 기존 별(1~5) 자리: 95+ 5 · 85+ 4 · 70+ 3 · 55+ 2 · 그 아래 1
  stars(f) { return f >= 95 ? 5 : f >= 85 ? 4 : f >= 70 ? 3 : f >= 55 ? 2 : 1; },
  teamTitle(f) { return this.TEAM_TITLES.find(([n]) => f >= n)[1]; },

  // ---------- 선수 ----------
  icon(p) { return !!p && this.cfg.icon.includes(p.id); },
  player(p) {
    if (!p) return 0;
    const s = (App.state && App.state.fame) || {};
    if (s[p.id] != null) return s[p.id];
    for (const src of [this.cfg.players, this.cfg.adjust, this.auto]) if (src[p.id] != null) return src[p.id];
    // 기준·자동 값이 없는 선수(새 유망주·2군 등): OVR로 하부 리그 수준까지만
    return Math.max(0, Math.min(30, Math.round(((p.ovr || 60) - 60) * .9)));
  },
  title(p) { return this.icon(p) ? '종목 스타' : this.TITLES.find(([n]) => this.player(p) >= n)[1]; },
  // 프로필 등에 붙이는 표기: "85 · 국제적으로 알려짐"
  label(p) { return `${this.player(p)} · ${this.title(p)}`; },

  // ---------- 연봉 ----------
  // 실력 연봉(억): OVR 60 이하 6천만 원 ~ OVR 99 27억, OVR 1당 약 10%
  skillPay(ovr) { return Math.max(.6, .6 * Math.exp(.0976 * ((ovr || 60) - 60))); },
  // 평판 배수: 1 + 0.29 × (평판/100)^1.5 → 평판 100 = 1.29배, 종목 간판(300) = 2.5배
  mult(p, league) {
    const r = (this.icon(p) ? this.ICON_REP : this.player(p)) * (this.cfg.leagueCoef[league] || 1);
    return 1 + .29 * Math.pow(Math.max(0, r) / 100, 1.5);
  },
  pay(p, league) { return this.skillPay(p.ovr) * this.mult(p, league); },
  // 명문 할인: 팀 평판이 선수 평판보다 10 높을 때마다 요구 연봉 3% 할인, 최대 20%
  discount(t, p) { return Math.min(.2, Math.max(0, (this.team(t) - (this.icon(p) ? 100 : this.player(p))) / 10 * .03)); },
};

// 평판: 선수 평판(0~100) · 팀 평판(0~100) · 연봉 계산
// 기준: 문서 "LM 27 연봉·평판·팀 명성 체계" → data/reputation.json (수동) + data/reputation-auto.json (tools/rep-auto.py)
// 연봉 = 실력 연봉(OVR) × 평판 배수. 평판 = 인지도 + 프랜차이즈 점수(지금 팀 근속, data/tenures.json).
// reputation.json의 선수 값은 asOf 날짜의 합계라서, 인지도 = 그 값 − 그날의 프랜차이즈 점수로 거꾸로 구한다.
const Fame = {
  cfg: { teams: {}, players: {}, adjust: {}, icon: [], leagueCap: {},
    salary: { top: 20, curve: .0976, floor: .6, repA: .45, iconRep: 300, cap: {} },
    franchise: { perYear: 3, max: 15, asOf: '2026-11-12' } },
  auto: {}, join: {},
  TITLES: [[90, '세계적인 선수'], [75, '국제적으로 알려짐'], [55, '리그 전역에 알려짐'], [35, '팀 팬층에 알려짐'], [15, '하부 리그에 알려짐'], [0, '무명']],
  TEAM_TITLES: [[95, '세계적인 명문'], [85, '국제 강호'], [70, '리그 강호'], [55, '리그 중견'], [0, '하위권']],

  load(r, a, tn) {
    this.cfg = { ...this.cfg, ...(r || {}) };
    this.auto = (a && a.players) || {};
    this.join = (tn && tn.join) || {};
  },

  // ---------- 팀 ----------
  team(t) { return t ? (t.fame != null ? t.fame : this.cfg.teams[t.id] != null ? this.cfg.teams[t.id] : 50) : 50; },
  // 기존 별(1~5) 자리: 95+ 5 · 85+ 4 · 70+ 3 · 55+ 2 · 그 아래 1
  stars(f) { return f >= 95 ? 5 : f >= 85 ? 4 : f >= 70 ? 3 : f >= 55 ? 2 : 1; },
  teamTitle(f) { return this.TEAM_TITLES.find(([n]) => f >= n)[1]; },

  // ---------- 선수 ----------
  icon(p) { return !!p && this.cfg.icon.includes(p.id); },
  // 지금 팀 입단일: 게임 중 옮겼으면 그 계약일, 아니면 실제 기록
  joined(p) {
    if (!p || p.free) return null;
    if (p._o && p._o.team !== p.team) { const c = Contract.st().contracts[p.id]; return (c && c.signed) || Clock.today(); }
    return this.join[p.id] || null;
  },
  // 프랜차이즈 점수: 지금 팀에서 뛴 1년마다 +3, 최대 +15
  franchise(p, date) {
    const j = this.joined(p), F = this.cfg.franchise;
    if (!j || p.level === 'cl' || p.level === 'academy') return 0;
    const yrs = Math.max(0, Fmt.daysBetween(j, date || Clock.today()) / 365);
    return Math.min(F.max, Math.round(yrs * F.perYear));
  },
  // 인지도: 기준·자동 값(asOf 날 합계)에서 그날의 프랜차이즈 점수를 뺀 값
  known(p) {
    for (const src of [this.cfg.players, this.cfg.adjust, this.auto]) if (src[p.id] != null) {
      const j = this.join[p.id], F = this.cfg.franchise;
      const then = j && p.level !== 'cl' && p.level !== 'academy' ? Math.min(F.max, Math.round(Math.max(0, Fmt.daysBetween(j, F.asOf) / 365) * F.perYear)) : 0;
      return src[p.id] - then;
    }
    // 기준·자동 값이 없는 선수(새 유망주·2군 등): OVR로 하부 리그 수준까지만
    return Math.max(0, Math.min(30, Math.round(((p.ovr || 60) - 60) * .9)));
  },
  player(p) {
    if (!p) return 0;
    const s = (App.state && App.state.fame) || {};
    if (s[p.id] != null) return s[p.id];
    return Math.max(0, Math.min(100, this.known(p) + this.franchise(p)));
  },
  title(p) { return this.icon(p) ? '종목 스타' : this.TITLES.find(([n]) => this.player(p) >= n)[1]; },
  // 프로필 등에 붙이는 표기: "100 · 세계적인 선수 (프랜차이즈 +13)"
  label(p) { const f = this.franchise(p); return `${this.player(p)} · ${this.title(p)}${f ? ` <small class="cr-dim">(인지도 ${Math.round(this.known(p))} + 프랜차이즈 ${f})</small>` : ''}`; },

  // ---------- 연봉 ----------
  // 실력 연봉(억): OVR 99 = 20억, OVR 1당 약 10%, 최저 6천만 원
  skillPay(ovr) { const S = this.cfg.salary; return Math.max(S.floor, S.top * Math.exp(S.curve * ((ovr || 60) - 99))); },
  // 평판 배수: 1 + 0.45 × (평판/100)^1.5 → 평판 100 = 1.45배, 종목 간판(평판 300) = 3.34배
  mult(p) {
    const S = this.cfg.salary, r = this.icon(p) ? S.iconRep : this.player(p);
    return 1 + S.repA * Math.pow(Math.max(0, r) / 100, 1.5);
  },
  // 리그 개인 연봉 상한 (LPL 20억)
  cap(league) { return this.cfg.salary.cap[league] || Infinity; },
  pay(p, league) { return Math.min(this.cap(league), this.skillPay(p.ovr) * this.mult(p)); },
  // 명문 할인: 팀 평판이 선수 평판보다 10 높을 때마다 요구 연봉 3% 할인, 최대 20%
  discount(t, p) { return Math.min(.2, Math.max(0, (this.team(t) - (this.icon(p) ? 100 : this.player(p))) / 10 * .03)); },
};

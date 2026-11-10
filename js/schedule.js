// 시즌 일정: 2026 실제 리그 일정(data/season-template.json)을 364일(요일 유지) 밀어 2027 시즌으로 쓴다.
// 시각은 모두 한국 시간(KST) 문자열 "YYYY-MM-DDTHH:MM" 로 다룬다.
// - 정규 시즌: 실제 대진 그대로 (게임에 없는 팀 경기는 수집 단계에서 제외)
// - 플레이오프·국제대회: 진출팀이 정해지기 전이라 미정(TBD)
const Schedule = {
  SHIFT_DAYS: 364,
  YEAR: 2027,
  events: [],
  matches: [],

  KIND: {
    stove: ['스토브리그', 'stove'], regular: ['정규 시즌', 'reg'], playoffs: ['플레이오프', 'po'],
    intl: ['국제대회', 'intl'], event: ['이벤트 대회', 'evt'],
  },
  LEAGUE_KO: { LCK: 'LCK', LPL: 'LPL', LEC: 'LEC', LCS: 'LCS', INTL: '국제' },

  load() {
    if (!this._p) this._p = fetch('data/season-template.json').then(r => r.json()).then(d => this.build(d)).catch(e => {
      console.warn('[schedule] 일정 없음', e);
    });
    return this._p;
  },

  // UTC ISO → KST "YYYY-MM-DDTHH:MM" (+364일)
  kst(iso, shift = this.SHIFT_DAYS) {
    const d = new Date(new Date(iso).getTime() + 9 * 36e5 + shift * 864e5);
    return d.toISOString().slice(0, 16);
  },
  shiftDate(ymd) { return ymd ? this.kst(ymd + 'T00:00:00Z').slice(0, 10) : null; },

  build(d) {
    this.events = d.events.map(e => ({
      ...e, name: e.name, start: this.shiftDate(e.start), end: this.shiftDate(e.end), slots: undefined,
      short: e.league === 'INTL' || e.name.startsWith(e.league) || e.kind === 'event' ? e.name : e.league + ' ' + e.name,
    }));
    // 스토브리그: 지금부터 첫 공식 경기 전날까지
    const first = this.events.filter(e => e.kind !== 'event').map(e => e.start).sort()[0];
    this.events.unshift({ id: 'stove', league: 'ALL', name: '스토브리그', label: '2027 스토브리그 · FA 시장', kind: 'stove', start: '2026-11-15', end: this.addDays(first, -1) });
    // 실제 2026 월즈 결승은 그대로 (지금 진행 중)
    const w26 = d.events.find(e => e.id === 'worlds');
    if (w26) this.events.unshift({ id: 'worlds-2026', league: 'INTL', name: '월드 챔피언십', label: '월드 챔피언십 2026', kind: 'intl', start: w26.start, end: w26.end, past: true });

    let n = 0;
    this.matches = d.events.flatMap(e => e.slots.map(s => ({
      id: 'm' + (n++), event: e.id, league: e.league, kind: e.kind, t: this.kst(s.t), bo: s.bo, tab: s.tab,
      t1: s.t1, t2: s.t2, // TODO: 기능 연결 — 경기 시뮬레이션 결과(score, winner)
    }))).sort((a, b) => a.t.localeCompare(b.t));
    this.events.forEach(e => { e.short = e.short || e.name; e.label = e.label || `${e.short} ${this.YEAR}`; });
    this.byEvent = Object.fromEntries(this.events.map(e => [e.id, e]));
  },

  addDays(ymd, n) { const d = Fmt.parse(ymd); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },

  team(id) { return id ? App.db.teams.find(t => t.id === id) : null; },
  eventOf(m) { return this.byEvent[m.event]; },
  forTeam(id) { return this.matches.filter(m => m.t1 === id || m.t2 === id); },
  forLeague(league) { return this.matches.filter(m => m.league === league); },
  next(id, from) { return this.forTeam(id).find(m => m.t.slice(0, 10) >= from); },
  opponent(m, id) { return this.team(m.t1 === id ? m.t2 : m.t1); },
  // 리그 + 국제대회 일정
  eventsFor(league) { return this.events.filter(e => e.league === league || e.league === 'INTL' || e.league === 'ALL'); },
  eventsOn(league, ymd) { return this.eventsFor(league).filter(e => e.start <= ymd && ymd <= e.end); },
};

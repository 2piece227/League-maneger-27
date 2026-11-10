// 시즌 일정 생성기
//
// 틀(실제 2026): 단계별 기간 · 경기 슬롯(날짜·시각·Bo·주차) · 대진 구조(그룹·라운드로빈) · 일정 공개일
// 2027: 틀을 364일(요일 유지) 밀고, 팀은 커리어마다 새로 배치한다.
//   - 독립 단계(LCK컵·1·2라운드·LEC·LCS·LPL 스플릿 1): 실제 구조를 유지한 채 팀을 무작위 재배치
//     → 그룹 구성, 누가 몇 주차에 누구와, 1경기/2경기 순서가 매번 다르다
//   - 의존 단계(LCK 3·4라운드 레전드/라이즈, LPL 스플릿 2·3): 앞 단계 순위로 그룹이 갈리므로 그때까지 미정
//   - 플레이오프·국제대회: 진출팀이 정해질 때까지 미정
// 공개: 실제 2026년에 일정 페이지가 처음 만들어진 날만큼 개막 전에 공개된다. 그 전에는 기간만 보인다.
// 시각은 모두 한국 시간(KST) "YYYY-MM-DDTHH:MM".
const Schedule = {
  SHIFT_DAYS: 364,
  YEAR: 2027,
  events: [],
  all: [],
  seed: null,

  KIND: {
    stove: ['스토브리그', 'stove'], regular: ['정규 시즌', 'reg'], playoffs: ['플레이오프', 'po'],
    intl: ['국제대회', 'intl'], event: ['이벤트 대회', 'evt'],
  },

  load() {
    if (!this._p) this._p = fetch('data/season-template.json').then(r => r.json()).then(d => { this.tpl = d; }).catch(e => console.warn('[schedule] 일정 없음', e));
    return this._p.then(() => this.ensure());
  },

  // 커리어 시드가 바뀌면 다시 만든다
  ensure() {
    if (!this.tpl) return;
    const seed = this.careerSeed();
    if (seed !== this.seed) this.build(this.tpl, seed);
  },
  careerSeed() {
    if (!App.state.seed) {
      const m = App.state.manager || {};
      App.state.seed = `${m.name || 'guest'}:${App.state.teamId || ''}:${m.createdAt || ''}`;
    }
    return App.state.seed;
  },
  today() { return (typeof Portal !== 'undefined' && Portal.data && Portal.data.date) || '2026-11-10'; },

  // UTC ISO → KST "YYYY-MM-DDTHH:MM" (+364일)
  kst(iso, shift = this.SHIFT_DAYS) {
    const d = new Date(new Date(iso).getTime() + 9 * 36e5 + shift * 864e5);
    return d.toISOString().slice(0, 16);
  },
  shiftDate(ymd) { return ymd ? this.kst(ymd.slice(0, 10) + 'T00:00:00Z').slice(0, 10) : null; },
  addDays(ymd, n) { return Store.addDays(ymd, n); },

  rng(key) { return SoloQ.rng(key); },
  shuffle(arr, r) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  },

  build(d, seed) {
    this.seed = seed;
    this.events = d.events.map(e => {
      const start = this.shiftDate(e.start), end = this.shiftDate(e.end);
      const pub = e.published ? this.shiftDate(e.published) : this.addDays(start, -14);
      return {
        id: e.id, league: e.league, name: e.name, kind: e.kind, start, end, pub,
        lead: Fmt.daysBetween(pub, start), dependsOn: e.dependsOn,
        short: e.league === 'INTL' || e.name.startsWith(e.league) || e.kind === 'event' ? e.name : e.league + ' ' + e.name,
      };
    });
    this.events.forEach(e => { e.label = `${e.short} ${this.YEAR}`; });
    // 스토브리그: 2026 월즈 결승 다음 날부터 첫 공식 경기 전날까지
    const first = this.events.filter(e => e.kind !== 'event').map(e => e.start).sort()[0];
    this.events.unshift({ id: 'stove', league: 'ALL', name: '스토브리그', short: '스토브리그', label: '2027 스토브리그 · FA 시장', kind: 'stove', start: '2026-11-15', end: this.addDays(first, -1), pub: '2026-11-15' });
    const w26 = d.events.find(e => e.id === 'worlds');
    if (w26) this.events.unshift({ id: 'worlds-2026', league: 'INTL', name: '월드 챔피언십', short: '월드 챔피언십', label: '월드 챔피언십 2026', kind: 'intl', start: w26.start, end: w26.end, pub: w26.start, past: true });
    this.byEvent = Object.fromEntries(this.events.map(e => [e.id, e]));

    let n = 0;
    this.all = [];
    for (const e of d.events) {
      // 이 단계의 팀 재배치 (리그별, 단계마다 새로 추첨)
      const ids = App.db.teams.filter(t => t.league === e.league).map(t => t.id).sort();
      const perm = this.shuffle(ids, this.rng(`perm:${seed}:${e.id}`));
      const map = tok => {
        if (!tok) return null;
        if (tok.startsWith('X:')) return false;           // 게임에 없는 팀 → 경기 제외
        if (tok.startsWith('S:')) return null;            // 앞 단계 순위 확정 전 (TODO: 기능 연결 — 순위표로 채우기)
        const i = ids.indexOf(tok.slice(2));
        return i < 0 ? null : perm[i];
      };
      for (const s of e.slots) {
        const t1 = map(s.a), t2 = map(s.b);
        if (t1 === false || t2 === false) continue;
        this.all.push({
          id: 'm' + (n++), event: e.id, league: e.league, kind: e.kind, t: this.kst(s.t), bo: s.bo, tab: s.tab,
          t1, t2, group: s.g || null, seeds: s.a && s.a.startsWith('S:') ? [+s.a.slice(2), +s.b.slice(2)] : null,
          // TODO: 기능 연결 — 경기 시뮬레이션 결과(score, winner)
        });
      }
    }
    this.all.sort((a, b) => a.t.localeCompare(b.t));
    // 같은 날 같은 대회 안에서 1경기·2경기 …
    const byDay = {};
    this.all.forEach(m => { (byDay[m.event + m.t.slice(0, 10)] ||= []).push(m); });
    Object.values(byDay).forEach(list => list.forEach((m, i) => { m.order = i + 1; m.ofDay = list.length; }));
  },

  // ---------- 공개 여부 ----------
  released(e, today = this.today()) { return !!e && (e.past || today >= e.pub); },
  // 공개된 경기만
  get matches() { const t = this.today(); return this.all.filter(m => this.released(this.byEvent[m.event], t)); },
  releaseText(e, today = this.today()) {
    if (e.kind === 'stove' || e.past) return '';
    const d = `${+e.pub.slice(5, 7)}월 ${+e.pub.slice(8, 10)}일`;
    return this.released(e, today) ? `일정 공개 ${d}` : `일정 발표 예정 ${d}경`;
  },
  // 다음에 일정이 공개될 리그 단계
  nextRelease(league, today = this.today()) {
    return this.eventsFor(league).filter(e => !e.past && e.kind !== 'stove' && !this.released(e, today) && (e.league === league || e.league === 'INTL'))
      .sort((a, b) => a.pub.localeCompare(b.pub))[0] || null;
  },

  team(id) { return id ? App.db.teams.find(t => t.id === id) : null; },
  eventOf(m) { return this.byEvent[m.event]; },
  forTeam(id) { return this.matches.filter(m => m.t1 === id || m.t2 === id); },
  forLeague(league) { return this.matches.filter(m => m.league === league); },
  next(id, from) { return this.forTeam(id).find(m => m.t.slice(0, 10) >= from); },
  opponent(m, id) { return this.team(m.t1 === id ? m.t2 : m.t1); },
  orderLabel(m) { return m.ofDay > 1 ? `${m.order}경기` : ''; },
  // 리그 + 국제대회 일정
  eventsFor(league) { return this.events.filter(e => e.league === league || e.league === 'INTL' || e.league === 'ALL'); },
  eventsOn(league, ymd) { return this.eventsFor(league).filter(e => e.start <= ymd && ymd <= e.end); },
  // 리그의 첫 공식 대회
  firstEvent(league) { return this.events.filter(e => e.league === league && e.kind !== 'event').sort((a, b) => a.start.localeCompare(b.start))[0]; },
};

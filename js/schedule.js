// 시즌 일정 생성기 (연도 고정값 없음)
//
// 틀(실제 기준 연도, 지금은 2026): 단계별 기간 · 경기 슬롯(날짜·시각·Bo·주차) · 대진 구조 · 일정 공개일
// 시즌 Y: 틀을 "Y년 같은 날짜에 가장 가까운 같은 요일"로 옮긴다 (이동 폭은 항상 7의 배수).
//   → 요일은 실제와 같고, 날짜는 실제에서 최대 ±3일. 몇십 년이 지나도 밀리지 않는다.
// 팀은 커리어·시즌마다 새로 배치한다.
//   - 독립 단계(LCK컵·1·2라운드·LEC·LCS·LPL 스플릿 1): 실제 구조를 유지한 채 팀을 무작위 재배치
//   - 의존 단계(LCK 3·4라운드 레전드/라이즈, LPL 스플릿 2·3): 앞 단계 순위로 그룹이 갈리므로 그때까지 미정
//   - 플레이오프·국제대회: 진출팀이 정해질 때까지 미정
// 공개: 실제 기준 연도에 일정 페이지가 처음 만들어진 날만큼 개막 전에 공개된다. 그 전에는 기간만 보인다.
// 시즌 Y는 Y-1년 월즈가 끝난 다음 날(스토브리그)부터 Y년 월즈 결승까지.
// 시각은 모두 한국 시간(KST) "YYYY-MM-DDTHH:MM".
const Schedule = {
  events: [],
  all: [],
  key: null,

  KIND: {
    stove: ['스토브리그', 'stove'], regular: ['정규 시즌', 'reg'], playoffs: ['플레이오프', 'po'],
    intl: ['국제대회', 'intl'], event: ['이벤트 대회', 'evt'],
  },

  load() {
    if (!this._p) this._p = fetch('data/season-template.json').then(r => r.json()).then(d => { this.tpl = d; }).catch(e => console.warn('[schedule] 일정 없음', e));
    return this._p.then(() => this.ensure());
  },

  get BASE() { return (this.tpl && this.tpl.meta.baseYear) || Clock.year(Clock.START); },

  // 커리어 시드나 현재 시즌이 바뀌면 다시 만든다 (지금 시즌 + 다음 시즌)
  ensure() {
    if (!this.tpl) return;
    const seed = this.careerSeed(), cur = this.season();
    const key = seed + '|' + cur;
    if (key !== this.key) { this.key = key; this.build(seed, cur); }
  },
  careerSeed() {
    if (!App.state.seed) {
      const m = App.state.manager || {};
      App.state.seed = `${m.name || 'guest'}:${App.state.teamId || ''}:${m.createdAt || ''}`;
    }
    return App.state.seed;
  },
  today() { return Clock.today(); },

  // ---------- 날짜 ----------
  dayNum(ymd) { const [y, m, d] = ymd.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; },
  // 시즌 Y의 이동 폭: 1월 1일 차이를 가장 가까운 주 단위로
  shiftFor(Y) { return Math.round((this.dayNum(`${Y}-01-01`) - this.dayNum(`${this.BASE}-01-01`)) / 7) * 7; },
  // UTC ISO → KST "YYYY-MM-DDTHH:MM" (+shift일)
  kst(iso, shift) { return new Date(new Date(iso).getTime() + 9 * 36e5 + shift * 864e5).toISOString().slice(0, 16); },
  shiftDate(ymd, shift) { return ymd ? this.kst(ymd.slice(0, 10) + 'T00:00:00Z', shift).slice(0, 10) : null; },
  addDays(ymd, n) { return Store.addDays(ymd, n); },
  tplEvent(id) { return this.tpl.events.find(e => e.id === id); },
  // Y년 월즈 결승일 (기준 연도는 실제 날짜)
  // 결승은 유럽·미국 저녁 = 한국 새벽이라, 마지막 경기의 한국 날짜로 잡는다
  worldsEnd(Y) {
    const w = this.tplEvent('worlds');
    if (!w) return `${Y}-11-15`;
    const shift = this.shiftFor(Y), last = w.slots.at(-1);
    const a = this.shiftDate(w.end, shift), b = last ? this.kst(last.t, shift).slice(0, 10) : a;
    return a > b ? a : b;
  },
  // 오늘이 속한 시즌: 아직 결승이 끝나지 않은 첫 시즌 (기준 연도는 실제 역사라 다음 해부터)
  season(today = this.today()) {
    if (!this.tpl) return Clock.year(today) + 1;
    let Y = this.BASE + 1;
    while (today > this.worldsEnd(Y)) Y++;
    return Y;
  },
  // 캘린더로 볼 수 있는 범위
  range() { return [Clock.START.slice(0, 7), this.worldsEnd(this.season() + 1).slice(0, 7)]; },

  rng(key) { return SoloQ.rng(key); },
  shuffle(arr, r) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  },

  build(seed, cur) {
    const tpl = this.tpl;
    this.events = [];
    this.all = [];
    // 기준 연도 대회 중 커리어 시작 시점에 아직 진행 중이던 것(예: 월즈)은 실제 기록으로 표시
    for (const e of tpl.events) {
      if (e.end >= Clock.START && e.start <= Clock.START) this.events.push({ ...this.meta(e, this.BASE, 0), slots: undefined, past: true, pub: e.start });
    }
    for (let Y = this.BASE + 1; Y <= cur + 1; Y++) this.buildSeason(seed, Y);
    this.events.sort((a, b) => a.start.localeCompare(b.start));
    this.byEvent = Object.fromEntries(this.events.map(e => [e.id, e]));
    this.all.sort((a, b) => a.t.localeCompare(b.t));
    // 같은 날 같은 대회 안에서 1경기·2경기 …
    const byDay = {};
    this.all.forEach(m => { (byDay[m.event + m.t.slice(0, 10)] ||= []).push(m); });
    Object.values(byDay).forEach(list => list.forEach((m, i) => { m.order = i + 1; m.ofDay = list.length; }));
  },

  meta(e, Y, shift) {
    const start = this.shiftDate(e.start, shift), end = this.shiftDate(e.end, shift);
    const pub = e.published ? this.shiftDate(e.published, shift) : this.addDays(start, -14);
    const short = e.league === 'INTL' || e.name.startsWith(e.league) || e.kind === 'event' ? e.name : e.league + ' ' + e.name;
    return {
      id: `${Y}:${e.id}`, base: e.id, year: Y, league: e.league, name: e.name, kind: e.kind, start, end, pub,
      lead: Fmt.daysBetween(pub, start), dependsOn: e.dependsOn ? `${Y}:${e.dependsOn}` : null, short, label: `${short} ${Y}`,
    };
  },

  buildSeason(seed, Y) {
    const shift = this.shiftFor(Y);
    const evs = this.tpl.events.map(e => this.meta(e, Y, shift));
    // 스토브리그: 전 시즌 월즈 결승 다음 날 ~ 첫 공식 경기 전날
    const first = evs.filter(e => e.kind !== 'event').map(e => e.start).sort()[0];
    const sStart = this.addDays(this.worldsEnd(Y - 1), 1);
    evs.push({ id: `${Y}:stove`, base: 'stove', year: Y, league: 'ALL', name: '스토브리그', short: '스토브리그', label: `${Y} 스토브리그 · FA 시장`, kind: 'stove', start: sStart, end: this.addDays(first, -1), pub: sStart });
    this.events.push(...evs);

    let n = 0;
    for (const e of this.tpl.events) {
      // 이 단계의 팀 재배치 (리그별, 시즌·단계마다 새로 추첨)
      const ids = App.db.teams.filter(t => t.league === e.league).map(t => t.id).sort();
      const perm = this.shuffle(ids, this.rng(`perm:${seed}:${Y}:${e.id}`));
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
          id: `${Y}-m${n++}`, event: `${Y}:${e.id}`, year: Y, league: e.league, kind: e.kind, t: this.kst(s.t, shift), bo: s.bo, tab: s.tab,
          t1, t2, group: s.g || null, seeds: s.a && s.a.startsWith('S:') ? [+s.a.slice(2), +s.b.slice(2)] : null,
          // TODO: 기능 연결 — 경기 시뮬레이션 결과(score, winner)
        });
      }
    }
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
  // 리그의 다음 공식 대회 (오늘 이후 시작)
  firstEvent(league, today = this.today()) { return this.events.filter(e => e.league === league && e.kind !== 'event' && !e.past && e.start >= today).sort((a, b) => a.start.localeCompare(b.start))[0]; },
  // 시즌 Y의 단계들 (+ 지금 진행 중인 실제 기록)
  seasonEvents(league, Y = this.season()) { return this.eventsFor(league).filter(e => e.year === Y || (e.past && e.end >= this.today())); },
};

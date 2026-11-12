// 새 시즌 경기 결과: 공식 일정(Schedule)의 경기를 치르고 기록한다.
// - 우리 경기: 밴픽 준비 → 관전으로 직접 치른다. 경기일을 그냥 넘기면 코치가 대신 치른다(자동).
// - 다른 팀 경기: 경기일이 지나면 양 팀 코치 밴픽 + 경기 엔진으로 결과를 만든다.
// 결과는 App.state.season[경기 id] = { s1, s2, w, games } 로 저장하고, Results.list 에 붙여 경기 기록·순위표·폼에 쓴다.
const Season = {
  st() { return (App.state.season ||= {}); },
  gameResult(g) {
    return { win: g.side[g.over.win].t.id, side: g.over.win, t: g.t, kills: { B: g.side.B.kills, R: g.side.R.kills }, mvp: g.over.mvp.p.id,
      teams: { B: g.side.B.t.id, R: g.side.R.t.id }, stats: g.pl.map(p => [p.p.id, p.c, p.k, p.d, p.a, Math.round(p.cs)]) };
  },
  seriesScore(series) { const sc = {}; series.games.forEach(x => { if (x.result) sc[x.result.win] = (sc[x.result.win] || 0) + 1; }); return sc; },
  seriesOver(series) { const need = Math.ceil((series.bo || 1) / 2); return Object.values(this.seriesScore(series)).some(v => v >= need); },
  // 시리즈를 끝까지 자동으로 (이미 치른 세트는 그대로 두고 이어서)
  autoSeries(m, series) {
    series ||= { key: m.id, bo: m.bo || 1, games: [] };
    series.games = series.games.filter(x => x.result);
    let guard = 0;
    while (!this.seriesOver(series) && guard++ < 7) {
      const last = series.games[series.games.length - 1];
      // 1세트는 t1이 블루, 이후에는 진 팀이 블루
      const blue = !last ? m.t1 : last.result.win === m.t1 ? m.t2 : m.t1, red = blue === m.t1 ? m.t2 : m.t1;
      const us = App.state.teamId === blue ? 'B' : App.state.teamId === red ? 'R' : null;
      const S = Draft.make({ series, teams: { B: blue, R: red }, us, mode: 'delegate', official: true });
      Draft.auto(S);
      const g = Sim.create(S, S.game); let n = 0; while (!g.over && n++ < 400) Sim.step(g);
      series.games[series.games.length - 1].result = this.gameResult(g);
    }
    return series;
  },
  // 경량 시뮬 (다른 팀끼리의 경기): 주전 평균 OVR + 코치 + 그날 컨디션으로 세트 승패만 빠르게 정한다
  power(t) { const l = Draft.lineup(t).filter(Boolean); return (l.reduce((a, p) => a + (p.ovr || 60), 0) / (l.length || 1)) - (5 - l.length) * 4 + (Draft.coach(t).r - 10) * .25; },
  lightSeries(m) {
    const r = Sim.rng((App.state.seed || '') + ':light:' + m.id), t1 = Schedule.team(m.t1), t2 = Schedule.team(m.t2);
    const p1 = this.power(t1) + (r() - .5) * 5, p2 = this.power(t2) + (r() - .5) * 5, series = { key: m.id, bo: m.bo || 1, games: [] };
    let guard = 0;
    while (!this.seriesOver(series) && guard++ < 7) {
      const w1 = r() < 1 / (1 + Math.exp(-(p1 - p2 + (r() - .5) * 4) / 8)), win = w1 ? m.t1 : m.t2, wt = w1 ? t1 : t2;
      const kw = 10 + Math.floor(r() * 14), kl = Math.floor(r() * kw * .8), mvp = Draft.lineup(wt).filter(Boolean)[Math.floor(r() * 5)] || {};
      series.games.push({ game: series.games.length + 1, picks: { B: [], R: [] }, result: { win, side: w1 ? 'B' : 'R', t: 1500 + Math.floor(r() * 900), kills: { B: w1 ? kw : kl, R: w1 ? kl : kw }, mvp: mvp.id || null, teams: { B: m.t1, R: m.t2 }, stats: [] } });
    }
    return series;
  },
  recordSeries(id, series) {
    const m = Schedule.all.find(x => x.id === id); if (!m || this.st()[id]) return;
    const sc = this.seriesScore(series), s1 = sc[m.t1] || 0, s2 = sc[m.t2] || 0;
    this.st()[id] = { s1, s2, w: s1 > s2 ? 1 : 2, games: series.games.filter(x => x.result).map(x => ({ win: x.result.win, t: x.result.t, k: x.result.kills, mvp: x.result.mvp, teams: x.result.teams, picks: { B: (x.picks.B || []).map(p => p.c), R: (x.picks.R || []).map(p => p.c) } })) };
    this.inject();
    const my = App.state.teamId, t1 = Schedule.team(m.t1), t2 = Schedule.team(m.t2);
    if (m.t1 === my || m.t2 === my) {
      const won = (m.t1 === my) === (s1 > s2), ev = Schedule.eventOf(m);
      Market.post(`[결과] ${t1.short} ${s1}:${s2} ${t2.short}`, `${ev ? ev.label : ''} ${t1.name}와 ${t2.name}의 경기가 ${s1}:${s2}로 끝났습니다.`, null);
      if (typeof Inbox !== 'undefined') Inbox.push({ from: { name: '코칭스태프', role: 'coach' }, subject: `${won ? '승리' : '패배'} — ${t1.short} ${s1}:${s2} ${t2.short}`, link: 'match-history', body: `${ev ? ev.label + ' ' : ''}경기를 ${s1}:${s2}로 ${won ? '이겼습니다' : '졌습니다'}.` });
    }
  },
  // 경기일이 지난 경기 처리 (하루에 많아야 수십 경기)
  process(today) {
    if (!App.db || !Schedule.all || !Champions.list || !Mastery.pools) return;
    const my = App.state.teamId;
    Schedule.all.filter(m => m.t1 && m.t2 && m.t.slice(0, 10) < today && !this.st()[m.id]).forEach(m => {
      const plan = (App.state.plans || {})[m.id], mine = m.t1 === my || m.t2 === my;
      // 우리 경기를 직접 치르지 않고 넘겼으면 코치가 정식 엔진으로 대신 치른다. 나머지는 경량 시뮬
      const series = mine ? this.autoSeries(m, plan ? plan.series : null) : this.lightSeries(m);
      this.recordSeries(m.id, series);
    });
  },
  // Results.list = 지난 시즌 실제 기록 + 새 시즌 결과
  inject() {
    if (!Results.list) return;
    Results._base ||= Results.list.slice();
    const cur = Schedule.all.filter(m => this.st()[m.id]).map(m => { const r = this.st()[m.id], e = Schedule.eventOf(m); return { e: m.event, league: m.league, t1: m.t1, t2: m.t2, s1: r.s1, s2: r.s2, w: r.w, tab: m.tab || '', kst: Schedule.kst ? m.t : m.t, cur: true, n1: (Schedule.team(m.t1) || {}).name, n2: (Schedule.team(m.t2) || {}).name, evName: e ? e.label : m.event }; });
    Results.list = Results._base.concat(cur);
  },
};

// Results 보강: 새 시즌 대회 이름 · 정규 시즌 목록
(() => {
  const load = Results.load.bind(Results);
  Results.load = () => load().then(() => Season.inject());
  const ev = Results.ev.bind(Results);
  Results.ev = id => (Results.meta.events || {})[id] || (Schedule.byEvent && Schedule.byEvent[id] ? { name: Schedule.byEvent[id].label, league: Schedule.byEvent[id].league, kind: Schedule.byEvent[id].kind } : ev(id));
  const reg = Results.regularEvents.bind(Results);
  Results.regularEvents = league => {
    const cur = Object.values(Schedule.byEvent || {}).filter(e => e.league === league && e.kind === 'regular' && e.year === Schedule.season()).map(e => e.id).filter(id => Results.list.some(m => m.e === id));
    return cur.length ? cur : reg(league);
  };
})();

Engine.on(today => { Season.process(today); });

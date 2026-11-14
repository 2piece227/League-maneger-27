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
  seriesOver(series) { if (series.fixed) return series.games.filter(x => x.result).length >= series.fixed; const need = Math.ceil((series.bo || 1) / 2); return Object.values(this.seriesScore(series)).some(v => v >= need); },
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
      const g = Sim.create(S, S.game); let n = 0; while (!g.over && n++ < 4000) Sim.step(g);
      series.games[series.games.length - 1].result = this.gameResult(g);
    }
    return series;
  },
  // 경량 시뮬 (다른 팀끼리의 경기): 주전 평균 OVR + 코치 + 그날 컨디션으로 세트 승패만 빠르게 정한다
  power(t) { const l = Draft.lineup(t).filter(Boolean), C = typeof Cond !== 'undefined'; return (l.reduce((a, p) => a + (p.ovr || 60) + (C ? Cond.ovr(p) : 0), 0) / (l.length || 1)) - (5 - l.length) * 4 + (Draft.coach(t).r - 10) * .25 + (C ? Cond.team(t, l) : 0); },
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
  // 오늘 아직 치르지 않은 우리 경기
  today() { const my = App.state.teamId, d = Clock.today(); return Schedule.matches.find(m => (m.t1 === my || m.t2 === my) && m.t1 && m.t2 && m.t.slice(0, 10) === d && !this.st()[m.id]) || null; },
  // 경기를 코치에게 맡기고 결과만 (이미 치른 세트는 그대로 두고 남은 세트를 정식 엔진으로)
  delegate(m) {
    const plan = (App.state.plans || {})[m.id], d = App.state.draft;
    const series = this.autoSeries(m, plan ? plan.series : d && d.series && d.series.key === m.id ? d.series : null);
    this.recordSeries(m.id, series);
    if (App.state.draft && App.state.draft.series && App.state.draft.series.key === m.id) App.state.draft = null;
    return series;
  },
  recordSeries(id, series) {
    const m = Schedule.all.find(x => x.id === id); if (!m || this.st()[id]) return;
    const sc = this.seriesScore(series), s1 = sc[m.t1] || 0, s2 = sc[m.t2] || 0;
    this.st()[id] = { t1: m.t1, t2: m.t2, s1, s2, w: s1 > s2 ? 1 : 2, games: series.games.filter(x => x.result).map(x => ({ win: x.result.win, t: x.result.t, k: x.result.kills, mvp: x.result.mvp, teams: x.result.teams, picks: { B: (x.picks.B || []).map(p => p.c), R: (x.picks.R || []).map(p => p.c) } })) };
    this.rate(series, m);
    if (typeof Cond !== 'undefined') Cond.after(m, series);
    if (typeof Talk !== 'undefined') Talk.after(m, series);
    this.resolve();
    this.inject();
    const my = App.state.teamId, t1 = Schedule.team(m.t1), t2 = Schedule.team(m.t2);
    if ((m.t1 === my || m.t2 === my) && !App.state.unemployed) {
      const won = (m.t1 === my) === (s1 > s2), ev = Schedule.eventOf(m);
      Market.post(`[결과] ${t1.short} ${s1}:${s2} ${t2.short}`, `${ev ? ev.label + ' ' : ''}${Sim.josa(t1.name, '과', '와')} ${t2.name}의 경기가 ${Sim.josa(`${s1}:${s2}`, '으로', '로')} 끝났습니다.`, null);
      // 결과 메시지 시각: 오늘 경기면 경기 시작 + 세트당 약 50분, 지난 경기를 오늘 처리하면 아침
      const end = m.t.slice(0, 10) === Clock.today() ? Math.min(23 * 60 + 50, +m.t.slice(11, 13) * 60 + +m.t.slice(14, 16) + (s1 + s2) * 50) : 8 * 60, time = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
      if (typeof Inbox !== 'undefined') Inbox.push({ time, from: { name: '코칭스태프', role: 'coach' }, subject: `${won ? '승리' : '패배'} — ${t1.short} ${s1}:${s2} ${t2.short}`, link: 'match-history', body: `${ev ? ev.label + ' ' : ''}경기를 ${s1}:${s2}로 ${won ? '이겼습니다' : '졌습니다'}.` });
    }
  },
  // 경기 평점 (1~10): 정식 엔진 경기는 KDA·승패·POG로, 경량 시뮬은 승패와 약간의 편차로. 선수마다 최근 5경기만 둔다
  // 한 경기 평점. 보통 승리 7점대 · 캐리 8~9 · 패배 4~5 (예전 식은 이긴 팀 대부분이 10점 상한에 걸렸다)
  rating(k, d, a, won, mvp) { return 5.5 + (won ? .5 : -.4) + k * .22 + a * .09 - d * .3 + (mvp ? .7 : 0); },
  rate(series, m) {
    const R = (App.state.ratings ||= {}), push = (id, v) => { if (!id) return; const l = R[id] ||= []; l.push(Math.round(Math.max(3, Math.min(10, v)) * 10) / 10); if (l.length > 5) l.shift(); };
    series.games.forEach((x, gi) => {
      const res = x.result; if (!res) return;
      if (res.stats && res.stats.length) res.stats.forEach(([pid, , k, d, a]) => { const t = Player.find(pid), won = t && t.t.id === res.win; push(pid, Season.rating(k, d, a, won, res.mvp === pid)); });
      else [m.t1, m.t2].forEach(tid => { const t = Schedule.team(tid); if (!t) return; Draft.lineup(t).forEach((p, i) => { if (p) push(p.id, 6.3 + (tid === res.win ? .6 : -.5) + (G.rand(p.id + m.id + gi, 'rt') - .5) * 2 + (res.mvp === p.id ? .9 : 0)); }); });
    });
  },
  // 경기일이 지난 경기 처리 (하루에 많아야 수십 경기). 결과가 나올 때마다 다음 대진이 채워지므로 날짜순으로 하나씩
  process(today) {
    if (!App.db || !Schedule.all || !Champions.list || !Mastery.pools) return;
    const my = App.state.teamId;
    this.resolve();
    for (let guard = 0; guard < 3000; guard++) {
      const m = Schedule.all.find(m => m.t1 && m.t2 && m.t.slice(0, 10) < today && !this.st()[m.id]); if (!m) break;
      const plan = (App.state.plans || {})[m.id], mine = !App.state.unemployed && (m.t1 === my || m.t2 === my);
      // 우리 경기를 직접 치르지 않고 넘겼으면 코치가 정식 엔진으로 대신 치른다. 나머지는 경량 시뮬
      const series = mine ? this.autoSeries(m, plan ? plan.series : null) : this.lightSeries(m);
      this.recordSeries(m.id, series);
    }
  },

  // ---------- 대진 채우기 ----------
  // 템플릿에 팀이 비어 있는 경기(플레이오프 · 국제대회 · 앞 단계 순위로 갈리는 2단계 정규 시즌)를 순위와 대진 결과로 채운다.
  // - 'S:n' 슬롯: 앞 단계(dependsOn)가 끝나면 그 순위 n위
  // - 빈 슬롯: 라운드(탭)별로, 앞 라운드가 끝나면 살아남은 팀끼리. 진출팀은 정해지는 순간 App.state.brk 에 고정
  // 결과에 팀을 같이 저장하므로 일정을 다시 만들어도(Schedule.build) 같은 대진이 나온다.
  // 진출팀 수 (없으면 경기 수로 추정)
  Q: { 'lck-cup': 8, 'lck-rtm': 4, 'lck-playin': 4, 'lck-po': 6, 'lpl-s1': 2, 'lpl-s1po': 12, 'lpl-s2po': 10, 'lpl-gf': 8, 'lpl-rf': 4, 'lec-versuspo': 8, 'lec-springpo': 6, 'lec-summerpo': 6,
    'lcs-lockin': 8, 'lcs-springpo': 6, 'lcs-summerpo': 6, 'first-stand': 8, msi: 10, ewc: 16, 'worlds-playin': 4, worlds: 16, kespa: 10 },
  INTL: ['LCK', 'LPL', 'LEC', 'LCS', 'LCK', 'LPL', 'LEC', 'LCS', 'LCK', 'LPL'],
  brk() { return (App.state.brk ||= {}); },
  rec(m) { return this.st()[m.id]; },
  pair(m) { const r = this.rec(m); return r && r.t1 ? [r.t1, r.t2] : [m.t1, m.t2]; },
  winner(m) { const r = this.rec(m); if (!r) return null; const [a, b] = this.pair(m); return r.w === 1 ? a : b; },
  loser(m) { const r = this.rec(m); if (!r) return null; const [a, b] = this.pair(m); return r.w === 1 ? b : a; },
  evMatches(id) {
    if (!this._em) { this._em = {}; Schedule.all.forEach(m => { (this._em[m.event] ||= []).push(m); }); }
    return this._em[id] || [];
  },
  pw(id) { return ((this._pw ||= {})[id] ??= this.power(Schedule.team(id) || {})); },
  done(id) { const l = this.evMatches(id); return l.length > 0 && l.every(m => m.dead || this.rec(m)); },
  // 순위 (경기 승 → 세트 득실 → 전력)
  standings(matches, league) {
    const rows = {};
    if (league) App.db.teams.filter(t => t.league === league).forEach(t => { rows[t.id] = { id: t.id, w: 0, l: 0, d: 0 }; });
    matches.forEach(m => {
      const r = this.rec(m); if (!r) return; const [a, b] = this.pair(m);
      [[a, r.s1 - r.s2, r.w === 1], [b, r.s2 - r.s1, r.w === 2]].forEach(([id, d, win]) => { const x = rows[id] ||= { id, w: 0, l: 0, d: 0 }; win ? x.w++ : x.l++; x.d += d; });
    });
    return Object.values(rows).sort((a, b) => b.w - a.w || b.d - a.d || this.pw(b.id) - this.pw(a.id)).map(x => x.id);
  },
  byPower(league) { return App.db.teams.filter(t => t.league === league).map(t => t.id).sort((a, b) => this.pw(b) - this.pw(a)); },
  bracket(id) { return this.evMatches(id).filter(m => m.open && !m.seeds && !m.dead); },
  // 대회 최종 순위: 우승 · 준우승 · 나머지는 승패 (대진이 없으면 순위표)
  ranking(e) {
    const br = this.bracket(e.id);
    if (!br.length) return this.standings(this.evMatches(e.id).filter(m => !m.dead), e.league === 'INTL' ? null : e.league);
    const fin = br.filter(m => this.rec(m)).at(-1), champ = fin && this.winner(fin), ru = fin && this.loser(fin);
    return [champ, ru, ...this.standings(br).filter(id => id !== champ && id !== ru)].filter(Boolean);
  },
  // 리그의 최근 성적 순위 (국제대회 진출용): 그해 date 전에 끝난 마지막 단계의 순위, 나머지는 전력순
  leagueRank(league, Y, date) {
    const e = Schedule.events.filter(x => x.league === league && x.year === Y && ['regular', 'playoffs'].includes(x.kind) && x.end < date && this.done(x.id)).sort((a, b) => a.end.localeCompare(b.end)).at(-1);
    const r = e ? this.ranking(e) : [];
    return [...r, ...this.byPower(league).filter(id => !r.includes(id))];
  },
  // 바로 다음 대회로 이어지는 플레이-인 (같은 리그, 열흘 안에 이어짐. LCK 플레이-인 → 플레이오프, 월즈 플레이-인 → 월즈)
  near(a, b) { return a !== b && /playin/.test(a.base) && a.year === b.year && a.league === b.league && a.end <= b.start && Fmt.daysBetween(a.end, b.start) <= 10; },
  feedOf(e) { return Schedule.events.find(x => this.near(x, e) && this.bracket(x.id).length); },
  feeds(e) { return Schedule.events.find(x => this.near(e, x) && this.bracket(x.id).length); },
  // 진출 후보 순서
  pool(e) {
    const Y = e.year;
    if (e.league === 'INTL') {
      const lists = Object.fromEntries(['LCK', 'LPL', 'LEC', 'LCS'].map(l => [l, this.leagueRank(l, Y, e.start)])), out = [];
      for (let i = 0; out.length < 40 && i < 120; i++) { const x = lists[this.INTL[i % this.INTL.length]].shift(); if (x && !out.includes(x)) out.push(x); }
      return out;
    }
    if (e.kind === 'event') return this.byPower(e.league);
    const regs = Schedule.events.filter(x => x.league === e.league && x.year === Y && x.kind === 'regular' && x.end <= e.start).sort((a, b) => a.end.localeCompare(b.end));
    const last = regs.at(-1); if (!last) return this.byPower(e.league);
    const src = [last, regs.find(x => x.id === last.dependsOn)].filter(Boolean);
    return this.standings(src.flatMap(x => this.evMatches(x.id).filter(m => !m.dead)), e.league);
  },
  sourcesDone(e) {
    if (e.kind === 'event') return true;
    const before = Schedule.events.filter(x => x.year === e.year && x.kind !== 'event' && x.kind !== 'stove' && !x.past && x.end <= e.start && (e.league === 'INTL' ? x.league !== 'INTL' : x.league === e.league && x.kind === 'regular'));
    return before.every(x => this.done(x.id));
  },
  // 진출팀 (정해지면 고정)
  entrants(e, inEvent) {
    const b = this.brk(); if (b[e.id]) return b[e.id];
    const Q = this.Q[e.base] || Math.min(16, this.bracket(e.id).length + 1);
    let list;
    if (inEvent) {
      const fixed = this.evMatches(e.id).filter(m => !m.open || m.seeds);
      if (!fixed.every(m => m.dead || this.rec(m))) return null;
      list = this.standings(fixed, e.league === 'INTL' ? null : e.league);
    } else {
      const feed = this.feedOf(e), next = this.feeds(e);
      if (feed ? !this.done(feed.id) : !this.sourcesDone(e)) return null;
      if (feed) { const fe = b[feed.id] || [], ch = this.ranking(feed)[0]; list = [...this.pool(feed).filter(id => !fe.includes(id)).slice(0, Q - 1), ch]; }
      else if (next) list = this.pool(e).slice((this.Q[next.base] || 8) - 1);
      else list = this.pool(e);
    }
    list = [...new Set(list.filter(Boolean))].slice(0, Q);
    if (list.length < 2) return null;
    return (b[e.id] = list);
  },
  // 라운드 하나를 채운다: 지기 전까지(L패) 살아남은 팀 중에서. 첫 라운드는 하위 시드부터(상위 시드 부전승), 이후는 덜 치른 팀 → 덜 진 팀, 결승은 최고 성적 둘
  fillRound(round, prev, ents, isFirst, isLast, L) {
    const rec = {}; ents.forEach((id, i) => { rec[id] = { id, seed: i, p: 0, w: 0, l: 0 }; });
    prev.forEach(m => { const w = rec[this.winner(m)], l = rec[this.loser(m)]; if (w) { w.p++; w.w++; } if (l) { l.p++; l.l++; } });
    const cand = Object.values(rec).filter(x => x.l < L), k = round.length;
    let pick;
    if (isLast) pick = cand.sort((a, b) => a.l - b.l || b.w - a.w || a.seed - b.seed).slice(0, 2);
    else if (isFirst && cand.length > 2 * k) pick = cand.sort((a, b) => b.seed - a.seed).slice(0, 2 * k);
    else pick = cand.sort((a, b) => a.p - b.p || a.l - b.l || a.seed - b.seed).slice(0, 2 * Math.min(k, Math.floor(cand.length / 2)));
    pick.sort((a, b) => a.l - b.l || a.seed - b.seed);
    const pairs = [];
    while (pick.length > 1) {
      const a = pick.shift(); let j = pick.length - 1;
      for (let i = pick.length - 1; i >= 0; i--) if (pick[i].l === a.l) { j = i; break; }
      pairs.push([a.id, pick.splice(j, 1)[0].id]);
    }
    round.forEach((m, i) => { if (pairs[i]) { m.t1 = pairs[i][0]; m.t2 = pairs[i][1]; } else m.dead = true; });
  },
  resolve() {
    if (!App.db || !Schedule.all || !Schedule.all.length || !Schedule.events) return;
    this._em = null; this._pw = {};
    const evs = Schedule.events.filter(e => !e.past && e.kind !== 'stove').sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
    for (let pass = 0; pass < 40; pass++) {
      let changed = false;
      for (const e of evs) {
        const l = this.evMatches(e.id);
        // 저장된 결과의 팀이 우선
        l.forEach(m => { const r = this.rec(m); if (r && r.t1 && (!m.t1 || !m.t2)) { m.t1 = r.t1; m.t2 = r.t2; } });
        // 'S:n' → 앞 단계 n위
        const sd = l.filter(m => m.seeds && (!m.t1 || !m.t2) && !m.dead);
        if (sd.length && e.dependsOn && this.done(e.dependsOn)) {
          const rank = this.standings(this.evMatches(e.dependsOn).filter(m => !m.dead), e.league);
          sd.forEach(m => { m.t1 = rank[m.seeds[0] - 1]; m.t2 = rank[m.seeds[1] - 1]; if (!m.t1 || !m.t2) m.dead = true; });
          changed = true;
        }
        // 대진 (라운드 = 탭)
        const br = this.bracket(e.id); if (!br.length) continue;
        const inEvent = l.some(m => !m.open || m.seeds);
        // 라운드: 시간순으로 탭이 바뀔 때마다 새 라운드 (승자조·패자조의 같은 이름 라운드는 따로)
        const rounds = []; [...br].sort((a, b) => a.t.localeCompare(b.t)).forEach(m => { const r = rounds.at(-1); r && r.tab === (m.tab || '') ? r.list.push(m) : rounds.push({ tab: m.tab || '', list: [m] }); });
        for (let i = 0; i < rounds.length; i++) {
          const rd = rounds[i].list.filter(m => !m.dead);
          if (!rd.length || rd.every(m => m.t1 && m.t2)) continue;
          const prev = rounds.slice(0, i).flatMap(r => r.list).filter(m => !m.dead);
          if (!prev.every(m => this.rec(m))) break;
          const ents = this.entrants(e, inEvent); if (!ents) break;
          const n = br.length, Q = ents.length, L = n <= Q - 1 ? 1 : n <= 2 * Q - 1 ? 2 : 3;
          this.fillRound(rd, prev, ents, i === 0, i === rounds.length - 1, L);
          changed = true;
          break;
        }
      }
      if (!changed) break;
    }
    if (Schedule.all.some(m => m.dead)) { Schedule.all = Schedule.all.filter(m => !m.dead); this._em = null; }
    this.champions();
    this._em = null;
  },
  // 우승 소식 (한 번만)
  champions() {
    const c = (App.state.champs ||= {});
    Schedule.events.filter(e => !e.past && e.kind !== 'stove' && !c[e.id] && this.bracket(e.id).length >= 3 && !/playin/.test(e.base) && this.done(e.id)).forEach(e => {
      const id = this.ranking(e)[0], t = Schedule.team(id); if (!t) return;
      c[e.id] = id;
      if (typeof Market !== 'undefined' && Market.post) Market.post(`[우승] ${t.short} ${e.label} 우승`, `${Sim.josa(t.name, '이', '가')} ${e.label} 정상에 올랐습니다.`, null);
      if (id === App.state.teamId && typeof Inbox !== 'undefined') Inbox.push({ from: { name: '구단 사무국', role: 'board' }, subject: `${e.label} 우승!`, link: 'match-history', body: `${e.label} 우승을 축하합니다. 구단 모두가 자랑스러워합니다.` });
    });
  },
  // Results.list = 이 커리어에서 치른 경기만 (실제 지난 시즌 기록은 보여 주지 않는다)
  inject() {
    if (!Results.list) return;
    Results._base ||= Results.list.slice();
    const cur = Schedule.all.filter(m => this.st()[m.id]).map(m => { const r = this.st()[m.id], e = Schedule.eventOf(m); return { e: m.event, league: m.league, t1: m.t1, t2: m.t2, s1: r.s1, s2: r.s2, w: r.w, tab: m.tab || '', kst: Schedule.kst ? m.t : m.t, cur: true, n1: (Schedule.team(m.t1) || {}).name, n2: (Schedule.team(m.t2) || {}).name, evName: e ? e.label : m.event }; });
    Results.list = cur;
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
    return Object.values(Schedule.byEvent || {}).filter(e => e.league === league && e.kind === 'regular' && e.year === Schedule.season()).sort((a, b) => a.start.localeCompare(b.start)).map(e => e.id);
  };
})();

Engine.on(today => { Season.process(today); });

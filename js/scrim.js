// 스크림: 날짜·판수를 정해 신청 → 상대가 수락하면 그날 실제 경기처럼 밴픽 → 전술 → 관전으로 치른다.
// 판수는 승패와 상관없이 정한 만큼(series.fixed). 공식 기록·순위에는 들어가지 않는다. 코치에게 맡기면 정식 엔진으로 대신 치른다.
// 저장: App.state.scrims[] = { id, team, date(신청일), on(스크림 날), sets, status, incoming, result, games }
const Scrim = {
  list() { return (App.state.scrims ||= []); },
  // 공식전이 있는 날 (우리 · 상대)
  busy(teamId, ymd) { return Schedule.all.some(m => (m.t1 === teamId || m.t2 === teamId) && m.t.slice(0, 10) === ymd); },
  days(oppId) { const out = []; for (let i = 1; i <= 7; i++) { const d = Store.addDays(Clock.today(), i); if (!this.busy(App.state.teamId, d) && !this.busy(oppId, d) && !this.list().some(s => s.on === d && s.status !== 'declined')) out.push(d); } return out; },
  today() { const d = Clock.today(); return this.list().find(s => s.status === 'accepted' && s.on === d && !s.result) || null; },
  // 스크림 날: 바로 밴픽으로
  go(s = this.today()) {
    if (!s) return;
    const miss = Draft.missing(); if (miss.length) { UI.toast(`${miss.map(r => G.ROLE_KO[r]).join('·')} 주전이 없어 스크림을 할 수 없습니다.`, 4000); Router.go('roster-first-team'); return; }
    const D = Draft.st(); if (!D || D.scrim !== s.id) { App.state.draft = null; Draft.start({ opp: s.team, side: 'B', mode: 'direct', bo: s.sets, scrim: s.id, fixed: s.sets }); }
    Router.go('match-draft');
  },
  find(id) { return this.list().find(s => s.id === id); },
  // 남은 판을 코치가 치른다
  autoPlay(s, series) {
    series ||= { key: 'scrim:' + s.id, bo: s.sets, fixed: s.sets, games: [] };
    series.games = series.games.filter(x => x.result);
    const my = App.state.teamId;
    while (series.games.length < s.sets) {
      const blue = series.games.length % 2 ? s.team : my, red = blue === my ? s.team : my;
      const S = Draft.make({ series, teams: { B: blue, R: red }, us: blue === my ? 'B' : 'R', mode: 'delegate' });
      Draft.auto(S);
      const g = Sim.create(S, S.game); let n = 0; while (!g.over && n++ < 4000) Sim.step(g);
      series.games[series.games.length - 1].result = Season.gameResult(g);
    }
    return series;
  },
  finish(id, series) {
    const s = this.find(id); if (!s || s.result) return;
    const my = App.state.teamId, w = series.games.filter(x => x.result && x.result.win === my).length, n = series.games.filter(x => x.result).length;
    s.result = `${w}:${n - w}`; s.games = series.games.filter(x => x.result).map(x => ({ win: x.result.win, t: x.result.t, k: x.result.kills }));
    const o = Schedule.team(s.team), t = Roster.team();
    Inbox.push({ from: { name: `${((t.staff || [])[1] || (t.staff || [])[0] || {}).name || '코치'} 코치`, role: 'coach' }, subject: `${o.short} 스크림 결과 ${s.result}`, link: 'training-scrims',
      body: `${o.name}와의 스크림 ${n}판을 ${s.result}로 마쳤습니다.\n\n${w > n / 2 ? '준비한 운영이 잘 통했습니다.' : w === n / 2 ? '주고받은 스크림이었습니다. 보완할 점을 정리하겠습니다.' : '초반 설계에서 밀렸습니다. 다음 스크림 전에 보완하겠습니다.'}` });
    if (App.state.draft && App.state.draft.scrim === id) App.state.draft = null;
  },
};

// 답장 · 지나간 스크림은 코치가 대신
Engine.on(today => {
  const my = Roster.team();
  Scrim.list().forEach((s, i) => {
    s.id ||= 's' + i + ':' + s.date + ':' + s.team;
    const o = Schedule.team(s.team); if (!o) return;
    const r = salt => G.rand(App.state.seed + s.team + s.date, salt), from = { name: `${o.short} 코칭스태프`, role: 'coach' };
    if (!s.status && Fmt.daysBetween(s.date, today) >= 1) {
      const p = Math.max(.15, Math.min(.92, .72 - ((o.rep || 2) - (my.rep || 2)) * .14 - (o.league !== my.league ? .2 : 0)));
      if (s.on && s.on <= today) { s.status = 'declined'; return; }
      if (r('yes') < p) {
        s.status = 'accepted'; s.on ||= Store.addDays(today, 1 + Math.floor(r('on') * 3));
        Inbox.push({ from, subject: `${o.short}, 스크림 수락`, link: 'training-scrims', body: `${my.short} 측 스크림 제안을 받아들입니다.\n\n${Fmt.dayLabel(s.on)} 저녁, ${s.sets}판 진행하겠습니다.` });
      } else {
        s.status = 'declined';
        Inbox.push({ from, subject: `${o.short}, 스크림 정중히 거절`, link: 'training-scrims', body: '제안 감사합니다. 그날은 일정이 이미 차 있어 어렵겠습니다. 다음 기회에 다시 이야기 나누시죠.' });
      }
    }
    if (s.status === 'accepted' && s.on < today && !s.result) {
      const D = App.state.draft; Scrim.finish(s.id, Scrim.autoPlay(s, D && D.scrim === s.id ? D.series : null));
    }
  });
});

// 인터뷰 · 구단 이벤트 (선택지 메시지). 결과는 관계 수치(World: 이사회·선수단·팬·미디어) · 사기 · 컨디션으로.
// - 시즌 각오 인터뷰 (+ 우리 팀 말고 우승 후보 예상)
// - 개인 방송 요청 · 스폰서 촬영
// - 중요 경기 전 티저 트래시토크 (허용하면 팬·사기 ↑, 지면 역풍)
// - 패배 소감 (기자회견)
// - 후보 선수의 출전 기회 요청 (약속하면 지켜야 한다)
const Talk = {
  st() { return (App.state.talk ||= { trash: {}, promise: null, predict: {} }); },
  my() { return Roster.team(); },
  r(k) { return G.rand((App.state.seed || '') + ':talk:' + k, 'tk'); },
  // 중요 경기: 플레이오프 · 국제대회 · 리그 상위 3팀
  big(m) {
    const e = Schedule.eventOf(m); if (e && (e.kind === 'playoffs' || e.kind === 'intl')) return true;
    const o = Schedule.opponent(m, App.state.teamId); if (!o) return false;
    const rows = Results.table(o.league, Results.current(o.league).ids); return rows.slice(0, 3).some(x => x.t.id === o.id);
  },
  push(msg) { Inbox.push({ priority: 'todo', ...msg }); },

  daily(today) {
    const t = this.my(); if (!t) return;
    const Y = Schedule.season(), S = this.st();
    // 1. 시즌 각오: 첫 공식 대회 7일 전
    const first = Schedule.firstEvent(t.league, Store.addDays(today, -1));
    if (first && Fmt.daysBetween(today, first.start) === 7 && Engine.once('talk:season:' + Y)) {
      const rivals = App.db.teams.filter(x => x.league === t.league && x.id !== t.id).sort((a, b) => Season.power(b) - Season.power(a)).slice(0, 3);
      this.push({ from: { name: '구단 홍보팀', role: 'board' }, subject: `${Y} 시즌 각오 인터뷰`, ctx: {},
        body: `개막을 앞두고 방송사 인터뷰가 잡혔습니다. 기자가 이번 시즌 목표를 묻습니다.`,
        choices: [
          { label: '"우승 말고는 생각하지 않습니다"', fx: { fans: 4, media: 2, board: 1 }, reply: '팬들이 들끓습니다. 다만 결과가 따라오지 않으면 부담이 될 겁니다.' },
          { label: '"한 경기씩 차근차근 하겠습니다"', fx: { media: 1, squad: 1 }, reply: '무난한 답변이었습니다.' },
          { label: '"국제대회 진출이 첫 목표입니다"', fx: { fans: 2, board: 2 }, reply: '이사회가 현실적인 목표를 반겼습니다.' },
        ] });
      this.push({ from: { name: '방송사 기자', role: 'media' }, subject: `우리 팀 말고 우승 후보를 꼽는다면?`, ctx: {},
        body: `인터뷰 마지막 질문입니다. "${t.short}을(를) 빼고 이번 시즌 가장 강한 팀은 어디라고 보십니까?"`,
        choices: [...rivals.map(x => ({ label: x.name, act: 'predict', arg: x.id, fx: { media: 1 }, reply: `${x.short}을(를) 꼽았습니다. 상대 팀 팬들 사이에서 화제가 됐습니다.` })),
          { label: '"우리 팀 말고는 없습니다"', fx: { fans: 2, media: -1 }, reply: '자신감 있는 답변에 팬들이 환호했지만 다른 팀 팬들은 불편해합니다.' }] });
    }
    // 2. 개인 방송 요청 (한 달에 한 번쯤, 비시즌에 더 자주)
    if (this.r(today + 'stream') < (Market.stove(today) ? .06 : .025)) {
      const p = t.players.filter(x => x.role !== 'COACH')[Math.floor(this.r(today + 'sp') * t.players.length)];
      if (p && Engine.once('talk:stream:' + p.id + ':' + today.slice(0, 7))) this.push({ from: { name: p.name, role: 'player', photo: p.photo }, subject: `${p.name}, 개인 방송을 하고 싶다고 합니다`, ctx: { pid: p.id, player: p.name },
        body: `감독님, 쉬는 날 개인 방송을 좀 하고 싶습니다. 팬들이 계속 요청하기도 하고요. 연습에는 지장 없게 하겠습니다.`,
        choices: [
          { label: '허락한다', fx: { fans: 2, morale: 1 }, act: 'condDelta', arg: -1, reply: '팬들이 반가워합니다. 다만 연습 시간이 조금 줄었습니다.' },
          { label: '시즌 중에는 짧게만 하라고 한다', fx: { fans: 1 }, reply: '선수가 수긍했습니다.' },
          { label: '지금은 연습에 집중하라고 한다', fx: { morale: -1 }, act: 'condDelta', arg: .5, reply: '선수가 조금 서운해합니다.' },
        ] });
    }
    // 3. 스폰서 촬영 (두 달에 한 번쯤)
    if (this.r(today + 'spon') < .018 && Engine.once('talk:sponsor:' + today.slice(0, 7))) {
      const pay = Math.round((2 + (t.rep || 2)) * 1e7);
      this.push({ from: { name: '구단 마케팅팀', role: 'board' }, subject: '스폰서 광고 촬영 요청', ctx: { ledger: '스폰서 촬영' },
        body: `스폰서가 선수단 광고 촬영을 요청했습니다. 하루 일정이 통째로 빠집니다. 촬영비는 약 ${Player.money(pay / 1e8)} 원입니다.`,
        choices: [
          { label: '촬영한다', fx: { money: pay, board: 2, fans: 1 }, act: 'condAll', arg: -.5, reply: '촬영을 마쳤습니다. 선수들이 조금 지쳤습니다.' },
          { label: '시즌 일정상 미룬다', fx: { board: -1 }, reply: '스폰서가 아쉬워했습니다.' },
        ] });
    }
    // 4. 중요 경기 전 티저 트래시토크 (2일 전)
    Schedule.forTeam(t.id).filter(m => m.t1 && m.t2 && Fmt.daysBetween(today, m.t) === 2 && !Season.st()[m.id] && this.big(m)).forEach(m => {
      if (!Engine.once('talk:trash:' + m.id)) return;
      const o = Schedule.opponent(m, t.id);
      this.push({ from: { name: '구단 콘텐츠팀', role: 'board' }, subject: `${o.short}전 티저 촬영 — 트래시토크 허용할까요?`, ctx: { mid: m.id },
        body: `${o.name}전을 앞두고 티저 영상을 찍습니다. 선수들이 상대를 도발하는 멘트를 넣고 싶어 합니다.\n\n허용하면 분위기는 확실히 올라가지만, 지면 그대로 돌아옵니다.`,
        choices: [
          { label: '허용한다', act: 'trash', arg: m.id, fx: { fans: 3, moraleAll: 1, media: 1 }, reply: '티저가 화제가 됐습니다. 이제 이겨야 합니다.' },
          { label: '허용하지 않는다', reply: '무난한 티저로 갑니다.' },
        ] });
    });
    // 6. 후보 선수의 출전 요청 (후보가 있을 때 두 달에 한 번쯤)
    const subs = t.players.filter(p => p.sub && p.role !== 'COACH');
    if (subs.length && !S.promise && this.r(today + 'sub') < .02) {
      const p = subs[Math.floor(this.r(today + 'sb') * subs.length)];
      if (Engine.once('talk:sub:' + p.id + ':' + today.slice(0, 7))) this.push({ from: { name: p.name, role: 'player', photo: p.photo }, subject: `${p.name}, 출전 기회를 묻습니다`, ctx: { pid: p.id, player: p.name },
        body: `감독님, 저도 준비는 되어 있습니다. 언제쯤 경기에 나갈 수 있을까요?`,
        choices: [
          { label: '2주 안에 기회를 주겠다고 약속한다', act: 'subPromise', arg: p.id, fx: { morale: 2 }, reply: '선수가 기대에 차 있습니다. 약속을 지키지 않으면 실망이 클 겁니다.' },
          { label: '연습에서 증명하라고 한다', fx: { morale: ((p.attributes || {}).hidden || {}).ambition >= 14 ? 1 : -1 }, reply: '선수가 고개를 끄덕였습니다.' },
          { label: '지금은 주전 체제를 바꿀 생각이 없다', fx: { morale: -2, squad: -1 }, reply: '선수가 실망한 기색입니다.' },
        ] });
    }
    // 약속 기한
    if (S.promise && today > S.promise.due) {
      const hit = Player.find(S.promise.pid);
      if (hit) { World.apply({ morale: -4, squad: -2 }, { pid: hit.p.id, player: hit.p.name }); Inbox.push({ from: { name: hit.p.name, role: 'player', photo: hit.p.photo }, subject: `${hit.p.name}, 약속이 지켜지지 않았다며 실망했습니다`, body: '감독님이 기회를 주신다고 하셨는데… 솔직히 실망했습니다.', priority: 'normal' }); }
      S.promise = null;
    }
  },

  // 공식전 시리즈가 끝난 뒤 (Season.recordSeries)
  after(m, series) {
    const t = this.my(); if (!t || (m.t1 !== t.id && m.t2 !== t.id)) return;
    const S = this.st(), sc = Season.seriesScore(series), o = Schedule.opponent(m, t.id), won = (sc[t.id] || 0) > (sc[o.id] || 0);
    // 트래시토크 결과
    if (S.trash[m.id]) {
      delete S.trash[m.id];
      if (won) { World.apply({ fans: 2, media: 1 }, {}); Market.post(`[이슈] 도발하고 이겼다… ${t.short}, ${o.short}전 티저 화제`, `경기 전 도발 티저를 공개했던 ${t.name}가 ${o.name}를 꺾었습니다. 팬들은 "말한 대로 했다"며 열광하고 있습니다.`, null); }
      else { World.apply({ fans: -5, media: -3, moraleAll: -1 }, {}); Market.post(`[이슈] 도발 티저의 역풍… ${t.short}, ${o.short}에 패배`, `경기 전 상대를 도발했던 ${t.name}가 ${o.name}에 졌습니다. 커뮤니티에는 조롱 섞인 반응이 쏟아지고 있습니다.`, null); }
    }
    // 후보 약속: 그 선수가 뛰었으면 지킨 것
    if (S.promise && series.games.some(x => x.result && x.result.stats && x.result.stats.some(s => s[0] === S.promise.pid))) { const hit = Player.find(S.promise.pid); if (hit) World.apply({ morale: 2, squad: 1 }, { pid: hit.p.id, player: hit.p.name }); S.promise = null; }
    // 패배 소감
    if (!won && Engine.once('talk:loss:' + m.id)) this.push({ from: { name: '경기 후 기자회견', role: 'media' }, subject: `${o.short}전 패배 — 소감을 묻습니다`, ctx: {},
      body: `${o.name}에 ${sc[t.id] || 0}:${sc[o.id] || 0}로 졌습니다. 기자들이 패배 원인을 묻습니다.`,
      choices: [
        { label: '"상대가 준비를 잘해왔습니다"', fx: { media: 2 }, reply: '깔끔한 인정에 여론이 나쁘지 않습니다.' },
        { label: '"밴픽이 전반적으로 아쉬웠습니다. 제 책임입니다"', fx: { squad: 2, board: -1 }, reply: '선수들이 감독이 책임을 졌다고 받아들였습니다.' },
        { label: '"선수들에게 미안하다고 전하고 싶습니다"', fx: { squad: 2, fans: 1, board: -1 }, reply: '팬들이 따뜻하게 반응했습니다.' },
        { label: '"팀 전체적으로 아쉬운 경기였습니다"', fx: { squad: -2, board: 1 }, reply: '이사회는 냉정한 평가를 반겼지만 선수단 분위기는 무거워졌습니다.' },
      ] });
  },
};
Engine.ACTS.predict = (m, tid) => { (Talk.st().predict ||= {})[Schedule.season()] = tid; };
Engine.ACTS.trash = (m, mid) => { Talk.st().trash[mid] = true; };
Engine.ACTS.subPromise = (m, pid) => { Talk.st().promise = { pid, due: Store.addDays(Clock.today(), 14) }; };
Engine.ACTS.condDelta = (m, v) => { const S = Cond.st(), hit = Player.find(m.ctx.pid); if (hit) S.f[m.ctx.pid] = Math.max(-Cond.amp(hit.p), Math.min(Cond.amp(hit.p), (S.f[m.ctx.pid] || 0) + v)); };
Engine.ACTS.condAll = (m, v) => { const S = Cond.st(); Roster.team().players.forEach(p => { S.f[p.id] = Math.max(-Cond.amp(p), Math.min(Cond.amp(p), (S.f[p.id] || 0) + v)); }); };
Engine.on(today => { if (App.state.teamId && Schedule.events && Results.list) Talk.daily(today); });

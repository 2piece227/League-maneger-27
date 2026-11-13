// 이사회: 매달 성적을 기대와 비교해 신뢰를 올리고 내린다. 감독 계약(App.state.mgrContract)도 여기서.
//  - 너무 못하면 시즌 중 경질 → 무직(App.state.unemployed). 지금 평판으로 이력서를 내 다른 팀을 구한다(커리어 > 다른 팀 보기)
//  - 계약 만료 때 아쉬웠으면 재계약 없음 → 무직
//  - 아주 잘하면 시즌 중에 조기 재계약 제안
// 트레이드: 우리 ↔ 다른 구단 선수 맞교환. 우리가 제안하거나, 다른 구단이 제안해 온다. 트레이드설이 돌면 그 선수와 감독 관계가 크게 떨어진다.
const Board = {
  // 구단 평판(별)별 기대 순위
  EXP: { 5: 2, 4: 4, 3: 6, 2: 8, 1: 9 },
  contract() {
    const m = App.state.manager || {}, t = Roster.team();
    if (!App.state.mgrContract && t) { const from = (m.createdAt || Clock.START).slice(0, 10); App.state.mgrContract = { team: t.id, from, to: `${Clock.year(from) + 2}-11-30` }; }
    return App.state.mgrContract;
  },
  played(t) { const Y = String(Schedule.season()); return Results.list.filter(m => m.cur && String(m.e).startsWith(Y) && (m.t1 === t.id || m.t2 === t.id)).length; },
  monthly(today) {
    const t = Roster.team(); if (!t || App.state.unemployed) return;
    const board = { name: '이사회', role: 'board' }, c = this.contract();
    // 계약 만료
    if (c && today >= c.to && Engine.once('mgrEnd:' + c.to)) {
      const r = World.rel().board;
      if (r < 45) { this.fire(today, `계약이 ${Fmt.dayLabel(c.to)}에 끝났습니다. 이사회는 재계약하지 않기로 했습니다.`); return; }
      App.state.mgrContract = { team: t.id, from: today, to: Store.addDays(c.to, 730) };
      Inbox.push({ from: board, subject: '감독 재계약', body: `이사회가 감독님과 2년 재계약을 결정했습니다. 새 계약은 ${Fmt.dayLabel(App.state.mgrContract.to)}까지입니다.` });
    }
    if (today.slice(8) !== '01') return;
    const n = this.played(t); if (n < 4) return;
    const cur = Results.current(t.league), rows = Results.table(t.league, cur.ids), rank = rows.findIndex(x => x.t.id === t.id) + 1 || rows.length;
    const exp = this.EXP[t.rep || 2] || 6, d = Math.max(-8, Math.min(6, (exp - rank) * 2));
    const won = Object.entries(App.state.champs || {}).filter(([id, w]) => w === t.id && !(App.state.boardSeen || {})[id]);
    won.forEach(([id]) => { (App.state.boardSeen ||= {})[id] = 1; });
    World.apply({ board: d + won.length * 10 }, {});
    const r = World.rel().board;
    if (r <= 12 && n >= 6) { this.fire(today, `${cur.name} ${rank}위. 구단이 기대한 성적(${exp}위 안)과 너무 멉니다. 이사회는 오늘부로 감독님과의 계약을 해지하기로 했습니다.`); return; }
    if (r <= 25 && Engine.once('boardWarn:' + today.slice(0, 7))) Inbox.push({ from: board, subject: '이사회 경고', priority: 'urgent', body: `지금 성적(${rank}위)으로는 이사회의 인내심이 오래가지 않습니다. 반등이 필요합니다.` });
    if (r >= 85 && Engine.once('earlyExt:' + Schedule.season())) Inbox.push({ from: board, subject: '조기 재계약 제안', priority: 'todo',
      body: `이사회가 감독님의 성과에 매우 만족하고 있습니다. 계약 기간이 남아 있지만, 지금 2년 연장 계약을 맺고 싶어 합니다.`,
      choices: [{ label: '연장 계약에 서명한다', act: 'mgrExtend', fx: { board: 3 }, reply: '연장 계약을 맺었습니다.' }, { label: '시즌이 끝나고 이야기하자고 한다', fx: { board: -2 }, reply: '이사회가 조금 아쉬워합니다.' }] });
  },
  fire(today, why) {
    const t = Roster.team();
    App.state.unemployed = { since: today, from: t.id };
    if (App.state.manager) App.state.manager.reputation = Math.max(0, (App.state.manager.reputation || 50) - 5);
    App.state.draft = null;
    Inbox.push({ from: { name: '이사회', role: 'board' }, subject: `${t.short} 감독직 해임`, priority: 'urgent', stop: true, link: 'career-other-teams', body: `${why}\n\n이제 무직입니다. 커리어 › 다른 팀 보기에서 지금 평판으로 이력서를 낼 수 있습니다.` });
    Market.post(`[오피셜] ${t.short}, ${(App.state.manager || {}).name || ''} 감독과 결별`, `${t.name}가 성적 부진을 이유로 감독과 계약을 해지했습니다.`, null);
  },
};
Engine.ACTS.mgrExtend = () => { const c = Board.contract(); c.to = Store.addDays(c.to, 730); };
// 무직이면: 우리 경기 없음(그 팀 경기는 AI가 치른다), 새 팀에 부임하면 풀린다
(() => {
  const today = Season.today.bind(Season); Season.today = () => App.state.unemployed ? null : today();
  const sw = Engine.switchTeam.bind(Engine); Engine.switchTeam = t => { App.state.unemployed = null; sw(t); App.state.mgrContract = { team: t.id, from: Clock.today(), to: `${Clock.year(Clock.today()) + 2}-11-30` }; };
})();
Engine.on(today => { if (App.state.teamId && Results.list) Board.monthly(today); });

const Trade = {
  val(p, t) { return Transfer.price(p, t).v; },
  // 바꾼 뒤에도 그 팀이 다섯 포지션을 다 채우는지
  roleOk(t, out, inn) { const ps = t.players.filter(x => x !== out).concat([inn]); return G.ROLES.every(r => ps.some(x => x.role === r)); },
  swap(a, b) {
    const A = Player.find(a.id).t, B = Player.find(b.id).t, M = Contract.st();
    M.moves[a.id] = B.id; M.moves[b.id] = A.id; Squad.apply();
    Market.post(`[오피셜] ${A.short}·${B.short} 트레이드 — ${a.name} ↔ ${b.name}`, `${A.name}의 ${a.name}와 ${B.name}의 ${b.name}가 맞교환됐습니다.`, a.id);
  },
  rumor(p, other) {
    Rel.add(p.id, -15); const mor = World.morale(); mor[p.id] = (mor[p.id] || 0) - 2;
    Market.post(`[이적설] ${p.name}, ${other.short}와 트레이드 카드로?`, `${Roster.team().name}가 ${p.name}을(를) 트레이드 카드로 쓰려 한다는 이야기가 돌고 있습니다. 선수 본인은 당황스럽다는 반응입니다.`, p.id);
    Inbox.push({ from: { name: p.name, role: 'player', photo: p.photo }, subject: `${p.name}, 트레이드설에 대해 묻습니다`, body: '감독님, 제가 트레이드 카드라는 기사가 사실인가요? 솔직히 충격입니다.' });
  },
  // 우리 → 다른 구단
  propose(theirId) {
    const hit = Player.find(theirId); if (!hit) return;
    const { p, t } = hit, my = Roster.team();
    const mine = my.players.filter(x => x.role !== 'COACH');
    UI.modal({ title: `${p.name} 트레이드 제안`, body: `<p>${UI.esc(t.name)}에 우리 선수 한 명과 ${UI.esc(p.name)}의 맞교환을 제안합니다.</p><label class="rg-row"><span>보낼 선수</span><select class="ch-sort tr-out">${mine.map(x => `<option value="${x.id}">${UI.esc(x.name)} · ${G.ROLE_KO[x.role]} · OVR ${x.ovr || '-'}</option>`).join('')}</select></label><p class="cr-dim">거절당하면 트레이드설이 퍼질 수 있습니다.</p>`,
      actions: [{ label: '취소' }, { label: '제안한다', primary: true, onClick: back => {
        const out = Player.find(back.querySelector('.tr-out').value).p;
        const theirV = this.val(p, t), ourV = Contract.value(out, t) * (out.sub ? .8 : 1.1), locked = Transfer.price(p, t).locked;
        if (!locked && ourV >= theirV * .95 && this.roleOk(t, p, out) && this.roleOk(my, out, p)) { this.swap(out, p); UI.toast(`${t.short}이(가) 트레이드를 받아들였습니다`, 3500); Router.go(Router.current()); }
        else { UI.toast(`${t.short}이(가) 거절했습니다${locked ? ' (핵심 선수라 팔 생각이 없다고 합니다)' : ''}`, 3500); if (G.rand(out.id + Clock.today(), 'leak') < .35) this.rumor(out, t); }
      } }] });
  },
  // 다른 구단 → 우리
  daily(today) {
    const my = Roster.team(); if (!my || App.state.unemployed || G.rand((App.state.seed || '') + today, 'trd') > (Market.stove(today) ? .03 : .006)) return;
    const ai = App.db.teams.filter(t => t.id !== my.id && t.league === my.league);
    const t = ai[Math.floor(G.rand(today, 'trt') * ai.length)]; if (!t) return;
    // 그 팀이 약한 포지션의 우리 선수를 노린다
    const weak = G.ROLES.map(r => [r, Math.max(0, ...t.players.filter(x => x.role === r).map(x => x.ovr || 0))]).sort((a, b) => a[1] - b[1])[0][0];
    const want = my.players.filter(x => x.role === weak && x.role !== 'COACH').sort((a, b) => (b.ovr || 0) - (a.ovr || 0))[0]; if (!want) return;
    const V = Contract.value(want, t), give = t.players.filter(x => x.role !== 'COACH' && x !== want && this.roleOk(t, x, want) && this.roleOk(my, want, x) && this.val(x, t) <= V * 1.1 && !Transfer.price(x, t).locked)   // 받는 선수보다 비싸거나 핵심 선수는 내주지 않는다.map(x => [x, Math.abs(this.val(x, t) - V)]).sort((a, b) => a[1] - b[1])[0];
    if (!give || !Engine.once('trade:' + t.id + ':' + want.id + ':' + today.slice(0, 7))) return;
    const x = give[0];
    Inbox.push({ from: { name: `${t.short} 단장`, role: 'board' }, subject: `${t.short} 트레이드 제안: ${x.name} ↔ ${want.name}`, priority: 'todo', ctx: { a: want.id, b: x.id },
      body: `${t.name}입니다. 우리 ${G.ROLE_KO[x.role]} ${x.name}(OVR ${x.ovr || '-'})와 귀 구단 ${G.ROLE_KO[want.role]} ${want.name}(OVR ${want.ovr || '-'})의 맞교환을 제안합니다.`,
      choices: [{ label: '받아들인다', act: 'tradeYes', reply: '트레이드가 성사됐습니다.' }, { label: '거절한다', act: 'tradeNo', reply: '제안을 거절했습니다.' }] });
    if (G.rand(today + want.id, 'leak') < .4) this.rumor(want, t);
  },
};
Engine.ACTS.tradeYes = m => { const a = Player.find(m.ctx.a), b = Player.find(m.ctx.b); if (a && b) Trade.swap(a.p, b.p); };
Engine.ACTS.tradeNo = () => {};
Engine.on(today => { if (App.state.teamId && App.db.free) Trade.daily(today); });

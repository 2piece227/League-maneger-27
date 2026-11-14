// LCK컵 그룹 드래프트: 전년도 순위 1·2시드가 주장. 주장이 번갈아 나머지 팀을 자기 그룹으로 데려간다(1시드부터).
// 두 그룹은 서로 맞붙는다(템플릿의 25경기 = 5×5). 첫 시즌 시드는 2026 실제 순위(season-template meta.seeds), 이후는 전 시즌 순위.
// 우리 팀이 주장이면 일정 발표 전에 직접 고른다(안 고르면 사무국이 자동으로). 결과: App.state.cupDraft[연도] = { A, B, by }
const CupDraft = {
  st() { return (App.state.cupDraft ||= {}); },
  seeds(Y) {
    const tpl = Schedule.tpl, ids = App.db.teams.filter(t => t.league === 'LCK').map(t => t.id);
    let order = Y === Schedule.BASE + 1 ? ((tpl.meta.seeds || {}).LCK || []) : (typeof Season !== 'undefined' && Season.leagueRank ? Season.leagueRank('LCK', Y - 1, `${Y - 1}-12-31`) : []);
    order = order.filter(id => ids.includes(id));
    return [...order, ...ids.filter(id => !order.includes(id))];
  },
  // AI 주장의 선택: 대체로 약한 팀을 데려오지만(쉬운 대진) 가끔 라이벌을 고른다
  aiPick(Y, cap, left) {
    const w = left.map((id, i) => [id, (i + 1) * (.6 + G.rand((App.state.seed || '') + Y + cap + id, 'cd'))]);
    return w.sort((a, b) => b[1] - a[1])[0][0];
  },
  auto(Y, upto = 99) {
    const s = this.seeds(Y), A = [s[0]], B = [s[1]], left = s.slice(2);
    for (let i = 0; left.length && i < upto; i++) { const cap = i % 2 ? B[0] : A[0], pick = this.aiPick(Y, cap, left); left.splice(left.indexOf(pick), 1); (i % 2 ? B : A).push(pick); }
    return { A, B, left };
  },
  // 전 시즌이 끝나야(플레이오프 결과) 시드가 확정된다. 그 전에는 임시 대진만 보여 주고 저장하지 않는다
  get(Y) {
    const S = this.st(); if (S[Y]) return S[Y];
    const r = this.auto(Y), d = { A: r.A, B: r.B, by: 'auto' };
    if (Y === Schedule.BASE + 1 || (typeof Season !== 'undefined' && Season.done && Season.done(`${Y - 1}:lck-po`))) S[Y] = d;
    return d;
  },
  // 템플릿 토큰 → 그룹 (맞붙는 경기 그래프를 두 색으로 칠한다)
  tokenGroups(e) {
    const adj = {}; e.slots.forEach(s => { if (s.a && s.b && s.a.startsWith('T:') && s.b.startsWith('T:')) { (adj[s.a] ||= new Set()).add(s.b); (adj[s.b] ||= new Set()).add(s.a); } });
    const col = {}, toks = Object.keys(adj);
    toks.forEach(t0 => { if (col[t0] != null) return; col[t0] = 0; const q = [t0]; while (q.length) { const u = q.shift(); adj[u].forEach(v => { if (col[v] == null) { col[v] = 1 - col[u]; q.push(v); } }); } });
    return [toks.filter(t => col[t] === 0).sort(), toks.filter(t => col[t] === 1).sort()];
  },
  // Schedule.buildSeason 이 부른다: 토큰 → 팀
  map(e, Y) {
    const [g0, g1] = this.tokenGroups(e); if (g0.length !== 5 || g1.length !== 5) return null;
    const d = this.get(Y), m = {};
    g0.forEach((t, i) => { m[t] = d.A[i]; }); g1.forEach((t, i) => { m[t] = d.B[i]; });
    return m;
  },
  ev(Y) { return Schedule.events.find(x => x.year === Y && x.base === 'lck-cup'); },
  mine(Y) { const s = this.seeds(Y); return s.indexOf(App.state.teamId) < 2 && Roster.team().league === 'LCK'; },
  // 매일: 우리가 주장이면 발표 전에 알림
  daily(today) {
    const Y = Schedule.season(), e = this.ev(Y); if (!e || !this.mine(Y) || today >= e.pub) return;
    const d = this.get(Y);
    if (d.by !== 'user' && Engine.once('cupdraft:' + Y)) Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: `${Y} LCK컵 그룹 드래프트 (${Fmt.dayLabel(e.pub)}까지)`, priority: 'todo', link: 'match-cupdraft',
      body: `지난 시즌 성적으로 우리 팀이 LCK컵 그룹 주장이 됐습니다.\n\n상대 주장과 번갈아 나머지 팀을 우리 그룹으로 데려옵니다. 두 그룹은 서로 맞붙습니다. ${Fmt.dayLabel(e.pub)} 일정 발표 전까지 정하지 않으면 사무국이 대신 고릅니다.` });
  },
  // ---------- 화면 ----------
  async render(el) {
    await Portal.ready;
    const Y = Schedule.season(), e = this.ev(Y), seeds = this.seeds(Y), my = App.state.teamId;
    if (!e || !this.mine(Y)) { el.innerHTML = `<div class="cr-page">${Career.head('LCK컵 그룹 드래프트', '우리 팀이 주장(전 시즌 1·2위)일 때만 고를 수 있습니다.')}${this.board(this.get(Y), seeds)}</div>`; return; }
    const locked = Clock.today() >= e.pub, d = this.cur ||= { A: [seeds[0]], B: [seeds[1]], left: seeds.slice(2), turn: 0 };
    const mineSide = seeds[0] === my ? 'A' : 'B';
    // AI 차례면 바로 고른다
    while (d.left.length && (d.turn % 2 ? 'B' : 'A') !== mineSide) { const cap = d.turn % 2 ? d.B[0] : d.A[0], pk = this.aiPick(Y, cap, d.left); d.left.splice(d.left.indexOf(pk), 1); (d.turn % 2 ? d.B : d.A).push(pk); d.turn++; }
    const T = id => Schedule.team(id);
    el.innerHTML = `<div class="cr-page">
      ${Career.head(`${Y} LCK컵 그룹 드래프트`, locked ? '일정이 발표되어 그룹이 확정됐습니다.' : `우리 차례에 데려올 팀을 고르세요. 두 그룹은 서로 맞붙습니다. 시드: ${seeds.map((id, i) => `${i + 1}.${T(id).short}`).join(' ')}`)}
      ${locked ? this.board(this.get(Y), seeds) : `${this.board(d, seeds)}
      <div class="card"><div class="card-head"><h3>${d.left.length ? '남은 팀 — 우리 차례' : '드래프트 끝'}</h3></div>
        <div class="cd-left">${d.left.map(id => `<button class="btn-ghost cd-pick" data-t="${id}">${G.team(T(id), 'xs')} ${UI.esc(T(id).short)} <small>${seeds.indexOf(id) + 1}시드</small></button>`).join('')}</div>
        <div class="rg-foot">${d.left.length ? '' : '<button class="btn-primary cd-save">이 그룹으로 확정</button>'}<button class="btn-ghost cd-reset">처음부터</button></div></div>`}
    </div>`;
    el.querySelectorAll('.cd-pick').forEach(b => b.onclick = () => { d.left.splice(d.left.indexOf(b.dataset.t), 1); d[mineSide].push(b.dataset.t); d.turn++; this.render(el); });
    const sv = el.querySelector('.cd-save'); if (sv) sv.onclick = () => { this.st()[Y] = { A: d.A, B: d.B, by: 'user' }; this.cur = null; Schedule.key = null; Schedule.ensure(); UI.toast('LCK컵 그룹을 확정했습니다'); this.render(el); };
    const rs = el.querySelector('.cd-reset'); if (rs) rs.onclick = () => { this.cur = null; this.render(el); };
  },
  board(d, seeds) {
    const T = id => Schedule.team(id), col = (k, l) => `<div class="card"><div class="card-head"><h3>${k === 'A' ? '그룹 A' : '그룹 B'} <small>주장 ${UI.esc(T(l[0]).short)}</small></h3></div>${l.map(id => `<div class="sm-row">${G.team(T(id), 'xs')}<b>${UI.esc(T(id).name)}</b><small class="cr-dim">${seeds.indexOf(id) + 1}시드</small></div>`).join('')}</div>`;
    return `<div class="cr-grid">${col('A', d.A)}${col('B', d.B)}</div>`;
  },
};
Views['match-cupdraft'] = el => CupDraft.render(el);
Engine.on(today => { if (App.state.teamId && !App.state.unemployed && Schedule.events && Schedule.tpl) CupDraft.daily(today); });

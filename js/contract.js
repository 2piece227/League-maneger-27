// 계약: 선수 가치·연봉 · 계약서(옵션·보너스·바이아웃·역할 약속) · 이적/방출 기록 · 계약 만료 처리
// 가치는 커리어 기록(리그·소속팀 명성·시그니처·특성·경기 수·나이)으로 임시 계산한다. 실제 능력치가 생기면 바꾼다.
// 금액은 모두 억 원(해외 리그도 원화로 통일).
const Contract = {
  stars: {},                                   // custom.json stars: 선수별 가치 점수 직접 지정
  LG: { LCK: 1, LPL: 1.15, LEC: .55, LCS: .65 },  // 2군·최저 연봉 리그 배율
  CURVE: { LCK: [.55, 11.5], LPL: [.63, 11.5], LEC: [1.2, 16], LCS: [1.5, 16] }, // 1군 연봉 곡선: a·e^((점수-45)/k). 해외는 스타와 평균 차이가 작다
  MIN: { first: .6, cl: .2, academy: .1 },     // 최저 연봉 (LCK 1군 6천만 원 기준)
  OPT: { player: '선수 옵션', team: '구단 옵션' },
  PROMISE: { starter: '주전 보장', rotation: '로테이션', none: '약속 없음' },
  BONUS: { league: '리그 우승', intl: '국제대회 진출', worlds: '월즈 우승' },

  st() { const m = (App.state.market ||= {}); m.contracts ||= {}; m.moves ||= {}; m.neg ||= {}; return m; },
  r1: v => Math.round(v * 10) / 10,
  endDay(t) { return t && t.league === 'LPL' ? '11-17' : '11-16'; },
  addYears(ymd, n) { return `${+ymd.slice(0, 4) + n}${ymd.slice(4)}`; },

  // ---------- 가치 ----------
  // 0~100 점수. 1군 주전 평균 60~70, 리그 정상급 85+, 페이커급 95+
  score(p, t) {
    if (p._sc != null) return p._sc;
    let s;
    if (this.stars[p.id]) s = this.stars[p.id];
    else if (p.level === 'cl' || p.level === 'academy' || p.gen || p.made) s = 26 + (p.ca || 8) * 2.2;
    else if (p.role === 'COACH') s = 52 + ((t.rep || 2) - 2) * 5;
    else {
      const pool = (typeof Mastery !== 'undefined' && Mastery.pools) ? Mastery.pool(p.id) : [];
      const g = pool.reduce((a, e) => a + e.g, 0), sig = pool.filter(e => e.sig).length;
      const tr = (typeof Traits !== 'undefined' && Traits.cfg) ? Traits.of(p.id).length : 0;
      const age = p.age || 22;
      s = ({ LCK: 62, LPL: 61, LEC: 52, LCS: 48 }[t.league] || 55) + ((t.rep || 2) - 2.5) * 5 + Math.min(sig, 4) * 2.5 + tr * 2
        + Math.min(g, 300) / 300 * 6 - (p.sub ? 12 : 0) + (age <= 19 ? -2 : age >= 29 ? -3 : age >= 27 ? -1 : 0) + (G.rand(p.id, 'sc') - .5) * 6;
    }
    s = Math.max(20, Math.min(99, s));
    if (typeof Mastery !== 'undefined' && Mastery.pools && typeof Traits !== 'undefined' && Traits.cfg) p._sc = s;
    return s;
  },
  tier(p) { return p.level === 'cl' ? 'cl' : p.level === 'academy' || p.gen ? 'academy' : 'first'; },
  // 이 점수의 선수가 이 리그에서 받는 시장 연봉
  pay(p, s, league) {
    const tier = this.tier(p);
    let v = tier === 'cl' ? .2 + Math.max(0, (p.ca || 8) - 8) * .06 : tier === 'academy' ? .1 + Math.max(0, (p.ca || 7) - 7) * .02 : (([a, k]) => a * Math.exp((s - 45) / k))(this.CURVE[league] || [.8, 14]);
    if (p.role === 'COACH') v *= .5;
    if (tier !== 'first') v *= this.LG[league] || .8;
    v *= .88 + G.rand(p.id, 'pay') * .24;
    return this.r1(Math.max(this.MIN[tier] * (this.LG[league] || .8), v));
  },
  // 계약서: 저장된 새 계약 > 데이터 원본(+선수별 고정 옵션)
  base(p, t) {
    const s = this.score(p, t), r = G.rand(p.id, 'opt');
    return { salary: this.pay(p, s, t.league), end: p.contractEnd, option: this.tier(p) === 'first' && p.role !== 'COACH' && r < .22 ? (s >= 78 ? 'player' : 'team') : null, buyout: null, promise: null, bonus: [] };
  },
  of(p, t) {
    if (!t) { const hit = Player.find(p.id); t = hit ? hit.t : { league: 'LCK' }; }
    const c = this.st().contracts[p.id];
    if (p.free) return { salary: 0, end: null, option: null, bonus: [] };
    return c ? { ...this.base(p, t), ...c } : this.base(p, t);
  },
  // 이적 시장 가치: 연봉 × 남은 기간 × 나이
  value(p, t) {
    const c = this.of(p, t);
    const s = this.score(p, t), age = p.age || 22;
    const yrs = c.end ? Math.max(0, Fmt.daysBetween(Clock.today(), c.end) / 365) : 0;
    const am = age <= 21 ? 1.4 : age <= 24 ? 1.2 : age <= 27 ? 1 : .7;
    const sal = c.salary || this.pay(p, s, t.league || 'LCK');
    return this.r1(sal * (.6 + yrs * .9) * am * (t.league === 'LPL' ? 1.3 : 1));
  },
  label(c) { return c.end ? `${c.end.replace(/-/g, '.')}${c.option ? ` (+1 ${this.OPT[c.option]})` : ''}` : '-'; },

  // ---------- 이적 기록 ----------
  // 원본 데이터에 저장된 이동(moves: pid → 팀 id | 'free')과 새 계약을 덮어쓴다. Squad.apply 가 부른다.
  applyWorld() {
    const db = App.db, M = this.st(), free = db.free;
    if (!free) return;
    free._base ||= [...free.players];
    free.players = [...free._base];
    const teams = [...db.teams, free], byId = new Map();
    teams.forEach(t => [...t.players, ...(t.cl || []), ...(t.staff || [])].forEach(p => {
      p._o ||= { team: p.team, free: !!p.free, end: p.contractEnd };
      p.team = p._o.team; p.free = p._o.free; p.contractEnd = p._o.end; p._sc = null;
      byId.set(p.id, [p, t]);
    }));
    Object.entries(M.moves).forEach(([pid, to]) => {
      const hit = byId.get(pid); if (!hit) return;
      const [p, from] = hit, dest = to === 'free' ? free : db.teams.find(x => x.id === to);
      if (!dest || dest === from || p.role === 'COACH') return;
      from.players = from.players.filter(x => x !== p); if (from.cl) from.cl = from.cl.filter(x => x !== p);
      p.team = dest.id; p.free = to === 'free'; p.sub = false;
      if (p.free) p.contractEnd = null;
      dest.players.push(p);
    });
    Object.entries(M.contracts).forEach(([pid, c]) => { const hit = byId.get(pid); if (hit && !hit[0].free) hit[0].contractEnd = c.end; });
  },
  // 계약 확정 (재계약 · FA 영입 · 이적)
  sign(pid, teamId, c) {
    const M = this.st(), hit = Player.find(pid);
    M.contracts[pid] = { ...c, signed: Clock.today() };
    if (hit && hit.t.id !== teamId) M.moves[pid] = teamId;
    if (hit && hit.p._o && hit.p._o.team === teamId) delete M.moves[pid];
    Squad.apply();
  },
  release(pid) {
    const M = this.st();
    M.moves[pid] = 'free'; delete M.contracts[pid];
    delete Squad.moves()[pid];
    Squad.apply();
  },
  exercise(pid) {
    const hit = Player.find(pid); if (!hit) return;
    const c = this.of(hit.p, hit.t);
    this.st().contracts[pid] = { ...c, end: this.addYears(c.end, 1), option: null, signed: Clock.today() };
    Squad.apply();
  },
};

// 계약 만료 처리 (우리 팀): 구단 옵션은 7일 전에 묻고, 선수 옵션은 만료일에 선수가 정한다. 그 외에는 FA.
Engine.ACTS.optExercise = m => Contract.exercise(m.ctx.pid);
Engine.ACTS.optDecline = m => { const M = Contract.st(); M.contracts[m.ctx.pid] = { ...Contract.of(Player.find(m.ctx.pid).p), option: null }; };
Engine.on(today => {
  const t = Roster.team(); if (!t) return;
  const board = { name: '사무국장', role: 'board' };
  // 코칭스태프는 사무국이 1년씩 자동 연장한다 (코치 영입·해임은 추후)
  (t.staff || []).forEach(p => {
    const c = Contract.of(p, t);
    if (c.end && c.end < today) Contract.st().contracts[p.id] = { ...c, end: Contract.addYears(c.end, 1), signed: today };
  });
  [...t.players].forEach(p => {
    const c = Contract.of(p, t), d = c.end ? Fmt.daysBetween(today, c.end) : null;
    if (d == null) return;
    if (c.option === 'team' && d <= 7 && d >= 0 && Engine.once('topt:' + p.id + c.end)) Inbox.push({ from: board, subject: `${p.name} 구단 옵션 행사 여부`, priority: 'todo', ctx: { pid: p.id, player: p.name },
      body: `${p.name}의 계약(${c.end.replace(/-/g, '.')} 만료)에는 1년 연장 구단 옵션이 있습니다.\n\n옵션을 행사하면 지금 연봉(${Player.money(c.salary)} 원) 그대로 1년 더 함께합니다. 포기하면 계약 만료일에 FA로 풀립니다.`,
      choices: [{ label: '옵션 행사 (1년 연장)', act: 'optExercise', reply: '옵션 행사를 선수 측에 통보했습니다.' }, { label: '옵션 포기', act: 'optDecline', reply: '옵션을 행사하지 않기로 했습니다. 재계약하지 않으면 만료일에 FA가 됩니다.' }] });
    if (d === 3 && Engine.once('exp3:' + p.id + c.end)) Inbox.push({ from: board, subject: `${p.name} 계약 만료 3일 전`, priority: 'todo', link: 'roster-contracts', ctx: { pid: p.id },
      body: `${p.name}(${G.ROLE_KO[p.role] || '코치'})의 계약이 ${Fmt.dayLabel(c.end)}에 끝납니다.\n\n그 전에 재계약하지 않으면 FA로 풀려 다른 팀과 자유롭게 협상할 수 있습니다.` });
    if (d >= 0) return;
    if (c.option === 'player') {
      const stay = G.rand((App.state.seed || '') + p.id + c.end, 'popt') < .45 + ((t.rep || 2) - 3) * .12 + ((World.morale()[p.id] || 0) * .03);
      if (stay) {
        Contract.exercise(p.id);
        Inbox.push({ from: board, subject: `${p.name}, 선수 옵션 행사 — 1년 잔류`, body: `${p.name}이(가) 계약서의 선수 옵션을 행사했습니다. 지금 조건 그대로 1년 더 뜁니다.` });
        return;
      }
      Inbox.push({ from: board, subject: `${p.name}, 선수 옵션 포기 — FA 시장으로`, priority: 'urgent', link: 'recruit-fa', body: `${p.name}이(가) 선수 옵션을 쓰지 않고 FA 시장에 나가기로 했습니다.\n\n다시 데려오려면 FA 시장에서 새 계약을 제시해야 합니다.` });
    } else Inbox.push({ from: board, subject: `${p.name}, 계약 만료로 FA`, priority: 'urgent', link: 'recruit-fa',
      body: `${p.name}의 계약이 끝나 FA가 됐습니다. 이제 다른 팀도 자유롭게 영입을 시도할 수 있습니다.\n\n다시 데려오려면 FA 시장에서 새 계약을 제시해야 합니다.` });
    Contract.release(p.id);
  });
});

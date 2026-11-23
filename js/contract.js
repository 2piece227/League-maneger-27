// 계약: 선수 가치·연봉 · 계약서(옵션·보너스·바이아웃·역할 약속) · 이적/방출 기록 · 계약 만료 처리
// 가치는 커리어 기록(리그·소속팀 명성·시그니처·특성·경기 수·나이)으로 임시 계산한다. 실제 능력치가 생기면 바꾼다.
// 금액은 모두 억 원(해외 리그도 원화로 통일).
const Contract = {
  stars: {},                                   // custom.json stars: 선수별 가치 점수 직접 지정
  LG: { LCK: 1, LPL: 1.15, LEC: .55, LCS: .65 },  // 2군·최저 연봉 리그 배율
  CURVE: { LCK: [.7, 14], LPL: [.85, 14], LEC: [1.2, 16], LCS: [1.5, 16] }, // 1군 연봉 곡선: a·e^((점수-45)/k). 해외는 스타와 평균 차이가 작다
  MIN: { first: .6, cl: .2, academy: .1 },     // 최저 연봉 (LCK 1군 6천만 원 기준)
  OPT: { player: '선수 옵션', team: '구단 옵션' },
  PROMISE: { starter: '주전 보장', rotation: '로테이션', none: '약속 없음' },
  BONUS: { league: '리그 우승', intl: '국제대회 진출', worlds: '월즈 우승' },

  st() { const m = (App.state.market ||= {}); m.contracts ||= {}; m.moves ||= {}; m.neg ||= {}; return m; },
  r1: v => Math.round(v * 10) / 10,
  endDay(t) { return t && t.league === 'LPL' ? '11-17' : '11-16'; },
  // 계약 기간 계산 기준일: 9월 이후(오프시즌) 계약은 올해 만료일부터, 시즌 중 계약은 작년 만료일부터 센다 → 1년 계약 = 다음 만료일까지
  seasonEnd(t) { const e = `${Clock.year()}-${this.endDay(t)}`; return +Clock.today().slice(5, 7) >= 9 ? e : this.addYears(e, -1); },
  addYears(ymd, n) { return `${+ymd.slice(0, 4) + n}${ymd.slice(4)}`; },

  // ---------- 가치 ----------
  // 0~100 점수. 1군 주전 평균 60~70, 리그 정상급 85+, 페이커급 95+
  score(p, t) {
    if (p._sc != null) return p._sc;
    let s;
    if (this.stars[p.id]) s = this.stars[p.id];
    else if (p.ca != null || p.level === 'cl' || p.level === 'academy' || p.gen || p.made) s = 26 + (p.ca || 8) * 2.2; // 2군 출신은 현재 기량으로
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
    // 1군 선수: 실력 연봉(OVR) × 평판 배수 (js/fame.js). 코치·OVR 없는 선수는 예전 점수 곡선
    if (tier === 'first' && p.role !== 'COACH' && p.ovr != null) return this.r1(Math.max(this.MIN.first, Fame.pay(p, league)));
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
  // 부임 유예: 새로 맡은 팀에서 계약이 이미 끝났거나 곧 끝나는 선수 · 코치는 부임일 + days까지 늘려 둔다
  // (커리어 첫날이 스토브리그 첫날이라 예전에는 하루 만에 주전이 FA로 나갔다)
  grace(t, days = 10) {
    const until = Store.addDays(Clock.today(), days);
    void until;   // 더 이상 만료일을 늘리지 않는다: 선수는 모든 팀과 같은 날 만료되고 '계약 만료 선수' 명단에서 협상, 코치진은 만료되면 사무국이 1년 연장한다
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
  // 계약 기간 표기: 2년 + 구단 옵션 → "2+1년 (구단 옵션)"
  term(years, option) { return option ? `${years}+1년 (${this.OPT[option]})` : `${years}년`; },
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
      if (!dest || p.role === 'COACH') return;
      if (dest === from) { if (from.cl && from.cl.includes(p)) { from.cl = from.cl.filter(x => x !== p); from.players.push(p); p.level = 'first'; } return; } // 같은 팀 2군 → 1군 콜업
      from.players = from.players.filter(x => x !== p); if (from.cl) from.cl = from.cl.filter(x => x !== p);
      p.team = dest.id; p.free = to === 'free'; p.sub = false;
      if (p.free) p.contractEnd = null; else p.level = 'first';
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
    if (teamId !== App.state.teamId) delete Squad.moves()[pid];
    Squad.apply();
  },
  // 구단 표준 조건: 다른 구단이 만료 선수에게 주는 조건과 같다 (Market.deal, 원클럽맨은 연봉을 깎는다)
  stdOffer(p, t) {
    const P = typeof Persona !== 'undefined' ? Persona.of(p) : null, one = P && P.tag === 'oneclub' && P.club === t.id;
    return Market.deal(p, t, one ? P.cut : 1.08);
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
  const t = Roster.team(); if (!t || App.state.unemployed) return;   // 무직이면 옛 구단 계약은 AI가 처리한다 (Market.ai)
  const board = { name: '사무국장', role: 'board' };
  // 코칭스태프는 사무국이 1년씩 자동 연장한다 (코치 영입·해임은 추후)
  (t.staff || []).forEach(p => {
    const c = Contract.of(p, t);
    if (!c.end || c.end >= today) return;
    const end = Contract.addYears(c.end, 1);
    Contract.st().contracts[p.id] = { ...c, end, signed: today }; p.contractEnd = end;
    Inbox.push({ from: board, subject: `${p.name} 코치 계약 1년 연장`, link: 'club-staff', body: `${p.name} 코치의 계약이 끝나 사무국이 같은 조건으로 1년 연장했습니다. 새 만료일은 ${Fmt.dayLabel(end)}입니다.` });
  });
  // 2군 선수도 계약이 끝나면 같은 조건으로 1년 연장 (만료일이 지난 날짜로 남아 있던 문제). 내보내려면 방출을 쓴다.
  // 단, 1군 계약(연봉 1억 넘게)으로 챌린저스에 내려간 선수는 자동 연장하지 않는다 → 아래 1군과 똑같이 만료 안내 · FA
  const big = p => Contract.of(p, t).salary > 1;
  const clRenew = [];
  (t.cl || []).forEach(p => {
    const c = Contract.of(p, t);
    if (!c.end || c.end >= today || big(p)) return;
    let end = Contract.addYears(c.end, 1); while (end < today) end = Contract.addYears(end, 1);
    Contract.st().contracts[p.id] = { ...c, end, signed: today }; p.contractEnd = end; clRenew.push(p.name);
  });
  if (clRenew.length) Inbox.push({ from: board, subject: `2군 계약 1년 연장 (${clRenew.length}명)`, link: 'roster-challengers', body: `계약이 끝난 2군 선수 ${clRenew.join(', ')}의 계약을 같은 조건으로 1년 연장했습니다.\n\n내보낼 선수는 챌린저스 화면에서 방출할 수 있습니다.` });
  [...t.players, ...(t.cl || []).filter(big)].forEach(p => {
    const c = Contract.of(p, t), d = c.end ? Fmt.daysBetween(today, c.end) : null;
    if (d == null) return;
    if (c.option === 'team' && d <= 7 && d >= 0 && Engine.once('topt:' + p.id + c.end)) Inbox.push({ from: board, subject: `${p.name} 구단 옵션 행사 여부`, priority: 'todo', ctx: { pid: p.id, player: p.name },
      body: `${p.name}의 계약(${c.end.replace(/-/g, '.')} 만료)에는 1년 연장 구단 옵션이 있습니다.\n\n옵션을 행사하면 지금 연봉(${Player.money(c.salary)} 원) 그대로 1년 더 함께합니다. 포기하면 계약 만료일에 FA로 풀립니다.`,
      choices: [{ label: '옵션 행사 (1년 연장)', act: 'optExercise', reply: '옵션 행사를 선수 측에 통보했습니다.' }, { label: '옵션 포기', act: 'optDecline', reply: '옵션을 행사하지 않기로 했습니다. 재계약하지 않으면 만료일에 FA가 됩니다.' }] });
    // 미리 알림 (60일 · 30일 전) + 14일 전에 '재계약 의사 확인': 다른 팀이 만료 때 하는 판정과 같은 조건 · 같은 기준으로 붙잡아 볼 수 있다
    if ((d === 60 || d === 30) && Engine.once(`exp${d}:` + p.id + c.end)) Inbox.push({ from: board, subject: `${p.name} 계약 만료 ${d}일 전`, link: 'roster-contracts', ctx: { pid: p.id },
      body: `${p.name}(${G.ROLE_KO[p.role] || '코치'})의 계약이 ${Fmt.dayLabel(c.end)}에 끝납니다. 붙잡으려면 미리 재계약 협상을 시작하는 게 좋습니다.` });
    if (d === 14 && p.role !== 'COACH' && Engine.once('exp14:' + p.id + c.end)) {
      const o = Contract.stdOffer(p, t);
      Inbox.push({ from: board, subject: `${p.name} 재계약 의사 확인`, priority: 'todo', link: 'roster-contracts', ctx: { pid: p.id, player: p.name },
        body: `${p.name}의 계약이 ${Fmt.dayLabel(c.end)}에 끝납니다. 다른 구단들이 만료 선수에게 내미는 것과 같은 구단 표준 조건으로 붙잡아 볼 수 있습니다.\n\n표준 조건: 연봉 ${Player.money(o.salary)} 원 · ${Contract.term(o.years, o.option)}\n\n선수가 남을지는 선수 성향에 달려 있습니다. 조건을 직접 정하고 싶으면 재계약 협상을 여세요.`,
        choices: [{ label: `표준 조건으로 재계약 제안 (${Player.money(o.salary)} 원 · ${o.years}년)`, act: 'stdRenew', reply: '선수 측에 구단 표준 조건을 전달했습니다.' },
          { label: '직접 협상하겠다', act: 'none', reply: '선수 정보 창의 재계약 협상에서 조건을 제시하세요.' },
          { label: '재계약하지 않는다', act: 'none', reply: '계약이 끝나면 FA로 풀리게 됩니다.' }] });
    }
    if (d === 3 && Engine.once('exp3:' + p.id + c.end)) Inbox.push({ from: board, subject: `${p.name} 계약 만료 3일 전`, priority: 'todo', link: 'roster-contracts', ctx: { pid: p.id },
      body: `${p.name}(${G.ROLE_KO[p.role] || '코치'})의 계약이 ${Fmt.dayLabel(c.end)}에 끝납니다.\n\n그 전에 재계약하지 않으면 FA로 풀려 다른 팀과 자유롭게 협상할 수 있습니다.` });
    if (d >= 0) return;
    if (Neg.held(Contract.st().neg[p.id])) return;                          // 재계약 합의 후 사인 대기 중이면 풀지 않는다
    if (c.option === 'player') {
      const stay = Persona.stays(p, t, c.end + 'po') || ((World.morale()[p.id] || 0) >= 3 && G.rand(p.id + c.end, 'popt') < .4);   // 다른 팀과 같은 성향 기준 + 사기가 아주 좋으면 조금 더
      if (stay) {
        Contract.exercise(p.id);
        Inbox.push({ from: board, subject: `${p.name}, 선수 옵션 행사 — 1년 잔류`, body: `${Sim.josa(p.name, '이', '가')} 계약서의 선수 옵션을 행사했습니다. 지금 조건 그대로 1년 더 뜁니다.` });
        return;
      }
      Inbox.push({ from: board, subject: `${p.name}, 선수 옵션 포기 — FA 시장으로`, priority: 'urgent', link: 'recruit-fa', body: `${Sim.josa(p.name, '이', '가')} 선수 옵션을 쓰지 않고 FA 시장에 나가기로 했습니다.\n\n다시 데려오려면 FA 시장에서 새 계약을 제시해야 합니다.` });
    } else Inbox.push({ from: board, subject: `${p.name}, 계약 만료`, priority: 'urgent', link: 'roster-contracts',
      body: `${p.name}의 계약이 끝났습니다. 계약 현황의 '계약 만료 선수'에 남아 있습니다.\n\n${Persona.stays(p, t, c.end) ? `선수는 ${t.short}에 남는 쪽을 먼저 생각하고 있어 열흘 동안은 우리 제안을 기다립니다.` : '선수는 다른 팀 제안도 들어 보고 싶어 합니다. 서두르지 않으면 다른 팀이 먼저 데려갈 수 있습니다.'} 재계약하려면 재계약 협상을, 보내려면 Thank you를 눌러 작별 인사를 전하세요.` });
    Market.post(`[FA] ${p.name}, ${Sim.josa(t.short, '과', '와')} 계약 만료 — FA 시장으로`, `${t.name}의 ${G.ROLE_KO[p.role] || ''} ${p.name}(${p.age || '-'}세)이(가) 재계약하지 않고 FA 시장에 나왔습니다.`, p.id);
    Contract.release(p.id); Lapse.add(p, t);
  });
});

// 계약서의 역할 약속: 매달 1일 확인. 주전 보장인데 후보·2군이면 사기가 떨어지고, 두 달 연속이면 이적을 요청한다.
Engine.on(today => {
  if (today.slice(8) !== '01') return;
  const t = Roster.team(); if (!t || App.state.unemployed) return;
  const all = [...t.players, ...(t.cl || []), ...(t.academy || [])], mor = World.morale();
  (App.state.promises || []).filter(x => x.src === 'contract' && !x.over).forEach(pr => {
    const p = all.find(x => x.id === pr.pid);
    if (!p || (pr.due && pr.due < today)) { pr.over = true; return; }
    const broken = pr.kind === 'starter' ? p.level !== 'first' || p.sub : p.level !== 'first';
    if (!broken) { pr.strikes = 0; return; }
    pr.strikes = (pr.strikes || 0) + 1;
    mor[p.id] = (mor[p.id] || 0) - 2;
    if (pr.strikes === 1) Inbox.push({ from: { name: p.name, role: 'player' }, subject: `${p.name}, 계약 때 약속에 대해 면담 요청`, priority: 'todo', link: 'roster-first-team',
      body: `감독님, 계약할 때 ${Sim.josa(Contract.PROMISE[pr.kind], '을', '를')} 약속하셨는데 지금은 그렇지 않습니다.

다음 달에도 이대로라면 저도 다른 길을 생각해 볼 수밖에 없습니다.` });
    else {
      pr.over = true; mor[p.id] -= 3; World.apply({ squad: -3 }, {});
      Inbox.push({ from: { name: p.name, role: 'player' }, subject: `${p.name}, 이적 요청`, priority: 'urgent', link: 'recruit-offers',
        body: `약속이 지켜지지 않아 이적을 요청합니다. 에이전트에게 다른 팀을 알아보라고 했습니다.

(선수단 신뢰가 떨어졌고, 다른 구단의 이적 제안이 늘어납니다)` });
      (Contract.st().listed ||= {})[p.id] = today;
    }
  });
});

// LCK 균형 지출 제도: 상위 5인 연봉 합산이 상한을 넘으면 11월 1일에 부담금을 낸다. 6월 1일에 예상액을 알린다.
Engine.on(today => {
  const t = Roster.team(); if (!t || t.league !== 'LCK' || App.state.unemployed) return;
  const md = today.slice(5);
  if (md !== '06-01' && md !== '11-01') return;
  const { used, tax } = Club.tax(t);
  if (!tax) return;
  const board = { name: '사무국장', role: 'board' };
  if (md === '06-01') Inbox.push({ from: board, subject: '균형 지출 부담금 예상', priority: 'todo', link: 'club-salary-cap', body: `상위 5인 연봉 합산이 ${Player.money(used)} 원으로 상한(${Club.CAP.LCK.cap}억)을 넘었습니다.

지금 그대로면 11월 1일에 부담금 약 ${Player.money(tax)} 원을 내야 합니다.` });
  else { World.ledger().push({ date: today, label: '균형 지출 부담금', amount: -Math.round(tax * 1e8) }); World.apply({ board: tax >= 10 ? -3 : -1 }, {}); Inbox.push({ from: board, subject: `균형 지출 부담금 ${Player.money(tax)} 원 납부`, body: `올 시즌 상위 5인 연봉 합산 ${Player.money(used)} 원 기준으로 부담금을 냈습니다. 이사회가 지출에 신경 쓰고 있습니다.` }); }
});

// 연봉 예산 점검 (매달 1일): 선수단 연봉이 예산의 65%를 넘으면 이사회 신뢰가 떨어진다. 많이 넘으면 크게.
Engine.on(today => {
  const t = Roster.team(); if (!t || App.state.unemployed || today.slice(8) !== '01') return;
  const room = Club.wageRoom(t), B = Club.budget(t); if (room >= 0) return;
  const big = room < -B * .1, board = { name: '사무국장', role: 'board' };
  World.apply({ board: big ? -3 : -1 }, {});
  Inbox.push({ from: board, subject: big ? '재정 경고: 연봉 지출이 예산을 크게 넘었습니다' : '연봉 지출이 예산을 넘었습니다', priority: big ? 'urgent' : 'todo', link: 'club-finance',
    body: `선수단 연봉이 예산보다 ${Player.money(-room)} 원 많습니다.\n\n${big ? '이대로면 이사회 신뢰가 매달 크게 떨어집니다. 연봉이 높은 선수를 정리하거나 트레이드로 지출을 줄여 주세요.' : '당분간 큰 계약은 이사회 승인을 받기 어렵습니다.'}` });
});

// '재계약 의사 확인'에서 표준 조건 제안: 다른 구단과 같은 판정 (선수 성향) + 우리 연봉 예산
Engine.ACTS.stdRenew = m => {
  const hit = Player.find(m.ctx.pid), t = Roster.team(); if (!hit || hit.t !== t) { m.choices[0].reply = '그사이 상황이 바뀌어 제안할 수 없습니다.'; return; }
  const p = hit.p, o = Contract.stdOffer(p, t), cur = Contract.of(p, t).salary || 0;
  const over = Club.wageRoom(t) + cur - o.salary < 0 && o.salary > cur && World.rel().board < 55;
  if (over) { m.choices[0].reply = '이사회가 연봉 예산 초과를 이유로 승인하지 않았습니다. 다른 지출을 줄이거나 직접 협상해 보세요.'; return; }
  if (!Persona.stays(p, t, Contract.of(p, t).end)) { m.choices[0].reply = `${Sim.josa(p.name, '이', '가')} 표준 조건을 거절했습니다. ${Persona.line(p)} 직접 협상하면 마음을 돌릴 수도 있습니다.`; return; }
  const c = Contract.of(p, t), end = Contract.addYears(c.end, o.years);
  Contract.sign(p.id, t.id, { salary: o.salary, end, option: o.option, years: o.years, bonus: [] });
  m.choices[0].reply = `${Sim.josa(p.name, '이', '가')} 표준 조건을 받아들였습니다. 연봉 ${Player.money(o.salary)} 원 · ${Contract.label({ end, option: o.option })}까지.`;
  Market.post(`[오피셜] ${t.short}, ${Sim.josa(p.name, '과', '와')} 재계약`, `${Sim.josa(t.name, '이', '가')} ${G.ROLE_KO[p.role] || ''} ${Sim.josa(p.name, '과', '와')} 재계약했습니다. 계약은 ${Contract.label({ end, option: o.option })}까지입니다.`, p.id);
};
Engine.ACTS.none ||= () => {};

// ── 계약 만료 선수 ──
// 계약이 끝난 선수는 FA가 되지만 원 소속팀의 '계약 만료' 명단에 남는다. 거기서 재계약하거나, 'Thank you'(작별 인사)를 띄우거나,
// 다른 팀이 데려가면 명단에서 사라진다. 다른 구단은 놓아준 선수에게 며칠 뒤 Thank you 기사를 낸다.
// 만료 직후 열흘은 남을 마음이 있는 선수가 원 소속팀 제안을 기다린다 (다른 팀과 같은 기회) — Market.shop의 FA 결정에서 본다
const Lapse = {
  WAIT: 10,
  st() { return (Contract.st().lapsed ||= {}); },
  add(p, t) { this.st()[p.id] = { team: t.id, date: Clock.today() }; },
  of(pid) { return this.st()[pid] || null; },
  mine() { const me = App.state.teamId; return Object.entries(this.st()).filter(([, v]) => v.team === me && !v.thanked).map(([pid, v]) => ({ p: (Player.find(pid) || {}).p, ...v })).filter(x => x.p && x.p.free); },
  // 원 소속팀 제안을 기다리나: 만료 열흘 안 · 작별 전 · 남을 마음이 있거나 그 팀과 협상 중
  waits(p) {
    const L = this.of(p.id); if (!L || L.thanked || Fmt.daysBetween(L.date, Clock.today()) > this.WAIT) return false;
    const t = App.db.teams.find(x => x.id === L.team), S = Contract.st().neg[p.id];
    const talking = S && !S.done && !(S.cool && S.cool > Clock.today()) && Fmt.daysBetween(S.date, Clock.today()) <= 3;
    return !!t && (talking || (typeof Persona !== 'undefined' && Persona.stays(p, t, L.date)));
  },
  thank(pid, silent) {
    const L = this.of(pid), hit = Player.find(pid); if (!L || !hit) return;
    L.thanked = Clock.today();
    const t = App.db.teams.find(x => x.id === L.team), p = hit.p, me = Roster.team();
    if (silent && !(me && t.league === me.league) && (p.ovr || 0) < 85) return;   // 다른 리그 작별 기사는 정상급 선수만 (뉴스가 넘치지 않게)
    Market.post(`[Thank you] ${t.short}, ${Sim.josa(p.name, '과', '와')} 작별`, `${Sim.josa(t.name, '이', '가')} 계약이 끝난 ${G.ROLE_KO[p.role] || ''} ${p.name}에게 작별 인사를 전했습니다. "${p.name} 선수, 그동안 ${t.short}에서 보여 준 모든 순간에 감사합니다. 앞날을 응원합니다." ${Sim.josa(p.name, '은', '는')} 이제 FA 시장에서 새 팀을 찾습니다.`, pid);
    if (!silent && t.id === App.state.teamId) UI.toast(`${p.name} 선수에게 작별 인사를 전했습니다`, 3000);
  },
  // 누군가와 계약하면 명단에서 뺀다
  signed(pid) { delete this.st()[pid]; },
  // 다른 구단: 놓아준 선수에게 3~7일 뒤 Thank you
  daily(today) {
    Object.entries(this.st()).forEach(([pid, L]) => {
      const hit = Player.find(pid);
      if (!hit || !hit.p.free) { delete this.st()[pid]; return; }          // 이미 어딘가와 계약
      if (L.thanked) { if (Fmt.daysBetween(L.thanked, today) > 60) delete this.st()[pid]; return; }
      if (L.team !== App.state.teamId && Fmt.daysBetween(L.date, today) >= 3 + Math.floor(G.rand(pid, 'ty') * 5)) this.thank(pid, true);
    });
  },
};
Engine.on(today => { if (App.state.teamId) Lapse.daily(today); });
// 계약이 생기면 만료 명단에서 뺀다
(() => { const sign = Contract.sign.bind(Contract); Contract.sign = (pid, teamId, c) => { Lapse.signed(pid); delete (Contract.st().fadl || {})[pid]; delete Market.fa()[pid]; return sign(pid, teamId, c); }; })();

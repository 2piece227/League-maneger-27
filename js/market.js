// 다른 구단 AI: 계약 만료 선수 재계약/방출 판단 · 스토브리그 FA 영입 경쟁 · 2군 콜업 · 오피셜 뉴스
// 협상 과정은 보이지 않고 결과만 뉴스로 나온다. FA는 받은 제안을 며칠 모았다가 가장 좋은 곳을 고른다(우리 제안이 먼저 사인되면 끝).
const Market = {
  news() { return (Contract.st().news ||= []); },
  post(title, body, pid) { const n = this.news(); n.unshift({ date: Clock.today(), title, body, pid }); if (n.length > 300) n.length = 300; },
  fa() { return (Contract.st().fa ||= {}); },
  ai() { return App.db.teams.filter(t => t.id !== App.state.teamId); },
  rnd(...k) { return G.rand((App.state.seed || '') + '|' + k.join('|'), 'mk'); },
  best(t, role, except) { return t.players.filter(x => x.role === role && x !== except).reduce((b, x) => Math.max(b, Contract.score(x, t)), 0); },
  stove(today) { return Schedule.events.some(e => e.kind === 'stove' && e.start <= today && today <= e.end); },

  // 계약을 새로 쓰되 Squad.apply 는 나중에 한 번만
  write(p, t, c) { const M = Contract.st(); M.contracts[p.id] = { ...c, signed: Clock.today() }; if (p._o && p._o.team === t.id && !p.free) delete M.moves[p.id]; else M.moves[p.id] = t.id; },
  free(p) { const M = Contract.st(); M.moves[p.id] = 'free'; delete M.contracts[p.id]; },
  deal(p, t, mult = 1) {
    const s = Contract.score(p, t), yrs = s >= 80 ? 2 + (this.rnd(p.id, 'y') > .5 ? 1 : 0) : 1 + (this.rnd(p.id, 'y') > .55 ? 1 : 0);
    const r = this.rnd(p.id, 'o');
    return { salary: Contract.r1(Contract.pay(p, s, t.league) * mult), end: Contract.addYears(Contract.seasonEnd(t), yrs), years: yrs, option: r < .2 ? (s >= 78 ? 'player' : 'team') : null, bonus: [] };
  },

  // ---------- 만료일: 재계약 or FA ----------
  expire(today) {
    let changed = false;
    this.ai().forEach(t => {
      (t.staff || []).forEach(p => { const c = Contract.of(p, t); if (c.end && c.end < today) Contract.st().contracts[p.id] = { ...c, end: Contract.addYears(c.end, 1), signed: today }; });
      [...t.players, ...(t.cl || [])].forEach(p => {
        const c = Contract.of(p, t); if (!c.end || c.end >= today) return;
        changed = true;
        if (p.made) { Contract.st().contracts[p.id] = { ...c, end: Contract.addYears(c.end, 1 + (this.rnd(p.id, 'm') > .5 ? 1 : 0)) }; return; }
        const s = Contract.score(p, t), cl = p.level === 'cl', top = !cl && s >= this.best(t, p.role, p) - 3;
        if (c.option === 'player' && this.rnd(p.id, c.end, 'po') < .5 + ((t.rep || 2) - 3) * .12) { Contract.st().contracts[p.id] = { ...c, end: Contract.addYears(c.end, 1), option: null }; return; }
        if (c.option === 'team' && top) { Contract.st().contracts[p.id] = { ...c, end: Contract.addYears(c.end, 1), option: null }; return; }
        const keep = cl ? (p.ca || 8) >= 10.5 || this.rnd(p.id, 'k') < .45 : top ? this.rnd(p.id, 'k') < .8 : this.rnd(p.id, 'k') < .35;
        const stay = this.rnd(p.id, 'st') < (cl ? .85 : .75 + ((t.rep || 2) - 3) * .06);
        if (keep && stay) {
          this.write(p, t, this.deal(p, t, 1 + this.rnd(p.id, 'r') * .15));
          if (s >= 75) this.post(`[오피셜] ${t.short}, ${p.name}와 재계약`, `${t.name}이(가) ${G.ROLE_KO[p.role] || ''} ${p.name}과(와) 재계약했습니다. 계약은 ${Contract.label(Contract.st().contracts[p.id])}까지입니다.`, p.id);
        } else {
          this.free(p);
          if (s >= 65 || (cl && (p.ca || 0) >= 11)) this.post(`[FA] ${p.name}, ${t.short}와 계약 만료 — FA 시장으로`, `${t.name}의 ${G.ROLE_KO[p.role] || ''} ${p.name}(${p.age || '-'}세)이(가) 재계약하지 않고 FA 시장에 나왔습니다.`, p.id);
        }
      });
    });
    if (changed) Squad.apply();
  },

  // ---------- 스토브리그: 빈자리·약한 자리에 FA 제안, 없으면 2군 콜업 ----------
  shop(today) {
    const stove = this.stove(today), free = App.db.free.players, F = this.fa();
    let changed = false;
    this.ai().forEach(t => {
      if (t.players.length >= 7 || this.rnd(t.id, today, 'shop') > (stove ? .35 : .08)) return;
      const gaps = G.ROLES.map(role => ({ role, cur: this.best(t, role) })).sort((a, b) => a.cur - b.cur);
      const g = gaps[0], empty = !g.cur;
      if (!stove && !empty) return;
      let room = Club.wageRoom(t) + (empty ? 3 : 0);
      const cands = free.filter(p => p.role === g.role && !(F[p.id] || []).some(o => o.team === t.id)).map(p => ({ p, s: Contract.score(p, t) }))
        .filter(({ p, s }) => s > g.cur + 4 && (s < 85 || (t.rep || 2) >= 3)
          && (p.nation !== 'South Korea' || t.league === 'LCK' || this.rnd(p.id, t.id, 'ko') < .35 + (s >= 80 ? .2 : 0))
          && (t.league !== 'LCK' || p.nation === 'South Korea' || this.rnd(p.id, t.id, 'imp') < .15)
          && Contract.pay(p, s, t.league) <= room)
        .sort((a, b) => b.s - a.s);
      const st = Schedule.events.find(e => e.kind === 'stove' && e.start <= today && today <= e.end);
      const late = !st || Fmt.daysBetween(st.start, today) >= 7;                      // 스토브 1주가 지나도 빈자리면 2군에서 올린다
      const pick = empty && late && (t.cl || []).some(p => p.role === g.role) ? null : cands[0];
      if (pick) {
        (F[pick.p.id] ||= []).push({ team: t.id, mult: 1.02 + this.rnd(pick.p.id, t.id, 'm') * .2, until: Store.addDays(today, 2 + Math.floor(this.rnd(pick.p.id, 'u') * 3)) });
        return;
      }
      if (empty) {
        const up = (t.cl || []).filter(p => p.role === g.role).sort((a, b) => (b.ca || 0) - (a.ca || 0))[0];
        if (up) { Contract.st().moves[up.id] = t.id; changed = true; this.post(`${t.short}, 2군 ${up.name} 1군 콜업`, `${t.name}이(가) 비어 있던 ${G.ROLE_KO[g.role]} 자리에 2군 ${up.name}을(를) 올렸습니다.`, up.id); }
      }
    });
    // 제안 마감: 가장 좋은 조건(연봉 + 팀 명성 + 리그)을 고른다
    Object.entries(F).forEach(([pid, offers]) => {
      const hit = Player.find(pid);
      if (!hit || !hit.p.free) { delete F[pid]; return; }
      if (!offers.some(o => o.until <= today)) return;
      if (Neg.held(Contract.st().neg[pid])) return;                                       // 우리와 합의 후 사인 대기 중
      const p = hit.p;
      const util = o => { const t = App.db.teams.find(x => x.id === o.team); return o.mult * Contract.pay(p, Contract.score(p, t), t.league) / Contract.pay(p, Contract.score(p, t), 'LCK') * .5 + (t.rep || 2) * .08 + (p.nation === 'South Korea' && t.league === 'LCK' ? .25 : 0); };
      const o = offers.filter(x => { const t = App.db.teams.find(y => y.id === x.team); return t && t.players.length < 7; }).sort((a, b) => util(b) - util(a))[0];
      delete F[pid];
      if (!o) return;
      const t = App.db.teams.find(x => x.id === o.team);
      this.write(p, t, this.deal(p, t, o.mult)); changed = true;
      const s = Contract.score(p, t);
      const back = p._o && p._o.team === t.id;                                            // FA로 나왔다가 원 소속팀과 다시 계약
      this.post(back ? `[오피셜] ${p.name}, ${t.short} 잔류` : `[오피셜] ${p.name}, ${t.short} 입단`,
        (back ? `FA ${p.name}이(가) 원 소속팀 ${t.name}과(와) 다시 계약했습니다.` : `FA ${p.name}이(가) ${t.name}과(와) 계약했습니다.`) + (offers.length > 1 ? ` ${offers.length}개 팀이 경쟁한 끝에 ${t.short}을(를) 택했습니다.` : ''), p.id);
      const neg = Contract.st().neg[pid], talking = !!(neg && !neg.signed && neg.mode === 'fa' && Fmt.daysBetween(neg.date, today) <= 14);
      if (talking || Player.shortlist().includes(pid) || s >= 82)
        Inbox.push({ from: { name: '스카우트 팀', role: 'coach' }, subject: `${p.name}, ${t.short}와 계약`, priority: talking ? 'todo' : 'normal', link: 'portal-news',
          body: `${talking ? (neg.deal ? '합의했지만 사인하지 않았던 ' : '협상 중이던 ') : Player.shortlist().includes(pid) ? '관심 목록에 있던 ' : ''}${p.name}이(가) ${t.name}과(와) 계약했습니다.` });
      if (neg) { neg.done = true; neg.lapsed = true; }
    });
    if (changed) Squad.apply();
  },
  rivals(pid) { return (this.fa()[pid] || []).length; },
};
Engine.on(today => { if (!App.db.free) return; Market.expire(today); Market.shop(today); });

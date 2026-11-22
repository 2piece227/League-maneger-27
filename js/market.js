// 다른 구단 AI: 계약 만료 선수 재계약/방출 판단 · 스토브리그 FA 영입 경쟁 · 2군 콜업 · 오피셜 뉴스
// 협상 과정은 보이지 않고 결과만 뉴스로 나온다. FA는 받은 제안을 며칠 모았다가 가장 좋은 곳을 고른다(우리 제안이 먼저 사인되면 끝).
const Market = {
  news() { return (Contract.st().news ||= []); },
  // delay 1 = 다음 날 오피셜 (우리 구단 계약은 사인 다음 날 발표)
  post(title, body, pid, delay = 0) { const n = this.news(); n.unshift({ date: delay ? Store.addDays(Clock.today(), delay) : Clock.today(), title, body, pid }); if (n.length > 300) n.length = 300; },
  fa() { return (Contract.st().fa ||= {}); },
  ai() { return App.db.teams.filter(t => App.state.unemployed || t.id !== App.state.teamId); },   // 무직이면 옛 구단도 AI가 운영한다
  rnd(...k) { return G.rand((App.state.seed || '') + '|' + k.join('|'), 'mk'); },
  // 이 연봉으로 붙잡을 수 있나: 상위 5인 연봉 합이 재정 등급별 한도 안 (부담금을 얼마나 감수하는 구단인가)
  //   재정 5 → 상한의 3.75배(150억)까지 · 4 → 2배(80억) · 3 → 1.35배(54억) · 2 → 1.1배 · 1 → 상한까지 (LCK 상한 40억). T1 · HLE만 부담금을 크게 감수한다
  affords(t, p, salary) {
    if (t.league !== 'LCK') return Club.wageRoom(t) + Player.salary(p, t) - salary > -Club.budget(t) * .05;
    const lim = Club.CAP.LCK.cap * ({ 5: 3.75, 4: 2, 3: 1.35, 2: 1.1, 1: 1 }[t.fin || 2] || 1.1);
    return Club.tax(t, { pid: p.id, salary }).used <= lim;
  },
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
      (t.staff || []).forEach(p => { const c = Contract.of(p, t); if (c.end && c.end < today) { const end = Contract.addYears(c.end, 1); Contract.st().contracts[p.id] = { ...c, end, signed: today }; p.contractEnd = end; } });
      [...t.players, ...(t.cl || [])].forEach(p => {
        const c = Contract.of(p, t); if (!c.end || c.end >= today) return;
        changed = true;
        if (p.made) { Contract.st().contracts[p.id] = { ...c, end: Contract.addYears(c.end, 1 + (this.rnd(p.id, 'm') > .5 ? 1 : 0)) }; return; }
        const s = Contract.score(p, t), cl = p.level === 'cl', top = !cl && s >= this.best(t, p.role, p) - 3;
        const P0 = Persona.of(p);
        if (c.option === 'player' && P0.tag !== 'career' && this.rnd(p.id, c.end, 'po') < .3 + P0.w.loyal * .4 + ((t.rep || 2) - 3) * .1) { Contract.st().contracts[p.id] = { ...c, end: Contract.addYears(c.end, 1), option: null }; return; }
        if (c.option === 'team' && top && P0.tag !== 'career' && this.affords(t, p, c.salary)) { Contract.st().contracts[p.id] = { ...c, end: Contract.addYears(c.end, 1), option: null }; return; }
        // 구단: 붙잡고 싶은가 + 돈이 되는가 (상위 5인 연봉이 재정 등급에 맞는 선을 넘으면 비싼 선수는 놓아준다 — 샐러리캡에 막힌 GEN처럼)
        // 선수: 성향 (원클럽맨은 연봉을 깎고서라도 남고, 커리어 우선은 떠나고, 의리가 클수록 남는다)
        const P = Persona.of(p), one = P.tag === 'oneclub' && P.club === t.id;
        const mult = one ? P.cut : 1 + this.rnd(p.id, 'r') * .15, offer = this.deal(p, t, mult);
        const afford = cl || one || this.affords(t, p, offer.salary);
        const keep = afford && (one || (cl ? (p.ovr || 0) >= 70 || this.rnd(p.id, 'k') < .45 : top ? this.rnd(p.id, 'k') < .8 : this.rnd(p.id, 'k') < .35));
        const stay = one || (P.tag !== 'career' && !(P.tag === 'homecoming' && !P.fav.includes(t.id)) && !(P.tag === 'coach' && !Persona.likes(p, t)) &&   // 친정팀 선호 · 따라가고 싶은 코치가 다른 팀에 있으면 FA로 나가 본다
           this.rnd(p.id, 'st') < (cl ? .85 : .55 + P.w.loyal * .45 + ((t.rep || 2) - 3) * .05 - (P.w.win > .5 && (t.rep || 2) <= 3 ? .2 : 0)));
        if (!afford && !cl && s >= 75) p._capOut = t.id;                         // 재정 때문에 놓아준 선수 (뉴스 문구)
        if (keep && stay) {
          this.write(p, t, offer);
          if (s >= 75) this.post(`[오피셜] ${t.short}, ${Sim.josa(p.name, '과', '와')} 재계약`, `${Sim.josa(t.name, '이', '가')} ${G.ROLE_KO[p.role] || ''} ${Sim.josa(p.name, '과', '와')} 재계약했습니다. 계약은 ${Contract.label(Contract.st().contracts[p.id])}까지입니다.`, p.id);
        } else {
          this.free(p);
          if (s >= 65 || (cl && (p.ovr || 0) >= 74)) this.post(`[FA] ${p.name}, ${Sim.josa(t.short, '과', '와')} 계약 만료 — FA 시장으로`, `${t.name}의 ${G.ROLE_KO[p.role] || ''} ${p.name}(${p.age || '-'}세)이(가) ${p._capOut === t.id ? '구단의 연봉 여력이 부족해 재계약하지 못하고' : '재계약하지 않고'} FA 시장에 나왔습니다.`, p.id);
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
      // 포지션별 인원 (이미 제안을 넣어 둔 포지션은 그 FA까지 센다): 빈 포지션 우선, 한 포지션 2명까지
      const n = r => t.players.filter(x => x.role === r).length, asked = r => Object.entries(F).some(([pid, os]) => os.some(o => o.team === t.id) && (Player.find(pid) || { p: {} }).p.role === r);
      const gaps = G.ROLES.filter(r => n(r) < 2 && !asked(r)).map(role => ({ role, cur: this.best(t, role) })).sort((a, b) => a.cur - b.cur);
      const g = gaps[0]; if (!g) return;
      const empty = !g.cur;
      if (!empty && (t.players.length >= 6 || this.rnd(t.id, today, 'shop') > (stove ? .35 : .08))) return;   // 빈자리는 매일 찾는다. 1군은 주전 5명 + 후보 1명까지 (LoL 팀은 후보를 거의 두지 않는다)
      if (!stove && !empty) return;
      let room = Club.wageRoom(t) + (empty ? 3 : 0);
      const cands = free.filter(p => p.role === g.role && !this.resting(p.id, today) && !(F[p.id] || []).some(o => o.team === t.id)).map(p => ({ p, s: Contract.score(p, t) }))
        .map(x => ({ ...x, s: x.s + (typeof Persona !== 'undefined' ? Persona.likes(x.p, t) * 15 : 0) }))
        .filter(({ p, s }) => s > g.cur + 4 && (s < 85 || (t.rep || 2) >= 3 || (typeof Persona !== 'undefined' && Persona.likes(p, t)))
          && (p.nation !== 'South Korea' || t.league === 'LCK' || this.rnd(p.id, t.id, 'ko') < .35 + (s >= 80 ? .2 : 0))
          && (t.league !== 'LCK' || p.nation === 'South Korea' || this.rnd(p.id, t.id, 'imp') < .15)
          && Contract.pay(p, s, t.league) <= room && this.affords(t, p, Contract.pay(p, s, t.league)))   // 샐러리캡 기준으로도 감당되는 선수만
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
        if (up) { Contract.st().moves[up.id] = t.id; changed = true; this.post(`${t.short}, 2군 ${up.name} 1군 콜업`, `${Sim.josa(t.name, '이', '가')} 비어 있던 ${G.ROLE_KO[g.role]} 자리에 2군 ${Sim.josa(up.name, '을', '를')} 올렸습니다.`, up.id); }
        else if (late || !stove) {
          // 2군도 없으면 그 포지션 FA 중 가장 나은 선수와 바로 계약 (주전 없이 공식전에 나가지 않게)
          // 연봉 여력 안에서 가장 나은 선수 (예전에는 연봉을 보지 않아, 돈 때문에 놓아준 선수를 바로 다시 데려왔다). 그런 선수가 없으면 가장 싼 선수
          const pool = free.filter(p => p.role === g.role && !Neg.held(Contract.st().neg[p.id])), fit = pool.filter(p => this.affords(t, p, Contract.pay(p, Contract.score(p, t), t.league)));
          const fb = (fit.length ? fit.sort((a, b) => Contract.score(b, t) - Contract.score(a, t)) : pool.sort((a, b) => Contract.pay(a, Contract.score(a, t), t.league) - Contract.pay(b, Contract.score(b, t), t.league)))[0];
          if (fb) { this.write(fb, t, this.deal(fb, t)); changed = true; this.post(`[오피셜] ${fb.name}, ${t.short} 입단`, `${Sim.josa(t.name, '이', '가')} 비어 있던 ${G.ROLE_KO[g.role]} 자리에 FA ${Sim.josa(fb.name, '을', '를')} 영입했습니다.`, fb.id); }
        }
      }
    });
    // 제안 마감: 가장 좋은 조건(연봉 + 팀 명성 + 리그)을 고른다
    Object.entries(F).forEach(([pid, offers]) => {
      const hit = Player.find(pid);
      if (!hit || !hit.p.free) { delete F[pid]; return; }
      if (!offers.some(o => o.until <= today)) return;
      if (Neg.held(Contract.st().neg[pid])) return;                                       // 우리와 합의 후 사인 대기 중
      const p = hit.p;
      const pay0 = Math.max(...offers.map(o => { const t = App.db.teams.find(x => x.id === o.team); return t ? o.mult * Contract.pay(p, Contract.score(p, t), t.league) : 0; })) || 1;
      const util = o => { const t = App.db.teams.find(x => x.id === o.team); if (t && typeof Persona !== 'undefined') return Persona.appeal(p, t, o.mult * Contract.pay(p, Contract.score(p, t), t.league) / pay0, p._o && p._o.team);  return o.mult * Contract.pay(p, Contract.score(p, t), t.league) / Contract.pay(p, Contract.score(p, t), 'LCK') * .5 + (t.rep || 2) * .08 + (p.nation === 'South Korea' && t.league === 'LCK' ? .25 : 0); };
      const P = typeof Persona !== 'undefined' ? Persona.of(p) : null, homeLg = p.nation === 'South Korea' ? 'LCK' : p.nation === 'China' ? 'LPL' : null;
      const stv = Schedule.events.find(e => e.kind === 'stove' && e.start <= today && today <= e.end), early = stv && Fmt.daysBetween(stv.start, today) < 45;
      const ok = offers.filter(x => { const t = App.db.teams.find(y => y.id === x.team); return t && t.players.length < 6 && t.players.filter(y => y.role === p.role).length < 2 && !(early && P && homeLg && P.w.home >= .45 && t.league !== homeLg); }), o = ok.sort((a, b) => util(b) - util(a))[0];   // 익숙한 리그 선호: 스토브 첫 45일은 해외 제안을 보지 않는다
      delete F[pid];
      if (!o) return;
      // 높은 오버롤 선수에게 약팀 제안만 왔다면 계약 대신 휴식을 택하기도 한다
      const best = App.db.teams.find(x => x.id === o.team);
      if ((p.ovr || 0) >= 80 && (best.rep || 2) <= 2 && this.rnd(pid, today, 'rest') < .55) {
        const st = Schedule.events.find(e => e.kind === 'stove' && e.start > today), until = stove ? (st ? st.start : Store.addDays(today, 300)) : Store.addDays(today, 90);
        (Contract.st().rest ||= {})[pid] = until;
        this.post(`[FA] ${p.name}, 휴식 선언`, `FA ${Sim.josa(p.name, '이', '가')} ${ok.length}개 팀의 제안을 받았지만 원하는 조건이 아니라며 당분간 휴식하기로 했습니다. ${Fmt.dayLabel(until)}까지 다른 구단의 제안을 받지 않을 전망입니다.`, pid);
        return;
      }
      const t = App.db.teams.find(x => x.id === o.team);
      this.write(p, t, this.deal(p, t, o.mult)); changed = true;
      const s = Contract.score(p, t);
      const back = p._o && p._o.team === t.id;                                            // FA로 나왔다가 원 소속팀과 다시 계약
      this.post(back ? `[오피셜] ${p.name}, ${t.short} 잔류` : `[오피셜] ${p.name}, ${t.short} 입단`,
        (back ? `FA ${Sim.josa(p.name, '이', '가')} 원 소속팀 ${Sim.josa(t.name, '과', '와')} 다시 계약했습니다.` : `FA ${Sim.josa(p.name, '이', '가')} ${Sim.josa(t.name, '과', '와')} 계약했습니다.`) + (offers.length > 1 ? ` ${offers.length}개 팀이 경쟁한 끝에 ${Sim.josa(t.short, '을', '를')} 택했습니다.` : ''), p.id);
      const neg = Contract.st().neg[pid], talking = !!(neg && !neg.signed && neg.mode === 'fa' && Fmt.daysBetween(neg.date, today) <= 14);
      // 메시지함에는 우리와 관련 있는 계약만: 협상 중이던 선수 · 관심 목록 · 라이벌 구단 · 같은 리그 구단. 나머지는 뉴스로만
      const from = p._o && p._o.team ? App.db.teams.find(x => x.id === p._o.team) : null, myT = Roster.team();
      const shortl = Player.shortlist().includes(pid), rival = [t.id, from && from.id].some(id => id && Rivalry.isRival(id)), local = myT && [t, from].some(x => x && x.league === myT.league && x.id !== myT.id);
      if (!App.state.unemployed && (talking || shortl || rival || local))
        Inbox.push({ from: { name: '스카우트 팀', role: 'coach' }, subject: `${p.name}, ${Sim.josa(t.short, '과', '와')} 계약${rival ? ' (라이벌)' : ''}`, priority: talking ? 'todo' : 'normal', link: 'portal-news', ctx: { pid },
          body: `${talking ? (neg.deal ? '합의했지만 사인하지 않았던 ' : '협상 중이던 ') : shortl ? '관심 목록에 있던 ' : rival ? '라이벌 구단 관련 소식입니다. ' : ''}${Sim.josa(p.name, '이', '가')} ${Sim.josa(t.name, '과', '와')} 계약했습니다.` });
      if (neg) { neg.done = true; neg.lapsed = true; }
    });
    if (changed) Squad.apply();
  },
  rivals(pid) { return (this.fa()[pid] || []).length; },
  resting(pid, today = Clock.today()) { const u = (Contract.st().rest || {})[pid]; return !!u && today < u; },
};
Engine.on(today => { if (!App.db.free) return; Market.expire(today); Market.shop(today); });

// 날짜 고정 기사(패치·시즌 결산)는 뉴스 탭을 안 열어도 그날 날짜로 남긴다
Engine.on(today => {
  const s = (App.state.newsSeen ||= {}), t = Roster.team();
  if (typeof Champions !== 'undefined' && Champions.meta) s['patch:' + Champions.meta.patch] ||= today;
  if (t) s[`recap:${t.id}:${Schedule.BASE}`] ||= today;
});

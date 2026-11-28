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
    if (salary <= 3) return true;   // 최저 연봉급 선수는 언제든 (예전에는 한도를 넘긴 GEN이 0.6억 정글도 못 데려와 2군으로 시즌을 치렀다)
    const lim = Club.CAP.LCK.cap * ({ 5: 3.75, 4: 2, 3: 1.35, 2: 1.1, 1: 1 }[Math.max(t.fin || 2, (t.rep || 2) - 1)] || 1.1);   // 명성 높은 구단은 재정 등급보다 한 단계 더 쓴다
    return Club.tax(t, { pid: p.id, salary }).used <= lim;
  },
  // 스토브: 주전보다 OVR이 4 이상 높은 FA가 감당되는 값이면 제안 (육성형은 21세 이하 유망주를 더 반긴다). 한 포지션 2명까지
  upgrade(t, sty, today) {
    if (this.rnd(t.id, today, 'upg') > (sty === 'contend' ? .35 : .25)) return false;
    const F = this.fa(), free = App.db.free.players;
    for (const role of G.ROLES) {
      if (t.players.filter(x => x.role === role).length >= 2) continue;
      const st = t.players.filter(x => x.role === role).sort((a, b) => (b.ovr || 0) - (a.ovr || 0))[0]; if (!st) continue;
      const c = free.filter(p => p.role === role && (p.ovr || 0) >= (st.ovr || 0) + (sty === 'develop' && (p.age || 30) <= 21 ? 2 : 4) && !this.resting(p.id, today) && !(F[p.id] || []).some(o => o.team === t.id)
        && (t.league !== 'LCK' || p.nation === 'South Korea') && !Persona.refuses(p, t, today) && this.affords(t, p, Contract.pay(p, Contract.score(p, t), t.league)))
        .sort((a, b) => (b.ovr || 0) + Persona.likes(b, t) * 6 - (a.ovr || 0) - Persona.likes(a, t) * 6)[0];
      if (!c) continue;
      (F[c.id] ||= []).push({ team: t.id, mult: 1.02 + this.rnd(c.id, t.id, 'm') * .2, until: Store.addDays(today, 2 + Math.floor(this.rnd(c.id, 'u') * 3)) });
      this.deadline(c, today); this.buzz(c, t, today);
      return true;
    }
    return false;
  },
  // ---------- 구단 성향 ----------
  style(t) {
    if (Club.wageRoom(t) < -Club.budget(t) * .15 && (t.fin || 2) <= 3) return 'austerity';
    if ((t.fin || 2) >= 4 || (t.rep || 2) >= 4) return 'contend';
    if ((t.rep || 2) <= 2 && (t.fin || 2) <= 2) return 'develop';
    return 'stable';
  },
  STYLE_KO: { contend: '우승 도전', stable: '안정', develop: '육성', austerity: '긴축' },
  // 팀 수준: 포지션별 최고 선수 점수의 평균 (빈 포지션 제외)
  level(t) { const v = G.ROLES.map(r => this.best(t, r)).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 70; },
  order(sty, t) {
    if (sty === 'develop') return (a, b) => (b.s + ((b.p.age || 25) <= 21 ? ((b.p.pa || 0) - (b.p.ca || 0)) * 6 : 0)) - (a.s + ((a.p.age || 25) <= 21 ? ((a.p.pa || 0) - (a.p.ca || 0)) * 6 : 0));
    if (sty === 'austerity') return (a, b) => b.s / Math.max(.3, Contract.pay(b.p, b.s, t.league)) - a.s / Math.max(.3, Contract.pay(a.p, a.s, t.league));
    return (a, b) => b.s - a.s;
  },
  // 우승 도전 팀: FA에 쓸 만한 선수가 없으면 명성이 낮은 다른 AI 팀 주전을 이적료로 데려온다 (팔린 팀은 다시 FA · 2군으로 채운다)
  poach(t, g, today) {
    if (this.rnd(t.id, today, 'poach') > .3) return false;
    const my = App.state.teamId, M = Contract.st();
    const cands = App.db.teams.filter(x => x.id !== t.id && x.id !== my && (x.rep || 2) < (t.rep || 2) && (x.league === t.league || ['LCK', 'LPL'].includes(t.league)))
      .flatMap(x => x.players.filter(p => p.role === g.role && !p.free && !(M.contracts[p.id] && M.contracts[p.id].signed > Store.addDays(today, -90))).map(p => ({ p, x, s: Contract.score(p, t) })))
      .filter(({ p, x, s }) => s > g.cur + 6 && (p.nation === 'South Korea' || t.league !== 'LCK' || this.rnd(p.id, t.id, 'imp') < .15) && this.affords(t, p, Contract.pay(p, s, t.league) * 1.1))
      .sort((a, b) => b.s - a.s);
    const c = cands[0]; if (!c) return false;
    const fee = typeof Transfer !== 'undefined' && Transfer.price ? Transfer.price(c.p, c.x).v : 5;
    this.write(c.p, t, this.deal(c.p, t, 1.1));
    this.post(`[오피셜] ${c.p.name}, ${c.x.short} → ${t.short} 이적 (이적료 ${Player.money(fee)})`, `${Sim.josa(t.name, '이', '가')} ${c.x.name}의 ${G.ROLE_KO[g.role]} ${Sim.josa(c.p.name, '을', '를')} 이적료 ${Player.money(fee)} 원에 영입했습니다. ${t.short}의 ${G.ROLE_KO[g.role]} 공백을 메우기 위한 선택입니다.`, c.p.id);
    return true;
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
      (t.staff || []).forEach(p => { const c = Contract.of(p, t); if (c.end && Contract.due(c.end) < today) { const end = Contract.addYears(c.end, 1); Contract.st().contracts[p.id] = { ...c, end, signed: today }; p.contractEnd = end; } });
      [...t.players, ...(t.cl || [])].forEach(p => {
        const c = Contract.of(p, t); if (!c.end || Contract.due(c.end) >= today) return;   // 월즈 결승이 끝난 다음 날부터 (Contract.due)
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
        const blocked = cl && (p.ovr || 0) >= 76 && t.players.some(x => x.role === p.role && !x.sub && (x.ovr || 0) - (p.ovr || 0) >= 8);   // 1군 주전이 훨씬 강해 올라갈 길이 막힌 유망주
        const stay = Persona.stays(p, t, c.end) && !(blocked && this.rnd(p.id, c.end, 'blk') < .75 + Persona.of(p).w.play * .2);   // 우리 팀 표준 조건 제안과 같은 기준 (js/persona.js) · 막힌 유망주는 대체로 1군 기회를 찾아 떠난다 (예전에는 클라우드가 T1 2군과 재계약)
        if (!afford && !cl && s >= 75) p._capOut = t.id;                         // 재정 때문에 놓아준 선수 (뉴스 문구)
        if (keep && stay) {
          this.write(p, t, offer);
          if (s >= 75) this.post(`[오피셜] ${t.short}, ${Sim.josa(p.name, '과', '와')} 재계약`, `${Sim.josa(t.name, '이', '가')} ${G.ROLE_KO[p.role] || ''} ${Sim.josa(p.name, '과', '와')} 재계약했습니다. 계약은 ${Contract.label(Contract.st().contracts[p.id])}까지입니다.`, p.id);
        } else {
          this.free(p); if (!cl) Lapse.add(p, t);
          if (blocked) this.post(`[FA] 유망주 ${p.name}, 1군 기회 찾아 FA 시장으로`, `${t.name} 2군의 ${G.ROLE_KO[p.role] || ''} ${p.name}(${p.age || '-'}세 · OVR ${p.ovr})이 1군 자리를 찾아 FA 시장에 나왔습니다. 여러 팀이 관심을 보일 것으로 보입니다.`, p.id);
          else if (s >= 65 || (cl && (p.ovr || 0) >= 74)) this.post(`[FA] ${p.name}, ${Sim.josa(t.short, '과', '와')} 계약 만료 — FA 시장으로`, `${t.name}의 ${G.ROLE_KO[p.role] || ''} ${p.name}(${p.age || '-'}세)이(가) ${p._capOut === t.id ? '구단의 연봉 여력이 부족해 재계약하지 못하고' : '재계약하지 않고'} FA 시장에 나왔습니다.`, p.id);
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
      // 구단 성향 (베타 건의: 한화생명급 팀이 주전이 나가도 2군 콜업으로 시즌을 치렀다): 우승 도전 · 안정 · 육성 · 긴축
      const sty = this.style(t), lv = this.level(t), slack = { contend: 5, stable: 7, develop: 10, austerity: 12 }[sty];
      const gaps = G.ROLES.filter(r => n(r) < 2 && !asked(r)).map(role => ({ role, cur: this.best(t, role) })).map(g => ({ ...g, weak: g.cur > 0 && g.cur < lv - slack })).sort((a, b) => a.cur - b.cur);
      if (stove && this.upgrade(t, sty, today)) { changed = true; return; }
      const g = gaps[0]; if (!g) return;
      const empty = !g.cur;
      // 빈자리가 2주 넘게 이어지면(스토브 중에는 4주) 제안을 기다리지 않고 바로 콜업 · 계약 (안전장치)
      const VS = (Contract.st().vac ||= {}), vk = t.id + ':' + g.role; if (empty) VS[vk] ||= today; else delete VS[vk];
      const stale = empty && Fmt.daysBetween(VS[vk], today) >= (stove ? 28 : 14);
      // 빈자리는 매일 찾는다. 주전이 팀 수준보다 크게 처지면(2군 콜업 등) 스토브 동안 적극적으로 보강. 그 밖에는 1군은 주전 5명 + 후보 1명까지
      if (!empty && !(g.weak && stove && t.players.length < 7 && this.rnd(t.id, today, 'shopw') < (sty === 'contend' ? .8 : sty === 'stable' ? .5 : .25)) && (t.players.length >= 6 || this.rnd(t.id, today, 'shop') > (stove ? .35 : .08))) return;
      if (!stove && !empty) return;
      let room = Club.wageRoom(t) + (empty ? 3 : 0);
      const cands = free.filter(p => p.role === g.role && !this.resting(p.id, today) && !(F[p.id] || []).some(o => o.team === t.id)).map(p => ({ p, s: Contract.score(p, t) }))
        .map(x => ({ ...x, s: x.s + (typeof Persona !== 'undefined' ? Persona.likes(x.p, t) * 15 : 0) }))
        .filter(({ p, s }) => s > g.cur + 4 && (s < 85 || (t.rep || 2) >= 3 || (typeof Persona !== 'undefined' && Persona.likes(p, t)))
          && (p.nation !== 'South Korea' || t.league === 'LCK' || this.rnd(p.id, t.id, 'ko') < .35 + (s >= 80 ? .2 : 0))
          && (t.league !== 'LCK' || p.nation === 'South Korea' || this.rnd(p.id, t.id, 'imp') < .15)
          && Contract.pay(p, s, t.league) <= room && this.affords(t, p, Contract.pay(p, s, t.league)))   // 샐러리캡 기준으로도 감당되는 선수만
        .sort(this.order(sty, t));
      const st = Schedule.events.find(e => e.kind === 'stove' && e.start <= today && today <= e.end);
      const late = !st || Fmt.daysBetween(st.start, today) >= { contend: 21, stable: 10, develop: 4, austerity: 6 }[sty];   // 이만큼 지나도 빈자리면 2군에서 올린다 (우승 도전 팀은 3주까지 영입을 노린다)
      if (!cands.some(x => !Persona.refuses(x.p, t, today)) && stove && (empty || g.weak) && sty === 'contend' && this.poach(t, g, today)) { changed = true; return; }   // FA에 없으면 다른 팀 선수를 이적료로
      // 이 팀과 이야기하지 않는 선수(친정 거부 등)는 건너뛰고 다음 후보 (예전에는 1순위가 거절하면 그날은 포기해, Zeus를 놓친 HLE가 Kiin도 안 보고 2군을 올렸다)
      const pick = stale || (empty && late && (t.cl || []).some(p => p.role === g.role)) ? null : cands.find(x => !Persona.refuses(x.p, t, today));
      if (pick) {
        (F[pick.p.id] ||= []).push({ team: t.id, mult: 1.02 + this.rnd(pick.p.id, t.id, 'm') * .2, until: Store.addDays(today, 2 + Math.floor(this.rnd(pick.p.id, 'u') * 3)) });
        this.deadline(pick.p, today); this.buzz(pick.p, t, today);
        return;
      }
      if (empty) {
        const up = (t.cl || []).filter(p => p.role === g.role).sort((a, b) => (b.ca || 0) - (a.ca || 0))[0];
        if (up) { Contract.st().moves[up.id] = t.id; changed = true; this.post(`${t.short}, 2군 ${up.name} 1군 콜업`, `${Sim.josa(t.name, '이', '가')} 비어 있던 ${G.ROLE_KO[g.role]} 자리에 2군 ${Sim.josa(up.name, '을', '를')} 올렸습니다.`, up.id); }
        else if (!stove || stale || (st && Fmt.daysBetween(st.start, today) >= 14)) {   // 스토브 2주는 정상 경쟁(고민 기간)을 거친다. 그 뒤에도 비어 있으면 바로 계약
          // 2군도 없으면 그 포지션 FA 중 가장 나은 선수와 바로 계약 (주전 없이 공식전에 나가지 않게)
          // 연봉 여력 안에서 가장 나은 선수 (예전에는 연봉을 보지 않아, 돈 때문에 놓아준 선수를 바로 다시 데려왔다). 그런 선수가 없으면 가장 싼 선수
          const pool = free.filter(p => p.role === g.role && !Neg.held(Contract.st().neg[p.id])), fit = pool.filter(p => this.affords(t, p, Contract.pay(p, Contract.score(p, t), t.league)));
          const fb = (fit.length ? fit.sort((a, b) => Contract.score(b, t) - Contract.score(a, t)) : pool.sort((a, b) => Contract.pay(a, Contract.score(a, t), t.league) - Contract.pay(b, Contract.score(b, t), t.league)))[0];
          if (fb) { this.write(fb, t, this.deal(fb, t)); changed = true; this.post(`[오피셜] ${fb.name}, ${t.short} 입단`, `${Sim.josa(t.name, '이', '가')} 비어 있던 ${G.ROLE_KO[g.role]} 자리에 FA ${Sim.josa(fb.name, '을', '를')} 영입했습니다.`, fb.id); }
        }
      }
    });
    // 제안 마감: 가장 좋은 조건(연봉 + 팀 명성 + 리그)을 고른다
    const NG = Contract.st().neg, D = this.dls();
    const ids = new Set([...Object.keys(F), ...Object.keys(NG).filter(k => NG[k].pending), ...Object.keys(D)]);
    [...ids].forEach(pid => {
      const offers = F[pid] || [], hit = Player.find(pid), S = NG[pid], mine = S && S.pending && S.bid;
      if (!hit || !hit.p.free) { delete F[pid]; delete D[pid]; if (S && S.pending) { S.pending = false; S.done = true; S.lost = true; } return; }
      if (!offers.length && !mine) { delete D[pid]; return; }
      if (Neg.held(S)) return;                                                            // 우리와 합의 후 사인 대기 중
      const dl = this.deadline(hit.p, today);
      if (mine) this.nudge(hit.p, S, dl, today);                                          // 우리 입찰이 밀리고 있으면 에이전트가 알려 준다
      if (dl > today) { this.eve(hit.p, dl, today); return; }
      if (typeof Lapse !== 'undefined' && Lapse.waits(Player.find(pid).p) && Lapse.of(pid).team === App.state.teamId) return;   // 만료 열흘: 원 소속팀(우리) 제안을 기다린다
      const p = hit.p;
      // 아직 자리가 있고 선수가 이야기할 마음이 있는 팀의 제안만 · 우리 입찰도 같은 저울 (js/persona.js appeal)
      const ok = this.ranked(p).filter(({ o }) => { if (o.mine) return true; const t = App.db.teams.find(y => y.id === o.team); return t && (t.players.length < 6 || !t.players.some(y => y.role === p.role)) && t.players.filter(y => y.role === p.role).length < 2 && !Persona.refuses(p, t, today); });   /* 빈 포지션은 인원과 상관없이 (예전에는 6명인 팀의 빈자리 제안이 늘 무효라, 한 시즌 내내 공석이었다 — 베타 제보) */
      const o = ok.length ? ok[0].o : null, n = ok.length;
      delete F[pid]; delete D[pid];
      if (mine) {
        S.pending = false;
        if (o && o.mine) {                                                                 // 우리를 골랐다: 사인 대기
          S.done = true; S.deal = S.bid; S.hold = Store.addDays(today, Neg.HOLD);
          S.log.push({ who: 'agent', text: `선수가 ${n > 1 ? `${n}개 팀 제안을 놓고 고민한 끝에 ` : ''}${Sim.josa(Roster.team().short, '을', '를')} 택했습니다. 서류를 준비하겠습니다.\n\n(${S.hold.replace(/-/g, '.')}까지 계약서에 사인해 주세요)` });
          Inbox.push({ from: { name: `${Neg.agent(p).name} (${p.name} 에이전트)`, role: 'agent' }, subject: `${p.name}, 우리 팀을 택했다`, priority: 'todo', ctx: { pid, player: p.name },
            body: `${p.name} 측에서 연락이 왔습니다. ${n > 1 ? `${n}개 팀의 제안을 비교한 끝에 ` : ''}${Sim.josa(Roster.team().short, '을', '를')} 택했다고 합니다.\n\n${Neg.offerText(S.deal)}\n\n${S.hold.replace(/-/g, '.')}까지 계약서에 사인하지 않으면 합의는 무효가 됩니다.`,
            choices: [{ label: '계약서에 사인', act: 'negSign', reply: '계약서에 사인했습니다.' }, { label: '나중에', act: 'none', reply: '협상 창에서 사인할 수 있습니다.' }] });
          return;
        }
        S.done = true; S.lost = true;
        const wt = o && App.db.teams.find(x => x.id === o.team);
        const msg = wt ? `선수는 ${Sim.josa(wt.short, '을', '를')} 택했습니다. ${this.why(p, wt, S.bid, o)}` : '선수가 이번에는 어느 팀과도 계약하지 않기로 했습니다.';
        S.log.push({ who: 'agent', text: `죄송합니다. ${msg}` });
        Inbox.push({ from: { name: `${Neg.agent(p).name} (${p.name} 에이전트)`, role: 'agent' }, subject: `${p.name}, 다른 팀을 택했다`, priority: 'normal', ctx: { pid },
          body: `${p.name} 측에서 연락이 왔습니다. 좋은 제안 감사하지만, ${msg}${n > 1 ? `\n\n${n}개 팀이 경쟁했습니다.` : ''}` });
        S._told = true;
      }
      if (!o) return;
      // 높은 오버롤 선수에게 약팀 제안만 왔다면 계약 대신 휴식을 택하기도 한다
      const best = App.db.teams.find(x => x.id === o.team);
      if ((p.ovr || 0) >= 80 && (best.rep || 2) <= 2 && (p.age || 25) >= 23 && Persona.of(p).w.play < .6 && this.rnd(pid, today, 'rest') < .55) {   // 출전이 급한 어린 유망주는 쉬지 않는다 (클라우드가 휴식을 선언했다)
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
        (back ? `FA ${Sim.josa(p.name, '이', '가')} 원 소속팀 ${Sim.josa(t.name, '과', '와')} 다시 계약했습니다.` : `FA ${Sim.josa(p.name, '이', '가')} ${Sim.josa(t.name, '과', '와')} 계약했습니다.`) + (n > 1 ? ` ${n}개 팀이 경쟁한 끝에 ${Sim.josa(t.short, '을', '를')} 택했습니다.` : ''), p.id);
      const neg = Contract.st().neg[pid], talking = !!(neg && !neg.signed && neg.mode === 'fa' && Fmt.daysBetween(neg.date, today) <= 14);
      // 메시지함에는 우리와 관련 있는 계약만: 협상 중이던 선수 · 관심 목록 · 라이벌 구단 · 같은 리그 구단. 나머지는 뉴스로만
      const from = p._o && p._o.team ? App.db.teams.find(x => x.id === p._o.team) : null, myT = Roster.team();
      const shortl = Player.shortlist().includes(pid), rival = [t.id, from && from.id].some(id => id && Rivalry.isRival(id)), local = myT && [t, from].some(x => x && x.league === myT.league && x.id !== myT.id);
      if (!App.state.unemployed && !(neg && neg._told) && (talking || shortl || rival || local))
        Inbox.push({ from: { name: '스카우트 팀', role: 'coach' }, subject: `${p.name}, ${Sim.josa(t.short, '과', '와')} 계약${rival ? ' (라이벌)' : ''}`, priority: talking ? 'todo' : 'normal', link: 'portal-news', ctx: { pid },
          body: `${talking ? (neg.deal ? '합의했지만 사인하지 않았던 ' : '협상 중이던 ') : shortl ? '관심 목록에 있던 ' : rival ? '라이벌 구단 관련 소식입니다. ' : ''}${Sim.josa(p.name, '이', '가')} ${Sim.josa(t.name, '과', '와')} 계약했습니다.` });
      if (neg) { neg.done = true; neg.lapsed = true; }
    });
    if (changed) Squad.apply();
  },
  rivals(pid) { return (this.fa()[pid] || []).length; },
  // 제안이 몰리면 루머 기사 (오버롤 78 이상, 2팀 · 4팀째에)
  buzz(p, t, today) {
    const L = this.offersFor(p), n = L.length; if (n !== 2 && n !== 4) return;
    if (!this.near(p, L, 82)) return;
    if (!Engine.once(`buzz:${p.id}:${n}:${(Lapse.of(p.id) || {}).date || ''}`)) return;
    const names = L.map(o => (App.db.teams.find(x => x.id === o.team) || {}).short).filter(Boolean);
    this.post(`[루머] FA ${p.name}, ${n}개 구단 영입 경쟁`, `FA 시장에 나온 ${G.ROLE_KO[p.role] || ''} ${Sim.josa(p.name, '을', '를')} 두고 ${names.join(' · ')} 등 ${n}개 구단이 영입 경쟁을 벌이고 있다는 소식입니다. ${p.name} 측은 제안을 모두 들어 본 뒤 ${Fmt.dayLabel(this.deadline(p, today))} 무렵 결정할 것으로 알려졌습니다.`, p.id);
  },
  // 기사로 낼 만한가: 리그 전체가 주목할 거물이거나, 우리 리그 · 우리 팀과 얽힌 선수 (오버롤 75 이상)
  near(p, L, star) {
    const o = p.ovr || 0, my = Roster.team(); if (o >= star) return true; if (o < 75 || !my) return false;
    return L.some(x => x.mine || (App.db.teams.find(t => t.id === x.team) || {}).league === my.league) || Player.shortlist().includes(p.id);
  },
  // 결정 전날: 막판 경쟁 기사 (오버롤 82 이상, 제안 2개 이상)
  eve(p, dl, today) {
    if (Store.addDays(today, 1) !== dl) return;
    const R = this.ranked(p); if (R.length < 2 || !this.near(p, R.map(x => x.o), 85) || !Engine.once('eve:' + p.id + dl)) return;
    const a = App.db.teams.find(x => x.id === R[0].o.team), b = App.db.teams.find(x => x.id === R[1].o.team); if (!a || !b) return;
    this.post(`[루머] ${p.name}, ${a.short} · ${b.short} 막판 저울질`, `FA ${Sim.josa(p.name, '이', '가')} 결정을 앞두고 있습니다. 업계에서는 ${Sim.josa(a.short, '과', '와')} ${Sim.josa(b.short, '이', '가')} 마지막까지 경쟁하고 있다고 전합니다. 이르면 내일 행선지가 정해질 전망입니다.`, p.id);
  },
  // 우리 입찰이 1순위에서 밀리면 에이전트가 알려 준다 (팀마다 한 번) — 조건을 올려 다시 제안할 수 있다
  nudge(p, S, dl, today) {
    const R = this.ranked(p), top = R[0]; if (!top || top.o.mine) return;
    const t = App.db.teams.find(x => x.id === top.o.team); if (!t || (S.warned ||= {})[t.id]) return;
    S.warned[t.id] = today;
    const money = this.pay(p, top.o) > this.pay(p, S.bid) * 1.03;
    S.patience = Math.min(S.max, (S.patience || 0) + 1);
    S.log.push({ who: 'agent', text: `${t.short} 쪽에서 ${money ? '더 높은 금액을' : '좋은 조건을'} 제시해 왔습니다. 지금으로선 선수 마음이 그쪽으로 조금 기울어 있습니다. ${Fmt.dayLabel(dl)}에 결정하니 조건을 다시 보시려면 그 전에 말씀해 주세요.` });
    Inbox.push({ from: { name: `${Neg.agent(p).name} (${p.name} 에이전트)`, role: 'agent' }, subject: `${p.name}: 다른 구단이 ${money ? '더 높은 금액을' : '좋은 조건을'} 제시`, priority: 'todo', ctx: { pid: p.id, player: p.name },
      body: `${t.short} 쪽에서 ${money ? '우리보다 높은 금액을' : '선수가 끌릴 만한 조건을'} 제시했습니다. 지금으로선 선수 마음이 그쪽으로 조금 기울어 있습니다.\n\n선수는 ${Fmt.dayLabel(dl)}에 결정합니다. 그 전에 조건을 올려 다시 제안할 수 있습니다.`,
      choices: [{ label: '협상 창 열기', act: 'negOpen', reply: '협상 창을 열었습니다.' }, { label: '지금 조건 유지', act: 'none', reply: '지금 조건으로 결정을 기다립니다.' }] });
  },
  // ---------- FA의 고민 기간: 거물일수록 오래 제안을 모은다 (시즌 중에는 빨리 정한다) ----------
  dls() { return (Contract.st().fadl ||= {}); },
  deadline(p, today = Clock.today()) {
    const D = this.dls(); if (D[p.id]) return D[p.id];
    const o = p.ovr || 0, r = this.rnd(p.id, today, 'dl'), stove = this.stove(today);
    let d = o >= 85 ? 7 + r * 7 : o >= 75 ? 4 + r * 4 : 2 + r * 2;
    if (!stove) d = Math.max(2, d / 2);
    return (D[p.id] = Store.addDays(today, Math.round(d)));
  },
  // 제안 하나의 매력 (pay0 = 받은 제안 중 최고 연봉). 우리 제안 · AI 제안 모두 같은 저울
  pay(p, o) { if (o.mine) return o.salary + (o.signing || 0) / (o.years || 1); const t = App.db.teams.find(x => x.id === o.team); return t ? o.mult * Contract.pay(p, Contract.score(p, t), t.league) : 0; },
  util(p, o, pay0) {
    const t = App.db.teams.find(x => x.id === o.team); if (!t) return -9;
    return Persona.appeal(p, t, this.pay(p, o) / (pay0 || 1), p._o && p._o.team) + (o.mine && o.promise === 'starter' ? .04 : 0);
  },
  // 이 FA가 받아 둔 제안 전부 (우리 입찰 포함)
  offersFor(p) {
    const S = Contract.st().neg[p.id], list = [...(this.fa()[p.id] || [])];
    if (S && S.pending && S.bid) list.push({ ...S.bid, team: App.state.teamId, mine: true });
    return list;
  },
  ranked(p) { const L = this.offersFor(p), pay0 = Math.max(1e-6, ...L.map(o => this.pay(p, o))); return L.map(o => ({ o, u: this.util(p, o, pay0) })).sort((a, b) => b.u - a.u); },
  // 우리가 요구액을 맞춘 제안: 압도적이면 바로 합의, 아니면 다른 제안과 함께 고민한다
  bid(p, o) {
    const ai = this.fa()[p.id] || [];
    if (!ai.length && (p.ovr || 0) < 80) return 'now';                                   // 경쟁자 없는 중하위 선수는 바로
    const mine = { ...o, team: App.state.teamId, mine: true }, L = [...ai, mine], pay0 = Math.max(1e-6, ...L.map(x => this.pay(p, x)));
    const me = this.util(p, mine, pay0), best = Math.max(-9, ...ai.map(x => this.util(p, x, pay0)));
    if (ai.length && me - best >= .3) return 'now';                                      // 압도적인 조건이면 고민 없이
    this.deadline(p); return 'wait';
  },
  // 왜 그 팀을 골랐나 (결과 메일)
  why(p, t, mineO, w) {
    const P = Persona.of(p);
    if (Persona.likes(p, t)) return P.favCoach.length && !P.fav.includes(t.id) ? '함께하고 싶은 코치가 있는 팀이라고 합니다.' : P.tag === 'oneclub' ? `${t.short}에서 커리어를 끝내고 싶다고 합니다.` : `${Sim.josa(t.short, '은', '는')} 선수에게 특별한 팀이라고 합니다.`;
    if (w && mineO && this.pay(p, w) > this.pay(p, mineO) * 1.04) return '연봉 조건이 더 좋았다고 합니다.';
    if (Persona.rank(t) < Persona.rank(Roster.team())) return '우승 가능성을 가장 크게 봤다고 합니다.';
    return '팀 분위기와 조건을 두루 따져 봤다고 합니다.';
  },
  resting(pid, today = Clock.today()) { const u = (Contract.st().rest || {})[pid]; return !!u && today < u; },
};
Engine.on(today => { if (!App.db.free) return; Market.expire(today); Market.shop(today); });

// 날짜 고정 기사(패치·시즌 결산)는 뉴스 탭을 안 열어도 그날 날짜로 남긴다
Engine.on(today => {
  const s = (App.state.newsSeen ||= {}), t = Roster.team();
  if (typeof Champions !== 'undefined' && Champions.meta) s['patch:' + Champions.meta.patch] ||= today;
  if (t) s[`recap:${t.id}:${Schedule.BASE}`] ||= today;
});
Engine.ACTS.negOpen = m => { if (m.ctx && m.ctx.pid) setTimeout(() => Neg.open(m.ctx.pid, (Contract.st().neg[m.ctx.pid] || {}).mode || 'fa'), 50); };

// 상호 계약 해지 (양쪽이 모두 동의해야 성립)
//   우리가 제안: 남은 연봉 정산 비율(0 · 50 · 100%)을 정해 제안 → 선수가 상황을 보고 받아들이거나 거절 (거절하면 관계가 조금 나빠지고 30일간 다시 못 꺼낸다)
//   선수가 요청: 출전 기회가 없는 후보 · 2군 선수가 먼저 해지를 요청해 오기도 한다 → 수락 · 설득(거절) · 이적 시장에 내놓기
const Mutual = {
  st() { return (App.state.mutual ||= { cd: {}, asked: {} }); },
  team() { return Roster.team(); },
  mine(pid) { const t = this.team(); return t && [...t.players, ...(t.cl || []), ...(t.academy || [])].find(p => p.id === pid); },
  cool(pid) { const d = this.st().cd[pid]; return d && Clock.today() < d; },
  // 남은 연봉 (억): 연봉 × 남은 기간
  left(p) { const t = this.team(), c = Contract.of(p, t), days = Math.max(0, Fmt.daysBetween(Clock.today(), c.end || p.contractEnd || Clock.today())); return Math.round((c.salary || 0) * days / 365 * 10) / 10; },
  played(p) { const lp = (App.state.lp || {})[p.id]; return lp && Fmt.daysBetween(lp, Clock.today()) <= 30; },
  // 선수가 팀을 떠나고 싶은 정도 (0~1). 숫자는 화면에 직접 보여 주지 않는다
  want(p) {
    const P = Persona.of(p) || { w: { play: .3, loyal: .3 } }, lv = p.level || 'first', amb = ((p.attributes || {}).hidden || {}).ambition || 11, rel = typeof Rel !== 'undefined' ? Rel.of(p.id) : 50;
    let v = .1;
    if (lv !== 'first' || p.sub) v += .3 + P.w.play * .35; else v -= .3;
    if (!this.played(p) && App.state.lpAny && Fmt.daysBetween(App.state.lpAny, Clock.today()) <= 14) v += .12;   // 시즌 중인데 못 뛰고 있다
    v += (amb - 11) * .02 - P.w.loyal * .35 + (rel < 40 ? .15 : rel > 70 ? -.1 : 0);
    v += (p.ovr || 60) >= 75 ? .1 : (p.ovr || 60) < 62 ? -.2 : 0;   // 다른 팀을 구할 자신이 있나
    return Math.max(0, Math.min(1, v));
  },
  odds(p, pct) { return Math.max(.03, Math.min(.95, this.want(p) + pct * .45 - .12)); },
  hint(o) { return o >= .7 ? ['받아들일 가능성 높음', 'good'] : o >= .4 ? ['반반', 'mid'] : ['거절할 가능성 높음', 'bad']; },

  // ---------- 우리가 제안 ----------
  ask(p) {
    if (App.state.unemployed) return;
    if (this.cool(p.id)) { UI.toast(`${p.name} 측과는 ${this.st().cd[p.id].slice(5).replace('-', '.')} 이후에 다시 이야기할 수 있습니다`, 3000); return; }
    const left = this.left(p), opts = [[0, '정산 없음'], [.5, '남은 연봉 50% 정산'], [1, '남은 연봉 100% 정산']];
    UI.modal({ title: `${UI.esc(p.name)} 상호 계약 해지 제안`, body: `<p class="cr-dim">양쪽이 모두 동의해야 해지됩니다. 선수가 거절하면 관계가 조금 나빠지고 30일 동안 다시 제안할 수 없습니다. 해지되면 선수는 FA가 됩니다.</p>
      <div class="mu-info"><span>계약 ${UI.esc(Contract.label(Contract.of(p, this.team())))}</span><span>남은 연봉 약 ${Player.money(left)}</span><span>${p.sub || (p.level || 'first') !== 'first' ? '최근 출전 ' + (this.played(p) ? '있음' : '없음') : '주전'}</span></div>
      <div class="ln-list">${opts.map(([v, l], i) => { const [h, cls] = this.hint(this.odds(p, v) + (G.rand(p.id + v, 'mh') - .5) * .15); return `<label class="ln-row"><input type="radio" name="mu" value="${v}" ${i === 1 ? 'checked' : ''}><b>${l}</b><small>${v ? '약 ' + Player.money(left * v) : '0원'}</small><em class="ln-c ${cls}" title="코치진 예상">${h}</em></label>`; }).join('')}</div>`,
      actions: [{ label: '취소' }, { label: '제안하기', primary: true, onClick: back => { const v = +($('input[name="mu"]:checked', back) || {}).value || 0; setTimeout(() => this.propose(p, v), 50); } }] });
  },
  propose(p, pct) {
    const ok = G.rand(p.id + Clock.today() + pct, 'mu') < this.odds(p, pct), ag = Neg.agent(p).name;
    if (ok) { this.done(p, pct, 'club'); return; }
    this.st().cd[p.id] = Store.addDays(Clock.today(), 30);
    if (typeof Rel !== 'undefined') Rel.add(p.id, -6, '상호 해지 제안');
    const why = p.sub || (p.level || 'first') !== 'first' ? (pct < 1 ? '정산 조건이 충분하지 않다고 합니다.' : '아직 이 팀에서 자리를 잡고 싶다고 합니다.') : '주전으로 뛰고 있는 지금 팀을 떠날 생각이 없다고 합니다.';
    Inbox.push({ from: { name: `${ag} (${p.name} 에이전트)`, role: 'agent' }, subject: `${p.name}, 상호 해지 제안 거절`, ctx: { pid: p.id }, body: `${p.name} 측이 상호 계약 해지 제안을 거절했습니다. ${why}\n\n선수는 계약대로 팀에 남습니다. 30일 뒤에 다시 이야기할 수 있습니다.` });
    UI.toast(`${p.name} 측이 제안을 거절했습니다`, 3000);
  },
  // 해지 성립: 정산금 지급 → FA
  done(p, pct, by) {
    const t = this.team(), pay = Math.round(this.left(p) * pct * 10) / 10;
    if (pay > 0) World.ledger().push({ date: Clock.today(), label: `${p.name} 상호 해지 정산금`, amount: -Math.round(pay * 1e8) });
    delete this.st().cd[p.id];
    if (p.gen) { delete Squad.gen()[p.id]; delete Squad.moves()[p.id]; Squad.apply(); } else Contract.release(p.id);
    Market.post(`[오피셜] ${t.short}, ${Sim.josa(p.name, '과', '와')} 상호 합의로 계약 해지`, `${Sim.josa(t.name, '이', '가')} ${G.ROLE_KO[p.role] || ''} ${Sim.josa(p.name, '과', '와')} ${by === 'player' ? '선수 측 요청에 따라' : '논의 끝에'} 상호 합의로 계약을 해지했습니다.${pay ? ` 남은 연봉 일부(${Player.money(pay)})를 정산했습니다.` : ''} ${Sim.josa(p.name, '은', '는')} FA 신분이 됩니다.`, p.id);
    Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: `${p.name} 상호 계약 해지 완료`, body: `${Sim.josa(p.name, '과', '와')}의 계약을 상호 합의로 해지했습니다.${pay ? `\n정산금 ${Player.money(pay)} 원을 지급했습니다.` : '\n정산금은 없습니다.'}\n\n선수는 FA 시장으로 나갑니다.` });
    UI.toast(`${p.name}와 상호 합의로 계약을 해지했습니다`, 3000);
  },

  // ---------- 선수가 요청 (매일 아주 낮은 확률) ----------
  day(today) {
    if (App.state.unemployed) return;
    const t = this.team(); if (!t) return;
    const A = this.st().asked;
    [...t.players.filter(p => p.sub), ...(t.cl || [])].forEach(p => {
      if (p.role === 'COACH' || this.cool(p.id) || (A[p.id] && Fmt.daysBetween(A[p.id], today) < 90) || (Player.days(p) ?? 0) < 60) return;
      const w = this.want(p); if (w < .55 || G.rand(p.id + today, 'mreq') > .006 + (w - .55) * .02) return;
      A[p.id] = today;
      const ag = Neg.agent(p).name, why = !this.played(p) ? '최근 공식전에 나서지 못하고 있어' : '더 많은 출전 기회를 원해';
      Inbox.push({ from: { name: `${ag} (${p.name} 에이전트)`, role: 'agent' }, subject: `${p.name} 측, 상호 계약 해지 요청`, priority: 'todo', ctx: { pid: p.id, player: p.name },
        body: `${p.name} 측에서 연락이 왔습니다. ${why} 상호 합의로 계약을 해지하고 새 팀을 찾고 싶다고 합니다.\n\n남은 연봉(약 ${Player.money(this.left(p))})은 받지 않겠다고 합니다.`,
        choices: [
          { label: '수락 (정산 없이 해지)', act: 'mutualOk', reply: '요청을 받아들였습니다. 선수는 FA가 됩니다.' },
          { label: '설득해서 남긴다 (거절)', act: 'mutualNo', reply: '조금만 더 기다려 달라고 설득했습니다. 선수는 아쉬워합니다.' },
          { label: '이적 시장에 내놓는다', act: 'mutualList', reply: '이적 제안을 받아 보기로 했습니다. 좋은 제안이 오면 보내 줍니다.' }] });
    });
  },
};
Engine.ACTS.mutualOk = m => { const p = Mutual.mine(m.ctx.pid); if (p) Mutual.done(p, 0, 'player'); };
Engine.ACTS.mutualNo = m => { if (typeof Rel !== 'undefined') Rel.add(m.ctx.pid, -5, '상호 해지 요청 거절'); Mutual.st().cd[m.ctx.pid] = Store.addDays(Clock.today(), 30); };
Engine.ACTS.mutualList = m => { (Contract.st().listed ||= {})[m.ctx.pid] = Clock.today(); };
Engine.on(today => { try { Mutual.day(today); } catch (e) { console.warn('[mutual]', e); } });

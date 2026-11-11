// 이적: 계약 중인 선수는 원 소속 구단과 이적료를 먼저 합의하고(단장 채팅), 그다음 선수 에이전트와 개인 조건을 맞춘다.
// 바이아웃 조항이 있으면 그 금액 이상 제안 시 구단은 거절할 수 없다. 다른 구단도 우리 선수에게 이적 제안을 보낸다.
const Transfer = {
  bids() { return (Contract.st().bids ||= []); },
  open$(pid) { return this.bids().find(b => b.pid === pid && b.dir === 'in' && ['talk', 'agreed'].includes(b.status)); },
  gm(t) { const r = G.rand(t.id, 'gm'); return { name: `${t.short} 단장`, kind: r < .35 ? 'tough' : r < .85 ? 'normal' : 'kind' }; },

  // 구단이 생각하는 몸값
  price(p, t) {
    const c = Contract.of(p, t), s = Contract.score(p, t);
    let v = Contract.value(p, t) * (p.sub ? .8 : 1.25);
    if (!t.players.some(x => x !== p && x.role === p.role)) v *= 1.3;        // 대체 선수가 없으면 비싸게
    if ((t.rep || 2) >= 4 && !p.sub) v *= 1.15;
    return { v: Contract.r1(Math.max(.5, v)), locked: s >= 88 && (t.rep || 2) >= 4 && !c.buyout && Fmt.daysBetween(Clock.today(), c.end || Clock.today()) > 365 };
  },

  // ---------- 우리 → 다른 구단: 단장 채팅 ----------
  open(pid) {
    const hit = Player.find(pid); if (!hit) return;
    const { p, t } = hit, my = Roster.team();
    if (p.free || Player.days(p) < 0) { Neg.open(pid, 'fa'); return; }
    let b = this.open$(pid);
    if (b && b.status === 'agreed') { Neg.open(pid, 'transfer'); return; }
    const last = this.bids().find(x => x.pid === pid && x.dir === 'in' && x.cool && x.cool > Clock.today());
    if (last) { UI.toast(`${t.short}이(가) 당분간 이 선수 이야기는 하지 않겠다고 했습니다 (${last.cool.replace(/-/g, '.')}까지)`, 3200); return; }
    const pr = this.price(p, t), c = Contract.of(p, t), K = Neg.KIND[this.gm(t).kind];
    if (!b) {
      b = { id: 'b' + Date.now().toString(36), dir: 'in', pid, from: t.id, to: my.id, status: 'talk', date: Clock.today(), ask: pr.v, patience: K[1] - 1, log: [] };
      b.log.push({ who: 'gm', text: pr.locked
        ? `${p.name}은(는) 저희 팀의 핵심입니다. 솔직히 팔 생각이 없습니다. 그래도 제안을 주신다면 듣기는 하겠습니다.`
        : `${p.name} 건으로 연락 주셨군요. 계약이 ${Contract.label(c)}까지 남아 있습니다.${c.buyout ? ` 계약서에 바이아웃 ${Player.money(c.buyout)} 원 조항이 있습니다.` : ''} 제안을 보내 주시죠.` });
      this.bids().push(b);
    }
    this.draw(p, t, b);
  },
  draw(p, t, b) {
    const my = Roster.team(), G1 = this.gm(t);
    document.querySelectorAll('.ng-back').forEach(x => x.remove());
    const back = document.createElement('div');
    back.className = 'ng-back';
    back.innerHTML = `
      <div class="ng" role="dialog" aria-modal="true">
        <button class="pp-x" aria-label="닫기">×</button>
        <aside class="ng-side" style="--c:${t.color || '#555'}">
          ${G.face(p, 'ng-ph')}
          <b class="ng-name">${UI.esc(p.name)}</b>
          <span class="ng-sub">${G.pos(p.role, true)} · ${p.age || '-'}세 · ${UI.esc(t.short)}</span>
          <dl class="cr-dl">
            <dt>계약</dt><dd>${Player.money(Contract.of(p, t).salary)} · ${Contract.label(Contract.of(p, t))}</dd>
            <dt>시장 가치</dt><dd>${Player.money(Contract.value(p, t))}</dd>
            <dt>협상 상대</dt><dd>${UI.esc(G1.name)} <small>${Neg.KIND[G1.kind][0]}</small></dd>
          </dl>
          <div class="ng-pat"><span>인내심</span><div class="ng-pbar"></div></div>
        </aside>
        <section class="ng-main">
          <div class="ng-head">이적료 협상 <small>${UI.esc(t.name)} → ${UI.esc(my.name)}</small></div>
          <div class="ng-log"></div>
          <div class="ng-qs"></div>
          <form class="ng-form">
            <label><span>이적료 (억 원)</span><input name="fee" type="number" step="0.5" min="0.5" value="${Math.max(.5, Math.round(b.ask * .8 * 2) / 2)}"></label>
            <div class="ng-act"><button type="button" class="btn-ghost ng-quit">협상 종료</button><button type="submit" class="btn-primary ng-send">제안 보내기</button></div>
          </form>
        </section>
      </div>`;
    document.body.appendChild(back);
    const f = $('.ng-form', back);
    const close = () => { back.remove(); Router.go(Router.current()); };
    const paint = () => {
      $('.ng-log', back).innerHTML = b.log.map(m => `<div class="ng-msg ${m.who === 'me' ? 'me' : ''}"><b>${m.who === 'me' ? '나' : UI.esc(G1.name)}</b><p>${UI.esc(m.text).replace(/\n/g, '<br>')}</p></div>`).join('');
      $('.ng-log', back).scrollTop = 1e6;
      $('.ng-pbar', back).innerHTML = Array.from({ length: Neg.KIND[G1.kind][1] - 1 }, (_, i) => `<i class="${i < b.patience ? 'on' : ''}"></i>`).join('');
      const over = b.status !== 'talk';
      $$('input,.ng-send', f).forEach(x => x.disabled = over);
      $('.ng-qs', back).innerHTML = b.status === 'agreed' ? '<button class="btn-primary ng-next">선수 측과 개인 조건 협상 →</button>' : '';
      const nx = $('.ng-next', back); if (nx) nx.onclick = () => { back.remove(); Neg.open(p.id, 'transfer'); };
    };
    f.onsubmit = e => { e.preventDefault(); this.offer(p, t, b, Math.round((+f.fee.value || 0) * 10) / 10); paint(); };
    $('.ng-quit', back).onclick = close;
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('.pp-x')) close(); });
    paint();
  },
  offer(p, t, b, fee) {
    if (fee <= 0 || b.status !== 'talk') return;
    const c = Contract.of(p, t), pr = this.price(p, t), K = Neg.KIND[this.gm(t).kind];
    b.log.push({ who: 'me', text: `이적료 ${Player.money(fee)} 원을 제안합니다.` });
    if (c.buyout && fee >= c.buyout) { b.status = 'agreed'; b.fee = fee; b.log.push({ who: 'gm', text: `바이아웃 금액을 채우셨군요. 계약서대로 이적을 허락하겠습니다. 이제 선수 측과 이야기하시면 됩니다.` }); return; }
    const need = b.ask * (pr.locked ? 1.6 : 1) * (1 + K[2]);
    if (fee >= need) { b.status = 'agreed'; b.fee = fee; b.log.push({ who: 'gm', text: `좋습니다. ${Player.money(fee)} 원에 합의하죠. 선수 측과 개인 조건을 맞춰 보세요.` }); return; }
    b.patience -= fee < need * .6 ? 2 : 1;
    if (b.patience <= 0) { b.status = 'rejected'; b.cool = Store.addDays(Clock.today(), 14); b.log.push({ who: 'gm', text: '이 정도 차이면 더 이야기해도 소용없겠습니다. 이 건은 접겠습니다.\n\n(14일 동안 다시 제안할 수 없습니다)' }); return; }
    if (fee < need * .6) { b.log.push({ who: 'gm', text: '농담하시는 거죠? 이 금액이면 받을 이유가 없습니다.' }); return; }
    b.ask = Contract.r1(Math.max(fee, b.ask - (need - fee) * K[3] / (pr.locked ? 1.6 : 1)));
    b.log.push({ who: 'gm', text: `${Player.money(fee)} 원으로는 어렵습니다. ${Player.money(b.ask * (pr.locked ? 1.6 : 1) * (1 + K[2]))} 원이라면 생각해 보겠습니다.` });
  },
  // 개인 조건까지 합의 → 이적 완료 (Neg.finish 가 부른다)
  complete(pid) {
    const b = this.open$(pid); if (!b) return;
    b.status = 'done'; b.done = Clock.today();
    World.ledger().push({ date: Clock.today(), label: `${Player.find(pid)?.p.name || pid} 이적료`, amount: -Math.round(b.fee * 1e8) });
  },

  // ---------- 다른 구단 → 우리: 이적 제안 메시지 ----------
  bidFor(today) {
    const my = Roster.team(), stove = Schedule.events.some(e => e.kind === 'stove' && e.start <= today && today <= e.end);
    const listed = Contract.st().listed || {};
    if (Engine.rnd('bid') > (stove ? .06 : .015) + (Object.keys(listed).length ? .1 : 0)) return;
    const cands = [...my.players, ...(my.cl || []).filter(p => (Contract.st().listed || {})[p.id])].filter(p => !p.free && Player.days(p) > 30 && !(Contract.st().contracts[p.id]?.signed > Store.addDays(today, -60)) && !this.bids().some(b => b.pid === p.id && b.dir === 'out' && b.date > Store.addDays(today, -30)));
    if (!cands.length) return;
    const req = cands.filter(p => listed[p.id]);                                // 이적 요청한 선수부터
    const p = (req.length ? req : cands)[Math.floor(Engine.rnd('who') * (req.length || cands.length))], s = Contract.score(p, my);
    const buyers = App.db.teams.filter(t => t.id !== my.id && (t.rep || 2) >= (my.rep || 2) - 1 && (s < 85 || (t.rep || 2) >= 4) && (p.nation !== 'South Korea' || ['LCK', 'LPL'].includes(t.league)) && t.players.filter(x => x.role === p.role).every(x => Contract.score(x, t) < s - 2) && Club.wageRoom(t) > Contract.pay(p, s, t.league) * .5);
    if (!buyers.length) return;
    const t = buyers[Math.floor(Engine.rnd('buyer') * buyers.length)], c = Contract.of(p, my);
    const fee = Contract.r1((c.buyout && Engine.rnd('bo') < .4 ? c.buyout : this.price(p, my).v * (.7 + Engine.rnd('fee') * .35)));
    const b = { id: 'b' + Date.now().toString(36) + p.id, dir: 'out', pid: p.id, from: my.id, to: t.id, fee, status: 'pending', date: today };
    this.bids().push(b);
    const forced = c.buyout && fee >= c.buyout;
    Inbox.push({ from: { name: `${t.short} 단장`, role: 'board' }, subject: `${t.short}, ${p.name} 이적 제안 (${Player.money(fee)})`, priority: 'todo', ctx: { pid: p.id, player: p.name, bid: b.id },
      body: forced ? `${t.name}이(가) ${p.name}의 바이아웃 금액 ${Player.money(fee)} 원을 제시했습니다.\n\n계약서 조항에 따라 구단은 이적을 막을 수 없습니다. 선수가 동의하면 이적이 진행됩니다.`
        : `${t.name}이(가) ${p.name}을(를) 이적료 ${Player.money(fee)} 원에 영입하고 싶다고 합니다.\n\n시장 가치는 ${Player.money(Contract.value(p, my))} 원으로 평가됩니다.`,
      choices: forced ? [{ label: '확인', act: 'bidAccept', reply: '바이아웃 조항에 따라 이적이 진행됩니다.' }] : [
        { label: '수락', act: 'bidAccept', reply: '제안을 받아들였습니다.' },
        { label: '역제안 (+30%)', odds: .45, outcomes: [{ act: 'bidAccept', arg: 1.3, reply: `${t.short}이(가) 역제안을 받아들였습니다.` }, { act: 'bidReject', reply: `${t.short}이(가) 그 금액이면 어렵다며 물러났습니다.` }] },
        { label: '거절', act: 'bidReject', fx: { morale: (t.rep || 2) > (my.rep || 2) ? -2 : 0 }, reply: '제안을 거절했습니다.' }] });
  },
  // 다른 구단으로 이적: 이적료 수입 + 새 팀 계약
  sell(b, mult = 1) {
    const hit = Player.find(b.pid); if (!hit) return;
    const { p } = hit, t = App.db.teams.find(x => x.id === b.to);
    b.fee = Contract.r1(b.fee * mult); b.status = 'done'; b.done = Clock.today();
    World.ledger().push({ date: Clock.today(), label: `${p.name} 이적료 수입`, amount: Math.round(b.fee * 1e8) });
    const s = Contract.score(p, t), yrs = 1 + Math.floor(G.rand(p.id + b.id, 'y') * 2);
    Contract.sign(p.id, t.id, { salary: Contract.r1(Contract.pay(p, s, t.league) * 1.1), end: Contract.addYears(Contract.seasonEnd(t), yrs), years: yrs, option: null, bonus: [] });
    Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: `[오피셜] ${p.name}, ${t.short}로 이적`, body: `${p.name}이(가) 이적료 ${Player.money(b.fee)} 원에 ${t.name}으로 떠났습니다.` });
    const my = Roster.team();
    Market.post(`[오피셜] ${p.name}, ${my.short} 떠나 ${t.short}로`, `${my.name}의 ${G.ROLE_KO[p.role] || ''} ${p.name}이(가) 이적료 ${Player.money(b.fee)} 원에 ${t.name}으로 이적했습니다.`, p.id);
  },
};
Engine.ACTS.bidAccept = (m, mult) => { const b = Transfer.bids().find(x => x.id === m.ctx.bid); if (b && b.status === 'pending') Transfer.sell(b, mult || 1); };
Engine.ACTS.bidReject = m => { const b = Transfer.bids().find(x => x.id === m.ctx.bid); if (b) b.status = 'rejected'; };
Engine.on(today => { if (Roster.team()) Transfer.bidFor(today); });

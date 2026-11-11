// 협상: 1군급은 에이전트와 채팅(FM 방식), 2군·아카데미는 계약서 한 장.
// 선수는 돈·출전·우승 가능성·리그(고향)·충성도에 가중치를 다르게 두고 제안을 평가한다. 인내심이 바닥나면 협상이 끝난다.
const Neg = {
  KIND: { tough: ['강경', 4, .03, .2], normal: ['무난', 5, 0, .3], kind: ['우호', 6, -.04, .4] }, // 이름 · 인내심 · 요구 기준 · 양보 폭
  KO1: ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신'],
  KO2: ['민수', '지훈', '현우', '성진', '재원', '동현', '태영', '승호', '준혁', '상우', '영민', '도윤'],
  EN1: ['Daniel', 'Lucas', 'Marco', 'Thomas', 'Kevin', 'Jonas', 'Alex', 'Ryan', 'Leo', 'Chris'],
  EN2: ['Weber', 'Laurent', 'Novak', 'Hansen', 'Ruiz', 'Fischer', 'Moreau', 'Clark', 'Berg', 'Costa'],
  CN1: ['王', '李', '张', '刘', '陈', '杨', '赵', '黄'],
  CN2: ['磊', '伟', '杰', '涛', '鹏', '超', '浩', '宇'],
  AGENCY: ['넥스트레벨', 'GG 매니지먼트', 'P1 에이전시', '스타필드 스포츠', '라인업 엔터', '블루포인트'],

  pick(a, r) { return a[Math.floor(r * a.length) % a.length]; },
  agent(p) {
    const r = k => G.rand(p.id, 'ag' + k), x = r('k');
    const kind = x < .3 ? 'tough' : x < .8 ? 'normal' : 'kind';
    const name = p.nation === 'South Korea' ? this.pick(this.KO1, r(1)) + this.pick(this.KO2, r(2))
      : p.nation === 'China' ? this.pick(this.CN1, r(1)) + this.pick(this.CN2, r(2)) : `${this.pick(this.EN1, r(1))} ${this.pick(this.EN2, r(2))}`;
    return { name, kind, agency: this.pick(this.AGENCY, r(3)) };
  },

  // 선수의 바람: 우선순위 가중치 · 원하는 기간 · 옵션 · 역할
  wants(p) {
    const r = k => G.rand(p.id, 'w' + k), s = Contract.score(p, Player.find(p.id)?.t || {}), age = p.age || 22;
    const w = { money: .3 + r(1) * .35, play: .15 + r(2) * .25 + (s >= 70 ? .1 : 0), win: .15 + r(3) * .2 + (s >= 80 ? .15 : 0), home: (p.nation === 'South Korea' ? .3 : .15) + r(4) * .2, loyal: r(5) * .35 };
    const years = age >= 27 ? 2 + (r(6) > .5 ? 1 : 0) : age <= 20 ? 1 + (r(6) > .6 ? 1 : 0) : s >= 85 ? 2 : 1 + (r(6) > .4 ? 1 : 0);
    const opt = s >= 80 ? 'player' : s < 65 ? 'any' : 'none';
    return { w, years, opt, role: p.sub ? 'rotation' : 'starter', s };
  },
  TOP: { money: '연봉', play: '출전 시간', win: '우승할 수 있는 팀', home: '익숙한 리그에서 뛰는 것', loyal: '지금 팀과의 의리' },

  // 협상 상태 (저장): 같은 선수와 3일 안에 다시 열면 이어간다
  session(p, mode) {
    const M = Contract.st(), my = Roster.team(), old = M.neg[p.id];
    if (old && old.cool && old.cool > Clock.today()) return old;
    if (old && !old.done && !old.cool && Fmt.daysBetween(old.date, Clock.today()) <= 3 && old.mode === mode) return old;
    const A = this.agent(p), W = this.wants(p), K = this.KIND[A.kind];
    const hit = Player.find(p.id), cur = hit && !p.free ? Contract.of(p, hit.t) : null;
    const rivals = mode === 'transfer' ? 0 : mode === 'renew' ? Math.floor(G.rand(p.id + Clock.year(), 'riv') * (W.s >= 75 ? 4 : 2)) : 1 + Math.floor(G.rand(p.id + Clock.year(), 'riv') * (W.s >= 75 ? 4 : 2));
    let ask = Contract.pay(p, W.s, my.league) * (1 + K[2] * 3 + .12 + rivals * .04);
    if (p.nation === 'South Korea' && my.league !== 'LCK') ask *= 1 + W.w.home * .8;           // 한국 선수가 해외로 가려면 더 받아야
    if (mode === 'renew') ask *= 1 - W.w.loyal * .15;                                            // 재계약 의리 할인
    if (mode === 'renew' && cur && (p.age || 22) < 28) ask = Math.max(ask, cur.salary * 1.05);    // 젊은 선수는 연봉 삭감을 받지 않는다
    ask = Contract.r1(Math.max(Contract.MIN.first, ask));
    const S = M.neg[p.id] = { pid: p.id, mode, date: Clock.today(), patience: K[1], max: K[1], ask, ask0: ask, rivals, asked: {}, log: [], rounds: 0 };
    const opening = `${my.name} 측 연락 감사합니다. ${p.name} 선수 에이전트 ${A.name}(${A.agency})입니다.\n\n`
      + (mode === 'renew' ? `선수는 ${my.short}에 남는 걸 긍정적으로 보고 있지만, 그에 맞는 대우를 원합니다. ` : mode === 'transfer' ? `구단 간 합의 소식 들었습니다. 선수도 ${my.short} 이적에 관심이 있습니다. ` : `선수는 새 팀을 찾고 있고, ${rivals}개 팀과 이야기 중입니다. `)
      + `연봉은 최소 ${Player.money(ask)} 원, 계약 기간은 ${W.years}년을 생각하고 있습니다.${W.role === 'starter' && W.s >= 65 ? ' 주전으로 뛰는 것도 중요합니다.' : ''}`;
    S.log.push({ who: 'agent', text: opening });
    return S;
  },

  // 제안 평가: 1.0 = 요구를 딱 맞춤
  judge(p, S, o) {
    const W = this.wants(p), my = Roster.team(), K = this.KIND[this.agent(p).kind];
    const why = [];
    const money = (o.salary + (o.signing || 0) / o.years) / S.ask;
    let u = money;
    if (money < .97) why.push('money');
    const dy = Math.abs(o.years - W.years); u -= dy * .04; if (dy) why.push('years');
    if (o.option === 'player') u += W.opt === 'player' ? .08 : .04;
    if (o.option === 'team') { u -= W.opt === 'player' ? .12 : W.opt === 'any' ? .01 : .05; if (W.opt !== 'any') why.push('teamopt'); }
    if (W.opt === 'player' && o.option !== 'player') why.push('wantopt');
    const better = my.players.some(x => x !== p && x.role === p.role && !x.sub && Contract.score(x, my) > W.s + 3);
    if (W.role === 'starter' && W.s >= 65) {
      if (o.promise === 'starter') u += .06 + W.w.play * .1;
      else { u -= (o.promise === 'rotation' ? .06 : .03) + (better ? .08 : 0) + W.w.play * .05; why.push('role'); }
    } else if (o.promise === 'starter' || o.promise === 'rotation') u += .03;
    u += Math.min(.06, (o.bonus || []).length * .02);
    if (o.buyout) u += .02;
    u += ((my.rep || 2) - 3) * .02 * (1 + W.w.win);
    u += Math.min(.04, S.rounds * .01);                         // 오래 이야기할수록 조금씩 누그러진다
    const need = 1 + K[2];
    return { u, money, need, why };
  },

  say: {
    accept: ['좋습니다. 이 조건이면 선수도 만족할 겁니다. 서류를 준비하겠습니다.', '선수와 통화했습니다. 이 조건으로 사인하겠다고 합니다.'],
    counter: ['거의 다 왔습니다. 다만 몇 가지는 조정이 필요합니다.', '선수 측 입장을 정리해서 말씀드리겠습니다.', '생각보다 차이가 크진 않네요. 조금만 더 맞춰 주시죠.'],
    low: ['솔직히 이 제안은 진지하게 받아들이기 어렵습니다.', '선수 가치를 너무 낮게 보시는 것 같습니다. 이런 식이면 오래 이야기하기 힘듭니다.'],
    quit: ['더 이야기해 봐야 서로 시간 낭비일 것 같습니다. 협상은 여기까지 하겠습니다.'],
    why: {
      money: a => `연봉은 ${Player.money(a)} 원은 돼야 합니다.`,
      years: (a, W) => `계약 기간은 ${W.years}년을 원합니다.`,
      teamopt: () => '구단 옵션은 선수에게 불리해서 받기 어렵습니다.',
      wantopt: () => '1년 연장 선수 옵션(1+1)을 넣어 주셨으면 합니다.',
      role: () => '주전 보장 없이는 선수가 망설입니다.',
    },
  },

  // 제안 보내기 → 에이전트 답
  offer(p, S, o) {
    const W = this.wants(p), K = this.KIND[this.agent(p).kind], R = this.judge(p, S, o), r = G.rand(p.id + S.date + S.rounds, 'say');
    S.rounds++;
    S.log.push({ who: 'me', text: this.offerText(o) });
    if (R.u >= R.need) { S.done = true; S.deal = o; S.log.push({ who: 'agent', text: this.pick(this.say.accept, r) }); return 'deal'; }
    const low = R.u < R.need - .25;
    S.patience -= low ? 2 : 1;
    if (S.patience <= 0) {
      S.cool = Store.addDays(Clock.today(), 7);
      if (S.mode === 'transfer') { const b = Transfer.open$(p.id); if (b) b.status = 'rejected'; }
      S.log.push({ who: 'agent', text: this.say.quit[0] + '\n\n(7일 동안 다시 협상할 수 없습니다)' });
      if (Player.isMine(Player.find(p.id).t)) { const m = World.morale(); m[p.id] = (m[p.id] || 0) - 2; }
      return 'quit';
    }
    if (low) { S.log.push({ who: 'agent', text: this.pick(this.say.low, r) + (this.agent(p).kind === 'tough' ? ' 요구 조건을 다시 생각해 봐야겠군요.' : '') }); if (this.agent(p).kind === 'tough') S.ask = Contract.r1(S.ask * 1.03); return 'low'; }
    const eff = o.salary + (o.signing || 0) / o.years;
    S.ask = Contract.r1(Math.max(eff, S.ask - (S.ask - eff) * K[3]));
    const lines = R.why.slice(0, 2).map(k => this.say.why[k](S.ask, W));
    S.log.push({ who: 'agent', text: `${this.pick(this.say.counter, r)}\n\n${lines.join('\n') || `연봉을 ${Player.money(S.ask)} 원으로 맞춰 주시면 됩니다.`}` });
    return 'counter';
  },
  offerText(o) {
    return [`연봉 ${Player.money(o.salary)} 원 · ${o.years}년${o.option ? ` + 1년 ${Contract.OPT[o.option]}` : ''}`,
      o.signing ? `계약금 ${Player.money(o.signing)} 원` : '', o.promise && o.promise !== 'none' ? Contract.PROMISE[o.promise] : '',
      (o.bonus || []).length ? `보너스: ${o.bonus.map(b => Contract.BONUS[b]).join(', ')}` : '', o.buyout ? `바이아웃 ${Player.money(o.buyout)} 원` : ''].filter(Boolean).join('\n');
  },

  // 질문 (협상마다 한 번씩)
  QUESTIONS: [['top', '가장 중요하게 보는 게 뭡니까?'], ['rivals', '다른 팀 제안이 있습니까?'], ['years', '계약 기간과 옵션은 어떻게 생각합니까?'], ['role', '역할은 어떻게 생각합니까?']],
  answer(p, S, q) {
    const W = this.wants(p), A = this.agent(p);
    S.asked[q] = true;
    S.log.push({ who: 'me', text: this.QUESTIONS.find(x => x[0] === q)[1] });
    const top = Object.entries(W.w).sort((a, b) => b[1] - a[1]);
    const txt = {
      top: `선수가 가장 중요하게 보는 건 ${this.TOP[top[0][0]]}이고, 그다음은 ${this.TOP[top[1][0]]}입니다.`,
      rivals: S.rivals ? (A.kind === 'tough' ? `${S.rivals + 1}개 팀이 구체적인 조건을 보내왔습니다. 시간이 많지 않습니다.` : `${S.rivals}개 팀이 관심을 보이고 있습니다.`) : (A.kind === 'tough' ? '그건 말씀드리기 곤란합니다.' : '아직 구체적인 제안은 없습니다.'),
      years: `${W.years}년을 원합니다. ${W.opt === 'player' ? '1+1이라면 연장 선택권은 선수가 갖는 조건이어야 합니다.' : W.opt === 'any' ? '옵션은 크게 상관없습니다.' : '구단 옵션은 가능하면 피하고 싶습니다.'}`,
      role: W.role === 'starter' && W.s >= 65 ? '선수는 주전으로 뛰길 원합니다. 약속해 주시면 큰 힘이 될 겁니다.' : '경쟁은 각오하고 있습니다. 기회만 주시면 됩니다.',
    }[q];
    S.log.push({ who: 'agent', text: txt });
  },

  // ---------- 채팅 창 ----------
  can(p, mode) {
    const hit = Player.find(p.id); if (!hit) return '선수를 찾을 수 없습니다.';
    if (mode === 'transfer') { const b = Transfer.open$(p.id); if (!b || b.status !== 'agreed') return '먼저 원 소속 구단과 이적료를 합의해야 합니다.'; }
    if (mode === 'fa' && !p.free && !(Player.days(p) < 0)) return `계약 기간 중인 선수입니다. 계약이 끝나는 ${p.contractEnd ? p.contractEnd.replace(/-/g, '.') : '-'} 이후에 협상할 수 있습니다.`;
    const S = Contract.st().neg[p.id];
    if (S && S.cool && S.cool > Clock.today()) return `협상이 결렬됐습니다. ${S.cool.replace(/-/g, '.')}부터 다시 협상할 수 있습니다.`;
    return null;
  },
  open(pid, mode = 'renew') {
    const hit = Player.find(pid); if (!hit) return;
    const { p, t } = hit;
    if (Contract.tier(p) !== 'first' || p.role === 'COACH') return this.sheet(pid, mode);
    const no = this.can(p, mode); if (no) { UI.toast(no, 3200); return; }
    const S = this.session(p, mode), A = this.agent(p), my = Roster.team();
    const cur = !p.free ? Contract.of(p, t) : null;
    document.querySelectorAll('.ng-back').forEach(x => x.remove());
    const back = document.createElement('div');
    back.className = 'ng-back';
    const opts = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
    const room = () => Club.wageRoom(my) + (mode === 'renew' && cur ? cur.salary : 0);
    back.innerHTML = `
      <div class="ng" role="dialog" aria-modal="true">
        <button class="pp-x" aria-label="닫기">×</button>
        <aside class="ng-side" style="--c:${t.color || '#555'}">
          ${G.face(p, 'ng-ph')}
          <b class="ng-name">${UI.esc(p.name)}</b>
          <span class="ng-sub">${G.pos(p.role, true)} · ${p.age || '-'}세 · ${UI.esc(t.short)}</span>
          <dl class="cr-dl">
            <dt>현재 계약</dt><dd>${cur ? `${Player.money(cur.salary)} · ${Contract.label(cur)}` : '없음 (FA)'}</dd>
            <dt>에이전트</dt><dd>${UI.esc(A.name)} <small>${UI.esc(A.agency)}</small></dd>
            <dt>성향</dt><dd>${this.KIND[A.kind][0]}</dd>
            <dt>연봉 여유</dt><dd class="ng-room"></dd>
          </dl>
          <div class="ng-pat"><span>인내심</span><div class="ng-pbar"></div></div>
        </aside>
        <section class="ng-main">
          <div class="ng-head">${({ renew: '재계약 협상', fa: 'FA 계약 협상', transfer: '이적 개인 조건 협상' })[mode]} <small>${UI.esc(my.name)}</small></div>
          <div class="ng-log"></div>
          <div class="ng-qs"></div>
          <form class="ng-form">
            <label><span>연봉 (억 원)</span><input name="salary" type="number" step="0.1" min="0.1"></label>
            <label><span>기간</span><select name="years"><option value="1">1년</option><option value="2">2년</option><option value="3">3년</option></select></label>
            <label><span>옵션 (1+1)</span><select name="option"><option value="">없음</option>${opts(Contract.OPT)}</select></label>
            <label><span>계약금 (억 원)</span><input name="signing" type="number" step="0.1" min="0" value="0"></label>
            <label><span>역할 약속</span><select name="promise">${opts(Contract.PROMISE, 'none')}</select></label>
            <label><span>바이아웃 (억 원, 선택)</span><input name="buyout" type="number" step="1" min="0" placeholder="없음"></label>
            <div class="ng-bonus"><span>성과 보너스</span>${Object.entries(Contract.BONUS).map(([k, l]) => `<label><input type="checkbox" name="bonus" value="${k}"> ${l}</label>`).join('')}</div>
            <div class="ng-act"><button type="button" class="btn-ghost ng-quit">협상 종료</button><button type="submit" class="btn-primary ng-send">제안 보내기</button></div>
          </form>
        </section>
      </div>`;
    document.body.appendChild(back);
    const f = $('.ng-form', back);
    f.salary.value = (S.deal ? S.deal.salary : S.ask).toFixed(1);
    f.years.value = String(this.wants(p).years);
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); Router.go(Router.current()); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const draw = () => {
      $('.ng-log', back).innerHTML = S.log.map(m => `<div class="ng-msg ${m.who}"><b>${m.who === 'me' ? '나' : UI.esc(A.name)}</b><p>${UI.esc(m.text).replace(/\n/g, '<br>')}</p></div>`).join('');
      $('.ng-log', back).scrollTop = 1e6;
      $('.ng-pbar', back).innerHTML = Array.from({ length: S.max }, (_, i) => `<i class="${i < S.patience ? 'on' : ''}"></i>`).join('');
      const rm = room(), off = +f.salary.value || 0;
      $('.ng-room', back).innerHTML = `<span class="${rm - off < 0 ? 'warn' : ''}">${rm - off >= 0 ? '' : '−'}${Player.money(Math.abs(rm - off))}</span> <small>제안 후</small>`;
      const over = S.done || S.cool;
      $('.ng-qs', back).innerHTML = over ? (S.done ? '<button class="btn-primary ng-sign">계약서에 사인</button>' : '') : this.QUESTIONS.filter(([k]) => !S.asked[k]).map(([k, l]) => `<button class="btn-ghost btn-sm" data-q="${k}">${l}</button>`).join('');
      $$('input,select,button', f).forEach(x => { if (!x.classList.contains('ng-quit')) x.disabled = !!over; });
      $$('[data-q]', back).forEach(b => b.onclick = () => { this.answer(p, S, b.dataset.q); draw(); });
      const sign = $('.ng-sign', back); if (sign) sign.onclick = () => { this.finish(p, t, S, mode); close(); };
    };
    f.oninput = draw;
    f.onsubmit = e => {
      e.preventDefault();
      const o = { salary: Contract.r1(+f.salary.value || 0), years: +f.years.value, option: f.option.value || null, signing: Contract.r1(+f.signing.value || 0), promise: f.promise.value, buyout: +f.buyout.value || null, bonus: $$('[name=bonus]:checked', f).map(x => x.value) };
      if (o.salary <= 0) { UI.toast('연봉을 입력하세요'); return; }
      this.offer(p, S, o); draw();
    };
    $('.ng-quit', back).onclick = close;
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('.pp-x')) close(); });
    draw();
  },

  // 사인: 계약 기록 · 계약금 장부 · 메시지
  finish(p, t, S, mode) {
    const my = Roster.team(), o = S.deal, cur = !p.free ? Contract.of(p, t) : null;
    const startEnd = mode === 'renew' && cur && cur.end && cur.end >= Clock.today() ? cur.end : Contract.seasonEnd(my);
    const end = Contract.addYears(startEnd, o.years);
    if (mode === 'transfer') Transfer.complete(p.id);
    Contract.sign(p.id, my.id, { salary: o.salary, end, option: o.option, buyout: o.buyout, promise: o.promise, bonus: o.bonus, signing: o.signing, years: o.years });
    if (o.signing) World.ledger().push({ date: Clock.today(), label: `${p.name} 계약금`, amount: -Math.round(o.signing * 1e8) });
    if (o.promise === 'starter' || o.promise === 'rotation') (App.state.promises ||= []).push({ pid: p.id, kind: o.promise, date: Clock.today(), due: end, src: 'contract' });
    S.done = true; S.signed = true;
    Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: mode === 'renew' ? `[오피셜] ${p.name} 재계약` : `[오피셜] ${p.name} 영입`,
      body: `${p.name}과(와) 계약을 마쳤습니다.\n\n${this.offerText(o)}\n계약 만료: ${Contract.label({ end, option: o.option })}` });
    UI.toast(mode === 'renew' ? `${p.name} 재계약 완료` : `${p.name} 영입 완료`);
  },

  // ---------- 2군·아카데미·코치: 계약서 한 장 ----------
  sheet(pid, mode) {
    const { p, t } = Player.find(pid), my = Roster.team();
    if (mode === 'fa') { const no = this.can(p, mode); if (no) { UI.toast(no, 3200); return; } }
    const tier = p.role === 'COACH' ? 'first' : Contract.tier(p);
    const cur = !p.free ? Contract.of(p, t) : null;
    const ask = Contract.r1(Math.max(Contract.pay(p, Contract.score(p, t), my.league) * 1.05, cur ? cur.salary : 0));
    UI.modal({
      title: `${p.name} — ${mode === 'renew' ? '재계약' : '계약'} (${p.role === 'COACH' ? '코칭스태프' : Squad.LV[tier] || '1군'})`,
      body: `<div class="neg">
        <div class="neg-row"><span>현재 연봉</span><b>${cur ? Player.money(cur.salary) + ' 원' : '없음'}</b></div>
        <div class="neg-row"><span>요구 연봉</span><b>${Player.money(ask)} 원</b></div>
        <label class="field"><span>제시 연봉 (억 원)</span><input class="sh-sal" type="number" step="0.05" min="0.05" value="${ask.toFixed(1)}"></label>
        <label class="field"><span>계약 기간</span><select class="sh-yrs"><option value="1">1년</option><option value="2" selected>2년</option><option value="3">3년</option></select></label>
        <p class="cr-note">${p.role === 'COACH' ? '코칭스태프' : '2군·아카데미 선수'}는 계약서 한 장으로 처리합니다. 요구 연봉 이상이면 사인합니다.</p></div>`,
      actions: [{ label: '취소' }, {
        label: '계약서 보내기', primary: true, onClick: back => {
          const sal = Contract.r1(+$('.sh-sal', back).value || 0), yrs = +$('.sh-yrs', back).value;
          if (sal < ask * .97) { UI.toast(`${p.name} 측이 거절했습니다. ${Player.money(ask)} 원은 받아야 한다고 합니다.`, 3200); return false; }
          const start = mode === 'renew' && cur && cur.end && cur.end >= Clock.today() ? cur.end : Contract.seasonEnd(my);
          const end = p.gen ? Store.addDays(Clock.today(), 365 * yrs) : Contract.addYears(start, yrs);
          if (p.gen) { Squad.gen()[p.id].contractEnd = end; Squad.apply(); }
          else Contract.sign(p.id, my.id, { salary: sal, end, years: yrs, option: null, bonus: [] });
          Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: `[오피셜] ${p.name} ${mode === 'renew' ? '재계약' : '계약'}`, body: `${p.name}과(와) 연봉 ${Player.money(sal)} 원, ${yrs}년 계약을 맺었습니다.` });
          UI.toast('계약을 마쳤습니다'); Router.go(Router.current());
        },
      }],
    });
  },
};

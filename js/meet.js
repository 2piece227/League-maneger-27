/* LM 27 — 선수 면담
   선수 정보 창 · 선수 관계 화면의 '면담' 버튼으로 연다. 한 선수와는 14일에 한 번.
   주제마다 선수의 성격(충성도 · 야망 · 침착함 · 나이)과 지금 상태(사기 · 최근 폼 · 위치)에 따라 반응이 다르다.
   결과는 감독과의 관계(Rel) · 사기(World.morale)로 남고, 숫자는 보이지 않는다 (말과 표정으로만).
   약속(주전 기회 · 1군 콜업)은 기한 안에 지키지 않으면 크게 실망한다. 트레이드설을 '사실무근'이라 해 놓고 팔면 팀 전체가 실망한다. */
const Meet = {
  COOL: 14, PROMISE_DAYS: 45, DENY_DAYS: 90,
  st() { return (App.state.meet ||= { last: {}, promise: {}, denied: {} }); },
  hid(p, k, d = 11) { return ((p.attributes || {}).hidden || {})[k] ?? d; },
  ment(p, k, d = 11) { return ((p.attributes || {}).mental || {})[k] ?? d; },
  left(pid) { const l = this.st().last[pid]; return l ? Math.max(0, this.COOL - Fmt.daysBetween(l, Clock.today())) : 0; },
  // 최근 트레이드설 (45일 안, 아직 면담으로 풀지 않음)
  rumor(pid) { const e = Rel.log(pid).find(x => /트레이드설/.test(x.why || '')); return e && Fmt.daysBetween(e.d, Clock.today()) <= 45 && !(this.st().cleared || {})[pid + e.d] ? e : null; },
  formAvg(p) { const f = Roster.status(p).form; return f.reduce((a, v) => a + +v, 0) / f.length; },

  topics(p) {
    const lv = p.level || 'first', st = Roster.status(p), out = [];
    out.push({ k: 'praise', label: '최근 활약을 칭찬한다', desc: '폼이 좋을 때 효과가 큽니다. 부진할 때는 빈말로 들릴 수 있어요.' });
    out.push({ k: 'trust', label: '믿고 있다고 다독인다', desc: '사기가 떨어졌거나 부진한 선수에게 잘 통합니다.' });
    out.push({ k: 'demand', label: '더 잘해야 한다고 쓴소리한다', desc: '야망이 크거나 노련한 선수는 자극을 받지만, 여린 선수는 상처받습니다.' });
    if (lv !== 'first' || p.sub) out.push({ k: 'future', label: lv === 'first' ? '주전 기회를 약속한다' : '1군 콜업을 약속한다', desc: `${this.PROMISE_DAYS}일 안에 ${lv === 'first' ? '주전으로 기용' : '1군으로 올리'}지 않으면 크게 실망합니다.` });
    if (this.rumor(p.id)) out.push({ k: 'rumorDeny', label: '트레이드설은 사실무근이라고 한다', desc: `안심시키지만, ${this.DENY_DAYS}일 안에 이 선수를 트레이드하면 선수단 전체가 실망합니다.` },
      { k: 'rumorHonest', label: '팀 사정을 솔직하게 설명한다', desc: '충성도가 높은 선수일수록 이해해 줍니다.' });
    if (st.morale <= 1) out.push({ k: 'listen', label: '고민을 들어 준다', desc: '말없이 들어 주는 것만으로도 풀리는 선수가 있습니다.' });
    return out;
  },

  // 반응: [관계 변화, 사기 변화, 선수의 말]
  react(p, k) {
    const loy = this.hid(p, 'loyalty'), amb = this.hid(p, 'ambition'), calm = this.ment(p, 'composure'), vet = (p.age || 20) >= 25;
    const form = this.formAvg(p), mor = Roster.status(p).morale, r = G.rand(p.id + Clock.today(), 'meet' + k);
    const say = (a, b, c) => [a, b, c];
    switch (k) {
      case 'praise':
        return form >= 7 ? say(6, 1, '감사합니다! 지금 감이 좋아요. 이대로 쭉 가 보겠습니다.')
          : form >= 6 ? say(3, 1, '좋게 봐 주셔서 감사해요. 더 잘할 수 있습니다.')
          : say(r < .5 ? 0 : -1, 0, '…요즘 제 경기력은 제가 제일 잘 알아요. 그래도 말씀은 감사합니다.');
      case 'trust':
        return mor <= 1 || form < 6 ? say(6, 2, vet ? '그렇게 말씀해 주시니 마음이 놓입니다. 다시 제 폼 찾아오겠습니다.' : '정말요? …힘이 나요. 다음 경기는 꼭 보여 드릴게요.')
          : say(2, 0, '네, 감사합니다. 지금은 괜찮아요.');
      case 'demand':
        return amb >= 14 || (vet && calm >= 12) ? say(1, 1, '맞는 말씀입니다. 저도 지금이 만족스럽지 않아요. 바꿔 보겠습니다.')
          : calm <= 9 ? say(-9, -2, '…알겠습니다. (표정이 굳었다)')
          : say(-4, -1, '네… 노력하고 있는데 아쉽네요.');
      case 'future': {
        const lv = p.level || 'first';
        this.st().promise[p.id] = { until: Store.addDays(Clock.today(), this.PROMISE_DAYS), kind: lv === 'first' ? 'starter' : 'first', made: Clock.today() };
        return say(amb >= 13 ? 9 : 6, 2, lv === 'first' ? '정말이죠? 그 말 믿고 준비하겠습니다.' : '1군이요? …꼭 기회 잡겠습니다. 감사합니다!');
      }
      case 'rumorDeny':
        this.st().denied[p.id] = Clock.today(); this.clear(p.id);
        return say(loy >= 12 ? 12 : 8, 2, '다행이에요. 기사 보고 잠을 못 잤거든요. 그 말 믿겠습니다.');
      case 'rumorHonest':
        this.clear(p.id);
        return loy >= 14 ? say(7, 1, '솔직하게 말씀해 주셔서 감사합니다. 팀 사정은 이해해요. 남는 동안은 최선을 다하겠습니다.')
          : loy >= 10 ? say(3, 0, '…이해는 합니다. 그래도 서운한 건 어쩔 수 없네요.')
          : say(-3, -1, '결국 언제든 보낼 수 있다는 말씀이네요. 저도 제 거취를 생각해 보겠습니다.');
      case 'listen':
        return say(4 + (calm <= 10 ? 2 : 0), 1, '이야기 들어 주셔서 감사해요. 혼자 끙끙 앓고 있었는데 좀 후련해요.');
    }
    return say(0, 0, '네.');
  },
  clear(pid) { const e = Rel.log(pid).find(x => /트레이드설/.test(x.why || '')); if (e) (this.st().cleared ||= {})[pid + e.d] = 1; },

  open(pid) {
    const hit = Player.find(pid); if (!hit) return;
    const p = hit.p, wait = this.left(pid);
    if (wait) { UI.toast(`${p.name} 선수와는 최근에 면담했습니다. ${wait}일 뒤에 다시 할 수 있어요.`, 3000); return; }
    const pr = this.st().promise[pid];
    const topics = this.topics(p);
    UI.modal({
      title: `${Sim.josa(p.name, '과', '와')} 면담`,
      body: `<div class="mt-head">${G.face(p, 'pl-ph')}<div><b>${UI.esc(p.name)}</b><small>${G.ROLE_KO[p.role] || ''} · ${p.age || '-'}세 · 관계 ${Rel.word(pid)} · 사기 ${Roster.MORALE[Roster.status(p).morale][0]}</small></div></div>
        ${pr ? `<p class="mt-note">지킬 약속: ${pr.kind === 'starter' ? '주전 기회' : '1군 콜업'} (${Fmt.dayLabel(pr.until)}까지)</p>` : ''}
        <p class="mt-ask">무슨 이야기를 할까요?</p>
        <div class="mt-list">${topics.map(t => `<button class="mt-opt" data-k="${t.k}"><b>${t.label}</b><small>${t.desc}</small></button>`).join('')}</div>`,
      actions: [{ label: '그만두기' }],
    });
    document.querySelectorAll('.mt-opt').forEach(b => b.onclick = () => {
      const k = b.dataset.k, label = b.querySelector('b').textContent, before = Rel.word(pid);
      const [dr, dm, line] = this.react(p, k);
      Rel.add(pid, dr, `면담: ${label}`);
      const mor = World.morale(); mor[pid] = (mor[pid] || 0) + dm;
      this.st().last[pid] = Clock.today();
      const after = Rel.word(pid), face = dr >= 5 ? '😊' : dr > 0 ? '🙂' : dr === 0 ? '😐' : dr > -5 ? '😕' : '😠';
      const box = document.querySelector('.mt-list').parentElement;
      box.innerHTML = `<div class="mt-head">${G.face(p, 'pl-ph')}<div><b>${UI.esc(p.name)}</b><small>${UI.esc(label)}</small></div></div>
        <blockquote class="mt-say">${face} “${UI.esc(line)}”</blockquote>
        <p class="mt-res">감독과의 관계: <b>${before}</b>${after !== before ? ` → <b>${after}</b>` : ' (그대로)'}</p>`;
      document.querySelectorAll('#modal-root .modal-foot button').forEach(x => { x.textContent = '닫기'; });
      Inbox.push({ from: { name: p.name, role: 'player', photo: p.photo }, subject: `${Sim.josa(p.name, '과', '와')} 면담: ${label}`, body: `“${line}”\n\n감독과의 관계: ${before}${after !== before ? ' → ' + after : ''}` });
    });
  },

  // 매일: 약속 기한 확인
  daily(today) {
    const t = Roster.team(); if (!t) return;
    const S = this.st();
    Object.entries(S.promise).forEach(([pid, pr]) => {
      const hit = Player.find(pid); if (!hit || hit.t !== t) { delete S.promise[pid]; return; }
      const p = hit.p, done = pr.kind === 'starter' ? (p.level === 'first' && !p.sub) : p.level === 'first';
      if (done) { delete S.promise[pid]; Rel.add(pid, 4, '면담 약속을 지킴'); return; }
      if (today < pr.until) return;
      delete S.promise[pid];
      Rel.add(pid, -20, '면담 약속을 어김'); const mor = World.morale(); mor[pid] = (mor[pid] || 0) - 3;
      Inbox.push({ from: { name: p.name, role: 'player', photo: p.photo }, subject: `${p.name}, 약속에 대해 실망했다고 합니다`, priority: 'todo', link: 'roster-relations',
        body: pr.kind === 'starter' ? '감독님, 주전 기회를 주신다고 하셨잖아요. …솔직히 많이 실망했습니다.' : '1군에 올려 주신다고 하셔서 기다렸는데요. 이제 무슨 말을 믿어야 할지 모르겠어요.' });
    });
  },
  // 트레이드로 보낸 선수에게 '사실무근'이라고 했었다면: 선수단 전체가 실망
  traded(pid) {
    const d = this.st().denied[pid]; if (!d || Fmt.daysBetween(d, Clock.today()) > this.DENY_DAYS) return;
    delete this.st().denied[pid];
    const t = Roster.team(); t.players.forEach(p => Rel.add(p.id, -6, '트레이드설을 부인하고 트레이드'));
    const mor = World.morale(); t.players.forEach(p => { mor[p.id] = (mor[p.id] || 0) - 1; });
    Inbox.push({ from: { name: '주장', role: 'player' }, subject: '선수단 분위기가 좋지 않습니다', priority: 'todo', link: 'roster-relations', body: '감독님이 트레이드는 없다고 하셨던 선수가 결국 떠나서, 다들 동요하고 있습니다. 감독님 말을 어디까지 믿어야 하나 하는 분위기예요.' });
  },
};
Engine.on(today => { if (App.state.teamId && !App.state.unemployed) Meet.daily(today); });

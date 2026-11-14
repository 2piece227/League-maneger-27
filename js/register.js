// 국제대회 로스터 등록: 진출이 정해지면 대회 전날까지 주전 5명 + 후보를 등록한다. 월즈는 후보 1명이 필수.
// 등록하지 않으면 사무국이 주전 5명(+ 가장 나은 후보)으로 자동 등록. 대회 기간에는 등록한 선수만 뛴다(Draft.lineup).
// 저장: App.state.reg[키] = { starters: { TOP: pid, … }, subs: [pid], auto }
const Register = {
  st() { return (App.state.reg ||= {}); },
  // 등록 단위: 월즈 플레이-인과 본선은 한 번에
  key(e) { return `${e.year}:${/^worlds/.test(e.base) ? 'worlds' : e.base}`; },
  name(e) { return /^worlds/.test(e.base) ? `${e.year} 월드 챔피언십` : e.label; },
  needSub(e) { return /^worlds/.test(e.base); },
  // 우리 팀이 나가는 국제대회 (진출 확정)
  events() {
    const my = App.state.teamId, b = App.state.brk || {};
    return Schedule.events.filter(e => e.league === 'INTL' && !e.past && (b[e.id] || []).includes(my) && Clock.today() <= e.end);
  },
  pending() { return this.events().filter(e => !this.st()[this.key(e)]); },
  deadline(e) { const first = this.events().filter(x => this.key(x) === this.key(e)).map(x => x.start).sort()[0] || e.start; return Store.addDays(first, -1); },
  pool() { const t = Roster.team(); return [...t.players, ...(t.cl || [])].filter(p => p.role !== 'COACH'); },
  // 자동 등록: 지금 주전 + 남은 선수 중 가장 높은 OVR 1명
  autoPick() {
    const t = Roster.team(), line = Draft.lineup(t), starters = {};
    G.ROLES.forEach((r, i) => { if (line[i]) starters[r] = line[i].id; });
    const rest = this.pool().filter(p => !Object.values(starters).includes(p.id)).sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
    return { starters, subs: rest.slice(0, 1).map(p => p.id) };
  },
  // 지금 진행 중인 국제대회의 등록 명단 (없으면 null)
  active() {
    const d = Clock.today(), e = this.events().find(x => x.start <= d && d <= x.end);
    return e ? this.st()[this.key(e)] || null : null;
  },
  // 매일: 진출 확정 알림 · 마감일 자동 등록
  daily(today) {
    this.events().forEach(e => {
      const k = this.key(e), dl = this.deadline(e);
      if (!this.st()[k] && Engine.once('regmsg:' + k)) Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: `${this.name(e)} 로스터 등록 (${Fmt.dayLabel(dl)}까지)`, priority: 'todo', link: 'match-register',
        body: `${this.name(e)} 진출이 확정됐습니다. ${Fmt.dayLabel(dl)}까지 출전 로스터를 등록해 주십시오.\n\n주전 5명과 후보를 등록합니다.${this.needSub(e) ? ' 월즈는 후보 1명 이상이 필수입니다.' : ''} 등록한 선수만 대회에 나갈 수 있습니다. 기한까지 등록하지 않으면 지금 주전으로 자동 등록합니다.` });
      if (!this.st()[k] && today >= dl) {
        const a = this.autoPick(); this.st()[k] = { ...a, auto: true };
        Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: `${this.name(e)} 로스터 자동 등록`, link: 'match-register', body: `기한까지 등록이 없어 지금 주전 5명${a.subs.length ? '과 후보 1명' : ''}으로 등록했습니다.${this.needSub(e) && !a.subs.length ? '\n\n후보가 없어 월즈 등록 요건(후보 1명)을 채우지 못했습니다. 2군에서 선수를 올리거나 영입하십시오.' : ''}` });
      }
    });
  },

  // ---------- 화면 ----------
  async render(el) {
    await Promise.all([Portal.ready, Results.load()]);
    const evs = this.events(), seen = new Set(), list = evs.filter(e => { const k = this.key(e); if (seen.has(k)) return false; seen.add(k); return true; });
    if (!list.length) { el.innerHTML = `<div class="cr-page">${Career.head('국제대회 로스터 등록', '진출이 확정된 국제대회가 없습니다.')}</div>`; return; }
    const e = list.find(x => x.id === this.cur) || list[0]; this.cur = e.id;
    const k = this.key(e), saved = this.st()[k], d = this.draftFor(k, saved), pool = this.pool(), locked = Clock.today() > this.deadline(e);
    const opt = (r) => pool.filter(p => p.role === r).map(p => `<option value="${p.id}" ${d.starters[r] === p.id ? 'selected' : ''}>${UI.esc(p.name)} · OVR ${p.ovr || '-'}${p.level === 'cl' ? ' (2군)' : ''}</option>`).join('');
    const subs = pool.filter(p => !Object.values(d.starters).includes(p.id));
    const ok = G.ROLES.every(r => d.starters[r]) && (!this.needSub(e) || d.subs.length >= 1) && d.subs.length <= 2;
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('국제대회 로스터 등록', `${UI.esc(this.name(e))} · 마감 ${Fmt.dayLabel(this.deadline(e))}${saved ? (saved.auto ? ' · 자동 등록됨' : ' · 등록 완료') : ''}. 주전 5명 + 후보 최대 2명${this.needSub(e) ? ' (월즈는 후보 1명 필수)' : ''}. 대회 기간에는 등록한 선수만 뛸 수 있습니다.`)}
        ${list.length > 1 ? `<div class="seg rg-ev">${list.map(x => `<button class="${x === e ? 'on' : ''}" data-e="${x.id}">${UI.esc(this.name(x))}</button>`).join('')}</div>` : ''}
        <div class="cr-grid">
          <div class="card"><div class="card-head"><h3>주전</h3></div>
            ${G.ROLES.map(r => `<label class="rg-row">${G.pos(r, true)}<select class="ch-sort rg-st" data-r="${r}" ${locked ? 'disabled' : ''}><option value="">— 선택 —</option>${opt(r)}</select></label>`).join('')}
          </div>
          <div class="card"><div class="card-head"><h3>후보 <small>${d.subs.length}명</small></h3></div>
            ${subs.map(p => `<label class="rg-row rg-sub"><input type="checkbox" value="${p.id}" ${d.subs.includes(p.id) ? 'checked' : ''} ${locked ? 'disabled' : ''}>${G.face(p, 'pl-ph xs')}${G.ovr(p)}<b>${UI.esc(p.name)}</b>${G.pos(p.role)}${p.level === 'cl' ? '<small>2군</small>' : ''}</label>`).join('') || '<p class="ms-none">후보로 올릴 선수가 없습니다. 2군에서 올리거나 영입하세요.</p>'}
          </div>
        </div>
        <div class="card rg-foot"><span class="cr-dim">${ok ? '등록 요건을 채웠습니다.' : this.needSub(e) && !d.subs.length ? '월즈는 후보 1명 이상을 등록해야 합니다.' : '포지션마다 주전을 고르고, 후보는 2명까지입니다.'}</span>
          ${locked ? '<b>마감됨</b>' : `<button class="btn-ghost rg-auto">지금 주전으로 채우기</button><button class="btn-primary rg-save" ${ok ? '' : 'disabled'}>등록</button>`}</div>
      </div>`;
    const ev = $('.rg-ev', el); if (ev) ev.onclick = x => { const b = x.target.closest('button'); if (b) { this.cur = b.dataset.e; this.render(el); } };
    if (locked) return;
    $$('.rg-st', el).forEach(s => s.onchange = () => { d.starters[s.dataset.r] = s.value || null; d.subs = d.subs.filter(id => id !== s.value); this.render(el); });
    $$('.rg-sub input', el).forEach(c => c.onchange = () => { d.subs = c.checked ? [...d.subs, c.value] : d.subs.filter(id => id !== c.value); this.render(el); });
    $('.rg-auto', el).onclick = () => { Object.assign(d, JSON.parse(JSON.stringify(this.autoPick()))); this.render(el); };
    $('.rg-save', el).onclick = () => { this.st()[k] = { starters: { ...d.starters }, subs: [...d.subs] }; delete this._d[k]; UI.toast(`${this.name(e)} 로스터를 등록했습니다`); this.render(el); };
  },
  _d: {},
  draftFor(k, saved) { return (this._d[k] ||= JSON.parse(JSON.stringify(saved ? { starters: saved.starters, subs: saved.subs } : this.autoPick()))); },
};
Views['match-register'] = el => Register.render(el);
Engine.on(today => { if (App.state.teamId && !App.state.unemployed && Schedule.events) Register.daily(today); });

// 임대 (베타 건의 · 2군 · 유망주용): 우리 2군 · 아카데미 선수나 23세 이하 1군 후보를 주전으로 뛸 수 있는 팀에 보내 출전 시간을 얻게 한다.
//   임대 간 팀에서 실제로 경기에 나가고(출전 시간이 성장에 반영), 기간이 끝나면 돌아오며 임대 리포트를 받는다. 연봉은 임대 팀이 부담한다.
//   App.state.loans[pid] = { to, from, start, until, ovr0, name }
const Loan = {
  st() { return (App.state.loans ||= {}); },
  active(pid) { const l = this.st()[pid]; return l && Clock.today() < l.until ? l : null; },
  can(p) { const lv = p.level || 'first'; return !App.state.unemployed && p.role !== 'COACH' && !this.active(p.id) && (lv !== 'first' || (p.sub && (p.age || 30) <= 23)); },
  // 행선지: 그 포지션에서 주전으로 뛸 수 있는 팀 (출전 가능성 = 이 선수 점수 − 그 팀 해당 포지션 최고 점수)
  dests(p) {
    const my = App.state.teamId, home = Roster.team();
    return App.db.teams.filter(t => t.id !== my && (t.league === home.league || (t.rep || 2) <= 2)).map(t => {
      const best = Market.best(t, p.role), s = Contract.score(p, t);
      const top = t.players.filter(x => x.role === p.role).sort((a, b) => (b.ovr || 0) - (a.ovr || 0))[0];
      return { t, best, s, d: s - best, ovr: top ? top.ovr : 0 };
    }).filter(x => x.d > -6).sort((a, b) => b.d - a.d || (a.t.rep || 2) - (b.t.rep || 2)).slice(0, 8);
  },
  chance(d) { return d >= 2 ? ['주전 확실', 'good'] : d >= -2 ? ['주전 경쟁', 'mid'] : ['후보 가능성', 'bad']; },
  // 기간: 다음 대회 끝 · 시즌 끝(월즈 결승) 중에서
  terms() {
    const today = Clock.today(), Y = Schedule.season(), lg = Roster.team().league;
    const next = Schedule.events.filter(e => e.league === lg && ['regular', 'playoffs'].includes(e.kind) && e.end > Store.addDays(today, 30)).sort((a, b) => a.end.localeCompare(b.end))[0];
    const out = []; if (next) out.push([next.end, `${next.short || next.label} 끝까지 (${next.end.slice(5).replace('-', '.')})`]);
    const end = Schedule.worldsEnd(Y); if (end > today && (!next || end !== next.end)) out.push([end, `시즌 끝까지 (${end.slice(5).replace('-', '.')})`]);
    if (!out.length) out.push([Store.addDays(today, 120), '4개월']);
    return out;
  },
  ask(p, done) {
    const L = this.dests(p), T = this.terms();
    if (!L.length) { UI.toast('이 선수를 주전으로 쓸 만한 팀이 없습니다'); return; }
    UI.modal({ title: `${UI.esc(p.name)} 임대 보내기`, body: `<p class="cr-dim">출전 시간을 얻으면 성장이 빨라집니다. 임대 기간에는 우리 팀에서 쓸 수 없고, 연봉은 임대 팀이 부담합니다.</p>
      <label class="rg-row"><span>기간</span><select class="ch-sort ln-term">${T.map(([v, l]) => `<option value="${v}">${UI.esc(l)}</option>`).join('')}</select></label>
      <div class="ln-list">${L.map((x, i) => { const [c, cls] = this.chance(x.d); return `<label class="ln-row"><input type="radio" name="ln" value="${x.t.id}" ${i ? '' : 'checked'}>${G.team(x.t, 'xs')}<b>${UI.esc(x.t.name)}</b><small>${x.t.league} · ${G.ROLE_KO[p.role]} 주전 ${x.ovr ? 'OVR ' + x.ovr : '없음'} (이 선수 ${p.ovr})</small><em class="ln-c ${cls}">${c}</em></label>`; }).join('')}</div>`,
      actions: [{ label: '취소' }, { label: '임대 보내기', primary: true, onClick: back => { const to = ($('input[name="ln"]:checked', back) || {}).value, until = $('.ln-term', back).value; if (to) this.send(p, to, until); done && done(); } }] });
  },
  send(p, to, until) {
    const t = App.db.teams.find(x => x.id === to), my = Roster.team();
    this.st()[p.id] = { to, from: my.id, start: Clock.today(), until, ovr0: p.ovr || 0, name: p.name, gen: !!p.gen };
    Squad.apply();
    UI.toast(`${p.name} → ${t.short} 임대 (${until.slice(5).replace('-', '.')}까지)`, 3000);
    Market.post(`[오피셜] ${p.name}, ${t.short}로 임대`, `${Sim.josa(my.name, '이', '가')} ${G.ROLE_KO[p.role]} ${Sim.josa(p.name, '을', '를')} ${Fmt.dayLabel(until)}까지 ${Sim.josa(t.name, '으로', '로')} 임대 보냈습니다. 출전 시간을 얻어 성장하기 위한 선택입니다.`, p.id);
  },
  // Squad.apply 뒤: 임대 중인 선수를 임대 팀 1군으로 옮긴다
  place() {
    const my = Roster.team(); if (!my) return;
    Object.entries(this.st()).forEach(([pid, l]) => {
      if (Clock.today() >= l.until) return;
      const lists = [my.players, my.cl || [], my.academy || []], hit = lists.find(L => L.some(p => p.id === pid)); if (!hit) return;
      const p = hit.splice(hit.findIndex(x => x.id === pid), 1)[0], t = App.db.teams.find(x => x.id === l.to); if (!t) return;
      p.loan = l; p.level = 'first'; t.players.push(p);
      t.players.sort((a, b) => Contract.score(b, t) - Contract.score(a, t)); MOCK.markSubs(t.players);
    });
  },
  // 매일: 생성 선수는 출전에 따라 성장 · 기간이 끝나면 복귀 + 리포트
  day(today) {
    const S = this.st();
    Object.entries(S).forEach(([pid, l]) => {
      const h = Player.find(pid);
      if (today < l.until) { if (h && h.p.gen) { const lp = (App.state.lp || {})[pid]; Squad.grow(h.p, lp && Fmt.daysBetween(lp, today) <= 14 ? 'first' : 'cl'); } return; }
      delete S[pid]; if (h) delete h.p.loan;
      Squad.apply();
      const back = Player.find(pid), p = back ? back.p : null, t = App.db.teams.find(x => x.id === l.to);
      const yr = String(l.start).slice(0, 4), rows = typeof PStats !== 'undefined' ? PStats.yearRows(yr).concat(String(l.until).slice(0, 4) !== yr ? PStats.yearRows(String(l.until).slice(0, 4)) : []).filter(r => r.pid === pid) : [];
      const g = rows.reduce((s, r) => s + r.g, 0), rat = g ? rows.reduce((s, r) => s + r.rat * r.g, 0) / g : 0;
      Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: `임대 복귀 — ${l.name} (${t ? t.short : ''})`, link: 'roster-challengers',
        body: `${Sim.josa(l.name, '이', '가')} ${t ? t.name : '임대 팀'} 임대를 마치고 돌아왔습니다.\n\n기간 ${l.start.replace(/-/g, '.')} ~ ${l.until.replace(/-/g, '.')}\n공식전 ${g}세트 출전${g ? ` · 평점 ${rat.toFixed(1)}` : ''}\nOVR ${l.ovr0} → ${p ? p.ovr : '-'}\n\n${g >= 10 ? '꾸준히 출전하며 경험을 쌓았습니다.' : '출전 기회가 많지 않았습니다.'} 선수는 2군에 돌아와 있습니다.` });
      if (back && back.p.level === 'first' && back.p.gen !== true && Squad.moves()[pid] == null) Squad.moves()[pid] = 'cl';
    });
  },
  // 2군 화면 아래: 임대 중인 선수
  card() {
    const L = Object.entries(this.st()).filter(([, l]) => Clock.today() < l.until); if (!L.length) return '';
    return `<div class="card"><div class="card-head"><h3>임대 중 <small>${L.length}명</small></h3></div>${L.map(([pid, l]) => { const h = Player.find(pid), t = App.db.teams.find(x => x.id === l.to);
      return `<div class="ln-cur" data-pid="${pid}">${t ? G.team(t, 'xs') : ''}<b>${UI.esc(l.name)}</b><small>${t ? t.short : ''} · ${l.until.slice(5).replace('-', '.')}까지 · OVR ${l.ovr0} → ${h ? h.p.ovr : '-'}${h && !h.p.sub ? ' · 주전' : ' · 후보'}</small></div>`; }).join('')}</div>`;
  },
};
(() => {
  const apply = Squad.apply.bind(Squad); Squad.apply = () => { apply(); try { Loan.place(); } catch (e) { console.warn('[loan]', e); } };
  const btn = Squad.buttons.bind(Squad); Squad.buttons = p => btn(p) + (Loan.can(p) ? `<button class="btn-ghost btn-sm" data-loan="${p.id}">임대</button>` : '');
  const bind = Squad.bind.bind(Squad); Squad.bind = (box, done) => { bind(box, done); $$('[data-loan]', box).forEach(b => b.onclick = e => { e.stopPropagation(); const t = Squad.team(), p = [...t.players, ...t.cl, ...t.academy].find(x => x.id === b.dataset.loan); if (p) Loan.ask(p, done); }); };
})();
Engine.on(today => { try { Loan.day(today); } catch (e) { console.warn('[loan]', e); } });

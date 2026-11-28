// 선수 생애: 병역 · 은퇴 · 코치 전향 · 신인 수급
//   병역 (한국 선수 · 미필): 만 28세가 되는 해의 시즌(월즈)이 끝나면 입대 (커리어 첫 해는 유예 → 가장 빠른 입대가 2027 시즌 뒤).
//     입영 연기: 법적 상한은 만 30세. 28세 해에 연기 사유(OVR 85 이상 · OVR 80 이상이면서 야망이 높음 · 추후 아시안게임 대표 후보)가 있으면 한 번 30세 해까지 미룬다
//     계약은 입대 시점을 넘길 수 없다. 마지막 시즌은 '라스트 댄스' — 성향에 따라 마지막 불꽃(사기 ↑) / 마음이 떠남(사기 ↓).
//     입대 때(FA 상태)는 은퇴하거나 18개월 복무. 전역 뒤 드물게 복귀(10%, 입대 전 OVR 85 이상 25%) — 피지컬이 떨어진 FA로. 아니면 은퇴.
//     면제: 아시안게임 금메달 · 특수 사유(장기대기 소집해제 등, 26세 이상 미필 해마다 낮은 확률) · 해외 리그 5년 이상 (data/custom.json)
//   은퇴 (모든 선수): 매년 월즈 결승 다음 날 — 나이 · OVR · 계약 · 성향. 스토브리그가 끝날 때까지 팀이 없는 FA는 확률이 크게 오른다.
//     우리 팀 선수는 면담 요청이 먼저 온다 (붙잡기 / 존중). 일부는 코치로 전향해 AI 팀 스태프에 들어간다 (js/coaches.js)
//   신인: 매년 월즈 결승 다음 날 LPL · LEC · LCS에 생성 신인을 FA로 푼다 (LCK는 아카데미 유스 — js/squad.js). 빠진 만큼 + 기본 몇 명
//   저장: App.state.life = { retired, service, dance, mil, coaches, rookies, ask }
const Life = {
  ENLIST_MIN: 2027,          // 유예: 가장 빠른 입대 시즌
  SERVICE_DAYS: 548,         // 18개월
  BACK: [.10, .25],          // 전역 뒤 복귀 확률 (입대 전 OVR 85 이상이면 뒤쪽)
  st() { const s = (App.state.life ||= {}); ['retired', 'service', 'dance', 'mil', 'coaches', 'rookies', 'ask'].forEach(k => s[k] ||= {}); return s; },
  r(...k) { return G.rand((App.state.seed || '') + ':life:' + k.join(':'), 'lf'); },
  year(d) { return +String(d).slice(0, 4); },

  // ---------- 병역 ----------
  mil(p) { const o = this.st().mil[p.id]; return o ? o.v : p.military; },
  deadline(p) {
    if (!p || p.role === 'COACH' || p.nation !== 'South Korea' || this.mil(p) !== 'none' || !p.birthdate) return null;
    const ext = (this.st().mil[p.id] || {}).ext;   // 입영 연기 (만 30세까지)
    return Math.max(this.year(p.birthdate) + (ext || 28), this.ENLIST_MIN);
  },
  // 연기 사유: 28세 해에 한 번만 (이미 30세 기준이면 없음)
  canDelay(p, cy) { if ((this.st().mil[p.id] || {}).ext || this.year(p.birthdate) + 30 <= cy) return false; const amb = ((p.attributes || {}).hidden || {}).ambition || 11; return (p.ovr || 0) >= 85 || ((p.ovr || 0) >= 80 && amb >= 14); },
  delay(p, t, why) {
    this.st().mil[p.id] = { v: 'none', ext: 30, why };
    Market.post(`[병역] ${p.name}, 입영 연기`, `${Sim.josa(p.name, '이', '가')} 입영을 연기했습니다. ${this.year(p.birthdate) + 30}년 시즌까지 현역으로 뜁니다.`, p.id);
    if (t && t.id === App.state.teamId) Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: `${p.name} 입영 연기`, body: `${Sim.josa(p.name, '이', '가')} 입영을 연기했습니다 (만 30세 상한). 입대 기한은 ${this.year(p.birthdate) + 30}년 시즌 뒤입니다.` });
  },
  // 계약 가능 최대 연수 (입대 시즌까지). 기한이 없으면 null
  maxYears(p) { const D = this.deadline(p); if (D == null) return null; return Math.max(0, D - this.year(Contract.seasonEnd(Player.find(p.id)?.t || {}))); },
  capEnd(p, end) { const D = this.deadline(p); if (D == null || !end) return end; const cap = `${D}${end.slice(4)}`; return end > cap ? cap : end; },
  gone(pid) { const s = this.st(); return !!(s.retired[pid] || s.service[pid]); },

  // ---------- 로스터 반영 (Squad.apply 앞뒤) ----------
  pre() {
    const F = App.db && App.db.free; if (!F) return;
    const base = (F._base ||= [...F.players]), have = new Set(base.map(p => p.id));
    Object.values(this.st().rookies).forEach(p => { if (!have.has(p.id)) base.push(p); });
  },
  post() {
    const s = this.st(), out = id => !(s.retired[id] || s.service[id]);
    App.db.teams.forEach(t => {
      t.players = t.players.filter(p => out(p.id)); if (t.cl) t.cl = t.cl.filter(p => out(p.id)); if (t.academy) t.academy = t.academy.filter(p => out(p.id));
      [...t.players, ...(t.cl || []), ...(t.academy || [])].forEach(p => { const m = s.mil[p.id]; if (m) { p.military = m.v; p.militaryWhy = m.why; } });
    });
    if (App.db.free) App.db.free.players = App.db.free.players.filter(p => out(p.id));
    // 코치 전향
    let touched = false;
    Object.entries(s.coaches).forEach(([id, c]) => {
      const t = App.db.teams.find(x => x.id === c.team); if (!t) return;
      t.staff ||= []; if (!t.staff.some(x => x.id === id)) { t.staff.push({ ...c.p, id, role: 'COACH', team: t.id, contractEnd: c.end }); touched = true; }
      Coach.data[id] = c.stats;
    });
    if (touched) Coach._c = {};
  },

  // ---------- 매일 ----------
  daily(today) {
    const s = this.st(), cy = this.year(today);
    if (today === Store.addDays(Schedule.worldsEnd(cy), 1)) this.close(cy, today);
    if (today.slice(5) === '01-02') { this.lastDance(cy); this.special(cy, today); }
    const stv = Schedule.events.find(e => e.kind === 'stove' && e.end === today); if (stv) this.unsigned(today);
    Object.entries(s.service).forEach(([pid, x]) => { if (x.until <= today) this.discharge(pid, x, today); });
    Object.entries(s.ask).forEach(([pid, a]) => { if (a.due <= today) { delete s.ask[pid]; const h = Player.find(pid); if (h) this.retire(h.p, h.t, 'age'); } });
  },
  // 결산: 입대 → 은퇴 → 신인
  close(cy, today) {
    const s = this.st(), byLg = {};
    const all = Player.all().filter(({ p }) => p.role !== 'COACH' && !this.gone(p.id));
    const my = App.state.teamId;
    all.forEach(({ p, t }) => {
      const lg = t.league || (App.db.teams.find(x => x.id === p.team) || {}).league || 'FA';
      // 병역: 기한이 된 미필
      if (this.deadline(p) === cy && this.canDelay(p, cy)) { this.delay(p, t, 'top'); return; }
      if (this.deadline(p) === cy) {
        const age = p.age || 28, pr = Math.max(.2, Math.min(.9, .35 + (age - 27) * .1 + (80 - (p.ovr || 70)) * .02));
        if (this.r('enl', p.id, cy) < pr) this.retire(p, t, 'military', true);
        else this.enlist(p, t, today);
        byLg[lg] = (byLg[lg] || 0) + 1; return;
      }
      // 은퇴
      const pr = this.retireP(p, t, today); if (!(pr > 0) || this.r('ret', p.id, cy) >= pr) return;
      byLg[lg] = (byLg[lg] || 0) + 1;
      if (t.id === my && !App.state.unemployed && p.level !== 'academy') this.askKeep(p, t, today);
      else this.retire(p, t, 'age', true);
    });
    this.rookies(cy, today, byLg);
    Squad.apply();
  },
  retireP(p, t, today) {
    const age = p.age || 22, ovr = p.ovr || 60;
    let pr = age < 25 ? 0 : age === 25 ? .01 : age === 26 ? .02 : age === 27 ? .04 : age === 28 ? .07 : age === 29 ? .12 : age === 30 ? .18 : age === 31 ? .26 : .35 + (age - 32) * .08;
    if (p.level === 'cl' && age >= 24 && ovr < 66) pr += .05 * (age - 23);
    pr *= ovr >= 90 ? .3 : ovr >= 85 ? .5 : ovr >= 78 ? .8 : ovr < 65 ? 1.6 : 1.1;
    if (p.free || t.id === 'free') pr *= 1.8;
    const c = Contract.of(p, t); if (c && c.end && Fmt.daysBetween(today, c.end) > 400) pr *= .4;   // 계약이 1년 넘게 남았으면 잘 안 떠난다
    const amb = ((p.attributes || {}).hidden || {}).ambition || 11; pr *= amb >= 15 ? .7 : amb <= 6 ? 1.2 : 1;
    if (p.gen && age < 26) pr = 0;
    if ((this.st().mil[p.id] || {}).ext) pr = 0;   // 입영을 연기한 선수는 그 기간 현역을 이어간다
    if (ovr >= 95) pr *= .3;
    return Math.min(.95, pr);
  },
  // 스토브리그 끝: 팀 없는 FA
  unsigned(today) {
    const cy = this.year(today), s = this.st();
    // 1년 넘게 팀을 못 찾은 생성 신인은 조용히 사라진다 (FA 풀이 끝없이 커지지 않게)
    Object.keys(s.rookies).forEach(id => { const h = Player.find(id); if (h && h.t.id === 'free' && +id.split('-')[1] < cy - 1) delete s.rookies[id]; });
    ((App.db.free && App.db.free.players) || []).forEach(p => {
      if (p.role === 'COACH' || this.gone(p.id)) return;
      const age = p.age || 22; if (age < 24) return;   // 젊은 FA는 계속 팀을 찾는다
      const pr = (age >= 27 ? .55 : .3) * ((p.ovr || 0) >= 75 ? .25 : 1);
      if (this.r('fa', p.id, cy) < pr) this.retire(p, App.db.free, 'unsigned', true);
    });
    Squad.apply();
  },
  enlist(p, t, today) {
    const s = this.st();
    s.service[p.id] = { from: today, until: Store.addDays(today, this.SERVICE_DAYS), ovr0: p.ovr || 0, name: p.name, role: p.role, team: t.id };
    delete Contract.st().contracts[p.id];
    Market.post(`[병역] ${p.name}, 군 입대`, `${t.name || ''}의 ${G.ROLE_KO[p.role] || ''} ${Sim.josa(p.name, '이', '가')} 병역 의무를 위해 입대합니다. 복무 기간은 18개월입니다.`, p.id);
    if (t.id === App.state.teamId) Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: `${p.name} 군 입대`, link: 'roster-first-team', body: `${Sim.josa(p.name, '이', '가')} 병역 의무를 위해 입대합니다. 전역은 ${Fmt.dayLabel(s.service[p.id].until)} 예정입니다.\n\n그동안 선수는 로스터에서 빠집니다.` });
  },
  discharge(pid, x, today) {
    const s = this.st(); delete s.service[pid];
    const back = this.r('back', pid) < this.BACK[x.ovr0 >= 85 ? 1 : 0];
    if (!back) { s.retired[pid] = { date: today, why: 'service', name: x.name, role: x.role, team: x.team }; Market.post(`[오피셜] ${x.name}, 전역 후 은퇴`, `${Sim.josa(x.name, '이', '가')} 전역과 함께 선수 생활을 마무리합니다.`, pid); Squad.apply(); return; }
    s.mil[pid] = { v: 'served' };
    Contract.st().moves[pid] = 'free'; delete Contract.st().contracts[pid];
    Squad.apply();
    const h = Player.find(pid);
    if (h && h.p.attributes) {   // 복무 공백: 피지컬 · 반응이 떨어져 돌아온다
      const A = h.p.attributes; Object.keys(A.physical || {}).forEach(k => { A.physical[k] = Math.max(1, A.physical[k] - (2 + this.r('dk', pid, k) * 2)); });
      h.p.ovr = Attributes.overall(A, h.p.role); Squad.dev()[pid] = { ...(Squad.dev()[pid] || {}), attributes: A };
    }
    Market.post(`[복귀] ${x.name}, 전역 후 현역 복귀 선언`, `${Sim.josa(x.name, '이', '가')} 전역 후 현역 복귀를 선언했습니다. FA 시장에서 새 팀을 찾습니다.${h ? ` (OVR ${h.p.ovr})` : ''}`, pid);
  },
  // 1월 2일: 올해 입대하는 선수의 라스트 댄스
  lastDance(cy) {
    const s = this.st();
    Player.all().forEach(({ p, t }) => {
      if (this.deadline(p) !== cy || s.dance[p.id]) return;
      const H = (p.attributes || {}).hidden || {}, fire = (H.ambition || 11) + (H.loyalty || 11) * .5 + this.r('dance', p.id) * 8 > 18;
      s.dance[p.id] = { y: cy, type: fire ? 'fire' : 'fade' };
      const m = World.morale(); m[p.id] = (m[p.id] || 0) + (fire ? 2 : -2);
      if ((p.ovr || 0) >= 80 || t.id === App.state.teamId) Market.post(`${p.name}, 입대 전 마지막 시즌`, fire ? `${Sim.josa(p.name, '이', '가')} 입대 전 마지막 시즌을 맞아 "후회 없이 불태우겠다"고 각오를 밝혔습니다.` : `${p.name}에게 올해는 입대 전 마지막 시즌입니다. 주변에서는 마음이 조금 떠난 것 같다는 이야기도 나옵니다.`, p.id);
      if (t.id === App.state.teamId) Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: `${p.name}, 입대 전 마지막 시즌`, link: 'roster-first-team', body: `${p.name}은(는) 올해 시즌이 끝나면 입대해야 합니다.\n\n${fire ? '마지막 불꽃을 태우겠다며 의욕이 넘칩니다 (사기 상승).' : '마지막이라는 생각에 마음이 조금 떠난 듯합니다 (사기 하락).'}\n계약은 입대 시점을 넘길 수 없습니다.` });
    });
  },
  // 1월 2일: 특수 사유 면제 (요즘은 드물다)
  special(cy, today) {
    const s = this.st();
    Player.all().forEach(({ p }) => {
      if (this.deadline(p) == null || (p.age || 0) < 26 || this.r('sp', p.id, cy) >= .015) return;
      s.mil[p.id] = { v: 'exempt', why: 'special' };
      Market.post(`[병역] ${p.name}, 특수 사유로 병역 면제`, `${Sim.josa(p.name, '이', '가')} 장기대기 소집해제 등 특수 사유로 병역 의무를 마쳤습니다.`, p.id);
    });
  },
  // 우리 팀: 은퇴 고민 면담
  askKeep(p, t, today) {
    this.st().ask[p.id] = { due: Store.addDays(today, 7) };
    Inbox.push({ from: { name: p.name, role: 'player' }, subject: `${p.name}, 은퇴를 고민하고 있습니다`, priority: 'todo', link: 'roster-first-team', ctx: { pid: p.id },
      body: `감독님, 시즌을 마치고 많이 생각했습니다. 이제 선수 생활을 정리할까 고민하고 있습니다.\n\n붙잡아 주신다면 한 번 더 생각해 보겠습니다. (7일 안에 답이 없으면 은퇴합니다)`,
      choices: [{ label: '붙잡는다 (한 시즌 더)', act: 'lifeKeep', reply: '한 시즌만 더 같이 하자고 설득했습니다.' }, { label: '결정을 존중한다', act: 'lifeLet', reply: '선수의 결정을 존중하기로 했습니다.' }] });
  },
  retire(p, t, why, quiet) {
    const s = this.st(); if (s.retired[p.id]) return;
    s.retired[p.id] = { date: Clock.today(), why, name: p.name, role: p.role, team: t && t.id, age: p.age, ovr: p.ovr };
    delete Contract.st().contracts[p.id];
    if (p.gen) { delete Squad.gen()[p.id]; delete Squad.moves()[p.id]; }
    const W = { military: '입대를 앞두고', unsigned: '새 팀을 찾지 못하고', age: '', service: '' }[why] || '';
    if ((p.ovr || 0) >= 70 || (t && t.id === App.state.teamId)) Market.post(`[오피셜] ${p.name}, 현역 은퇴`, `${t && t.name ? t.name + '의 ' : ''}${G.ROLE_KO[p.role] || ''} ${Sim.josa(p.name, '이', '가')} ${W ? W + ' ' : ''}현역 은퇴를 발표했습니다.`, p.id);
    if (t && t.id === App.state.teamId && why !== 'age') Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: `${p.name} 은퇴`, body: `${Sim.josa(p.name, '이', '가')} ${W ? W + ' ' : ''}현역 은퇴를 결정했습니다.` });
    this.toCoach(p, t);
    if (!quiet) Squad.apply();
  },
  // 코치 전향: 1군 경험이 있는 23세 이상 일부 → 같은 리그 AI 팀 중 코치가 4명 미만인 팀 (예전 팀 우선)
  toCoach(p, t) {
    if (!p.attributes || p.gen || (p.age || 0) < 23 || p.level === 'academy') return;
    const A = p.attributes, avg = o => { const v = Object.values(o || {}); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 10; };
    const mac = avg(A.macro), men = avg(A.mental), pr = .25 + ((p.ovr || 0) >= 80 ? .1 : 0) + (mac >= 14 ? .1 : 0);
    if (this.r('coach', p.id) >= pr) return;
    const home = App.db.teams.find(x => x.id === ((p._o || {}).team || p.team)), lg = (t && t.league) || (home || {}).league;   // FA로 은퇴했으면 원 소속 리그
    const ok = x => x.id !== App.state.teamId && (x.staff || []).length < 5;
    const dest = (t && t.league && ok(t) ? t : null) || (home && ok(home) ? home : null) || App.db.teams.filter(x => x.league === lg && ok(x)).sort((a, b) => this.r('cdest', p.id, a.id) - this.r('cdest', p.id, b.id))[0];
    if (!dest) return;
    const r = k => this.r('cst', p.id, k), cl = v => Math.max(3, Math.min(17, Math.round(v)));
    const stats = { draft: cl(((A.macro || {}).mapAwareness || mac) * .5 + ((A.macro || {}).objective || mac) * .5 - 2 + (r(1) - .5) * 4), manage: cl(men - 2 + (r(2) - .5) * 5), tactic: cl(mac - 2 + (r(3) - .5) * 4), develop: cl(8 + r(4) * 7), head: false,
      traits: r(5) < .3 ? [Object.keys(Coach.TRAITS).filter(x => !Coach.TRAITS[x][3])[Math.floor(r(6) * 19)]].filter(Boolean) : [] };
    this.st().coaches[p.id] = { team: dest.id, end: `${this.year(Clock.today()) + 2}-11-16`, stats, p: { name: p.name, realName: p.realName, nativeName: p.nativeName, nation: p.nation, birthdate: p.birthdate, photo: p.photo } };
    Market.post(`[오피셜] ${p.name}, ${dest.short} 코치로 새 출발`, `현역에서 물러난 ${Sim.josa(p.name, '이', '가')} ${dest.name} 코칭스태프에 합류합니다.`, p.id, 3);
  },
  // 신인: LPL · LEC · LCS에 FA로 (빠진 만큼 + 2)
  rookies(cy, today, byLg) {
    const s = this.st();
    ['LPL', 'LEC', 'LCS'].forEach(lg => {
      const n = Math.min(10, (byLg[lg] || 0) + 2);
      for (let i = 0; i < n; i++) {
        const id = `rk-${cy}-${lg.toLowerCase()}-${i}`; if (s.rookies[id]) continue;
        const r = Squad.rng((App.state.seed || '') + ':' + id), role = G.ROLES[Math.floor(r() * 5)], age = 17 + Math.floor(r() * 3);
        const nation = Squad.NATION[lg][Math.floor(r() * Squad.NATION[lg].length)], ovr = 58 + r() * 12, ca = Attributes.caFor(ovr, role), pa = Attributes.caFor(Math.min(92, ovr + 8 + r() * 18), role);
        const p = { id, rookie: true, name: Squad.uniqueName(r, lg), realName: '', nativeName: '', role, nation, photo: null, team: 'free', free: true, contractEnd: null, sub: false,
          attributes: Attributes.generate(role, ca, pa, r) };
        if (nation === 'South Korea') p.military = 'none';
        Ident.fill(p, { ref: today, age }); p.age = Data.ageOn(p.birthdate, today);
        p.ovr = Attributes.overall(p.attributes, role); Squad.rate(p, 50);
        s.rookies[id] = p;
      }
      Market.post(`${lg} 신인 ${n}명, FA 시장에 등장`, `${lg} 무대를 노리는 신인 ${n}명이 FA 시장에 나왔습니다.`);
    });
  },
};
Engine.ACTS.lifeKeep = m => {
  const pid = m.ctx.pid, s = Life.st(); delete s.ask[pid];
  const h = Player.find(pid); if (!h) return;
  const loyal = ((h.p.attributes || {}).hidden || {}).loyalty || 11, stay = Life.r('keep', pid, Clock.today()) < .45 + loyal / 20 * .3 + (typeof Rel !== 'undefined' ? (Rel.of(pid) - 50) / 200 : 0);
  if (stay) { const mo = World.morale(); mo[pid] = (mo[pid] || 0) + 1; Inbox.push({ from: { name: h.p.name, role: 'player' }, subject: `${h.p.name}, 한 시즌 더 뛰기로`, body: '감독님 말씀 듣고 마음을 바꿨습니다. 한 시즌 더 해 보겠습니다.' }); }
  else { Inbox.push({ from: { name: h.p.name, role: 'player' }, subject: `${h.p.name}, 은퇴 결정`, body: '붙잡아 주셔서 감사합니다. 그래도 지금이 떠날 때인 것 같습니다.' }); Life.retire(h.p, h.t, 'age'); }
};
Engine.ACTS.lifeLet = m => { const pid = m.ctx.pid; delete Life.st().ask[pid]; const h = Player.find(pid); if (h) Life.retire(h.p, h.t, 'age'); };
(() => {
  const apply = Squad.apply.bind(Squad);
  Squad.apply = () => { try { Life.pre(); } catch (e) { console.warn('[life]', e); } apply(); try { Life.post(); } catch (e) { console.warn('[life]', e); } };
})();
Engine.on(today => { try { Life.daily(today); } catch (e) { console.error('[life]', e); } });

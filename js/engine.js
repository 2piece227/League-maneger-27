// 게임 진행 엔진: 계속 버튼(하루씩 진행) · 받은 메시지함 · 관계 수치 · 이벤트.
// FM 방식: 하루를 처리하고, 감독이 확인해야 할 일이 생기면 멈춘다. 답이 꼭 필요한 메시지가 남아 있으면 진행하지 않는다.

// ---------- 받은 메시지함 (저장됨) ----------
const Inbox = {
  list() { return (App.state.inbox ||= []); },
  find(id) { return this.list().find(m => m.id === id); },

  // msg: { from:{name,role}, subject, body, priority('normal'|'todo'|'urgent'), choices?, link?, required?, stop? }
  push(msg) {
    App.state.msgSeq = (App.state.msgSeq || 0) + 1;
    const m = {
      id: 'g' + App.state.msgSeq, date: Clock.today(), time: msg.time || Engine.clockTime(),
      priority: 'normal', read: false, isNew: true, ...msg,
    };
    this.list().unshift(m);
    Engine.today.push(m);
    return m;
  },

  // 답이 필요한(선택지가 있고 아직 안 고른) 메시지
  pending() { return this.list().filter(m => m.choices && m.answered == null); },
  blocking() { return this.pending().filter(m => m.required); },

  answer(id, i) {
    const m = this.find(id);
    if (!m || m.answered != null) return;
    const c = m.choices[i];
    let out = c;
    // 결과가 확률로 갈리는 선택지: odds = 숫자 또는 관계 수치 이름(board 등, 0~100 → 확률)
    if (c.outcomes) {
      const p = typeof c.odds === 'number' ? c.odds : World.rel()[c.odds] / 100;
      out = G.rand(App.state.seed + m.id, 'odds') < p ? c.outcomes[0] : c.outcomes[1];
    }
    const fx = World.apply(out.fx || {}, m.ctx || {});
    if (out.act) Engine.ACTS[out.act](m, out.arg);
    m.answered = i;
    m.done = true;
    m.reply = Events.fill(out.reply || '', m.ctx || {});
    m.fxText = fx;
  },
};

// ---------- 관계 수치 · 선수 사기 · 장부 (저장됨) ----------
const World = {
  KEYS: { board: '이사회 신뢰', squad: '선수단 신뢰', fans: '팬 지지', media: '미디어 관계' },

  // 처음에는 감독 배경·평판으로 정한 값에서 출발
  rel() {
    if (!App.state.rel) {
      const base = Career.baseRelations(App.state.manager);
      App.state.rel = Object.fromEntries(Object.keys(this.KEYS).map((k, i) => [k, base[i][1]]));
    }
    return App.state.rel;
  },
  morale() { return (App.state.morale ||= {}); },
  ledger() { return (App.state.ledger ||= []); },

  // fx: { board, squad, fans, media, rep, money, morale(대상 선수), moraleAll } → 바뀐 내용 문구
  apply(fx, ctx) {
    const out = [], r = this.rel(), clamp = v => Math.max(0, Math.min(100, v));
    Object.entries(fx).forEach(([k, v]) => {
      if (!v) return;
      const sign = v > 0 ? '+' : '';
      if (k in this.KEYS) { r[k] = clamp(r[k] + v); out.push(`${this.KEYS[k]} ${sign}${v}`); }
      else if (k === 'rep' && App.state.manager) { App.state.manager.reputation = clamp(App.state.manager.reputation + v); out.push(`감독 평판 ${sign}${v}`); }
      else if (k === 'money') { this.ledger().push({ date: Clock.today(), label: ctx.ledger || '기타', amount: v }); out.push(`구단 수입 ${sign}${Player.money(v / 1e8)} 원`); }
      else if (k === 'morale' && ctx.pid) { const m = this.morale(); m[ctx.pid] = (m[ctx.pid] || 0) + v; out.push(`${ctx.player} 사기 ${sign}${v}`); }
      else if (k === 'moraleAll') { const m = this.morale(); Roster.team().players.forEach(p => m[p.id] = (m[p.id] || 0) + v); out.push(`선수단 사기 ${sign}${v}`); }
    });
    return out.join(' · ');
  },
};

// ---------- 진행 ----------
const Engine = {
  today: [],       // 오늘 새로 온 메시지
  daily: [],       // 매일 실행할 처리 (fn(today) → 멈출 이유 문자열 또는 없음)
  MAX_DAYS: 7,     // 아무 일이 없어도 한 번에 최대 일주일까지만
  busy: false,

  on(fn) { this.daily.push(fn); },
  clockTime() { const r = G.rand(App.state.seed + Clock.today(), 'time' + this.today.length); return `${String(9 + Math.floor(r * 10)).padStart(2, '0')}:${String(Math.floor(r * 6) * 10).padStart(2, '0')}`; },
  rnd(salt) { return G.rand((App.state.seed || '') + '|' + Clock.today(), salt); },

  async continue() {
    if (this.busy || !App.state.teamId) return;
    const block = Inbox.blocking()[0];
    if (block) {
      UI.toast('먼저 답해야 하는 메시지가 있습니다');
      Portal.openId = block.id;
      Router.go('portal-messages');
      return;
    }
    this.busy = true;
    $$('.btn-continue').forEach(b => { b.disabled = true; b.classList.add('busy'); });
    let reason = null, days = 0;
    try {
      await Promise.all([Portal.ready, Events.load(), Mastery.load(), Champions.load()]);
      while (!reason && days < this.MAX_DAYS) {
        reason = this.step();
        days++;
        $$('.tb-date').forEach(el => el.textContent = Fmt.date(Clock.today()));
        await new Promise(r => setTimeout(r, 90));
      }
    } finally {
      this.busy = false;
      $$('.btn-continue').forEach(b => { b.disabled = false; b.classList.remove('busy'); });
    }
    if (SaveSystem.autosave()) console.info('[save] 자동 저장');
    await Portal.setTeam(Roster.team());
    Nav.render(Router.current());
    UI.toast(reason || `${days}일이 지났습니다`);
  },

  // 하루 진행. 멈춰야 하면 이유를 돌려준다.
  step() {
    Inbox.list().forEach(m => m.isNew = false);
    this.today = [];
    Clock.set(Store.addDays(Clock.today(), 1));
    let reason = null;
    for (const fn of this.daily) {
      try { const r = fn(Clock.today()); reason = reason || r; } catch (e) { console.error('[engine]', e); }
    }
    const important = this.today.find(m => m.stop || m.priority !== 'normal' || m.choices);
    return reason || (important ? `새 메시지: ${important.subject}` : null);
  },

  flags() { return (App.state.flags ||= {}); },
  once(key) { const f = this.flags(); if (f[key]) return false; f[key] = Clock.today(); return true; },

  // 선택지에 붙는 코드 동작
  ACTS: {
    link(m, route) { Router.go(route); },
    scrimAccept(m, a) { (App.state.scrims ||= []).push({ team: a.team, date: Clock.today(), sets: 3, status: 'accepted', on: a.on, incoming: true }); },
    promise(m, a) { (App.state.promises ||= []).push({ pid: m.ctx.pid, kind: a, date: Clock.today(), due: Store.addDays(Clock.today(), 60) }); },
    budgetAsk(m, ok) { if (ok) World.ledger().push({ date: Clock.today(), label: '이사회 추가 예산', amount: 500000000 }); },
    academy(m) { (App.state.academy ||= []).push({ ...m.ctx.acc, date: Clock.today() }); },
    interview(m) { const a = Career.apps()[m.ctx.tid]; if (a) { a.status = '면접 예정'; a.on = Store.addDays(Clock.today(), 2); } },
    declineJob(m) { const a = Career.apps()[m.ctx.tid]; if (a) a.status = '거절함'; },
    takeJob(m) { Engine.switchTeam(Schedule.team(m.ctx.tid)); },
  },

  switchTeam(t) {
    const old = Roster.team();
    (App.state.jobs ||= []).push({ team: old.id, until: Clock.today() });
    App.state.teamId = t.id;
    App.state.applications = {};
    App.state.rel = null; World.rel();
    App.state.morale = {};
    Inbox.push({ from: { name: `${t.short} 사무국장`, role: 'board' }, subject: `${t.name} 감독 부임을 환영합니다`, priority: 'urgent', stop: true,
      body: `${t.name} 구단을 대표해 환영 인사를 드립니다.\n\n이사회의 기대는 '${t.boardGoal || '좋은 성적'}'입니다. 선수단과 코칭스태프 소개는 로스터 화면에서 확인해 주십시오.` });
  },
};

// ---------- 이벤트 (data/events.json) ----------
// 조건(cond)·대상(pick)은 이름으로 데이터에서 고르고, 실제 판정은 아래 함수가 한다.
const Events = {
  defs: null,
  MEDIA: ['인벤', '포모스', '디스이즈게임', '스포츠경향', '데일리e스포츠'],

  async load() {
    if (this.defs) return this.defs;
    try { this.defs = (await fetch('data/events.json').then(r => r.json())).events; }
    catch (e) { console.warn('[events] 로드 실패', e); this.defs = []; }
    return this.defs;
  },

  stove(d) { return Schedule.events.some(e => e.kind === 'stove' && e.start <= d && d <= e.end); },
  matchOn(d) { const t = Roster.team(); return Schedule.matches.some(m => (m.t1 === t.id || m.t2 === t.id) && m.t.slice(0, 10) === d); },

  COND: {
    stove: d => Events.stove(d),
    season: d => !Events.stove(d),
    noMatch: d => !Events.matchOn(d) && !Events.matchOn(Store.addDays(d, 1)),
    hasExpiring: () => Roster.team().players.some(p => { const x = Player.days(p); return x != null && x >= 0 && x <= 30; }),
    hasSub: () => Roster.team().players.some(p => p.sub),
    boardLow: () => World.rel().board < 45,
  },

  PICK: {
    player: (r, t) => t.players.filter(p => !p.sub),
    expiring: (r, t) => t.players.filter(p => { const x = Player.days(p); return x != null && x >= 0 && x <= 30; }),
    sub: (r, t) => t.players.filter(p => p.sub),
    star: (r, t) => [...t.players.filter(p => !p.sub)].sort((a, b) => Player.value(b, t) - Player.value(a, t)).slice(0, 2),
  },

  ctx(def, today) {
    const t = Roster.team(), r = s => Engine.rnd(def.id + s);
    const pick = arr => arr[Math.floor(r(arr.length + '') * arr.length)];
    const ctx = {
      myTeam: t.name, myShort: t.short, season: Schedule.season(), media: pick(this.MEDIA),
      coach: ((t.staff || [])[1] || (t.staff || [])[0] || {}).name || '코치', ledger: def.ledger,
    };
    if (def.pick) {
      const p = pick(this.PICK[def.pick](r, t));
      if (!p) return null;
      Object.assign(ctx, { pid: p.id, player: p.name, role: G.ROLE_KO[p.role] });
    }
    if (def.team) {
      const o = pick(App.db.teams.filter(x => x.league === t.league && x.id !== t.id));
      Object.assign(ctx, { tid: o.id, team: o.name, teamShort: o.short, on: Store.addDays(today, 1 + Math.floor(r('on') * 3)) });
      ctx.onLabel = Fmt.dayLabel(ctx.on);
    }
    return ctx;
  },

  fill(s, ctx) { return String(s).replace(/\{(\w+)\}/g, (m, k) => k in ctx ? ctx[k] : m); },

  // 하루에 무작위 이벤트는 최대 하나
  run(today) {
    const last = (App.state.evLast ||= {});
    const ok = this.defs.filter(d => (d.cond || []).every(c => this.COND[c](today))
      && (!d.once || !last[d.id]) && (!last[d.id] || Fmt.daysBetween(last[d.id], today) >= (d.cooldown || 14)));
    for (const def of ok) {
      if (Engine.rnd(def.id) >= def.chance) continue;
      const ctx = this.ctx(def, today);
      if (!ctx) continue;
      last[def.id] = today;
      const f = s => this.fill(s, ctx);
      Inbox.push({
        from: { name: f(def.from.name), role: def.from.role }, subject: f(def.subject), body: f(def.body),
        priority: def.priority || 'normal', link: def.link, required: def.required, ctx, ev: def.id,
        choices: def.choices && def.choices.map(c => ({ ...c, label: f(c.label), arg: c.arg === '$team' ? { team: ctx.tid, on: ctx.on } : c.arg })),
      });
      return;
    }
  },
};

// ---------- 매일 처리 ----------
Engine.on(today => {
  // 생일: 나이 갱신
  const md = today.slice(5);
  App.db.teams.forEach(t => t.players.concat(t.staff || []).forEach(p => { if (p.birthdate && p.birthdate.slice(5) === md) p.age = Data.ageOn(p.birthdate, today); }));
});

Engine.on(today => {
  // 대회 일정 발표 · 개막 · 스토브리그 개장
  const t = Roster.team();
  let reason = null;
  Schedule.eventsFor(t.league).filter(e => !e.past).forEach(e => {
    if (e.kind !== 'stove' && e.pub <= today && e.start > today && Engine.once('pub:' + e.id)) {
      const mine = Schedule.matches.filter(m => m.event === e.id && (m.t1 === t.id || m.t2 === t.id));
      const first = mine.sort((a, b) => a.t.localeCompare(b.t))[0];
      Inbox.push({ from: { name: `${e.league === 'ALL' ? '대회' : e.league} 운영사무국`, role: 'media' }, subject: `${e.label} 대진·일정 발표`, priority: 'normal', stop: true, link: 'portal-fixtures',
        body: `${e.label} 대진과 경기 일정이 공개됐습니다.\n\n${first ? `${t.short}의 첫 경기는 ${Fmt.dateTime(first.t)} ${Schedule.team(Schedule.opponent(first, t.id).id).name}전입니다.` : '대진은 경기 일정 화면에서 확인할 수 있습니다.'}` });
    }
    if (e.start === today && Engine.once('start:' + e.id)) {
      Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: e.kind === 'stove' ? `${e.label} 개장` : `${e.label} 개막`, priority: 'normal', stop: true, link: e.kind === 'stove' ? 'recruit-fa' : 'portal-fixtures',
        body: e.kind === 'stove' ? '계약이 끝난 선수들과 자유롭게 협상할 수 있습니다. FA 시장을 확인해 주십시오.' : `오늘 ${e.label}가 시작됩니다.` });
    }
  });
  // 경기일
  const m = Schedule.matches.find(x => (x.t1 === t.id || x.t2 === t.id) && x.t.slice(0, 10) === today);
  if (m) reason = `오늘 ${Schedule.opponent(m, t.id).short}전이 있습니다 (경기 진행은 준비 중)`;
  return reason;
});

Engine.on(today => {
  // 우리 팀 계약: 만료 3일 전 알림, 만료일 다음 날 FA
  const t = Roster.team();
  t.players.forEach(p => {
    const d = Player.days(p);
    if (d === 3 && Engine.once('exp3:' + p.id + p.contractEnd)) Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: `${p.name} 계약 만료 3일 전`, priority: 'todo', link: 'roster-contracts', ctx: { pid: p.id },
      body: `${p.name}(${G.ROLE_KO[p.role]})의 계약이 ${Fmt.dayLabel(p.contractEnd)}에 끝납니다.\n\n그 전에 재계약하지 않으면 FA로 풀려 다른 팀과 자유롭게 협상할 수 있습니다.` });
    if (d === -1 && Engine.once('fa:' + p.id + p.contractEnd)) Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: `${p.name}, 계약 만료로 FA`, priority: 'urgent', link: 'recruit-fa',
      body: `${p.name}의 계약이 끝나 FA가 됐습니다. 이제 다른 팀도 자유롭게 영입을 시도할 수 있습니다.\n\n다시 데려오려면 FA 시장에서 새 계약을 제시해야 합니다.` });
  });
});

Engine.on(today => {
  // 스크림 답장 · 결과
  const my = Roster.team();
  (App.state.scrims ||= []).forEach((s, i) => {
    const o = Schedule.team(s.team); if (!o) return;
    const r = salt => G.rand(App.state.seed + s.team + s.date, salt);
    const from = { name: `${o.short} 코칭스태프`, role: 'coach' };
    if (!s.status && Fmt.daysBetween(s.date, today) >= 1 + Math.floor(r('wait') * 2)) {
      const p = Math.max(.15, Math.min(.92, .72 - ((o.rep || 2) - (my.rep || 2)) * .14 - (o.league !== my.league ? .2 : 0)));
      if (r('yes') < p) {
        s.status = 'accepted'; s.on = Store.addDays(today, 1 + Math.floor(r('on') * 3));
        Inbox.push({ from, subject: `${o.short}, 스크림 수락`, link: 'training-scrims', body: `${my.short} 측 스크림 제안을 받아들입니다.\n\n${Fmt.dayLabel(s.on)} 저녁, ${s.sets}세트로 진행하겠습니다.` });
      } else {
        s.status = 'declined';
        Inbox.push({ from, subject: `${o.short}, 스크림 정중히 거절`, link: 'training-scrims', body: `제안 감사합니다. 이번 주는 일정이 이미 차 있어 어렵겠습니다. 다음 기회에 다시 이야기 나누시죠.` });
      }
    }
    if (s.status === 'accepted' && s.on < today && !s.result) {
      // TODO: 기능 연결 — 경기 로직이 생기면 세트 결과를 시뮬레이션으로
      let w = 0;
      for (let k = 0; k < s.sets; k++) if (r('set' + k) < .5 + ((my.rep || 2) - (o.rep || 2)) * .07) w++;
      s.result = `${w}:${s.sets - w}`;
      Inbox.push({ from: { name: `${((my.staff || [])[1] || (my.staff || [])[0] || {}).name || '코치'} 코치`, role: 'coach' }, subject: `${o.short} 스크림 결과 ${s.result}`, link: 'training-scrims',
        body: `${o.name}와의 스크림을 ${s.result}로 마쳤습니다.\n\n${w > s.sets / 2 ? '준비한 운영이 잘 통했습니다.' : '초반 설계에서 밀렸습니다. 다음 스크림 전에 보완하겠습니다.'}` });
    }
  });
});

Engine.on(today => {
  // 솔랭 테스트 제의: 수락/거절 → 일주일 테스트 → 결과
  const offers = App.state.testOffers || {};
  Object.entries(offers).forEach(([id, o]) => {
    if (!o.name) return; // 이름 없이 저장된 옛 제의는 건너뜀
    const r = salt => G.rand(App.state.seed + id + o.date, salt);
    const from = { name: o.name, role: 'player' };
    if (!o.status && Fmt.daysBetween(o.date, today) >= 1 + Math.floor(r('w') * 2)) {
      const p = o.type === 'streamer' ? .35 : o.type === 'otp' ? .6 : .88;
      if (r('yes') < p) {
        o.status = 'testing'; o.until = Store.addDays(today, 7);
        Inbox.push({ from, subject: `[테스트 수락] ${o.name}`, link: 'training-soloq', body: `연락 주셔서 감사합니다! 테스트에 참가하겠습니다.\n\n${Fmt.dayLabel(o.until)}까지 일주일간 챌린저스 선수들과 함께 테스트를 받습니다.` });
      } else {
        o.status = 'declined';
        Inbox.push({ from, subject: `[테스트 거절] ${o.name}`, link: 'training-soloq', body: o.type === 'streamer' ? '좋게 봐주셔서 감사하지만, 지금은 방송에 집중하고 싶습니다.' : '감사한 제안이지만 지금은 학업과 개인 사정으로 어렵습니다.' });
      }
    }
    if (o.status === 'testing' && o.until <= today) {
      const g = (o.rank || 100) <= 20 ? 0 : (o.rank || 100) <= 60 ? 1 : 2;
      const roll = r('grade') < .25 ? Math.min(2, g + 1) : g;
      o.status = 'done'; o.grade = ['합격 권고', '보류', '불합격'][roll];
      Inbox.push({
        from: { name: `${((Roster.team().staff || [])[1] || {}).name || '2군'} 코치`, role: 'coach' }, subject: `${o.name} 테스트 결과: ${o.grade}`, priority: roll < 2 ? 'todo' : 'normal',
        body: `${G.ROLE_KO[o.role]} ${o.name}(${o.age}세)의 일주일 테스트가 끝났습니다.\n\n${['피지컬과 라인전은 바로 2군 주전감입니다. 계약을 추천합니다.', '재능은 보이지만 팀 게임 이해도가 아직 부족합니다. 판단은 감독님께 맡기겠습니다.', '솔랭 성적만큼의 팀 게임은 보여주지 못했습니다. 계약은 추천하지 않습니다.'][roll]}`,
        ctx: { acc: { id, name: o.name, role: o.role, age: o.age, grade: o.grade } },
        choices: roll < 2 ? [{ label: '챌린저스 계약 제안', act: 'academy', reply: '선수가 기뻐하며 계약서에 서명했습니다. 챌린저스 명단에 추가됩니다.', fx: { squad: 1 } }, { label: '이번에는 보내기', reply: '선수에게 감사 인사와 함께 결과를 전했습니다.' }] : undefined,
      });
    }
  });
});

Engine.on(today => {
  // 이력서: 서류 결과 → 면접 → 최종 제안. 지원 사실이 현 구단에 알려질 수도 있다.
  const apps = App.state.applications || {};
  const P = { hi: .8, mid: .5, lo: .2, no: .03 };
  Object.entries(apps).forEach(([tid, a]) => {
    const t = Schedule.team(tid); if (!t) return;
    const r = salt => G.rand(App.state.seed + tid + a.date, salt);
    const p = P[Manager.chance(App.state.manager, t)[1]];
    const from = { name: `${t.short} 사무국`, role: 'board' };
    if (a.status === '서류 검토 중' && Fmt.daysBetween(a.date, today) >= 3 + Math.floor(r('w') * 4)) {
      if (r('doc') < p) {
        a.status = '면접 제안';
        Inbox.push({ from, subject: `${t.name} 감독직 면접 제안`, priority: 'todo', ctx: { tid },
          body: `보내주신 이력서를 인상 깊게 검토했습니다.\n\n이틀 뒤 구단 사무실에서 면접을 진행하고 싶습니다. 참석 여부를 알려 주십시오.`,
          choices: [{ label: '면접에 응한다', act: 'interview', reply: '면접 일정을 확정했습니다.' }, { label: '정중히 사양한다', act: 'declineJob', reply: '면접을 사양한다고 회신했습니다.' }] });
      } else {
        a.status = '불합격';
        Inbox.push({ from, subject: `${t.name} 감독직 지원 결과`, body: '지원해 주셔서 감사합니다. 신중히 검토했으나 이번에는 다른 후보와 함께하기로 했습니다.' });
      }
      if (r('leak') < .3) Inbox.push({ from: { name: '사무국장', role: 'board' }, subject: '다른 구단 지원 소문에 대해', priority: 'urgent', ctx: {},
        body: `감독님이 ${t.short}에 이력서를 냈다는 이야기가 이사회에 들어왔습니다. 사실이라면 유감입니다.`,
        choices: [{ label: '사실이다. 솔직하게 인정한다', fx: { board: -4 }, reply: '이사회는 실망했지만 솔직함은 인정했습니다.' }, { label: '헛소문이다', outcomes: [{ fx: { board: -1 }, reply: '이사회가 일단 해명을 받아들였습니다.' }, { fx: { board: -8, media: -2 }, reply: '거짓 해명이 기사로 드러나 이사회의 신뢰가 크게 떨어졌습니다.' }], odds: .6 }] });
    }
    if (a.status === '면접 예정' && a.on <= today) {
      if (r('int') < Math.min(.85, p + .15)) {
        a.status = '최종 제안';
        Inbox.push({ from, subject: `${t.name}, 감독직 공식 제안`, priority: 'urgent', ctx: { tid }, stop: true,
          body: `면접에서 보여주신 비전에 이사회가 깊은 인상을 받았습니다.\n\n${t.name}의 새 감독으로 모시고 싶습니다. 수락하시면 즉시 부임하게 됩니다. 이사회 기대는 '${t.boardGoal || '좋은 성적'}'입니다.`,
          choices: [{ label: `수락하고 ${t.short}로 간다`, act: 'takeJob', reply: `${t.name} 감독직을 수락했습니다.` }, { label: '거절한다', act: 'declineJob', reply: '제안을 거절했습니다. 현 구단에 남습니다.' }] });
      } else {
        a.status = '불합격';
        Inbox.push({ from, subject: `${t.name} 면접 결과`, body: '면접에 응해 주셔서 감사합니다. 고심 끝에 다른 후보를 선임하기로 했습니다.' });
      }
    }
  });
});

Engine.on(today => Events.run(today));

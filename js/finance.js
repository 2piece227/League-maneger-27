// 구단 재정 (1단계): 구단별 재정 프로필 · 실제 잔고(매달 1일 정산) · 스폰서 계약 — 우리 팀 · AI 구단 모두
//   수입: 리그 분배금 · 모기업 지원(형태별) · 스폰서(계약 + 성과 보너스) · 스트리밍·굿즈(팬 규모 = 명성 · 스타 선수) · 상금 · 이적료(장부)
//   지출: 선수 연봉 · 스태프 인건비 · 운영비 · 샐러리캡 부담금
//   적자: 잔고가 마이너스인 달마다 이사회 신뢰 하락, 예산(Club.budget)이 줄어 영입 여력이 준다. 잔고가 넉넉하면 예산이 조금 는다 (AI 구단도)
//   스폰서: 실제 스폰서 명단(data/sponsors.json, Leaguepedia)을 슬롯에 배치, 없는 슬롯은 업종명. 만료(12/31) 때 성적 · 명성으로 재계약, 공석은 제안을 받아 고른다
//   저장: App.state.fin = { bal, last, neg, spon, srch }
const Fin = {
  // 모기업 형태: parent 대기업 지원형 · investor 투자 유치형 · self 자립형
  OWNER: { t1: 'parent', 'gen-g': 'investor', 'hanwha-life-esports': 'parent', 'kt-rolster': 'parent', 'dplus-kia': 'investor', 'nongshim-redforce': 'parent', 'hanjin-brion': 'parent', 'kiwoom-drx': 'investor', 'bnk-fearx': 'parent', 'dn-soopers': 'parent' },
  OWNER_KO: { parent: '대기업 지원형', investor: '투자 유치형', self: '자립형' },
  LG: { LCK: 1, LPL: 1.1, LEC: .7, LCS: .8 },
  SHARE: { LCK: 8, LPL: 9, LEC: 5, LCS: 5 },
  SLOTS: [['메인 파트너', '통신·금융'], ['유니폼 스폰서', '자동차·식품'], ['장비 파트너', '주변기기'], ['음료 파트너', '에너지 음료'], ['가구 파트너', '게이밍 의자'], ['디지털 파트너', '플랫폼·앱']],
  names: {},
  st() { const s = (App.state.fin ||= {}); ['bal', 'last', 'neg', 'spon', 'srch'].forEach(k => s[k] ||= {}); return s; },
  r(...k) { return G.rand((App.state.seed || '') + ':fin:' + k.join(':'), 'fn'); },
  owner(t) { return this.OWNER[t.id] || (t.league === 'LPL' ? 'parent' : t.league === 'LCK' ? 'parent' : 'investor'); },
  fame(t) { return typeof Fame !== 'undefined' ? Fame.team(t) : 50; },

  // ---------- 연간 수입 · 지출 (억 원) ----------
  annual(t) {
    const L = this.LG[t.league] || 1, f = this.fame(t), fin = t.fin || 2, own = this.owner(t);
    const stars = t.players.filter(p => typeof Fame !== 'undefined' && Fame.player && Fame.player(p) >= 80).length, pay = Club.payroll(t);
    const inc = {
      league: this.SHARE[t.league] || 8,
      parent: own === 'parent' ? 6 + fin * 5 + pay * .35 : own === 'investor' ? 3 + fin * 3 + pay * .3 : 0,   // 고정 지원 + 연봉 일부 부담
      sponsor: this.sponsorIncome(t),
      stream: (Math.pow(f / 100, 1.5) * 14 + stars * 4) * L,
    };
    const exp = { pay, staff: Club.staffPay(t), ops: (10 + f * .15) * L, tax: t.league === 'LCK' ? (Club.tax(t).tax || 0) : 0 };
    return { inc, exp, ti: Object.values(inc).reduce((a, b) => a + b, 0), te: Object.values(exp).reduce((a, b) => a + b, 0) };
  },
  INC_KO: { league: '리그 분배금', parent: '모기업 지원', sponsor: '스폰서', stream: '스트리밍·굿즈', prize: '상금', bonus: '스폰서 보너스', ledger: '이적료·계약금 등' },
  EXP_KO: { pay: '선수 연봉', staff: '스태프 인건비', ops: '숙소·운영', tax: '샐러리캡 부담금' },
  bal(t) { const s = this.st(); if (s.bal[t.id] == null) s.bal[t.id] = Math.round((10 + (t.fin || 2) * 12 + this.fame(t) * .2) * (this.LG[t.league] || 1) * 10) / 10; return s.bal[t.id]; },
  // 예산 배율: 적자면 줄고 넉넉하면 는다 (Club.budget에 곱한다)
  budgetMul(t) { if (!App.state || !App.state.fin) return 1; const b = this.st().bal[t.id]; if (b == null) return 1; const a = this.annual(t).te || 1; return b < -a * .3 ? .7 : b < 0 ? .85 : b > a * 1.5 ? 1.1 : 1; },

  // ---------- 매달 1일 정산 ----------
  monthly(today) {
    const s = this.st(), mk = Store.addDays(today, -1).slice(0, 7), my = App.state.teamId;
    App.db.teams.forEach(t => {
      const A = this.annual(t), inc = Object.fromEntries(Object.entries(A.inc).map(([k, v]) => [k, v / 12])), exp = Object.fromEntries(Object.entries(A.exp).map(([k, v]) => [k, v / 12]));
      const extra = (s.extra || {})[t.id] || {}; Object.entries(extra).forEach(([k, v]) => { inc[k] = (inc[k] || 0) + v; });
      if (t.id === my) { const led = World.ledger().filter(x => (x.date || '').slice(0, 7) === mk).reduce((a, x) => a + x.amount / 1e8, 0); if (led) inc.ledger = led; }
      const net = Object.values(inc).reduce((a, b) => a + b, 0) - Object.values(exp).reduce((a, b) => a + b, 0);
      s.bal[t.id] = Math.round((this.bal(t) + net) * 100) / 100;
      if (t.id === my) { (s.hist ||= []).push({ m: mk, inc, exp, net, bal: s.bal[t.id] }); if (s.hist.length > 36) s.hist.shift(); }
      s.neg[t.id] = s.bal[t.id] < 0 ? (s.neg[t.id] || 0) + 1 : 0;
    });
    s.extra = {};
    // 우리 팀 적자 압박
    const t = Roster.team(); if (!t || App.state.unemployed) return;
    const n = s.neg[t.id], b = s.bal[t.id];
    if (n >= 1) {
      World.apply({ board: n >= 3 ? -3 : -1 }, {});
      if (n === 1 || n % 3 === 0) Inbox.push({ from: { name: '재무 담당', role: 'board' }, subject: `구단 잔고 적자 (${this.money(b)})`, priority: n >= 3 ? 'todo' : 'normal', link: 'club-finance',
        body: `구단 잔고가 ${n}달째 적자입니다 (${this.money(b)}).\n\n적자가 이어지면 이사회 신뢰가 떨어지고, 영입 예산이 줄어듭니다.${n >= 3 ? '\n이사회가 비용 절감을 강하게 요구하고 있습니다.' : ''}` });
    }
  },
  add(t, k, v) { const s = this.st(); ((s.extra ||= {})[t.id] ||= {})[k] = (((s.extra[t.id] || {})[k]) || 0) + v; },
  money(v) { return (v < 0 ? '−' : '') + Player.money(Math.abs(v)); },

  // ---------- 스폰서 ----------
  load(d) { this.names = Object.fromEntries(Object.entries((d && d.teams) || {}).map(([id, v]) => [id, (v.sponsors || []).map(x => x.name)])); },
  appeal(t) { return this.fame(t); },
  slotValue(t, i, perf = 1) { const f = this.appeal(t), L = this.LG[t.league] || 1; return Math.round((i === 0 ? 2 + f * .09 : .4 + f * .025) * L * perf * 10) / 10; },
  // 성과 지수: 올해 국제대회 진출 · 우승
  perf(t, Y) {
    const b = App.state.brk || {}, intl = Object.entries(b).some(([id, l]) => id.startsWith(Y + ':') && (Schedule.byEvent[id] || {}).league === 'INTL' && l.includes(t.id));
    const won = Object.entries(App.state.champs || {}).some(([id, w]) => id.startsWith(Y + ':') && w === t.id);
    return { intl, won, mul: 1 + (intl ? .1 : 0) + (won ? .15 : 0) };
  },
  mkDeal(t, i, name, start, perf = 1, salt = '') {
    const yrs = 1 + Math.floor(this.r('yr', t.id, i, start, salt) * 3), v = this.slotValue(t, i, perf) * (.85 + this.r('v', t.id, i, start, salt) * .3);
    return { slot: i, name, value: Math.round(v * 10) / 10, start, end: `${+start.slice(0, 4) + yrs - (start.slice(5) >= '07' ? 0 : 1)}-12-31`, bonus: { intl: Math.round(v * .15 * 10) / 10, won: Math.round(v * .25 * 10) / 10 } };
  },
  // 처음: 실제 명단을 슬롯 순서대로, 없으면 업종명. 실제 명단이 적은 팀은 빈 슬롯이 조금 있다
  ensure(t) {
    const s = this.st(); if (s.spon[t.id]) return s.spon[t.id];
    const real = this.names[t.id] || [], start = Clock.START;
    s.spon[t.id] = this.SLOTS.map(([, cat], i) => {
      const nm = real[i] || null; if (!nm && i >= 2 && this.r('vac', t.id, i) < .15) return null;
      return this.mkDeal(t, i, nm, start);
    });
    return s.spon[t.id];
  },
  label(t, d) { return d.name || `${this.SLOTS[d.slot][1]} 업계 파트너`; },
  sponsorIncome(t) { return this.ensure(t).filter(Boolean).reduce((a, d) => a + d.value, 0) * (typeof Coach !== 'undefined' && Coach.has(t, 'star') ? 1.08 : 1); },
  // 12/31 만료 · 결산(월즈 다음 날) 보너스
  yearEnd(today) {
    const s = this.st(), my = App.state.teamId;
    App.db.teams.forEach(t => {
      const L = this.ensure(t), P = this.perf(t, +today.slice(0, 4));
      L.forEach((d, i) => {
        if (!d || d.end > today) return;
        const nd = this.mkDeal(t, i, d.name, Store.addDays(today, 1), P.mul, 'renew');
        if (t.id === my && !App.state.unemployed) {
          L[i] = null; (s.pend ||= {})[i] = nd;
          Inbox.push({ from: { name: '마케팅 담당', role: 'board' }, subject: `스폰서 재계약 제안 — ${this.label(t, d)}`, priority: 'todo', link: 'club-sponsors', ctx: { slot: i },
            body: `${this.label(t, d)} (${this.SLOTS[i][0]}) 계약이 끝났습니다. 재계약 조건을 보내왔습니다.\n\n연 ${this.money(nd.value)} (이전 ${this.money(d.value)}) · ${nd.end.slice(0, 4)}년 말까지\n성과 보너스: 국제대회 진출 ${this.money(nd.bonus.intl)} · 우승 ${this.money(nd.bonus.won)}`,
            choices: [{ label: '재계약', act: 'sponRenew', reply: '재계약을 맺었습니다.' }, { label: '거절 (새 스폰서 찾기)', act: 'sponDecline', reply: '재계약을 거절했습니다.' }] });
        } else L[i] = nd;
      });
      // AI 구단은 빈 슬롯을 가끔 채운다
      if (t.id !== my) L.forEach((d, i) => { if (!d && this.r('fill', t.id, i, today) < .5) L[i] = this.mkDeal(t, i, null, Store.addDays(today, 1)); });
    });
  },
  seasonBonus(Y) {
    App.db.teams.forEach(t => {
      const P = this.perf(t, Y), L = this.ensure(t).filter(Boolean); if (!P.intl && !P.won) return;
      const v = L.reduce((a, d) => a + (P.intl ? d.bonus.intl : 0) + (P.won ? d.bonus.won : 0), 0); if (v > 0) this.add(t, 'bonus', v);
      if (t.id === App.state.teamId && v > 0) Inbox.push({ from: { name: '마케팅 담당', role: 'board' }, subject: `스폰서 성과 보너스 ${this.money(v)}`, link: 'club-finance', body: `올해 ${P.won ? '우승' : ''}${P.won && P.intl ? '과 ' : ''}${P.intl ? '국제대회 진출' : ''}로 스폰서 성과 보너스 ${this.money(v)}이(가) 다음 달 정산에 들어옵니다.` });
    });
  },
  // 상금: 대회 우승 (실제 상금 규모를 단순화)
  PRIZE: { worlds: 6, msi: 3, ewc: 4, 'first-stand': 1.5 },
  prizeCheck() {
    const s = this.st(); if (!s.prizeSeen) { s.prizeSeen = {}; Object.keys(App.state.champs || {}).forEach(id => { s.prizeSeen[id] = 1; }); }   // 처음에는 이미 끝난 대회 상금을 주지 않는다
    const seen = s.prizeSeen;
    Object.entries(App.state.champs || {}).forEach(([id, w]) => {
      if (seen[id]) return; seen[id] = 1;
      const e = Schedule.byEvent[id], t = App.db.teams.find(x => x.id === w); if (!e || !t) return;
      const v = e.league === 'INTL' ? (this.PRIZE[(e.base || '').replace(/-.*$/, '')] ?? this.PRIZE[e.base] ?? 1.5) : e.kind === 'playoffs' ? 1.2 * (this.LG[e.league] || 1) : .6;
      this.add(t, 'prize', v);
    });
  },
  // 공석 스폰서 찾기: 제안 3개 (30일에 한 번)
  offers(t, i) {
    const today = Clock.today(), key = t.id + ':' + i, s = this.st();
    if (s.srch[key] && Fmt.daysBetween(s.srch[key], today) < 30) return null;
    s.srch[key] = today;
    const P = this.perf(t, Clock.year());
    return [0, 1, 2].map(k => { const d = this.mkDeal(t, i, null, today, P.mul * [.8, 1, 1.15][k], 'off' + k); d.value = Math.round(d.value * [1, .95, .9][k] * 10) / 10; return d; });
  },
};
Engine.ACTS.sponRenew = m => { const s = Fin.st(), i = m.ctx.slot, t = Roster.team(), d = (s.pend || {})[i]; if (!d) return; Fin.ensure(t)[i] = d; delete s.pend[i]; };
Engine.ACTS.sponDecline = m => { const s = Fin.st(); delete (s.pend || {})[m.ctx.slot]; };
Engine.on(today => {
  try {
    if (!App.state.teamId) return;
    if (today.slice(8) === '01') Fin.monthly(today);
    if (today.slice(5) === '12-31') Fin.yearEnd(today);
    const cy = +today.slice(0, 4); if (today === Store.addDays(Schedule.worldsEnd(cy), 1)) Fin.seasonBonus(cy);
    Fin.prizeCheck();
  } catch (e) { console.error('[fin]', e); }
});

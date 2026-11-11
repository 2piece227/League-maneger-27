// 선수단 단계: 1군(LCK) · 챌린저스(2군, LCK CL 실명 로스터, 정원 있음) · 아카데미(3군, 생성 선수, 정원 없음)
// 하부 경기는 직접 보거나 지휘하지 않는다. 결과·성장·내부 평가만 메시지로 온다 (FM 유스 방식).
const Squad = {
  CL_MAX: 10,
  LV: { first: '1군', cl: '챌린저스', academy: '아카데미' },
  GROW: { academy: .0012, cl: .0018, first: .0022 }, // 잠재력까지 남은 차이 × 하루 비율

  rng(seed) {
    let a = Math.floor(G.rand(seed) * 4294967296) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  },
  gen() { return (App.state.gen ||= {}); },
  moves() { return (App.state.squad ||= {}); },
  dev() { return (App.state.dev ||= {}); },
  team() { return App.db.teams.find(t => t.id === App.state.teamId); },
  round(v) { return Math.round(v * 10) / 10; },

  // 실명 2군 선수: 기록이 없으니 현재 기량·잠재력을 선수별 고정값으로 만든다
  initCl(p) {
    const r = this.rng('cl:' + p.id);
    let ca = 8 + r() * 4;
    const sh = (Data.sheet || {})[p.id];                                  // 기록 자동 산정이 있으면 그 능력치
    if (sh) { p.attributes = Attributes.fromSheet(sh, p.role); ca = Math.max(5, Attributes.raw(p.attributes, p.role) - 3); } // 현재 기량 눈금(2군 8~12)에 맞춤
    const pa = Math.max(ca, ca + r() * r() * 8);
    p.ca = this.round(ca); p.pa = this.round(pa);
    if (!sh) p.attributes = Attributes.generate(p.role, ca, pa, r);
    p.ovr = Attributes.overall(p.attributes, p.role);
  },

  // 2군 데이터가 없는 팀(LCS 전체, 일부 LPL·LEC)은 2군을 생성하고, 있는 팀도 빈 포지션은 생성 선수로 채운다
  NAMES: {
    a: ['Ka', 'Ze', 'Ri', 'Lo', 'Vi', 'Mo', 'Ta', 'Ne', 'Ro', 'Xa', 'Ju', 'Fa', 'Hy', 'Do', 'Ki', 'Su', 'Ra', 'Ce', 'Bo', 'Ny', 'Ae', 'Sy', 'Ve', 'Ol'],
    b: ['ro', 'ne', 'ka', 'ris', 'vo', 'lyn', 'tz', 'mi', 'do', 'sk', 'x', 'ra', 'no', 'zen', 'vy', 'lo', 'th', 'um', 'ce', 'rin', 'ko', 'ga'],
    cn: ['Xiao', 'Ah', 'Jie', 'Hao', 'Lin', 'Yu', 'Wen', 'Bo', 'Ming', 'Tian', 'Feng', 'Le', 'Qing', 'Zhi', 'Kai', 'Yan', 'Shan', 'Rui'],
    cn2: ['', '', 'yu', 'hao', 'x', 'bai', 'ge', 'zi', 'an', 'mo'],
  },
  NATION: { LCK: ['South Korea'], LPL: ['China', 'China', 'China', 'South Korea'], LEC: ['France', 'Spain', 'Germany', 'Poland', 'Denmark', 'Sweden', 'United Kingdom', 'Belgium'], LCS: ['United States', 'United States', 'Canada', 'South Korea'] },
  proName(r, league) {
    const N = this.NAMES, pick = a => a[Math.floor(r() * a.length)];
    return league === 'LPL' && r() < .7 ? pick(N.cn) + pick(N.cn2) : pick(N.a) + pick(N.b) + (r() < .25 ? pick(N.b) : '');
  },
  uniqueName(r, league) {
    const used = this._names ||= new Set(App.db ? Player.all().map(x => x.p.name.toLowerCase()) : []);
    let n = this.proName(r, league);
    for (let i = 0; used.has(n.toLowerCase()) && i < 20; i++) n = this.proName(r, league);
    used.add(n.toLowerCase());
    return n;
  },
  fillSecond(t) {
    if (!t.clTeam) t.clTeam = { id: t.id + '-academy', name: `${t.name} Academy`, short: `${t.short}.A`, logo: t.logo, color: t.color, made: true };
    G.ROLES.filter(role => !t.cl.some(p => p.role === role)).forEach(role => {
      const r = this.rng(`${role}#${t.id}#second`);
      const ca = 8 + r() * 3, pa = Math.max(ca, ca + r() * r() * 8);
      const p = {
        id: `made-${t.id}-${role.toLowerCase()}`, made: true, team: t.id, name: this.uniqueName(r, t.league), realName: '', nativeName: '', role,
        nation: this.NATION[t.league][Math.floor(r() * this.NATION[t.league].length)], age: 17 + Math.floor(r() * 5), photo: null,
        contractEnd: `${2026 + Math.floor(r() * 2)}-11-16`, sub: false, level: 'cl',
        ca: this.round(ca), pa: this.round(pa), attributes: Attributes.generate(role, ca, pa, r),
      };
      if (p.nation === 'South Korea') p.military = 'none';
      p.ovr = Attributes.overall(p.attributes, p.role);
      t.cl.push(p);
    });
  },

  // 테스트 합격자 → 아카데미 연습생 (생성 선수)
  addGen(acc, level) {
    const id = 'gen-' + String(acc.id).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const today = Clock.today();
    this.gen()[id] = {
      id, gen: true, name: acc.name, role: acc.role, age: acc.age, nation: 'South Korea', photo: null,
      ca: acc.ca ?? 7, pa: acc.pa ?? 9, ca0: acc.ca0 ?? acc.ca ?? 7, evalCa: acc.ca ?? 7,
      attributes: acc.attrs || Attributes.create(acc.role), grade: acc.grade || '',
      joined: acc.date || today, contractEnd: Store.addDays(today, 730), military: 'none',
    };
    this.gen()[id].ovr = Attributes.overall(this.gen()[id].attributes, acc.role);
    this.moves()[id] = level;
    return id;
  },

  // 옛 저장(챌린저스 = 테스트 합격자 배열)을 아카데미 생성 선수로 옮긴다
  migrate() {
    if (!Array.isArray(App.state.academy)) return;
    App.state.academy.forEach(a => this.addGen({ ...a, attrs: a.attrs }, 'academy'));
    delete App.state.academy;
  },

  // 데이터 원본 + 저장된 이동 기록으로 내 팀의 1군·2군·아카데미를 다시 짠다
  apply() {
    if (!App.db) return;
    App.db.teams.forEach(t => {
      t._base ||= { players: [...t.players], cl: [...(t.cl || [])] };
      t.players = [...t._base.players]; t.cl = [...t._base.cl]; t.academy = [];
      t.players.forEach(p => { p.level = 'first'; }); t.cl.forEach(p => { p.level = 'cl'; });
    });
    Contract.applyWorld();
    // 다른 팀은 포지션별로 가치가 높은 선수가 주전
    App.db.teams.filter(t => t.id !== App.state.teamId).forEach(t => { t.players.sort((a, b) => Contract.score(b, t) - Contract.score(a, t)); MOCK.markSubs(t.players); });
    const t = this.team(); if (!t) return;
    this.migrate();
    const dev = this.dev();
    const all = [...t.players.map(p => [p, 'first']), ...t.cl.map(p => [p, 'cl']), ...Object.values(this.gen()).map(p => [p, 'academy'])];
    t.players = []; t.cl = []; t.academy = [];
    all.forEach(([p, def]) => {
      const lv = this.moves()[p.id] || def;
      if (lv === 'out') return;
      if (dev[p.id]) Object.assign(p, dev[p.id]);
      if (p.attributes && p.role !== 'COACH') { p.attributes = Attributes.fix(p.attributes, p.role); p.ovr = Attributes.overall(p.attributes, p.role); } // 예전 세이브 능력치 → 새 구성
      p.level = lv;
      ({ first: t.players, cl: t.cl, academy: t.academy })[lv].push(p);
    });
    const st = App.state.starters || {};                                    // 감독이 정한 주전
    t.players.sort((a, b) => (st[b.role] === b.id) - (st[a.role] === a.id));
    MOCK.markSubs(t.players);
    if (typeof Traits !== 'undefined') Traits.cache = null;
  },

  // 이동: 1군 ↔ 챌린저스 ↔ 아카데미, 방출
  move(pid, lv) {
    const t = this.team();
    if (lv === 'cl' && t.cl.length >= this.CL_MAX) { UI.toast(`챌린저스 정원(${this.CL_MAX}명)이 찼습니다`); return false; }
    const p = [...t.players, ...t.cl, ...t.academy].find(x => x.id === pid);
    if (!p) return false;
    if (lv === 'out' && p.gen) { delete this.gen()[pid]; delete this.moves()[pid]; this.apply(); }
    else if (lv === 'out') Contract.release(pid); // 실명 선수 방출 → FA 시장으로
    else { this.moves()[pid] = lv; this.apply(); }
    UI.toast(lv === 'out' ? `${p.name} 선수를 방출했습니다` : `${p.name} → ${this.LV[lv]}`);
    return true;
  },
  confirmRelease(p, done) {
    UI.modal({ title: '방출', body: `<p><b>${UI.esc(p.name)}</b> 선수를 방출합니다. 되돌릴 수 없습니다.</p>`,
      actions: [{ label: '취소' }, { label: '방출', primary: true, onClick: () => { if (this.move(p.id, 'out')) done && done(); } }] });
  },
  // 프로필·목록에서 쓰는 이동 버튼 (data-mv)
  buttons(p) {
    const lv = p.level || 'first', b = (to, l, cls = 'btn-ghost') => `<button class="${cls} btn-sm" data-mv="${to}">${l}</button>`;
    if (lv === 'first') return (p.sub ? b('starter', '주전으로', 'btn-primary') : '') + b('cl', '챌린저스로');
    if (lv === 'cl') return b('first', '1군 콜업', 'btn-primary') + b('academy', '아카데미로') + b('out', '방출');
    return b('cl', '챌린저스 콜업', 'btn-primary') + b('out', '방출');
  },
  bind(box, done) {
    $$('[data-mv]', box).forEach(btn => btn.onclick = e => {
      e.stopPropagation();
      const t = this.team(), p = [...t.players, ...t.cl, ...t.academy].find(x => x.id === btn.closest('[data-pid]').dataset.pid);
      if (!p) return;
      if (btn.dataset.mv === 'starter') { (App.state.starters ||= {})[p.role] = p.id; this.apply(); UI.toast(`${p.name} → ${G.ROLE_KO[p.role]} 주전`); done && done(); }
      else if (btn.dataset.mv === 'out') this.confirmRelease(p, done); else if (this.move(p.id, btn.dataset.mv)) done && done();
    });
  },

  stars(p) { return p.ca != null ? `${UI.stars(Attributes.stars(p.ca))}` : '-'; },
  pot(p) { return p.pa != null ? `${UI.stars(Attributes.stars(p.pa))}` : '-'; },
  coach() { const t = this.team(); return ((t.clStaff || [])[0] || (t.staff || [])[1] || {}).name || '2군'; },

  // 포지션별 가장 잘하는 1명씩 → 평균 현재 기량 (빈 자리는 6)
  lineup(list) { return G.ROLES.map(r => list.filter(p => p.role === r).sort((a, b) => (b.ca || 0) - (a.ca || 0))[0] || null); },
  strength(list) { return this.lineup(list).reduce((s, p) => s + (p ? p.ca || 9 : 6), 0) / 5; },

  // ---------- 챌린저스 리그 (LCK CL): 1~8월 매주 수요일 한 라운드 ----------
  clTeams() { return App.db.teams.filter(t => t.clTeam && t.league === 'LCK'); },
  clWindow(y) { return [`${y}-01-20`, `${y}-08-26`]; },
  clTable(y) {
    let tb = App.state.clTable;
    if (!tb || tb.season !== y) tb = App.state.clTable = { season: y, rows: {}, log: [] };
    this.clTeams().forEach(t => { tb.rows[t.id] ||= { w: 0, l: 0, sw: 0, sl: 0 }; });
    return tb;
  },
  // 원형 대진: 라운드 k의 짝
  pairs(ids, k) {
    const a = [...ids]; if (a.length % 2) a.push(null);
    const n = a.length, fixed = a[0], rest = a.slice(1), s = k % (n - 1);
    const rot = [...rest.slice(rest.length - s), ...rest.slice(0, rest.length - s)];
    const line = [fixed, ...rot];
    return Array.from({ length: n / 2 }, (_, i) => [line[i], line[n - 1 - i]]).filter(([x, y]) => x && y);
  },
  bo3(sa, sb, key) {
    const p = 1 / (1 + Math.exp(-(sa - sb) * .55));
    let a = 0, b = 0, i = 0;
    while (a < 2 && b < 2) (G.rand(key, 's' + i++) < p ? a++ : b++);
    return [a, b];
  },
  clDay(today) {
    const y = +today.slice(0, 4), [s, e] = this.clWindow(y);
    if (today < s || today > e || Fmt.parse(today).getDay() !== 3) return;
    const teams = this.clTeams(); if (teams.length < 2) return;
    const tb = this.clTable(y), k = Math.floor(Fmt.daysBetween(s, today) / 7);
    this.pairs(teams.map(t => t.id), k).forEach(([x, z]) => {
      const tx = teams.find(t => t.id === x), tz = teams.find(t => t.id === z);
      const sx = this.strength(tx.cl) + (G.rand(today + x, 'f') - .5) * 1.5, sz = this.strength(tz.cl) + (G.rand(today + z, 'f') - .5) * 1.5;
      const [a, b] = this.bo3(sx, sz, App.state.seed + today + x + z);
      const rx = tb.rows[x], rz = tb.rows[z];
      rx.sw += a; rx.sl += b; rz.sw += b; rz.sl += a;
      (a > b ? (rx.w++, rz.l++) : (rz.w++, rx.l++));
      tb.log.push({ d: today, a: x, b: z, sa: a, sb: b });
      if (x === App.state.teamId || z === App.state.teamId) this.clReport(today, tx, tz, a, b);
    });
    if (tb.log.length > 200) tb.log.splice(0, tb.log.length - 200);
  },
  clReport(today, tx, tz, a, b) {
    const me = this.team(), mine = tx.id === me.id, [ma, mb] = mine ? [a, b] : [b, a], opp = mine ? tz : tx;
    const ln = this.lineup(me.cl).filter(Boolean);
    ln.forEach(p => this.grow(p, 'cl', .004)); // 실전 경험 보너스
    const mvp = ln.sort((x, y) => (y.ca || 0) + G.rand(today + y.id, 'mvp') * 3 - (x.ca || 0) - G.rand(today + x.id, 'mvp') * 3)[0];
    const row = this.clTable(+today.slice(0, 4)), rank = this.standings(row).findIndex(r => r.id === me.id) + 1;
    Inbox.push({ from: { name: `${this.coach()} 코치`, role: 'coach' }, subject: `[CL] ${me.clTeam.short} ${ma}:${mb} ${opp.clTeam.short} ${ma > mb ? '승리' : '패배'}`, link: 'roster-challengers',
      body: `챌린저스 리그 경기 결과입니다.\n\n${me.clTeam.name} ${ma} : ${mb} ${opp.clTeam.name}\n출전: ${ln.map(p => p.name).join(', ') || '-'}\n${mvp && ma > mb ? `MVP: ${mvp.name}\n` : ''}\n현재 순위 ${rank}위` });
  },
  standings(tb) {
    return Object.entries(tb.rows).map(([id, r]) => ({ id, ...r })).sort((x, y) => y.w - x.w || (y.sw - y.sl) - (x.sw - x.sl));
  },

  // ---------- LCK 밖 2군: 매월 10일 소속 대회 순위만 ----------
  secondDay(today) {
    const me = this.team();
    if (!me || me.league === 'LCK' || today.slice(8) !== '10' || today.slice(5, 7) === '12' || me.cl.length < 5) return;
    const ln = this.lineup(me.cl).filter(Boolean);
    const mine = this.strength(me.cl) + (G.rand(App.state.seed + today, 'sec') - .5) * 2;
    const field = Array.from({ length: 9 }, (_, i) => 8.5 + G.rand(today + 'sc' + me.id + i, 'f') * 3);
    const place = 1 + field.filter(v => v > mine).length;
    ln.forEach(p => this.grow(p, 'cl', .008));
    (App.state.secResults ||= []).push({ d: today, place });
    const name = me.clTeam.circuit && !/Invitational|Qualifier/.test(me.clTeam.circuit) ? me.clTeam.circuit : '2군 대회';
    Inbox.push({ from: { name: `${this.coach()} 코치`, role: 'coach' }, subject: `[2군] ${me.clTeam.short} ${name} ${place}위 (${+today.slice(5, 7)}월)`, link: 'roster-challengers',
      body: `이번 달 2군 성적입니다. ${name}에서 10팀 중 ${place}위를 기록했습니다.

출전: ${ln.map(p => p.name).join(', ')}` });
  },

  // ---------- 아카데미 대회: 매월 20일, 5명 이상이면 참가 ----------
  academyDay(today) {
    if (today.slice(8) !== '20' || today.slice(5, 7) === '12') return;
    const me = this.team(), list = me.academy;
    if (list.length < 5) return;
    const ln = this.lineup(list).map((p, i) => p || list.filter(x => !this.lineup(list).includes(x))[i]).filter(Boolean);
    const mine = ln.reduce((s, p) => s + (p.ca || 7), 0) / Math.max(1, ln.length) + (G.rand(App.state.seed + today, 'acm') - .5) * 2;
    const field = Array.from({ length: 11 }, (_, i) => 7.5 + G.rand(today + 'ac' + i, 'f') * 3);
    const place = 1 + field.filter(v => v > mine).length;
    ln.forEach(p => this.grow(p, 'academy', .01));
    const mvp = [...ln].sort((x, y) => (y.ca || 0) + G.rand(today + y.id, 'm') * 3 - (x.ca || 0) - G.rand(today + x.id, 'm') * 3)[0];
    (App.state.acResults ||= []).push({ d: today, place });
    Inbox.push({ from: { name: `${this.coach()} 코치`, role: 'coach' }, subject: `아카데미 대회 ${place}위 (${+today.slice(5, 7)}월)`, link: 'roster-academy',
      body: `이번 달 아카데미 대회 결과입니다. 12팀 중 ${place}위를 기록했습니다.\n\n출전: ${ln.map(p => p.name).join(', ')}\n팀 내 MVP: ${mvp.name}` });
  },

  // ---------- 성장 ----------
  grow(p, lv, mult = 1) {
    if (p.ca == null || p.pa == null || !p.attributes) return;
    const ageMul = (p.age || 20) <= 18 ? 1.25 : (p.age || 20) <= 21 ? 1 : (p.age || 20) <= 24 ? .6 : .3;
    const d = Math.max(0, p.pa - p.ca) * (mult === 1 ? this.GROW[lv] * (.5 + G.rand(p.id + Clock.today(), 'grow')) : mult) * ageMul;
    if (d <= 0) return;
    p.ca = Math.min(p.pa, p.ca + d);
    ['physical', 'macro', 'mental', 'role'].forEach(g => Object.keys(p.attributes[g] || {}).forEach(k => {
      p.attributes[g][k] = Math.min(20, p.attributes[g][k] + d * (.4 + G.rand(p.id + Clock.today() + k, 'ag') * 1.2));
    }));
    p.ovr = Attributes.overall(p.attributes, p.role);
    if (!p.gen) this.dev()[p.id] = { ca: p.ca, attributes: p.attributes, evalCa: p.evalCa };
  },

  // ---------- 내부 평가: 3·6·9·12월 1일, 선수별 보고서 ----------
  evalDay(today) {
    if (!['03-01', '06-01', '09-01', '12-01'].includes(today.slice(5))) return;
    const me = this.team(), list = [...me.cl.map(p => [p, 'cl']), ...me.academy.map(p => [p, 'academy'])];
    if (!list.length) return;
    const lab = Object.assign({}, ...Object.values(Attributes.groups).map(g => g.keys), Attributes.role[''] || {}, ...Object.values(Attributes.role));
    const rep = list.map(([p, lv]) => {
      const vals = ['physical', 'macro', 'mental', 'role'].flatMap(g => Object.entries(p.attributes[g] || {}));
      vals.sort((a, b) => b[1] - a[1]);
      const up = p.evalCa == null ? null : p.ca - p.evalCa;
      const opinion = lv === 'academy' ? (p.ca >= 11 ? '챌린저스 콜업을 추천합니다.' : p.pa - p.ca < 1 && p.ca < 9 ? '성장이 멈췄습니다. 방출을 고려해 볼 만합니다.' : '지금처럼 아카데미에서 키우는 게 좋겠습니다.')
        : (p.ca >= 13.5 ? '1군 콜업을 검토해 볼 만합니다.' : p.pa - p.ca < 1 && p.ca < 10 ? '더 오르기는 어려워 보입니다. 거취를 고민해야 합니다.' : '챌린저스에서 경험을 더 쌓아야 합니다.');
      p.evalCa = p.ca;
      if (!p.gen) this.dev()[p.id] = { ...(this.dev()[p.id] || {}), evalCa: p.ca };
      return `■ ${p.name} (${this.LV[lv]} · ${G.ROLE_KO[p.role]} · ${p.age || '-'}세)\n  현재 기량 ${Attributes.starText(p.ca)}  잠재력 ${Attributes.starText(p.pa)}\n  강점: ${lab[vals[0][0]]}, ${lab[vals[1][0]]} / 약점: ${lab[vals.at(-1)[0]]}\n  지난 평가 이후: ${up == null ? '첫 평가' : up >= .5 ? '크게 성장' : up >= .15 ? '꾸준히 성장' : '정체'}\n  의견: ${opinion}`;
    });
    Inbox.push({ from: { name: `${this.coach()} 코치`, role: 'coach' }, subject: `하부 선수단 내부 평가 보고서 (${+today.slice(5, 7)}월)`, priority: 'todo', link: 'roster-challengers',
      body: `챌린저스와 아카데미 선수 ${list.length}명의 내부 평가 결과입니다.\n\n${rep.join('\n\n')}` });
  },
};

Engine.on(today => {
  const me = Squad.team(); if (!me) return;
  me.academy.forEach(p => Squad.grow(p, 'academy'));
  me.cl.forEach(p => Squad.grow(p, 'cl'));
  me.players.filter(p => p.gen).forEach(p => Squad.grow(p, 'first'));
  Squad.clDay(today);
  Squad.academyDay(today);
  Squad.secondDay(today);
  Squad.evalDay(today);
});

// ---------- 화면: 로스터 > 챌린저스 · 아카데미 ----------
const SquadView = {
  row(p) {
    return `<tr data-pid="${p.id}" class="sq-click">
      <td><div class="pl-cell">${G.face(p)}<div><b>${UI.esc(p.name)}</b>${Traits.icons(p.id)}<small class="pl-real">${UI.esc(p.nativeName || p.realName || (p.gen ? '아카데미 출신' : ''))}</small></div></div></td>
      <td>${G.pos(p.role)}</td><td class="num">${p.age || '-'}</td>
      <td>${Squad.stars(p)}</td><td>${Squad.pot(p)}</td>
      <td>${p.contractEnd ? p.contractEnd.slice(0, 7).replace('-', '.') : '-'}</td>
      <td class="sq-acts">${Squad.buttons(p)}</td></tr>`;
  },
  table(list, empty) {
    return `<div class="card rs-table-wrap" style="padding:0"><table class="rs-table sqv-table">
      <thead><tr><th>이름</th><th>포지션</th><th class="num">나이</th><th>현재 기량</th><th>잠재력</th><th>계약</th><th></th></tr></thead>
      <tbody>${list.map(p => this.row(p)).join('') || `<tr><td colspan="7" class="ms-none" style="text-align:center;padding:30px">${empty}</td></tr>`}</tbody></table></div>`;
  },
  bind(el, again) {
    Squad.bind(el, again);
    $$('tr.sq-click', el).forEach(tr => tr.onclick = e => { if (!e.target.closest('button')) Player.open(tr.dataset.pid); });
  },

  async cl(el) {
    await Promise.all([Portal.ready, Traits.load()]);
    const t = Squad.team(), ct = t.clTeam;
    const y = +Clock.today().slice(0, 4), tb = ct ? Squad.clTable(y) : null;
    const st = tb ? Squad.standings(tb) : [];
    const last = tb ? tb.log.filter(g => g.a === t.id || g.b === t.id).slice(-5).reverse() : [];
    const tn = id => (App.db.teams.find(x => x.id === id) || {}).clTeam || { short: id };
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head">
          <div class="rs-title"><h2>${ct ? `${G.team({ ...ct, color: t.color }, 'xs')} ${UI.esc(ct.name)}` : '챌린저스'}</h2><span>2군입니다. 경기는 2군 코치가 맡고, 결과와 내부 평가만 보고받습니다.</span></div>
          <div class="rs-stats"><div><span class="k">인원</span><b>${t.cl.length}/${Squad.CL_MAX}</b></div><div><span class="k">CL 순위</span><b>${ct && st.length && (st[0].w + st[0].l) ? (st.findIndex(r => r.id === t.id) + 1) + '위' : '-'}</b></div><div><span class="k">2군 코치</span><b>${UI.esc(Squad.coach())}</b></div></div>
        </div>
        ${t.league !== 'LCK' ? `<div class="card ac-empty"><p class="ms-none">${ct.made ? '실제 2군 데이터가 없어 생성 선수로 꾸린 2군입니다.' : `최근 출전 대회: ${UI.esc(ct.circuit || '-')}`} 매월 2군 대회 순위가 메시지로 옵니다.</p>${(App.state.secResults || []).slice(-6).reverse().map(r => `<div class="sqv-res ${r.place <= 3 ? 'w' : ''}"><span>${r.d.slice(0, 7).replace('-', '.')}</span><b>${r.place}위</b><span>10팀 중</span></div>`).join('')}</div>` : ''}
        ${this.table(t.cl, '챌린저스 선수가 없습니다.')}
        ${t.league === 'LCK' ? `<div class="sqv-two">
          <div class="card"><div class="card-head"><h3>LCK CL ${y} 순위</h3></div>
            <table class="rs-table"><thead><tr><th class="num">#</th><th>팀</th><th class="num">승</th><th class="num">패</th><th class="num">세트</th></tr></thead><tbody>
            ${st.map((r, i) => `<tr class="${r.id === t.id ? 'mine' : ''}"><td class="num">${i + 1}</td><td>${UI.esc(tn(r.id).name || tn(r.id).short)}</td><td class="num">${r.w}</td><td class="num">${r.l}</td><td class="num">${r.sw - r.sl > 0 ? '+' : ''}${r.sw - r.sl}</td></tr>`).join('')}
            </tbody></table>${st.every(r => !r.w && !r.l) ? `<p class="ms-none" style="padding:10px 14px">시즌은 ${Squad.clWindow(y + (Clock.today() > Squad.clWindow(y)[1] ? 1 : 0))[0].replace(/-/g, '.')}에 시작합니다.</p>` : ''}</div>
          <div class="card"><div class="card-head"><h3>최근 경기</h3></div>
            ${last.map(g => { const me = g.a === t.id, a = me ? g.sa : g.sb, b = me ? g.sb : g.sa; return `<div class="sqv-res ${a > b ? 'w' : 'l'}"><span>${g.d.slice(5).replace('-', '.')}</span><b>${a}:${b}</b><span>vs ${UI.esc(tn(me ? g.b : g.a).short)}</span></div>`; }).join('') || '<p class="ms-none" style="padding:10px 14px">아직 경기가 없습니다.</p>'}</div>
        </div>` : ''}
      </div>`;
    this.bind(el, () => this.cl(el));
  },

  async academy(el) {
    await Promise.all([Portal.ready, Traits.load()]);
    const t = Squad.team(), res = (App.state.acResults || []).slice(-6).reverse();
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head">
          <div class="rs-title"><h2>아카데미</h2><span>연습생입니다. 인원 제한은 없고, 매월 아카데미 대회에 5명 이상이면 참가합니다. 잘하는 선수는 챌린저스로 올리세요.</span></div>
          <div class="rs-stats"><div><span class="k">연습생</span><b>${t.academy.length}명</b></div><div><span class="k">최근 대회</span><b>${res[0] ? res[0].place + '위' : '-'}</b></div></div>
        </div>
        ${this.table(t.academy, '아직 연습생이 없습니다. 훈련 › 솔랭 순위에서 테스트를 제의해 보세요.')}
        ${res.length ? `<div class="card"><div class="card-head"><h3>아카데미 대회</h3></div>${res.map(r => `<div class="sqv-res ${r.place <= 3 ? 'w' : ''}"><span>${r.d.slice(0, 7).replace('-', '.')}</span><b>${r.place}위</b><span>12팀 중</span></div>`).join('')}</div>` : ''}
      </div>`;
    this.bind(el, () => this.academy(el));
  },
};
Views['roster-challengers'] = el => SquadView.cl(el);
Views['roster-academy'] = el => SquadView.academy(el);

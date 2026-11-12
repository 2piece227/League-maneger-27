// 경기 > 밴픽 준비: 실제 대회 드래프트(밴 3-3 · 픽 1-2-2-1 · 밴 2-2 · 픽 1-2-1, 피어리스) + 코치 어시스트 + 전술 채택
// - 직접하기: 감독이 고르고, 코치 추천 3개가 옆에 뜬다. 코치 밴픽 역량이 낮으면 추천이 엉뚱해진다.
// - 위임하기: 코치가 우리 차례를 대신 고른다. 전술도 코치 추천으로 미리 채워 둔다.
// - 밴픽이 끝나면 팀 전술 + 포지션별 전술을 고른다. 조합에 맞는 전술일수록 적합도가 높다.
// 경기 엔진이 들어오면 App.state.plans 에 저장된 밴픽·전술을 읽어 경기 결과에 반영한다.

// ---------- 챔피언 성향 (0~1) ----------
// Meraki 역할군에서 기본값을 만들고, 대표적인 초반/후반 챔피언은 손으로 보정한다.
const Style = {
  DIMS: { early: '초반', late: '후반', fight: '한타', pick: '끊기', split: '스플릿', poke: '포킹', engage: '이니시', peel: '보호' },
  ROLE_W: {
    ASSASSIN: { early: .7, pick: .9, split: .3 }, BURST: { pick: .7, poke: .3, fight: .4 }, BATTLEMAGE: { fight: .9, late: .4 },
    ARTILLERY: { poke: 1, late: .4 }, MAGE: { fight: .5, late: .5, poke: .3 }, MARKSMAN: { late: .9, fight: .6 },
    FIGHTER: { early: .5, split: .5, fight: .4 }, JUGGERNAUT: { split: .5, fight: .6, early: .4 }, DIVER: { engage: .7, pick: .5, early: .5 },
    SKIRMISHER: { split: .8, late: .5, early: .2 }, TANK: { engage: .6, fight: .7, peel: .3 }, VANGUARD: { engage: 1, fight: .8 },
    WARDEN: { peel: 1, fight: .4 }, CATCHER: { pick: 1, engage: .6, early: .4 }, ENCHANTER: { peel: .9, late: .5 },
    SUPPORT: { peel: .3 }, SPECIALIST: { late: .4, split: .3, poke: .3 },
  },
  FIX: {
    Kassadin: { late: 1, early: .1 }, Kayle: { late: 1, early: 0 }, Vayne: { late: 1, early: .2 }, Jinx: { late: 1, early: .2 }, KogMaw: { late: 1, early: .1 },
    Azir: { late: .9, early: .3 }, Ryze: { late: .8 }, Smolder: { late: 1, early: .1 }, Aphelios: { late: .9 }, Zeri: { late: .9 }, Viktor: { late: .8 },
    Gwen: { late: .8, split: .7 }, Fiora: { split: 1, late: .7 }, Jax: { split: .9, late: .8 }, Camille: { split: .9, pick: .7 }, Yorick: { split: 1 }, Tryndamere: { split: 1 },
    Draven: { early: 1, late: .5 }, Lucian: { early: .9 }, Kalista: { early: .9, engage: .4 }, Renekton: { early: 1 }, Pantheon: { early: 1, pick: .7 },
    LeeSin: { early: .9, pick: .8 }, Elise: { early: 1, pick: .8 }, Nidalee: { early: .9, poke: .6 }, Xinzhao: { early: .9, engage: .6 }, Jayce: { early: .8, poke: .9 },
    Leblanc: { early: .8, pick: 1 }, Rumble: { early: .7, fight: 1 }, Rell: { engage: 1, fight: .9 }, Nautilus: { engage: 1, pick: .8 }, Leona: { engage: 1, early: .7 },
    Ashe: { pick: .7, engage: .6, late: .6 }, Varus: { poke: .9 }, Ezreal: { poke: .9, late: .7 }, Xerath: { poke: 1 }, Ziggs: { poke: 1, late: .5 },
    Maokai: { engage: .9, peel: .6 }, Sejuani: { engage: 1, fight: .9 }, Orianna: { fight: 1, late: .7 }, Galio: { engage: .8, pick: .6, fight: .8 },
    Taliyah: { pick: .7, early: .6 }, Sylas: { fight: .8, pick: .6 }, Corki: { late: .8, poke: .7 }, Lulu: { peel: 1, late: .6 }, Braum: { peel: 1, engage: .5 },
  },
  cache: {},
  of(c) {
    if (this.cache[c]) return this.cache[c];
    const ch = Champions.byId[c] || { roles: [] }, s = Object.fromEntries(Object.keys(this.DIMS).map(k => [k, 0]));
    (ch.roles || []).forEach(r => Object.entries(this.ROLE_W[r] || {}).forEach(([k, v]) => { s[k] = Math.max(s[k], v); }));
    Object.assign(s, this.FIX[c] || {});
    // 실데이터: 짧은 경기(27분 미만) 승률과 긴 경기(33분 이상) 승률 차이로 초반/후반 성향을 보정
    if (typeof Stats !== 'undefined' && Stats.of(c) && Stats.of(c).g >= 15) {
      const [e, , l] = Stats.curve(c), d = Math.max(-.5, Math.min(.5, (e - l) * 3));
      s.early = s.early * .5 + (.5 + d) * .5; s.late = s.late * .5 + (.5 - d) * .5;
      s.real = true;
    }
    const roles = ch.roles || [];
    s.front = roles.some(r => ['TANK', 'VANGUARD', 'WARDEN', 'JUGGERNAUT'].includes(r)) ? 1 : 0;
    s.ap = ch.damageType === 'MAGIC_DAMAGE' ? 1 : ch.damageType === 'MIXED_DAMAGE' ? .5 : 0;
    s.ranged = ch.attackType === 'RANGED' ? 1 : 0;
    return (this.cache[c] = s);
  },
  // 조합 성향: 다섯 챔피언 평균 (이니시·보호는 가장 강한 챔피언 기준을 섞는다)
  comp(cs) {
    const list = cs.filter(Boolean).map(c => this.of(c)), n = list.length || 1, o = {};
    Object.keys(this.DIMS).forEach(k => { const avg = list.reduce((a, s) => a + s[k], 0) / n, mx = Math.max(0, ...list.map(s => s[k])); o[k] = ['engage', 'peel'].includes(k) ? avg * .5 + mx * .5 : avg; });
    o.front = list.reduce((a, s) => a + s.front, 0); o.ap = list.reduce((a, s) => a + s.ap, 0) / n; o.n = list.length;
    return o;
  },
};

const Draft = {
  ORDER: [['B', 'ban'], ['R', 'ban'], ['B', 'ban'], ['R', 'ban'], ['B', 'ban'], ['R', 'ban'],
    ['B', 'pick'], ['R', 'pick'], ['R', 'pick'], ['B', 'pick'], ['B', 'pick'], ['R', 'pick'],
    ['R', 'ban'], ['B', 'ban'], ['R', 'ban'], ['B', 'ban'],
    ['R', 'pick'], ['B', 'pick'], ['B', 'pick'], ['R', 'pick']],
  PHASE: i => i < 6 ? '밴 1단계' : i < 12 ? '픽 1단계' : i < 16 ? '밴 2단계' : '픽 2단계',
  TIME: 30,
  roleF: 'ALL', q: '', sel: null, selRole: null, timerOn: true, left: 30, _tick: null, _ai: null,

  st() { return App.state.draft || null; },
  team(id) { return App.db.teams.find(t => t.id === id); },
  side(S, k) { return this.team(S.teams[k]); },

  // ---------- 코치 ----------
  // 밴픽 역량 1~20: 팀 평판 + 코치마다 고정된 편차. 스태프 중 밴픽 역량이 가장 높은 코치가 밴픽을 맡는다
  coach(t) {
    const l = (t.staff || []).map(s => ({ name: s.name, r: this.coachRating(s, t), p: s })).sort((a, b) => b.r - a.r);
    return l[0] || { name: '코치 없음', r: 6, p: null };
  },
  coachRating(s, t) { return Math.max(1, Math.min(20, Math.round(7 + Fame.team(t) / 100 * 8 + (G.rand(s.id, 'draft') - .5) * 8))); },
  grade(r) { return r >= 17 ? '최상급' : r >= 13 ? '우수' : r >= 9 ? '보통' : r >= 5 ? '미흡' : '부족'; },

  // ---------- 평가 ----------
  lineup(t) { return G.ROLES.map(r => { const ps = t.players.filter(p => p.role === r).sort((a, b) => (a.sub - b.sub) || (b.ovr || 0) - (a.ovr || 0)); return ps[0] || null; }); },
  metaMap() {
    if (this._meta) return this._meta;
    const agg = {};
    Object.values(Mastery.pools || {}).forEach(l => l.forEach(e => { agg[e.c] = (agg[e.c] || 0) + (e.g26 || 0); }));
    const ranked = Object.entries(agg).filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1]);
    this._meta = {}; ranked.forEach(([c], i) => { this._meta[c] = Math.pow(1 - i / ranked.length, 1.6); });
    return this._meta;
  },
  meta(c) { return this.metaMap()[c] || 0; },
  tier(c) { const m = this.meta(c); return m >= .8 ? 'S' : m >= .55 ? 'A' : m >= .3 ? 'B' : 'C'; },
  mast(p, c) { const e = p && Mastery.pool(p.id).find(x => x.c === c); return e ? { m: e.m, sig: e.sig } : { m: 0, sig: false }; },
  fits(c, r) { const ch = Champions.byId[c]; return !ch || !(ch.positions || []).length || ch.positions.includes(r); },
  taken(S) { return new Set([...S.bans.B, ...S.bans.R, ...S.picks.B.map(x => x.c), ...S.picks.R.map(x => x.c), ...(S.fearless || [])].filter(Boolean)); },
  openRoles(S, k) { return G.ROLES.filter(r => !S.picks[k].some(x => x.role === r)); },
  // 이 챔피언이 이 팀 이 포지션에 주는 값 (숙련 45% · 메타 25% · 조합 보완 20% · 시그니처 10%)
  value(S, k, c, r) {
    const t = this.side(S, k), p = this.lineup(t)[G.ROLES.indexOf(r)], ms = this.mast(p, c), st = Style.of(c);
    const comp = Style.comp(S.picks[k].map(x => x.c)), why = [];
    let need = 0;
    if (comp.n >= 1 && !comp.front && st.front) { need += .5; why.push('앞라인 필요'); }
    if (comp.n >= 2 && comp.ap < .25 && st.ap >= .5) { need += .35; why.push('AP 딜 보완'); }
    if (comp.n >= 2 && comp.ap > .7 && st.ap <= .5) { need += .35; why.push('AD 딜 보완'); }
    if (comp.n >= 1 && comp.engage < .5 && st.engage >= .6) { need += .3; why.push('이니시 보완'); }
    // 실데이터: 상대가 이미 고른 같은 포지션 챔피언과의 매치업, 우리 팀 챔피언과의 시너지
    let mu = 0, sy = 0;
    if (typeof Stats !== 'undefined') {
      const opp = S.picks[k === 'B' ? 'R' : 'B'].find(x => x.role === r);
      if (opp) { const m = Stats.matchup(r, c, opp.c); mu = m.wr - .5; if (m.g >= 3 && Math.abs(mu) >= .04) why.push(`${Champions.byId[opp.c].name} 상대 ${Math.round(m.wr * 100)}% (${m.g}판)`); }
      S.picks[k].forEach(x => { const q = Stats.synergy(r, c, x.role, x.c); if (q) { sy += q.wr - .5; if (q.g >= 4 && q.wr >= .55) why.push(`${Champions.byId[x.c].name}와 시너지 ${Math.round(q.wr * 100)}%`); } });
    }
    const v = .4 * ms.m / 20 + .22 * this.meta(c) + .18 * Math.min(1, need) + (ms.sig ? .1 : 0) + mu * .6 + sy * .4;
    if (ms.sig) why.unshift(`${p.name} 시그니처`); else if (ms.m >= 12) why.unshift(`${p.name} 숙련 ${ms.m}`);
    if (this.meta(c) >= .8) why.push('S티어 메타');
    return { v, why, p, m: ms.m, sig: ms.sig };
  },
  // ---------- 프로 밴픽 학습 모델 (data/draft-model.json, tools/draft-learn.py) ----------
  // 2023~2026 4대 리그·국제대회 밴픽을 "그 순간의 판단 기준"으로 학습한 페이즈별 가중치. 챔피언 이름은 학습에 쓰지 않아 메타가 바뀌어도 같은 논리로 고른다.
  M: null,
  PHASE_OF: i => i < 6 ? 'ban1' : i === 6 ? 'first' : i < 12 ? 'pick1' : i < 16 ? 'ban2' : i < 19 ? 'pick2' : 'last',
  share(c) { const r = this.M && this.M.roles[Stats.name(c)]; if (r) return r; const ps = (Champions.byId[c] || {}).positions || []; return Object.fromEntries(ps.map(p => [p, 1 / ps.length])); },
  fitsR(c, r) { return (this.share(c)[r] || 0) >= .15; },
  // 선수 숙련: 최근 40게임 중 그 챔피언을 쓴 횟수 근사 (학습 때 팀 기록과 같은 단위)
  comf(t, c, roles) {
    const line = this.lineup(t); let v = 0, who = null;
    roles.forEach(r => {
      if (!this.fitsR(c, r)) return;
      const p = line[G.ROLES.indexOf(r)]; if (!p) return;
      const pool = Mastery.pool(p.id), e = pool.find(x => x.c === c); if (!e) return;
      const tot = pool.reduce((a, x) => a + (x.g26 || 0), 0), n = (e.g26 || 0) * 40 / Math.max(40, tot) + Math.min(.6, (e.g || 0) / 60);
      const q = Math.log1p(n); if (q > v) { v = q; who = p; }
    });
    return { v, who };
  },
  feats(S, k, c) {
    const o = k === 'B' ? 'R' : 'B', openK = this.openRoles(S, k), openO = this.openRoles(S, o), nm = Stats.name(c), M = this.M;
    const sh = this.share(c), flex = Object.values(sh).filter(v => v >= .1).length / 3;
    const fit = openK.some(r => this.fitsR(c, r)) ? 1 : 0, fitO = openO.some(r => this.fitsR(c, r)) ? 1 : 0;
    const ck = this.comf(this.side(S, k), c, openK), co = this.comf(this.side(S, o), c, openO);
    let syn = 0, synW = null; S.picks[k].forEach(x => { const v = M.pairs[[nm, Stats.name(x.c)].sort().join('|')] || 0; if (v > syn) { syn = v; synW = x.c; } });
    let counter = 0, cW = null; S.picks[o].forEach(x => { if (openK.includes(x.role) && this.fitsR(c, x.role)) { const m = Stats.matchup(x.role, c, x.c), v = m.wr - .5; if (v > counter) { counter = v; cW = { c: x.c, m }; } } });
    let threat = 0, tW = null; S.picks[k].forEach(x => { if (this.fitsR(c, x.role)) { const m = Stats.matchup(x.role, c, x.c), v = m.wr - .5; if (v > threat) { threat = v; tW = { c: x.c, m }; } } });
    return { x: [this.metaNow(c), ck.v, co.v, flex, fit, fitO, syn, counter, threat, Stats.wr(c) - .5], ck, co, synW, cW, tW };
  },
  // 게임 안 메타: 시즌 전체 픽밴 비율을 기준으로, 2주마다 바뀌는 "패치"가 챔피언마다 위아래로 흔든다 (같은 메타가 시즌 내내 고정되지 않게)
  metaNow(c) {
    const nm = Stats.name(c), base = (this.M.meta_season || this.M.meta)[nm] || 0;
    const patch = Math.floor(Fmt.daysBetween(`${Clock.year()}-01-01`, Clock.today()) / 14);
    const r1 = G.rand(nm + ':patch:' + Clock.year() + ':' + patch, 'mt'), r2 = G.rand(nm + ':patch:' + Clock.year() + ':' + (patch - 1), 'mt');
    const shift = Math.exp(((r1 - .5) * .9 + (r2 - .5) * .45));     // 지난 패치 영향도 조금 남는다
    return Math.min(.9, base * shift + (base < .02 && r1 > .97 ? .12 : 0));   // 가끔 안 쓰이던 챔피언이 떠오른다
  },
  // 픽 순서별 포지션 비율 (프로 피어리스 시기): 탑·서폿을 늦게 고르는 경향 등
  slotRole(S, c, k) { const sr = this.M.slot_role && this.M.slot_role[S.step]; if (!sr) return 0; const open = this.openRoles(S, k).filter(r => this.fitsR(c, r)); return open.length ? Math.log(Math.max(...open.map(r => sr[r] || .02)) * 5) : 0; },
  bestRole(S, k, c) {
    const open = this.openRoles(S, k), sh = this.share(c), line = this.lineup(this.side(S, k));
    return open.filter(r => this.fitsR(c, r)).sort((a, b) => ((sh[b] || 0) + this.mast(line[G.ROLES.indexOf(b)], c).m / 20) - ((sh[a] || 0) + this.mast(line[G.ROLES.indexOf(a)], c).m / 20))[0] || open[0];
  },
  // 추천 이유: 점수에 가장 크게 기여한 기준 두 개
  reasons(x, W, kind) {
    const f = x.f, nm = c => Champions.byId[c] ? Champions.byId[c].name : c, ban = kind === 'ban';
    const text = [
      () => `메타 우선 (픽밴 ${Math.round(f.x[0] * 100)}%)`,
      () => f.ck.who ? `${f.ck.who.name} 숙련` : '우리 팀 숙련',
      () => f.co.who ? (ban ? `상대 ${f.co.who.name} 숙련 견제` : `상대 ${f.co.who.name} 챔프 선점`) : '상대 숙련 견제',
      () => '플렉스 (포지션 숨기기)', null,
      () => ban ? '상대 남은 포지션' : null,
      () => f.synW ? `${Sim.josa(nm(f.synW), '과', '와')} 조합` : null,
      () => f.cW ? `${nm(f.cW.c)} 상대 ${Math.round(f.cW.m.wr * 100)}%${f.cW.m.g ? ` (${f.cW.m.g}판)` : ''}` : null,
      () => f.tW ? (ban ? `우리 ${nm(f.tW.c)} 카운터 차단` : null) : null,
      () => '최근 승률 높음',
    ];
    const why = W.map((w, j) => ({ j, v: w * f.x[j] })).filter(e => e.v > .05 && text[e.j]).sort((a, b) => b.v - a.v).map(e => text[e.j]()).filter(Boolean);
    return why.slice(0, 2).length ? why.slice(0, 2) : [ban ? '상대 조합 견제' : '무난한 선택'];
  },
  // 코치 추천 (n개). 페이즈별 학습 가중치로 점수를 매긴다. 역량이 낮을수록 잡음이 크고, 상대 분석(상대 숙련·카운터·우리 카운터 견제) 비중이 줄어든다
  suggest(S, k, n = 3) {
    if (!this.M) return this.suggestOld(S, k, n);
    const i = S.step, kind = this.ORDER[i][1], w = ((this.M.by_mode || {}).fearless || this.M.phases)[this.PHASE_OF(i)] || this.M.phases[this.PHASE_OF(i)],   // 게임은 피어리스 규칙이라 피어리스 시기 가중치
      taken = this.taken(S), r20 = this.coach(this.side(S, k)).r / 20;
    const insight = .5 + .5 * r20, W = w.map((v, j) => [2, 7, 8].includes(j) ? v * insight : v);
    const out = [];
    Champions.list.forEach(ch => {
      const c = ch.id; if (taken.has(c)) return;
      const f = this.feats(S, k, c); if (kind === 'pick' && !f.x[4]) return;
      out.push({ c, f, s: W.reduce((a, v, j) => a + v * f.x[j], 0) + (kind === 'pick' ? this.slotRole(S, c, k) : 0) + (G.rand(`${S.id}:${i}:${k}:${c}`, 'cn') - .5) * (1 - r20) * 1.6 });
    });
    out.sort((a, b) => b.s - a.s);
    return out.slice(0, n).map(x => ({ c: x.c, s: x.s, role: kind === 'pick' ? this.bestRole(S, k, x.c) : undefined, why: this.reasons(x, W, kind) }));
  },
  // (모델 파일이 없을 때 쓰는 예전 규칙)
  suggestOld(S, k, n = 3) {
    const step = this.ORDER[S.step], taken = this.taken(S), co = this.coach(this.side(S, k)), r20 = co.r / 20;
    const noise = c => (G.rand(`${S.id}:${S.step}:${k}:${c}`, 'cn') - .5) * (1 - r20) * .5;
    const opp = k === 'B' ? 'R' : 'B', out = [];
    Champions.list.forEach(ch => {
      const c = ch.id; if (taken.has(c)) return;
      if (step[1] === 'pick') {
        this.openRoles(S, k).filter(r => this.fits(c, r)).forEach(r => { const x = this.value(S, k, c, r); out.push({ c, role: r, s: x.v + noise(c), why: x.why }); });
      } else {
        let best = null;
        this.openRoles(S, opp).filter(r => this.fits(c, r)).forEach(r => { const x = this.value(S, opp, c, r); if (!best || x.v > best.v) best = { ...x, r }; });
        if (!best) return;
        const why = best.sig ? [`상대 ${best.p.name} 시그니처`] : best.m >= 12 ? [`상대 ${best.p.name} 숙련 ${best.m}`] : [];
        if (this.meta(c) >= .8) why.push('S티어 메타');
        out.push({ c, s: best.v * (.6 + .4 * r20) + this.meta(c) * .15 + noise(c), why: why.length ? why : ['상대 조합 견제'] });
      }
    });
    out.sort((a, b) => b.s - a.s);
    const seen = new Set(); return out.filter(x => !seen.has(x.c) && seen.add(x.c)).slice(0, n);
  },

  // ---------- 진행 ----------
  start(o) {
    const my = Roster.team(), opp = this.team(o.opp);
    const prev = this.st(), series = o.continueSeries && prev && prev.series ? prev.series : { key: o.key || 'practice:' + Clock.today() + ':' + opp.id, bo: o.bo || 1, games: [] };
    const us = o.side || 'B';
    App.state.draft = this.make({ series, teams: us === 'B' ? { B: my.id, R: opp.id } : { B: opp.id, R: my.id }, us, mode: o.mode, official: !!o.key });
    this.sel = null; this.selRole = null; this.left = this.TIME;
  },
  // 드래프트 상태 만들기 (us: 우리 진영, 없으면 AI 대 AI)
  make({ series, teams, us = null, mode = 'delegate', official = false }) {
    return {
      id: `${series.key}:${series.games.length + 1}:${Date.now().toString(36)}`, series, game: series.games.length + 1, mode, us,
      teams, bans: { B: [], R: [] }, picks: { B: [], R: [] }, step: 0, done: false, phase: 'draft',
      fearless: series.games.flatMap(g => [...g.picks.B, ...g.picks.R].map(x => x.c)), official,
    };
  },
  // 양 팀 코치가 끝까지 고르고 전술까지 확정 (AI 경기 · 자동 진행)
  auto(S) { while (!S.done) this.aiAct(S); S.phase = 'ready'; S.series.games.push({ game: S.game, teams: S.teams, bans: S.bans, picks: S.picks, tactics: S.tactics }); return S; },
  act(S, c, role) {
    const [k, kind] = this.ORDER[S.step];
    if (kind === 'ban') S.bans[k].push(c);
    else {
      const r = role && this.openRoles(S, k).includes(role) ? role : this.openRoles(S, k).find(x => this.fits(c, x)) || this.openRoles(S, k)[0];
      const p = this.lineup(this.side(S, k))[G.ROLES.indexOf(r)];
      S.picks[k].push({ c, role: r, pid: p ? p.id : null });
    }
    S.step++; this.sel = null; this.selRole = null; this.left = this.TIME;
    if (S.step >= this.ORDER.length) { S.done = true; S.phase = 'tactics'; this.initTactics(S); }
  },
  // AI(상대 코치, 위임 시 우리 코치): 1순위 추천을 고른다. 밴은 가끔 2순위
  aiAct(S) {
    const [k] = this.ORDER[S.step], list = this.suggest(S, k, this.M ? 12 : 3);
    let pick = list[0];
    if (this.M && list.length) {
      // 학습한 점수 = 프로가 고를 확률(로그). 그 확률대로 하나를 뽑아 실제처럼 매번 조금씩 다른 밴픽이 나온다. 코치 역량이 높을수록 1순위에 가깝게
      const T = 1.15 - this.coach(this.side(S, k)).r / 20 * .25,   // 1.0 = 프로 선택 분포 그대로 (역량 13 코치 ≈ 1.0)
        mx = list[0].s, ws = list.map(x => Math.exp((x.s - mx) / T)), tot = ws.reduce((a, b) => a + b, 0);
      let r = G.rand(S.id + ':' + S.step, 'ai') * tot; for (let j = 0; j < list.length; j++) { r -= ws[j]; if (r <= 0) { pick = list[j]; break; } }
    } else if (G.rand(S.id + S.step, 'ai') < .2 && list[1]) pick = list[1];
    pick ||= { c: Champions.list.find(ch => !this.taken(S).has(ch.id)).id };
    this.act(S, pick.c, pick.role || (this.ORDER[S.step][1] === 'pick' && this.M ? this.bestRole(S, k, pick.c) : undefined));
  },
  ourTurn(S) { return !S.done && this.ORDER[S.step][0] === S.us && S.mode === 'direct'; },

  // ---------- 전술 ----------
  TEAM_TAC: {
    late: { n: '후반 도모', d: '라인을 지키며 성장, 3코어 이후 한타로 승부', f: c => c.late * 1.2 - c.early * .35 + .15 },
    early: { n: '초반 러시', d: '15분 안에 격차를 벌린다. 다이브·인베이드 적극', f: c => c.early * 1.25 },
    fight: { n: '교전 중시', d: '오브젝트마다 한타를 연다', f: c => (c.fight * .6 + c.engage * .5) * 1.15 },
    snow: { n: '스노우볼 중시', d: '작은 이득을 시야·오브젝트로 굴린다', f: c => (c.early * .55 + c.pick * .55) * 1.1 },
    bal: { n: '균형', d: '상황에 맞춰 유연하게', f: () => .5 },
  },
  ROLE_TAC: {
    TOP: [['press', '라인전 압박', s => s.early * .8 + s.ranged * .25 + s.poke * .2], ['hold', '버티기', s => s.late * .5 + s.front * .35 + s.peel * .15], ['skirm', '소규모 교전 참여', s => s.fight * .45 + s.engage * .4 + s.early * .2], ['split', '스플릿', s => s.split]],
    JGL: [['gank', '초반 갱킹', s => s.early * .6 + s.pick * .5], ['invade', '카정', s => s.early * .7 + s.split * .3], ['farm', '성장 우선', s => s.late * .9], ['obj', '오브젝트 중심', s => s.fight * .6 + s.engage * .4]],
    MID: [['press', '라인전 압박', s => s.poke * .5 + s.early * .5 + s.ranged * .1], ['roam', '로밍', s => s.pick * .85 + s.early * .2], ['farm', '성장 우선', s => s.late * .95], ['join', '교전 합류', s => s.fight * .9]],
    BOT: [['press', '라인전 압박', s => s.early * .85 + s.poke * .3], ['safe', '안정적 성장', s => s.late * .95], ['join', '교전 합류', s => s.fight * .8 + s.poke * .25]],
    SUP: [['roam', '로밍', s => s.pick * .6 + s.engage * .4], ['lane', '바텀 고정', s => s.early * .45 + s.poke * .35 + s.engage * .25], ['vision', '시야 장악', s => s.pick * .4 + s.peel * .35 + .15], ['protect', '원딜 보호', s => s.peel]],
  },
  pct: v => Math.max(5, Math.min(99, Math.round(v * 100))),
  teamFits(S, k) { const c = Style.comp(S.picks[k].map(x => x.c)); return Object.fromEntries(Object.entries(this.TEAM_TAC).map(([id, x]) => [id, this.pct(x.f(c))])); },
  roleFits(S, k, r) { const x = S.picks[k].find(y => y.role === r); const s = x ? Style.of(x.c) : null; return Object.fromEntries(this.ROLE_TAC[r].map(([id, , f]) => [id, s ? this.pct(f(s)) : 50])); },
  // 코치가 고르는 전술: 적합도 1위 (역량이 낮으면 가끔 2위)
  coachTac(S, k) {
    const r20 = this.coach(this.side(S, k)).r / 20, best = (fits, key) => { const l = Object.entries(fits).sort((a, b) => b[1] - a[1]); return (G.rand(S.id + key + k, 'tac') < (1 - r20) * .6 && l[1] ? l[1] : l[0])[0]; };  // 역량 13이면 약 20% 확률로 2순위
    return { team: best(this.teamFits(S, k), 'team'), roles: Object.fromEntries(G.ROLES.map(r => [r, best(this.roleFits(S, k, r), r)])) };
  },
  initTactics(S) {
    if (!S.us) { S.tactics = { B: this.coachTac(S, 'B'), R: this.coachTac(S, 'R') }; S.rec = S.tactics.B; return; }
    const opp = S.us === 'B' ? 'R' : 'B';
    S.tactics = { [opp]: this.coachTac(S, opp), [S.us]: S.mode === 'delegate' ? this.coachTac(S, S.us) : { team: null, roles: {} } };
    S.rec = this.coachTac(S, S.us);
  },
  fitTotal(S, k) {
    const T = S.tactics[k]; if (!T || !T.team) return null;
    const tf = this.teamFits(S, k)[T.team], rf = G.ROLES.map(r => T.roles[r] ? this.roleFits(S, k, r)[T.roles[r]] : null).filter(v => v != null);
    return Math.round(tf * .5 + (rf.reduce((a, v) => a + v, 0) / (rf.length || 1)) * .5);
  },
  confirm(S) {
    const T = S.tactics[S.us];
    if (!T.team || G.ROLES.some(r => !T.roles[r])) { UI.toast('팀 전술과 다섯 포지션 전술을 모두 골라 주세요'); return false; }
    S.phase = 'ready';
    S.series.games.push({ game: S.game, teams: S.teams, bans: S.bans, picks: S.picks, tactics: S.tactics });
    (App.state.plans ||= {})[S.series.key] = { series: S.series, date: Clock.today() };
    return true;
  },

  // 경기날: 이 경기의 밴픽이 진행 중이면 이어서, 아니면 준비 화면으로
  matchDay() {
    const m = Season.today(); if (!m) return;
    const S = this.st(); if (S && S.series && S.series.key !== m.id && S.phase !== 'ready') App.state.draft = null;
    if (S && S.series && S.series.key !== m.id) App.state.draft = null;
    Router.go('match-draft');
  },

  // ---------- 화면 ----------
  async render(el) {
    el.innerHTML = '<div class="placeholder-view"><p>밴픽 준비 중…</p></div>';
    await Promise.all([Portal.ready, Mastery.load(), Champions.load(), Results.load(), Stats.load()]);
    this.el = el; clearInterval(this._tick); clearTimeout(this._ai);
    const S = this.st();
    if (!S) return this.setup(el);
    if (S.phase === 'draft') return this.board(el, S);
    return this.tacticsView(el, S);
  },

  setup(el, preset = {}) {
    const my = Roster.team(), nm = Schedule.forTeam(my.id).find(m => m.t.slice(0, 10) >= Clock.today() && !Season.st()[m.id]), nOpp = nm && Schedule.opponent(nm, my.id);
    const opp = this.team(preset.opp) || nOpp || App.db.teams.find(t => t.league === my.league && t.id !== my.id);
    const co = this.coach(my), oc = this.coach(opp);
    const teams = App.db.teams.filter(t => t.id !== my.id).sort((a, b) => (a.league !== my.league) - (b.league !== my.league) || a.league.localeCompare(b.league) || a.name.localeCompare(b.name));
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head(nm && nOpp && nOpp.id === opp.id && nm.t.slice(0, 10) === Clock.today() ? '경기날 — 밴픽 준비' : '밴픽 준비', '실제 대회와 같은 순서로 밴픽을 진행합니다 (밴 3·3 → 픽 1·2·2·1 → 밴 2·2 → 픽 1·2·1). 같은 시리즈에서 이미 나온 챔피언은 다시 쓸 수 없습니다(피어리스). 전술을 확정하면 바로 경기가 시작됩니다.')}
        <div class="dr-setup">
          <div class="card dr-vs">
            <div class="dr-vs-side">${G.team(my, 'lg')}<b>${UI.esc(my.name)}</b><small>코치 ${UI.esc(co.name)} · 밴픽 ${co.r}/20</small></div>
            <div class="dr-vs-mid"><b>VS</b>${nOpp && nOpp.id === opp.id ? `<small>${UI.esc(Schedule.eventOf(nm).label)} · ${Fmt.dateTime(nm.t)} · Bo${nm.bo}${nm.t.slice(0, 10) === Clock.today() ? ' · <em class="dr-today">오늘 경기</em>' : ''}</small>` : '<small>연습 밴픽</small>'}<button class="btn-primary dr-go">밴픽 시작</button>${nm && nOpp && nOpp.id === opp.id && nm.t.slice(0, 10) === Clock.today() ? '<button class="btn-ghost dr-skip">코치에게 맡기고 결과만 보기</button>' : ''}</div>
            <div class="dr-vs-side">${G.team(opp, 'lg')}<b>${UI.esc(opp.name)}</b><small>코치 ${UI.esc(oc.name)} · 밴픽 ${oc.r}/20</small></div>
          </div>
          <div class="card dr-form">
            <label><span>상대</span><select class="ch-sort dr-opp">${teams.map(t => `<option value="${t.id}" ${t.id === opp.id ? 'selected' : ''}>${t.league} · ${UI.esc(t.name)}${nOpp && t.id === nOpp.id ? ' (다음 경기)' : ''}</option>`).join('')}</select></label>
            <label><span>진영</span><div class="seg dr-side"><button class="on" data-v="B">블루 진영</button><button data-v="R">레드 진영</button></div></label>
            <label><span>방식</span><div class="seg dr-mode"><button class="on" data-v="direct">직접하기</button><button data-v="delegate">위임하기</button></div></label>
            <p class="dr-mode-desc">직접하기: 감독이 고르고, 코치 추천 3개가 옆에 뜹니다. 코치 밴픽 역량이 높을수록 추천이 정확합니다.</p>
            <label><span>시리즈</span><div class="seg dr-bo"><button class="${nm && nOpp && nOpp.id === opp.id && nm.bo === 1 ? 'on' : ''}" data-v="1">단판</button><button class="${!nm || !nOpp || nOpp.id !== opp.id || nm.bo === 3 ? 'on' : ''}" data-v="3">Bo3</button><button class="${nm && nOpp && nOpp.id === opp.id && nm.bo === 5 ? 'on' : ''}" data-v="5">Bo5</button></div></label>
          </div>
          <div class="card dr-coach-card">
            <div class="card-head"><h3>코치 밴픽 역량</h3></div>
            ${[[my, co], [opp, oc]].map(([t, c]) => `<div class="dr-co-row">${c.p ? G.face(c.p, 'pl-ph') : '<div class="pl-ph pl-ph-empty">?</div>'}<div><b>${UI.esc(c.name)}</b><small>${UI.esc(t.short)} 밴픽 담당 코치</small></div><div class="dr-co-bar"><i style="width:${c.r / 20 * 100}%"></i></div><b class="num">${c.r}</b><span class="cr-dim">${this.grade(c.r)}</span></div>`).join('')}
            <p class="cr-dim dr-note">밴픽 역량은 코치 추천의 정확도, 상대 분석(밴) 비중, 전술 추천에 영향을 줍니다. 위임하면 이 코치가 우리 차례를 대신 고릅니다.</p>
          </div>
        </div>
      </div>`;
    const pick = (cls, cb) => $(cls, el).onclick = e => { const b = e.target.closest('button'); if (!b) return; $$(cls + ' button', el).forEach(x => x.classList.toggle('on', x === b)); cb && cb(b.dataset.v); };
    pick('.dr-side'); pick('.dr-bo');
    pick('.dr-mode', v => { $('.dr-mode-desc', el).textContent = v === 'direct' ? '직접하기: 감독이 고르고, 코치 추천 3개가 옆에 뜹니다. 코치 밴픽 역량이 높을수록 추천이 정확합니다.' : `위임하기: 코치 ${co.name}(밴픽 ${co.r}/20)이(가) 우리 차례를 대신 고르고 전술도 추천대로 채워 둡니다. 감독은 지켜보다가 전술만 고칠 수 있습니다.`; });
    $('.dr-opp', el).onchange = e => this.setup(el, { opp: e.target.value });
    const sk = $('.dr-skip', el);
    if (sk) sk.onclick = () => {
      const s = Season.delegate(nm), sc = Season.seriesScore(s), o = Schedule.opponent(nm, my.id);
      UI.toast(`${my.short} ${sc[my.id] || 0} : ${sc[o.id] || 0} ${o.short} — 코치가 치른 결과입니다`, 4000);
      Router.go('match-history');
    };
    $('.dr-go', el).onclick = () => {
      const v = c => $(c + ' .on', el).dataset.v, oppId = $('.dr-opp', el).value;
      const official = nOpp && nOpp.id === oppId;
      this.start({ opp: oppId, side: v('.dr-side'), mode: v('.dr-mode'), bo: +v('.dr-bo'), key: official ? nm.id : null });
      this.render(el);
    };
  },

  slot(S, k, i) {
    const t = this.side(S, k), x = S.picks[k][i], p = x ? Player.find(x.pid)?.p : this.lineup(t)[i];
    const cur = !S.done && this.ORDER[S.step][0] === k && this.ORDER[S.step][1] === 'pick' && S.picks[k].length === i;
    const hover = cur && this.sel && k === S.us ? this.sel : null, c = x ? x.c : hover, ch = c && Champions.byId[c];
    const role = x ? x.role : cur && k === S.us && this.sel ? (this.selRole || this.openRoles(S, k).find(r => this.fits(this.sel, r))) : null;
    const pp = role ? this.lineup(t)[G.ROLES.indexOf(role)] : null;
    return `<div class="dr-slot ${k === 'B' ? 'blue' : 'red'} ${cur ? 'cur' : ''} ${x ? 'locked' : ''} ${hover ? 'hover' : ''}" ${ch ? `style="--sp:url('${new URL(ch.splash, location.href).href}')"` : ''}>
      <div class="dr-slot-in">
        ${ch ? `<b class="dr-ch">${UI.esc(ch.name)}</b>` : `<b class="dr-ch dim">${cur ? '선택 중…' : ''}</b>`}
        ${pp || (x && p) ? `<span class="dr-pl">${G.pos((x ? x.role : role))}${UI.esc((pp || p).name)}${(() => { const m = this.mast(pp || p, c); return c && m.m ? `<i class="dr-m ${m.sig ? 'sig' : ''}">${m.sig ? 'SIG' : m.m}</i>` : ''; })()}</span>` : ''}
      </div></div>`;
  },
  banRow(S, k) {
    const cur = !S.done && this.ORDER[S.step][0] === k && this.ORDER[S.step][1] === 'ban';
    return `<div class="dr-bans ${k === 'B' ? 'blue' : 'red'}">${Array.from({ length: 5 }, (_, i) => { const c = S.bans[k][i], hv = cur && i === S.bans[k].length && k === S.us && this.sel; const id = c || (hv ? this.sel : null); return `<div class="dr-ban ${cur && i === S.bans[k].length ? 'cur' : ''} ${i === 2 ? 'gap' : ''}">${id ? SoloQ.ic(id) : ''}</div>`; }).join('')}</div>`;
  },

  board(el, S) {
    const B = this.side(S, 'B'), R = this.side(S, 'R'), step = this.ORDER[S.step], mine = this.ourTurn(S);
    const keep = (el.querySelector('.dr-grid') || {}).scrollTop || 0;
    const taken = this.taken(S), ourT = this.side(S, S.us), ourLine = this.lineup(ourT);
    const actK = step[0], actT = this.side(S, actK);
    el.innerHTML = `
      <div class="dr-board">
        <div class="dr-top">
          <div class="dr-team blue ${actK === 'B' ? 'act' : ''}">${G.team(B, 'lg')}<div><b>${UI.esc(B.name)}</b><small>블루 진영${S.us === 'B' ? ' · 우리 팀' : ''}</small></div></div>
          <div class="dr-center">
            <small>${S.series.bo > 1 ? `Bo${S.series.bo} · ${S.game}세트${S.fearless.length ? ` · 피어리스 ${S.fearless.length}개 사용 불가` : ''}` : '단판'}</small>
            <b>${this.PHASE(S.step)}</b>
            <span class="dr-turn ${actK === 'B' ? 'blue' : 'red'}">${UI.esc(actT.short)} ${step[1] === 'ban' ? '밴' : '픽'}${S.mode === 'delegate' && actK === S.us ? ' (코치 위임)' : ''}</span>
            <em class="dr-timer ${mine && this.timerOn ? '' : 'off'}">${mine && this.timerOn ? this.left : ''}</em>
          </div>
          <div class="dr-team red ${actK === 'R' ? 'act' : ''}"><div><b>${UI.esc(R.name)}</b><small>레드 진영${S.us === 'R' ? ' · 우리 팀' : ''}</small></div>${G.team(R, 'lg')}</div>
        </div>
        <div class="dr-banbar">${this.banRow(S, 'B')}<div class="dr-steps">${this.ORDER.map(([k, kind], i) => `<i class="${k === 'B' ? 'b' : 'r'} ${kind} ${i < S.step ? 'done' : i === S.step ? 'now' : ''}"></i>`).join('')}</div>${this.banRow(S, 'R')}</div>
        <div class="dr-main">
          <div class="dr-col">${[0, 1, 2, 3, 4].map(i => this.slot(S, 'B', i)).join('')}</div>
          <div class="dr-pool">
            <div class="dr-filter">
              <div class="seg dr-rf">${['ALL', ...G.ROLES].map(r => `<button class="${this.roleF === r ? 'on' : ''}" data-r="${r}">${r === 'ALL' ? '전체' : G.pos(r)}</button>`).join('')}</div>
              <input class="ch-search dr-q" type="search" placeholder="챔피언 검색" value="${UI.esc(this.q)}">
            </div>
            <div class="dr-grid"></div>
            <div class="dr-act">
              <div class="dr-coach">
                <div class="dr-coach-h">${(() => { const c = this.coach(ourT); return `${c.p ? G.face(c.p, 'pl-ph') : ''}<div><b>코치 ${UI.esc(c.name)}의 추천</b><small>밴픽 역량 ${c.r}/20 · ${this.grade(c.r)}</small></div>`; })()}</div>
                <div class="dr-sugs">${actK === S.us ? this.suggest(S, S.us, 3).map((x, i) => `<button class="dr-sug" data-c="${x.c}" data-role="${x.role || ''}">${SoloQ.ic(x.c)}<div><b>${i + 1}. ${UI.esc(Champions.byId[x.c].name)}${x.role ? ` ${G.pos(x.role)}` : ''}</b><small>${UI.esc(x.why.slice(0, 2).join(' · '))}</small></div></button>`).join('') : `<p class="cr-dim">상대 ${UI.esc(actT.short)} 차례입니다…</p>`}</div>
              </div>
              <div class="dr-lock">
                ${mine && step[1] === 'pick' && this.sel ? `<div class="seg dr-role">${this.openRoles(S, S.us).map(r => `<button class="${(this.selRole || this.openRoles(S, S.us).find(x => this.fits(this.sel, x))) === r ? 'on' : ''}" data-r="${r}">${G.pos(r)} ${UI.esc((ourLine[G.ROLES.indexOf(r)] || { name: '공석' }).name)}</button>`).join('')}</div>` : ''}
                <button class="btn-primary dr-lockin" ${mine && this.sel ? '' : 'disabled'}>${step[1] === 'ban' ? '밴 확정' : '선택 확정'}</button>
                <div class="dr-tools"><button class="btn-ghost dr-timer-t">${this.timerOn ? '타이머 끄기' : '타이머 켜기'}</button><button class="btn-ghost dr-quit">밴픽 그만두기</button></div>
              </div>
            </div>
          </div>
          <div class="dr-col">${[0, 1, 2, 3, 4].map(i => this.slot(S, 'R', i)).join('')}</div>
        </div>
      </div>`;
    this.drawGrid(S, taken, ourLine);
    this.fit(el); $('.dr-grid', el).scrollTop = keep;
    $('.dr-rf', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.roleF = b.dataset.r; this.board(el, S); };
    $('.dr-q', el).oninput = e => { this.q = e.target.value; this.drawGrid(S, taken, ourLine); };
    $('.dr-grid', el).onclick = e => { const b = e.target.closest('[data-c]'); if (!b || !mine || b.classList.contains('off')) return; this.sel = b.dataset.c; this.selRole = null; this.reboard(el, S); };
    $('.dr-sugs', el).onclick = e => { const b = e.target.closest('[data-c]'); if (!b || !mine) return; this.sel = b.dataset.c; this.selRole = b.dataset.role || null; this.reboard(el, S); };
    const rb = $('.dr-role', el); if (rb) rb.onclick = e => { const b = e.target.closest('button'); if (!b) return; this.selRole = b.dataset.r; this.reboard(el, S); };
    $('.dr-lockin', el).onclick = () => { if (!mine || !this.sel) return; this.act(S, this.sel, this.selRole); this.next(el, S); };
    $('.dr-timer-t', el).onclick = () => { this.timerOn = !this.timerOn; this.left = this.TIME; this.board(el, S); };
    $('.dr-quit', el).onclick = () => { if (!confirm('진행 중인 밴픽을 그만둘까요?')) return; clearInterval(this._tick); clearTimeout(this._ai); App.state.draft = null; this.render(el); };
    this.drive(el, S);
  },
  // 보드 높이를 화면에 맞춘다 (태블릿에서도 확정 버튼이 항상 보이게)
  fit(el) { const b = el.querySelector('.dr-board'); if (b) b.style.height = Math.max(400, window.innerHeight - b.getBoundingClientRect().top - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--footer-h')) || 34) - 4) + 'px'; },
  // 챔피언을 고르는 동안에는 타이머·상대 차례 예약을 건드리지 않고 화면만 다시 그린다
  reboard(el, S) { const t = this._tick, a = this._ai, left = this.left; this._noDrive = true; this.board(el, S); this._noDrive = false; this._tick = t; this._ai = a; this.left = left; const tm = $('.dr-timer', el); if (tm && this.timerOn) tm.textContent = left; },
  drawGrid(S, taken, ourLine) {
    const q = this.q.trim().toLowerCase(), mine = this.ourTurn(S), pick = this.ORDER[S.step][1] === 'pick';
    const open = this.openRoles(S, S.us);
    const list = Champions.list.filter(c => (this.roleF === 'ALL' || (c.positions || []).includes(this.roleF)) && (!q || c.name.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    $('.dr-grid', this.el).innerHTML = list.map(c => {
      const off = taken.has(c.id), fl = (S.fearless || []).includes(c.id);
      // 우리 선수 숙련 표시: 픽 차례면 남은 포지션 선수 중 최고
      let best = null;
      if (pick && !off) open.filter(r => this.fits(c.id, r)).forEach(r => { const m = this.mast(ourLine[G.ROLES.indexOf(r)], c.id); if (!best || m.m > best.m) best = m; });
      return `<button class="dr-c ${off ? 'off' : ''} ${fl ? 'fl' : ''} ${this.sel === c.id ? 'sel' : ''} ${mine ? '' : 'wait'}" data-c="${c.id}" title="${UI.esc(c.name)} · ${this.tier(c.id)}티어">
        <img src="${c.icon}" alt="" loading="lazy">${best && best.m >= 9 ? `<i class="dr-m ${best.sig ? 'sig' : ''}">${best.sig ? 'SIG' : best.m}</i>` : ''}${this.tier(c.id) === 'S' && !off ? '<i class="dr-t">S</i>' : ''}<span>${UI.esc(c.name)}</span></button>`;
    }).join('');
  },
  // 다음 차례: 상대(또는 위임한 우리 코치)는 잠깐 고민하는 척하고 고른다. 우리 차례면 타이머
  drive(el, S) {
    if (this._noDrive) return;
    clearInterval(this._tick); clearTimeout(this._ai);
    if (S.done) return;
    if (!this.ourTurn(S)) { this._ai = setTimeout(() => { if (this.st() !== S || !document.body.contains(el)) return; this.aiAct(S); this.next(el, S); }, S.mode === 'delegate' ? 700 : 1100); return; }
    if (!this.timerOn) return;
    this._tick = setInterval(() => {
      if (this.st() !== S || !document.body.contains(el)) { clearInterval(this._tick); return; }
      this.left--; const tm = $('.dr-timer', el); if (tm) tm.textContent = this.left;
      if (this.left <= 0) { clearInterval(this._tick); const top = this.suggest(S, S.us, 1)[0]; this.act(S, this.sel || top.c, this.sel ? this.selRole : top.role); UI.toast('시간 초과: 선택된 챔피언(없으면 코치 1순위)으로 확정했습니다'); this.next(el, S); }
    }, 1000);
  },
  next(el, S) { if (S.done) this.tacticsView(el, S); else this.board(el, S); },

  // ---------- 전술 화면 ----------
  bars(S, k) {
    const c = Style.comp(S.picks[k].map(x => x.c));
    return `<div class="dr-dims">${Object.entries(Style.DIMS).map(([d, l]) => `<div class="dr-dim"><span>${l}</span><div class="dr-dbar"><i style="width:${Math.round(c[d] * 100)}%"></i></div></div>`).join('')}
      <div class="dr-dim"><span>딜 구성</span><div class="dr-mix"><i class="ad" style="width:${Math.round((1 - c.ap) * 100)}%">AD</i><i class="ap" style="width:${Math.round(c.ap * 100)}%">AP</i></div></div>
      <div class="dr-dim"><span>앞라인</span><b>${c.front}명</b></div></div>`;
  },
  tacticsView(el, S) {
    clearInterval(this._tick); clearTimeout(this._ai);
    const us = S.us, opp = us === 'B' ? 'R' : 'B', T = S.tactics[us], my = this.side(S, us), ot = this.side(S, opp);
    const tf = this.teamFits(S, us), total = this.fitTotal(S, us), ready = S.phase === 'ready';
    const played = (S.series.games.find(x => x.game === S.game) || {}).result || null;
    const champRow = k => `<div class="dr-picks-row">${S.picks[k].slice().sort((a, b) => G.ROLES.indexOf(a.role) - G.ROLES.indexOf(b.role)).map(x => `<div class="dr-pk">${SoloQ.ic(x.c)}<small>${G.pos(x.role)}</small></div>`).join('')}<span class="dr-bn">${S.bans[k].map(c => SoloQ.ic(c, 'ban')).join('')}</span></div>`;
    const tag = v => v >= 70 ? 'good' : v >= 45 ? 'mid' : 'bad';
    el.innerHTML = `
      <div class="cr-page dr-tac">
        ${Career.head(`전술 채택 <small>${S.series.bo > 1 ? `Bo${S.series.bo} · ${S.game}세트 · 매치 스코어 ${UI.esc(my.short)} ${Season.seriesScore(S.series)[my.id] || 0} : ${Season.seriesScore(S.series)[ot.id] || 0} ${UI.esc(ot.short)}` : '단판'}</small>`, played ? `${S.game}세트는 ${UI.esc(Schedule.team(played.win).short)} 승리로 끝났습니다 (${Sim.clock(played.t)} · 킬 ${played.kills.B}:${played.kills.R}).` : `밴픽이 끝났습니다. 조합에 맞는 전술을 고를수록 적합도가 높아집니다.${S.mode === 'delegate' ? ' 코치가 추천대로 채워 두었습니다. 바꿔도 됩니다.' : ''}`)}
        <div class="dr-tac-top">
          <div class="card"><div class="card-head"><h3>${G.team(my, 'xs')} ${UI.esc(my.short)} 조합 <small>우리 팀</small></h3></div>${champRow(us)}${this.bars(S, us)}</div>
          <div class="card dr-total"><span>전술 적합도</span><b class="${total == null ? '' : tag(total)}">${total == null ? '-' : total}</b><small>${total == null ? '전술을 고르면 계산됩니다' : total >= 70 ? '조합과 잘 맞습니다' : total >= 45 ? '무난합니다' : '조합과 어긋납니다'}</small>
            ${ready ? '<em class="dr-saved">전술 확정됨</em>' : ''}</div>
          <div class="card"><div class="card-head"><h3>${G.team(ot, 'xs')} ${UI.esc(ot.short)} 조합 <small>상대</small></h3></div>${champRow(opp)}${this.bars(S, opp)}</div>
        </div>
        <div class="card"><div class="card-head"><h3>팀 전술</h3><small class="cr-dim">★ 코치 추천</small></div>
          <div class="dr-tt">${Object.entries(this.TEAM_TAC).map(([id, x]) => `<button class="dr-opt ${T.team === id ? 'on' : ''}" data-team="${id}" ${ready ? 'disabled' : ''}><b>${x.n}${S.rec.team === id ? ' <i class="dr-star">★</i>' : ''}</b><small>${x.d}</small><span class="dr-fit ${tag(tf[id])}"><i style="width:${tf[id]}%"></i></span><em>${tf[id]}%</em></button>`).join('')}</div>
        </div>
        <div class="card"><div class="card-head"><h3>포지션별 전술</h3></div>
          <div class="dr-rt">${G.ROLES.map(r => { const x = S.picks[us].find(y => y.role === r), p = x && Player.find(x.pid)?.p, fits = this.roleFits(S, us, r); return `
            <div class="dr-rt-row"><div class="dr-rt-who">${x ? SoloQ.ic(x.c) : ''}<div>${G.pos(r)} <b>${p ? UI.esc(p.name) : '공석'}</b><small>${x ? UI.esc(Champions.byId[x.c].name) : ''}</small></div></div>
              <div class="dr-rt-opts">${this.ROLE_TAC[r].map(([id, n]) => `<button class="dr-opt sm ${T.roles[r] === id ? 'on' : ''}" data-role="${r}" data-v="${id}" ${ready ? 'disabled' : ''}><b>${n}${S.rec.roles[r] === id ? ' <i class="dr-star">★</i>' : ''}</b><span class="dr-fit ${tag(fits[id])}"><i style="width:${fits[id]}%"></i></span><em>${fits[id]}%</em></button>`).join('')}</div></div>`; }).join('')}</div>
        </div>
        <div class="dr-tac-foot">
          ${ready ? `<span class="cr-dim">${played ? (Season.seriesOver(S.series) ? '경기가 끝났습니다.' : '다음 세트 밴픽으로 넘어갈 수 있습니다.') : '밴픽·전술이 저장됐습니다. 경기를 시작하면 이 밴픽과 전술로 치릅니다.'}</span>
            ${played ? '' : `<button class="btn-primary dr-watch">${S.game}세트 경기 시작</button>`}
            ${(S.series.games.find(x => x.game === S.game) || {}).result && !Season.seriesOver(S.series) ? `<button class="btn-ghost dr-nextgame">${S.game + 1}세트 밴픽 (피어리스)</button>` : ''}
            <button class="btn-ghost dr-done">밴픽 마치기</button>`
          : `<button class="btn-ghost dr-rec">코치 추천대로</button><button class="btn-primary dr-ok">전술 확정 · 경기 시작 ▶</button>`}
        </div>
      </div>`;
    el.querySelector('.dr-tac').onclick = e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.team) T.team = b.dataset.team;
      else if (b.dataset.role) T.roles[b.dataset.role] = b.dataset.v;
      else if (b.classList.contains('dr-rec')) { T.team = S.rec.team; T.roles = { ...S.rec.roles }; }
      else if (b.classList.contains('dr-watch')) return Live.start(S);
      else if (b.classList.contains('dr-ok')) { if (!this.confirm(S)) return; return Live.start(S); }
      else if (b.classList.contains('dr-nextgame')) {
        this.start({ opp: ot.id, side: played && played.win === my.id ? 'R' : 'B', mode: S.mode, bo: S.series.bo, key: S.official ? S.series.key : null, continueSeries: true });   // 진 팀이 블루
        return this.render(el);
      } else if (b.classList.contains('dr-done')) { App.state.draft = null; return this.render(el); }
      else return;
      this.tacticsView(el, S);
    };
  },
};

Views['match-draft'] = el => Draft.render(el);

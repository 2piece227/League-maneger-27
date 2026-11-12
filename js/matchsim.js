// 경기 엔진 (임시) + 옵저버 중계 화면
// 10초 단위로 경기를 시뮬레이션한다. 선수 OVR · 챔피언 숙련 · 메타 · 조합 성향(시간대별) · 전술 적합도 · 코치 역량 · 골드 차이가
// 교전 승률을 정하고, 라인전 → 오브젝트 → 한타 → 넥서스 순으로 진행된다. 결과는 밴픽 계획(App.state.plans)에 함께 저장한다.
// TODO: 정식 엔진 — 아이템·스킬·라인 매치업·특성·컨디션 반영

const Sim = {
  // ---------- 맵 좌표 (0~100, 블루 = 왼쪽 아래) ----------
  FOUNTAIN: { B: [4, 96], R: [96, 4] },
  PIT: { drag: [67, 69], baron: [33, 31], grubs: [33, 31], herald: [33, 31] },
  // 라인 경로: s=0 블루 기지 → s=1 레드 기지
  lane(l, s) {
    const P = { top: [[11, 86], [9, 9], [86, 11]], mid: [[14, 86], [86, 14]], bot: [[14, 91], [91, 91], [89, 14]] }[l];
    const seg = P.length - 1, x = Math.min(.999, Math.max(0, s)) * seg, i = Math.floor(x), f = x - i;
    return [P[i][0] + (P[i + 1][0] - P[i][0]) * f, P[i][1] + (P[i + 1][1] - P[i][1]) * f];
  },
  // 포탑 위치 (라인 s 값): 외곽 · 내부 · 억제기 포탑
  TOWER_S: [.3, .2, .12],
  CAMPS: [[22, 56], [28, 46], [47, 66], [52, 79], [24, 66], [40, 58]],
  LANE_OF: { TOP: 'top', MID: 'mid', BOT: 'bot', SUP: 'bot' },
  DRAGONS: [['화염', '🔥'], ['바다', '🌊'], ['바람', '🌪'], ['대지', '⛰'], ['마법공학', '⚡'], ['화학공학', '☣']],

  rng(seed) { let h = 1779033703 ^ seed.length; for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; },

  // ---------- 준비 ----------
  create(S, gameNo) {
    const r = this.rng(S.id + ':sim'), g = { t: 0, r, S, over: null, feed: [], comm: [], ev: [], kills: [] };
    g.side = {};
    ['B', 'R'].forEach(k => {
      const t = Draft.side(S, k), co = Draft.coach(t);
      g.side[k] = { k, t, coach: co.r, kills: 0, towers: { top: 3, mid: 3, bot: 3 }, inhib: { top: 1, mid: 1, bot: 1 }, nexusT: 2, drag: [], grubs: 0, herald: 0, baron: 0, baronUntil: 0, fit: Draft.fitTotal(S, k) || 50, form: (r() - .5) * 7,   // 그날 컨디션 (임시: 컨디션 시스템 연결 전)
 tac: (S.tactics[k] || {}).team || 'bal', comp: Style.comp(S.picks[k].map(x => x.c)) };
    });
    g.pl = [];
    ['B', 'R'].forEach(k => S.picks[k].slice().sort((a, b) => G.ROLES.indexOf(a.role) - G.ROLES.indexOf(b.role)).forEach(x => {
      const hit = x.pid && Player.find(x.pid), p = hit ? hit.p : { id: 'x' + x.role, name: '공석', ovr: 55 };
      const ms = Draft.mast(p, x.c);
      g.pl.push({ side: k, role: x.role, c: x.c, p, name: p.name, ovr: p.ovr || 60, m: ms.m, sig: ms.sig, meta: Draft.meta(x.c), st: Style.of(x.c),
        k: 0, d: 0, a: 0, cs: 0, gold: 500, lvl: 1, hp: 1, dead: 0, pos: [...this.FOUNTAIN[k]], tac: ((S.tactics[k] || {}).roles || {})[x.role] });
    }));
    g.next = { drag: 300, grubs: 360, herald: 900, baron: 1200 };
    g.focus = null;
    this.say(g, 'cast', `${g.side.B.t.name}와 ${g.side.R.t.name}의 ${gameNo ? gameNo + '세트' : '경기'}, 지금 시작합니다!`);
    this.say(g, 'anal', `${g.side.B.t.short}는 ${Draft.TEAM_TAC[g.side.B.tac].n}, ${g.side.R.t.short}는 ${Draft.TEAM_TAC[g.side.R.tac].n} 전술을 들고 나왔습니다. 조합을 보면 ${this.compTalk(g)}`);
    return g;
  },
  compTalk(g) {
    const b = g.side.B.comp, r = g.side.R.comp;
    if (b.early - r.early > .12) return `${g.side.B.t.short}가 초반에 훨씬 강한 그림이에요.`;
    if (r.early - b.early > .12) return `${g.side.R.t.short}가 초반 주도권을 잡을 수 있는 조합입니다.`;
    if (b.late - r.late > .12) return `${g.side.B.t.short}는 후반으로 갈수록 좋아지는 조합이죠.`;
    if (r.late - b.late > .12) return `${g.side.R.t.short}는 시간을 끌면 유리한 조합이에요.`;
    return '양 팀 모두 균형 잡힌 조합이라 운영 싸움이 될 것 같습니다.';
  },
  min: g => g.t / 60,
  alive(g, k) { return g.pl.filter(p => p.side === k && !p.dead); },
  gold(g, k) { return g.pl.filter(p => p.side === k).reduce((a, p) => a + p.gold, 0); },
  other: k => k === 'B' ? 'R' : 'B',
  // 선수 전투력: OVR + 숙련 + 메타 + 레벨
  ppow(p) { return p.ovr * .6 + p.m * .4 + (p.sig ? 2 : 0) + p.meta * 3 + p.lvl * .2 + Math.min(2.5, p.k * .15) - Math.min(2, p.d * .1); },
  // 팀 전투력: 살아 있는 선수 + 시간대별 조합 성향 + 전술 + 코치 + 골드 + 버프
  tpow(g, k, who) {
    const s = g.side[k], ps = (who || g.pl.filter(p => p.side === k && !p.dead)), m = this.min(g), c = s.comp;
    if (!ps.length) return 0;
    let v = ps.reduce((a, p) => a + this.ppow(p), 0) / ps.length + (ps.length - 5) * 3 + s.form;
    const phase = m < 14 ? (c.early - .4) * 14 : m < 26 ? ((c.fight + c.engage) / 2 - .4) * 12 : (c.late - .4) * 14;
    v += phase;
    const tacPhase = { early: m < 15, snow: m < 22, fight: m >= 12 && m < 30, late: m >= 25, bal: true }[s.tac];
    v += (s.fit - 50) / 50 * (tacPhase ? 4 : 1.5);
    v += (s.coach - 10) * .15;
    v += Math.max(-5, Math.min(5, (this.gold(g, k) - this.gold(g, this.other(k))) / 1000 * .55));
    if (s.baronUntil > g.t) v += 6;
    if (s.drag.length >= 4) v += 4;
    return v;
  },
  win(g, kA, a, b) { const d = this.tpow(g, kA, a) - this.tpow(g, this.other(kA), b); return g.r() < 1 / (1 + Math.exp(-d / 13)); },

  // ---------- 해설 ----------
  CAST: { cast: '캐스터', anal: '해설' },
  say(g, who, text) { g.comm.push({ t: g.t, who, text }); },
  clock: t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`,
  pickLine(g, arr) { return arr[Math.floor(g.r() * arr.length)]; },

  // ---------- 처치 ----------
  kill(g, killer, victim, assists = []) {
    if (victim.dead) return;
    const first = !g.kills.length;
    victim.dead = g.t + Math.round(8 + this.min(g) * 1.3); victim.d++; victim.hp = 0;
    killer.k++; killer.gold += 300 + Math.min(700, Math.max(0, victim.k - victim.d) * 100) + (first ? 100 : 0);
    assists.filter(a => a !== killer && !a.dead).forEach(a => { a.a++; a.gold += 120; });
    g.side[killer.side].kills++;
    g.kills.push({ t: g.t, k: killer, v: victim });
    g.feed.push({ t: g.t, killer, victim, first });
    if (first) this.say(g, 'cast', `퍼스트 블러드! ${g.side[killer.side].t.short} ${killer.name}, ${Champions.byId[killer.c].name}로 ${victim.name}를 잡아냅니다!`);
  },
  pickKiller(g, ps) {
    const w = ps.map(p => ({ p, w: ({ MID: 1.3, BOT: 1.5, JGL: 1.1, TOP: 1, SUP: .35 }[p.role]) * (1 + p.st.pick * .5 + p.st.early * .2) }));
    let x = g.r() * w.reduce((a, o) => a + o.w, 0);
    for (const o of w) { x -= o.w; if (x <= 0) return o.p; }
    return w[0].p;
  },
  // 교전: 참가 인원 · 결과 · 처치 수
  fight(g, kind, at, nB, nR) {
    const pickN = (k, n) => this.alive(g, k).sort((a, b) => this.dist(a.pos, at) - this.dist(b.pos, at)).slice(0, n);
    const A = pickN('B', nB), Bp = pickN('R', nR);
    if (!A.length || !Bp.length) return null;
    [...A, ...Bp].forEach(p => { p.pos = [at[0] + (g.r() - .5) * 8, at[1] + (g.r() - .5) * 8]; });
    const bWin = this.win(g, 'B', A, Bp), W = bWin ? A : Bp, L = bWin ? Bp : A, wk = bWin ? 'B' : 'R';
    const big = A.length + Bp.length >= 7;
    const nK = Math.min(L.length, big ? 1 + Math.floor(g.r() * g.r() * (L.length + .5)) : g.r() < .8 ? 1 : 2);
    const nT = big ? Math.floor(g.r() * Math.min(W.length, 2.4)) : g.r() < .25 ? 1 : 0;
    const vict = L.slice().sort(() => g.r() - .5).slice(0, nK), trade = W.slice().sort(() => g.r() - .5).slice(0, nT);
    vict.forEach(v => this.kill(g, this.pickKiller(g, W.filter(p => !p.dead)) || W[0], v, W));
    trade.forEach(v => { const ks = L.filter(p => !p.dead); if (ks.length) this.kill(g, this.pickKiller(g, ks), v, ks); });
    W.forEach(p => { p.hp = .3 + g.r() * .6; }); L.forEach(p => { if (!p.dead) p.hp = .1 + g.r() * .4; });
    const ace = this.alive(g, this.other(wk)).length === 0;
    return { wk, bWin, n: vict.length, t: trade.length, ace, big, W, L };
  },
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),

  // ---------- 진행 ----------
  step(g) {
    if (g.over) return;
    g.t += 10;
    const m = this.min(g);
    // 성장
    g.pl.forEach(p => {
      if (p.dead && g.t >= p.dead) { p.dead = 0; p.hp = 1; p.pos = [...this.FOUNTAIN[p.side]]; }
      if (p.dead) return;
      const cs = { TOP: 1.45, MID: 1.5, BOT: 1.6, JGL: 1.05, SUP: .18 }[p.role] * (p.tac === 'farm' || p.tac === 'safe' || p.tac === 'hold' ? 1.08 : 1) * (.85 + g.r() * .3);
      p.cs += cs; p.gold += 20 + cs * 21;
      p.lvl = Math.min(18, Math.floor(1 + m * (p.role === 'SUP' ? .48 : .6) + p.k * .12 + p.a * .04));
      p.hp = Math.min(1, p.hp + .08);
    });
    // 오브젝트 준비: 30초 전부터 그쪽으로 모인다
    const objs = [['drag', g.next.drag], ['grubs', g.next.grubs], ['herald', g.next.herald], ['baron', g.next.baron]].filter(([, at]) => at && g.t >= at - 30 && g.t <= at + 30);
    g.focus = objs.length ? objs[0][0] : null;
    const objNow = objs.find(([, at]) => g.t >= at);
    if (objNow) this.objective(g, objNow[0]);
    else if (!g.focus) this.random(g, m);
    // 운영 압박: 바론 버프나 큰 골드 차이가 있으면 계속 포탑을 민다
    if (!g.over && m >= 20) ['B', 'R'].forEach(k => { const lead = this.gold(g, k) - this.gold(g, this.other(k)); if ((g.side[k].baronUntil > g.t || lead > 6000) && g.r() < .12) this.push(g, k, false); });
    this.move(g);
    this.filler(g, m);
    if (m >= 55) this.endGame(g, this.gold(g, 'B') >= this.gold(g, 'R') ? 'B' : 'R');
  },
  objective(g, o) {
    const at = this.PIT[o], name = { drag: '드래곤', grubs: '공허 유충', herald: '전령', baron: '바론' }[o];
    const contest = g.r() < (o === 'baron' ? .75 : .5);
    let wk;
    if (contest) {
      const f = this.fight(g, o, at, o === 'grubs' ? 3 : 5, o === 'grubs' ? 3 : 5);
      wk = f ? f.wk : 'B';
      if (f && f.n) this.say(g, 'cast', `${name} 앞 한타! ${g.side[f.wk].t.short}가 ${f.n}킬을 따내며 ${name}까지 가져갑니다!${f.ace ? ' 에이스!' : ''}`);
      if (f && f.ace) this.push(g, f.wk, true);
    } else {
      wk = this.win(g, 'B') ? 'B' : 'R';
      this.say(g, 'anal', `${g.side[this.other(wk)].t.short}가 시야를 못 잡았어요. ${g.side[wk].t.short}가 ${name}를 조용히 챙깁니다.`);
    }
    const s = g.side[wk];
    if (o === 'drag') {
      const d = this.DRAGONS[Math.floor(g.r() * this.DRAGONS.length)]; s.drag.push(d);
      g.ev.push({ t: g.t, side: wk, ic: d[1], txt: `${d[0]} 드래곤` });
      if (s.drag.length === 4) this.say(g, 'cast', `${s.t.short}, 드래곤 영혼 획득! 한타 주도권이 넘어갑니다!`);
      g.next.drag = s.drag.length >= 4 || g.side[this.other(wk)].drag.length >= 4 ? (g.next.drag = g.t + 360) : g.t + 300;
    } else if (o === 'grubs') { s.grubs++; g.ev.push({ t: g.t, side: wk, ic: '🐛', txt: '공허 유충' }); g.next.grubs = 0; }
    else if (o === 'herald') { s.herald++; g.ev.push({ t: g.t, side: wk, ic: '🦀', txt: '전령' }); g.next.herald = 0; this.towerDown(g, wk, ['top', 'mid', 'bot'][Math.floor(g.r() * 3)]); }
    else { s.baron++; s.baronUntil = g.t + 180; g.ev.push({ t: g.t, side: wk, ic: '👾', txt: '바론' }); g.next.baron = g.t + 360; this.say(g, 'anal', `바론 버프를 두른 ${s.t.short}, 이제 공성을 시작합니다.`); }
  },
  random(g, m) {
    const r = g.r();
    if (m < 14) {
      if (r < .035) {   // 갱킹
        const k = this.gankSide(g), jg = this.alive(g, k).find(p => p.role === 'JGL');
        if (!jg) return;
        const lane = ['top', 'mid', 'bot'][Math.floor(g.r() * 3)], at = this.lane(lane, .5);
        const f = this.fight(g, 'gank', at, lane === 'bot' ? 3 : 2, lane === 'bot' ? 2 : 1);
        if (f && f.n) this.say(g, f.wk === k ? 'cast' : 'anal', f.wk === k ? `${jg.name}의 갱킹! ${lane === 'top' ? '탑' : lane === 'mid' ? '미드' : '바텀'}에서 킬이 나옵니다!` : `갱킹을 받아쳤어요! ${g.side[f.wk].t.short}의 대응이 좋습니다.`);
      } else if (r < .05) {   // 솔로킬
        const role = ['TOP', 'MID', 'BOT'][Math.floor(g.r() * 3)];
        const a = this.alive(g, 'B').find(p => p.role === role), b = this.alive(g, 'R').find(p => p.role === role);
        if (!a || !b) return;
        const press = (a.tac === 'press' ? 3 : 0) - (b.tac === 'press' ? 3 : 0);
        const bWin = g.r() < 1 / (1 + Math.exp(-((this.ppow(a) - this.ppow(b)) + press) / 9));
        const [w, l] = bWin ? [a, b] : [b, a];
        if (g.r() < .6) { const at = this.lane(this.LANE_OF[role], .5); w.pos = [...at]; l.pos = [...at]; this.kill(g, w, l); this.say(g, 'cast', this.pickLine(g, [`${w.name}, 솔로킬! ${Champions.byId[w.c].name} 라인전에서 압도합니다!`, `${l.name}가 잘렸어요! ${w.name}의 피지컬!`, `${w.name}, 1대1에서 이겨냅니다!`])); }
      }
      if (m >= 11 && g.r() < .05) this.siege(g);
    } else {
      const fightP = m < 25 ? .025 : m < 35 ? .035 : .05;
      if (r < fightP) {
        const lane = ['top', 'mid', 'bot', 'mid'][Math.floor(g.r() * 4)], at = this.lane(lane, .45 + g.r() * .1);
        const big = g.r() < (m < 25 ? .45 : .7);
        const f = this.fight(g, 'fight', at, big ? 5 : 2 + Math.floor(g.r() * 2), big ? 5 : 2 + Math.floor(g.r() * 2));
        if (f && (f.n || f.t)) {
          const ws = g.side[f.wk].t.short;
          this.say(g, 'cast', f.ace ? `에이스! ${ws}가 전멸시킵니다!` : big ? this.pickLine(g, [`한타 열립니다! ${ws}가 ${f.n}킬을 가져가요!`, `대규모 교전! ${ws} 쪽으로 기웁니다, ${f.n} 대 ${f.t}!`]) : `${lane === 'top' ? '탑' : lane === 'mid' ? '미드' : '바텀'} 쪽 교전, ${ws}가 이득을 봅니다.`);
          if (f.ace || (big && f.n - f.t >= 2)) this.push(g, f.wk, f.ace || (m >= 30 && f.n - f.t >= 3));
        }
      } else if (r < fightP + (m < 20 ? .05 : .09)) this.siege(g);
    }
  },
  gankSide(g) {
    const sc = k => { const s = g.side[k], jg = g.pl.find(p => p.side === k && p.role === 'JGL'); return (jg ? jg.st.early + jg.st.pick * .5 : .5) + (jg && jg.tac === 'gank' ? .4 : 0) + (s.tac === 'early' ? .3 : 0); };
    return g.r() < sc('B') / (sc('B') + sc('R')) ? 'B' : 'R';
  },
  // 포탑 공략: 골드·전투력이 앞선 쪽이 밀 확률이 높다
  siege(g) {
    const k = this.win(g, 'B') ? 'B' : 'R', o = this.other(k), lane = ['top', 'mid', 'bot'][Math.floor(g.r() * 3)];
    if (g.side[o].towers[lane] <= 0 && g.side[o].inhib[lane] <= 0) return;
    const split = this.alive(g, k).find(p => p.role === 'TOP' && p.tac === 'split');
    this.towerDown(g, k, split && g.r() < .5 ? 'top' : lane);
  },
  towerDown(g, k, lane) {
    const o = g.side[this.other(k)], m = this.min(g);
    if (o.towers[lane] > 0) {
      if (o.towers[lane] === 1 && m < 18) return;              // 억제기 포탑은 너무 이르면 안 깨진다
      o.towers[lane]--; g.pl.filter(p => p.side === k && !p.dead).forEach(p => { p.gold += 150; });
      const nm = ['억제기 포탑', '내부 포탑', '외곽 포탑'][o.towers[lane]];
      g.ev.push({ t: g.t, side: k, ic: '🏰', txt: `${lane.toUpperCase()} ${nm}` });
      if (g.r() < .5) this.say(g, 'anal', `${g.side[k].t.short}, ${lane === 'top' ? '탑' : lane === 'mid' ? '미드' : '바텀'} ${nm}을 철거합니다.`);
    } else if (o.inhib[lane] > 0 && m >= 20) {
      o.inhib[lane] = 0; g.ev.push({ t: g.t, side: k, ic: '💠', txt: `${lane.toUpperCase()} 억제기` });
      this.say(g, 'cast', `억제기까지 깨집니다! ${g.side[k].t.short}가 슈퍼 미니언을 앞세웁니다.`);
    }
  },
  // 한타 승리 후 밀어붙이기: 억제기가 깨진 상태에서 에이스면 넥서스
  push(g, k, ace) {
    const o = g.side[this.other(k)], m = this.min(g);
    const lane = ['top', 'mid', 'bot'].sort((a, b) => o.towers[a] - o.towers[b])[0];
    this.towerDown(g, k, lane);
    if (ace && m >= 22 && Object.values(o.inhib).some(v => !v)) {
      if (o.nexusT > 0) { o.nexusT = 0; g.ev.push({ t: g.t, side: k, ic: '🗼', txt: '쌍둥이 포탑' }); }
      if (g.r() < .7) this.endGame(g, k);
    } else if (ace) this.towerDown(g, k, lane);
    else if (m >= 25 && Object.values(o.inhib).some(v => !v) && g.r() < .35) { if (o.nexusT > 0) { o.nexusT = 0; g.ev.push({ t: g.t, side: k, ic: '🗼', txt: '쌍둥이 포탑' }); } else this.endGame(g, k); }
  },
  endGame(g, k) {
    if (g.over) return;
    g.over = { win: k, t: g.t };
    const s = g.side[k];
    this.say(g, 'cast', `넥서스 파괴! ${s.t.name}가 ${this.clock(g.t)}에 승리합니다!`);
    const mvp = g.pl.filter(p => p.side === k).sort((a, b) => (b.k * 3 + b.a * 1.5 - b.d) - (a.k * 3 + a.a * 1.5 - a.d))[0];
    g.over.mvp = mvp;
    this.say(g, 'anal', `오늘의 POG는 ${mvp.name}, ${Champions.byId[mvp.c].name}로 ${mvp.k}/${mvp.d}/${mvp.a}를 기록했습니다.`);
  },
  // 해설 빈 시간 채우기
  filler(g, m) {
    if (g.t % 90 || g.over) return;
    const dg = this.gold(g, 'B') - this.gold(g, 'R'), lead = dg > 0 ? 'B' : 'R', s = g.side[lead];
    if (Math.abs(dg) > 3000) this.say(g, 'anal', `${s.t.short}가 골드 ${(Math.abs(dg) / 1000).toFixed(1)}K 앞서 있습니다. ${m > 25 ? '이제 굳히기에 들어갈 시간이에요.' : '스노우볼을 굴릴 수 있는 차이죠.'}`);
    else if (m < 10) this.say(g, 'anal', this.pickLine(g, ['라인전 단계, 양 팀 모두 CS를 챙기며 탐색전입니다.', '정글러들의 동선 싸움이 중요한 시간대예요.', `${g.pl.find(p => p.role === 'MID' && p.side === 'B').name}와 ${g.pl.find(p => p.role === 'MID' && p.side === 'R').name}, 미드 주도권 싸움이 팽팽합니다.`]));
    else this.say(g, 'cast', this.pickLine(g, ['아직 승부는 알 수 없습니다!', '시야 싸움이 치열합니다.', '다음 오브젝트를 두고 양 팀이 움직입니다.']));
  },
  // 위치: 라인전엔 라인, 오브젝트 땐 그쪽으로, 죽으면 우물
  move(g) {
    const m = this.min(g);
    g.pl.forEach((p, i) => {
      if (p.dead) { p.pos = [...this.FOUNTAIN[p.side]]; return; }
      let tgt;
      const flip = ([x, y]) => p.side === 'B' ? [x, y] : [100 - x, 100 - y];
      if (g.focus) tgt = [this.PIT[g.focus][0] + (p.side === 'B' ? -5 : 5) + (i % 5 - 2) * 1.5, this.PIT[g.focus][1] + (p.side === 'B' ? 5 : -5) + (i % 3 - 1) * 1.5];
      else if (p.role === 'JGL') tgt = m < 14 ? flip(this.CAMPS[Math.floor(g.t / 40 + i) % this.CAMPS.length]) : this.lane('mid', p.side === 'B' ? .42 : .58);
      else {
        const lane = m < 14 ? this.LANE_OF[p.role] : m < 25 ? (p.role === 'TOP' && p.tac === 'split' ? 'top' : ['mid', 'bot', 'mid', 'top'][Math.floor(g.t / 120 + (p.side === 'B' ? 0 : 1)) % 4]) : (p.role === 'TOP' && p.tac === 'split' ? 'top' : 'mid');
        const front = .5 + (this.gold(g, 'B') - this.gold(g, 'R')) / 40000;
        tgt = this.lane(lane, front + (p.side === 'B' ? -.04 : .04));
        if (p.role === 'SUP' || p.role === 'BOT') tgt = [tgt[0] + (p.role === 'SUP' ? 2 : -1), tgt[1] + (p.role === 'SUP' ? 1.5 : 0)];
      }
      const sp = 12, d = this.dist(p.pos, tgt);
      p.pos = d <= sp ? [tgt[0] + (g.r() - .5) * 2, tgt[1] + (g.r() - .5) * 2] : [p.pos[0] + (tgt[0] - p.pos[0]) / d * sp, p.pos[1] + (tgt[1] - p.pos[1]) / d * sp];
    });
  },
};

// ---------- 중계 화면 ----------
const Live = {
  g: null, speed: 1, timer: null, cam: { B: 0, R: 0 }, lastFeed: 0,
  SPEEDS: [1, 2, 4, 8],
  start(S) { this.g = Sim.create(S, S.game); this.speed = 1; Router.go('match-live'); },
  async render(el) {
    await Promise.all([Portal.ready, Mastery.load(), Champions.load()]);
    clearInterval(this.timer); this.el = el;
    if (!this.g) return this.empty(el);
    const g = this.g, B = g.side.B.t, R = g.side.R.t;
    el.innerHTML = `
      <div class="lv-wrap">
        <div class="lv-bc">
          <div class="lv-top">
            <div class="lv-tm blue">${G.team(B, 'sm')}<b>${UI.esc(B.short)}</b></div>
            <div class="lv-sc">
              <span class="lv-tw b"></span><span class="lv-gd b"></span><b class="lv-k b"></b><i>⚔</i><b class="lv-k r"></b><span class="lv-gd r"></span><span class="lv-tw r"></span>
              <div class="lv-sub"><span class="lv-dr b"></span><em class="lv-clock"></em><span class="lv-dr r"></span></div>
            </div>
            <div class="lv-tm red"><b>${UI.esc(R.short)}</b>${G.team(R, 'sm')}</div>
          </div>
          <div class="lv-mid">
            <div class="lv-side b"></div>
            <div class="lv-map">${this.mapSvg()}<div class="lv-icons"></div><div class="lv-feed"></div><div class="lv-over"></div></div>
            <div class="lv-side r"></div>
          </div>
          <div class="lv-bot">
            <div class="lv-cam b"></div>
            <div class="lv-stats"></div>
            <div class="lv-cam r"></div>
          </div>
        </div>
        <div class="lv-panel">
          <div class="lv-ctrl">
            <button class="btn-ghost lv-pause">일시정지</button>
            <div class="seg lv-speed">${this.SPEEDS.map(s => `<button class="${this.speed === s ? 'on' : ''}" data-s="${s}">${s}x</button>`).join('')}</div>
            <button class="btn-ghost lv-skip">결과로</button>
          </div>
          <div class="lv-evs"></div>
          <div class="lv-comm"></div>
        </div>
      </div>`;
    $('.lv-speed', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.speed = +b.dataset.s; $$('.lv-speed button', el).forEach(x => x.classList.toggle('on', x === b)); this.loop(); };
    $('.lv-pause', el).onclick = e => { if (this.timer) { clearInterval(this.timer); this.timer = null; e.target.textContent = '계속'; } else { e.target.textContent = '일시정지'; this.loop(); } };
    $('.lv-skip', el).onclick = () => { while (!g.over) Sim.step(g); this.draw(); this.finish(); };
    this.draw(); this.loop();
  },
  loop() {
    clearInterval(this.timer);
    if (this.g.over) return;
    this.timer = setInterval(() => {
      if (!document.body.contains(this.el)) { clearInterval(this.timer); return; }
      Sim.step(this.g); this.draw();
      if (this.g.over) { clearInterval(this.timer); this.finish(); }
    }, 1000 / this.speed);
  },
  mapSvg() {
    const tw = [];
    ['top', 'mid', 'bot'].forEach(l => Sim.TOWER_S.forEach((s, i) => {
      const [x, y] = Sim.lane(l, s), [x2, y2] = Sim.lane(l, 1 - s);
      tw.push(`<rect class="tw b" data-tw="B-${l}-${i}" x="${x - 1.3}" y="${y - 1.3}" width="2.6" height="2.6"/>`, `<rect class="tw r" data-tw="R-${l}-${i}" x="${x2 - 1.3}" y="${y2 - 1.3}" width="2.6" height="2.6"/>`);
    }));
    return `<svg class="lv-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs><radialGradient id="lvg" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#1d3326"/><stop offset="1" stop-color="#0e1a14"/></radialGradient></defs>
      <rect width="100" height="100" fill="url(#lvg)"/>
      <path d="M0 26 Q 20 24 33 31 T 50 50 T 67 69 Q 80 76 100 74" fill="none" stroke="#1f4e63" stroke-width="7" opacity=".8"/>
      <g fill="none" stroke="#5b5640" stroke-width="3.2" stroke-linecap="round" opacity=".85">
        <polyline points="11,86 9,9 86,11"/><line x1="14" y1="86" x2="86" y2="14"/><polyline points="14,91 91,91 89,14"/>
      </g>
      <g fill="#14261c" opacity=".9">${[[25, 45], [40, 66], [24, 66], [48, 80], [60, 34], [76, 55], [52, 20], [76, 34]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="4.5" transform="rotate(-35 ${x} ${y})"/>`).join('')}</g>
      <circle cx="${Sim.PIT.baron[0]}" cy="${Sim.PIT.baron[1]}" r="3.4" fill="#2a2140" stroke="#6c4fa8" stroke-width=".5"/>
      <circle cx="${Sim.PIT.drag[0]}" cy="${Sim.PIT.drag[1]}" r="3.4" fill="#3a2418" stroke="#b5603f" stroke-width=".5"/>
      <path d="M0 78 L0 100 L22 100 L22 92 Q 10 90 8 78 Z" fill="#162a4a" stroke="#3b8cff" stroke-width=".6"/>
      <path d="M100 22 L100 0 L78 0 L78 8 Q 90 10 92 22 Z" fill="#4a1620" stroke="#ef4b5f" stroke-width=".6"/>
      <circle class="nx b" cx="9" cy="91" r="2.6"/><circle class="nx r" cx="91" cy="9" r="2.6"/>
      ${tw.join('')}
    </svg>`;
  },
  draw() {
    const g = this.g, el = this.el; if (!el || !document.body.contains(el)) return;
    const gb = Sim.gold(g, 'B'), gr = Sim.gold(g, 'R'), twLeft = k => 11 - Object.values(g.side[k].towers).reduce((a, v) => a + v, 0) - (2 - g.side[k].nexusT);
    $('.lv-k.b', el).textContent = g.side.B.kills; $('.lv-k.r', el).textContent = g.side.R.kills;
    $('.lv-gd.b', el).textContent = (gb / 1000).toFixed(1) + 'K'; $('.lv-gd.r', el).textContent = (gr / 1000).toFixed(1) + 'K';
    $('.lv-tw.b', el).textContent = '🏰 ' + twLeft('R'); $('.lv-tw.r', el).textContent = twLeft('B') + ' 🏰';
    $('.lv-dr.b', el).innerHTML = g.side.B.drag.map(d => `<i title="${d[0]}">${d[1]}</i>`).join('') + (g.side.B.baronUntil > g.t ? '<i class="bn">👾</i>' : '');
    $('.lv-dr.r', el).innerHTML = (g.side.R.baronUntil > g.t ? '<i class="bn">👾</i>' : '') + g.side.R.drag.map(d => `<i title="${d[0]}">${d[1]}</i>`).join('');
    $('.lv-clock', el).textContent = Sim.clock(g.t);
    // 양옆 선수
    // 처음 한 번만 만들고, 이후에는 값만 바꾼다 (아이콘이 부드럽게 움직이도록)
    if (!el.querySelector('.lv-pl')) {
      ['B', 'R'].forEach(k => {
        $('.lv-side.' + k.toLowerCase(), el).innerHTML = g.pl.filter(p => p.side === k).map(p => `
          <div class="lv-pl" data-i="${g.pl.indexOf(p)}">
            <div class="lv-pic">${SoloQ.ic(p.c)}<i></i><em></em></div>
            <div class="lv-pi"><small>${UI.esc(g.side[k].t.short)} ${UI.esc(p.name)}</small><div class="lv-hp"><i></i></div></div>
          </div>`).join('');
      });
      $('.lv-icons', el).innerHTML = g.pl.map((p, i) => `<div class="lv-ic ${p.side === 'B' ? 'b' : 'r'}" data-i="${i}" title="${UI.esc(p.name)}"><img src="${Champions.byId[p.c].icon}" alt=""></div>`).join('');
    }
    $$('.lv-pl', el).forEach(row => { const p = g.pl[row.dataset.i]; row.classList.toggle('dead', !!p.dead); row.querySelector('.lv-pic i').textContent = p.lvl; row.querySelector('.lv-pic em').textContent = p.dead ? Math.max(0, p.dead - g.t) : ''; row.querySelector('.lv-hp i').style.width = Math.round(p.hp * 100) + '%'; });
    $$('.lv-ic', el).forEach(ic => { const p = g.pl[ic.dataset.i]; ic.style.transitionDuration = (0.9 / this.speed) + 's'; ic.style.left = p.pos[0] + '%'; ic.style.top = p.pos[1] + '%'; ic.classList.toggle('dead', !!p.dead); });
    // 포탑
    ['B', 'R'].forEach(k => ['top', 'mid', 'bot'].forEach(l => Sim.TOWER_S.forEach((s, i) => { const r = el.querySelector(`[data-tw="${k}-${l}-${i}"]`); if (r) r.classList.toggle('down', g.side[k].towers[l] <= 2 - i); })));
    // 처치 알림 (3초)
    const f = g.feed[g.feed.length - 1];
    $('.lv-feed', el).innerHTML = f && g.t - f.t <= 20 ? `<div class="lv-kill ${f.killer.side === 'B' ? 'b' : 'r'}">${SoloQ.ic(f.killer.c)}<span><b>${UI.esc(g.side[f.killer.side].t.short)} ${UI.esc(f.killer.name)}</b> ${f.first ? '퍼스트 블러드!' : '처치'} <b>${UI.esc(g.side[f.victim.side].t.short)} ${UI.esc(f.victim.name)}</b></span>${SoloQ.ic(f.victim.c)}</div>` : '';
    // 하단 선수 캠: 최근 처치한 선수, 없으면 번갈아
    ['B', 'R'].forEach(k => {
      const recent = g.feed.slice().reverse().find(x => x.killer.side === k && g.t - x.t <= 40);
      const ps = g.pl.filter(p => p.side === k), p = recent ? recent.killer : ps[Math.floor(g.t / 60 + (k === 'B' ? 0 : 2)) % 5];
      const cam = $('.lv-cam.' + k.toLowerCase(), el);
      if (cam.dataset.pid !== p.p.id) { cam.dataset.pid = p.p.id; cam.innerHTML = `${p.p.photo ? `<img src="${p.p.photo}" alt="">` : `<div class="lv-cam-empty">${UI.esc(p.name[0] || '?')}</div>`}<b>${UI.esc(p.name)}</b>`; }
    });
    // 스탯표
    $('.lv-stats', el).innerHTML = G.ROLES.map(r => { const a = g.pl.find(p => p.side === 'B' && p.role === r), b = g.pl.find(p => p.side === 'R' && p.role === r); return `
      <div class="lv-st">${SoloQ.ic(a.c)}<span class="kda">${a.k}/${a.d}/${a.a}</span><span class="cs">${Math.round(a.cs)}</span><em class="${a.gold >= b.gold ? 'b' : 'r'}">${a.gold >= b.gold ? '◀' : '▶'} ${(Math.abs(a.gold - b.gold) / 1000).toFixed(1)}K</em><span class="cs">${Math.round(b.cs)}</span><span class="kda">${b.k}/${b.d}/${b.a}</span>${SoloQ.ic(b.c)}</div>`; }).join('');
    // 오브젝트 기록 · 해설
    $('.lv-evs', el).innerHTML = g.ev.slice(-8).reverse().map(e => `<div class="lv-ev ${e.side === 'B' ? 'b' : 'r'}"><span>${Sim.clock(e.t)}</span>${e.ic} ${UI.esc(g.side[e.side].t.short)} ${UI.esc(e.txt)}</div>`).join('') || '<p class="cr-dim">오브젝트 기록</p>';
    const comm = $('.lv-comm', el);
    if (comm.dataset.n != g.comm.length) {
      comm.dataset.n = g.comm.length;
      comm.innerHTML = g.comm.slice(-30).map(c => `<div class="lv-line ${c.who}"><span>${Sim.clock(c.t)}</span><b>${Sim.CAST[c.who]}</b><p>${UI.esc(c.text)}</p></div>`).join('');
      comm.scrollTop = comm.scrollHeight;
    }
  },
  finish() {
    const g = this.g, w = g.side[g.over.win], el = this.el, S = g.S;
    const res = { win: w.t.id, t: g.t, kills: { B: g.side.B.kills, R: g.side.R.kills }, gold: { B: Sim.gold(g, 'B'), R: Sim.gold(g, 'R') }, mvp: g.over.mvp.p.id, stats: g.pl.map(p => ({ pid: p.p.id, c: p.c, k: p.k, d: p.d, a: p.a, cs: Math.round(p.cs) })) };
    const game = S.series.games.find(x => x.game === S.game); if (game) game.result = res;
    const plan = (App.state.plans || {})[S.series.key]; if (plan) plan.series = S.series;
    const mine = w.t.id === App.state.teamId;
    $('.lv-over', el).innerHTML = `<div class="lv-res ${mine ? 'win' : 'lose'}"><small>${Sim.clock(g.t)}</small><b>${mine ? 'VICTORY' : 'DEFEAT'}</b><span>${G.team(w.t, 'sm')} ${UI.esc(w.t.name)} 승리 · ${g.side.B.kills} : ${g.side.R.kills}</span>
      <div class="lv-mvp">${SoloQ.ic(g.over.mvp.c)}<div><small>POG</small><b>${UI.esc(g.over.mvp.name)}</b><span>${g.over.mvp.k}/${g.over.mvp.d}/${g.over.mvp.a}</span></div></div>
      <div class="lv-res-btn"><button class="btn-ghost lv-back">밴픽으로</button></div></div>`;
    $('.lv-back', el).onclick = () => Router.go('match-draft');
  },
  empty(el) {
    el.innerHTML = `<div class="cr-page">${Career.head('경기 관전', '밴픽과 전술을 확정하면 경기를 옵저버 화면으로 볼 수 있습니다.')}
      <div class="card fx-empty"><b>관전할 경기가 없습니다</b><span>밴픽 준비에서 밴픽을 마치거나, 코치에게 맡겨 바로 시작할 수 있습니다.</span>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:12px"><a class="btn-ghost" href="#match-draft">밴픽 준비</a><button class="btn-primary lv-quick">빠른 경기 (양 팀 코치 밴픽)</button></div></div></div>`;
    $('.lv-quick', el).onclick = () => {
      const my = Roster.team(), nm = Schedule.next(my.id, Clock.today()), opp = (nm && Schedule.opponent(nm, my.id)) || App.db.teams.find(t => t.league === my.league && t.id !== my.id);
      Draft.start({ opp: opp.id, side: 'B', mode: 'delegate', bo: 1 });
      const S = Draft.st(); while (!S.done) Draft.aiAct(S); Draft.confirm(S);
      this.start(S); this.render(el);
    };
  },
};

Views['match-live'] = el => Live.render(el);

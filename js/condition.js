// 선수 상태: 컨디션(폼) · 팀합 · 언어 소통 · 사기 → 경기 엔진(Sim.create)과 경량 시뮬(Season.power)에 들어간다.
//
// 컨디션: OVR에 더해지는 값. 폭은 꾸준함(숨은 능력치 1~20)에 반비례해 ±5~±7 (주사위 특성은 두 배).
//   시즌이 시작되면 폭 안에서 무작위로 새로 잡고, 공식전 시리즈가 끝날 때마다 오르내린다.
//   연패 중이면 내려갈 확률이 높아지고, 연승 중이면 오르는 폭이 커진다. 조금씩 0 쪽으로 돌아온다.
//   경기에 안 나온 후보 · 2군 선수도 팀 경기 때마다 -2~+2 (0.5 단위).
//   너무 떨어지면(폭의 70% 아래) 선수가 감독에게 면담을 신청한다.
// 팀합: 같이 뛴 기간(두 사람 모두 지금 팀에 있던 기간). 처음 1년은 빠르게, 이후 천천히 오른다. 주전 다섯의 쌍 평균.
// 언어: 리그 언어(LCK 한국어 · LPL 중국어 · LEC/LCS 영어)와 다른 선수는 그 팀에서 1년 미만이면 소통 문제가 크고, 3년이면 없다.
// 사기: 사건(World.morale)의 합. OVR에 아주 조금만 (±1.5까지).
const Cond = {
  st() { const s = (App.state.cond ||= { f: {}, streak: {}, season: null }); return s; },
  ALL() { return [...App.db.teams.flatMap(t => [...t.players, ...(t.cl || [])]), ...((App.db.free && App.db.free.players) || [])].filter(p => p.role !== 'COACH'); },
  consistency(p) { return ((p.attributes || {}).hidden || {}).consistency || 11; },
  // 폭: 꾸준함에 반비례 · 불굴의 방패 0.6배 · 주사위 2배
  amp(p) { return (5 + (20 - this.consistency(p)) / 19 * 2) * (typeof Traits !== 'undefined' && Traits.cfg ? Traits.fx(p.id, 'formAmp', 1) : 1); },
  // 월즈 기간 (월즈의 남자)
  worldsOn() { const d = Clock.today(); return Schedule.events.some(e => /^worlds/.test(e.base) && e.start <= d && d <= e.end); },
  half: v => Math.round(v * 2) / 2,
  // 시즌 시작: 모두 새로 (같은 커리어 · 같은 시즌이면 같은 값)
  ensure() {
    const S = this.st(), Y = Schedule.season();
    if (S.season === Y) return;
    S.season = Y; S.f = {}; S.streak = {};
    this.ALL().forEach(p => { const r = G.rand((App.state.seed || '') + ':cond:' + Y + ':' + p.id, 'c0'); S.f[p.id] = this.half((r * 2 - 1) * this.amp(p)); });
  },
  of(pid) {
    this.ensure();
    if (typeof Traits !== 'undefined' && Traits.cfg && Traits.has(pid, 'worlds') && this.worldsOn()) { const hit = Player.find(pid); if (hit) return this.amp(hit.p); }
    return this.st().f[pid] || 0;
  },
  // 화면용 0~100 · 말
  pct(p) { const a = this.amp(p); return Math.round(50 + this.of(p.id) / a * 45); },
  word(p) { const v = this.of(p.id) / this.amp(p); return v >= .6 ? '최상' : v >= .2 ? '좋음' : v > -.2 ? '보통' : v > -.6 ? '나쁨' : '최악'; },

  // 시리즈가 끝난 뒤: 양 팀 선수 컨디션 변동
  after(m, series) {
    this.ensure();
    const S = this.st(), sc = Season.seriesScore(series);
    [m.t1, m.t2].forEach(tid => {
      const t = Schedule.team(tid); if (!t) return;
      const won = (sc[tid] || 0) > (sc[tid === m.t1 ? m.t2 : m.t1] || 0);
      const st = S.streak[tid] || 0; S.streak[tid] = won ? Math.max(1, st + 1) : Math.min(-1, st - 1);
      const played = new Set(series.games.flatMap(x => x.result && x.result.stats ? x.result.stats.map(s => s[0]) : []));
      const line = Draft.lineup(t).filter(Boolean).map(p => p.id);
      [...t.players, ...(t.cl || [])].forEach(p => {
        if (p.role === 'COACH') return;
        const r = salt => G.rand((App.state.seed || '') + m.id + p.id, salt), a = this.amp(p), cur = S.f[p.id] || 0;
        let d;
        if (played.has(p.id) || (!played.size && line.includes(p.id))) {
          // 주전: 이겼는지 · 연승/연패 흐름 · 강철 멘탈
          const streak = S.streak[tid], iron = typeof Traits !== 'undefined' && Traits.has && Traits.has(p.id, 'iron-mind');
          let up = .5 + (won ? .12 : -.12) + (streak <= -2 ? -.07 * Math.min(4, -streak - 1) : 0) * (iron ? .3 : 1);
          const mag = .5 + Math.floor(r('m') * 5) * .5;                                      // 0.5 ~ 2.5
          d = r('u') < up ? mag * (streak >= 2 ? 1 + .15 * Math.min(4, streak - 1) : 1) : -mag * (iron ? .5 : 1) * (!won && Traits.cfg ? Traits.fx(p.id, 'lossDrop', 1) : 1);
        } else d = (Math.floor(r('s') * 9) - 4) * .5;                                          // 후보 · 2군: -2 ~ +2
        let nf = Math.max(-a, Math.min(a, this.half(cur * .95 + d)));
        // 통치자: 한 번은 바닥(0 아래)으로 떨어지지 않고 버틴다. 다시 폭의 절반 위로 올라오면 재충전
        if (Traits.cfg && Traits.has(p.id, 'ruler')) { const F = (S.floor ||= {}); if (nf < 0 && !F[p.id]) { nf = .5; F[p.id] = 1; } else if (nf >= a * .5) F[p.id] = 0; }
        S.f[p.id] = nf;
        const H = (S.hist ||= {}), h = (H[p.id] ||= []); h.push(nf); if (h.length > 12) h.shift();   // 최근 12경기 컨디션 흐름
      });
    });
    this.counsel();
  },
  // 컨디션이 많이 떨어진 우리 선수: 감독 면담 신청 (30일에 한 번)
  counsel() {
    const t = Roster.team(); if (!t) return;
    t.players.forEach(p => {
      if (p.role === 'COACH' || this.of(p.id) > -.7 * this.amp(p)) return;
      const k = 'counsel:' + p.id + ':' + Clock.today().slice(0, 7);
      if (!Engine.once(k)) return;
      Inbox.push({ from: { name: p.name, role: 'player', photo: p.photo }, subject: `${p.name}, 감독님과 이야기하고 싶다고 합니다`, priority: 'todo', ctx: { pid: p.id, player: p.name },
        body: `감독님, 요즘 제 플레이가 마음에 안 듭니다. 연습 때도 손이 안 따라오고, 경기에서도 자꾸 실수가 나와요.\n\n어떻게 해야 할지 이야기 좀 하고 싶습니다.`,
        choices: [
          { label: '괜찮다고 다독인다', act: 'counsel', arg: 'enc', reply: '선수에게 지금 흐름은 금방 돌아온다고 다독였습니다.' },
          { label: '며칠 쉬게 해 준다', act: 'counsel', arg: 'rest', reply: '선수에게 며칠 머리를 식히라고 했습니다.' },
          { label: '같이 영상을 보며 원인을 찾는다', act: 'counsel', arg: 'review', reply: '선수와 경기 영상을 같이 보며 무엇이 안 되는지 정리했습니다.' },
          { label: '프로답게 이겨내라고 한다', act: 'counsel', arg: 'firm', reply: '선수에게 스스로 이겨내야 한다고 말했습니다.' },
        ] });
    });
  },
  // 면담 결과 (숫자는 보이지 않는다)
  counselAct(pid, how) {
    const hit = Player.find(pid); if (!hit) return;
    const p = hit.p, a = this.amp(p), mor = World.morale(), calm = ((p.attributes || {}).mental || {}).composure || 12, amb = ((p.attributes || {}).hidden || {}).ambition || 11, vet = (p.age || 20) >= 26;
    const gain = { enc: calm <= 11 ? 2.5 : 1.5, rest: 2, review: vet ? 2.5 : 2, firm: amb >= 14 || vet ? 3 : calm <= 9 ? -1 : 1 }[how];
    const S = this.st(); S.f[pid] = Math.max(-a, Math.min(a, this.half((S.f[pid] || 0) + gain)));
    mor[pid] = (mor[pid] || 0) + ({ enc: 1, rest: 1, review: 1, firm: gain > 1 ? 1 : -2 })[how];
  },

  // ---------- 팀합 · 언어 ----------
  together(a, b, date = Clock.today()) {
    const ja = Fame.joined(a), jb = Fame.joined(b); if (!ja || !jb) return 0;
    const from = ja > jb ? ja : jb; return Math.max(0, Fmt.daysBetween(from, date) / 365);
  },
  chemOf(y) { return y <= 1 ? 7 * y : Math.min(12, 7 + 2.5 * (y - 1)); },
  // 팀합 0~12 (주전 다섯의 쌍 평균)
  chem(line) {
    const ps = line.filter(Boolean); if (ps.length < 2) return 0;
    let s = 0, n = 0; ps.forEach((a, i) => ps.slice(i + 1).forEach(b => { s += this.chemOf(this.together(a, b)); n++; }));
    return s / n;
  },
  LEAGUE_LANG: { LCK: 'ko', LPL: 'zh', LEC: 'en', LCS: 'en' },
  langOf(nation) { return nation === 'South Korea' ? 'ko' : ['China', 'Taiwan', 'Hong Kong', 'Macau', 'Macao'].includes(nation) ? 'zh' : 'en'; },
  // 소통 문제 (0 ~ -3): 리그 언어와 다른 주전이 그 팀에서 보낸 기간
  comm(t, line) {
    const L = this.LEAGUE_LANG[t.league]; if (!L) return 0;
    let v = 0;
    line.filter(Boolean).forEach(p => { if (this.langOf(p.nation) === L) return; const j = Fame.joined(p), y = j ? Fmt.daysBetween(j, Clock.today()) / 365 : 0; v -= y < 1 ? 1.5 : y < 2 ? .6 : y < 3 ? .2 : 0; });
    return Math.max(-3, v);
  },
  morale(pid) { const m = (World.morale()[pid] || 0); return Math.max(-1.5, Math.min(1.5, m * .25)); },
  // 엔진에 들어가는 개인 보정 (OVR 단위)
  ovr(p) { return this.parts(p).total; },
  parts(p) { const form = this.of(p.id), morale = this.morale(p.id), rel = typeof Rel !== 'undefined' ? Rel.ovr(p.id) : 0; return { form, morale, rel, total: form + morale + rel }; },
  hist(pid) { return ((this.st().hist || {})[pid] || []); },
  // 팀 보정 (tpow 단위): 팀합 최대 +3, 소통 최대 -3
  team(t, line) { return this.chem(line) * .25 + this.comm(t, line); },
};
Engine.ACTS.counsel = (m, how) => Cond.counselAct(m.ctx.pid, how);

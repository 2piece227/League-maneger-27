/* LM 27 — 시상과 우승
   · 시즌 기록: 공식전 세트마다 선수별 경기 · 승 · POG · 평점 합을 연도 · 리그별로 쌓는다 (Season.rate)
   · 파이널 MVP: 대회 우승이 정해지면 결승 시리즈에서 POG를 가장 많이 받은 우승팀 선수
   · 올프로: LCK 플레이오프(시즌 결승)가 끝나면 (월즈 전) 포지션별 1st · 2nd · 3rd 팀 발표
   · LCK 어워드: 12월 연말 시상식 — 올해의 선수 · 신인상 · 올해의 감독 · 올프로 1st 팀
   · 우리 팀 우승: 축하 화면 (트로피 · 우승 멤버 · 파이널 MVP · 보상) + 상금 · 이사회/팬/미디어 · 감독 평판 · 선수 사기
   · 수상 경력은 선수 프로필에 남고, 재계약 · 영입 때 에이전트가 근거로 삼아 연봉을 더 부른다 */
const Awards = {
  st() { const s = (App.state.aw ||= {}); s.ps ||= {}; s.hon ||= {}; s.fmvp ||= {}; s.allpro ||= {}; s.gala ||= {}; s.cele ||= []; return s; },
  yr(m) { return String(m.event || '').slice(0, 4) || Clock.today().slice(0, 4); },

  // ---------- 시즌 기록 ----------
  add(pid, m, v, won, pog, kda) {
    if (!pid || !m) return;
    (App.state.lp ||= {})[pid] = Clock.today(); App.state.lpAny = Clock.today();   // 최근 공식전 출전 (성장 출전 보너스: js/squad.js playMul)
    const Y = this.yr(m), P = (this.st().ps[Y] ||= {});
    [m.league || 'INTL', 'ALL'].forEach(k => { const r = ((P[k] ||= {})[pid] ||= [0, 0, 0, 0]); r[0]++; r[1] += won ? 1 : 0; r[2] += pog ? 1 : 0; r[3] = Math.round((r[3] + Math.max(3, Math.min(10, v))) * 10) / 10; if (kda) { r[4] = (r[4] || 0) + kda[0]; r[5] = (r[5] || 0) + kda[1]; r[6] = (r[6] || 0) + kda[2]; } });   // 정밀 엔진 경기(우리 팀)도 경량 시뮬과 같은 1~10 척도
  },
  // 커리어 시작 때 이미 1군이던 선수 (신인상 대상이 아니다)
  vets() { const s = this.st(); if (!s.vets && App.db && App.db.teams) s.vets = [...App.db.teams.flatMap(t => t.players.map(p => p.id)), ...((App.db.free || {}).players || []).map(p => p.id)]; /* FA였던 베테랑도 */ return s.vets || []; },
  rookie(pid, Y) {
    if (this.vets().includes(pid)) return false;
    return !Object.entries(this.st().ps).some(([y, P]) => +y < +Y && Object.entries(P).some(([lg, L]) => lg !== 'ALL' && L[pid]));
  },
  // 시즌 점수: 평균 평점 + POG 비율 + 승률 + 기량 조금
  score(r, ovr) { const g = r[0] || 1, kda = r[5] != null ? Math.min(8, ((r[4] || 0) + (r[6] || 0)) / Math.max(1, r[5])) : 3; return r[3] / g + r[2] / g * 1.2 + r[1] / g * .8 + kda * .08 + ((ovr || 75) - 80) * .02; },
  why(pid, Y, lg = 'LCK') { const r = ((this.st().ps[Y] || {})[lg] || {})[pid]; if (!r) return ''; const g = r[0] || 1; return `평점 ${(r[3] / g).toFixed(1)}${r[5] != null ? ` · KDA ${(((r[4] || 0) + (r[6] || 0)) / Math.max(1, r[5])).toFixed(1)}` : ''} · POG ${r[2]}`; },
  ranked(Y, lg, minFrac = .4, hw = 1) {
    const L = (this.st().ps[Y] || {})[lg] || {}, mx = Math.max(0, ...Object.values(L).map(r => r[0]));
    return Object.entries(L).filter(([, r]) => r[0] >= mx * minFrac).map(([pid, r]) => {
      const h = Player.find(pid); if (!h || h.p.role === 'COACH' || !G.ROLES.includes(h.p.role)) return null;
      return { pid, p: h.p, t: h.t, r, s: this.score(r, h.p.ovr) + this.honorPts(pid, Y) * hw };
    }).filter(Boolean).sort((a, b) => b.s - a.s);
  },
  honorPts(pid, Y) { return (this.st().hon[pid] || []).filter(h => h.y === +Y).reduce((s, h) => s + (({ worlds: .6, fmvp: .4, intl: .3, league: .2 })[h.k] || 0), 0); },

  // ---------- 수상 경력 ----------
  give(pid, Y, k, label) { const L = (this.st().hon[pid] ||= []); if (!L.some(h => h.label === label)) L.push({ y: +Y, k, label }); },
  of(pid) { return (this.st().hon[pid] || []).slice().sort((a, b) => b.y - a.y); },
  html(p) {
    const L = this.of(p.id); if (!L.length) return '';
    return `<h4>수상 경력</h4><div class="aw-hon">${L.slice(0, 12).map(h => `<span class="aw-chip ${h.k}">${UI.esc(h.label)}</span>`).join('')}${L.length > 12 ? `<small>외 ${L.length - 12}개</small>` : ''}</div>`;
  },
  // 에이전트가 근거로 삼는 최근 2년 수상 (연봉 요구 배수)
  W: { worlds: .05, intl: .03, league: .02, fmvp: .04, ap1: .04, ap2: .02, ap3: .01, mvp: .05, roty: .03 },
  bump(p) { const Y = +Clock.today().slice(0, 4); return Math.min(.15, this.of(p.id).filter(h => h.y >= Y - 1).reduce((s, h) => s + (this.W[h.k] || 0), 0)); },
  best(p) { const Y = +Clock.today().slice(0, 4), L = this.of(p.id).filter(h => h.y >= Y - 1 && this.W[h.k]); return L.sort((a, b) => this.W[b.k] - this.W[a.k])[0] || null; },

  // ---------- 대회 우승 ----------
  KIND: { worlds: 'worlds', msi: 'intl', 'first-stand': 'intl', ewc: 'intl' },
  PRIZE: { worlds: 15, msi: 4, 'first-stand': 2, ewc: 6, 'lck-po': 3, 'lck-cup': 2, kespa: .5 },
  base(eid) { const e = Schedule.byEvent && Schedule.byEvent[eid]; return e ? e.base : String(eid).split(':')[1] || ''; },
  // 결승 시리즈에서 POG를 가장 많이 받은 우승팀 선수 (같으면 기량)
  finalsMvp(eid, tid) {
    const t = Schedule.team(tid); if (!t) return null;
    const m = Season.evMatches(eid).filter(x => Season.rec(x) && Season.winner(x) === tid).sort((a, b) => b.t.localeCompare(a.t))[0];
    const cnt = {}, pf = {}; ((m && Season.rec(m).games) || []).forEach(g => { if (g.win === tid && g.mvp) cnt[g.mvp] = (cnt[g.mvp] || 0) + 1; (g.s || []).forEach(x => { pf[x[0]] = (pf[x[0]] || 0) + Season.perf(x[2], x[3], x[4]); }); });
    return Draft.lineup(t).filter(Boolean).map(p => ({ p, c: cnt[p.id] || 0, f: pf[p.id] || 0 })).sort((a, b) => b.c - a.c || b.f - a.f || (b.p.ovr || 0) - (a.p.ovr || 0))[0]?.p || null;   // POG 횟수 → 결승 시리즈 활약 점수(평점과 같은 기준) → OVR
  },
  won(eid, tid) {
    const e = Schedule.byEvent && Schedule.byEvent[eid], t = Schedule.team(tid); if (!e || !t) return;
    const Y = eid.slice(0, 4), b = e.base, k = this.KIND[b] || 'league', five = Draft.lineup(t).filter(Boolean);
    five.forEach(p => this.give(p.id, Y, k, `${e.label} 우승`));
    const fm = /rtm|-rf$|playin|ewcq/.test(b) ? null : this.finalsMvp(eid, tid);   // 선발전에는 파이널 MVP가 없다
    if (fm) {
      this.st().fmvp[eid] = fm.id; this.give(fm.id, Y, 'fmvp', `${e.label} 파이널 MVP`);
      Market.post(`[파이널 MVP] ${e.label} — ${fm.name} (${t.short})`, `${e.label} 결승 MVP는 ${t.name}의 ${G.ROLE_KO[fm.role] || ''} ${Sim.josa(fm.name, '이', '가')} 차지했습니다. 결승 무대에서 팀 우승을 이끈 활약이었습니다.`, fm.id);
    }
    if (tid === App.state.teamId && !App.state.unemployed) this.ours(e, t, five, fm);
    if (b === 'lck-po') this.allPro(Y);
  },
  // 우리 팀 우승: 보상 + 축하 화면 예약
  ours(e, t, five, fm) {
    const b = e.base, big = b === 'worlds' ? 3 : this.KIND[b] ? 2 : 1, prize = Math.round((this.PRIZE[b] ?? 1) * 1e8);
    const fx = { board: [5, 7, 10][big - 1], fans: [4, 6, 9][big - 1], media: [2, 3, 5][big - 1], rep: [3, 5, 8][big - 1], moraleAll: big, money: prize };
    const out = World.apply(fx, { ledger: `${e.label} 우승 상금` });
    if (fm && five.includes(fm)) World.apply({ morale: 2 }, { pid: fm.id, player: fm.name });
    if (typeof Rel !== 'undefined') five.forEach(p => Rel.add(p.id, 3, `${e.label} 우승`));
    Inbox.push({ from: { name: '구단 사무국', role: 'board' }, subject: `${e.label} 우승! 우승 보상`, priority: 'urgent', stop: true, link: 'club-finance',
      body: `${e.label} 우승을 축하합니다.${fm ? ` 파이널 MVP는 ${fm.name} 선수입니다.` : ''}\n\n우승 상금 ${Player.money(prize / 1e8)} 원이 구단 수입으로 들어왔습니다.\n${out}` });
    if (fm) Inbox.push({ from: { name: fm.name, role: 'player' }, subject: '파이널 MVP를 받았습니다', body: `감독님, 믿고 기용해 주셔서 감사합니다. 이 상은 팀 모두의 것이라고 생각합니다. 다음 대회도 같이 들어 올리고 싶습니다.` });
    this.st().cele.push({ eid: e.id, tid: t.id, fm: fm && fm.id, five: five.map(p => p.id), prize, out });
    setTimeout(() => this.flush(), 400);
  },

  // ---------- 올프로 (LCK 시즌 결승 직후, 월즈 전) ----------
  allPro(Y) {
    const s = this.st(); if (s.allpro[Y]) return;
    const R = this.ranked(Y, 'LCK'); if (R.length < 15) return;
    const teams = [[], [], []];
    G.ROLES.forEach(role => R.filter(x => x.p.role === role).slice(0, 3).forEach((x, i) => teams[i].push(x.pid)));
    s.allpro[Y] = { teams, date: Clock.today() };
    teams.forEach((ids, i) => ids.forEach(pid => this.give(pid, Y, 'ap' + (i + 1), `${Y} LCK 올프로 ${i + 1}${['st', 'nd', 'rd'][i]} 팀`)));
    const nm = pid => { const h = Player.find(pid); return h ? `${h.p.name}(${h.t.short} · ${this.why(pid, Y)})` : pid; };
    const list = teams.map((ids, i) => `${i + 1}${['st', 'nd', 'rd'][i]} 팀: ${ids.map(nm).join(' · ')}`).join('\n');
    Market.post(`[올프로] ${Y} LCK 올프로 발표 — 1st 팀 ${teams[0].map(id => (Player.find(id) || { p: { name: id } }).p.name).join(' · ')}`, `${Y} 시즌 LCK 올프로가 발표됐습니다. 월드 챔피언십을 앞두고 포지션별로 한 해 최고의 활약을 펼친 선수들입니다.\n\n${list}`, teams[0][0]);
    const mine = teams.flatMap((ids, i) => ids.map(pid => ({ pid, i }))).filter(x => { const h = Player.find(x.pid); return h && h.t.id === App.state.teamId; });
    if (mine.length && !App.state.unemployed) {
      mine.forEach(x => { const h = Player.find(x.pid); World.apply({ morale: 3 - x.i }, { pid: x.pid, player: h.p.name }); });
      Inbox.push({ from: { name: 'LCK 운영사무국', role: 'media' }, subject: `${Y} LCK 올프로 — 우리 팀 ${mine.length}명 선정`, link: 'portal-news',
        body: `${Y} LCK 올프로가 발표됐습니다.\n\n${mine.map(x => `${x.i + 1}${['st', 'nd', 'rd'][x.i]} 팀 · ${(Player.find(x.pid) || { p: {} }).p.name}`).join('\n')}\n\n전체 명단\n${list}` });
    }
  },

  // ---------- 연말 LCK 어워드 (12월) ----------
  GALA: '12-18',
  gala(Y) {
    const s = this.st(); if (s.gala[Y]) return;
    const R = this.ranked(Y, 'LCK'); if (R.length < 15) return;
    const all = this.ranked(Y, 'ALL', .3, 2.5)   // 올해의 선수는 한 해 성적 + 우승 · 파이널 MVP를 크게 본다
     .filter(x => (s.ps[Y].LCK || {})[x.pid]);
    const poy = (all[0] || R[0]).pid, roty = (R.find(x => this.rookie(x.pid, Y)) || {}).pid || null;
    // 올해의 감독: 우승 점수 + 승률이 가장 높은 LCK 팀
    const PTS = { worlds: 10, msi: 6, ewc: 4, 'first-stand': 3, 'lck-po': 5, 'lck-cup': 3, kespa: 1 };
    const champs = Object.entries(App.state.champs || {}).filter(([id]) => id.startsWith(Y + ':'));
    const coy = App.db.teams.filter(t => t.league === 'LCK').map(t => {
      const pts = champs.filter(([, w]) => w === t.id).reduce((a, [id]) => a + (PTS[this.base(id)] || 1), 0);
      const ms = (Results.list || []).filter(m => (m.t1 === t.id || m.t2 === t.id) && String(m.e).startsWith(Y + ':') && m.w), wr = ms.length ? ms.filter(m => (m.w === 1 ? m.t1 : m.t2) === t.id).length / ms.length : 0;
      return { t, v: pts + wr * 4 };
    }).sort((a, b) => b.v - a.v)[0].t;
    const myCoach = coy.id === App.state.teamId && !App.state.unemployed, coach = myCoach ? (App.state.manager || {}).name || '감독' : Draft.coach(coy).name || `${coy.short} 감독`;
    s.gala[Y] = { poy, roty, coy: coy.id, date: Clock.today() };
    this.give(poy, Y, 'mvp', `${Y} LCK 올해의 선수`); if (roty) this.give(roty, Y, 'roty', `${Y} LCK 신인상`);
    const h = id => Player.find(id), nm = id => { const x = h(id); return x ? `${x.p.name}(${x.t.short})` : '-'; };
    const ap = (s.allpro[Y] || {}).teams, fms = Object.entries(s.fmvp).filter(([id]) => id.startsWith(Y + ':'));
    const body = [`${Y} LCK 어워드가 열렸습니다.`, '', `올해의 선수: ${nm(poy)} — ${this.why(poy, Y)}`, `신인상: ${roty ? `${nm(roty)} — ${this.why(roty, Y)}` : '수상자 없음'}`, `올해의 감독: ${coach} (${coy.short})`,
      ap ? `올프로 1st 팀: ${ap[0].map(nm).join(' · ')}` : '', fms.length ? `\n올해의 파이널 MVP\n${fms.map(([id, pid]) => `${(Schedule.byEvent[id] || { label: id }).label} — ${nm(pid)}`).join('\n')}` : ''].filter(x => x !== null).join('\n');
    Market.post(`[LCK 어워드] ${Y} 올해의 선수 ${(h(poy) || { p: { name: '-' } }).p.name}`, body, poy);
    if (App.state.unemployed) return;
    const mine = [[poy, '올해의 선수'], [roty, '신인상']].filter(([id]) => id && h(id) && h(id).t.id === App.state.teamId);
    mine.forEach(([id]) => World.apply({ morale: 3 }, { pid: id, player: h(id).p.name }));
    if (myCoach) World.apply({ rep: 5, board: 3, media: 3 }, {});
    if (mine.length || myCoach) Inbox.push({ from: { name: 'LCK 운영사무국', role: 'media' }, subject: `${Y} LCK 어워드 — 우리 팀 수상`, priority: 'todo', link: 'portal-news',
      body: `${[...mine.map(([id, l]) => `${l}: ${h(id).p.name}`), myCoach ? `올해의 감독: ${coach}` : ''].filter(Boolean).join('\n')}\n\n축하합니다!\n\n${body}` });
  },

  // ---------- 우승 축하 화면 ----------
  flush() {
    const s = this.st(); if (!s.cele.length || document.querySelector('.aw-cele, .modal-back') || (typeof Engine !== 'undefined' && Engine.busy)) return;
    if (['match-live', 'match-draft', 'match-locker'].includes(Router.current()) || !document.querySelector('#screen-game.active, .screen.active#screen-game')) return;
    this.show(s.cele.shift());
  },
  show(c) {
    const e = Schedule.byEvent[c.eid] || { label: c.eid }, t = Schedule.team(c.tid); if (!t) return;
    // 타이틀 화면의 트로피 SVG를 빌려 온다. 그라데이션 id가 숨겨진 원본을 가리키지 않게 id를 바꾼다
    const trophy = ((document.querySelector('#screen-title svg.trophy') || {}).outerHTML || '').replace(/id="([^"]+)"/g, 'id="aw-$1"').replace(/url\(#([^)]+)\)/g, 'url(#aw-$1)').replace(/href="#([^"]+)"/g, 'href="#aw-$1"');
    const five = c.five.map(id => Player.find(id)).filter(Boolean).map(x => x.p);
    const el = document.createElement('div'); el.className = 'aw-cele';
    el.innerHTML = `<div class="aw-conf">${Array.from({ length: 36 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 7) * .35}s;--c:${['#e8c46a', '#ffffff', t.color || '#c33', '#7fb2ff'][i % 4]}"></i>`).join('')}</div>
      <div class="aw-box" style="--c:${t.color || '#c33'}">
        <div class="aw-trophy">${trophy}</div>
        <small class="aw-ev">${UI.esc(e.label)}</small>
        <h2>${G.team(t, 'sm')} ${UI.esc(t.name)} 우승</h2>
        <div class="aw-five">${five.map(p => `<div class="${p.id === c.fm ? 'fm' : ''}">${G.face(p, 'pl-ph')}<b>${UI.esc(p.name)}</b><small>${G.ROLE_KO[p.role] || ''}${p.id === c.fm ? ' · 파이널 MVP' : ''}</small></div>`).join('')}</div>
        <p class="aw-out">우승 상금 <b>${Player.money(c.prize / 1e8)} 원</b>${c.out ? ` · ${UI.esc(c.out.split(' · ').filter(x => !/구단 수입/.test(x)).join(' · '))}` : ''}</p>
        <div class="aw-act"><button class="btn-ghost aw-news">기사 보기</button><button class="btn-primary aw-ok">계속</button></div>
      </div>`;
    document.body.appendChild(el);
    const close = () => { el.remove(); setTimeout(() => this.flush(), 300); };
    el.querySelector('.aw-ok').onclick = close;
    el.querySelector('.aw-news').onclick = () => { close(); Router.go('portal-news'); };
  },
};

// Season.rate: 세트마다 선수 기록을 쌓는다 / Season.champions: 새 우승이 정해지면 시상
(() => {
  const rate = Season.rate.bind(Season);
  Season.rate = (series, m) => {
    rate(series, m);
    series.games.forEach((x, gi) => {
      const res = x.result; if (!res) return;
      if (res.stats && res.stats.length) res.stats.forEach(([pid, , k, d, a], i) => { const won = res.stats.length === 10 && res.teams ? res.teams[i < 5 ? 'B' : 'R'] === res.win : (Player.find(pid) || { t: {} }).t.id === res.win; Awards.add(pid, m, 6.5 + (Season.rating(k, d, a, won, res.mvp === pid) - 6.5) * .7, won, res.mvp === pid, [k, d, a]); });   // 정밀 엔진(우리 경기)은 KDA로 평점이 더 벌어져 경량 시뮬 폭에 맞춘다
      else [m.t1, m.t2].forEach(tid => { const t = Schedule.team(tid); if (!t) return; Draft.lineup(t).forEach(p => { if (!p) return; const won = tid === res.win; Awards.add(p.id, m, 6.3 + (won ? .6 : -.5) + (G.rand(p.id + m.id + gi, 'rt') - .5) * 2 + (res.mvp === p.id ? .9 : 0), won, res.mvp === p.id); }); });
    });
  };
  const champs = Season.champions.bind(Season);
  Season.champions = () => {
    const before = new Set(Object.keys(App.state.champs || {}));
    champs();
    Object.entries(App.state.champs || {}).filter(([id]) => !before.has(id)).forEach(([id, tid]) => { try { Awards.won(id, tid); } catch (e) { console.warn('[awards]', e); } });
  };
})();
Engine.on(today => {
  if (!App.state.teamId) return;
  Awards.vets();
  if (today.slice(5) === Awards.GALA) Awards.gala(today.slice(0, 4));
});
document.addEventListener('DOMContentLoaded', () => {
  Router.onRoute(() => setTimeout(() => Awards.flush(), 600));
  setInterval(() => { if (App.state && App.state.aw && App.state.aw.cele && App.state.aw.cele.length) Awards.flush(); }, 2000);
});

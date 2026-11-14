// 커리어: 감독 프로필 · 평판 · 커리어 기록 · 다른 팀 보기(구인·이력서) · 설정·저장
const Career = {
  m() { return App.state.manager || this.guest(); },
  // 감독을 만들지 않고 들어온 경우(개발용) 기본값
  guest() {
    return {
      name: '감독', displayName: '감독', nation: 'South Korea', birthdate: '1992-06-15', age: 34, languages: ['ko'],
      background: { type: 'coach' }, coachYears: 3, reputation: 26, avatar: Avatar.defaults(), createdAt: Clock.START,
    };
  },
  team() { return Roster.team(); },
  today() { return Clock.today(); },
  apps() { return (App.state.applications ||= {}); },

  // 목업 계약·관계 수치. TODO: 기능 연결 — 계약 협상·이사회·여론 시스템
  contract(m, t) {
    const mc = typeof Board !== 'undefined' && Board.contract();
    const pay = { LCK: ['원', [0, 1.2, 2, 3.5, 5.5, 8]], LPL: ['원', [0, 1.5, 2.5, 4, 6.5, 9]], LEC: ['원', [0, .8, 1.3, 2, 3, 4.5]], LCS: ['원', [0, .9, 1.4, 2.2, 3.2, 4.8]] }[t.league];
    const v = pay[1][t.rep || 2] * (0.8 + m.reputation / 100);
    const from = m.createdAt || Clock.START;
    return { from: mc ? mc.from : from, to: mc ? mc.to : `${Clock.year(from) + 2}-11-30`, salary: `연 ${v.toFixed(1)}억 원` };
  },
  // 관계 수치: 배경·평판 기준 출발점. TODO: 기능 연결 — 성적·인터뷰·선수 면담으로 변동
  // 진행 중에는 저장된 관계 수치(World), 처음에는 배경·평판으로 정한 값
  relations(m) {
    const r = App.state.rel;
    if (r) return Object.entries(World.KEYS).map(([k, l]) => [l, Math.round(r[k])]);
    return this.baseRelations(m);
  },
  baseRelations(m) {
    const bg = m.background.type;
    const c = v => Math.max(5, Math.min(95, Math.round(v)));
    return [
      ['이사회 신뢰', c(50 + m.reputation * .3)],
      ['선수단 신뢰', c(55 + m.reputation * .2 + (bg === 'ex-pro' ? 10 : bg === 'analyst' ? -6 : 0))],
      ['팬 지지', c(35 + m.reputation * .5 + (bg === 'caster' ? 12 : 0))],
      ['미디어 관계', c(45 + m.reputation * .2 + (bg === 'caster' ? 15 : 0))],
    ];
  },
  meter(label, v, cls = '') {
    // cls에 inv가 있으면 낮을수록 좋은 수치 (피로도 등)
    const g = cls.includes('inv') ? 100 - v : v;
    const tone = g >= 70 ? 'good' : g >= 45 ? 'mid' : 'bad';
    return `<div class="cr-meter ${cls}"><span>${label}</span><div class="cr-bar"><i class="${tone}" style="width:${v}%"></i></div><b class="num">${v}</b></div>`;
  },
  ymd(s) { return (s || '').replace(/-/g, '.'); },
  head(title, sub) {
    return `<div class="card rs-head"><div class="rs-title"><h2>${title}</h2>${sub ? `<span>${sub}</span>` : ''}</div></div>`;
  },

  // ---------- 감독 기록 (이 커리어에서 맡은 팀 · 치른 경기 · 우승) ----------
  // 우승 종류: 대회 단계 → 트로피 칸
  TROPHY_OF: { worlds: 'worlds', msi: 'msi', 'first-stand': 'fs', ewc: 'ewc', kespa: 'kespa', 'lck-po': 'league', 'lpl-gf': 'league', 'lec-summerpo': 'league', 'lcs-summerpo': 'league',
    'lck-cup': 'cup', 'lpl-s1po': 'cup', 'lec-versuspo': 'cup', 'lcs-lockin': 'cup', 'lck-rtm': 'other', 'lpl-s2po': 'other', 'lpl-rf': 'other', 'lec-springpo': 'other', 'lcs-springpo': 'other' },
  tenures() {
    const m = this.m(), start = m.createdAt ? m.createdAt.slice(0, 10) : Clock.START, out = [];
    let from = start;
    (App.state.jobs || []).forEach(j => { out.push({ team: j.team, from, to: j.until }); from = j.until; });
    out.push({ team: App.state.teamId, from, to: null });
    return out;
  },
  stats() {
    const ten = this.tenures(), mine = m => ten.find(x => (m.t1 === x.team || m.t2 === x.team) && m.kst.slice(0, 10) >= x.from && (!x.to || m.kst.slice(0, 10) <= x.to));
    const games = (Results.list || []).filter(m => m.cur && mine(m)).map(m => ({ m, team: mine(m).team }));
    const won = games.filter(x => Results.won(x.m, x.team));
    const sets = games.reduce((s, x) => { const a = x.m.t1 === x.team; s.w += a ? x.m.s1 : x.m.s2; s.l += a ? x.m.s2 : x.m.s1; return s; }, { w: 0, l: 0 });
    const titles = Object.entries(App.state.champs || {}).filter(([id, tid]) => { const e = Schedule.byEvent[id]; return e && ten.some(x => x.team === tid && e.end >= x.from && (!x.to || e.end <= x.to)); }).map(([id, tid]) => ({ e: Schedule.byEvent[id], team: tid, kind: this.TROPHY_OF[Schedule.byEvent[id].base] || 'other' }));
    const intl = Object.entries(App.state.brk || {}).filter(([id, l]) => { const e = Schedule.byEvent[id]; return e && e.league === 'INTL' && ten.some(x => l.includes(x.team) && e.start >= x.from && (!x.to || e.start <= x.to)); }).map(([id]) => Schedule.byEvent[id]);
    const years = {};
    games.forEach(x => { const y = String(x.m.e).slice(0, 4), r = years[y] ||= { y, team: x.team, w: 0, l: 0, titles: [] }; Results.won(x.m, x.team) ? r.w++ : r.l++; });
    titles.forEach(t => { (years[t.e.year] ||= { y: String(t.e.year), team: t.team, w: 0, l: 0, titles: [] }).titles.push(t.e.name); });
    return { ten, games, won, sets, titles, intl, years: Object.values(years).sort((a, b) => b.y.localeCompare(a.y)), seasons: Object.keys(years).length };
  },

  // ---------- 감독 프로필 ----------
  async profile(el) {
    await Promise.all([Portal.ready, Results.load()]);
    const S = this.stats(), Y = String(Schedule.season()), cur = S.years.find(r => r.y === Y) || { w: 0, l: 0, titles: [] };
    const tac = Object.entries(App.state.tacUse || {}).sort((a, b) => b[1] - a[1])[0];
    const m = this.m(), t = this.team(), c = this.contract(m, t);
    const bg = Manager.BACKGROUNDS[m.background.type];
    const age = Manager.age(m, this.today());
    el.innerHTML = `
      <div class="cr-page">
        <div class="card cr-id">
          <div class="cr-av">${Avatar.render(m.avatar)}</div>
          <div class="cr-id-main">
            <h2>${UI.esc(m.displayName || m.name)}</h2>
            ${m.nick && m.display === 'name' ? `<span class="cr-nick">'${UI.esc(m.nick)}'</span>` : ''}
            <div class="cr-id-meta">${G.flag(m.nation)} ${G.nationName(m.nation)} · ${age}세 · ${bg.label}</div>
            ${App.state.unemployed ? `<div class="cr-job"><div><b>무직 — 구직 중</b><small>전 ${UI.esc(t.name)} 감독 · ${this.ymd(App.state.unemployed.since)} 해임</small></div></div>` : `<div class="cr-job">${G.team(t, 'sm')}<div><b>${UI.esc(t.name)} 감독</b><small>${t.league} · ${this.ymd(c.from)} 부임</small></div></div>`}
          </div>
          <div class="cr-id-rep"><span>평판</span><b>${Manager.repLabel(m.reputation)}</b>${UI.stars(Manager.repStars(m.reputation))}</div>
        </div>

        <div class="cr-grid">
          <div class="card">
            <div class="card-head"><h3>개인 정보</h3></div>
            <dl class="cr-dl">
              <dt>이름</dt><dd>${UI.esc(m.name)}${m.nick ? ` <small>(${UI.esc(m.nick)})</small>` : ''}</dd>
              <dt>생년월일</dt><dd>${this.ymd(m.birthdate)} (${age}세)</dd>
              <dt>국적</dt><dd>${G.flag(m.nation)} ${G.nationName(m.nation)}</dd>
              <dt>출생지</dt><dd>${UI.esc(m.birthplace || '-')}</dd>
              <dt>사용 언어</dt><dd>${Manager.langs(m).join(', ')}</dd>
            </dl>
            <div class="card-head" style="margin-top:16px"><h3>계약</h3></div>
            <dl class="cr-dl">
              ${App.state.unemployed ? `<dt>소속</dt><dd>없음 (무직)</dd><dt>이전 소속</dt><dd>${UI.esc(t.name)} · ${this.ymd(App.state.unemployed.since)} 해임</dd>` : `<dt>소속</dt><dd>${UI.esc(t.name)}</dd>
              <dt>직책</dt><dd>감독 (Head Coach)</dd>
              <dt>계약 기간</dt><dd>${this.ymd(c.from)} – ${this.ymd(c.to)}</dd>
              <dt>연봉</dt><dd>${c.salary}</dd>
              <dt>이사회 기대</dt><dd>${UI.esc(t.boardGoal || '-')}</dd>`}
            </dl>
          </div>

          <div class="card">
            <div class="card-head"><h3>경력 배경</h3></div>
            <p class="cr-bg"><b>${bg.label}</b> — ${bg.desc}</p>
            ${m.background.type === 'ex-pro' ? `<p class="cr-bg">선수 시절 ${G.ROLE_KO[m.background.role]} · ${m.background.years}년 · ${Manager.PRO_PEAK[m.background.peak][0]}${m.background.formerTeam ? ' · ' + UI.esc((Schedule.team(m.background.formerTeam) || {}).name || '') : ''}</p>` : ''}
            <p class="cr-bg">지도자 경력 ${m.coachYears ? m.coachYears + '년' : '없음'}</p>
            ${tac ? `<p class="cr-bg">즐겨 쓰는 전술: <b>${UI.esc((Draft.TEAM_TAC[tac[0]] || {}).n || tac[0])}</b> (${tac[1]}경기)</p>` : ''}
          </div>

          <div class="card">
            <div class="card-head"><h3>감독 성적</h3><a href="#career-record">커리어 기록</a></div>
            <dl class="cr-dl">
              <dt>${Y} 시즌</dt><dd>${cur.w}승 ${cur.l}패${cur.w + cur.l ? ` (${Math.round(cur.w / (cur.w + cur.l) * 100)}%)` : ''}</dd>
              <dt>통산</dt><dd>${S.won.length}승 ${S.games.length - S.won.length}패 · 세트 ${S.sets.w}-${S.sets.l}</dd>
              <dt>우승</dt><dd>${S.titles.length ? S.titles.map(t => UI.esc(t.e.label)).join(', ') : '아직 없음'}</dd>
              <dt>국제대회</dt><dd>${S.intl.length ? [...new Set(S.intl.map(e => e.label))].map(UI.esc).join(', ') : '출전 기록 없음'}</dd>
              <dt>맡은 팀</dt><dd>${S.ten.map(x => UI.esc((Schedule.team(x.team) || {}).short || x.team)).join(' → ')}</dd>
            </dl>
          </div>

          <div class="card">
            <div class="card-head"><h3>관계</h3><a href="#career-reputation">평판 자세히</a></div>
            ${this.relations(m).map(([l, v]) => this.meter(l, v)).join('')}
          </div>
        </div>
      </div>`;
  },

  // ---------- 평판 ----------
  async reputation(el) {
    await Portal.ready;
    const m = this.m(), t = this.team();
    const reg = Manager.regionRep(m);
    const lv = Manager.REP_LEVELS;
    const next = lv.find(([min]) => min > m.reputation);
    // 평판 변화 기록. TODO: 기능 연결 — 경기 결과·우승·인터뷰·이적 등으로 쌓기
    const log = [[m.createdAt || Clock.START, `${t.name} 감독 부임`, +2]];
    if (m.background.type === 'ex-pro') log.push(['경력', `선수 시절 ${Manager.PRO_PEAK[m.background.peak][0]}`, Manager.PRO_PEAK[m.background.peak][1]]);
    if (m.coachYears) log.push(['경력', `지도자 경력 ${m.coachYears}년`, Math.min(10, m.coachYears * 2)]);
    log.push(['경력', `${Manager.BACKGROUNDS[m.background.type].label} 출신`, Manager.BACKGROUNDS[m.background.type].rep]);

    el.innerHTML = `
      <div class="cr-page">
        ${this.head('평판', '구단·선수·미디어가 보는 감독의 이름값. 구인 시장에서 지원할 수 있는 팀의 수준이 달라집니다.')}
        <div class="cr-grid">
          <div class="card cr-rep-main">
            <span class="cr-rep-k">현재 평판</span>
            <b class="cr-rep-l">${Manager.repLabel(m.reputation)}</b>
            ${UI.stars(Manager.repStars(m.reputation))}
            <div class="cr-ladder">
              <div class="cr-ladder-bar"><i style="width:${m.reputation}%"></i></div>
              <div class="cr-ladder-ticks">${lv.slice(1).map(([min, l]) => `<span style="left:${min}%" class="${m.reputation >= min ? 'on' : ''}" title="${l}"></span>`).join('')}</div>
            </div>
            <small>${next ? `다음 단계 <b>${next[1]}</b>까지 ${next[0] - m.reputation}` : '최고 단계'}</small>
          </div>

          <div class="card">
            <div class="card-head"><h3>지역별 평판</h3></div>
            ${['LCK', 'LPL', 'LEC', 'LCS'].map(l => this.meter(l, reg[l], l === t.league ? 'cur' : '')).join('')}
            <p class="cr-note">출신 지역과 현재 리그에서 가장 높습니다. 국제대회 성적이 오르면 다른 지역 평판도 함께 오릅니다.</p>
          </div>

          <div class="card">
            <div class="card-head"><h3>관계</h3></div>
            ${this.relations(m).map(([l, v]) => this.meter(l, v)).join('')}
          </div>

          <div class="card">
            <div class="card-head"><h3>평판 기록</h3></div>
            <div class="cr-log">${log.map(([d, txt, v]) => `<div><span>${d.includes('-') ? this.ymd(d) : d}</span><b>${UI.esc(txt)}</b><i class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${v}</i></div>`).join('')}</div>
          </div>
        </div>
      </div>`;
  },

  // ---------- 커리어 기록 ----------
  async record(el) {
    await Promise.all([Portal.ready, Results.load()]);
    const m = this.m(), t = this.team(), S = this.stats();
    const y = +this.today().slice(0, 4);
    const rows = S.ten.slice().reverse().map(x => { const tm = Schedule.team(x.team), g = S.games.filter(q => q.team === x.team), w = g.filter(q => Results.won(q.m, q.team)).length, ti = S.titles.filter(q => q.team === x.team);
      return [`${this.ymd(x.from)} – ${x.to ? this.ymd(x.to) : ''}`, tm, '감독', x.to ? `${Math.max(1, Math.round(Fmt.daysBetween(x.from, x.to) / 30))}개월` : '현재', `${w}승 ${g.length - w}패${ti.length ? ' · ' + ti.map(q => q.e.name).join(', ') + ' 우승' : ''}`]; });
    if (m.coachYears) rows.push([`${y - m.coachYears} – ${y}`, null, '코칭스태프', `${m.coachYears}년`, '-']);
    if (m.background.type === 'ex-pro') {
      const end = y - (m.coachYears || 0) - 1, start = end - m.background.years + 1;
      rows.push([`${start} – ${end}`, Schedule.team(m.background.formerTeam), `프로게이머 (${G.ROLE_KO[m.background.role]})`, `${m.background.years}년`, Manager.PRO_PEAK[m.background.peak][0]]);
    }
    const TROPHIES = [['worlds', '월드 챔피언십'], ['msi', 'MSI'], ['fs', '퍼스트 스탠드'], ['ewc', 'e스포츠 월드컵'], ['league', `${t.league} 우승`], ['cup', { LCK: 'LCK컵', LPL: '스플릿 우승', LEC: 'Versus 우승', LCS: 'Lock-In 우승' }[t.league]], ['kespa', 'KeSPA컵']];
    const won = k => S.titles.filter(x => x.kind === k);
    el.innerHTML = `
      <div class="cr-page">
        ${this.head('커리어 기록', '감독으로서의 모든 기록. 시즌이 끝날 때마다 쌓입니다.')}
        <div class="cr-tiles">
          ${[['감독 경기', `${S.games.length}`], ['승률', S.games.length ? Math.round(S.won.length / S.games.length * 100) + '%' : '-'], ['우승', `${S.titles.length}`], ['국제대회 출전', `${new Set(S.intl.map(e => e.year + ':' + e.base.replace('-playin', ''))).size}`], ['감독 경력', `${S.seasons}시즌`]].map(([k, v]) => `<div class="card"><span>${k}</span><b>${v}</b></div>`).join('')}
        </div>
        <div class="card">
          <div class="card-head"><h3>트로피 진열장</h3></div>
          <div class="cr-trophies">${TROPHIES.map(([k, l]) => { const w = won(k); return `<div class="cr-trophy ${w.length ? '' : 'locked'}"><i>🏆</i><b>${l}</b><small>${w.length ? w.map(x => x.e.year).join(' · ') : '아직 없음'}</small></div>`; }).join('')}</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>경력 이력</h3></div>
          <table class="rs-table cr-table">
            <thead><tr><th>기간</th><th>소속</th><th>역할</th><th>기간</th><th>주요 성과</th></tr></thead>
            <tbody>${rows.map(([p, tm, role, len, note]) => `<tr><td class="num">${p}</td><td>${tm ? `<span class="fx-team">${G.team(tm, 'xs')}<b>${UI.esc(tm.name)}</b></span>` : '<span class="cr-dim">-</span>'}</td><td>${role}</td><td>${len}</td><td>${note}</td></tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="card">
          <div class="card-head"><h3>시즌별 기록</h3></div>
          ${S.years.length ? `<table class="rs-table cr-table"><thead><tr><th>시즌</th><th>팀</th><th class="num">승</th><th class="num">패</th><th class="num">승률</th><th>우승</th></tr></thead><tbody>${S.years.map(r => { const tm = Schedule.team(r.team); return `<tr><td class="num">${r.y}</td><td><span class="fx-team">${tm ? G.team(tm, 'xs') : ''}<b>${UI.esc(tm ? tm.short : '-')}</b></span></td><td class="num">${r.w}</td><td class="num">${r.l}</td><td class="num">${r.w + r.l ? Math.round(r.w / (r.w + r.l) * 100) + '%' : '-'}</td><td>${r.titles.map(UI.esc).join(', ') || '-'}</td></tr>`; }).join('')}</tbody></table>` : `<p class="ms-none">아직 치른 경기가 없습니다. ${Schedule.season()} 시즌 경기를 치르면 여기에 쌓입니다.</p>`}
        </div>
      </div>`;
  },

  // ---------- 다른 팀 보기 ----------
  filter: 'all',
  league: 'ALL',
  selTeam: null,

  async otherTeams(el) {
    await Portal.ready;
    const today = this.today();
    const list = App.db.teams.map(t => ({ t, st: Manager.jobStatus(t, today) }));
    if (!this.selTeam) this.selTeam = (list.find(x => Manager.canApply(x.st)) || list[0]).t.id;
    const openN = list.filter(x => Manager.canApply(x.st)).length;
    el.innerHTML = `
      <div class="fx-page">
        <div class="fx-main">
          <div class="card rs-head">
            <div class="rs-title"><h2>다른 팀 보기</h2><span>감독 자리가 비었거나 감독을 찾는 팀에 이력서를 보낼 수 있습니다.</span></div>
            <div class="rs-stats">
              <div><span class="k">구인 중</span><b>${openN}</b></div>
              <div><span class="k">보낸 이력서</span><b>${Object.keys(this.apps()).length}</b></div>
            </div>
          </div>
          <div class="ch-bar">
            <div class="seg ot-filter">${[['all', '전체'], ['open', '구인 중'], ['unstable', '경질설'], ['applied', '지원함']].map(([k, l]) => `<button class="${this.filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
            <div class="seg ot-league">${['ALL', 'LCK', 'LPL', 'LEC', 'LCS'].map(l => `<button class="${this.league === l ? 'on' : ''}" data-l="${l}">${l === 'ALL' ? '모든 리그' : l}</button>`).join('')}</div>
          </div>
          <div class="card rs-table-wrap" style="padding:0">
            <table class="rs-table ot-table">
              <thead><tr><th>팀</th><th>리그</th><th>감독</th><th>상태</th><th>구단 평판</th><th>이사회 기대</th><th>내 가능성</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
        <aside class="card fx-side ot-side"></aside>
      </div>`;
    $('.ot-filter', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.filter = b.dataset.f; $$('.ot-filter button', el).forEach(x => x.classList.toggle('on', x === b)); this.drawTeams(el, list); };
    $('.ot-league', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.league = b.dataset.l; $$('.ot-league button', el).forEach(x => x.classList.toggle('on', x === b)); this.drawTeams(el, list); };
    $('.ot-table tbody', el).onclick = e => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      this.selTeam = tr.dataset.id;
      $$('.ot-table tbody tr', el).forEach(x => x.classList.toggle('sel', x === tr));
      this.drawTeam(el, list);
      if (matchMedia('(max-width: 1023px)').matches) $('.ot-side', el).scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    this.drawTeams(el, list);
    this.drawTeam(el, list);
  },

  status(st) { const [l, c] = Manager.JOB[st]; return `<span class="ot-st ${c}">${l}</span>`; },

  drawTeams(el, list) {
    const m = this.m();
    const rows = list.filter(({ t, st }) =>
      (this.league === 'ALL' || t.league === this.league) &&
      (this.filter === 'all' || (this.filter === 'open' ? Manager.canApply(st) : this.filter === 'applied' ? this.apps()[t.id] : st === this.filter)));
    $('.ot-table tbody', el).innerHTML = rows.map(({ t, st }) => {
      const hc = Manager.headCoach(t);
      const [ch, cc] = Manager.chance(m, t);
      const app = this.apps()[t.id];
      return `
        <tr data-id="${t.id}" class="${t.id === this.selTeam ? 'sel' : ''} ${st === 'mine' ? 'mine' : ''}">
          <td><span class="fx-team">${G.team(t, 'xs')}<b>${UI.esc(t.name)}</b></span></td>
          <td>${t.league}</td>
          <td>${st === 'mine' ? '<b>나</b>' : hc ? `${UI.esc(hc.name)}${hc.contractEnd ? ` <small class="cr-dim">~${hc.contractEnd.slice(0, 7).replace('-', '.')}</small>` : ''}` : '<span class="cr-dim">공석</span>'}</td>
          <td>${this.status(st)}${app ? '<i class="sq-type offered">지원함</i>' : ''}</td>
          <td>${UI.stars(t.rep || 2)}</td>
          <td class="ot-goal">${UI.esc(t.boardGoal || '-')}</td>
          <td>${st === 'mine' ? '-' : `<span class="ot-ch ${cc}">${ch}</span>`}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="7" class="ms-none" style="text-align:center;padding:30px">조건에 맞는 팀이 없습니다.</td></tr>';
  },

  drawTeam(el, list) {
    const hit = list.find(x => x.t.id === this.selTeam);
    const box = $('.ot-side', el);
    if (!hit) { box.innerHTML = ''; return; }
    const { t, st } = hit;
    const m = this.m();
    const hc = Manager.headCoach(t);
    const [ch, cc] = Manager.chance(m, t);
    const app = this.apps()[t.id];
    const why = {
      vacant: '감독 자리가 비어 있습니다. 구단이 새 감독을 찾고 있습니다.',
      seeking: hc && hc.contractEnd ? `현 감독 ${hc.name}의 계약이 ${this.ymd(hc.contractEnd)}에 끝납니다. 구단이 후임을 알아보고 있습니다.` : '구단이 새 감독 후보를 찾고 있습니다.',
      unstable: '성적 부진으로 감독 교체설이 돌고 있습니다. 아직 공식 구인은 없습니다.',
      stable: '현 감독 체제가 안정적입니다. 지금은 지원할 수 없습니다.',
      mine: '현재 지휘하고 있는 팀입니다.',
    }[st];
    const top = [...t.players].sort((a, b) => (a.sub - b.sub)).slice(0, 5);
    box.innerHTML = `
      <div class="ot-head">${G.team(t, 'lg')}<div><h3>${UI.esc(t.name)}</h3><span>${t.league} · ${UI.stars(t.rep || 2)}</span></div></div>
      <div class="ot-status">${this.status(st)}<p>${why}</p></div>
      <dl class="cr-dl">
        <dt>현 감독</dt><dd>${st === 'mine' ? '나' : hc ? UI.esc(hc.name) : '공석'}</dd>
        <dt>이사회 기대</dt><dd>${UI.esc(t.boardGoal || '-')}</dd>
        <dt>예산</dt><dd>${UI.esc(t.budget || '-')}</dd>
        <dt>내 가능성</dt><dd>${st === 'mine' ? '-' : `<span class="ot-ch ${cc}">${ch}</span> <small class="cr-dim">${t.league} 평판 ${Manager.regionRep(m)[t.league]}</small>`}</dd>
      </dl>
      <h4>주전 로스터</h4>
      <div class="ot-roster">${top.map(p => `<div>${G.face(p, 'pl-ph')}${G.ovr(p)}<b>${UI.esc(p.name)}</b>${G.pos(p.role)}</div>`).join('')}</div>
      ${st !== 'mine' ? `
        <div class="ot-apply">
          ${app ? `<div class="ot-applied"><b>이력서 제출 완료</b><span>${this.ymd(app.date)} 제출 · ${app.status}</span></div>`
            : `<button class="btn-primary ot-apply-btn" ${Manager.canApply(st) ? '' : 'disabled'}>이력서 보내기</button>
               ${Manager.canApply(st) ? '' : '<small class="cr-dim">구인 중인 팀에만 보낼 수 있습니다</small>'}`}
        </div>` : ''}`;
    const btn = $('.ot-apply-btn', box);
    if (btn && !btn.disabled) btn.onclick = () => this.applyModal(el, list, t);
  },

  applyModal(el, list, t) {
    const m = this.m();
    const [ch] = Manager.chance(m, t);
    UI.modal({
      title: `${t.name} — 이력서 보내기`,
      body: `
        <div class="ot-cv">
          <div class="ot-cv-head"><div class="mini-av">${Avatar.render(m.avatar)}</div><div><b>${UI.esc(m.displayName || m.name)}</b><small>${G.nationName(m.nation)} · ${Manager.age(m, this.today())}세 · ${Manager.BACKGROUNDS[m.background.type].label} · 평판 ${Manager.repLabel(m.reputation)}</small></div></div>
          <label class="field"><span>지원 동기</span>
            <select id="cv-motive"><option>우승에 도전하고 싶습니다</option><option>팀을 재건할 자신이 있습니다</option><option>유망주를 키워 강팀으로 만들겠습니다</option><option>이 리그에서 새로운 도전을 하고 싶습니다</option></select>
          </label>
          <label class="field"><span>강조할 점</span>
            <select id="cv-pitch"><option value="career">경력·이력</option><option value="rep">평판</option><option value="vision">팀 운영 비전</option><option value="youth">유망주 육성 계획</option></select>
          </label>
          <p class="cr-note">예상 가능성: <b>${ch}</b> · 답변은 메시지로 옵니다. 지원 사실은 현 구단에 알려질 수 있습니다.</p>
        </div>`,
      actions: [{ label: '취소' }, {
        label: '보내기', primary: true,
        onClick: back => {
          // TODO: 기능 연결 — 면접 제안·거절·현 구단 이사회 반응 메시지
          this.apps()[t.id] = { date: this.today(), status: '서류 검토 중', motive: $('#cv-motive', back).value, pitch: $('#cv-pitch', back).value };
          UI.toast(`${t.name}에 이력서를 보냈습니다`);
          this.drawTeams(el, list);
          this.drawTeam(el, list);
        },
      }],
    });
  },

  // ---------- 설정·저장 ----------
  async settings(el) {
    await Portal.ready;
    const s = App.state.settings;
    const slot = (data, id, label) => `
      <div class="sv-slot ${data ? '' : 'empty'}" data-slot="${id}">
        <div class="sv-slot-ic">${data && data.team && data.team.logo ? `<img src="${data.team.logo}" alt="" referrerpolicy="no-referrer">` : `<span>${id === 'auto' ? 'A' : id}</span>`}</div>
        <div class="sv-slot-main">
          <b>${label}${data ? ` · ${UI.esc(data.label)}` : ''}</b>
          <small>${data ? `게임 날짜 ${this.ymd(data.date)} · 저장 ${SaveSystem.when(data.savedAt)}` : '비어 있음'}</small>
        </div>
        <div class="sv-slot-act">
          ${id !== 'auto' ? `<button class="btn-ghost sv-save">저장</button>` : ''}
          <button class="btn-ghost sv-load" ${data ? '' : 'disabled'}>불러오기</button>
          ${data ? `<button class="btn-ghost sv-del" aria-label="삭제">삭제</button>` : ''}
        </div>
      </div>`;
    const draw = () => {
      el.innerHTML = `
        <div class="cr-page sv-page">
          ${this.head('설정·저장', '저장은 이 브라우저에만 남습니다. 브라우저 데이터를 지우면 함께 사라집니다.')}
          <div class="cr-grid">
            <div class="card">
              <div class="card-head"><h3>저장</h3></div>
              <div class="sv-slots">${SaveSystem.list().map((d, i) => slot(d, SaveSystem.SLOTS[i], `슬롯 ${i + 1}`)).join('')}</div>
              <h4 class="sv-h">자동 저장</h4>
              <label class="sv-toggle"><input type="checkbox" id="sv-auto" ${s.autosave ? 'checked' : ''}><span></span><div><b>하루마다 자동 저장</b><small>날짜가 넘어갈 때마다(계속 버튼) 자동 저장 슬롯에 덮어씁니다</small></div></label>
              <div class="sv-slots">${slot(SaveSystem.auto(), 'auto', '자동 저장')}</div>
            </div>
            <div class="card">
              <div class="card-head"><h3>게임 설정</h3></div>
              <div class="set-row"><div>인트로 건너뛰기<small>다음 실행부터 고지 화면 생략</small></div><input type="checkbox" id="st-skip" ${s.skipIntro ? 'checked' : ''}></div>
              <div class="set-row"><div>기본 시뮬레이션 속도</div>
                <select id="st-speed"><option value="slow">느리게</option><option value="normal">보통</option><option value="fast">빠르게</option></select></div>
              <div class="set-row"><div>효과음 볼륨</div><input type="range" id="st-vol" min="0" max="100" value="${s.volume}"></div>
              <div class="sv-foot"><button class="btn-ghost" id="st-title">메인 화면으로</button></div>
            </div>
          </div>
        </div>`;
      $('#st-speed', el).value = s.simSpeed;
      const persist = () => Settings.save(s);
      $('#sv-auto', el).onchange = e => { s.autosave = e.target.checked; persist(); UI.toast(s.autosave ? '자동 저장 켜짐' : '자동 저장 꺼짐'); };
      $('#st-skip', el).onchange = e => { s.skipIntro = e.target.checked; persist(); };
      $('#st-speed', el).onchange = e => { s.simSpeed = e.target.value; persist(); };
      $('#st-vol', el).onchange = e => { s.volume = +e.target.value; persist(); };
      $('#st-title', el).onclick = () => App.show('title');
      $$('.sv-slot', el).forEach(row => {
        const id = row.dataset.slot;
        const data = id === 'auto' ? SaveSystem.auto() : SaveSystem.list()[SaveSystem.SLOTS.indexOf(id)];
        const save = $('.sv-save', row), load = $('.sv-load', row), del = $('.sv-del', row);
        if (save) save.onclick = () => {
          const go = () => { if (SaveSystem.save(id)) { UI.toast(`슬롯 ${id}에 저장했습니다`); draw(); } else UI.toast('저장하지 못했습니다'); };
          data ? UI.modal({ title: '덮어쓰기', body: `슬롯 ${id}의 저장을 지금 상태로 덮어씁니다.`, actions: [{ label: '취소' }, { label: '덮어쓰기', primary: true, onClick: go }] }) : go();
        };
        if (load && data) load.onclick = () => UI.modal({
          title: '불러오기', body: `<b>${UI.esc(data.label)}</b> (${this.ymd(data.date)})을 불러옵니다. 저장하지 않은 진행은 사라집니다.`,
          actions: [{ label: '취소' }, { label: '불러오기', primary: true, onClick: () => { SaveSystem.load(id); UI.toast('불러왔습니다'); } }],
        });
        if (del) del.onclick = () => UI.modal({
          title: '저장 삭제', body: `${id === 'auto' ? '자동 저장' : '슬롯 ' + id}을 삭제합니다. 되돌릴 수 없습니다.`,
          actions: [{ label: '취소' }, { label: '삭제', primary: true, onClick: () => { SaveSystem.remove(id); draw(); } }],
        });
      });
    };
    draw();
  },
};

Views['career-profile'] = el => Career.profile(el);
Views['career-reputation'] = el => Career.reputation(el);
Views['career-record'] = el => Career.record(el);
Views['career-other-teams'] = el => Career.otherTeams(el);
Views['career-settings'] = el => Career.settings(el);

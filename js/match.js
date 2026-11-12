// 경기: 다음 경기 · 상대 분석 · 경기 기록 · 메타·패치 노트 · 순위표
// 지난 시즌 기록은 실제 결과(data/results-<기준연도>.json). 새 시즌 기록은 경기 시뮬레이션 후 쌓인다.
const Results = {
  list: [], meta: {},
  load() {
    if (!this._p) this._p = Schedule.load().then(() => fetch(`data/results-${Schedule.BASE}.json`)).then(r => r.ok ? r.json() : { matches: [], meta: {} })
      .then(d => { this.list = d.matches.map(m => ({ ...m, kst: Schedule.kst(m.t, 0) })); this.meta = d.meta; })
      .catch(() => { this.list = []; });
    return this._p;
  },
  ev(id) { return (this.meta.events || {})[id] || { name: id, league: '', kind: '' }; },
  forTeam(id) { return this.list.filter(m => m.t1 === id || m.t2 === id); },
  won(m, id) { return (m.w === 1 && m.t1 === id) || (m.w === 2 && m.t2 === id); },
  h2h(a, b) { return this.list.filter(m => (m.t1 === a && m.t2 === b) || (m.t1 === b && m.t2 === a)); },
  // 순위: 경기 승 → 세트 득실
  table(league, eventIds) {
    const rows = {};
    App.db.teams.filter(t => t.league === league).forEach(t => { rows[t.id] = { t, w: 0, l: 0, sw: 0, sl: 0 }; });
    this.list.filter(m => m.league === league && eventIds.includes(m.e) && !/playoff|final|knockout|play-?in|tiebreak|qualif|last chance/i.test(m.tab)).forEach(m => {
      for (const [id, my, op, win] of [[m.t1, m.s1, m.s2, m.w === 1], [m.t2, m.s2, m.s1, m.w === 2]]) {
        const r = rows[id]; if (!r) continue;
        win ? r.w++ : r.l++; r.sw += my; r.sl += op;
      }
    });
    return Object.values(rows).filter(r => r.w + r.l).sort((a, b) => b.w - a.w || (b.sw - b.sl) - (a.sw - a.sl) || b.sw - a.sw);
  },
  regularEvents(league) { return Object.entries(this.meta.events || {}).filter(([, e]) => e.league === league && e.kind === 'regular').map(([id]) => id); },
};

const Match = {
  team() { return Roster.team(); },
  today() { return Clock.today(); },
  ready() { return Promise.all([Portal.ready, Mastery.load(), Results.load()]); },
  score(m, id) { const mine = m.t1 === id; return `${mine ? m.s1 : m.s2} : ${mine ? m.s2 : m.s1}`; },
  oppOf(m, id) { return Schedule.team(m.t1 === id ? m.t2 : m.t1) || { name: m.t1 === id ? m.n2 : m.n1, short: (m.t1 === id ? m.n2 : m.n1) || '?' }; },
  form(id, n = 5) { return Results.forTeam(id).slice(-n).map(m => Results.won(m, id) ? 'W' : 'L'); },
  formDots(f) { return `<span class="form">${f.map(r => `<i class="${r === 'W' ? 'w' : 'l'}"></i>`).join('')}</span>`; },
  record(id) { const l = Results.forTeam(id); const w = l.filter(m => Results.won(m, id)).length; return { w, l: l.length - w }; },

  // 팀 전체 챔피언 경향: 선수 풀 합산
  teamChamps(t, n = 8) {
    const agg = {};
    t.players.filter(p => !p.sub).forEach(p => Mastery.pool(p.id).forEach(e => { (agg[e.c] ||= { c: e.c, g: 0, sig: 0, by: [] }); agg[e.c].g += e.g26 || 0; if (e.sig) { agg[e.c].sig++; agg[e.c].by.push(p.name); } }));
    return Object.values(agg).sort((a, b) => b.sig - a.sig || b.g - a.g).slice(0, n);
  },
  rosterBlock(t) {
    return `<div class="op-roster">${t.players.filter(p => !p.sub).map(p => `
      <div class="op-pl" data-pid="${p.id}">${G.face(p, 'pl-ph')}<div>${G.ovr(p)}<b>${UI.esc(p.name)}</b>${G.pos(p.role)}</div>
        <div class="ms-chips">${Mastery.pool(p.id).slice(0, 4).map(e => Mastery.chip(e)).join('') || '<span class="ms-none">기록 없음</span>'}</div></div>`).join('')}</div>`;
  },
  bindPlayers(el) { el.addEventListener('click', e => { const r = e.target.closest('[data-pid]'); if (r) Player.open(r.dataset.pid); }); },

  // ---------- 다음 경기 ----------
  async next(el) {
    await this.ready();
    const t = this.team(), nm = Schedule.next(t.id, this.today());
    if (!nm) {
      const ev = Schedule.firstEvent(t.league), rel = Schedule.nextRelease(t.league);
      el.innerHTML = `
        <div class="cr-page">
          ${Career.head('다음 경기', '아직 발표된 공식 경기가 없습니다.')}
          <div class="cr-grid">
            <div class="card nx-count">
              <span>${ev ? UI.esc(ev.label) + ' 개막까지' : ''}</span>
              <b>${ev ? 'D-' + Fmt.daysBetween(this.today(), ev.start) : '-'}</b>
              <small>${ev ? Fmt.dayLabel(ev.start) + ' 개막' : ''}${rel ? ` · 대진 ${Fmt.dayLabel(rel.pub)}경 발표` : ''}</small>
            </div>
            <div class="card">
              <div class="card-head"><h3>개막 전 준비</h3></div>
              <ul class="nx-todo">
                <li><a href="#roster-contracts">계약 만료 선수 정리</a></li>
                <li><a href="#recruit-fa">FA 시장에서 빈자리 보강</a></li>
                <li><a href="#training-scrims">프리시즌 스크림 잡기</a></li>
                <li><a href="#match-meta">새 패치 메타 확인</a></li>
                <li><a href="#match-opponent">경쟁 팀 전력 분석</a></li>
              </ul>
            </div>
          </div>
        </div>`;
      return;
    }
    const opp = Schedule.opponent(nm, t.id), ev = Schedule.eventOf(nm);
    const h = Results.h2h(t.id, opp ? opp.id : '');
    const hw = h.filter(m => Results.won(m, t.id)).length;
    el.innerHTML = `
      <div class="cr-page">
        <div class="card nx-head">
          <div class="nx-side">${G.team(t, 'lg')}<b>${UI.esc(t.name)}</b>${this.formDots(this.form(t.id))}</div>
          <div class="nx-mid"><span>${UI.esc(ev.label)}${nm.tab ? ' · ' + UI.esc(nm.tab) : ''}</span><b>VS</b><small>${Fmt.dateTime(nm.t)} · Bo${nm.bo}${Schedule.orderLabel(nm) ? ' · ' + Schedule.orderLabel(nm) : ''}</small><em>D-${Fmt.daysBetween(this.today(), nm.t)}</em></div>
          <div class="nx-side">${opp ? G.team(opp, 'lg') : ''}<b>${opp ? UI.esc(opp.name) : '미정'}</b>${opp ? this.formDots(this.form(opp.id)) : ''}</div>
        </div>
        ${opp ? `<div class="nx-draft"><span>${(App.state.plans || {})[nm.id] ? `밴픽·전술 준비됨 (${(App.state.plans[nm.id].series.games || []).length}세트)` : '이 경기의 밴픽과 전술을 미리 준비할 수 있습니다.'}</span><a class="btn-primary" href="#match-draft">밴픽 준비 →</a></div>` : ''}
        ${opp ? `<div class="cr-grid">
          <div class="card"><div class="card-head"><h3>${Schedule.BASE} 상대 전적</h3></div>
            <p class="pp-line">${h.length ? `<b>${hw}승 ${h.length - hw}패</b>` : '맞대결 기록 없음'}</p>
            ${h.slice(-5).reverse().map(m => `<div class="mh-row ${Results.won(m, t.id) ? 'w' : 'l'}"><span>${m.kst.slice(5, 10).replace('-', '.')}</span><span>${UI.esc(Results.ev(m.e).name)}</span><b>${this.score(m, t.id)}</b></div>`).join('')}
          </div>
          <div class="card"><div class="card-head"><h3>상대 주력 챔피언</h3><a href="#match-opponent">상대 분석</a></div>
            <div class="ms-chips">${this.teamChamps(opp).map(x => Mastery.chip({ c: x.c, m: x.sig ? 18 : 12, g: x.g, w: 0, k: 0, d: 1, a: 0, sig: !!x.sig })).join('')}</div>
          </div>
        </div>
        <div class="card"><div class="card-head"><h3>상대 선발 예상</h3></div>${this.rosterBlock(opp)}</div>` : ''}
      </div>`;
    this.bindPlayers(el);
  },

  // ---------- 상대 분석 ----------
  oppId: null,
  async opponent(el) {
    await this.ready();
    const t = this.team(), nm = Schedule.next(t.id, this.today());
    const league = App.db.teams.filter(x => x.league === t.league && x.id !== t.id);
    if (!this.oppId || !App.db.teams.some(x => x.id === this.oppId)) this.oppId = (nm && Schedule.opponent(nm, t.id) || Results.table(t.league, Results.regularEvents(t.league)).map(r => r.t).find(x => x.id !== t.id) || league[0]).id;
    const o = App.db.teams.find(x => x.id === this.oppId);
    const rec = this.record(o.id), h = Results.h2h(t.id, o.id), hw = h.filter(m => Results.won(m, t.id)).length;
    const rank = Results.table(o.league, Results.regularEvents(o.league)).findIndex(r => r.t.id === o.id) + 1;
    const sq = (SoloQ.cache || SoloQ.build()).ladder.filter(a => a.team && a.team.id === o.id);
    const roleScore = G.ROLES.map(r => { const p = o.players.find(x => !x.sub && x.role === r); return [r, p ? Mastery.pool(p.id).filter(e => e.m >= 15).length : 0]; }).sort((a, b) => b[1] - a[1]);
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head">
          <div class="op-title">${G.team(o, 'lg')}<div class="rs-title"><h2>${UI.esc(o.name)} <small>${o.league}</small></h2><span>${Schedule.BASE} 시즌 ${rec.w}승 ${rec.l}패${rank ? ` · 정규 시즌 종합 ${rank}위` : ''} · 우리와 ${h.length ? `${hw}승 ${h.length - hw}패` : '맞대결 없음'}</span></div></div>
          <select class="ch-sort op-sel">${App.db.teams.filter(x => x.id !== t.id).map(x => `<option value="${x.id}" ${x.id === o.id ? 'selected' : ''}>${UI.esc(x.name)} (${x.league})</option>`).join('')}</select>
        </div>
        <div class="cr-grid">
          <div class="card"><div class="card-head"><h3>전력 요약</h3></div>
            <ul class="op-notes">
              <li>가장 강한 라인: <b>${G.ROLE_KO[roleScore[0][0]]}</b> (숙련 15+ 챔피언 ${roleScore[0][1]}개)</li>
              <li>상대적으로 약한 라인: <b>${G.ROLE_KO[roleScore.at(-1)[0]]}</b></li>
              <li>시그니처 보유: <b>${o.players.reduce((s, p) => s + Mastery.signatures(p.id).length, 0)}개</b></li>
              <li>최근 폼 ${this.formDots(this.form(o.id))}</li>
              ${sq.length ? `<li>솔랭 100위 내 ${sq.length}명 (최고 ${sq[0].rank}위 ${UI.esc(sq[0].name)})</li>` : ''}
            </ul>
          </div>
          <div class="card"><div class="card-head"><h3>팀 주력 챔피언 <small>시그니처 우선 · ${(Mastery.meta.recentFrom || '').slice(0, 4)} 판수</small></h3></div>
            <div class="op-champs">${this.teamChamps(o, 10).map(x => { const c = Champions.byId[x.c]; return `<div>${SoloQ.ic(x.c)}<b>${UI.esc(c.name)}</b><span>${x.g}판</span>${x.sig ? `<i class="ms-sig static">SIG</i><small>${x.by.map(UI.esc).join(', ')}</small>` : ''}</div>`; }).join('')}</div>
          </div>
        </div>
        <div class="card"><div class="card-head"><h3>주전 로스터와 챔피언 폭</h3></div>${this.rosterBlock(o)}</div>
      </div>`;
    $('.op-sel', el).onchange = e => { this.oppId = e.target.value; this.opponent(el); };
    this.bindPlayers(el);
  },

  // ---------- 경기 기록 ----------
  async history(el) {
    await this.ready();
    const t = this.team(), list = Results.forTeam(t.id);
    const rec = this.record(t.id);
    const sets = list.reduce((s, m) => { const mine = m.t1 === t.id; s.w += mine ? m.s1 : m.s2; s.l += mine ? m.s2 : m.s1; return s; }, { w: 0, l: 0 });
    const byEv = {};
    list.forEach(m => (byEv[m.e] ||= []).push(m));
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head">
          <div class="rs-title"><h2>경기 기록 <small>${UI.esc(t.name)}</small></h2><span>${Schedule.BASE} 시즌 실제 기록 · ${Schedule.season()} 시즌 기록은 경기를 치르면 여기에 쌓입니다</span></div>
          <div class="rs-stats"><div><span class="k">경기</span><b>${rec.w}승 ${rec.l}패</b></div><div><span class="k">세트</span><b>${sets.w}-${sets.l}</b></div><div><span class="k">승률</span><b>${list.length ? Math.round(rec.w / list.length * 100) + '%' : '-'}</b></div></div>
        </div>
        ${Object.entries(byEv).map(([id, ms]) => {
          const w = ms.filter(m => Results.won(m, t.id)).length;
          return `<div class="card mh-card"><div class="card-head"><h3>${UI.esc(Results.ev(id).name)} <small>${w}승 ${ms.length - w}패</small></h3></div>
            ${ms.map(m => { const o = this.oppOf(m, t.id), win = Results.won(m, t.id); return `<div class="mh-row ${win ? 'w' : 'l'}"><span class="num">${m.kst.slice(5, 10).replace('-', '.')}</span><span class="fx-team">${o.logo ? G.team(o, 'xs') : ''}<b>${UI.esc(o.short || o.name || '?')}</b></span><span class="mh-tab">${UI.esc(m.tab)}</span><b class="mh-score">${this.score(m, t.id)}</b><i>${win ? '승' : '패'}</i></div>`; }).join('')}</div>`;
        }).join('') || '<div class="card fx-empty"><b>기록이 없습니다</b></div>'}
      </div>`;
  },

  // ---------- 메타·패치 노트 ----------
  async meta(el) {
    await this.ready();
    await Champions.load();
    const yr = (Mastery.meta.recentFrom || '').slice(0, 4);
    const agg = {};
    Object.entries(Mastery.pools).forEach(([pid, l]) => l.forEach(e => { (agg[e.c] ||= { c: e.c, g: 0, sig: [] }); agg[e.c].g += e.g26 || 0; if (e.sig) agg[e.c].sig.push(pid); }));
    const ranked = Object.values(agg).filter(x => x.g > 0).sort((a, b) => b.g - a.g);
    const tier = i => i < ranked.length * .05 ? 'S' : i < ranked.length * .15 ? 'A' : i < ranked.length * .35 ? 'B' : 'C';
    const byRole = r => ranked.filter(x => (Champions.byId[x.c] || {}).positions?.[0] === r).slice(0, 6);
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head">
          <div class="rs-title"><h2>메타·패치 노트 <small>패치 ${UI.esc(Champions.meta.patch)}</small></h2><span>${yr} 프로 경기 픽 수 기준 (4개 리그 1군 선수 합산)</span></div>
        </div>
        <div class="card mt-ai">
          <b>패치노트 AI 준비 중</b>
          <span>게임 안 픽률·승률을 보고 다음 패치의 버프·너프를 정하는 기능이 들어올 자리입니다.</span>
        </div>
        <div class="mt-roles">${G.ROLES.map(r => `
          <div class="card"><div class="card-head"><h3>${G.pos(r, true)} ${G.ROLE_KO[r]}</h3></div>
            ${byRole(r).map(x => { const c = Champions.byId[x.c], i = ranked.indexOf(x); return `<div class="mt-row">${SoloQ.ic(x.c)}<b>${UI.esc(c.name)}</b><i class="mt-tier t${tier(i)}">${tier(i)}</i><span class="num">${x.g}판</span></div>`; }).join('') || '<p class="ms-none">데이터 없음</p>'}
          </div>`).join('')}
        </div>
        <div class="card"><div class="card-head"><h3>전체 픽 순위 <small>상위 30</small></h3></div>
          <div class="rs-table-wrap"><table class="rs-table"><thead><tr><th class="num">#</th><th>챔피언</th><th>주 포지션</th><th>티어</th><th class="num">${yr} 판수</th><th>시그니처 선수</th></tr></thead>
          <tbody>${ranked.slice(0, 30).map((x, i) => { const c = Champions.byId[x.c]; return `<tr><td class="num">${i + 1}</td><td><div class="ms-c">${SoloQ.ic(x.c)}${UI.esc(c.name)}</div></td><td>${(c.positions || []).map(p => G.pos(p)).join('')}</td><td><i class="mt-tier t${tier(i)}">${tier(i)}</i></td><td class="num">${x.g}</td><td class="mt-sig">${x.sig.map(id => (Player.find(id) || { p: { name: id } }).p.name).join(', ') || '-'}</td></tr>`; }).join('')}</tbody></table></div>
        </div>
      </div>`;
  },

  // ---------- 순위표 ----------
  stLeague: null, stEvent: 'all',
  async standings(el) {
    await this.ready();
    const t = this.team();
    this.stLeague ||= t.league;
    const evs = Results.regularEvents(this.stLeague);
    const ids = this.stEvent === 'all' || !evs.includes(this.stEvent) ? evs : [this.stEvent];
    const rows = Results.table(this.stLeague, ids);
    const first = Schedule.firstEvent(this.stLeague);
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head"><div class="rs-title"><h2>순위표</h2><span>${Schedule.season()} 시즌은 ${first ? `${Fmt.dayLabel(first.start)} ${UI.esc(first.short)} 개막 후` : '개막 후'} 집계됩니다 · 아래는 ${Schedule.BASE} 시즌 실제 결과</span></div></div>
        <div class="ch-bar">
          <div class="seg st-lg">${['LCK', 'LPL', 'LEC', 'LCS'].map(l => `<button class="${this.stLeague === l ? 'on' : ''}" data-l="${l}">${l}</button>`).join('')}</div>
          <select class="ch-sort st-ev"><option value="all">정규 시즌 종합</option>${evs.map(id => `<option value="${id}" ${this.stEvent === id ? 'selected' : ''}>${UI.esc(Results.ev(id).name)}</option>`).join('')}</select>
        </div>
        <div class="card rs-table-wrap" style="padding:0">
          <table class="rs-table st-table"><thead><tr><th class="num">#</th><th>팀</th><th class="num">승</th><th class="num">패</th><th class="num">승률</th><th class="num">세트 득실</th><th>최근 5경기</th></tr></thead>
          <tbody>${rows.map((r, i) => `<tr class="${r.t.id === t.id ? 'mine' : ''}"><td class="num"><b>${i + 1}</b></td><td><span class="fx-team">${G.team(r.t, 'xs')}<b>${UI.esc(r.t.name)}</b></span></td><td class="num">${r.w}</td><td class="num">${r.l}</td><td class="num">${Math.round(r.w / (r.w + r.l) * 100)}%</td><td class="num ${r.sw - r.sl > 0 ? 'good' : r.sw - r.sl < 0 ? 'bad' : ''}">${r.sw - r.sl > 0 ? '+' : ''}${r.sw - r.sl}</td><td>${this.formDots(this.form(r.t.id))}</td></tr>`).join('') || '<tr><td colspan="7" class="ms-none" style="text-align:center;padding:30px">기록 없음</td></tr>'}</tbody></table>
        </div>
      </div>`;
    $('.st-lg', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.stLeague = b.dataset.l; this.stEvent = 'all'; this.standings(el); };
    $('.st-ev', el).onchange = e => { this.stEvent = e.target.value; this.standings(el); };
  },
};

Views['match-next'] = el => Match.next(el);
Views['match-opponent'] = el => Match.opponent(el);
Views['portal-opponent-report'] = el => Match.opponent(el);
Views['match-history'] = el => Match.history(el);
Views['match-meta'] = el => Match.meta(el);
Views['match-standings'] = el => Match.standings(el);

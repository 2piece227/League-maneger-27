// 경기 > 대회 결과 (FM의 대회 '일정 · 결과' 화면처럼): 우리 팀이 아닌 경기까지 리그 · 대회 · 팀별로 훑어보고,
// 경기를 누르면 세트별 경기 리포트(승리 진영 · 시간 · 킬 · POG · 밴픽 · 선수 기록)를 본다.
const CompResults = {
  league: null, eventId: null, status: 'done', teamId: 'all',

  rec(m) { return (App.state.season || {})[m.id]; },
  leagueOf(m) { return m.league === 'INTL' ? 'INTL' : m.league; },
  events(league) {
    const Y = Schedule.season();
    return Schedule.events.filter(e => e.league === league && e.kind !== 'stove' && e.kind !== 'event' && (e.year === Y || e.past) && Schedule.all.some(m => m.event === e.id))
      .sort((a, b) => a.start.localeCompare(b.start));
  },
  // 기본 대회: 결과가 있는 가장 최근 대회 (없으면 가장 가까운 대회)
  pickEvent(league) {
    const evs = this.events(league); if (!evs.length) return null;
    const played = evs.filter(e => Schedule.all.some(m => m.event === e.id && this.rec(m)));
    return (played[played.length - 1] || evs.find(e => e.end >= Clock.today()) || evs[0]).id;
  },
  // 이변: 전력(주전 OVR 등) 차이가 3 이상 나는 약팀이 이겼을 때
  upset(m) {
    const r = this.rec(m); if (!r) return false;
    const w = r.w === 1 ? r.t1 : r.t2, l = r.w === 1 ? r.t2 : r.t1;
    try { return Season.pw(l) - Season.pw(w) >= 3; } catch (e) { return false; }
  },
  team(id, cls, win) {
    const t = Schedule.team(id);
    if (!t) return `<span class="fx-team tbd ${cls}"><i class="fx-tbd">?</i><b>미정</b></span>`;
    return `<span class="fx-team ${cls} ${win === true ? 'cr-win' : win === false ? 'cr-lose' : ''}">${G.team(t, 'xs')}<b>${UI.esc(t.short)}</b></span>`;
  },

  async render(el) {
    el.innerHTML = '<div class="placeholder-view"><p>대회 결과를 불러오는 중…</p></div>';
    await Portal.ready; await Schedule.load(); await Champions.load();
    const my = Roster.team();
    this.league ||= my.league;
    const evs = this.events(this.league);
    if (!evs.some(e => e.id === this.eventId)) this.eventId = this.pickEvent(this.league);
    const teams = App.db.teams.filter(t => this.league === 'INTL' ? Schedule.all.some(m => m.event === this.eventId && (m.t1 === t.id || m.t2 === t.id)) : t.league === this.league).sort((a, b) => a.short.localeCompare(b.short));
    if (this.teamId !== 'all' && !teams.some(t => t.id === this.teamId)) this.teamId = 'all';
    el.innerHTML = `
      <div class="fx-page">
        <div class="fx-main">
          <div class="card rs-head">
            <div class="rs-title"><h2>대회 결과 <small>${Schedule.season()} 시즌</small></h2>
              <span>다른 팀 경기까지 모든 결과를 봅니다 · 경기를 누르면 세트별 리포트</span></div>
            <div class="rs-stats cr-sum"></div>
          </div>
          <div class="ch-bar">
            <div class="seg cr-lg">${['LCK', 'LPL', 'LEC', 'LCS', 'INTL'].map(l => `<button class="${this.league === l ? 'on' : ''}" data-l="${l}">${l === 'INTL' ? '국제대회' : l}</button>`).join('')}</div>
            <select class="ch-sort cr-ev">${evs.map(e => `<option value="${e.id}" ${this.eventId === e.id ? 'selected' : ''}>${UI.esc(e.label)}</option>`).join('') || '<option>대회 없음</option>'}</select>
            <select class="ch-sort cr-tm"><option value="all">모든 팀</option>${teams.map(t => `<option value="${t.id}" ${this.teamId === t.id ? 'selected' : ''}>${UI.esc(t.name)}</option>`).join('')}</select>
            <div class="seg cr-st">${[['done', '결과'], ['next', '예정'], ['all', '전체']].map(([k, n]) => `<button class="${this.status === k ? 'on' : ''}" data-s="${k}">${n}</button>`).join('')}</div>
          </div>
          <div class="fx-list cr-list"></div>
        </div>
        <aside class="card fx-side cr-side"></aside>
      </div>`;
    $('.cr-lg', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.league = b.dataset.l; this.eventId = null; this.teamId = 'all'; this.render(el); };
    $('.cr-ev', el).onchange = e => { this.eventId = e.target.value; this.render(el); };
    $('.cr-tm', el).onchange = e => { this.teamId = e.target.value; this.draw(el); };
    $('.cr-st', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.status = b.dataset.s; $$('.cr-st button', el).forEach(x => x.classList.toggle('on', x === b)); this.draw(el); };
    $('.cr-list', el).onclick = e => { const r = e.target.closest('[data-mid]'); if (r) { e.stopPropagation(); this.report(r.dataset.mid); } };
    $('.cr-side', el).onclick = e => { const r = e.target.closest('[data-mid]'), p = e.target.closest('[data-pid]'); if (r) this.report(r.dataset.mid); else if (p) Player.open(p.dataset.pid); };
    this.draw(el);
  },

  draw(el) {
    const my = App.state.teamId, all = Schedule.all.filter(m => m.event === this.eventId && !m.dead);
    let list = all.filter(m => this.teamId === 'all' || m.t1 === this.teamId || m.t2 === this.teamId);
    if (this.status === 'done') list = list.filter(m => this.rec(m));
    if (this.status === 'next') list = list.filter(m => !this.rec(m));
    list.sort((a, b) => this.status === 'done' ? b.t.localeCompare(a.t) || b.order - a.order : a.t.localeCompare(b.t));   // 결과는 최근 경기부터
    const done = all.filter(m => this.rec(m)), ev = Schedule.byEvent[this.eventId];
    $('.cr-sum', el).innerHTML = `<div><span class="k">치른 경기</span><b>${done.length} / ${all.length}</b></div><div><span class="k">이변</span><b>${done.filter(m => this.upset(m)).length}</b></div><div><span class="k">기간</span><b>${ev ? ev.start.slice(5).replace('-', '.') + '–' + ev.end.slice(5).replace('-', '.') : '-'}</b></div>`;
    let lastMonth = '', lastDay = '';
    $('.cr-list', el).innerHTML = list.length ? list.map(m => {
      const r = this.rec(m), ym = m.t.slice(0, 7), day = m.t.slice(0, 10);
      const head = ym !== lastMonth ? `<h3 class="fx-month">${+ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월</h3>` : '';
      const dayCell = day !== lastDay ? `<div class="fx-day"><b>${+day.slice(8)}</b><span>${Fmt.dow(day)}</span></div>` : '<div class="fx-day"></div>';
      lastMonth = ym; lastDay = day;
      const t1 = r ? r.t1 : m.t1, t2 = r ? r.t2 : m.t2, w1 = r ? r.w === 1 : null;
      return `${head}
        <div class="fx-row cr-row ${t1 === my || t2 === my ? 'mine' : ''} ${r ? 'played' : ''}" ${r ? `data-mid="${m.id}"` : ''}>
          ${dayCell}
          <span class="fx-time num">${m.t.slice(11, 16)}</span>
          <span class="fx-tab cr-tab">${UI.esc(G.tab(m.tab))}</span>
          <div class="fx-vs">${this.team(t1, 'l', r ? w1 : null)}${r ? `<b class="fx-score">${r.s1} : ${r.s2}</b>` : '<i>vs</i>'}${this.team(t2, 'r', r ? !w1 : null)}</div>
          <span class="fx-bo">Bo${m.bo}</span>
          <span class="cr-tag">${r ? (this.upset(m) ? '<em class="cr-upset">이변</em>' : '') + '<i class="cr-go">리포트 ›</i>' : ''}</span>
        </div>`;
    }).join('') : `<div class="card fx-empty"><b>${this.status === 'done' ? '아직 치른 경기가 없습니다' : '남은 경기가 없습니다'}</b>${ev && !Schedule.released(ev) ? `<span>${UI.esc(ev.short)} 대진은 ${Fmt.dayLabel(ev.pub)}경 발표됩니다.</span>` : ''}</div>`;
    $('.cr-side', el).innerHTML = this.side(all, done);
  },

  // 오른쪽: 이 대회 순위(정규 단계) · 이변 · 최다 POG
  side(all, done) {
    const ev = Schedule.byEvent[this.eventId]; if (!ev) return '';
    let html = `<h3 class="fx-side-h">${UI.esc(ev.label)}</h3>`;
    if (ev.kind === 'regular' && ev.league !== 'INTL') {
      const rows = Results.table(ev.league, [ev.id]).slice(0, 10), my = App.state.teamId;
      html += rows.length ? `<h4>순위</h4><table class="rs-table cr-mini"><tbody>${rows.map((r, i) => `<tr class="${r.t.id === my ? 'mine' : ''}"><td class="num">${i + 1}</td><td><span class="fx-team">${G.team(r.t, 'xs')}<b>${UI.esc(r.t.short)}</b></span></td><td class="num">${r.w}-${r.l}</td><td class="num ${r.sw - r.sl > 0 ? 'good' : r.sw - r.sl < 0 ? 'bad' : ''}">${r.sw - r.sl > 0 ? '+' : ''}${r.sw - r.sl}</td></tr>`).join('')}</tbody></table>` : '';
    }
    const champ = done.length === all.length && all.length ? (() => { const f = [...all].sort((a, b) => b.t.localeCompare(a.t))[0], r = this.rec(f); return r && /final|결승/i.test(f.tab || '') ? Schedule.team(r.w === 1 ? r.t1 : r.t2) : null; })() : null;
    if (champ) html += `<div class="cr-champ">🏆 우승 <span class="fx-team">${G.team(champ, 'xs')}<b>${UI.esc(champ.name)}</b></span></div>`;
    const ups = done.filter(m => this.upset(m)).sort((a, b) => b.t.localeCompare(a.t)).slice(0, 5);
    html += `<h4>이변 <small>${ups.length ? '' : '없음'}</small></h4>${ups.map(m => { const r = this.rec(m); return `<div class="fx-row compact cr-row played" data-mid="${m.id}"><span class="fx-time num">${m.t.slice(5, 10).replace('-', '.')}</span><div class="fx-vs">${this.team(r.t1, 'l', r.w === 1)}<b class="fx-score">${r.s1} : ${r.s2}</b>${this.team(r.t2, 'r', r.w === 2)}</div></div>`; }).join('')}`;
    const pog = {};
    done.forEach(m => (this.rec(m).games || []).forEach(g => { if (g.mvp) pog[g.mvp] = (pog[g.mvp] || 0) + 1; }));
    const top = Object.entries(pog).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length) html += `<h4>POG 순위</h4>${top.map(([pid, n]) => { const x = Player.find(pid); return `<div class="cr-pog" data-pid="${pid}">${x ? G.team(x.t, 'xs') : ''}<b>${UI.esc(x ? x.p.name : pid)}</b><span class="num">${n}회</span></div>`; }).join('')}`;
    return html;
  },

  // 빠른 시뮬(다른 팀끼리)은 밴픽 기록이 없다: 처음 리포트를 열 때 그 경기 두 팀 코치가 했을 법한 밴픽을 한 번 만들어 둔다
  fillPicks(m, r) {
    if (typeof Draft === 'undefined') return;
    const prev = [];
    r.games.forEach((g, i) => {
      if (!g.picks || !g.picks.B.length) {
        try {
          const series = { key: 'view:' + m.id, bo: m.bo || 1, games: prev.map(x => ({ game: x.game, picks: x.picks, result: {} })) };
          const S = Draft.make({ series, teams: g.teams || { B: r.t1, R: r.t2 }, us: null, official: false });
          Draft.auto(S);
          g.picks = { B: S.picks.B.map(p => p.c), R: S.picks.R.map(p => p.c) }; g.pp = { B: S.picks.B.map(p => p.pid), R: S.picks.R.map(p => p.pid) }; g.gen = 1;
        } catch (e) { g.picks = { B: [], R: [] }; }
      }
      prev.push({ game: i + 1, picks: { B: g.picks.B.map(c => ({ c })), R: g.picks.R.map(c => ({ c })) } });
    });
  },

  report(mid) {
    const m = Schedule.all.find(x => x.id === mid), r = m && this.rec(m); if (!r) return;
    this.fillPicks(m, r);
    const t1 = Schedule.team(r.t1), t2 = Schedule.team(r.t2), ev = Schedule.eventOf(m), nm = id => { const x = Player.find(id); return x ? x.p.name : '?'; };
    const sets = (r.games || []).map((g, i) => {
      const teams = g.teams || { B: r.t1, R: r.t2 }, k = g.k || { B: 0, R: 0 }, side = s => Schedule.team(teams[s]);
      const won = s => teams[s] === g.win;
      const stats = g.s && g.s.length ? g.s : null;
      const lane = s => (g.picks && g.picks[s] || []).map((c, j) => {
        const st = stats && stats.find(x => x[1] === c), pid = !st && g.pp && g.pp[s][j];
        return `<div class="cr-pk">${SoloQ.ic(c)}<span>${st ? `<b>${UI.esc(Player.find(st[0]) ? nm(st[0]) : st[6] || '?')}</b><small class="num">${st[2]}/${st[3]}/${st[4]} · CS ${st[5]} · ${UI.esc((Champions.byId[c] || {}).name || '')}</small>` : `${pid ? `<b>${UI.esc(nm(pid))}</b>` : ''}<small>${UI.esc((Champions.byId[c] || {}).name || '')}</small>`}</span></div>`;
      }).join('');
      return `<div class="cr-set">
        <div class="cr-set-h"><b>${i + 1}세트</b><span class="num">${Sim.clock(g.t || 0)}</span><span>POG <b>${UI.esc(g.mvp ? nm(g.mvp) : '-')}</b></span></div>
        <div class="cr-set-b">
          <div class="cr-side-col ${won('B') ? 'w' : 'l'}"><div class="cr-sh"><i class="cr-blue">블루</i>${side('B') ? G.team(side('B'), 'xs') : ''}<b>${UI.esc((side('B') || {}).short || '')}</b><em>${won('B') ? '승' : '패'}</em><span class="num">${k.B}킬</span></div>${lane('B')}</div>
          <div class="cr-side-col ${won('R') ? 'w' : 'l'}"><div class="cr-sh"><i class="cr-red">레드</i>${side('R') ? G.team(side('R'), 'xs') : ''}<b>${UI.esc((side('R') || {}).short || '')}</b><em>${won('R') ? '승' : '패'}</em><span class="num">${k.R}킬</span></div>${lane('R')}</div>
        </div>
        ${g.gen ? '<small class="cr-note">빠른 시뮬 경기: 세트 결과 · POG만 기록되고, 밴픽은 두 팀 코치 성향으로 정리했습니다 (선수별 KDA 없음)</small>' : ''}
      </div>`;
    }).join('');
    UI.modal({
      title: `<div class="cr-mh"><b>${UI.esc(t1.name)}</b><span class="num">${r.s1} : ${r.s2}</span><b>${UI.esc(t2.name)}</b></div><small class="cr-msub">${UI.esc(ev ? ev.label : '')} · ${UI.esc(G.tab(m.tab))} · ${m.t.slice(0, 10).replace(/-/g, '.')} · Bo${m.bo}${this.upset(m) ? ' · <em class="cr-upset">이변</em>' : ''}</small>`,
      body: `<div class="cr-report">${sets || '<p class="ms-none">세트 기록이 없습니다.</p>'}</div>`,
    });
  },
};

Views['match-results'] = el => CompResults.render(el);

// 선수 기록 (대회별) + 경기 > 선수 통계 화면 (베타 건의)
//   세트마다 [pid, 챔피언, K, D, A, CS, 이름, 피해량] 기록을 대회 단위로 쌓는다. 정밀 엔진 경기와 빠른 시뮬 경기 모두 같은 형식
//   App.state.pst[대회 id][pid] = [세트, 승, K, D, A, CS, 피해량, 초, POG, 평점 합, 팀 킬 합, 팀 id]
const PStats = {
  st() { return (App.state.pst ||= {}); },
  add(series, m) {
    if (!m || !m.event) return;
    const E = (this.st()[m.event] ||= {});
    series.games.forEach(x => {
      const res = x.result; if (!res || !res.stats || res.stats.length !== 10) return;
      res.stats.forEach((s, i) => {
        const [pid, , k, d, a, cs, , dmg] = s; if (!pid || String(pid).startsWith('x')) return;
        const side = i < 5 ? 'B' : 'R', tid = (res.teams || {})[side], won = tid === res.win, pog = res.mvp === pid;
        const r = (E[pid] ||= [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, tid]);
        r[0]++; r[1] += won ? 1 : 0; r[2] += k; r[3] += d; r[4] += a; r[5] += cs || 0; r[6] += dmg || 0; r[7] += res.t || 1800; r[8] += pog ? 1 : 0;
        r[9] = Math.round((r[9] + Math.max(3, Math.min(10, Season.rating(k, d, a, won, pog)))) * 10) / 10; r[10] += (res.kills || {})[side] || 0; r[11] = tid;
      });
    });
  },
  // 여러 대회 합치기 → 표 한 줄
  rows(ids) {
    const S = this.st(), acc = {};
    ids.forEach(id => Object.entries(S[id] || {}).forEach(([pid, r]) => { const a = (acc[pid] ||= Array(12).fill(0)); for (let i = 0; i < 11; i++) a[i] += r[i]; a[11] = r[11]; }));
    return Object.entries(acc).map(([pid, r]) => {
      const h = Player.find(pid), g = r[0] || 1, min = r[7] / 60 || 1;
      return { pid, p: h ? h.p : { id: pid, name: pid, role: '' }, t: Schedule.team(r[11]) || (h && h.t), g: r[0], w: r[1], k: r[2], d: r[3], a: r[4],
        kda: (r[2] + r[4]) / Math.max(1, r[3]), kp: r[10] ? (r[2] + r[4]) / r[10] : 0, cspm: r[5] / min, dpm: r[6] / min, rat: r[9] / g, pog: r[8], wr: r[1] / g };
    });
  },
  // 연도 · 리그 전체 (시상 근거)
  yearRows(Y, lg) { return this.rows(Object.keys(this.st()).filter(id => id.startsWith(Y + ':') && (!lg || (Schedule.byEvent[id] || {}).league === lg))); },
  basis(pid, Y, lg = 'LCK') { const r = this.yearRows(Y, lg).find(x => x.pid === pid); return r ? `평점 ${r.rat.toFixed(1)} · KDA ${r.kda.toFixed(1)} · POG ${r.pog}` : ''; },

  // ---------- 화면 ----------
  f: { league: null, ev: 'all', role: 'ALL', min: 'auto', sort: 'rat', desc: true },
  COLS: [['g', '세트'], ['wr', '승률'], ['k', 'K'], ['d', 'D'], ['a', 'A'], ['kda', 'KDA'], ['kp', '킬관여'], ['cspm', 'CS/분'], ['dpm', 'DPM'], ['rat', '평점'], ['pog', 'POG']],
  async view(el) {
    await Portal.ready; await Schedule.load();
    const f = this.f, my = Roster.team(); f.league ||= my.league;
    const Y = Schedule.season(), evs = Schedule.events.filter(e => e.year === Y && (f.league === 'INTL' ? e.league === 'INTL' : e.league === f.league) && this.st()[e.id]);
    if (f.ev !== 'all' && !evs.some(e => e.id === f.ev)) f.ev = 'all';
    let rows = this.rows(f.ev === 'all' ? evs.map(e => e.id) : [f.ev]).filter(r => f.role === 'ALL' || r.p.role === f.role);
    const mx = Math.max(0, ...rows.map(r => r.g)), minG = f.min === 'auto' ? Math.max(1, Math.floor(mx * .4)) : +f.min;
    rows = rows.filter(r => r.g >= minG).sort((a, b) => (f.desc ? -1 : 1) * ((a[f.sort] || 0) - (b[f.sort] || 0)) || b.rat - a.rat);
    const fmt = (k, v) => k === 'wr' || k === 'kp' ? Math.round(v * 100) + '%' : ['kda', 'cspm', 'rat'].includes(k) ? v.toFixed(1) : k === 'dpm' ? Math.round(v) : v;
    const sel = (k, opts) => `<select class="ch-sort" data-ps="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(f[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head"><div class="rs-title"><h2>선수 통계 <small>${Y} 시즌</small></h2><span>모든 공식 경기의 세트 기록 · 열 이름을 누르면 정렬 · 선수를 누르면 프로필</span></div></div>
        <div class="ch-bar">
          <div class="seg ps-lg">${['LCK', 'LPL', 'LEC', 'LCS', 'INTL'].map(l => `<button class="${f.league === l ? 'on' : ''}" data-l="${l}">${l === 'INTL' ? '국제대회' : l}</button>`).join('')}</div>
          ${sel('ev', [['all', '시즌 전체'], ...evs.map(e => [e.id, e.label])])}
          ${sel('role', [['ALL', '모든 포지션'], ...G.ROLES.map(r => [r, G.ROLE_KO[r]])])}
          ${sel('min', [['auto', `최소 출전 자동 (${minG}세트)`], ['1', '1세트 이상'], ['5', '5세트 이상'], ['10', '10세트 이상'], ['20', '20세트 이상']])}
          <span class="ch-count">${rows.length}명</span>
        </div>
        <div class="card rs-table-wrap" style="padding:0">
          ${rows.length ? `<table class="rs-table ps-table"><thead><tr><th class="num">#</th><th>선수</th><th>팀</th>${this.COLS.map(([k, l]) => `<th class="num ps-h ${f.sort === k ? 'on' : ''}" data-k="${k}">${l}${f.sort === k ? (f.desc ? ' ▼' : ' ▲') : ''}</th>`).join('')}</tr></thead>
          <tbody>${rows.slice(0, 150).map((r, i) => `<tr data-pid="${r.pid}" class="${r.t && r.t.id === my.id ? 'mine' : ''}"><td class="num">${i + 1}</td><td><span class="ps-pl">${G.pos(r.p.role)}<b>${UI.esc(r.p.name)}</b></span></td><td>${r.t ? `<span class="fx-team">${G.team(r.t, 'xs')}<b>${UI.esc(r.t.short)}</b></span>` : '-'}</td>${this.COLS.map(([k]) => `<td class="num ${f.sort === k ? 'ps-on' : ''}">${fmt(k, r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`
          : `<div class="fx-empty" style="padding:30px"><b>아직 기록이 없습니다</b><span>경기가 끝나면 세트 기록이 쌓입니다.</span></div>`}
        </div>
      </div>`;
    $('.ps-lg', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; f.league = b.dataset.l; f.ev = 'all'; this.view(el); };
    $$('select[data-ps]', el).forEach(s => s.onchange = () => { f[s.dataset.ps] = s.value; this.view(el); });
    $$('.ps-h', el).forEach(h => h.onclick = () => { const k = h.dataset.k; if (f.sort === k) f.desc = !f.desc; else { f.sort = k; f.desc = k !== 'd'; } this.view(el); });
    const tb = $('.ps-table', el); if (tb) tb.onclick = e => { const r = e.target.closest('[data-pid]'); if (r) Player.open(r.dataset.pid); };
  },
};
Views['match-stats'] = el => PStats.view(el);
Engine.on(() => {
  const Y = Schedule.season && Schedule.season(); if (!Y || (App.state.pruned || 0) >= Y - 1) return;
  const my = App.state.teamId, S = App.state.season || {};
  (Schedule.all || []).forEach(m => { if (m.year >= Y || m.t1 === my || m.t2 === my) return; const r = S[m.id]; if (r && r.games) r.games.forEach(g => { delete g.s; delete g.picks; delete g.pp; }); });
  App.state.pruned = Y - 1;
});

// Season.rate 뒤에 대회별 기록을 쌓는다 (Awards 보강 다음)
(() => { const rate = Season.rate.bind(Season); Season.rate = (series, m) => { rate(series, m); try { PStats.add(series, m); } catch (e) { console.warn('[pstats]', e); } }; })();

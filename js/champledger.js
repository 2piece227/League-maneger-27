// 챔피언 통계 (베타 건의): 대회별 챔피언 픽 · 승률 · 많이 쓴 선수, 선수별 챔피언 사용 횟수 · 승률, 통산
//   세트 기록 [pid, 챔피언, K, D, A, …]을 대회 단위로 쌓는다. 선수 통계 장부(PStats)는 챔피언을 버리고 합계만 쌓아서 따로 둔다.
//   App.state.cst[대회 id] = { n: 세트 수, c: { 챔피언: [판, 승, K, D, A] }, p: { pid: { 챔피언: [판, 승, K, D, A] } } }
//   이 기능을 넣은 뒤 치른 경기부터 쌓인다 (지난 시즌 세트 기록은 용량 때문에 정리돼 소급할 수 없다)
const CLedger = {
  st() { return (App.state.cst ||= {}); },
  add(series, m) {
    if (!m || !m.event) return;
    const E = (this.st()[m.event] ||= { n: 0, c: {}, p: {} });
    series.games.forEach(x => {
      const res = x.result; if (!res || !res.stats || res.stats.length !== 10) return;
      E.n++;
      res.stats.forEach((s, i) => {
        const [pid, c, k, d, a] = s; if (!c) return;
        const won = (res.teams || {})[i < 5 ? 'B' : 'R'] === res.win, put = r => { r[0]++; r[1] += won ? 1 : 0; r[2] += k || 0; r[3] += d || 0; r[4] += a || 0; };
        put(E.c[c] ||= [0, 0, 0, 0, 0]);
        if (pid && !String(pid).startsWith('x')) put((E.p[pid] ||= {})[c] ||= [0, 0, 0, 0, 0]);
      });
    });
  },
  // 여러 대회 합치기
  merge(ids) {
    const S = this.st(), out = { n: 0, c: {}, p: {} }, plus = (a, b) => { for (let i = 0; i < 5; i++) a[i] += b[i]; };
    ids.forEach(id => { const E = S[id]; if (!E) return; out.n += E.n;
      Object.entries(E.c).forEach(([c, r]) => plus(out.c[c] ||= [0, 0, 0, 0, 0], r));
      Object.entries(E.p).forEach(([pid, m]) => Object.entries(m).forEach(([c, r]) => plus((out.p[pid] ||= {})[c] ||= [0, 0, 0, 0, 0], r))); });
    return out;
  },
  // 선수 한 명의 챔피언 기록 (통산 · 판수 순)
  ofPlayer(pid, ids = Object.keys(this.st())) {
    const M = this.merge(ids).p[pid] || {};
    return Object.entries(M).map(([c, r]) => ({ c, g: r[0], w: r[1], kda: (r[2] + r[4]) / Math.max(1, r[3]) })).sort((a, b) => b.g - a.g || b.w - a.w);
  },

  // ---------- 화면 ----------
  f: { league: null, ev: 'all', mode: 'champ', team: 'all', sort: 'g', desc: true },
  async view(el) {
    await Portal.ready; await Schedule.load(); await Champions.load();
    const f = this.f, my = Roster.team(); f.league ||= my.league;
    const Y = Schedule.season(), S = this.st();
    const evs = Schedule.events.filter(e => (f.league === 'INTL' ? e.league === 'INTL' : e.league === f.league) && S[e.id]);
    const cur = evs.filter(e => e.year === Y);
    if (!['all', 'career'].includes(f.ev) && !evs.some(e => e.id === f.ev)) f.ev = 'all';
    const ids = f.ev === 'all' ? cur.map(e => e.id) : f.ev === 'career' ? evs.map(e => e.id) : [f.ev];
    const M = this.merge(ids), pc = v => Math.round(v * 100) + '%', nm = c => (Champions.byId[c] || { name: c }).name;
    const who = pid => (Player.find(pid) || { p: { name: pid } }).p.name;
    const sel = (k, opts) => `<select class="ch-sort" data-cs="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(f[k]) === String(v) ? 'selected' : ''}>${UI.esc(l)}</option>`).join('')}</select>`;
    const th = (k, l) => `<th class="num cs-h ${f.sort === k ? 'on' : ''}" data-k="${k}">${l}${f.sort === k ? (f.desc ? ' ▼' : ' ▲') : ''}</th>`;
    const ord = (rows, tie) => rows.sort((a, b) => (f.desc ? -1 : 1) * ((a[f.sort] ?? 0) - (b[f.sort] ?? 0)) || tie(a, b));
    let body = '', count = '';
    if (f.mode === 'champ') {
      const rows = ord(Object.entries(M.c).map(([c, r]) => {
        const users = Object.entries(M.p).map(([pid, m]) => [pid, (m[c] || [0, 0])]).filter(x => x[1][0]).sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1]).slice(0, 3);
        return { c, g: r[0], w: r[1], wr: r[1] / r[0], pr: M.n ? r[0] / M.n : 0, kda: (r[2] + r[4]) / Math.max(1, r[3]), users };
      }), (a, b) => b.g - a.g);
      count = `${rows.length}개 챔피언 · ${M.n}세트`;
      body = rows.length ? `<table class="rs-table cs-table"><thead><tr><th class="num">#</th><th>챔피언</th>${th('g', '픽')}${th('pr', '픽률')}${th('w', '승')}${th('wr', '승률')}${th('kda', 'KDA')}<th>많이 쓴 선수</th></tr></thead>
        <tbody>${rows.map((x, i) => `<tr><td class="num">${i + 1}</td><td><div class="ms-c">${SoloQ.ic(x.c)}${UI.esc(nm(x.c))}</div></td><td class="num">${x.g}</td><td class="num">${pc(x.pr)}</td><td class="num">${x.w}</td><td class="num ${x.g >= 3 ? (x.wr >= .6 ? 'good' : x.wr <= .4 ? 'bad' : '') : ''}">${pc(x.wr)}</td><td class="num">${x.kda.toFixed(1)}</td>
          <td class="cs-users">${x.users.map(([pid, r]) => `<span data-pid="${pid}"><b>${UI.esc(who(pid))}</b> ${r[0]}판 ${pc(r[1] / r[0])}</span>`).join('')}</td></tr>`).join('')}</tbody></table>` : '';
    } else {
      let rows = Object.entries(M.p).map(([pid, m]) => {
        const h = Player.find(pid), list = Object.entries(m).map(([c, r]) => ({ c, g: r[0], w: r[1] })).sort((a, b) => b.g - a.g || b.w - a.w);
        const g = list.reduce((s, x) => s + x.g, 0), w = list.reduce((s, x) => s + x.w, 0);
        return { pid, p: h ? h.p : { name: pid, role: '' }, t: h && h.t, g, w, wr: g ? w / g : 0, n: list.length, list };
      });
      const tms = [...new Map(rows.filter(r => r.t).map(r => [r.t.id, r.t])).values()].sort((a, b) => a.short.localeCompare(b.short));
      if (f.team !== 'all' && !tms.some(t => t.id === f.team)) f.team = 'all';
      rows = ord(rows.filter(r => f.team === 'all' || (r.t && r.t.id === f.team)), (a, b) => b.g - a.g);
      count = `${rows.length}명`;
      body = (rows.length ? `<div class="cs-team">${sel('team', [['all', '모든 팀'], ...tms.map(t => [t.id, t.name])])}</div>` : '') + (rows.length ? `<table class="rs-table cs-table"><thead><tr><th class="num">#</th><th>선수</th><th>팀</th>${th('g', '세트')}${th('wr', '승률')}${th('n', '챔피언 수')}<th>챔피언 (판 · 승률)</th></tr></thead>
        <tbody>${rows.slice(0, 200).map((r, i) => `<tr data-pid="${r.pid}" class="${r.t && r.t.id === my.id ? 'mine' : ''}"><td class="num">${i + 1}</td><td><span class="ps-pl">${G.pos(r.p.role)}<b>${UI.esc(r.p.name)}</b></span></td><td>${r.t ? `<span class="fx-team">${G.team(r.t, 'xs')}<b>${UI.esc(r.t.short)}</b></span>` : '-'}</td><td class="num">${r.g}</td><td class="num">${pc(r.wr)}</td><td class="num">${r.n}</td>
          <td class="cs-pool">${r.list.slice(0, 6).map(x => `<span title="${UI.esc(nm(x.c))} ${x.g}판 ${x.w}승">${SoloQ.ic(x.c)}<small>${x.g} · ${pc(x.w / x.g)}</small></span>`).join('')}</td></tr>`).join('')}</tbody></table>` : '');
    }
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head"><div class="rs-title"><h2>챔피언 통계 <small>${f.ev === 'career' ? '통산' : `${Y} 시즌`}</small></h2><span>공식 경기 세트 기록 · 열 이름을 누르면 정렬 · 선수를 누르면 프로필 · 이 화면이 생긴 뒤 치른 경기부터 집계됩니다</span></div></div>
        <div class="ch-bar">
          <div class="seg cs-md">${[['champ', '챔피언별'], ['player', '선수별']].map(([v, l]) => `<button class="${f.mode === v ? 'on' : ''}" data-m="${v}">${l}</button>`).join('')}</div>
          <div class="seg cs-lg">${['LCK', 'LPL', 'LEC', 'LCS', 'INTL'].map(l => `<button class="${f.league === l ? 'on' : ''}" data-l="${l}">${l === 'INTL' ? '국제대회' : l}</button>`).join('')}</div>
          ${sel('ev', [['all', `${Y} 시즌 전체`], ['career', '통산 (모든 시즌)'], ...evs.slice().reverse().map(e => [e.id, e.label])])}
          <span class="ch-count">${count}</span>
        </div>
        <div class="card rs-table-wrap" style="padding:0">${body || `<div class="fx-empty" style="padding:30px"><b>아직 기록이 없습니다</b><span>이 화면이 생긴 뒤 치른 공식 경기부터 챔피언 기록이 쌓입니다.</span></div>`}</div>
      </div>`;
    $('.cs-md', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; f.mode = b.dataset.m; f.sort = 'g'; f.desc = true; this.view(el); };
    $('.cs-lg', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; f.league = b.dataset.l; f.ev = 'all'; f.team = 'all'; this.view(el); };
    $$('select[data-cs]', el).forEach(s => s.onchange = () => { f[s.dataset.cs] = s.value; this.view(el); });
    $$('.cs-h', el).forEach(h => h.onclick = () => { const k = h.dataset.k; if (f.sort === k) f.desc = !f.desc; else { f.sort = k; f.desc = true; } this.view(el); });
    el.querySelectorAll('.cs-table').forEach(tb => tb.onclick = e => { const r = e.target.closest('[data-pid]'); if (r) Player.open(r.dataset.pid); });
  },
};
Views['match-champ-stats'] = el => CLedger.view(el);

// Season.rate 뒤에 챔피언 기록을 쌓는다 (PStats와 같은 자리)
(() => { const rate = Season.rate.bind(Season); Season.rate = (series, m) => { rate(series, m); try { CLedger.add(series, m); } catch (e) { console.warn('[cledger]', e); } }; })();

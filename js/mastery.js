// 로스터 > 챔피언 숙련도: 최근 3시즌 프로 경기 기록 기반 챔피언 폭 + 시그니처
const Mastery = {
  pools: null,
  meta: null,
  selId: null,
  sort: 'm',

  load() {
    if (!this._p) {
      this._p = Promise.all([
        Champions.load(),
        fetch('data/champion-pools.json').then(r => r.ok ? r.json() : { pools: {}, meta: {} }).catch(() => ({ pools: {}, meta: {} })),
      ]).then(([, d]) => { this.base = d.pools || {}; this.meta = d.meta; this.merge(); this.recalc(); });
    }
    return this._p;
  },

  // 원본 기록 → 숙련도(솔랭+대회)와 시그니처. 솔랭·대회 결과가 쌓이면 다시 호출한다.
  // 특성: 솔랭의 제왕(솔랭 경험치) · 백호/북부대곰(포지션 챔피언 경험치) · 빠른 엔딩(원딜 17까지 빠르게) · 역천괴(모든 챔피언 +1)
  recalc() {
    const M = MasteryModel, T = typeof Traits !== 'undefined' && Traits.cfg ? Traits : null;
    for (const [pid, list] of Object.entries(this.pools)) {
      const solo = T ? T.fx(pid, 'soloqXp', 1) : 1, xr = T && T.fx(pid, 'xpRole', null), fast = T && T.fx(pid, 'xpFast17', null), plus = T ? T.fx(pid, 'mastery', 0) : 0;
      list.forEach(e => {
        const pos = ((Champions.byId[e.c] || {}).positions || [])[0];
        let mul = xr && pos === xr[0] ? xr[1] : 1;
        if (fast && pos === fast[0] && M.calc(e).value < 17) mul *= fast[1];
        const r = M.calc(e, { soloMul: solo * mul, proMul: mul });
        e.xp = r.xp; e.mv = Math.min(M.MAX, r.value + plus); e.m = Math.min(M.MAX, r.level + plus); e.next = r.next; e.need = r.need; e.sig = false;
      });
      list.sort((a, b) => b.mv - a.mv || b.g - a.g);
      list.filter(e => e.m >= M.SIG_MIN).slice(0, M.SIG_MAX).forEach(e => { e.sig = true; });
    }
  },

  // 다음 단계까지 진행도
  progress(e) {
    if (e.m >= MasteryModel.MAX) return '<div class="ms-next max"><i style="width:100%"></i></div>';
    return `<div class="ms-next" title="다음 단계(${e.m + 1})까지 ${Math.round(e.next * 100)}% · 대회 약 ${Math.max(1, Math.ceil(e.need / MasteryModel.PRO_XP))}판 필요"><i style="width:${Math.round(e.next * 100)}%"></i></div>`;
  },

  // ---------- 게임 안에서 쌓이는 기록 (공식전 · 솔랭) ----------
  //   원본(data/champion-pools.json, 2024년 이후 실제 기록)은 그대로 두고, 게임에서 쌓인 판수를 App.state.mx에 따로 모아 합친다.
  //   예전에는 숙련도가 처음 계산된 뒤로 공식전 · 솔랭을 아무리 해도 그대로였다 (베타 제보)
  extra() { return (App.state.mx ||= {}); },
  slot(pid, c) { return ((this.extra()[pid] ||= {})[c] ||= { g: 0, w: 0, k: 0, d: 0, a: 0, s: 0 }); },
  addPro(pid, c, win, k = 0, d = 0, a = 0) { if (!pid || !c) return; const x = this.slot(pid, c); x.g++; if (win) x.w++; x.k += k; x.d += d; x.a += a; this.dirty = true; },
  addSolo(pid, c, n = 1) { if (!pid || !c) return; this.slot(pid, c).s += n; this.dirty = true; },
  merge() {
    const base = this.base || {}, X = this.extra(), out = {};
    for (const [pid, list] of Object.entries(base)) out[pid] = list.map(e => ({ ...e }));
    for (const [pid, cs] of Object.entries(X)) {
      const L = out[pid] ||= [];
      for (const [c, x] of Object.entries(cs)) {
        let e = L.find(y => y.c === c);
        if (!e) { e = { c, g: 0, w: 0, k: 0, d: 0, a: 0, g26: 0 }; L.push(e); }
        const g0 = e.g; e.g += x.g; e.w += x.w; e.k += x.k; e.d += x.d; e.a += x.a; e.g26 = (e.g26 || 0) + x.g;
        e.solo = (g0 ? MasteryModel.estSoloGames(g0) : 0) + x.s;   // 원본 기록이 있으면 그만큼 추정한 솔랭 + 게임 안 솔랭
      }
    }
    this.pools = out;
  },
  refresh() { if (!this.dirty || !this.base) return; this.dirty = false; this.merge(); this.recalc(); if (typeof Contract !== 'undefined') App.db && App.db.teams.forEach(t => t.players.forEach(p => { delete p._sc; })); },
  // 주력 챔피언 (기록이 없는 선수는 포지션 챔피언 6개를 시드로 고정)
  mains(p) {
    const L = this.pool(p.id); if (L.length) return L.map(e => [e.c, e.g + (e.g26 || 0) * 2 + (e.solo || 0) * .05 + 1]);
    const cs = Champions.list.filter(c => (c.positions || []).includes(p.role)); if (!cs.length) return [];
    const r = k => G.rand(p.id, 'mx' + k), pick = []; for (let i = 0; pick.length < Math.min(6, cs.length) && i < 40; i++) { const c = cs[Math.floor(r(i) * cs.length)].id; if (!pick.includes(c)) pick.push(c); }
    return pick.map((c, i) => [c, 6 - i]);
  },
  wpick(list, x) { const tot = list.reduce((s, e) => s + e[1], 0); let v = x * tot; for (const e of list) { v -= e[1]; if (v <= 0) return e[0]; } return list.length ? list[0][0] : null; },
  // 공식전 한 시리즈: 우리 경기(정밀 엔진)는 실제로 쓴 챔피언, 다른 팀끼리의 간이 경기는 주력 챔피언 중에서
  fromSeries(series, m) {
    (series.games || []).forEach((x, gi) => {
      const res = x.result; if (!res) return;
      if (res.stats && res.stats.length) res.stats.forEach(([pid, c, k, d, a]) => { const h = Player.find(pid); this.addPro(pid, c, !!h && h.t.id === res.win, k, d, a); });
      else [m.t1, m.t2].forEach(tid => { const t = Schedule.team(tid); if (!t) return; Draft.lineup(t).forEach(p => { if (!p) return; const c = this.wpick(this.mains(p), G.rand(p.id + m.id + gi, 'mxp')); this.addPro(p.id, c, tid === res.win); }); });
    });
  },
  // 솔랭: 1군 · 2군 선수가 매일 (시즌 중 3판 · 스토브 6판). 연습 지시를 내린 챔피언은 45%
  soloDay(today) {
    const stove = typeof Market !== 'undefined' && Market.stove(today), n = stove ? 6 : 3;
    App.db.teams.forEach(t => { const wide = Coach.has(t, 'pool-wide') ? 1.4 : 1; [...t.players, ...(t.cl || [])].forEach(p => {   // 챔프폭 확장 (코치 특성)
      if (p.role === 'COACH' || p.free) return;
      const pc = typeof SoloQ !== 'undefined' && SoloQ.pracOn ? SoloQ.pracOn(p.id, today) : null, mains = this.mains(p);
      for (let i = 0; i < n; i++) { const x = G.rand(p.id + today, 'mxs' + i); this.addSolo(p.id, pc && x < .45 ? pc : this.wpick(mains, G.rand(p.id + today, 'mxw' + i)), wide); }
    }); });
  },

  // 다른 화면(프로필·밴픽)에서도 쓰는 조회 함수
  pool(pid) { return (this.pools && this.pools[pid]) || []; },
  signatures(pid) { return this.pool(pid).filter(e => e.sig); },

  tier(m) { return m >= MasteryModel.SIG_MIN ? 'm4' : m >= 13 ? 'm3' : m >= 9 ? 'm2' : 'm1'; },
  wr(e) { return Math.round(e.w / e.g * 100); },
  kda(e) { return ((e.k + e.a) / Math.max(1, e.d)).toFixed(1); },

  chip(e, big = false) {
    const c = Champions.byId[e.c];
    if (!c) return '';
    return `
      <div class="ms-chip ${e.sig ? 'sig' : ''} ${big ? 'big' : ''}" title="${UI.esc(c.name)} · ${e.g}판 ${this.wr(e)}% · KDA ${this.kda(e)}">
        <div class="ms-ic"><img src="${c.icon}" alt="" loading="lazy">${e.sig ? '<i class="ms-sig">SIG</i>' : ''}</div>
        <b class="ms-m ${this.tier(e.m)} num">${e.m}</b>
        ${big ? `<span>${UI.esc(c.name)}</span>` : ''}
      </div>`;
  },

  async render(el) {
    el.innerHTML = '<div class="placeholder-view"><p>챔피언 숙련도를 불러오는 중…</p></div>';
    await Promise.all([Portal.ready, this.load()]);
    const t = Roster.team();
    const ps = t.players.filter(p => p.role !== 'COACH')
      .sort((a, b) => (a.sub - b.sub) || G.ROLES.indexOf(a.role) - G.ROLES.indexOf(b.role));
    if (!ps.some(p => p.id === this.selId)) this.selId = ps[0] && ps[0].id;

    const sigs = ps.flatMap(p => this.signatures(p.id).map(e => ({ p, e })));
    const uniq = new Set(ps.flatMap(p => this.pool(p.id).filter(e => e.m >= 13).map(e => e.c)));
    const from = (this.meta.from || '2024').slice(0, 4);

    el.innerHTML = `
      <div class="ms-page">
        <div class="ms-main">
          <div class="card rs-head">
            <div class="rs-title">
              <h2>챔피언 숙련도 <small>${UI.esc(t.name)}</small></h2>
              <span>${from}~${(this.meta.scrapedAt || '').slice(0, 4)} 프로 공식 경기 기록 기준 · 숙련도 0~20 · 단계가 오를수록 필요한 경험이 커짐</span>
            </div>
            <div class="rs-stats">
              <div><span class="k">시그니처</span><b>${sigs.length}</b></div>
              <div><span class="k">숙련 챔피언 (13+)</span><b>${uniq.size}</b></div>
            </div>
          </div>
          <div class="ms-legend">
            <span><i class="ms-m m4">18+</i>최상급</span><span><i class="ms-m m3">13+</i>숙련</span>
            <span><i class="ms-m m2">9+</i>사용 가능</span><span><i class="ms-m m1">~8</i>미숙</span>
            <span><i class="ms-sig static">SIG</i>시그니처 — 리그 최상급 장인 챔피언 (숙련도 18+, 선수당 최대 2개)</span>
          </div>
          <div class="ms-list">${ps.map(p => {
            const pool = this.pool(p.id);
            return `
            <div class="card ms-row ${p.id === this.selId ? 'sel' : ''}" data-id="${p.id}">
              <div class="ms-pl">
                ${G.face(p, 'pl-ph')}
                <div>${G.ovr(p)}<b>${UI.esc(p.name)}</b>${p.sub ? '<i class="sub-tag">후보</i>' : ''}<div class="ms-pl-pos">${G.pos(p.role, true)}<small>${pool.length}개 챔피언 · ${pool.reduce((s, e) => s + e.g, 0)}판</small></div></div>
              </div>
              <div class="ms-chips">${pool.length ? pool.slice(0, 10).map(e => this.chip(e)).join('') : '<span class="ms-none">최근 3시즌 프로 경기 기록 없음</span>'}</div>
            </div>`;
          }).join('')}</div>
        </div>
        <aside class="card ms-detail"></aside>
      </div>`;

    $('.ms-list', el).addEventListener('click', e => {
      const row = e.target.closest('.ms-row');
      if (!row) return;
      this.selId = row.dataset.id;
      $$('.ms-row', el).forEach(r => r.classList.toggle('sel', r === row));
      this.drawDetail(el, ps);
      if (matchMedia('(max-width: 1023px)').matches) $('.ms-detail', el).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    this.drawDetail(el, ps);
  },

  drawDetail(el, ps) {
    const p = ps.find(x => x.id === this.selId);
    const box = $('.ms-detail', el);
    if (!p) { box.innerHTML = ''; return; }
    const pool = [...this.pool(p.id)];
    const by = { m: (a, b) => b.mv - a.mv || b.g - a.g, g: (a, b) => b.g - a.g, wr: (a, b) => this.wr(b) - this.wr(a) || b.g - a.g, g26: (a, b) => b.g26 - a.g26 || b.g - a.g }[this.sort];
    pool.sort(by);
    const th = (k, label) => `<th class="num sortable ${this.sort === k ? 'desc' : ''}" data-sort="${k}">${label}</th>`;
    const sig = this.signatures(p.id);
    box.innerHTML = `
      <div class="ms-d-head">
        ${G.face(p, 'pl-ph')}
        <div><h3>${G.ovr(p, 'lg')}${UI.esc(p.name)}</h3><div class="ms-pl-pos">${G.pos(p.role, true)}<small>${UI.esc(p.nativeName || p.realName || '')}</small></div></div>
      </div>
      ${sig.length ? `<h4>시그니처</h4><div class="ms-sigs">${sig.map(e => this.chip(e, true)).join('')}</div>` : ''}
      <h4>챔피언 풀 <small>${pool.length}개</small></h4>
      ${pool.length ? `
      <div class="ms-table-wrap"><table class="rs-table ms-table">
        <thead><tr><th>챔피언</th>${th('m', '숙련도')}<th>다음 단계</th>${th('g', '판수')}${th('wr', '승률')}<th class="num">KDA</th>${th('g26', (this.meta.recentFrom || '').slice(0, 4) || '최근')}</tr></thead>
        <tbody>${pool.map(e => {
          const c = Champions.byId[e.c];
          return `<tr>
            <td><div class="ms-c"><img src="${c.icon}" alt="" loading="lazy">${UI.esc(c.name)}${e.sig ? '<i class="ms-sig static">SIG</i>' : ''}</div></td>
            <td class="num"><b class="ms-m ${this.tier(e.m)}">${e.m}</b></td>
            <td>${this.progress(e)}</td>
            <td class="num">${e.g}</td>
            <td class="num ${this.wr(e) >= 60 ? 'good' : this.wr(e) < 45 ? 'bad' : ''}">${this.wr(e)}%</td>
            <td class="num">${this.kda(e)}</td>
            <td class="num dim">${e.g26 || '-'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : '<p class="ms-none">기록이 없어 숙련도를 계산할 수 없습니다. <!-- TODO: 기능 연결 — 솔랭·스크림 기반 숙련도 --></p>'}`;
    $$('th[data-sort]', box).forEach(h => h.onclick = () => { this.sort = h.dataset.sort; this.drawDetail(el, ps); });
  },
};

Views['roster-mastery'] = el => Mastery.render(el);
// 매일: 솔랭 숙련도 · 그날 쌓인 기록 반영
document.addEventListener('DOMContentLoaded', () => Engine.on(today => { if (!App.state.teamId || !Mastery.base) return; Mastery.soloDay(today); Mastery.refresh(); }));   // engine.js가 뒤에 읽힌다

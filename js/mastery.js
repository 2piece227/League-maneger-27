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
      ]).then(([, d]) => { this.pools = d.pools; this.meta = d.meta; });
    }
    return this._p;
  },

  // 다른 화면(프로필·밴픽)에서도 쓰는 조회 함수
  pool(pid) { return (this.pools && this.pools[pid]) || []; },
  signatures(pid) { return this.pool(pid).filter(e => e.sig); },

  tier(m) { return m >= 17 ? 'm4' : m >= 13 ? 'm3' : m >= 9 ? 'm2' : 'm1'; },
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
              <span>${from}~2026 프로 공식 경기 기록 기준 · 숙련도 1~20 (판수·승률·KDA)</span>
            </div>
            <div class="rs-stats">
              <div><span class="k">시그니처</span><b>${sigs.length}</b></div>
              <div><span class="k">숙련 챔피언 (13+)</span><b>${uniq.size}</b></div>
            </div>
          </div>
          <div class="ms-legend">
            <span><i class="ms-m m4">17+</i>최상급</span><span><i class="ms-m m3">13+</i>숙련</span>
            <span><i class="ms-m m2">9+</i>사용 가능</span><span><i class="ms-m m1">~8</i>미숙</span>
            <span><i class="ms-sig static">SIG</i>시그니처 — 리그 최상급 장인 챔피언 (숙련도 19+·20판+, 선수당 최대 2개)</span>
          </div>
          <div class="ms-list">${ps.map(p => {
            const pool = this.pool(p.id);
            return `
            <div class="card ms-row ${p.id === this.selId ? 'sel' : ''}" data-id="${p.id}">
              <div class="ms-pl">
                ${G.face(p, 'pl-ph')}
                <div><b>${UI.esc(p.name)}</b>${p.sub ? '<i class="sub-tag">후보</i>' : ''}<div class="ms-pl-pos">${G.pos(p.role, true)}<small>${pool.length}개 챔피언 · ${pool.reduce((s, e) => s + e.g, 0)}판</small></div></div>
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
    const by = { m: (a, b) => b.m - a.m || b.g - a.g, g: (a, b) => b.g - a.g, wr: (a, b) => this.wr(b) - this.wr(a) || b.g - a.g, g26: (a, b) => b.g26 - a.g26 || b.g - a.g }[this.sort];
    pool.sort(by);
    const th = (k, label) => `<th class="num sortable ${this.sort === k ? 'desc' : ''}" data-sort="${k}">${label}</th>`;
    const sig = this.signatures(p.id);
    box.innerHTML = `
      <div class="ms-d-head">
        ${G.face(p, 'pl-ph')}
        <div><h3>${UI.esc(p.name)}</h3><div class="ms-pl-pos">${G.pos(p.role, true)}<small>${UI.esc(p.nativeName || p.realName || '')}</small></div></div>
      </div>
      ${sig.length ? `<h4>시그니처</h4><div class="ms-sigs">${sig.map(e => this.chip(e, true)).join('')}</div>` : ''}
      <h4>챔피언 풀 <small>${pool.length}개</small></h4>
      ${pool.length ? `
      <div class="ms-table-wrap"><table class="rs-table ms-table">
        <thead><tr><th>챔피언</th>${th('m', '숙련도')}${th('g', '판수')}${th('wr', '승률')}<th class="num">KDA</th>${th('g26', '2026')}</tr></thead>
        <tbody>${pool.map(e => {
          const c = Champions.byId[e.c];
          return `<tr>
            <td><div class="ms-c"><img src="${c.icon}" alt="" loading="lazy">${UI.esc(c.name)}${e.sig ? '<i class="ms-sig static">SIG</i>' : ''}</div></td>
            <td class="num"><b class="ms-m ${this.tier(e.m)}">${e.m}</b></td>
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

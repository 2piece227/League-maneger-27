// 로스터 > 1군: 선수단 표(일반/능력치/계약 보기) + 선수 요약 패널 + 코칭스태프
const Roster = {
  view: 'general',
  filter: 'all',
  sort: { key: 'pos', dir: 1 },
  selId: null,

  team() { return App.db.teams.find(t => t.id === App.state.teamId) || App.db.teams[0]; },
  today() { return Clock.today(); },

  // 목업 상태값. 같은 선수는 항상 같은 값. TODO: 기능 연결 — 훈련·경기 시뮬레이션 결과로 교체
  status(p) {
    const r = k => G.rand(p.id, k);
    return {
      condition: Math.round(78 + r('cond') * 22),
      morale: Math.floor(r('mor') * 5),
      form: Array.from({ length: 5 }, (_, i) => (r('f' + i) * 10 + 5).toFixed(1)),
    };
  },
  MORALE: [['낮음', 'bad'], ['보통', 'mid'], ['좋음', 'ok'], ['매우 좋음', 'good'], ['최상', 'best']],

  days(p) {
    return p.contractEnd ? Fmt.daysBetween(this.today(), p.contractEnd) : null;
  },

  months(p) {
    if (!p.contractEnd) return null;
    const a = Fmt.parse(this.today()), b = Fmt.parse(p.contractEnd);
    return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  },

  groupAvg(p, g) {
    const v = Object.values((p.attributes || {})[g] || {});
    return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
  },

  attrCell(v) {
    if (v == null) return '<span class="attr-v">-</span>';
    const c = v >= 16 ? 'a4' : v >= 11 ? 'a3' : v >= 6 ? 'a2' : 'a1';
    return `<span class="attr-v ${c}">${v}</span>`;
  },

  COLS: {
    general: [
      ['pos', '포지션'], ['name', '선수'], ['nation', '국적'], ['age', '나이', 'num'], ['ovr', 'OVR', 'num'],
      ['condition', '컨디션'], ['form', '최근 폼'], ['morale', '사기'],
    ],
    attrs: [
      ['pos', '포지션'], ['name', '선수'], ['physical', '피지컬', 'num'], ['macro', '운영', 'num'],
      ['mental', '멘탈', 'num'], ['role', '포지션 특화', 'num'], ['ovr', 'OVR', 'num'],
    ],
    contract: [
      ['pos', '포지션'], ['name', '선수'], ['age', '나이', 'num'], ['contractEnd', '계약 만료'], ['left', '남은 기간'], ['act', ''],
    ],
  },

  sortVal(p, key) {
    const s = this.status(p);
    switch (key) {
      case 'pos': return (p.sub ? 10 : 0) + Math.max(0, G.ROLES.indexOf(p.role));
      case 'name': return p.name.toLowerCase();
      case 'nation': return G.nationName(p.nation);
      case 'condition': return s.condition;
      case 'morale': return s.morale;
      case 'form': return s.form.reduce((a, x) => a + +x, 0);
      case 'contractEnd': case 'left': return this.months(p) ?? 999;
      case 'physical': case 'macro': case 'mental': case 'role': return this.groupAvg(p, key) ?? 0;
      default: return p[key] ?? 0;
    }
  },

  rows(t) {
    let list = t.players.filter(p => this.filter === 'all' || (this.filter === 'starters' ? !p.sub : p.sub));
    const { key, dir } = this.sort;
    return list.sort((a, b) => {
      const x = this.sortVal(a, key), y = this.sortVal(b, key);
      return (x > y ? 1 : x < y ? -1 : 0) * dir;
    });
  },

  cell(p, key) {
    const s = this.status(p);
    switch (key) {
      case 'pos': return G.pos(p.role, true);
      case 'name': return `<div class="pl-cell">${G.face(p)}<div><b>${UI.esc(p.name)}</b>${p.sub ? '<i class="sub-tag">후보</i>' : ''}<small class="pl-real">${UI.esc(p.nativeName || p.realName || '')}</small></div></div>`;
      case 'nation': return `<span class="nat">${G.flag(p.nation)}${UI.esc(G.nationName(p.nation))}</span>`;
      case 'age': return p.age ?? '-';
      case 'ovr': return `<b class="ovr-v">${p.ovr}</b>`;
      case 'condition': return `<span class="cond"><span class="cond-bar"><i style="width:${s.condition}%" class="${s.condition < 85 ? 'warn' : ''}"></i></span><span class="num">${s.condition}%</span></span>`;
      case 'form': return `<span class="form-pts">${s.form.map(f => `<i class="${+f >= 11 ? 'hi' : +f >= 8 ? 'md' : 'lo'}" title="평점 ${f}">${f}</i>`).join('')}</span>`;
      case 'morale': { const [l, c] = this.MORALE[s.morale]; return `<span class="morale ${c}">${Icons.morale}${l}</span>`; }
      case 'physical': case 'macro': case 'mental': case 'role': return this.attrCell(this.groupAvg(p, key));
      case 'contractEnd': return p.contractEnd ? `<span class="num">${p.contractEnd.replace(/-/g, '.')}</span>` : '-';
      case 'left': {
        const m = this.months(p);
        if (m == null) return '<span class="ct none">정보 없음</span>';
        const dd = this.days(p);
        if (dd < 0) return '<span class="ct exp">만료 (FA)</span>';
        if (dd <= 60) return `<span class="ct exp">D-${dd} · FA 예정</span>`;
        return `<span class="ct ${m <= 12 ? 'soon' : ''}">${m >= 12 ? Math.floor(m / 12) + '년 ' : ''}${m % 12 ? (m % 12) + '개월' : ''}</span>`;
      }
      case 'act': return `<button class="btn-ghost btn-xs" data-renew="${p.id}">재계약</button>`;
      default: return '';
    }
  },

  render(el) {
    const t = this.team();
    if (!t) { el.innerHTML = '<p class="placeholder-view">팀 정보가 없습니다.</p>'; return; }
    if (!t.players.some(p => p.id === this.selId)) this.selId = null;

    const ps = t.players;
    const ages = ps.filter(p => p.age);
    const home = this.homeNation(t);
    const foreign = home ? ps.filter(p => p.nation && p.nation !== home).length : '-';
    const expiring = ps.filter(p => { const dd = this.days(p); return dd != null && dd <= 60; }).length;
    const avg = (arr, f) => arr.length ? (arr.reduce((a, p) => a + f(p), 0) / arr.length).toFixed(1) : '-';
    const cols = this.COLS[this.view];

    el.innerHTML = `
      <div class="roster-page ${this.selId ? 'has-sel' : ''}">
        <div class="rs-main">
          <div class="rs-head panel">
            ${G.team(t, 'lg')}
            <div class="rs-title"><h2>${UI.esc(t.name)} <small>1군</small></h2><span>${t.league} · ${UI.esc(G.nationName(t.city))}</span></div>
            <div class="rs-stats">
              <div><span class="k">선수</span><b class="num">${ps.length}</b></div>
              <div><span class="k">평균 나이</span><b class="num">${avg(ages, p => p.age)}</b></div>
              <div><span class="k">평균 OVR</span><b class="num">${avg(ps, p => p.ovr)}</b></div>
              <div><span class="k">외국인</span><b class="num">${foreign}</b></div>
              <div><span class="k">FA 예정 (60일 내)</span><b class="num ${expiring ? 'warn' : ''}">${expiring}</b></div>
            </div>
          </div>

          <div class="rs-bar">
            <div class="seg">${[['general', '일반'], ['attrs', '능력치'], ['contract', '계약']].map(([k, l]) => `<button class="${this.view === k ? 'on' : ''}" data-view="${k}">${l}</button>`).join('')}</div>
            <div class="chips">${[['all', `전체 ${ps.length}`], ['starters', `주전 ${ps.filter(p => !p.sub).length}`], ['subs', `후보 ${ps.filter(p => p.sub).length}`]].map(([k, l]) => `<button class="chip ${this.filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
            <span class="rs-note">컨디션·폼·사기는 목업 값</span>
          </div>

          <div class="panel rs-table-wrap">
            <table class="rs-table view-${this.view}">
              <thead><tr>${cols.map(([k, l, c]) => `<th class="c-${k} ${c || ''} ${k === 'act' ? '' : 'sortable'} ${this.sort.key === k ? (this.sort.dir > 0 ? 'asc' : 'desc') : ''}" data-sort="${k}">${l}</th>`).join('')}</tr></thead>
              <tbody>${this.rows(t).map(p => `
                <tr class="${p.sub ? 'sub' : ''} ${p.id === this.selId ? 'sel' : ''}" data-id="${p.id}">
                  ${cols.map(([k, , c]) => `<td class="c-${k} ${c || ''}">${this.cell(p, k)}</td>`).join('')}
                </tr>`).join('')}</tbody>
            </table>
          </div>

          ${(t.staff || []).length ? `
          <div class="panel rs-staff">
            <div class="panel-title">코칭스태프</div>
            <div class="staff-grid">${t.staff.map(s => `
              <div class="staff-card">${G.face(s, 'pl-ph md')}<div><b>${UI.esc(s.name)}</b><small>${UI.esc(s.nativeName || s.realName || '')}</small><span class="nat">${G.flag(s.nation)}${UI.esc(G.nationName(s.nation))}</span></div></div>`).join('')}</div>
          </div>` : ''}
        </div>
        <aside class="rs-side" id="rs-side">${this.side(t)}</aside>
      </div>`;

    $$('.seg button', el).forEach(b => b.onclick = () => { this.view = b.dataset.view; this.render(el); });
    $$('.rs-bar .chip', el).forEach(b => b.onclick = () => { this.filter = b.dataset.filter; this.render(el); });
    $$('th.sortable', el).forEach(th => th.onclick = () => {
      const k = th.dataset.sort;
      this.sort = { key: k, dir: this.sort.key === k ? -this.sort.dir : 1 };
      this.render(el);
    });
    $$('.rs-table tbody tr', el).forEach(tr => tr.onclick = e => {
      if (e.target.closest('[data-renew]')) return;
      this.selId = this.selId === tr.dataset.id ? null : tr.dataset.id;
      this.render(el);
      // 좁은 화면에서는 요약 패널이 표 위에 붙으므로 그쪽으로 스크롤
      if (this.selId && matchMedia('(max-width: 1023px)').matches) $('#rs-side', el).scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    $$('[data-renew]', el).forEach(b => b.onclick = () => GameStubs.openContractTalks(b.dataset.renew));
    const close = $('#rs-close', el);
    if (close) close.onclick = () => { this.selId = null; this.render(el); };
    const prof = $('#rs-profile', el);
    if (prof) prof.onclick = () => GameStubs.openPlayerProfile(this.selId);
  },

  homeNation(t) {
    return { LCK: 'South Korea', LPL: 'China', LCS: 'United States' }[t.league] || null;
  },

  side(t) {
    const p = t.players.find(x => x.id === this.selId);
    if (!p) return `<div class="rs-side-empty">${Icons.role.player}<p>선수를 선택하면<br>요약 정보가 여기에 표시됩니다.</p></div>`;
    const s = this.status(p);
    const a = p.attributes || {};
    const grp = (label, obj, names) => `
      <div class="attr-grp"><h4>${label}</h4>${Object.entries(obj || {}).map(([k, v]) => `<div class="attr-row"><span>${names[k] || k}</span>${this.attrCell(v)}</div>`).join('')}</div>`;
    const [ml, mc] = this.MORALE[s.morale];
    return `
      <div class="rs-card" style="--c:${t.color}">
        <button class="icon-btn rs-x" id="rs-close" title="닫기">✕</button>
        <div class="rs-hero">
          ${G.face(p, 'rs-photo')}
          <div class="rs-id">
            <div class="rs-pos">${G.pos(p.role, true)}${p.sub ? '<i class="sub-tag">후보</i>' : ''}</div>
            <h3>${UI.esc(p.name)}</h3>
            <small>${UI.esc(p.nativeName || '')} ${p.realName ? '· ' + UI.esc(p.realName) : ''}</small>
            <span class="nat">${G.flag(p.nation)}${UI.esc(G.nationName(p.nation))}</span>
          </div>
        </div>
        <div class="rs-facts">
          <div><span class="k">나이</span><b>${p.age ?? '-'}</b><small>${p.birthdate ? p.birthdate.replace(/-/g, '.') : ''}</small></div>
          <div><span class="k">OVR</span><b>${p.ovr}</b><small>1–20</small></div>
          <div><span class="k">컨디션</span><b>${s.condition}%</b><small>목업</small></div>
          <div><span class="k">사기</span><b class="morale ${mc}">${ml}</b><small>목업</small></div>
          <div class="wide"><span class="k">계약 만료</span><b>${p.contractEnd ? p.contractEnd.replace(/-/g, '.') : '정보 없음'}</b><small>${this.cell(p, 'left')}</small></div>
        </div>
        <div class="rs-attrs">
          ${grp(Attributes.groups.physical.label, a.physical, Attributes.groups.physical.keys)}
          ${grp(Attributes.groups.macro.label, a.macro, Attributes.groups.macro.keys)}
          ${grp(Attributes.groups.mental.label, a.mental, Attributes.groups.mental.keys)}
          ${grp('포지션 특화', a.role, Attributes.role[p.role] || {})}
        </div>
        <div class="rs-actions">
          <button class="btn-primary btn-sm" id="rs-profile">선수 프로필</button>
          <button class="btn-ghost btn-sm" data-renew="${p.id}">재계약 협상</button>
        </div>
      </div>`;
  },
};

Views['roster-first-team'] = async el => { await Portal.ready; Roster.render(el); };

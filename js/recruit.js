// 영입: 스카우트 검색 · 관심 목록 · 스카우트 리포트 · FA 시장 · 이적 제안 · 스카우트 배정
const Recruit = {
  f: { league: 'ALL', role: 'ALL', age: 'ALL', nat: 'ALL', contract: 'ALL', q: '', sort: 'value' },
  faStaff: false,

  today() { return Clock.today(); },
  mineId() { return App.state.teamId; },
  pool() { return [...App.db.teams, ...(App.db.free ? [App.db.free] : [])].flatMap(t => t.players.map(p => ({ p, t }))); },
  home(t) { return { LCK: 'South Korea', LPL: 'China', LCS: 'United States' }[t.league]; },

  star(id) { return `<button class="rc-star ${Player.shortlist().includes(id) ? 'on' : ''}" data-star="${id}" title="관심 목록">★</button>`; },
  bindStars(el, redraw) {
    el.addEventListener('click', e => {
      const s = e.target.closest('[data-star]');
      if (s) { e.stopPropagation(); Player.toggleShortlist(s.dataset.star); redraw(); return; }
      const r = e.target.closest('[data-pid]');
      if (r) Player.open(r.dataset.pid);
    });
  },
  playerRow(p, t, extra = '') {
    const [cs, cc] = Player.contractState(p);
    const sig = Mastery.signatures(p.id);
    return `
      <tr data-pid="${p.id}">
        <td>${this.star(p.id)}</td>
        <td><div class="pl-cell">${G.face(p, 'pl-ph')}<div>${G.ovr(p)}<b>${UI.esc(p.name)}</b>${sig.length ? `<i class="ms-sig static">SIG ${sig.length}</i>` : ''}<small class="pl-real">${UI.esc(p.nativeName || p.realName || '')}</small></div></div></td>
        <td><span class="fx-team">${G.team(t, 'xs')}<b>${UI.esc(t.short)}</b></span></td>
        <td>${G.pos(p.role)}</td>
        <td class="num">${p.age || '-'}</td>
        <td><span class="nat">${G.flag(p.nation)}</span></td>
        <td><span class="ct-st ${cc}">${cs}</span></td>
        <td class="num">${Player.money(Player.value(p, t))}</td>
        ${extra}
      </tr>`;
  },

  // ---------- 스카우트 검색 ----------
  async search(el) {
    await Promise.all([Portal.ready, Mastery.load()]);
    const sel = (k, opts) => `<select class="ch-sort" data-f="${k}">${opts.map(([v, l]) => `<option value="${v}" ${this.f[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('스카우트 검색', '4개 리그 1군 선수 전체. 행을 누르면 선수 프로필, ★로 관심 목록에 추가합니다.')}
        <div class="ch-bar">
          <input class="ch-search rc-q" type="search" placeholder="이름 검색" value="${UI.esc(this.f.q)}">
          ${sel('league', [['ALL', '모든 리그'], ['LCK', 'LCK'], ['LPL', 'LPL'], ['LEC', 'LEC'], ['LCS', 'LCS']])}
          ${sel('role', [['ALL', '모든 포지션'], ...G.ROLES.map(r => [r, G.ROLE_KO[r]])])}
          ${sel('age', [['ALL', '모든 나이'], ['u21', '21세 이하'], ['22-25', '22~25세'], ['26+', '26세 이상']])}
          ${sel('nat', [['ALL', '모든 선수'], ['home', '자국 선수'], ['foreign', '외국 선수']])}
          ${sel('contract', [['ALL', '모든 계약'], ['soon', '1년 이내 만료'], ['fa', '만료 임박·FA']])}
          ${sel('sort', [['value', '시장 가치순'], ['sig', '시그니처순'], ['age', '나이 어린 순'], ['contract', '계약 만료 빠른 순']])}
          <span class="ch-count rc-count"></span>
        </div>
        <div class="card rs-table-wrap" style="padding:0">
          <table class="rs-table rc-table"><thead><tr><th></th><th>선수</th><th>팀</th><th>포지션</th><th class="num">나이</th><th>국적</th><th>계약</th><th class="num">가치</th></tr></thead><tbody></tbody></table>
        </div>
      </div>`;
    const draw = () => {
      const f = this.f, myLeague = Player.team().league;
      // 자국 선수 = 그 선수가 뛰는 리그의 현지 선수 (LEC는 유럽 국적, LCS는 미국·캐나다). 무소속은 내 리그 기준
      const EU = ['France', 'Spain', 'Germany', 'Poland', 'Denmark', 'Sweden', 'United Kingdom', 'Belgium', 'Netherlands', 'Italy', 'Portugal', 'Czech Republic', 'Slovakia', 'Slovenia', 'Croatia', 'Serbia', 'Bosnia and Herzegovina', 'Bulgaria', 'Romania', 'Greece', 'Hungary', 'Austria', 'Switzerland', 'Norway', 'Finland', 'Ireland', 'Lithuania', 'Latvia', 'Estonia', 'Ukraine', 'Belarus', 'Russia', 'Turkey', 'Israel', 'Cyprus', 'Malta', 'Iceland', 'Luxembourg', 'Albania', 'North Macedonia', 'Montenegro', 'Kosovo', 'Moldova'];
      const isHome = (p, lg) => ({ LCK: n => n === 'South Korea', LPL: n => n === 'China' || n === 'Taiwan' || n === 'Hong Kong', LEC: n => EU.includes(n), LCS: n => n === 'United States' || n === 'Canada' }[lg || myLeague] || (() => false))(p.nation);
      let rows = this.pool().filter(({ p, t }) => t.id !== this.mineId() &&
        (f.league === 'ALL' || t.league === f.league) && (f.role === 'ALL' || p.role === f.role) &&
        (f.age === 'ALL' || (f.age === 'u21' ? p.age <= 21 : f.age === '22-25' ? p.age >= 22 && p.age <= 25 : p.age >= 26)) &&
        (f.nat === 'ALL' || (f.nat === 'home') === isHome(p, t.league)) &&
        (f.contract === 'ALL' || p.free || (() => { const d = Player.days(p); return d != null && (f.contract === 'fa' ? d <= 60 : d <= 365); })()) &&
        (!f.q || p.name.toLowerCase().includes(f.q.toLowerCase()) || (p.nativeName || '').includes(f.q)));
      const by = {
        value: (a, b) => Player.value(b.p, b.t) - Player.value(a.p, a.t),
        sig: (a, b) => Mastery.signatures(b.p.id).length - Mastery.signatures(a.p.id).length || Player.value(b.p, b.t) - Player.value(a.p, a.t),
        age: (a, b) => (a.p.age || 99) - (b.p.age || 99),
        contract: (a, b) => (a.p.contractEnd || '9').localeCompare(b.p.contractEnd || '9'),
      }[f.sort];
      rows.sort(by);
      $('.rc-count', el).textContent = `${rows.length}명`;
      $('.rc-table tbody', el).innerHTML = rows.map(({ p, t }) => this.playerRow(p, t)).join('') || '<tr><td colspan="8" class="ms-none" style="text-align:center;padding:30px">조건에 맞는 선수가 없습니다.</td></tr>';
    };
    $$('select[data-f]', el).forEach(s => s.onchange = () => { this.f[s.dataset.f] = s.value; draw(); });
    $('.rc-q', el).oninput = e => { this.f.q = e.target.value; draw(); };
    this.bindStars($('.rc-table', el), draw);
    draw();
  },

  // ---------- 관심 목록 ----------
  async shortlist(el) {
    await Promise.all([Portal.ready, Mastery.load()]);
    const draw = () => {
      const list = Player.shortlist().map(id => Player.find(id)).filter(Boolean);
      el.innerHTML = `
        <div class="cr-page">
          ${Career.head('관심 목록', '스카우트 검색·FA 시장·선수 프로필에서 ★로 추가한 선수')}
          ${list.length ? `<div class="card rs-table-wrap" style="padding:0">
            <table class="rs-table rc-table"><thead><tr><th></th><th>선수</th><th>팀</th><th>포지션</th><th class="num">나이</th><th>국적</th><th>계약</th><th class="num">가치</th><th></th></tr></thead>
            <tbody>${list.map(({ p, t }) => this.playerRow(p, t, `<td><button class="btn-ghost ct-btn" data-ask="${p.id}">영입 문의</button></td>`)).join('')}</tbody></table>
          </div>` : `<div class="card fx-empty"><b>관심 목록이 비어 있습니다</b><span>스카우트 검색이나 FA 시장에서 ★를 눌러 선수를 추가하세요.</span><a class="btn-primary rc-go" href="#recruit-search">스카우트 검색으로</a></div>`}
        </div>`;
      const tb = $('.rc-table', el);
      if (tb) {
        tb.addEventListener('click', e => { const a = e.target.closest('[data-ask]'); if (a) { e.stopPropagation(); Player.inquiryModal(a.dataset.ask); } }, true);
        this.bindStars(tb, draw);
      }
    };
    draw();
  },

  // ---------- 스카우트 리포트 ----------
  async reports(el) {
    await Promise.all([Portal.ready, Mastery.load()]);
    const t = Player.team();
    const scouts = this.scouts();
    // 관심 목록 + 주목할 만한 선수(시그니처 보유·계약 만료 임박)를 리포트로
    const picks = [...new Set([...Player.shortlist(), ...this.pool().filter(({ p, t: tt }) => tt.id !== t.id && (Mastery.signatures(p.id).length || (Player.days(p) ?? 999) <= 30)).sort((a, b) => Player.value(b.p, b.t) - Player.value(a.p, a.t)).slice(0, 8).map(x => x.p.id)])].map(id => Player.find(id)).filter(Boolean);
    const report = ({ p, t: tt }, i) => {
      const pool = Mastery.pool(p.id), sig = pool.filter(e => e.sig), wide = pool.filter(e => e.m >= 13).length;
      const r = k => G.rand(p.id, 'rep' + k);
      const pros = [sig.length && `시그니처 ${sig.map(e => Champions.byId[e.c].name).join('·')}`, wide >= 8 && `넓은 챔피언 폭 (숙련 ${wide}개)`, p.age <= 21 && '어린 나이, 성장 여지 큼', r(1) > .5 && '라인전 압박이 강함', r(2) > .6 && '한타 집중력이 좋음'].filter(Boolean).slice(0, 3);
      const cons = [wide < 4 && '챔피언 폭이 좁음', p.age >= 27 && '전성기 이후 하락 가능성', r(3) > .7 && '원거리 견제에 약함', r(4) > .75 && '기복이 있음', (Player.days(p) ?? 999) > 365 && '계약이 길어 이적료 부담'].filter(Boolean).slice(0, 2);
      const stars = Math.max(1, Math.min(5, Math.round(1 + sig.length + wide / 5 + (p.age <= 22 ? 1 : 0))));
      const scout = scouts[i % scouts.length];
      return `
        <div class="card rp-card" data-pid="${p.id}">
          <div class="rp-head">${G.face(p, 'pl-ph')}<div>${G.ovr(p)}<b>${UI.esc(p.name)}</b><span>${G.team(tt, 'xs')} ${UI.esc(tt.short)} · ${G.pos(p.role, true)} · ${p.age || '-'}세</span></div>${this.star(p.id)}</div>
          <div class="rp-grade"><span>스카우트 평가</span>${UI.stars(stars)}<b>${['', '관찰', '보통', '영입 고려', '적극 추천', '최우선 영입'][stars]}</b></div>
          <div class="rp-cols">
            <div><h5>강점</h5><ul>${(pros.length ? pros : ['특출난 강점 없음']).map(x => `<li>${x}</li>`).join('')}</ul></div>
            <div><h5>약점</h5><ul>${(cons.length ? cons : ['뚜렷한 약점 없음']).map(x => `<li>${x}</li>`).join('')}</ul></div>
          </div>
          <div class="rp-foot"><span>작성: ${UI.esc(scout.name)}</span><span>${Player.contractState(p)[0]} · 가치 ${Player.money(Player.value(p, tt))}</span></div>
        </div>`;
    };
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('스카우트 리포트', '관심 목록 선수와 스카우트 팀이 주목한 선수. 평가는 챔피언 폭·나이·계약 기반 목업입니다.')}
        <div class="rp-grid">${picks.map(report).join('') || '<p class="ms-none">리포트가 없습니다.</p>'}</div>
      </div>`;
    this.bindStars($('.rp-grid', el), () => this.reports(el));
  },

  // ---------- FA 시장 ----------
  async fa(el) {
    await Promise.all([Portal.ready, Mastery.load()]);
    const today = this.today(), lim = Store.addDays(today, 30);
    const L = App.db.leagues.find(l => l.id === Player.team().league);
    const draw = () => {
      const src = [...App.db.teams, ...(App.db.free ? [App.db.free] : [])].flatMap(t => (this.faStaff ? t.staff || [] : t.players).map(p => ({ p, t })));
      const rows = src.filter(({ p, t }) => (p.free || (p.contractEnd && p.contractEnd <= lim)) && t.id !== this.mineId())
        .sort((a, b) => Player.value(b.p, b.t) - Player.value(a.p, a.t));
      el.innerHTML = `
        <div class="cr-page">
          <div class="card rs-head">
            <div class="rs-title"><h2>FA 시장</h2><span>계약이 끝났거나 30일 안에 끝나는 선수 · FA 개장 ${L ? L.faOpen : '11월 중순'}</span></div>
            <div class="rs-stats"><div><span class="k">FA·FA 예정</span><b>${rows.length}</b></div><div><span class="k">관심 목록</span><b>${Player.shortlist().length}</b></div></div>
          </div>
          <div class="ch-bar"><div class="seg fa-seg"><button class="${this.faStaff ? '' : 'on'}" data-s="0">선수</button><button class="${this.faStaff ? 'on' : ''}" data-s="1">코칭스태프</button></div></div>
          <div class="card rs-table-wrap" style="padding:0">
            <table class="rs-table rc-table"><thead><tr><th></th><th>이름</th><th>현 소속</th><th>포지션</th><th class="num">나이</th><th>국적</th><th>계약</th><th class="num">가치</th><th class="num">요구 연봉</th><th class="num">관심 팀</th></tr></thead>
            <tbody>${rows.map(({ p, t }) => this.playerRow(p, t, `<td class="num">${Player.money(Contract.pay(p, Contract.score(p, t), Roster.team().league) * (1.1 + G.rand(p.id, 'fa') * .25))}</td><td class="num">${1 + Math.floor(G.rand(p.id, 'int') * 5)}</td>`).replace(`<td>${G.pos(p.role)}</td>`, `<td>${p.role === 'COACH' ? '코치' : G.pos(p.role)}</td>`)).join('') || '<tr><td colspan="10" class="ms-none" style="text-align:center;padding:30px">해당하는 FA가 없습니다.</td></tr>'}</tbody></table>
          </div>
        </div>`;
      $('.fa-seg', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.faStaff = b.dataset.s === '1'; draw(); };
      this.bindStars($('.rc-table', el), draw);
    };
    draw();
  },

  // ---------- 팀 검색: 다른 팀 전력 한눈에 ----------
  tf: { league: 'ALL', q: '', sort: 'power' },
  teamPower(t) {
    // 주전: 포지션마다 후보가 아닌 선수 중 OVR이 가장 높은 선수 (없으면 후보 중 최고)
    const line = G.ROLES.map(r => { const ps = t.players.filter(p => p.role === r).sort((a, b) => (b.ovr || 0) - (a.ovr || 0)); const p = ps.find(x => !x.sub) || ps[0]; return { r, p, s: p ? p.ovr || 0 : 0 }; });
    return { line, power: line.reduce((a, x) => a + x.s, 0) / 5, sig: t.players.reduce((a, p) => a + Mastery.signatures(p.id).length, 0), pay: Club.payroll(t), value: t.players.reduce((a, p) => a + Player.value(p, t), 0) };
  },
  async teams(el) {
    await Promise.all([Portal.ready, Mastery.load(), Traits.load(), Results.load()]);
    const sel = (k, opts) => `<select class="ch-sort" data-tf="${k}">${opts.map(([v, l]) => `<option value="${v}" ${this.tf[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('팀 검색', '모든 팀의 주전 전력. 전력은 주전 5명의 평균 OVR입니다. 순위는 전체 팀 중 전력 순위이고, 리그 안 순위도 함께 보여 줍니다. 행을 누르면 상대 분석, 선수를 누르면 프로필로 갑니다.')}
        <div class="ch-bar">
          <input class="ch-search tf-q" type="search" placeholder="팀·선수 이름 검색" value="${UI.esc(this.tf.q)}">
          ${sel('league', [['ALL', '모든 리그'], ['LCK', 'LCK'], ['LPL', 'LPL'], ['LEC', 'LEC'], ['LCS', 'LCS']])}
          ${sel('sort', [['power', '전력순 (평균 OVR)'], ['value', '선수단 가치순'], ['pay', '연봉 총액순'], ['sig', '시그니처순'], ['rep', '명성순']])}
          <span class="ch-count tf-count"></span>
        </div>
        <div class="card rs-table-wrap" style="padding:0">
          <table class="rs-table tf-table"><thead><tr><th class="num">#</th><th class="num" title="전체 전력 순위 · 리그 안 순위">전력 순위</th><th>팀</th><th class="num">평균 OVR</th>${G.ROLES.map(r => `<th>${G.pos(r)}</th>`).join('')}<th class="num">가치</th><th class="num">연봉</th><th class="num">SIG</th><th class="num">명성</th></tr></thead><tbody></tbody></table>
        </div>
      </div>`;
    const my = Player.team();
    // 전력 순위: 필터·정렬과 상관없이 전체 팀 기준 + 리그 안 순위
    const pw = App.db.teams.map(t => ({ t, v: this.teamPower(t).power })).sort((a, b) => b.v - a.v);
    const rank = {}, lrank = {};
    pw.forEach(x => { rank[x.t.id] = pw.filter(y => y.v > x.v).length + 1; lrank[x.t.id] = pw.filter(y => y.t.league === x.t.league && y.v > x.v).length + 1; });
    const draw = () => {
      const f = this.tf, q = f.q.toLowerCase();
      const rows = App.db.teams.filter(t => (f.league === 'ALL' || t.league === f.league)
        && (!q || t.name.toLowerCase().includes(q) || t.short.toLowerCase().includes(q) || t.players.some(p => p.name.toLowerCase().includes(q))))
        .map(t => ({ t, ...this.teamPower(t) }))
        .sort((a, b) => f.sort === 'rep' ? Fame.team(b.t) - Fame.team(a.t) || b.power - a.power : b[f.sort] - a[f.sort]);
      const cell = x => x.p ? `<td><div class="tf-pl" data-pid="${x.p.id}">${G.face(x.p, 'pl-ph')}<div>${G.ovr(x.p)}<b>${UI.esc(x.p.name)}</b></div></div></td>` : '<td><span class="cr-dim">공석</span></td>';
      $('.tf-table tbody', el).innerHTML = rows.map((x, i) => `
        <tr data-tid="${x.t.id}" class="${x.t.id === my.id ? 'tf-me' : ''}">
          <td class="num">${i + 1}</td>
          <td class="num"><b>${rank[x.t.id]}위</b><small class="cr-dim"> · ${x.t.league} ${lrank[x.t.id]}위</small></td>
          <td><div class="pl-cell">${G.team(x.t, 'sm')}<div><b>${UI.esc(x.t.name)}</b><small class="pl-real">${x.t.league}${x.t.id === my.id ? ' · 우리 팀' : ''}</small></div></div></td>
          <td class="num"><b class="tf-pow ovr-b ${x.power >= 90 ? 'top' : x.power >= 80 ? 'hi' : x.power >= 70 ? 'mid' : 'lo'} lg">${x.power.toFixed(1)}</b></td>
          ${x.line.map(cell).join('')}
          <td class="num">${Player.money(x.value)}</td><td class="num">${Player.money(x.pay)}</td><td class="num">${x.sig}</td><td class="num" title="${Fame.teamTitle(Fame.team(x.t))}">${Fame.team(x.t)}</td>
        </tr>`).join('') || '<tr><td colspan="14" class="ms-none" style="text-align:center;padding:30px">해당하는 팀이 없습니다.</td></tr>';
      $('.tf-count', el).textContent = `${rows.length}팀`;
    };
    $$('[data-tf]', el).forEach(s => s.onchange = () => { this.tf[s.dataset.tf] = s.value; draw(); });
    $('.tf-q', el).oninput = e => { this.tf.q = e.target.value; draw(); };
    $('.tf-table tbody', el).onclick = e => {
      const pl = e.target.closest('[data-pid]'); if (pl) { Player.open(pl.dataset.pid); return; }
      const tr = e.target.closest('tr[data-tid]'); if (!tr) return;
      if (tr.dataset.tid === my.id) { Router.go('roster-first-team'); return; }
      Match.oppId = tr.dataset.tid; Router.go('match-opponent');
    };
    draw();
  },

  // ---------- 이적 제안 ----------
  async offers(el) {
    await Promise.all([Portal.ready, Mastery.load()]);
    const ST = { talk: ['협상 중', 'seeking'], agreed: ['구단 합의 · 개인 조건 남음', 'stable'], pending: ['답변 대기', 'seeking'], rejected: ['결렬', 'vacant'], done: ['완료', 'stable'] };
    const tm = id => App.db.teams.find(t => t.id === id) || { short: id, name: id };
    const row = b => { const hit = Player.find(b.pid); if (!hit) return ''; const o = tm(b.dir === 'in' ? b.from : b.to), st = ST[b.status] || [b.status, ''];
      return `<div class="of-row" data-pid="${b.pid}" data-dir="${b.dir}">${G.face(hit.p, 'pl-ph')}<div>${G.ovr(hit.p)}<b>${UI.esc(hit.p.name)}</b><span>${G.team(o, 'xs')} ${UI.esc(o.name)} · ${b.date.replace(/-/g, '.')}</span></div>
        <div class="of-fee"><b>${b.fee ? Player.money(b.fee) : b.ask ? Player.money(b.ask) : '-'}</b><small>${b.fee ? '이적료' : '구단 요구'}</small></div><span class="ot-st ${st[1]}">${st[0]}</span></div>`; };
    const all = Transfer.bids().slice().reverse(), recv = all.filter(b => b.dir === 'out'), sent = all.filter(b => b.dir === 'in');
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('이적 제안', '받은 제안은 메시지함에서 답합니다. 보낸 제안은 눌러서 협상을 이어갈 수 있습니다.')}
        <div class="cr-grid">
          <div class="card"><div class="card-head"><h3>받은 제안 <small>${recv.length}</small></h3></div>${recv.map(row).join('') || '<p class="ms-none">받은 제안이 없습니다.</p>'}</div>
          <div class="card"><div class="card-head"><h3>보낸 제안 <small>${sent.length}</small></h3></div>${sent.map(row).join('') || '<p class="ms-none">보낸 제안이 없습니다. 선수 프로필에서 "영입 문의"를 누르면 원 소속 구단과 이적료 협상을 시작합니다.</p>'}</div>
        </div>
      </div>`;
    el.querySelector('.cr-grid').addEventListener('click', e => {
      const r = e.target.closest('[data-pid]'); if (!r) return;
      if (r.dataset.dir === 'in' && Transfer.open$(r.dataset.pid)) Transfer.open(r.dataset.pid); else if (r.dataset.dir === 'out') Router.go('portal-messages'); else Player.open(r.dataset.pid);
    });
  },

  // ---------- 스카우트 배정 ----------
  REGIONS: [['LCK', 'LCK'], ['LPL', 'LPL'], ['LEC', 'LEC'], ['LCS', 'LCS'], ['CL', '2군 리그 (LCK CL 등)'], ['SOLOQ', '솔랭 상위권'], ['AMA', '아마추어 대회']],
  scouts() {
    const t = Player.team();
    // 스카우트 팀 (목업 인원 + 코칭스태프 일부 겸임)
    const base = (t.staff || []).slice(1, 3).map(s => ({ id: s.id, name: s.name, photo: s.photo, staff: true }));
    const extra = ['수석 스카우트', '데이터 스카우트', '해외 스카우트'].map((n, i) => ({ id: `scout-${t.id}-${i}`, name: n, staff: false }));
    return [...base, ...extra];
  },
  async assignments(el) {
    await Portal.ready;
    const map = (App.state.scoutJobs ||= {});
    const list = this.scouts();
    list.forEach((s, i) => { map[s.id] ||= this.REGIONS[i % this.REGIONS.length][0]; });
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('스카우트 배정', '스카우트를 지역·대회에 보내면 그쪽 선수 리포트가 늘어납니다. 일반인 유망주는 솔랭·아마추어 대회에서 발견됩니다.')}
        <div class="sc-grid">${list.map(s => `
          <div class="card sc-card">
            <div class="sc-head">${s.photo ? UI.img(s.photo, 'pl-ph', '') : `<div class="pl-ph pl-ph-empty">${UI.esc(s.name.slice(0, 1))}</div>`}<div><b>${UI.esc(s.name)}</b><span>${s.staff ? '코치 겸임' : '전담 스카우트'}</span></div></div>
            <label class="field"><span>배정 지역</span><select data-sid="${s.id}">${this.REGIONS.map(([v, l]) => `<option value="${v}" ${map[s.id] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <div class="sc-meta"><span>판단력 ${UI.stars(2 + Math.floor(G.rand(s.id, 'j') * 3))}</span><span>이번 달 리포트 ${Math.floor(G.rand(s.id, 'n') * 6)}건</span></div>
          </div>`).join('')}</div>
      </div>`;
    $$('select[data-sid]', el).forEach(s => s.onchange = () => { map[s.dataset.sid] = s.value; UI.toast('배정을 바꿨습니다'); }); // TODO: 기능 연결 — 배정 지역으로 리포트 생성
  },
};

Views['recruit-search'] = el => Recruit.search(el);
Views['recruit-shortlist'] = el => Recruit.shortlist(el);
Views['recruit-reports'] = el => Recruit.reports(el);
Views['recruit-fa'] = el => Recruit.fa(el);
Views['recruit-offers'] = el => Recruit.offers(el);
Views['recruit-teams'] = el => Recruit.teams(el);
Views['recruit-assignments'] = el => Recruit.assignments(el);

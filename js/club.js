// 구단: 재정 · 샐러리캡 · 코칭스태프 · 스폰서 · 이사회 기대치 · 구단 역사
// 금액은 모두 "억 원(환산)" 목업. TODO: 기능 연결 — 실제 재정 시스템
const Club = {
  team() { return Roster.team(); },
  today() { return Clock.today(); },
  r(t, k) { return G.rand(t.id, k); },
  // 시즌 예산(억 원): 재정 등급·리그 기준, 시작 시점 선수 연봉의 1.5배 이상
  budget(t) { return Math.round(Math.max(((t.fin || 2) * 40 + 30) * ({ LCK: 1, LPL: 1.3, LEC: .6, LCS: .7 }[t.league] || 1), (t._pay0 ||= (t._base ? t._base.players : t.players).reduce((s, p) => s + Contract.base(p, t).salary, 0)) * 1.5)); },
  wageRoom(t) { return this.budget(t) * .65 - this.payroll(t); },
  payroll(t) { return t.players.reduce((s, p) => s + Player.salary(p, t), 0); },
  staffPay(t) { return (t.staff || []).reduce((s, p) => s + Player.salary(p, t), 0); },
  money: v => Player.money(v),
  bar(label, v, max, color = 'var(--gold)') {
    return `<div class="cr-meter"><span>${label}</span><div class="cr-bar"><i style="width:${Math.min(100, v / max * 100)}%;background:${color}"></i></div><b class="num">${Player.money(v)}</b></div>`;
  },

  // ---------- 재정 ----------
  async finance(el) {
    await Promise.all([Portal.ready, Mastery.load()]);
    const t = this.team(), B = this.budget(t);
    const inc = [['리그 분배금', B * .28], ['스폰서', B * (.3 + this.r(t, 'sp') * .15)], ['스트리밍·굿즈', B * (.08 + (t.rep || 2) * .03)], ['상금', B * .04 * (t.rep || 2)]];
    const exp = [['선수 연봉', this.payroll(t)], ['스태프 인건비', this.staffPay(t)], ['숙소·운영', B * .12], ['마케팅·콘텐츠', B * .06]];
    const ti = inc.reduce((s, x) => s + x[1], 0), te = exp.reduce((s, x) => s + x[1], 0);
    const months = Array.from({ length: 12 }, (_, i) => (this.r(t, 'm' + i) - .45) * B * .08);
    const max = Math.max(...months.map(Math.abs)) || 1;
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head">
          <div class="rs-title"><h2>재정 <small>${UI.esc(t.name)}</small></h2><span>예산 ${UI.esc(t.budget || '-')} · 아래 금액은 억 원 환산 추정치</span></div>
          <div class="rs-stats">
            <div><span class="k">시즌 예산</span><b>${this.money(B)}</b></div>
            <div><span class="k">예상 수입</span><b>${this.money(ti)}</b></div>
            <div><span class="k">예상 지출</span><b>${this.money(te)}</b></div>
            <div><span class="k">예상 수지</span><b class="${ti - te < 0 ? 'warn' : ''}">${ti - te >= 0 ? '+' : '−'}${this.money(Math.abs(ti - te))}</b></div>
          </div>
        </div>
        <div class="cr-grid">
          <div class="card"><div class="card-head"><h3>수입 <small>시즌 예상</small></h3></div>${inc.map(([l, v]) => this.bar(l, v, ti, '#3fbf7f')).join('')}</div>
          <div class="card"><div class="card-head"><h3>지출 <small>시즌 예상</small></h3></div>${exp.map(([l, v]) => this.bar(l, v, te, '#e2575c')).join('')}</div>
        </div>
        <div class="card"><div class="card-head"><h3>월별 수지 <small>지난 12개월 · 목업</small></h3></div>
          <svg class="fn-chart" viewBox="0 0 240 80" preserveAspectRatio="none">
            <line x1="0" y1="40" x2="240" y2="40" stroke="#2a3550"/>
            ${months.map((v, i) => { const h = Math.abs(v) / max * 36; return `<rect x="${i * 20 + 4}" y="${v >= 0 ? 40 - h : 40}" width="12" height="${h}" fill="${v >= 0 ? '#3fbf7f' : '#e2575c'}" rx="1.5"/>`; }).join('')}
          </svg>
        </div>
      </div>`;
  },

  // ---------- 샐러리캡 ----------
  CAP: { LCK: { cap: 40, rule: '상위 5인 연봉 합산', tiers: [[40, 60, '25%'], [60, 80, '35%'], [80, 100, '50%'], [100, 999, '60%']] }, LEC: { cap: 23, rule: 'SFR · 선수단 지출 상한 (환산)', tiers: [[23, 999, '초과분 제재']] } },
  // 상위 5인 합산(LCK) → 구간별 부담금. extra: 이 선수의 연봉을 바꿔 넣어 계산 (협상 중 미리보기)
  tax(t, extra) {
    const C = this.CAP.LCK, pays = t.players.filter(p => !extra || p.id !== extra.pid).map(p => Player.salary(p, t));
    if (extra) pays.push(extra.salary);
    const used = pays.sort((a, b) => b - a).slice(0, 5).reduce((s, v) => s + v, 0);
    const tax = t.league !== 'LCK' ? 0 : C.tiers.reduce((s, [a, b, r]) => s + Math.max(0, Math.min(used, b) - a) * parseFloat(r) / 100, 0);
    return { used, tax: Math.round(tax * 10) / 10 };
  },
  async cap(el) {
    await Promise.all([Portal.ready, Mastery.load()]);
    const t = this.team(), L = App.db.leagues.find(l => l.id === t.league), C = this.CAP[t.league];
    const pays = t.players.map(p => ({ p, v: Player.salary(p, t) })).sort((a, b) => b.v - a.v);
    const top5 = pays.slice(0, 5).reduce((s, x) => s + x.v, 0), all = pays.reduce((s, x) => s + x.v, 0);
    const used = C && t.league === 'LCK' ? top5 : all;
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head">
          <div class="rs-title"><h2>샐러리캡 <small>${t.league}</small></h2><span>${(L ? L.rules : []).map(UI.esc).join(' · ')}</span></div>
          <div class="rs-stats">
            <div><span class="k">${C ? C.rule : '선수단 연봉 합계'}</span><b>${this.money(used)}</b></div>
            <div><span class="k">상한</span><b>${C ? this.money(C.cap) : '없음'}</b></div>
            <div><span class="k">여유</span><b class="${C && used > C.cap ? 'warn' : ''}">${C ? (used > C.cap ? '초과 ' : '') + this.money(Math.abs(C.cap - used)) : '-'}</b></div>
            ${t.league === 'LCK' ? `<div><span class="k">예상 부담금 (11월 1일)</span><b class="${this.tax(t).tax ? 'warn' : ''}">${this.money(this.tax(t).tax)}</b></div>` : ''}
          </div>
        </div>
        ${C ? `<div class="card"><div class="card-head"><h3>상한 사용률</h3></div>
          <div class="cap-bar"><i style="width:${Math.min(100, used / C.cap * 100)}%" class="${used > C.cap ? 'over' : ''}"></i><span style="left:100%">상한</span></div>
          ${C.tiers.length > 1 ? `<div class="cap-tiers">${C.tiers.map(([a, b, r]) => `<div class="${used > a ? 'on' : ''}"><b>${a}억 초과${b < 999 ? ` ~ ${b}억` : ''}</b><span>사치세 ${r}</span></div>`).join('')}</div>` : ''}
        </div>` : '<div class="card fx-empty"><b>이 리그는 연봉 상한이 없습니다</b><span>예산 안에서 자유롭게 계약할 수 있습니다.</span></div>'}
        <div class="card"><div class="card-head"><h3>선수 연봉</h3></div>
          ${pays.map((x, i) => `<div class="cap-row ${t.league === 'LCK' && i < 5 ? 'top' : ''}" data-pid="${x.p.id}">${G.face(x.p, 'pl-ph')}${G.ovr(x.p)}<b>${UI.esc(x.p.name)}</b>${G.pos(x.p.role)}<div class="cr-bar"><i style="width:${x.v / pays[0].v * 100}%;background:var(--gold)"></i></div><span class="num">${this.money(x.v)}</span></div>`).join('')}
          ${t.league === 'LCK' ? '<p class="cr-note">금색 표시 5명이 샐러리캡 계산에 들어갑니다.</p>' : ''}
        </div>
      </div>`;
    el.addEventListener('click', e => { const r = e.target.closest('[data-pid]'); if (r) Player.open(r.dataset.pid); });
  },

  // ---------- 코칭스태프 ----------
  VACANT: [['분석관', '상대·메타 분석'], ['데이터 분석가', '경기 데이터 정리'], ['피지컬 트레이너', '체력·자세 관리'], ['심리 상담사', '멘탈 관리']],
  async staff(el) {
    await Portal.ready;
    const t = this.team(), m = Career.m();
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('코칭스태프', `${UI.esc(t.name)} 스태프 · 실제 코칭스태프 명단 기준`)}
        <div class="sf-grid">
          <div class="card sf-card me"><div class="sf-av">${Avatar.render(m.avatar)}</div><b>${UI.esc(m.displayName || m.name)}</b><span>감독 (나)</span><small>${Career.contract(m, t).from.replace(/-/g, '.')} 부임</small></div>
          ${(t.staff || []).map(s => { const [cs, cc] = Player.contractState(s); return `
            <div class="card sf-card" data-pid="${s.id}">${G.face(s, 'sf-photo')}<b>${UI.esc(s.name)}</b><span>코치${Draft.coach(t).p === s ? ' · 밴픽 담당' : ''}</span>
              <span class="sf-draft">밴픽 역량 <b>${Draft.coachRating(s, t)}</b>/20 · ${Draft.grade(Draft.coachRating(s, t))}</span>
              <small>${G.flag(s.nation)} ${UI.esc(s.nativeName || s.realName || '')}</small>
              <span class="ct-st ${cc}">${cs}</span></div>`; }).join('')}
          ${this.VACANT.map(([r, d]) => `<div class="card sf-card empty"><div class="sf-photo pl-ph-empty">+</div><b>${r}</b><span>${d}</span><button class="btn-ghost sf-hire">채용 공고</button></div>`).join('')}
        </div>
      </div>`;
    el.addEventListener('click', e => {
      if (e.target.closest('.sf-hire')) { UI.toast('스태프 채용 기능 준비 중'); return; } // TODO: 기능 연결 — 스태프 채용
      const r = e.target.closest('[data-pid]'); if (r) Player.open(r.dataset.pid);
    });
  },

  // ---------- 스폰서 ----------
  SLOTS: [['메인 파트너', '통신·금융'], ['유니폼 스폰서', '자동차·식품'], ['장비 파트너', '주변기기'], ['음료 파트너', '에너지 음료'], ['가구 파트너', '게이밍 의자'], ['디지털 파트너', '플랫폼·앱']],
  async sponsors(el) {
    await Portal.ready;
    const t = this.team(), B = this.budget(t);
    const rows = this.SLOTS.map(([slot, cat], i) => {
      const r = this.r(t, 'spn' + i), st = r < .12 ? 'vacant' : r < .3 ? 'talk' : 'ok';
      return { slot, cat, st, value: B * (i === 0 ? .14 : .05) * (.7 + r * .6), end: `${Clock.year() + 1 + (i % 2)}-12-31` };
    });
    const total = rows.filter(x => x.st === 'ok').reduce((s, x) => s + x.value, 0);
    const ST = { ok: ['계약 중', 'stable'], talk: ['재계약 협상', 'unstable'], vacant: ['공석', 'vacant'] };
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head">
          <div class="rs-title"><h2>스폰서</h2><span>스폰서 금액은 구단 평판·성적에 따라 달라집니다 (추정)</span></div>
          <div class="rs-stats"><div><span class="k">연간 스폰서 수입</span><b>${this.money(total)}</b></div><div><span class="k">계약 중</span><b>${rows.filter(x => x.st === 'ok').length}/${rows.length}</b></div></div>
        </div>
        <div class="sp-grid">${rows.map(x => `
          <div class="card sp-card ${x.st}">
            <span class="ot-st ${ST[x.st][1]}">${ST[x.st][0]}</span>
            <b>${x.slot}</b><span class="sp-cat">${x.cat}</span>
            ${x.st === 'vacant' ? '<button class="btn-ghost sp-btn">스폰서 찾기</button>' : `<div class="sp-val"><b>${this.money(x.value)}</b><small>연 · ${x.end.slice(0, 4)}년 말까지</small></div>`}
          </div>`).join('')}</div>
      </div>`;
    el.addEventListener('click', e => { if (e.target.closest('.sp-btn')) UI.toast('스폰서 협상 기능 준비 중'); }); // TODO: 기능 연결 — 스폰서 협상
  },

  // ---------- 이사회 기대치 ----------
  async board(el) {
    await Portal.ready;
    const t = this.team(), m = Career.m(), conf = Career.relations(m)[0][1];
    const goals = [
      ['리그 성적', t.boardGoal || '플레이오프 진출', 5],
      ['국제대회', (t.rep || 2) >= 4 ? 'MSI·월즈 진출' : '국제대회 진출 도전', (t.rep || 2) >= 4 ? 4 : 2],
      ['재정', '시즌 예산 안에서 운영', 4],
      ['유망주 기용', (t.rep || 2) <= 2 ? '2군 유망주 1군 기용' : '2군 유망주 관리', (t.rep || 2) <= 2 ? 4 : 2],
      ['팬·미디어', '팬 지지 유지', 3],
    ];
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('이사회 기대치', `${Schedule.season()} 시즌 이사회 목표. 시즌이 진행되면 달성 정도가 표시됩니다.`)}
        <div class="cr-grid">
          <div class="card cr-rep-main"><span class="cr-rep-k">이사회 신뢰</span><b class="cr-rep-l">${conf >= 70 ? '굳건함' : conf >= 50 ? '보통' : conf >= 30 ? '불안' : '위기'}</b>
            <div class="cr-ladder"><div class="cr-ladder-bar"><i style="width:${conf}%"></i></div></div><small>신뢰가 바닥나면 경질될 수 있습니다.</small></div>
          <div class="card"><div class="card-head"><h3>이사회 메시지</h3></div>
            <p class="cr-bg">"${UI.esc(m.displayName || m.name)} 감독님, ${Schedule.season()} 시즌 ${UI.esc(t.boardGoal || '좋은 성적')}을 기대합니다. 예산은 확정됐으니 스토브 기간 안에 로스터를 완성해 주십시오."</p></div>
        </div>
        <div class="card"><div class="card-head"><h3>시즌 목표</h3></div>
          <table class="rs-table"><thead><tr><th>분야</th><th>목표</th><th>중요도</th><th>현재</th></tr></thead>
          <tbody>${goals.map(([k, g, imp]) => `<tr><td><b>${k}</b></td><td>${UI.esc(g)}</td><td>${UI.stars(imp)}</td><td><span class="ot-st stable">시즌 전</span></td></tr>`).join('')}</tbody></table>
        </div>
      </div>`;
  },

  // ---------- 구단 역사 ----------
  ALIAS: { t1: ['T1', 'SK Telecom T1', 'SKT T1'], 'gen-g': ['Gen.G', 'Samsung Galaxy', 'Samsung White'], 'dplus-kia': ['Dplus KIA', 'DAMWON Gaming', 'DWG KIA'], 'kiwoom-drx': ['DRX'], 'edward-gaming': ['EDward Gaming'], 'invictus-gaming': ['Invictus Gaming'], fnatic: ['Fnatic'] },
  async history(el) {
    await Promise.all([Portal.ready, Results.load()]);
    const t = this.team(), names = this.ALIAS[t.id] || [t.name];
    const titles = App.db.history.worlds.filter(w => names.some(n => w.team.toLowerCase() === n.toLowerCase()));
    const rec = Match.record(t.id);
    const evs = {};
    Results.forTeam(t.id).forEach(m => { (evs[m.e] ||= { w: 0, l: 0 }); Results.won(m, t.id) ? evs[m.e].w++ : evs[m.e].l++; });
    el.innerHTML = `
      <div class="cr-page">
        <div class="card cr-id">${G.team(t, 'lg')}<div class="cr-id-main"><h2>${UI.esc(t.name)}</h2><div class="cr-id-meta">${t.league}${t.city ? ' · ' + UI.esc(t.city) : ''} · 구단 평판 ${UI.stars(t.rep || 2)} <b>${Fame.team(t)}</b> ${Fame.teamTitle(Fame.team(t))}</div></div>
          <div class="cr-id-rep"><span>월즈 우승</span><b>${titles.length}회</b></div></div>
        <div class="cr-grid">
          <div class="card"><div class="card-head"><h3>월드 챔피언십 우승</h3></div>
            ${titles.length ? `<div class="hs-titles">${titles.map(w => `<div class="hs-title">${w.photo ? `<img src="${w.photo}" alt="" referrerpolicy="no-referrer" loading="lazy">` : ''}<b>${w.year}</b><span>${UI.esc(w.team)}</span></div>`).join('')}</div>` : '<p class="ms-none">아직 월즈 우승이 없습니다. 첫 우승의 주인공이 되어 보세요.</p>'}
          </div>
          <div class="card"><div class="card-head"><h3>${Schedule.BASE} 시즌 돌아보기</h3><a href="#match-history">경기 기록</a></div>
            <p class="pp-line">전체 <b>${rec.w}승 ${rec.l}패</b></p>
            ${Object.entries(evs).map(([id, v]) => `<div class="mh-row ${v.w >= v.l ? 'w' : 'l'}"><span>${UI.esc(Results.ev(id).name)}</span><b>${v.w}승 ${v.l}패</b></div>`).join('') || '<p class="ms-none">기록 없음</p>'}
          </div>
        </div>
        <div class="card"><div class="card-head"><h3>리그 우승·명예의 전당</h3></div><p class="ms-none">역대 리그 우승과 구단 레전드 기록은 데이터 수집 후 채울 예정입니다.</p></div>
      </div>`;
  },
};

Views['club-finance'] = el => Club.finance(el);
Views['club-salary-cap'] = el => Club.cap(el);
Views['club-staff'] = el => Club.staff(el);
Views['club-sponsors'] = el => Club.sponsors(el);
Views['club-board'] = el => Club.board(el);
Views['club-history'] = el => Club.history(el);

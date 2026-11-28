// 코칭스태프 능력치 · 특성
//   능력치(1~20): draft 밴픽 · manage 선수 관리(사기 · 컨디션) · tactic 전술(경기 판단) · develop 육성(성장)
//   팀 능력치는 분업: 능력치마다 스태프 중 가장 높은 코치 값 (헤드 코치는 ×HEAD). 특성은 스태프 전원 것을 모두 적용 (같은 특성은 한 번)
//   값: data/coaches.json(수동) → data/coaches-auto.json(tools/coach-auto.py) → 없으면 팀 명성으로 고정 생성
const Coach = {
  HEAD: 1.15,
  STATS: [['draft', '밴픽'], ['manage', '선수 관리'], ['tactic', '전술'], ['develop', '육성']],
  // 특성: [이름, 설명, 분야]
  TRAITS: {
    'daedaedae': ['대대대', 'Bo5에서 승률이 올라갑니다', 'tactic', true],
    'c-lang': ['C언어', '선수의 육성 속도가 빨라집니다', 'develop', true],
    'fearless-pro': ['피어리스 전문가', '세트가 진행될수록 밴픽이 나아집니다', 'draft'],
    'sure-plan': ['확실한 플랜', '1세트 밴픽이 뛰어납니다', 'draft'],
    'dice': ['주사위', '시리즈마다 밴픽 역량이 ×0.7 · ×1.0 · ×1.3 중 하나로 바뀝니다', 'draft'],
    'insight': ['통찰력', '메타 변화를 빨리 캐치합니다', 'draft'],
    'red-side': ['후픽 장인', '레드 진영(후픽)에서 밴픽이 나아집니다', 'draft'],
    'joker': ['조커픽', '선수가 잘하는 비주류 챔피언을 더 자주 꺼냅니다', 'draft'],
    'pillar': ['정신적 지주', '사기가 잘 떨어지지 않습니다', 'manage'],
    'comeback-will': ['절치부심', '연패에 빠질 확률이 줄어듭니다', 'manage'],
    'win-streak': ['승승장구', '연승을 이어 갈 확률이 올라갑니다', 'manage'],
    'mood-maker': ['분위기 메이커', '팀합이 좋아집니다', 'manage'],
    'veteran-care': ['베테랑 관리', '노장 선수의 기량 하락이 느려집니다', 'manage'],
    'zhuge': ['제갈량', '전술 역량이 오릅니다', 'tactic'],
    'big-stage': ['큰 무대 체질', '플레이오프 · 국제대회에서 전술이 나아집니다', 'tactic'],
    'comeback-arch': ['역전의 설계자', '골드가 뒤질 때 팀 판단이 나아집니다', 'tactic'],
    'teamfight': ['한타 설계자', '대규모 교전에서 강해집니다', 'tactic'],
    'macro-god': ['운영의 신', '공성 · 오브젝트 판단이 과감하고 정확해집니다', 'tactic'],
    'cl-master': ['2군 장인', '2군 · 아카데미 선수가 빨리 성장합니다', 'develop'],
    'scout-eye': ['유망주 감별사', '잠재력 평가가 정확하고, 좋은 유스가 더 자주 들어옵니다', 'develop'],
    'pool-wide': ['챔프폭 확장', '선수들의 챔피언 숙련도가 빨리 오릅니다', 'develop'],
    'network': ['인맥왕', '영입 · 재계약 협상에서 선수가 우리 팀을 더 좋게 봅니다', 'any'],
    'star': ['스타 코치', '팬 · 스폰서 인기가 올라 스폰서 수입이 늘어납니다', 'any'],
  },
  data: {},
  load(manual, auto) {
    this.data = { ...((auto || {}).coaches || {}) };
    Object.entries((manual || {}).coaches || {}).forEach(([id, v]) => { this.data[id] = { ...(this.data[id] || {}), ...v }; });
    this._c = {};
  },
  // 코치 한 명 (자료가 없으면 팀 명성 기준으로 고정 생성)
  of(s, t) {
    if (!s) return null;
    const d = this.data[s.id]; if (d) return d;
    const fame = typeof Fame !== 'undefined' ? Fame.team(t || App.db.teams.find(x => x.id === s.team)) : 50, r = Ident.rng('coach:' + s.id), base = 6 + fame * .08;
    const o = { traits: [], head: false }; this.STATS.forEach(([k]) => { o[k] = Math.max(3, Math.min(18, Math.round(base + (r() - .5) * 6))); });
    return (this.data[s.id] = o);
  },
  // 헤드 코치: 헤드 표시가 있는 코치(여럿이면 능력치 합이 큰 쪽), 없으면 명단 첫 번째
  headOf(t) {
    const st = (t && t.staff) || []; if (!st.length) return null;
    const sum = s => { const c = this.of(s, t); return this.STATS.reduce((a, [k]) => a + c[k], 0); };
    const hs = st.filter(s => this.of(s, t).head); return (hs.length ? hs : [st[0]]).sort((a, b) => sum(b) - sum(a))[0];
  },
  val(s, t, k) { const c = this.of(s, t); return (c[k] || 10) * (s === this.headOf(t) ? this.HEAD : 1); },
  // 팀 코칭 (분업): { draft, manage, tactic, develop, by: { k: 코치 }, traits: Set, head }
  team(t) {
    if (!t) return { draft: 6, manage: 8, tactic: 8, develop: 8, by: {}, traits: new Set(), head: null };
    const key = t.id + ':' + ((t.staff || []).map(s => s.id).join(','));
    if (this._c[key]) return this._c[key];
    const o = { by: {}, traits: new Set(), head: this.headOf(t) };
    this.STATS.forEach(([k]) => { let best = null, v = 6; (t.staff || []).forEach(s => { const x = this.val(s, t, k); if (x > v) { v = x; best = s; } }); o[k] = Math.round(v * 10) / 10; o.by[k] = best; });
    (t.staff || []).forEach(s => (this.of(s, t).traits || []).forEach(x => o.traits.add(x)));
    if (o.traits.has('zhuge')) o.tactic += 2;   // 제갈량
    return (this._c[key] = o);
  },
  has(t, x) { return !!t && this.team(t).traits.has(x); },
  teamOf(p) { const id = p.loan ? p.loan.to : p.gen ? (p.org || p.team) : p.team; return App.db.teams.find(t => t.id === id) || null; },

  // ---------- 효과 ----------
  // 밴픽 역량 (그 세트 상황 포함): 주사위 · 피어리스 전문가 · 확실한 플랜 · 후픽 장인
  draftR(S, k) {
    const t = Draft.side(S, k), c = this.team(t); let r = c.draft;
    if (c.traits.has('dice')) r *= [.7, 1, 1.3][Math.floor(G.rand((S.series && S.series.key) + ':' + t.id, 'dice') * 3)];
    if (c.traits.has('fearless-pro')) r += Math.min(3, ((S.game || 1) - 1) * 1);
    if (c.traits.has('sure-plan') && (S.game || 1) === 1) r += 3;
    if (c.traits.has('red-side') && k === 'R') r += 2;
    return Math.max(1, Math.min(26, r));
  },
  // 공식 경기 정보 (key = 경기 id)
  matchOf(key) { if (!key || typeof Schedule === 'undefined' || !Schedule.all) return null; const M = (this._m ||= {}); if (!(key in M)) M[key] = Schedule.all.find(m => m.id === key) || null; return M[key]; },
  bigStage(key) { const m = this.matchOf(key), e = m && Schedule.eventOf(m); return !!e && (e.league === 'INTL' || e.kind === 'playoffs'); },
  // 경기 전술 값 (경기 상황 포함): 큰 무대 · 대대대(Bo5) · 절치부심/승승장구(연패 · 연승 중)
  tacticFor(t, key, bo) {
    const c = this.team(t); let v = c.tactic;
    if (c.traits.has('big-stage') && this.bigStage(key)) v += 2;
    if (c.traits.has('daedaedae') && bo === 5) v += 3;
    const st = typeof Cond !== 'undefined' ? (Cond.st().streak || {})[t.id] || 0 : 0;
    if (c.traits.has('comeback-will') && st <= -2) v += 2;
    if (c.traits.has('win-streak') && st >= 2) v += 1.5;
    return v;
  },
  // 사기 변화 배율 (선수 관리 · 정신적 지주)
  moraleMul(t, v) { const c = this.team(t); return v < 0 ? Math.max(.3, (1.3 - c.manage / 20 * .6) * (c.traits.has('pillar') ? .6 : 1)) : .8 + c.manage / 20 * .4; },
  // 성장 배율 (육성 · C언어 · 2군 장인). 2군 · 아카데미는 2군 코치진 육성도 본다
  devMul(p, lv) {
    const t = this.teamOf(p); if (!t) return 1;
    const c = this.team(t); let d = c.develop;
    if (lv !== 'first') (t.clStaff || []).forEach(s => { d = Math.max(d, (this.of(s, t).develop || 0)); });
    let m = .7 + d / 20 * .6;
    if (c.traits.has('c-lang')) m *= 1.25;
    if (c.traits.has('cl-master') && lv !== 'first') m *= 1.3;
    return m;
  },
};

// ---------- 화면 ----------
Object.assign(Coach, {
  bar(v) { const c = v >= 17 ? 'var(--gold)' : v >= 13 ? '#3fbf7f' : v >= 9 ? '#8aa0c8' : '#e2575c'; return `<div class="co-bar"><i style="width:${Math.min(100, v / 20 * 100)}%;background:${c}"></i></div>`; },
  chip(x) { const T = this.TRAITS[x]; return T ? `<span class="co-tr${T[3] ? ' only' : ''}" title="${UI.esc(T[1])}">${UI.esc(T[0])}</span>` : ''; },
  // 코치 한 명: 능력치 4개 + 특성 (full: 프로필용, 설명까지)
  statsHtml(s, t, full) {
    const c = this.of(s, t), head = this.headOf(t) === s;
    return `<div class="co-st">${this.STATS.map(([k, l]) => `<div class="co-row"><span>${l}</span>${this.bar(c[k])}<b>${c[k]}${head ? `<small>→${Math.round(c[k] * this.HEAD * 10) / 10}</small>` : ''}</b></div>`).join('')}</div>`
      + ((c.traits || []).length ? (full ? (c.traits || []).map(x => this.TRAITS[x] ? `<p class="pp-line">${this.chip(x)} ${UI.esc(this.TRAITS[x][1])}</p>` : '').join('') : `<div class="co-trs">${c.traits.map(x => this.chip(x)).join('')}</div>`) : (full ? '<p class="ms-none">특성 없음</p>' : ''));
  },
  // 팀 코칭 요약 (분업 결과)
  teamHtml(t) {
    const c = this.team(t);
    return `<div class="card co-team"><div class="card-head"><h3>팀 코칭 <small>분업 · 헤드 코치 ×${this.HEAD}</small></h3></div>
      <div class="co-st">${this.STATS.map(([k, l]) => `<div class="co-row"><span>${l}</span>${this.bar(c[k])}<b>${c[k]}</b><small>${c.by[k] ? UI.esc(c.by[k].name) : '-'}</small></div>`).join('')}</div>
      ${c.traits.size ? `<div class="co-trs">${[...c.traits].map(x => this.chip(x)).join('')}</div>` : '<p class="ms-none">적용 중인 특성 없음</p>'}</div>`;
  },
});

/* LM 27 — 튜토리얼 (FM 방식: 우리 팀 코치들이 화면마다 처음 들어갈 때 안내한다)
   말하는 사람: 수석 코치(밴픽 담당) · 운영 코치(라커룸 담당) · 분석 코치(나머지) · 주장(선수 대표) · 사무국장(가상 인물)
   보는 방식: App.state.tut.mode — all(차례대로 다음 화면까지 데려간다) / first(화면마다 처음 들어갈 때만) / off(안 뜬다, ? 단추로만)
   진행: App.state.tut.seen[route] = 1 (저장 파일에 남는다). 위쪽 ? 단추 = 지금 화면 안내 다시 보기, 커리어 › 설정 = 처음부터 다시 */
const Tutorial = {
  GM: { name: '한서진', role: '사무국장', id: null },   // 가상 인물
  // 차례대로 보기(all)에서 다음으로 데려가는 순서
  CHAIN: [['portal-overview', '포털'], ['roster-first-team', '로스터'], ['training-schedule', '훈련 일정'], ['training-scrims', '스크림'], ['match-next', '다음 경기'], ['recruit-search', '영입'], ['club-finance', '구단 재정'], ['club-board', '이사회'], ['career-settings', '저장']],

  st() { return (App.state.tut ||= { mode: null, seen: {} }); },
  team() { return Roster.team(); },

  // ---------- 말하는 사람 ----------
  people() {
    const t = this.team(), staff = (t.staff || []).slice(), used = new Set();
    const take = p => { if (p && !used.has(p)) { used.add(p); return p; } return null; };
    const head = take(Draft.coach(t).p) || take(staff[0]);
    const ops = take(typeof Locker !== 'undefined' ? Locker.coach() : null) || take(staff.find(s => !used.has(s)));
    const ana = take(staff.find(s => !used.has(s)));
    const fake = n => ({ name: n, id: null });
    return { head: head || fake('수석 코치'), ops: ops || head || fake('코치'), ana: ana || ops || head || fake('분석 코치'), cap: this.captain(t) || fake('주장'), gm: this.GM };
  },
  ROLE: { head: '수석 코치 · 밴픽 담당', ops: '코치 · 선수단 관리', ana: '코치 · 분석 · 영입', cap: '주장', gm: '사무국장' },
  // 주장: 주전 중 리더십 특성이 있는 선수, 없으면 팀에 오래 있었고 나이 · 실력이 높은 선수
  // 팀별로 직접 정한 주장 (선수 id). 여기 없는 팀은 아래 자동 계산
  CAPTAIN: { t1: 'faker' },
  captain(t) {
    const L = Draft.lineup(t).filter(Boolean); if (!L.length) return null;
    const fix = this.CAPTAIN[t.id] && t.players.find(p => p.id === this.CAPTAIN[t.id]); if (fix) return fix;   // 직접 정한 주장 (그 팀에 있는 동안)
    const st = this.st(), kept = st.cap && L.find(p => p.id === st.cap); if (kept) return kept;   // 한 번 정한 주장은 주전으로 있는 동안 그대로
    const yrs = p => { const j = typeof Fame !== 'undefined' && Fame.joined(p); return j ? Fmt.daysBetween(j, Clock.today()) / 365 : 0; };
    const sc = p => (typeof Traits !== 'undefined' && Traits.has(p.id, 'leader') ? 100 : 0) + yrs(p) * 3 + (p.age || 20) * 1.2 + (p.ovr || 60) * .3;
    const c = L.slice().sort((a, b) => sc(b) - sc(a))[0]; if (typeof Traits === 'undefined' || Traits.cfg) st.cap = c.id; return c;
  },
  ko: r => G.ROLE_KO[r] || r,
  j: (w, a, b) => Sim.josa(w, a, b),

  // ---------- 어디를 보강하면 좋은가: 우리 주전 OVR vs 같은 리그 주전 평균, 후보 유무 ----------
  needs() {
    const t = this.team(), L = App.db.teams.filter(x => x.league === t.league && x.id !== t.id), mine = Draft.lineup(t);
    const rows = G.ROLES.map((r, i) => {
      const vs = L.map(x => (Draft.lineup(x)[i] || {}).ovr || 0).filter(v => v), avg = vs.length ? vs.reduce((a, v) => a + v, 0) / vs.length : 70;
      const p = mine[i], ovr = p ? p.ovr || 0 : 0;
      return { r, p, ovr, avg: Math.round(avg * 10) / 10, d: Math.round((ovr - avg) * 10) / 10, depth: t.players.filter(q => q.role === r).length };
    });
    const weak = rows.slice().sort((a, b) => a.d - b.d), thin = rows.filter(x => x.depth < 2);
    return { rows, weak, thin, best: rows.slice().sort((a, b) => b.d - a.d)[0] };
  },
  needText(short) {
    const n = this.needs(), w = n.weak[0], w2 = n.weak[1], ko = this.ko;
    if (!w.p) return `${ko(w.r)} 주전이 비어 있습니다. 개막 전에 반드시 한 명 데려와야 해요.`;
    let s;
    if (w.d <= -1.5) {
      s = `보강이 가장 급한 곳은 <b>${ko(w.r)}</b>입니다. 주전 ${UI.esc(w.p.name)}의 OVR이 ${w.ovr}, 리그 ${ko(w.r)} 주전 평균은 ${this.j(String(w.avg), '이에요', '예요')}.`;
      if (!short && w2.d <= -1.5) s += ` 그다음은 ${ko(w2.r)}(평균보다 ${Math.abs(w2.d)} 낮음)입니다.`;
    } else s = `주전은 모두 리그 평균 언저리 이상입니다. 그나마 ${this.j(ko(w.r), '이', '가')} 가장 약한 편이에요(평균 대비 ${w.d >= 0 ? '+' : ''}${w.d}).`;
    if (n.thin.length) s += ` 그리고 ${this.j(n.thin.map(x => ko(x.r)).join(' · '), '은', '는')} 1군 후보가 없어서, 주전이 빠지면 대신 뛸 선수가 없습니다.`;
    else if (!short) s += ' 포지션마다 후보도 있어요.';
    return s;
  },
  capRoster() {
    const t = this.team(), L = Draft.lineup(t).filter(Boolean), cap = this.captain(t);
    const low = typeof Cond !== 'undefined' ? L.filter(p => p !== cap && Cond.word && /나쁨|최악/.test(Cond.word(p))) : [];
    if (low.length) return `선수들 분위기는 나쁘지 않습니다. 다만 ${this.j(low[0].name, '이', '가')} 요즘 폼이 좀 떨어져 있어요. 한 번 챙겨 주시면 좋겠습니다.`;
    return '선수들 분위기는 좋습니다. 누가 흔들리면 제가 먼저 말씀드릴게요.';
  },

  // ---------- 화면별 안내 ----------
  // who: 말하는 사람 · at: 비출 곳(쉼표로 여러 후보, 처음 찾은 것) · text: 문장(함수면 그때 계산)
  scenes() {
    const P = this.people(), t = this.team(), N = s => UI.esc(s.name), cap = N(P.cap);
    return {
      intro: [
        { who: 'head', text: `감독님, ${UI.esc(t.name)} 부임을 축하드립니다. 저는 ${N(P.head)}, 밴픽을 맡고 있습니다. 시즌 준비, 같이 하시죠.` },
        { who: 'head', text: `스태프를 소개할게요. ${this.j(N(P.ops), '이', '가')} 선수단 컨디션과 훈련, ${this.j(N(P.ana), '이', '가')} 영입과 상대 분석을 봅니다. 구단 살림은 ${P.gm.name} 사무국장님 담당이고요.` },
        { who: 'cap', text: `주장 ${cap}입니다. 선수들 대표로 인사드려요. 하고 싶은 말이 있으면 라커룸에서 솔직하게 말씀드리겠습니다.` },
        { who: 'head', choose: true, text: '안내는 어떻게 해 드릴까요? 언제든 위쪽 <b>?</b> 단추로 그 화면 안내를 다시 볼 수 있습니다.' },
      ],
      returning: [
        { who: 'head', choose: true, text: '감독님, 코치진이 화면마다 안내를 준비했습니다. 보시겠어요? 위쪽 <b>?</b> 단추로 언제든 다시 볼 수 있습니다.' },
      ],
      'portal-overview': [
        { who: 'head', at: '#tb-menu', text: '위쪽 메뉴가 감독실입니다. 포털 · 로스터 · 영입 · 경기 · 훈련 · 구단 · 커리어, 아래 줄은 그 메뉴의 세부 화면이에요.' },
        { who: 'head', at: '.msg-panel', text: '중요한 일은 전부 메시지로 옵니다. 계약 · 이적 제안 · 이사회 연락 · 선수 면담 요청은 여기서 답하시면 됩니다.' },
        { who: 'head', at: '.portal-cards', text: '오른쪽에는 다음 경기, 리그 순위, 이번 주 일정이 있습니다.' },
        { who: 'head', at: '.btn-continue', text: '준비가 끝나면 <b>계속</b>을 누르세요. 하루씩 시간이 흐르고, 경기 날에는 <b>경기로</b>, 스크림 날에는 <b>스크림으로</b> 단추로 바뀝니다.' },
      ],
      'portal-messages': [
        { who: 'head', at: '.msg-head', text: '메시지는 종류별로 걸러 볼 수 있습니다. 답이 필요한 메시지는 열어서 바로 결정하시면 돼요.' },
      ],
      'roster-first-team': [
        { who: 'ops', at: '.rs-table-wrap', text: `선수단 관리를 맡은 ${N(P.ops)}입니다. 여기가 1군 명단이에요. OVR은 지금 실력이고, 이름을 누르면 능력치 · 계약 · 특성이 열립니다.` },
        { who: 'ops', at: '.rs-bar', text: '위쪽 단추로 보기를 바꿀 수 있습니다. 1군 · 챌린저스 · 아카데미는 아래 줄 탭에서요.' },
        { who: 'ops', at: '.rs-table-wrap', text: () => this.needText() },
        { who: 'cap', text: () => `${this.capRoster()}` },
        { who: 'ops', at: '.rs-staff', text: '아래는 코칭스태프입니다. 저희 셋이 각자 맡은 화면에서 계속 도와드릴게요.' },
      ],
      'roster-condition': [
        { who: 'ops', at: '.cd-grid', text: '컨디션입니다. 지면 떨어지고 연패하면 더 떨어지고, 이기면 올라요. 바닥까지 가면 선수가 먼저 면담을 요청합니다.' },
        { who: 'cap', text: '컨디션이 낮을 땐 경기 전에 감독님이 한마디만 해 주셔도 달라집니다. 라커룸에서 말투도 중요하고요.' },
      ],
      'roster-mastery': [
        { who: 'ana', at: '.ms-list', text: '선수마다 챔피언 숙련도가 있습니다. 밴픽 때 숙련도 높은 챔피언을 주면 그만큼 잘해요.' },
        { who: 'ana', at: '.ms-detail', text: '오른쪽은 고른 선수의 챔피언 목록입니다. 패치로 강해진 챔피언은 연습이 필요하다고 따로 알려 드릴게요.' },
      ],
      'training-schedule': [
        { who: 'ops', at: '.tr-wrap', text: '한 주 훈련표입니다. 칸을 눌러 바꾸세요. 스크림과 리뷰는 팀합을, 휴식은 컨디션을 올립니다.' },
        { who: 'ops', at: '.tr-preset', text: '바쁘실 땐 미리 만든 계획을 고르시면 됩니다.' },
        { who: 'ops', at: '.tr-fx, .cr-grid', text: '아래에 이 계획대로 한 주를 보내면 어떻게 되는지 나옵니다. 피로가 60을 넘으면 컨디션이 깎여요.' },
        { who: 'cap', text: '대회 앞두고는 하루쯤 쉬게 해 주시면 선수들이 고마워할 겁니다.' },
      ],
      'training-scrims': [
        { who: 'ops', at: '.cr-grid', text: '스크림 상대를 잡는 곳입니다. 결과는 순위에 안 들어가니 실전 연습으로 쓰세요.' },
        { who: 'head', text: '첫 공식전 전에 한 판 잡아 보시죠. 스크림 날에는 밴픽 → 경기 → 라커룸이 실제 경기와 똑같이 진행됩니다. 처음 들어가실 때 제가 하나씩 설명드릴게요.' },
      ],
      'match-next': [
        { who: 'head', at: '.nx-head', text: '다음 상대입니다. 날짜, 대회, 양 팀 전력이 나와요.' },
        { who: 'ana', at: '.cr-grid', text: `분석 담당 ${N(P.ana)}입니다. 상대 전적과 상대 주력 챔피언이에요. 밴할 챔피언은 여기서 먼저 보시면 됩니다.` },
        { who: 'ana', at: '.op-roster', text: '아래는 상대 예상 선발입니다. 상대 분석 리포트 메시지도 경기 전에 보내 드립니다.' },
      ],
      'match-draft': [
        { who: 'head', at: '.dr-coach, .dr-sugs', text: '밴픽입니다. 차례마다 제가 추천 세 개를 드립니다. 누르면 바로 고를 수 있어요.' },
        { who: 'head', at: '.dr-grid, .dr-pool', text: '챔피언 칸입니다. 포지션 단추로 거르고, 우리 선수가 잘하는 챔피언에는 표시가 붙습니다. 상대 주력 챔피언부터 막는 게 기본이에요.' },
        { who: 'head', at: '.dr-tools', text: '차례마다 시간 제한이 있습니다. 급하시면 타이머를 끄시거나 저에게 맡기세요. 이 안내를 읽는 동안은 시간이 멈춥니다.' },
        { who: 'cap', text: '저희가 자신 있는 챔피언을 주시면 꼭 보답하겠습니다.' },
      ],
      'match-tactics': [
        { who: 'head', at: '.dr-tac-top', text: '밴픽이 끝났습니다. 이제 경기 전 전술이에요. 위는 양 팀 조합입니다.' },
        { who: 'head', at: '.dr-ins', text: '팀 지시입니다. 교전 성향 · 오브젝트 우선순위 · 운영 구도 · 공략 라인 · 한타 목표 · 시야, 경기 중 판단이 이대로 바뀝니다.' },
        { who: 'head', at: '.dr-rt', text: '포지션별 지시입니다. 미드 로밍, 원딜 합류, 탑 스플릿 같은 선수 동선을 정해요.' },
        { who: 'head', at: '.dr-advice', text: '제 조언은 여기 있습니다. 상대 조합을 보고 드리는 말이니 참고하세요.' },
        { who: 'cap', at: '.dr-tac-foot', text: '준비되시면 경기 시작을 눌러 주세요. 저희가 해내겠습니다.' },
      ],
      'match-live': [
        { who: 'head', at: '.lv-map', text: '경기 화면입니다. 결과는 미리 정해지지 않고, 밴픽 · 전술 · 선수 실력으로 매 순간 계산됩니다.' },
        { who: 'head', at: '.lv-mode', text: '하이라이트는 조용할 땐 빨리 넘기고 싸움은 천천히 보여 줍니다. 전체 보기는 같은 속도로 봐요.' },
        { who: 'head', at: '.lv-speed', text: '배속은 여기서 바꿉니다. 결과만 보고 싶으시면 <b>결과로</b>를 누르세요.' },
        { who: 'head', at: '.lv-visrow, .lv-vis', text: '시야 보기를 켜면 와드와 시야가 닿는 곳이 보입니다. 한 팀을 고르면 그 팀이 못 보는 곳은 어둡게 나와요.' },
      ],
      'match-locker': [
        { who: 'ops', at: '.lk-chat', text: '세트가 끝나면 라커룸입니다. 제가 방금 세트에서 결정적이었던 장면을 짚고, 선수들이 한마디씩 합니다.' },
        { who: 'cap', at: '.lk-chat', text: '저희 얘기도 들어 주세요. 감독님 말투에 따라 다음 세트 분위기가 달라집니다.' },
        { who: 'ops', at: '.lk-opts', text: '말투, 밴 방향, 공략 라인, 진영을 고르면 다음 세트에 반영됩니다.' },
      ],
      'recruit-search': [
        { who: 'ana', at: '.ch-bar', text: '스카우트 검색입니다. 이름이나 포지션으로 찾고, 정렬로 실력 · 나이 · 몸값을 비교해 보세요.' },
        { who: 'ana', at: '.rs-table-wrap', text: () => `${this.needText(true)} 이 포지션부터 보시죠.` },
        { who: 'ana', at: '.rs-table-wrap', text: '마음에 드는 선수는 관심 목록에 넣어 두세요. 스카우트 리포트 탭에서 자세히 볼 수 있고, FA 시장에서는 이적료 없이 데려올 수 있습니다.' },
      ],
      'recruit-fa': [
        { who: 'ana', at: '.rs-table-wrap', text: () => `FA 시장입니다. 이적료 없이 연봉만으로 데려올 수 있어요. ${this.needText(true)}` },
      ],
      'club-finance': [
        { who: 'gm', at: '.rs-stats, .rs-head', text: `사무국장 ${P.gm.name}입니다. 구단 살림은 제가 봅니다. 위쪽이 지금 잔고와 예산이에요.` },
        { who: 'gm', at: '.cr-grid', text: '수입은 스폰서 · 상금 · 굿즈, 지출은 대부분 연봉입니다. 샐러리캡을 넘기면 영입이 막혀요.' },
      ],
      'club-board': [
        { who: 'gm', at: '.cr-rep-main, .cr-grid', text: '이사회는 시즌 목표로 감독님을 평가합니다.' },
        { who: 'gm', at: '.rs-table', text: '목표를 크게 못 채우면 경질될 수 있습니다. 시즌 중간에 이사회 평가 메시지가 갈 거예요.' },
      ],
      'career-settings': [
        { who: 'head', at: '.sv-slots', text: '저장은 여기서 합니다. 자동 저장을 켜 두시면 하루마다 저장돼요.' },
        { who: 'head', end: true, text: '안내는 여기까지입니다. 화면 위쪽 <b>?</b> 단추를 누르면 그 화면 안내를 다시 볼 수 있어요. 첫 경기, 잘해 봅시다.' },
      ],
    };
  },

  // ---------- 진행 ----------
  init() {
    Router.onRoute(route => {
      // 다른 화면으로 넘어가면 떠 있던 안내는 닫는다 (본 걸로 치지 않는다 — 그 화면에 다시 가면 다시 나온다)
      if (this.box && this.keyOf(route) !== this.key && this.key !== 'match-tactics') { this.close(); if (this.key === 'match-live' && typeof Live !== 'undefined' && this.wasPlaying) Live.playing = true; }
      clearTimeout(this._t); this._t = setTimeout(() => this.auto(route), 450);
    });
    setInterval(() => { if (Router.current() === 'match-draft' && !this.box && document.querySelector('.dr-tac')) this.auto('match-draft'); }, 1000);   // 밴픽 → 전술은 주소가 그대로라 따로 본다
    const bar = document.querySelector('.tb-hist');
    if (bar && !document.querySelector('.tut-help')) {
      const b = document.createElement('button'); b.className = 'icon-btn tut-help'; b.title = '이 화면 안내'; b.textContent = '?';
      b.onclick = () => this.replay(); bar.appendChild(b);
    }
  },
  // 같은 주소 안에서 화면이 바뀌는 곳: 밴픽이 끝나면 전술 화면
  keyOf(route) { return route === 'match-draft' && document.querySelector('.dr-tac') ? 'match-tactics' : route; },
  played() { return Object.keys(App.state.season || {}).length > 0 || (App.state.scrims || []).some(s => s.result); },
  auto(route, n = 0) {
    if (!App.state.teamId || App.state.unemployed || this.box || Router.current() !== route) return;   // 그사이 다른 화면으로 넘어갔으면 (경기 화면이 포털로 돌려보내진 경우 등) 띄우지 않는다
    if (document.querySelector('#modal-root .modal-back')) { if (n < 40) this._t = setTimeout(() => this.auto(route, n + 1), 500); return; }   // 다른 창이 떠 있으면 닫힐 때까지 기다린다
    if (typeof Traits !== 'undefined' && !Traits.cfg) { Traits.load().then(() => this.auto(route, n)); return; }   // 주장(리더십 특성)을 정하려면 특성이 먼저 읽혀야 한다
    const st = this.st(), sc = this.scenes();
    if (!st.mode) { if (route !== 'portal-overview' && !this.played()) return; return this.run(this.played() ? 'returning' : 'intro', route); }
    const key = this.keyOf(route);
    if (st.mode === 'off' || st.seen[key] || !sc[key]) return;
    this.run(key);
  },
  replay() {
    const r = this.keyOf(Router.current()), sc = this.scenes();
    if (!sc[r]) { UI.toast('이 화면은 따로 안내가 없습니다'); return; }
    this.close(); this.run(r, null, true);
  },
  reset() { App.state.tut = { mode: 'first', seen: {} }; UI.toast('튜토리얼을 처음부터 다시 봅니다'); },
  run(key, then, manual) {
    const steps = this.scenes()[key]; if (!steps) return;
    this.key = key; this.then = then; this.steps = steps; this.i = 0; this.manual = manual;
    // 경기 중계는 안내하는 동안 멈춘다
    if (key === 'match-live' && typeof Live !== 'undefined') { this.wasPlaying = Live.playing; Live.playing = false; }
    this.show();
  },
  finish(skipAll) {
    const st = this.st(), key = this.key;
    if (key !== 'intro' && key !== 'returning') st.seen[key] = 1;
    if (skipAll) st.mode = 'off';
    this.close();
    if (key === 'match-live' && typeof Live !== 'undefined' && this.wasPlaying) Live.playing = true;
    if (key === 'career-settings') st.done = 1;
    // 첫 인사 뒤에는 이 화면(포털) 안내로 이어서
    if ((key === 'intro' || key === 'returning') && st.mode && st.mode !== 'off') { const r = this.then || Router.current(); if (this.scenes()[r] && !st.seen[r]) setTimeout(() => this.run(r), 250); }
  },
  next() { if (++this.i >= this.steps.length) this.finish(); else this.show(); },
  close() { if (this.box) { this.box.remove(); this.box = null; } window.removeEventListener('resize', this._rs); document.removeEventListener('keydown', this._kd); },

  // 다음 화면 (차례대로 보기)
  nextScene() { const i = this.CHAIN.findIndex(c => c[0] === this.key), st = this.st(); for (let k = i + 1; k < this.CHAIN.length; k++) if (!st.seen[this.CHAIN[k][0]]) return this.CHAIN[k]; return null; },

  show() {
    const s = this.steps[this.i], P = this.people(), who = P[s.who], last = this.i === this.steps.length - 1, st = this.st();
    if (!this.box) {
      this.box = document.createElement('div'); this.box.className = 'tut';
      this.box.innerHTML = '<div class="tut-shade"></div><div class="tut-hole"></div><div class="tut-bub"></div>';
      document.body.appendChild(this.box);
      this._rs = () => this.place(); window.addEventListener('resize', this._rs);
      this._kd = e => { if (e.key === 'Escape') this.finish(); else if (e.key === 'Enter' && !this.steps[this.i].choose) this.next(); }; document.addEventListener('keydown', this._kd);
    }
    const text = typeof s.text === 'function' ? s.text() : s.text;
    const lockd = typeof MatchLock !== 'undefined' && MatchLock.on();
    const nx = last && !s.choose && !this.manual && st.mode === 'all' && !lockd && this.nextScene();
    const btns = s.choose
      ? `<button class="btn-primary" data-m="all">차례대로 안내받기</button><button class="btn-ghost" data-m="first">화면마다 처음만</button><button class="btn-ghost" data-m="off">안내 없이</button>`
      : `${!last && !this.manual ? '<button class="btn-ghost tut-skip">안내 끄기</button>' : ''}<span class="tut-n">${this.i + 1} / ${this.steps.length}</span>${nx ? `<button class="btn-ghost tut-done">여기까지</button><button class="btn-primary tut-go">다음: ${nx[1]}</button>` : `<button class="btn-primary tut-next">${last ? '알겠습니다' : '다음'}</button>`}`;
    const bub = this.box.querySelector('.tut-bub');
    bub.className = 'tut-bub ' + s.who;
    bub.innerHTML = `<div class="tut-who">${G.face(who, 'tut-ph')}<div><b>${UI.esc(who.name)}</b><small>${this.ROLE[s.who]}</small></div></div><p>${text}</p><div class="tut-btns">${btns}</div>`;
    bub.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { st.mode = b.dataset.m; this.finish(); });
    const q = c => bub.querySelector(c);
    if (q('.tut-next')) q('.tut-next').onclick = () => this.next();
    if (q('.tut-skip')) q('.tut-skip').onclick = () => UI.modal({ title: '안내 끄기', body: '앞으로 화면 안내를 띄우지 않습니다. 위쪽 ? 단추나 커리어 › 설정에서 다시 볼 수 있어요.', actions: [{ label: '취소' }, { label: '끄기', primary: true, onClick: () => this.finish(true) }] });
    if (q('.tut-done')) q('.tut-done').onclick = () => { st.mode = 'first'; this.finish(); };
    if (q('.tut-go')) q('.tut-go').onclick = () => { this.finish(); Router.go(nx[0]); };
    this.target = this.find(s.at);
    if (this.target) this.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    requestAnimationFrame(() => this.place());
  },
  find(sel) { if (!sel) return null; for (const c of sel.split(',')) { const el = document.querySelector(c.trim()); if (el && el.getClientRects().length) return el; } return null; },
  // 비출 곳 둘레에 구멍, 말풍선은 그 아래(자리가 없으면 위 · 옆), 비출 곳이 없으면 가운데
  place() {
    if (!this.box) return;
    const hole = this.box.querySelector('.tut-hole'), bub = this.box.querySelector('.tut-bub'), W = innerWidth, H = innerHeight, pad = 6;
    const bw = Math.min(440, W - 32); bub.style.width = bw + 'px';
    const bh = bub.offsetHeight;
    if (!this.target) { hole.style.display = 'none'; this.box.classList.add('dim'); bub.style.left = (W - bw) / 2 + 'px'; bub.style.top = Math.max(16, (H - bh) / 2) + 'px'; return; }
    this.box.classList.remove('dim');
    const r = this.target.getBoundingClientRect(), x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad), x2 = Math.min(W - 4, r.right + pad), y2 = Math.min(H - 4, r.bottom + pad);
    Object.assign(hole.style, { display: 'block', left: x + 'px', top: y + 'px', width: (x2 - x) + 'px', height: (y2 - y) + 'px' });
    const cx = Math.max(16, Math.min(W - bw - 16, (x + x2) / 2 - bw / 2));
    let left = cx, top;
    if (H - y2 >= bh + 24) top = y2 + 12;
    else if (y >= bh + 24) top = y - bh - 12;
    else if (W - x2 >= bw + 24) { left = x2 + 12; top = Math.max(16, Math.min(H - bh - 16, y)); }
    else if (x >= bw + 24) { left = x - bw - 12; top = Math.max(16, Math.min(H - bh - 16, y)); }
    else top = H - bh - 16;   // 비출 곳이 화면을 거의 다 차지하면 아래쪽에 겹쳐 띄운다
    bub.style.left = left + 'px'; bub.style.top = top + 'px';
  },
};

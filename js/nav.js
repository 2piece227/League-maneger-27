// 메인 게임 화면의 상단 바: 대메뉴 7개 + 하위 탭
const NAV = [
  { id: 'portal', label: '포털', tabs: [['overview', '개요'], ['messages', '메시지'], ['calendar', '캘린더'], ['news', '뉴스'], ['fixtures', '경기 일정'], ['opponent-report', '상대 분석 리포트']] },
  { id: 'roster', label: '로스터', tabs: [['first-team', '1군'], ['challengers', '챌린저스'], ['academy', '아카데미'], ['compare', '선수 비교'], ['mastery', '챔피언 숙련도'], ['condition', '컨디션·폼'], ['relations', '선수 관계'], ['contracts', '계약 현황']] },
  { id: 'recruit', label: '영입', tabs: [['search', '스카우트 검색'], ['teams', '팀 검색'], ['shortlist', '관심 목록'], ['reports', '스카우트 리포트'], ['fa', 'FA 시장'], ['offers', '이적 제안'], ['assignments', '스카우트 배정']] },
  { id: 'match', label: '경기', tabs: [['next', '다음 경기'], ['draft', '밴픽', 'hidden'], ['live', '경기', 'hidden'], ['opponent', '상대 분석'], ['history', '경기 기록'], ['register', '국제대회 등록', 'hidden'], ['locker', '라커룸', 'hidden'], ['cupdraft', 'LCK컵 그룹', 'hidden'], ['meta', '메타'], ['champions', '챔피언'], ['standings', '순위표']] },
  { id: 'training', label: '훈련', tabs: [['schedule', '팀 훈련 일정'], ['individual', '개인 훈련'], ['soloq', '솔랭 순위'], ['scrims', '스크림']] },
  { id: 'club', label: '구단', tabs: [['finance', '재정'], ['salary-cap', '샐러리캡'], ['staff', '코칭스태프'], ['sponsors', '스폰서'], ['board', '이사회 기대치'], ['history', '구단 역사']] },
  { id: 'career', label: '커리어', tabs: [['profile', '감독 프로필'], ['reputation', '평판'], ['record', '커리어 기록'], ['other-teams', '다른 팀 보기'], ['settings', '설정·저장']] },
];

// 경기 중 잠금 (FM 방식): 경기로·스크림으로 들어가면 그 시리즈가 끝날 때까지 밴픽 · 경기 · 라커룸 화면만 쓴다.
// 잠금 여부는 저장 상태에서 계산한다(진행 중인 오늘의 공식전 또는 스크림 밴픽이 있으면 잠김). 저장을 불러와도 이어진다.
const MatchLock = {
  ROUTES: ['match-draft', 'match-live', 'match-locker'],
  on() {
    const D = App.state.draft; if (!D || !App.state.teamId) return false;
    // 일정 데이터가 아직 안 읽혔어도(불러오기 직후) 저장 상태만으로 판단한다
    // 일정을 읽은 뒤에는 오늘 경기인지까지 본다 (예전 저장에 남은 다른 날 밴픽으로 갇히지 않게)
    const today = Clock.today();
    if (D.official) {
      if ((App.state.season || {})[D.series.key]) return false;
      const m = typeof Schedule !== 'undefined' && (Schedule.all || []).find(x => x.id === D.series.key);
      return !m || m.t.slice(0, 10) === today;
    }
    if (D.scrim) { const s = (App.state.scrims || []).find(x => x.id === D.scrim); return !!s && !s.result && (!s.on || s.on === today); }
    return false;
  },
  // 지금 있어야 할 화면
  home() {
    const D = App.state.draft, L = App.state.locker;
    if (L && D && L.key === D.series.key) return 'match-locker';
    if (typeof Live !== 'undefined' && Live.g && Live.g.S === D && !Live.g.over) return 'match-live';
    return 'match-draft';
  },
  allows(route) { return !this.on() || this.ROUTES.includes(route); },
  // 하위 탭 자리에 보이는 진행 표시
  bar(route) {
    const D = App.state.draft, my = Roster.team(), opp = Draft.side(D, D.us === 'B' ? 'R' : 'B');
    const m = D.official && (Schedule.all || []).find(x => x.id === D.series.key), title = D.official ? (m && (Schedule.eventOf(m) || {}).label) || '공식전' : '스크림';
    const steps = [['match-draft', '밴픽·전술'], ['match-live', '경기'], ['match-locker', '라커룸']];
    const rv = Rivalry.of(my.id, opp.id);
    return `<span class="ml-title"><b>${UI.esc(title)}</b>${rv ? ` <em class="ml-rv">⚔ ${UI.esc(rv.name)}</em>` : ''} ${UI.esc(my.short)} vs ${UI.esc(opp.short)} · ${D.series.fixed ? `${D.series.fixed}판 중 ${D.game}판` : D.series.bo > 1 ? `Bo${D.series.bo} ${D.game}세트` : '단판'}</span>
      ${steps.map(([r, l]) => `<span class="ml-step ${r === route ? 'on' : ''}">${l}</span>`).join('')}
      <span class="ml-note">경기가 끝나면 다른 화면으로 이동할 수 있습니다</span>`;
  },
};

const Nav = {
  DEFAULT: 'portal-overview',

  // "roster-first-team" → { menu, tab }
  parse(route) {
    const menu = NAV.find(m => route.startsWith(m.id + '-'));
    if (!menu) return null;
    const tabId = route.slice(menu.id.length + 1);
    const tab = menu.tabs.find(t => t[0] === tabId);
    return tab ? { menu, tab: { id: tab[0], label: tab[1] } } : null;
  },

  init() {
    const caret = '<svg class="caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
    $('#tb-menu').innerHTML = NAV.map(m => `
      <div class="tb-item" data-menu="${m.id}">
        <a class="tb-link" href="#${m.id}-${m.tabs[0][0]}">${m.label}${caret}</a>
        <div class="tb-drop">${m.tabs.filter(t => !t[2]).map(([id, label]) => `<a href="#${m.id}-${id}">${label}</a>`).join('')}</div>
      </div>`).join('');

    $('#nav-back').onclick = () => Router.back();
    $('#nav-fwd').onclick = () => Router.forward();
    $('#nav-burger').onclick = () => $('#screen-game').classList.toggle('menu-open');
    $('#tb-menu').addEventListener('click', e => {
      if (!e.target.closest('a')) return;
      $('#screen-game').classList.remove('menu-open');
      // 클릭 직후에는 호버 드롭다운을 닫아 하위 탭 줄을 가리지 않게 한다
      const item = e.target.closest('.tb-item');
      item.classList.add('no-drop');
      item.addEventListener('mouseleave', () => item.classList.remove('no-drop'), { once: true });
    });
    $$('.btn-continue').forEach(b => b.onclick = () => Engine.continue());

    Router.onRoute(route => this.render(route));
  },

  // 경기날이면 계속 버튼이 "경기로"가 된다
  continueLabel() {
    const lock = typeof MatchLock !== 'undefined' && MatchLock.on();
    document.querySelectorAll('.btn-continue').forEach(b => { b.classList.toggle('locked', lock); b.disabled = lock; });
    if (lock) { document.querySelectorAll('.btn-continue').forEach(b => { b.classList.remove('match'); b.firstChild.textContent = '경기 중 '; }); return; }
    const day = typeof Season !== 'undefined' && App.state.teamId && Season.today(), scr = !day && typeof Scrim !== 'undefined' && App.state.teamId && Scrim.today();
    document.querySelectorAll('.btn-continue').forEach(b => { b.classList.toggle('match', !!(day || scr)); b.firstChild.textContent = day ? '경기로 ' : scr ? '스크림으로 ' : '계속 '; });
  },
  render(route) {
    if (!App.current || App.current.id !== 'screen-game') return;
    const hit = this.parse(route);
    if (!hit) { Router.go(this.DEFAULT); return; }
    // 경기 중에는 밴픽 · 경기 · 라커룸 밖으로 나갈 수 없다
    const lock = MatchLock.on();
    if (lock && !MatchLock.ROUTES.includes(route)) {
      if (Router.pos > 0) UI.toast('경기가 끝날 때까지 다른 화면으로 이동할 수 없습니다');
      history.replaceState(null, '', '#' + MatchLock.home()); Router.onChange(); return;
    }
    $('#screen-game').classList.toggle('locked', lock);
    $('#screen-game').classList.remove('menu-open');
    const { menu, tab } = hit;

    $$('.tb-item').forEach(el => el.classList.toggle('on', el.dataset.menu === menu.id));
    this.continueLabel();
    if (lock) $('#subtabs').innerHTML = MatchLock.bar(route);
    else $('#subtabs').innerHTML = menu.tabs.filter(t => !t[2] || t[0] === tab.id).map(([id, label]) =>
      `<a href="#${menu.id}-${id}" class="${id === tab.id ? 'on' : ''}">${label}</a>`).join('');
    const active = $('#subtabs a.on');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    $('#nav-back').disabled = !Router.canBack();
    $('#nav-fwd').disabled = !Router.canForward();

    const view = Views[route];
    const body = $('#game-body');
    body.scrollTop = 0;
    // 무직이면 구단 운영 화면(로스터 · 훈련 · 구단)은 볼 수 없다. 옛 구단은 이미 다른 감독이 맡고 있다
    if (App.state.unemployed && ['roster', 'training', 'club'].includes(menu.id)) {
      body.innerHTML = `<div class="cr-page"><div class="card fx-empty"><b>무직 — 맡은 구단이 없습니다</b><span>${menu.label} 화면은 새 팀에 부임하면 다시 열립니다.</span><a class="btn-primary" href="#career-other-teams">다른 팀 보기</a></div></div>`;
      return;
    }
    if (view) view(body);
    else body.innerHTML = `
      <div class="placeholder-view">
        <div class="ph-crumb">${menu.label} › ${tab.label}</div>
        <h2>${tab.label}</h2>
        <p>준비 중인 화면입니다.</p>
      </div>`;
  },
};

// 라우트별 화면 렌더러. 없으면 "준비 중" 자리표시.
const Views = {};

Screens.game = {
  init() {
    Router.init();
    Nav.init();
  },

  enter() {
    // 나이는 데이터를 읽을 때 커리어 시작일 기준이라, 게임에 들어올 때 오늘 날짜로 다시 계산한다 (불러오기 후 나이가 되돌아가던 문제)
    const today = Clock.today();
    Player.all().forEach(({ p }) => { if (p.birthdate) p.age = Data.ageOn(p.birthdate, today); });
    const team = App.db.teams.find(t => t.id === App.state.teamId);
    Portal.setTeam(team);
    Router.stack = [];
    Router.pos = -1;
    Router.go(Router.current() && Nav.parse(Router.current()) ? Router.current() : Nav.DEFAULT);
    // 일정이 읽힌 뒤 경기 중 표시(대회 이름)를 다시 쓴다
    // 일정이 읽힌 뒤: 경기 중 표시(대회 이름)와 계속 버튼(경기날이면 경기로)을 다시 쓴다
    Portal.ready.then(() => { this.continueLabelLater(); });
  },
  continueLabelLater() {
    Promise.resolve(typeof Results !== 'undefined' && Results.load ? Results.load() : null).finally(() => {
      Nav.continueLabel();
      if (MatchLock.on()) $('#subtabs').innerHTML = MatchLock.bar(Router.current());
    });
  },

  leave() {
    $('#screen-game').classList.remove('menu-open');
    history.replaceState(null, '', location.pathname + location.search);
  },
};

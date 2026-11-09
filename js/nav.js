// 메인 게임 화면의 상단 바: 대메뉴 7개 + 하위 탭
const NAV = [
  { id: 'portal', label: '포털', tabs: [['overview', '개요'], ['messages', '메시지'], ['calendar', '캘린더'], ['news', '뉴스'], ['fixtures', '경기 일정'], ['opponent-report', '상대 분석 리포트']] },
  { id: 'roster', label: '로스터', tabs: [['first-team', '1군'], ['challengers', '챌린저스'], ['compare', '선수 비교'], ['mastery', '챔피언 숙련도'], ['condition', '컨디션·폼'], ['contracts', '계약 현황']] },
  { id: 'recruit', label: '영입', tabs: [['search', '스카우트 검색'], ['shortlist', '관심 목록'], ['reports', '스카우트 리포트'], ['fa', 'FA 시장'], ['offers', '이적 제안'], ['assignments', '스카우트 배정']] },
  { id: 'match', label: '경기', tabs: [['next', '다음 경기'], ['draft', '밴픽 준비'], ['opponent', '상대 분석'], ['history', '경기 기록'], ['meta', '메타·패치 노트'], ['standings', '순위표']] },
  { id: 'training', label: '훈련', tabs: [['schedule', '팀 훈련 일정'], ['individual', '개인 훈련'], ['soloq', '솔랭 순위'], ['scrims', '스크림']] },
  { id: 'club', label: '구단', tabs: [['finance', '재정'], ['salary-cap', '샐러리캡'], ['staff', '코칭스태프'], ['sponsors', '스폰서'], ['board', '이사회 기대치'], ['history', '구단 역사']] },
  { id: 'career', label: '커리어', tabs: [['profile', '감독 프로필'], ['reputation', '평판'], ['record', '커리어 기록'], ['other-leagues', '다른 리그 보기'], ['settings', '설정·저장']] },
];

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
        <div class="tb-drop">${m.tabs.map(([id, label]) => `<a href="#${m.id}-${id}">${label}</a>`).join('')}</div>
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
    $$('.btn-continue').forEach(b => b.onclick = () => GameStubs.advanceDay());

    Router.onRoute(route => this.render(route));
  },

  render(route) {
    if (!App.current || App.current.id !== 'screen-game') return;
    const hit = this.parse(route);
    if (!hit) { Router.go(this.DEFAULT); return; }
    const { menu, tab } = hit;

    $$('.tb-item').forEach(el => el.classList.toggle('on', el.dataset.menu === menu.id));
    $('#subtabs').innerHTML = menu.tabs.map(([id, label]) =>
      `<a href="#${menu.id}-${id}" class="${id === tab.id ? 'on' : ''}">${label}</a>`).join('');
    const active = $('#subtabs a.on');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    $('#nav-back').disabled = !Router.canBack();
    $('#nav-fwd').disabled = !Router.canForward();

    const view = Views[route];
    const body = $('#game-body');
    body.scrollTop = 0;
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
    const team = App.db.teams.find(t => t.id === App.state.teamId);
    Portal.setTeam(team);
    Router.stack = [];
    Router.pos = -1;
    Router.go(Router.current() && Nav.parse(Router.current()) ? Router.current() : Nav.DEFAULT);
  },

  leave() {
    $('#screen-game').classList.remove('menu-open');
    history.replaceState(null, '', location.pathname + location.search);
  },
};

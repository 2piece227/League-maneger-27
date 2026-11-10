// 아직 구현하지 않은 기능의 자리(stub). 레이아웃 확정 후 하나씩 채운다.

const Data = {
  // data/*.json(수집 결과)을 읽고, 없으면 목업으로 대체한다.
  async loadDatabase() {
    const db = { leagues: MOCK.leagues, teams: MOCK.teams, history: { worlds: MOCK.worldsHistory }, source: 'mock' };
    try {
      const get = f => fetch('data/' + f).then(r => { if (!r.ok) throw new Error(f); return r.json(); });
      const [t, p, h, o] = await Promise.all([get('teams.json'), get('players.json'), get('history.json'), get('overrides.json').catch(() => ({}))]);
      db.teams = this.mergeTeams(t.teams, p.players, o.teams || {});
      db.history.worlds = MOCK.worldsHistory.map(w => ({ ...w, logo: (h.worldsLogos || {})[w.page || w.team] || null, photo: (h.worldsPhotos || {})[w.year] || null }));
      db.source = 'scraped';
    } catch (e) {
      console.info('[data] 수집 데이터 없음 → 목업 사용', e.message);
    }
    // 능력치가 없는 선수는 기본값(전원 동일)으로 채운다. TODO: 기록 기반 변환
    db.teams.forEach(t => t.players.forEach(p => {
      p.attributes = p.attributes || Attributes.create(p.role);
      p.ovr = Attributes.overall(p.attributes);
    }));
    return db;
  },

  mergeTeams(teams, players, overrides) {
    return teams.map(t => {
      const o = overrides[t.sourcePage] || {};
      const team = {
        ...t,
        rep: o.rep || 2,
        fin: o.fin || 2,
        color: o.color || '#5a6a8a',
        tags: o.tags || [],
      };
      team.boardGoal = MOCK.boardGoals[team.rep];
      team.budget = MOCK.budgetLabel(team.league, team.fin);
      const people = players.filter(p => p.team === t.id).map(p => ({
        ...p,
        age: p.birthdate ? this.ageOn(p.birthdate, '2026-11-10') : null,
        sub: false,
      }));
      team.staff = people.filter(p => p.role === 'COACH');
      team.players = people.filter(p => p.role !== 'COACH');
      MOCK.markSubs(team.players);
      return team;
    });
  },

  ageOn(birth, date) {
    const b = new Date(birth), d = new Date(date);
    return d.getFullYear() - b.getFullYear() - (d < new Date(d.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
  },
};

const SaveSystem = {
  // TODO: localStorage / 파일 내보내기 기반 저장 슬롯
  list() {
    return [null, null, null];
  },
  load(slot) {
    console.info('[stub] SaveSystem.load', slot);
  },
};

const Settings = {
  defaults: {
    skipIntro: false,
    simSpeed: 'normal',
    volume: 70,
  },
  // TODO: 설정 영구 저장
  save(settings) {
    console.info('[stub] Settings.save', settings);
  },
};

const Game = {
  // TODO: 커리어 생성 → 시즌 캘린더/메인 화면으로 진입
  start(manager, team) {
    console.info('[stub] Game.start', manager, team.id);
  },
  // TODO: 브라우저에서는 창을 닫을 수 없는 경우가 많다. 데스크톱 래핑 시 교체.
  quit() {
    window.close();
  },
};

// 메인 게임 화면(포털)의 버튼 자리
const GameStubs = {
  // TODO: 기능 연결 — 다음 일정까지 날짜 진행
  advanceDay() {
    console.info('[stub] GameStubs.advanceDay');
  },
  // TODO: 기능 연결 — 메시지 읽음 상태 저장
  markAllRead() {
    console.info('[stub] GameStubs.markAllRead');
  },
  // TODO: 기능 연결 — 할 일 메시지에서 해당 화면/처리로 이동
  handleMessageTask(id) {
    console.info('[stub] GameStubs.handleMessageTask', id);
  },
  // TODO: 기능 연결 — 선수 프로필 화면으로 이동
  openPlayerProfile(id) {
    console.info('[stub] GameStubs.openPlayerProfile', id);
  },
  // TODO: 기능 연결 — 재계약 협상 화면
  openContractTalks(id) {
    console.info('[stub] GameStubs.openContractTalks', id);
  },
};

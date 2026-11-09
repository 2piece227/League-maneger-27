// 아직 구현하지 않은 기능의 자리(stub). 레이아웃 확정 후 하나씩 채운다.

const Data = {
  // data/*.json(수집 결과)을 읽고, 없으면 목업으로 대체한다.
  async loadDatabase() {
    const db = { leagues: MOCK.leagues, teams: MOCK.teams, history: { worlds: MOCK.worldsHistory }, source: 'mock' };
    try {
      const get = f => fetch('data/' + f).then(r => { if (!r.ok) throw new Error(f); return r.json(); });
      const [t, p, h, o] = await Promise.all([get('teams.json'), get('players.json'), get('history.json'), get('overrides.json').catch(() => ({}))]);
      db.teams = this.mergeTeams(t.teams, p.players, o.teams || {});
      db.history.worlds = MOCK.worldsHistory.map(w => ({ ...w, logo: (h.worldsLogos || {})[w.page || w.team] || null }));
      db.source = 'scraped';
    } catch (e) {
      console.info('[data] 수집 데이터 없음 → 목업 사용', e.message);
    }
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
      team.players = players.filter(p => p.team === t.id).map(p => ({
        ...p,
        age: p.birthdate ? this.ageOn(p.birthdate, '2027-01-01') : null,
        // TODO: 기록 기반 능력치 변환 전까지 임시 OVR
        ovr: MOCK.placeholderOvr(p.id, team.rep),
        sub: false,
      }));
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

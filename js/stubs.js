// 아직 구현하지 않은 기능의 자리(stub). 레이아웃 확정 후 하나씩 채운다.

const Data = {
  // data/*.json(수집 결과)을 읽고, 없으면 목업으로 대체한다.
  async loadDatabase() {
    const db = { leagues: MOCK.leagues, teams: MOCK.teams, history: { worlds: MOCK.worldsHistory }, source: 'mock' };
    try {
      const get = f => fetch('data/' + f).then(r => { if (!r.ok) throw new Error(f); return r.json(); });
      const [t, p, h, o, c, cl] = await Promise.all([get('teams.json'), get('players.json'), get('history.json'), get('overrides.json').catch(() => ({})), get('custom.json').catch(() => ({})), get('cl.json').catch(() => ({ teams: [], players: [] }))]);
      db.teams = this.mergeTeams(t.teams, p.players, o.teams || {});
      db.free = this.freeTeam(c.freeAgents || []);
      Contract.stars = c.stars || {};
      this.attachCl(db.teams, cl);
      this.applyMilitary([...db.teams, db.free], c.military || {});
      db.history.worlds = MOCK.worldsHistory.map(w => ({ ...w, logo: (h.worldsLogos || {})[w.page || w.team] || null, photo: (h.worldsPhotos || {})[w.year] || null }));
      db.source = 'scraped';
    } catch (e) {
      console.info('[data] 수집 데이터 없음 → 목업 사용', e.message);
    }
    // 능력치가 없는 선수는 기본값(전원 동일)으로 채운다. TODO: 기록 기반 변환
    [...db.teams, ...(db.free ? [db.free] : [])].forEach(t => t.players.forEach(p => {
      p.attributes = p.attributes || Attributes.create(p.role);
      p.ovr = Attributes.overall(p.attributes);
    }));
    db.teams.forEach(t => { (t.cl || []).forEach(p => Squad.initCl(p)); Squad.fillSecond(t); });
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
        contractEnd: p.contractEnd || this.guessContract(p, t),
        age: p.birthdate ? this.ageOn(p.birthdate, Clock.today()) : null,
        sub: false,
      }));
      team.staff = people.filter(p => p.role === 'COACH');
      team.players = people.filter(p => p.role !== 'COACH');
      MOCK.markSubs(team.players);
      return team;
    });
  },

  // 2군(LCK CL) 실명 로스터: 1군 팀에 t.cl(선수) · t.clTeam(팀 정보) · t.clStaff 로 붙인다. 1군과 겹치는 선수는 1군에 둔다.
  attachCl(teams, cl) {
    const main = new Set(teams.flatMap(t => [...t.players, ...(t.staff || [])].map(p => p.id)));
    teams.forEach(t => { t.cl = []; t.clStaff = []; });
    (cl.teams || []).forEach(ct => {
      const t = teams.find(x => x.id === ct.parent); if (!t) return;
      t.clTeam = { ...ct, color: t.color };
      const seen = new Set();
      cl.players.filter(p => p.team === ct.id && !main.has(p.id) && !seen.has(p.id) && seen.add(p.id)).forEach(p => {
        const q = { ...p, team: t.id, contractEnd: p.contractEnd || this.guessContract(p, t), age: p.birthdate ? this.ageOn(p.birthdate, Clock.today()) : null, sub: false, level: 'cl' };
        (q.role === 'COACH' ? t.clStaff : t.cl).push(q);
      });
    });
  },

  // 소속팀 없는 선수(직접 추가). 팀 목록에는 넣지 않고 '무소속' 가상 팀으로 묶는다.
  freeTeam(list) {
    const people = list.map(p => ({ ...p, team: 'free', free: true, contractEnd: null, age: p.birthdate ? this.ageOn(p.birthdate, Clock.today()) : null, sub: false }));
    return { id: 'free', name: '무소속', short: '무소속', league: null, color: '#4a5568', rep: 1, fin: 2, tags: [], players: people.filter(p => p.role !== 'COACH'), staff: people.filter(p => p.role === 'COACH') };
  },

  // 한국 선수 병역: exempt(혜택) / served(군필) / none(미필)
  applyMilitary(teams, m) {
    const ex = new Set(m.exempt || []), sv = new Set(m.served || []);
    teams.forEach(t => [...t.players, ...(t.staff || [])].forEach(p => {
      if (p.nation !== 'South Korea' || p.role === 'COACH') return;
      p.military = ex.has(p.id) ? 'exempt' : sv.has(p.id) ? 'served' : 'none';
    }));
  },

  // 계약 정보가 공개되지 않은 선수: 선수별로 고정된 값으로 채운다 (올해 40% · 내년 40% · 2년 뒤 20%)
  guessContract(p, t) {
    const r = G.rand(p.id, 'contract');
    const y = 2026 + (r < .4 ? 0 : r < .8 ? 1 : 2);
    return `${y}-${t.league === 'LPL' ? '11-17' : '11-16'}`;
  },

  ageOn(birth, date) {
    const b = new Date(birth), d = new Date(date);
    return d.getFullYear() - b.getFullYear() - (d < new Date(d.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
  },
};

// SaveSystem · Settings 는 js/save.js

const Game = {
  // TODO: 커리어 생성 → 시즌 캘린더/메인 화면으로 진입
  start(manager, team) {
    // 커리어 시드: 대진 추첨 등 커리어마다 달라지는 값의 기준. 저장에 함께 남는다.
    App.state.seed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    console.info('[stub] Game.start', manager, team.id);
  },
  // TODO: 브라우저에서는 창을 닫을 수 없는 경우가 많다. 데스크톱 래핑 시 교체.
  quit() {
    window.close();
  },
};

// 메인 게임 화면(포털)의 버튼 자리
const GameStubs = {
  advanceDay() { Engine.continue(); },
  // TODO: 기능 연결 — 메시지 읽음 상태 저장
  markAllRead() {},
  // TODO: 기능 연결 — 할 일 메시지에서 해당 화면/처리로 이동
  // 할 일 메시지 → 관련 화면으로 (메시지 제목 키워드 기준)
  handleMessageTask(id) {
    const m = (Portal.data.messages || []).find(x => x.id === id);
    if (m) m.done = true;
    if (m && m.link) { Router.go(m.link); return; }
    const s = m ? m.subject + ' ' + m.body : '';
    const map = [[/예산|재정/, 'club-finance'], [/계약 만료|재계약|면담/, 'roster-contracts'], [/FA|영입|스카우트/, 'recruit-fa'],
      [/로스터 등록/, 'roster-first-team'], [/결산|리포트/, 'match-history'], [/콜업|유망주|2군/, 'roster-challengers'],
      [/스폰서/, 'club-sponsors'], [/패치/, 'match-meta'], [/루머|상대/, 'match-opponent']];
    const hit = map.find(([re]) => re.test(s));
    Router.go(hit ? hit[1] : 'portal-messages');
  },
  // TODO: 기능 연결 — 선수 프로필 화면으로 이동
  openPlayerProfile(id) { Player.open(id); },
  // TODO: 기능 연결 — 재계약 협상 화면
  openContractTalks(id) { Player.contractModal(id); },
};

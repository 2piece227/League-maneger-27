// 목업 데이터 — data/*.json(수집 결과)이 없을 때의 대체용.
// 목업 선수 이름은 시드 기반으로 생성된 임시 이름이다.

const MOCK = (() => {
  const leagues = [
    {
      id: 'LCK', name: 'LCK', region: '한국', currency: 'KRW',
      rules: ['샐러리캡: 상위 5인 합산 40억 원', '초과 시 4단계 사치세', '성적 감면 팀당 2명'],
      faOpen: '11월 중순',
    },
    {
      id: 'LPL', name: 'LPL', region: '중국', currency: 'CNY',
      rules: ['연봉 규정 확인 후 반영 예정'],
      faOpen: '11월 중순',
    },
    {
      id: 'LEC', name: 'LEC', region: '유럽', currency: 'EUR',
      rules: ['SFR(지속가능 재정 규정)', '2027년 상한 165만 유로'],
      faOpen: '11월 중순',
    },
    {
      id: 'LCS', name: 'LCS', region: '북미', currency: 'USD',
      rules: ['연봉 상한 없음'],
      faOpen: '11월 중순',
    },
  ];

  // [id, league, name, short, city, 명성(1~5), 자본(1~5), 색]
  const teamRows = [
    ['t1', 'LCK', 'T1', 'T1', '서울', 5, 5, '#e2012d'],
    ['gen', 'LCK', 'Gen.G', 'GEN', '서울', 5, 5, '#aa8a00'],
    ['hle', 'LCK', 'Hanwha Life Esports', 'HLE', '서울', 4, 5, '#f37321'],
    ['kt', 'LCK', 'KT Rolster', 'KT', '서울', 4, 4, '#ff0a07'],
    ['dk', 'LCK', 'Dplus KIA', 'DK', '서울', 4, 4, '#0ec7b5'],
    ['bfx', 'LCK', 'BNK FEARX', 'BFX', '부산', 3, 3, '#f4c400'],
    ['ns', 'LCK', 'Nongshim RedForce', 'NS', '서울', 2, 3, '#de2027'],
    ['drx', 'LCK', 'DRX', 'DRX', '서울', 3, 2, '#5a8dee'],
    ['bro', 'LCK', 'HANJIN BRION', 'BRO', '서울', 2, 2, '#1f6b4f'],
    ['dns', 'LCK', 'DN SOOPers', 'DNS', '서울', 2, 2, '#4b6cd8'],

    ['blg', 'LPL', 'Bilibili Gaming', 'BLG', '상하이', 5, 5, '#00a1d6'],
    ['jdg', 'LPL', 'JD Gaming', 'JDG', '베이징', 4, 5, '#c8102e'],
    ['tes', 'LPL', 'Top Esports', 'TES', '항저우', 4, 5, '#ff6a00'],
    ['al', 'LPL', "Anyone's Legend", 'AL', '항저우', 4, 4, '#e4c87a'],
    ['wbg', 'LPL', 'Weibo Gaming', 'WBG', '쑤저우', 4, 4, '#e6162d'],
    ['ig', 'LPL', 'Invictus Gaming', 'IG', '상하이', 3, 4, '#a8a9ad'],
    ['nip', 'LPL', 'Ninjas in Pyjamas', 'NIP', '선전', 3, 3, '#d6d6d6'],
    ['lng', 'LPL', 'LNG Esports', 'LNG', '쑤저우', 3, 4, '#2ec4b6'],
    ['edg', 'LPL', 'EDward Gaming', 'EDG', '상하이', 3, 4, '#2b2b2b'],
    ['we', 'LPL', 'Team WE', 'WE', '시안', 2, 3, '#d4202a'],
    ['omg', 'LPL', 'Oh My God', 'OMG', '청두', 2, 3, '#8a2be2'],
    ['up', 'LPL', 'Ultra Prime', 'UP', '톈진', 1, 2, '#3d6ab3'],
    ['lgd', 'LPL', 'LGD Gaming', 'LGD', '항저우', 2, 2, '#b8860b'],
    ['tt', 'LPL', 'ThunderTalk Gaming', 'TT', '광저우', 1, 2, '#f2b705'],

    ['g2', 'LEC', 'G2 Esports', 'G2', '베를린', 5, 5, '#e2212a'],
    ['fnc', 'LEC', 'Fnatic', 'FNC', '런던', 4, 4, '#ff5900'],
    ['kc', 'LEC', 'Karmine Corp', 'KC', '파리', 4, 4, '#3f8cff'],
    ['mkoi', 'LEC', 'Movistar KOI', 'MKOI', '마드리드', 4, 4, '#8a5cf6'],
    ['th', 'LEC', 'Team Heretics', 'TH', '마드리드', 3, 3, '#e8c76a'],
    ['gx', 'LEC', 'GIANTX', 'GX', '바르셀로나', 3, 3, '#ff4f7b'],
    ['sk', 'LEC', 'SK Gaming', 'SK', '베를린', 2, 3, '#9aa0a6'],
    ['vit', 'LEC', 'Team Vitality', 'VIT', '파리', 3, 4, '#f6d50f'],
    ['navi', 'LEC', 'Natus Vincere', 'NAVI', '베를린', 2, 3, '#ffe500'],
    ['shft', 'LEC', 'Shifters', 'SHFT', '베를린', 2, 2, '#4fd1c5'],

    ['c9', 'LCS', 'Cloud9', 'C9', 'LA', 4, 5, '#1d9bf0'],
    ['tl', 'LCS', 'Team Liquid', 'TL', 'LA', 4, 5, '#0a2240'],
    ['fly', 'LCS', 'FlyQuest', 'FLY', 'LA', 4, 4, '#1f8a4c'],
    ['sr', 'LCS', 'Shopify Rebellion', 'SR', 'LA', 3, 4, '#95bf47'],
    ['dig', 'LCS', 'Dignitas', 'DIG', 'LA', 2, 3, '#f4c300'],
    ['lyon', 'LCS', 'LYON', 'LYON', '멕시코시티', 3, 3, '#e74c3c'],
    ['dsg', 'LCS', 'Disguised', 'DSG', 'LA', 1, 2, '#9b59b6'],
    ['100t', 'LCS', '100 Thieves', '100T', 'LA', 3, 4, '#e8222a'],
  ];

  const boardGoals = {
    5: '리그 우승 · 월즈 우승 도전',
    4: '리그 결승 · 국제대회 진출',
    3: '플레이오프 진출',
    2: '플레이오프 경쟁',
    1: '리빌딩 · 신인 육성',
  };
  const styleTags = ['초반 주도', '한타 지향', '운영 중심', '바텀 캐리', '미드-정글 연계', '스플릿 운영', '시야 장악', '후반 집중', '탑 캐리', '오브젝트 우선'];

  // ---- 시드 RNG ----
  function hash(str) {
    let h = 2166136261;
    for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  const handleA = ['Ash', 'Blaze', 'Cor', 'Dusk', 'Ember', 'Fen', 'Gale', 'Haze', 'Iro', 'Jin', 'Kai', 'Lux', 'Mako', 'Nox', 'Orb', 'Pike', 'Quin', 'Rook', 'Sab', 'Tide', 'Umi', 'Vex', 'Wisp', 'Xen', 'Yul', 'Zen', 'Rae', 'Kiro', 'Sol', 'Theo'];
  const handleB = ['', '', 'er', 'on', 'ix', 'a', 'o', 'is', 'ran', 'ki', 'yn', 'en', 'el', 'us'];
  const nationPool = {
    LCK: ['KR'],
    LPL: ['CN', 'CN', 'CN', 'CN', 'KR'],
    LEC: ['FR', 'DE', 'ES', 'PL', 'DK', 'SE', 'KR', 'BE'],
    LCS: ['US', 'US', 'CA', 'KR', 'KR', 'DK', 'VN'],
  };
  const ROLES = ['TOP', 'JGL', 'MID', 'BOT', 'SUP'];

  function makeRoster(team) {
    const r = rng(hash(team.id));
    const used = new Set();
    const name = () => {
      let n;
      do { n = pick(r, handleA) + pick(r, handleB); } while (used.has(n));
      used.add(n);
      return n;
    };
    const player = (role, sub) => {
      return {
        id: `${team.id}_${role.toLowerCase()}${sub ? '_s' : ''}`,
        name: name(),
        role,
        age: 17 + Math.floor(r() * (sub ? 4 : 10)),
        nation: pick(r, nationPool[team.league]),
        sub,
      };
    };
    const starters = ROLES.map(role => player(role, false));
    const subs = [player(pick(r, ROLES), true), player(pick(r, ROLES), true)];
    const tags = [];
    while (tags.length < 2) { const t = pick(r, styleTags); if (!tags.includes(t)) tags.push(t); }
    return { players: [...starters, ...subs], tags };
  }

  function budgetLabel(league, fin) {
    switch (league) {
      case 'LCK': return `${fin * 15 + 20}억 원`;
      case 'LPL': return `${(fin * 800 + 1200).toLocaleString()}만 위안`;
      case 'LEC': return `€${(fin * 1.2 + 1).toFixed(1)}M`;
      case 'LCS': return `$${(fin * 1.5 + 1.5).toFixed(1)}M`;
    }
  }

  const teams = teamRows.map(([id, league, name, short, city, rep, fin, color]) => {
    const t = { id, league, name, short, city, rep, fin, color };
    const { players, tags } = makeRoster(t);
    t.players = players;
    t.tags = tags;
    t.boardGoal = boardGoals[rep];
    t.budget = budgetLabel(league, fin);
    return t;
  });

  // 역대 월즈 우승 (로고는 수집 데이터 history.json에서 붙는다)
  const worldsHistory = [
    [2011, 'Fnatic', 'EU', '#ff5900'],
    [2012, 'Taipei Assassins', 'TW', '#3b6fd8'],
    [2013, 'SK Telecom T1', 'KR', '#e2012d'],
    [2014, 'Samsung White', 'KR', '#1f4fbf'],
    [2015, 'SK Telecom T1', 'KR', '#e2012d'],
    [2016, 'SK Telecom T1', 'KR', '#e2012d'],
    [2017, 'Samsung Galaxy', 'KR', '#1f4fbf'],
    [2018, 'Invictus Gaming', 'CN', '#a8a9ad'],
    [2019, 'FunPlus Phoenix', 'CN', '#e33b2e'],
    [2020, 'DAMWON Gaming', 'KR', '#0ec7b5'],
    [2021, 'EDward Gaming', 'CN', '#555'],
    [2022, 'DRX', 'KR', '#5a8dee'],
    [2023, 'T1', 'KR', '#e2012d'],
    [2024, 'T1', 'KR', '#e2012d'],
    [2025, 'T1', 'KR', '#e2012d'],
  ].map(([year, team, region, color]) => ({ year, team, region, color }));

  // 포지션별 첫 선수만 주전, 나머지는 후보
  function markSubs(players) {
    const seen = new Set();
    players.forEach(p => { p.sub = !ROLES.includes(p.role) || seen.has(p.role); seen.add(p.role); });
    players.sort((a, b) => a.sub - b.sub || ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  }

  return { leagues, teams, worldsHistory, ROLES, boardGoals, budgetLabel, markSubs };
})();

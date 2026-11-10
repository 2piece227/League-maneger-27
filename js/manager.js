// 감독 모델: 생성 옵션 · 능력치 · 평판 · 구인 시장
const Manager = {
  // 국적 → 기본 사용 언어
  NATIONS: [
    ['South Korea', 'ko'], ['China', 'zh'], ['Taiwan', 'zh'], ['Vietnam', 'vi'], ['Japan', 'ja'],
    ['United States', 'en'], ['Canada', 'en'], ['United Kingdom', 'en'], ['Germany', 'de'], ['France', 'fr'],
    ['Spain', 'es'], ['Denmark', 'da'], ['Sweden', 'sv'], ['Poland', 'pl'], ['Turkey', 'tr'], ['Australia', 'en'],
  ],
  LANGS: { ko: '한국어', zh: '중국어', en: '영어', vi: '베트남어', ja: '일본어', de: '독일어', fr: '프랑스어', es: '스페인어', da: '덴마크어', sv: '스웨덴어', pl: '폴란드어', tr: '튀르키예어' },
  HOME_LEAGUE: { 'South Korea': 'LCK', China: 'LPL', Taiwan: 'LPL', 'United States': 'LCS', Canada: 'LCS' },

  // 경력 배경: 시작 능력치 포인트·평판이 달라진다
  BACKGROUNDS: {
    'ex-pro': { label: '전직 프로게이머', desc: '선수 시절의 감각과 인맥. 선수단 장악력이 높다.', points: 92, rep: 20 },
    coach: { label: '코치 출신', desc: '프로팀 코치로 다년간 일했다. 균형 잡힌 지도자.', points: 98, rep: 26 },
    analyst: { label: '분석관 출신', desc: '데이터와 밴픽에 강하지만 선수단과의 거리는 멀다.', points: 94, rep: 18 },
    caster: { label: '해설·방송인 출신', desc: '미디어와 팬에게 친숙하다. 현장 지도 경험은 적다.', points: 86, rep: 24 },
    amateur: { label: '아마추어·일반인', desc: '무명에서 시작한다. 모든 것을 증명해야 한다.', points: 80, rep: 4 },
  },
  PRO_PEAK: {
    worlds: ['월즈 우승', 24], intl: ['국제대회 우승', 18], league: ['리그 우승', 12],
    worldsApp: ['월즈 출전', 8], first: ['1군 주전', 4], academy: ['2군·아카데미', 0],
  },
  STYLES: {
    philosophy: ['운영 철학', [['early', '초반 주도'], ['late', '후반 지향'], ['teamfight', '한타 중심'], ['split', '스플릿 운영'], ['flex', '유연한 밸런스']]],
    training: ['훈련 성향', [['scrim', '스크림 중시'], ['soloq', '솔랭 중시'], ['review', '분석·리뷰 중시'], ['rest', '컨디션 관리 중시']]],
    manage: ['선수 관리', [['strict', '엄격한 규율'], ['flexible', '자율과 신뢰'], ['friendly', '친근한 형님형'], ['business', '철저한 프로']]],
    media: ['미디어 태도', [['open', '솔직·적극적'], ['calm', '차분·신중'], ['guarded', '말을 아낌']]],
  },

  // FM 감독 능력치 (1~20)
  ATTRS: [
    ['tactics', '전술 지식', '운영·한타 설계와 경기 중 판단'],
    ['draft', '밴픽 이해', '밴픽 설계와 상대 밴픽 읽기'],
    ['meta', '메타 해석', '패치 변화를 빠르게 읽고 적용'],
    ['develop', '선수 육성', '유망주와 어린 선수의 성장 속도'],
    ['judge', '재능 판단', '선수의 현재 실력과 잠재력 평가'],
    ['motivate', '동기부여', '연패·큰 경기에서 선수단 사기'],
    ['manage', '선수 관리', '갈등 조정과 컨디션 관리'],
    ['discipline', '규율', '훈련 태도와 팀 기강'],
    ['media', '미디어 대응', '인터뷰·여론 관리'],
    ['negotiate', '협상', '계약·이적 협상'],
  ],
  // 배경별 기본 능력치 (포인트 분배 전 출발점)
  BASE: {
    'ex-pro': { tactics: 11, draft: 9, meta: 11, develop: 9, judge: 10, motivate: 11, manage: 10, discipline: 8, media: 7, negotiate: 6 },
    coach: { tactics: 11, draft: 11, meta: 10, develop: 11, judge: 10, motivate: 10, manage: 10, discipline: 10, media: 7, negotiate: 8 },
    analyst: { tactics: 12, draft: 13, meta: 13, develop: 8, judge: 11, motivate: 6, manage: 7, discipline: 8, media: 7, negotiate: 9 },
    caster: { tactics: 9, draft: 9, meta: 10, develop: 7, judge: 9, motivate: 9, manage: 8, discipline: 7, media: 13, negotiate: 5 },
    amateur: { tactics: 9, draft: 8, meta: 9, develop: 8, judge: 8, motivate: 8, manage: 8, discipline: 8, media: 7, negotiate: 7 },
  },
  ATTR_MIN: 3,
  ATTR_MAX: 16, // 생성 단계 상한. 이후 경력으로 20까지 성장 (TODO: 기능 연결)

  // 평판 0~100 → 단계
  REP_LEVELS: [[0, '무명'], [10, '지역 무명'], [22, '지역 인지도'], [35, '국내 인지도'], [50, '리그 정상급'], [65, '대륙급'], [80, '세계적'], [92, '전설']],
  repLabel(v) { return [...this.REP_LEVELS].reverse().find(([min]) => v >= min)[1]; },
  repStars(v) { return Math.max(1, Math.min(5, Math.round(v / 20 + .3))); },

  // 생성 정보로 시작 평판 계산
  startRep(m) {
    const bg = this.BACKGROUNDS[m.background.type];
    let v = bg.rep;
    if (m.background.type === 'ex-pro') v += this.PRO_PEAK[m.background.peak || 'first'][1] + Math.min(8, (m.background.years || 0));
    v += Math.min(10, (m.coachYears || 0) * 2);
    return Math.max(1, Math.min(60, Math.round(v))); // 시작 평판은 '리그 정상급'까지
  },
  // 리그별 평판: 출신 리그가 가장 높고 다른 리그는 낮다
  regionRep(m) {
    const home = this.HOME_LEAGUE[m.nation] || (['Germany', 'France', 'Spain', 'Denmark', 'Sweden', 'Poland', 'Turkey', 'United Kingdom'].includes(m.nation) ? 'LEC' : null);
    const base = m.reputation;
    return Object.fromEntries(['LCK', 'LPL', 'LEC', 'LCS'].map(l => [l, Math.round(l === home ? base : l === App.state.leagueId ? base * .85 : base * .55)]));
  },
  age(m, today) { return m.birthdate ? Store.ageOn(m.birthdate, today) : m.age; },
  langs(m) { return (m.languages || []).map(l => this.LANGS[l] || l); },
  styleLabel(key, val) { const s = this.STYLES[key]; return (s[1].find(x => x[0] === val) || [, '-'])[1]; },

  // ---------- 구인 시장 (다른 팀 보기) ----------
  // 감독 = 코칭스태프 첫 번째 (수집 데이터에 직책 구분이 없어 근사)
  headCoach(t) { return (t.staff || [])[0] || null; },
  // 상태: mine | vacant(공석) | seeking(감독 구함) | unstable(경질설) | stable(재임)
  jobStatus(t, today) {
    if (t.id === App.state.teamId) return 'mine';
    const hc = this.headCoach(t);
    if (!hc) return 'vacant';
    if (hc.contractEnd && hc.contractEnd <= Store.addDays(today, 45)) return 'seeking';
    const r = G.rand(t.id, 'job:' + today.slice(0, 7));
    return r < .12 ? 'seeking' : r < .27 ? 'unstable' : 'stable';
  },
  JOB: {
    mine: ['현재 소속', 'mine'], vacant: ['감독 공석', 'vacant'], seeking: ['감독 구함', 'seeking'],
    unstable: ['경질설', 'unstable'], stable: ['재임 중', 'stable'],
  },
  canApply(status) { return status === 'vacant' || status === 'seeking'; },
  // 구단 평판(1~5) 대비 내 평판으로 가능성
  chance(m, t) {
    const need = [0, 8, 20, 35, 52, 68][t.rep || 2];
    const mine = this.regionRep(m)[t.league];
    const d = mine - need;
    return d >= 12 ? ['높음', 'hi'] : d >= 0 ? ['보통', 'mid'] : d >= -12 ? ['낮음', 'lo'] : ['희박', 'no'];
  },
};

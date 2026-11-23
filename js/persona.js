/* LM 27 — 선수 계약 성향
   FM처럼 숫자는 숨기고 행동으로 드러난다: 재계약 여부 · 요구 연봉 · FA 때 어느 팀을 고르나 · 협상 중 에이전트의 말.
   성향 = 원하는 것의 무게 w { money 연봉 · play 출전 · win 우승 · home 익숙한 리그 · loyal 지금 팀 } + 선호 구단 · 선호 코치 + 꼬리표.
   기본값은 숨겨진 능력치(충성도 · 야망)와 팀에서 보낸 기간으로 자동 계산하고, 실제로 성향이 드러난 선수만 FIX에 적는다.
   2026-27 스토브리그 기준:
     쇼메이커 — 팀이 무너지는 순간에도 연봉을 깎고 DK 재계약 (원클럽맨)
     스매쉬 — 연차는 짧지만 DK 잔류 (의리)
     시우 · 루시드 — 커리어를 위해 DK를 떠남 (커리어 우선)
     제우스 — 한화의 돈을 거절하고 T1 복귀 (친정팀 선호, 연봉보다 우승)
     도란 — KRX의 돈을 거절하고 씨맥을 따라 DK (선호 코치) */
const Persona = {
  FIX: {
    showmaker: { tag: 'oneclub', club: 'dplus-kia', w: { money: .1, play: .3, win: .25, home: .5, loyal: 1 }, cut: .82 },
    faker: { tag: 'oneclub', club: 't1', w: { money: .05, play: .3, win: .5, home: .6, loyal: 1 }, cut: .9 },
    'smash-shin-geum-jae': { tag: 'loyal', club: 'dplus-kia', w: { money: .25, play: .45, win: .2, home: .4, loyal: .75 } },
    siwoo: { tag: 'career', w: { money: .3, play: .5, win: .6, home: .3, loyal: 0 } },
    'lucid-choi-yong-hyeok': { tag: 'career', w: { money: .3, play: .5, win: .6, home: .3, loyal: 0 } },
    zeus: { tag: 'homecoming', fav: ['t1'], w: { money: .15, play: .3, win: .65, home: .5, loyal: .1 } },
    'doran-choi-hyeon-jun': { tag: 'coach', favCoach: ['cvmax'], w: { money: .15, play: .45, win: .35, home: .5, loyal: .1 } },
  },
  LABEL: { oneclub: '원클럽맨', loyal: '의리파', career: '커리어 우선', homecoming: '친정팀 선호', coach: '감독을 따라가는 선수', money: '연봉 우선', win: '우승 우선', play: '출전 우선', abroad: '해외 진출 의향', stay: '익숙한 리그 선호' },
  hid(p, k) { return ((p.attributes || {}).hidden || {})[k] ?? 11; },
  years(p) { const j = typeof Fame !== 'undefined' && Fame.joined(p); return j ? Math.max(0, Fmt.daysBetween(j, Clock.today()) / 365) : 0; },

  of(p) {
    if (!p) return null;
    const F = this.FIX[p.id], r = k => G.rand(p.id, 'ps' + k), loy = this.hid(p, 'loyalty'), amb = this.hid(p, 'ambition'), yrs = this.years(p);
    const team = (Player.find(p.id) || {}).t;
    // 연봉은 중하위 선수일수록, 우승은 최상위 선수일수록, 출전은 중상위(주전 경쟁) 선수가 더 원한다
    const ov = p.ovr || 60;
    let w = {
      money: .15 + r(1) * .3 + (amb <= 9 ? .08 : 0) + (ov < 75 ? .1 : 0) - (ov >= 90 ? .08 : 0),
      play: .15 + r(2) * .25 + (ov >= 70 && ov < 85 ? .1 : 0),
      win: .08 + r(3) * .25 + (amb - 10) * .03 + (ov >= 85 ? .18 : 0) + (ov >= 92 ? .15 : 0),
      home: (p.nation === 'South Korea' ? .3 : .15) + r(4) * .25,
      loyal: Math.max(0, Math.min(1, (loy - 9) * .07 + Math.min(4, yrs) * .06 + r(5) * .15)),
    };
    if (F) w = { ...w, ...F.w };
    // 꼬리표: 지정값 → 가장 두드러진 성향
    let tag = F && F.tag;
    if (!tag) {
      if (w.loyal >= .8 && yrs >= 4) tag = 'oneclub';
      else if (w.loyal >= .6) tag = 'loyal';
      else if (w.home <= .25 && p.nation === 'South Korea') tag = 'abroad';
      else { const top = ['money', 'win', 'play'].sort((a, b) => w[b] - w[a])[0]; tag = w[top] >= .38 ? top : (w.home >= .48 ? 'stay' : null); }
    }
    return { w, tag, label: tag ? this.LABEL[tag] : '', fav: (F && F.fav) || [], favCoach: (F && F.favCoach) || [], club: (F && F.club) || (tag === 'oneclub' && team ? team.id : null), cut: (F && F.cut) || (tag === 'oneclub' ? .9 : 1) };
  },
  // 이 팀이 선호 구단이거나 선호 코치가 있는 팀인가
  likes(p, t) {
    const P = this.of(p); if (!P || !t) return 0;
    if (P.fav.includes(t.id) || P.club === t.id) return 1;
    if (P.favCoach.length && (t.staff || []).some(s => P.favCoach.includes(s.id))) return 1;
    return 0;
  },
  // FA · 이적 때 팀 매력: 연봉 · 우승 가능성 · 리그 · 선호 구단/코치 · 지금 팀과의 의리
  appeal(p, t, pay, fromId) {
    const P = this.of(p), w = P.w;
    const best = Math.max(1, ...App.db.teams.filter(x => x.league === t.league).map(x => (typeof Season !== 'undefined' ? Season.power(x) : 0)));
    const power = Math.pow(typeof Season !== 'undefined' ? Season.power(t) / best : (t.rep || 2) / 5, 6);   // 1위 팀과의 전력 차를 크게 벌려 본다
    const homeLg = p.nation === 'South Korea' ? 'LCK' : p.nation === 'China' ? 'LPL' : null;
    return w.money * pay + w.win * power * 1.4 + w.home * (homeLg ? (t.league === homeLg ? .6 : -.4) : 0) + (t.rep || 2) * .05
      + (fromId && fromId === t.id ? w.loyal * .8 : 0) + this.likes(p, t) * 1.2;
  },
  // 계약이 끝날 때 지금 팀에 남을 마음이 있나 (AI 구단 재계약 · 우리 팀 표준 조건 제안 · 선수 옵션 모두 이 기준)
  stays(p, t, key = '') {
    const P = this.of(p); if (!P || !t) return false;
    if (P.tag === 'oneclub' && P.club === t.id) return true;
    if (P.tag === 'career' || (P.tag === 'homecoming' && !P.fav.includes(t.id)) || (P.tag === 'coach' && !this.likes(p, t))) return false;
    const cl = p.level === 'cl', r = G.rand(p.id + key, 'stay');
    return r < (cl ? .85 : .55 + P.w.loyal * .45 + ((t.rep || 2) - 3) * .05 - (P.w.win > .5 && (t.rep || 2) <= 3 ? .2 : 0));
  },
  // 스카우트 보고 한 줄 (숫자 없이)
  line(p) {
    const P = this.of(p); if (!P) return '';
    const t = (Player.find(p.id) || {}).t;
    return ({
      oneclub: `${t ? t.short : '지금 팀'}에서 커리어를 끝내고 싶어 합니다. 재계약이라면 연봉을 양보할 수도 있습니다.`,
      loyal: '지금 팀에 대한 애정이 큽니다. 다른 팀 제안에 잘 흔들리지 않습니다.',
      career: '커리어를 가장 중요하게 봅니다. 더 큰 무대가 보이면 떠날 수 있습니다.',
      homecoming: `${P.fav.map(id => (App.db.teams.find(x => x.id === id) || {}).short).filter(Boolean).join(' · ') || '친정팀'} 복귀에 마음이 있습니다. 돈보다 그쪽을 먼저 봅니다.`,
      coach: '함께하고 싶은 코치가 있는 팀이라면 연봉을 양보합니다.',
      money: '대우를 가장 중요하게 봅니다. 연봉 경쟁에서 밀리면 붙잡기 어렵습니다.',
      win: '우승할 수 있는 팀을 원합니다. 약팀 제안은 잘 받지 않습니다.',
      play: '주전으로 뛰는 것을 가장 중요하게 봅니다. 후보 자리는 받아들이지 않습니다.',
      abroad: '해외 리그 도전에 관심이 있습니다.',
      stay: '익숙한 리그를 떠나고 싶어 하지 않습니다.',
    })[P.tag] || '특별히 두드러진 성향은 보이지 않습니다.';
  },
};

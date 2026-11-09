// 선수 능력치 정의 (1~20 척도). 지금은 모든 선수가 동일한 기본값을 가진다.
const Attributes = {
  DEFAULT: 10,

  groups: {
    physical: { label: '피지컬', keys: { mechanics: '기계적 숙련', reflex: '반응속도', laning: '라인전' } },
    macro: { label: '운영', keys: { mapAwareness: '맵 리딩', teamfight: '한타', decision: '판단력' } },
    mental: { label: '멘탈', keys: { composure: '침착함', communication: '소통', focus: '집중력' } },
  },

  role: {
    TOP: { splitPush: '스플릿 운영', durability: '버티기' },
    JGL: { pathing: '동선', objectiveControl: '오브젝트 관리' },
    MID: { roaming: '로밍', waveControl: '라인 관리' },
    BOT: { positioning: '포지셔닝', farming: 'CS 수급' },
    SUP: { vision: '시야 장악', engage: '이니시에이팅' },
  },

  hidden: {
    consistency: '꾸준함', bigMatch: '큰 경기', metaAdapt: '메타 적응력',
    professionalism: '프로의식', ambition: '야망', loyalty: '충성도', potential: '잠재력',
  },

  create(role) {
    const v = this.DEFAULT;
    const pick = obj => Object.fromEntries(Object.keys(obj).map(k => [k, v]));
    return {
      physical: pick(this.groups.physical.keys),
      macro: pick(this.groups.macro.keys),
      mental: pick(this.groups.mental.keys),
      role: pick(this.role[role] || {}),
      hidden: pick(this.hidden),
    };
  },

  // TODO: 포지션별 가중치. 지금은 보이는 능력치 단순 평균.
  overall(a) {
    const vals = [a.physical, a.macro, a.mental, a.role].flatMap(o => Object.values(o));
    return Math.round(vals.reduce((s, x) => s + x, 0) / vals.length);
  },
};

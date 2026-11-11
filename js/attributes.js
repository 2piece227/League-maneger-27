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

  // 생성 선수: 현재 기량(ca, 1~20) 주변으로 능력치를 흩뿌린다. pa = 잠재력. r: 시드 고정 난수
  generate(role, ca, pa, r) {
    const near = () => Math.max(1, Math.min(20, Math.round((ca + (r() - .5) * 6) * 10) / 10));
    const pick = obj => Object.fromEntries(Object.keys(obj).map(k => [k, near()]));
    const hidden = Object.fromEntries(Object.keys(this.hidden).map(k => [k, Math.round(4 + r() * 14)]));
    hidden.potential = Math.round(pa);
    return { physical: pick(this.groups.physical.keys), macro: pick(this.groups.macro.keys), mental: pick(this.groups.mental.keys), role: pick(this.role[role] || {}), hidden };
  },

  // 현재 기량·잠재력을 별 5개로 (1~20 → ★1~5)
  stars(v) { return Math.max(1, Math.min(5, Math.round(v / 4))); },
  starText(v) { const n = this.stars(v); return '★'.repeat(n) + '☆'.repeat(5 - n); },

  // 능력치 표 (보이는 능력치만)
  table(a, role) {
    const cell = v => { const n = Math.round(v); return `<b class="at-v ${n >= 15 ? 'hi' : n >= 10 ? 'mid' : 'lo'}">${n}</b>`; };
    const grp = (label, keys, vals) => `<div class="at-grp"><h5>${label}</h5>${Object.entries(keys).map(([k, l]) => `<div class="at-row"><span>${l}</span>${cell(vals[k] ?? this.DEFAULT)}</div>`).join('')}</div>`;
    return `<div class="at-grid">${Object.values(this.groups).map((g, i) => grp(g.label, g.keys, a[Object.keys(this.groups)[i]])).join('')}${grp(G.ROLE_KO[role] || '포지션', this.role[role] || {}, a.role)}</div>`;
  },

  // TODO: 포지션별 가중치. 지금은 보이는 능력치 단순 평균.
  overall(a) {
    const vals = [a.physical, a.macro, a.mental, a.role].flatMap(o => Object.values(o));
    return Math.round(vals.reduce((s, x) => s + x, 0) / vals.length);
  },
};

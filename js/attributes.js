// 선수 능력치 (1~20). 오버롤(OVR, 1~99)은 세부 능력치에서 계산한다.
// 기준표: LM 27 선수 오버롤 산정표 (기술 40% · 운영 30% · 멘탈 10% · 특화 20%)
const Attributes = {
  DEFAULT: 10,

  // 저장 키(physical/macro/mental/role)는 예전 세이브와 호환되게 유지한다
  groups: {
    physical: { label: '기술', w: .4, keys: { mechanics: '피지컬', laning: '라인전', farming: '성장', reflex: '반응속도' } },
    macro: { label: '운영', w: .3, keys: { mapAwareness: '맵 리딩', rotation: '합류·로테이션', objective: '오브젝트 판단', vision: '시야', teamfight: '한타' } },
    mental: { label: '멘탈', w: .1, keys: { composure: '침착함', focus: '집중력' } },
  },
  ROLE_W: .2,
  role: {
    TOP: { splitPush: '스플릿', durability: '버티기' },
    JGL: { pathing: '동선', smite: '강타' },
    MID: { roaming: '로밍', crack: '크랙 플레이' },
    BOT: { lateCarry: '후반 캐리', survival: '생존' },
    SUP: { engage: '이니쉬', protect: '보호' },
  },
  // 포지션별로 계산에서 빼는 능력치: 정글은 라인전, 서폿은 성장
  SKIP: { JGL: ['laning'], SUP: ['farming'] },
  // 포지션 1위의 원점수 → OVR 99 (기인·캐니언·쵸비·페이즈·케리아)
  REF: { TOP: 19.34, JGL: 19.65, MID: 19.67, BOT: 19.39, SUP: 19.80 },

  hidden: { consistency: '꾸준함', ambition: '야망', loyalty: '충성도', potential: '잠재력' },
  INJURY: .002, // 부상 위험: 모든 선수 공통 (경기당 확률). TODO: 경기 엔진에서 사용

  // 나이에 따라 깎이는 능력치 / 오르는 능력치
  AGE_DOWN: ['mechanics', 'laning', 'reflex'],
  AGE_UP: ['mapAwareness', 'rotation', 'objective', 'vision', 'teamfight'],

  create(role) {
    const v = this.DEFAULT, pick = obj => Object.fromEntries(Object.keys(obj).map(k => [k, v]));
    return { physical: pick(this.groups.physical.keys), macro: pick(this.groups.macro.keys), mental: pick(this.groups.mental.keys), role: pick(this.role[role] || {}), hidden: pick(this.hidden) };
  },

  // 산정표 형식 {t:[피지컬,라인전,성장,반응], o:[맵리딩,합류,오브젝트,시야,한타], m:[침착,집중], s:[특화1,특화2]} → 능력치
  fromSheet(x, role) {
    const zip = (keys, vals) => Object.fromEntries(Object.keys(keys).map((k, i) => [k, vals[i] ?? this.DEFAULT]));
    const a = this.create(role);
    a.physical = zip(this.groups.physical.keys, x.t); a.macro = zip(this.groups.macro.keys, x.o);
    a.mental = zip(this.groups.mental.keys, x.m); a.role = zip(this.role[role] || {}, x.s);
    Object.assign(a.hidden, x.h || {});
    return a;
  },

  // 생성 선수: 현재 기량(ca, 1~20) 주변으로 능력치를 흩뿌린다. pa = 잠재력. r: 시드 고정 난수
  generate(role, ca, pa, r) {
    const near = () => Math.max(1, Math.min(20, Math.round((ca + (r() - .5) * 6) * 10) / 10));
    const pick = obj => Object.fromEntries(Object.keys(obj).map(k => [k, near()]));
    const hidden = Object.fromEntries(Object.keys(this.hidden).map(k => [k, Math.round(4 + r() * 14)]));
    hidden.potential = Math.round(pa);
    const a = { physical: pick(this.groups.physical.keys), macro: pick(this.groups.macro.keys), mental: pick(this.groups.mental.keys), role: pick(this.role[role] || {}), hidden };
    if (role === 'SUP') a.physical.farming = Math.max(1, Math.round(ca * .4)); // 서폿은 성장이 낮다
    if (role === 'JGL') a.physical.laning = Math.max(1, Math.round(ca * .5));
    return a;
  },

  // 예전 스키마 세이브 → 빠진 능력치는 같은 분류의 평균으로 채우고 없어진 키는 버린다
  fix(a, role) {
    if (!a) return this.create(role);
    const fill = (keys, vals = {}) => {
      const known = Object.values(vals).filter(v => typeof v === 'number'), avg = known.length ? known.reduce((s, v) => s + v, 0) / known.length : this.DEFAULT;
      return Object.fromEntries(Object.keys(keys).map(k => [k, vals[k] ?? Math.round(avg * 10) / 10]));
    };
    const rv = Object.values(a.role || {}), ravg = rv.length ? rv.reduce((s, v) => s + v, 0) / rv.length : this.DEFAULT;
    const role2 = Object.fromEntries(Object.keys(this.role[role] || {}).map(k => [k, (a.role || {})[k] ?? Math.round(ravg * 10) / 10]));
    const hid = Object.fromEntries(Object.keys(this.hidden).map(k => [k, (a.hidden || {})[k] ?? this.DEFAULT]));
    return { physical: fill(this.groups.physical.keys, a.physical), macro: fill(this.groups.macro.keys, a.macro), mental: fill(this.groups.mental.keys, a.mental), role: role2, hidden: hid };
  },

  // 원점수 = 0.4·기술평균 + 0.3·운영평균 + 0.1·멘탈평균 + 0.2·특화평균
  raw(a, role) {
    const skip = this.SKIP[role] || [];
    const avg = (vals, keys) => { const v = keys.filter(k => !skip.includes(k)).map(k => vals?.[k] ?? this.DEFAULT); return v.reduce((s, x) => s + x, 0) / (v.length || 1); };
    const g = this.groups;
    return g.physical.w * avg(a.physical, Object.keys(g.physical.keys)) + g.macro.w * avg(a.macro, Object.keys(g.macro.keys))
      + g.mental.w * avg(a.mental, Object.keys(g.mental.keys)) + this.ROLE_W * avg(a.role, Object.keys(this.role[role] || a.role || {}));
  },
  // OVR = 원점수 / 포지션 1위 원점수 × 99
  overall(a, role) {
    const ref = this.REF[role] || 19.5;
    return Math.max(1, Math.min(99, Math.round(this.raw(a, role) / ref * 99)));
  },
  // OVR 목표값 → 그 근처 현재 기량(1~20). 기록이 없는 실명 선수 능력치를 만들 때 쓴다
  caFor(ovr, role) { return (this.REF[role] || 19.5) * ovr / 99; },

  // ---------- 나이 (시즌이 바뀔 때 1년에 한 번). TODO: 시즌 전환에서 호출 ----------
  // 깎이는 폭이 나이와 함께 빨라져, 운영이 오르는 것보다 OVR이 더 떨어진다 → 결국 은퇴
  ageYear(a, age) {
    const down = age >= 24 ? .2 + .08 * Math.pow(age - 24, 1.6) : 0;
    const up = age >= 22 ? (age <= 30 ? .2 : .1) : 0;
    this.AGE_DOWN.forEach(k => { if (a.physical[k] != null) a.physical[k] = Math.max(1, a.physical[k] - down); });
    this.AGE_UP.forEach(k => { if (a.macro[k] != null) a.macro[k] = Math.min(20, a.macro[k] + up); });
    return a;
  },

  // ---------- 컨디션 (경기 날 OVR). TODO: 경기 엔진에서 호출 ----------
  // cond 0~100(50 = 보통): 폭은 모두 같고, 특성으로 swing 배율을 바꾼다. 꾸준함이 낮을수록 기복이 크다
  matchOvr(ovr, cond, a, r = Math.random, swing = 1) {
    const base = (cond - 50) / 50 * 3 * swing;
    const cons = a?.hidden?.consistency ?? this.DEFAULT, noise = (r() - .5) * 2 * (21 - cons) / 20 * 4;
    return Math.max(1, Math.min(99, Math.round(ovr + base + noise)));
  },

  // 현재 기량·잠재력을 별 5개로 (1~20 → ★1~5)
  stars(v) { return Math.max(1, Math.min(5, Math.round(v / 4))); },
  starText(v) { const n = this.stars(v); return '★'.repeat(n) + '☆'.repeat(5 - n); },

  // 능력치 표 (보이는 능력치만). 계산에서 빠지는 능력치는 흐리게
  table(a, role) {
    const skip = this.SKIP[role] || [];
    const cell = (v, k) => { const n = Math.round(v); return `<b class="at-v ${skip.includes(k) ? 'off' : n >= 15 ? 'hi' : n >= 10 ? 'mid' : 'lo'}">${n}</b>`; };
    const grp = (label, keys, vals = {}) => `<div class="at-grp"><h5>${label}</h5>${Object.entries(keys).map(([k, l]) => `<div class="at-row${skip.includes(k) ? ' off' : ''}"><span>${l}</span>${cell(vals[k] ?? this.DEFAULT, k)}</div>`).join('')}</div>`;
    return `<div class="at-grid">${Object.entries(this.groups).map(([g, d]) => grp(d.label, d.keys, a[g])).join('')}${grp(G.ROLE_KO[role] || '포지션', this.role[role] || {}, a.role)}</div>`;
  },
};

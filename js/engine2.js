// 경기 엔진 v2 (0.2.0부터 기본). 구버전(Sim)은 지우지 않고 바탕으로 쓰며, 경기(g.v2)마다 판단 · 전투 · 운영을 갈아 끼운다. 구버전으로 돌려 보려면 콘솔에서 Sim.V2 = false
//  그대로 쓰는 것: 맵 · 길찾기 · 웨이브 · 포탑 · 정글 동선 · 오브젝트 진행 · 상점 · 귀환 · 시야 · 해설
//  새로 짠 것:
//   전투  실제 초(0.25초씩 쪼개서) · 실제 스탯 · 평타/스킬/궁/소환사 주문을 하나의 행동 판단으로 (기대 피해 × 명중 − 위험). 재사용 대기는 스킬마다 하나(p.cd2)
//         데이터가 없는 본인 강화(패시브형) 스킬은 쓰지도 · 띄우지도 않는다. 묶기(기절 · 에어본 · 끌기 · 밀기)는 실제로 행동을 막는다
//   궁    전역 궁(이즈리얼 · 징크스 · 애쉬 · 세나 · 드레이븐 · 카서스 등)도 같은 길로: 실제 사거리 · 폭 · 날아가는 시간 · 피해로 맞는지 · 죽는지 정한다 (즉사 판정 없음)
//   예측  누가 이기나를 DPS × 유효 체력(란체스터)으로 계산. tpow를 이 값으로 바꿔 교전 · 다이브 · 오브젝트 · 수비 판단이 모두 같은 기준을 쓴다
//   판단  안개: 보이는(또는 방금 본) 상대만 보고 싸울지 정한다 · 대치가 길어지면 끊는다 · 팀 정비(5초마다)
//   라인전 사거리 차이 · 견제로 체력과 CS가 갈린다
//   능력치 선수 세부 능력치가 행동에 닿는다 (피지컬: 명중 · 반응속도: 회피 · 한타: 대상 선택 · 라인전: 견제 · 성장: 막타 · 침착함: 후퇴 판단 · 생존 · 이니쉬 · 보호 …)
const Sim2 = {
  DT: .25,            // 교전 쪼개기 (초)
  K: 1.1,             // 전체 피해 배율 (보정용)
  FORM: .6,           // 싸움마다 그날 손이 얼마나 잘 풀리나 (침착함이 높을수록 덜 흔들린다)
  EXE_S: 90,          // 선수 · 팀 수행력 차이 → 피해 배율 (exp(차이 / EXE_S))
  G: 1.6,             // 예측 승률의 날카로움 (힘 비율^G)
  CC: { stun: 1.25, up: 1, pull: .75, back: .6 },
  HIT0: { line: .66, cone: .86, circle: .6, global: .5, target: 1, '': 1 },
  on() { return typeof Sim.V2 === 'boolean' ? Sim.V2 : true; },

  // ---------- 준비 ----------
  init(g) {
    g.v2 = true; g.mem2 = { B: {}, R: {} };
    g.pl.forEach(p => { p.cd2 = {}; p.at2 = this.attrs(p); p.ultAt = 0; });
    const raw = g.pl.map(p => this.pp(g, p) + this.teamPP(g, p.side));
    g.pp0 = raw.reduce((a, v) => a + v, 0) / raw.length;
    g.pl.forEach(p => this.exeOf(g, p));
  },
  // 세부 능력치 (1~20) → −1 ~ 1 (14가 보통)
  attrs(p) {
    const a = (p.p && p.p.attributes) || {}, o = {};
    ['physical', 'macro', 'mental', 'role'].forEach(k => Object.entries(a[k] || {}).forEach(([n, v]) => { o[n] = Math.max(-1, Math.min(1, (v - 14) / 6)); }));
    return o;
  },
  A(p, k) { return (p.at2 && p.at2[k]) || 0; },
  // 개인 수행력 (구버전 ppow에서 실제 스탯으로 이미 들어가는 레벨 · 아이템 · 킬 · 체력을 뺀 것)
  pp(g, p) {
    const m = Sim.min(g), ph = m < 22 ? p.curve[0] : m < 30 ? p.curve[1] : p.curve[2];
    let v = p.ovr * .6 + p.m * .4 + (p.sig ? 2 : 0) + p.meta * 3 + (p.patch || 0) + (ph - .5) * Sim.CURVE_W;
    const ld = Sim.lead(g, p.side), fx = p.fx || {};
    if (ld < -3000) v += ((fx.behindOvr || 0) + Math.min(fx.behindScale || 0, -ld / 2000)) * .6;   // 클러치 · 중꺾마
    if (m >= 25) v += this.A(p, 'lateCarry') * 1.5;
    return v;
  },
  // 팀 수행력: 그날 컨디션 · 시너지 · 팀합 · 코치 · 조합의 시기
  teamPP(g, k) {
    const s = g.side[k], c = s.comp, m = Sim.min(g);
    let v = s.form + s.syn * 8 + (s.team || 0) + (s.coach - 10) * .15;
    v += m < 14 ? (c.early - .4) * 10 : m < 26 ? ((c.fight + c.engage) / 2 - .4) * 9 : (c.late - .4) * 10;
    return v;
  },
  exeOf(g, p) { p.exe = Math.exp((this.pp(g, p) + this.teamPP(g, p.side) - g.pp0) / this.EXE_S); return p.exe; },
  // 버프: 바론 · 장로 · 드래곤
  buff(g, p) {
    const s = g.side[p.side];
    return (Sim.baronOn(g, p) ? 1.12 : 1) * (s.elderUntil > g.t ? 1.15 : 1) * Math.exp(Sim.dragPow(s) / 40);
  },
  // 스킬 목록: 실제로 쓸 수 있는 것만 (피해 · 보호막 · 평타 강화 · 묶기 · 이동기). 데이터 없는 본인 강화는 뺀다
  kit(p) {
    if (p.k2) return p.k2;
    const C = typeof CStats !== 'undefined', dm = (C && CStats.dmg[p.c]) || {}, sh = (C && CStats.shields[p.c]) || {}, oh = (C && CStats.OH[p.c]) || {};
    return (p.k2 = Skills.of(p.c).map(s => ({ ...s, dmg: !!dm[s.key], sh: !!sh[s.key], oh: oh[s.key] || null }))
      .filter(s => s.dmg || s.sh || s.oh || this.CC[s.cc] || s.cc === 'slow' || ['dash', 'init', 'esc'].includes(s.kind)));
  },
  range(a, s) {
    const fx = s.fx;
    if (s.kind === 'self' && !fx) return a.rng + 1.2;
    if (!fx) return ({ line: 6, cone: 3.5, circle: 4.5, target: 4, global: 150 })[s.shape] || a.rng + 1;
    if (fx.s === 'global') return fx.w ? 150 : 999;
    if (fx.s === 'aura' || fx.s === 'self') return Math.max(a.rng, (fx.rad || 300) / 150 + 1);
    return Math.min(40, (fx.r || 600) / 150 + 1);
  },
  // 재사용 대기 (실제 초, 현재 랭크 · 스킬 가속: 완성 아이템 하나에 12, 최대 60)
  cdReal(p, key) {
    const rc = (typeof CStats !== 'undefined' && CStats.cd(p, key)) || ({ Q: 8, W: 12, E: 12, R: 100 })[key];
    const ah = Math.min(60, p.inv.filter(i => i.gold >= 2500).length * 12) + this.A(p, 'focus') * 3;
    return rc * 100 / (100 + Math.max(0, ah));
  },
  ready(g, a, s) {
    const t = g.tt ?? g.t;
    if ((a.cd2[s.key] || 0) > t) return false;
    if (s.key === 'R' && (a.lvl < 6 || Sim.ULT_JOIN.includes(a.c) || (s.shape === 'global' && s.kind === 'dash'))) return false;
    if (a.mpMax && CStats.cost(a, s.key) > a.mpCur) return false;
    return true;
  },
  seg(a, b, q) { const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy || 1, u = Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / L)); return Sim.dist(q, [a[0] + vx * u, a[1] + vy * u]); },
  isCarry(p) { return Sim.isCarry(p); },

  // ---------- 피해 ----------
  // 1초 평타 피해 (실제 수치): 평타 + 평타 강화 스킬 + 자잘한 패시브
  autoRaw(a, v) {
    const A = CStats.now(a); if (!A) return null;
    let auto = A.ad * A.as * (1 + A.crit * .75), p = 0, m = 0, t = 0;
    const OH = CStats.OH[a.c];
    if (OH) for (const [key, c] of Object.entries(OH)) {
      if (!CStats.ohOn(a, key)) continue;
      const d = CStats.skillDmg(a, key, v); if (!d) continue;
      const n = A.as * c.e; p += (d.p || 0) * n; m += (d.m || 0) * n; t += (d.t || 0) * n; if (c.rep) auto = 0;
    }
    const ps = 4 * a.lvl + .12 * A.ap + .08 * A.bonusAD;
    if (A.aoB) p += A.aoB * CStats.now(v).maxHP * A.as;
    return { p: p + auto + ps * (1 - A.magic), m: m + ps * A.magic, t };
  },
  // 실제 피해 → 대상 최대 체력 대비 비율 (방어력 · 마저 · 관통)
  frac(a, v, d) {
    const A = CStats.now(a), V = CStats.now(v); if (!A || !V || !d) return 0;
    const ea = Math.max(0, V.arm * (1 - A.armPen) - A.leth), em = Math.max(0, V.mr * (1 - A.mpenP) - A.mpen);
    return ((d.p || 0) * 100 / (100 + ea) + (d.m || 0) * 100 / (100 + em) + (d.t || 0)) / V.maxHP;
  },
  // 피해 배율: 수행력 · 버프 · 특성 · 상태 (스킬 뒤 강화 · 취약 · 탈진) · 보호 서폿 곁
  mul(g, a, v, skill) {
    const af = a.fx || {}, vf = v.fx || {}, m = Sim.min(g), t = g.tt ?? g.t;
    const guard = g.pl.some(q => q.side === v.side && q !== v && !q.dead && q.kind === 'ench' && Sim.dist(q.pos, v.pos) < 6) ? .92 - this.A(g.pl.find(q => q.side === v.side && q.kind === 'ench') || v, 'protect') * .04 : 1;
    const kit = v.role === 'BOT' && g.pl.some(q => q.side === v.side && q.role === 'SUP' && !q.dead && (q.fx || {}).adcGuard && Sim.dist(q.pos, v.pos) < 8);
    return this.K * (a.exe || 1) * (a.ff && a.ff.id === g.fNow ? a.ff.v : 1) * this.buff(g, a) * (af.dmg || 1) * (af.finish && v.hp < .35 ? af.finish : 1) * (af.firstBlood && !g.kills.length ? af.firstBlood : 1)
      * (vf.lateGuard && m >= 25 ? vf.lateGuard : 1) * (kit ? .88 : 1) * guard * (v.role === 'TOP' ? 1 - this.A(v, 'durability') * .05 : 1)
      * (a.km && a.km.until > t ? a.km.v : 1) * (v.vuln && v.vuln.until > t ? v.vuln.v : 1) * ((a.exh || 0) > t ? .6 : 1)
      * (!skill && v.fled ? .7 : 1);
  },
  // 피해 주기: 보호막 → 체력 → 처치 (킬은 그 싸움에서 준 피해 비중대로, 구버전과 같은 기준)
  deal(g, a, v, fr, f, opt = {}) {
    if (!(fr > 0) || v.dead) return 0;
    fr *= (v.fx || {}).takeDmg || 1;
    if (opt.floor != null) fr = Math.min(fr, Math.max(0, v.hp - opt.floor));
    if (v.sh && v.sh.until > g.t && v.sh.v > 0) { const ab = Math.min(v.sh.v, fr); v.sh.v -= ab; fr -= ab; }
    if (fr <= 0) return 0;
    v.hp -= fr; a.dmg = (a.dmg || 0) + fr * Sim.hpOf(v);
    if (typeof Kits !== 'undefined') Kits.vamp(g, a, v, fr);
    v.lastHit = a; v.lastHitT = g.t;
    if (f) { const ctb = f.dmg.get(v) || new Map(); ctb.set(a, (ctb.get(a) || 0) + fr); f.dmg.set(v, ctb); }
    if (v.hp > 0 && v.hp < .2 && g.side[a.side].elderUntil > g.t) { v.hp = 0; if (!g.elderSaid || g.t - g.elderSaid > 20) { g.elderSaid = g.t; Sim.line(g, 'elderExec', { p: v.name }); } }
    if (f && !f.dang && f.size >= 6 && v.hp > 0 && v.hp < .25 && this.isCarry(v) && v.role !== 'SUP' && v.fled !== f.id) { f.dang = v; Sim.line(g, 'danger', { p: v.name }); }
    if (v.hp <= 0) this.slay(g, a, v, f, opt.far);
    return fr;
  },
  slay(g, a, v, f, far) {
    let k = a;
    const ctb = f && f.dmg.get(v);
    if (ctb) { const L = [...ctb.entries()].filter(([x]) => !x.dead && x.side === a.side), w = ([x, d]) => Math.pow(d, 1.2) * (Sim.KILL_CR[x.kind] || 1), tot = L.reduce((s, e) => s + w(e), 0); if (tot > 0) { let r = g.r() * tot; for (const e of L) { r -= w(e); if (r <= 0) { k = e[0]; break; } } } }
    const helpers = ctb ? [...ctb.keys()].filter(x => x !== k && !x.dead && x.side === k.side) : [];
    Sim.kill(g, k, v, helpers, far || Sim.dist(k.pos, v.pos) > 12);
    v.cc = 0; v.castUntil = 0; v.slow = 0;
    if (f) {
      f.kills[k.side]++; (f.kb ||= new Map()).set(k, (f.kb.get(k) || 0) + 1);
      if (f.size >= 5 && f.kills.B + f.kills.R === 1 && this.isCarry(v) && v.role !== 'SUP' && g.t - (g.cutT || -999) > 240 && (g.cutT = g.t)) Sim.line(g, 'cutFirst', { p: v.name });
      if (k.kind === 'dive' && k.flank === f.id && this.isCarry(v) && f.size >= 5 && g.r() < .7) Sim.line(g, 'flank', { a: k.name, v: v.name });
    }
  },
  // 맞을 확률: 모양 · 날아가는 시간 · 폭 · 시전자 피지컬 · 대상 반응속도 · 선수 실력 · 상태
  hitP(g, a, fx, q, s) {
    const t = g.tt ?? g.t;
    const base = fx ? (Skills.HIT0[fx.s] ?? 1) : (this.HIT0[(s && s.shape) || ''] ?? 1);
    if (base >= 1 || (q.cc || 0) > t || a.flashEng === g.t) return 1;
    const du = Sim.dist(a.pos, q.pos) * 150, tt = fx && fx.spd ? du / fx.spd : fx && fx.s === 'circle' ? .5 : .25;
    let h = base - Math.min(.32, tt * .28) + (fx ? Math.min(.15, Math.max(0, ((fx.w || fx.rad || 90) - 90) / 600)) : 0)
      + ((a.ovr || 70) - (q.ovr || 70)) / 200 + this.A(a, 'mechanics') * .08 - this.A(q, 'reflex') * .07 + Math.min(1, (a.m || 0) / 30) * .05
      + ((q.slow || 0) > g.t ? .15 : 0) + (q.fled ? .05 : 0) - (q.kind === 'dive' || q.kind === 'adc' ? .04 : q.kind === 'tank' ? -.05 : 0);
    return Math.max(.12, Math.min(.97, h));
  },
  // 지금 이 선수가 받는 1초 피해 (대상 최대 체력 대비, 사거리 안 상대의 평타 기준)
  incoming(g, p, foes) {
    if (p._inc && p._inc.t === g.t) return p._inc.v;
    let v = 0;
    for (const q of foes) {
      if (q.dead || (q.cc || 0) > g.t || Sim.dist(q.pos, p.pos) > (q.rng < 5 ? q.rng + 1.6 : q.rng + .5)) continue;
      if (q.hitTo && q.hitTo !== p && !q.hitTo.dead && Sim.dist(q.hitTo.pos, q.pos) <= q.rng + 1) continue;
      v += this.frac(q, p, this.autoRaw(q, p)) * this.mul(g, q, p) * 1.3;   // 스킬 몫
    }
    p._inc = { t: g.t, v }; return v;
  },

  // ---------- 예측: 누가 이기나 (교전을 돌려 보지 않고) ----------
  // 1초 피해(실제 수치, 상대 평균 방어 기준): 평타 + 스킬(재사용 대기마다 한 번, 명중 70%)
  dpsOf(g, a, V) {
    const key = Math.floor(g.t / 3) + '|' + V.arm + '|' + V.mr;
    if (a._dps && a._dps.k === key) return a._dps.v;
    const A = CStats.now(a); if (!A) return 100;
    const r = this.autoRaw(a, a) || { p: 0, m: 0, t: 0 };
    this.kit(a).forEach(s => { if (!s.dmg || s.oh || (s.key === 'R' && a.lvl < 6)) return; const d = CStats.skillDmg(a, s.key, a); if (!d) return; const n = .7 / this.cdReal(a, s.key) * (s.key === 'R' && (a.cd2.R || 0) > g.t ? 0 : 1); r.p += (d.p || 0) * n; r.m += (d.m || 0) * n; r.t += (d.t || 0) * n; });
    const ea = Math.max(0, V.arm * (1 - A.armPen) - A.leth), em = Math.max(0, V.mr * (1 - A.mpenP) - A.mpen);
    const v = (r.p * 100 / (100 + ea) + r.m * 100 / (100 + em) + r.t) * (a.exe || 1) * this.buff(g, a) * (a.mpMax && a.mpCur < a.mpMax * .1 ? .7 : 1);
    a._dps = { k: key, v }; return v;
  },
  ehp(p) { const S = CStats.now(p); if (!S) return 1000 * Math.max(.05, p.hp); return Math.max(.05, p.hp) * S.maxHP * (1 + (S.arm + S.mr) / 200) + (p.sh && p.sh.until > (p._g || {}).t ? p.sh.v * S.maxHP : 0); },
  avgDef(ps) { const L = ps.map(p => CStats.now(p)).filter(Boolean); if (!L.length) return { arm: 60, mr: 50 }; return { arm: Math.round(L.reduce((a, s) => a + s.arm, 0) / L.length), mr: Math.round(L.reduce((a, s) => a + s.mr, 0) / L.length) }; },
  strength(g, us, them) { const V = this.avgDef(them); return { d: us.reduce((a, p) => a + this.dpsOf(g, p, V), 0), h: us.reduce((a, p) => a + this.ehp(p), 0) }; },
  pWin(g, A, B, bonus = 0) {
    if (!A.length) return 0; if (!B.length) return 1;
    const a = this.strength(g, A, B), b = this.strength(g, B, A), r = (a.d * a.h) / Math.max(1, b.d * b.h) * Math.exp(bonus);
    return 1 / (1 + Math.pow(r, -this.G));
  },
  // tpow 대신: 1인당 힘(DPS × 유효 체력)의 로그. 부르는 쪽이 인원 차이(1명당 6)를 따로 더하므로 1인당으로 준다 → 차이/11.5 ≈ G × ln(힘 비율)
  tpow(g, k, who) {
    const ps = (who || Sim.alive(g, k)).filter(p => !p.dead); if (!ps.length) return 0;
    const foes = Sim.alive(g, Sim.other(k)), s = this.strength(g, ps, foes.length ? foes : ps), n = ps.length;
    return 11.5 * this.G * Math.log(Math.max(1, s.d * s.h / (n * n)) / 1e5);
  },

  // ---------- 안개: 보이는 상대 · 방금 본 상대 ----------
  see(g) {
    if (typeof Vision === 'undefined' || !Vision.seen) return;
    ['B', 'R'].forEach(k => { const M = g.mem2[k]; g.pl.forEach(q => { if (q.side !== k && !q.dead && Vision.seen(g, k, q.pos)) M[q.p.id] = { pos: [...q.pos], t: g.t }; }); });
  },
  known(g, k, q) { if (typeof Vision === 'undefined' || !Vision.seen) return true; const M = g.mem2[k][q.p.id]; return !!M && g.t - M.t <= 6; },

  // ---------- 교전 (1초마다, 안에서 0.25초씩 4번) ----------
  fightTick(g) {
    Sim.T = g.t;
    g.sk = (g.sk || []).filter(e => g.t - e.t < 4);
    this.globalUlts(g);
    if (!g.fights.length) return;
    const S = Sim;
    for (const f of g.fights) {
      g.pl.forEach(p => { if (!f.mem.has(p) && !p.dead && !p.recall && !p.tpCh && !p.fled && S.dist(p.pos, f.at) <= f.r && S.reach(p.pos, f.at, f.r)) f.mem.add(p); });
      const mem = [...f.mem].filter(p => !p.dead && !p.recall && !p.tpCh && S.dist(p.pos, f.at) <= f.r + 6);
      f.mem = new Set(mem);
      const B = mem.filter(p => p.side === 'B' && !p.fled), R = mem.filter(p => p.side === 'R' && !p.fled);
      // 추격: 한쪽이 다 빠졌는데 체력이 바닥난 채 도망가는 상대가 가까우면 잠깐(5초) 쫓는다 — 쫓아가도 질 싸움이 아닐 때만
      let chase = null;
      if ((!B.length || !R.length) && (B.length || R.length) && g.t - f.t0 <= 25) {
        const k = B.length ? 'B' : 'R', hunters = (k === 'B' ? B : R).filter(p => p.hp > .25);
        const prey = g.pl.filter(q => q.side !== k && q.fled === f.id && !q.dead && !q.recall && q.hp < .3 && hunters.some(p => S.dist(p.pos, q.pos) < p.rng + 6 && Rift.los(p.pos, q.pos)));
        const help = prey.length && S.alive(g, S.other(k)).filter(q => !q.fled && S.dist(q.pos, prey[0].pos) < 14);
        if (hunters.length && prey.length && g.t - (f.chase ||= g.t) <= 5 && this.pWin(g, hunters, [...prey, ...help]) > .5) chase = { k, hunters, prey };
      }
      if (!chase && (!B.length || !R.length || g.t - f.t0 > 25)) { f.quiet++; if (f.quiet >= 2 || g.t - f.t0 > 25) f.done = true; continue; }
      f.quiet = 0;
      if (chase) chase.hunters.forEach(p => { const t = chase.prey.slice().sort((a, b) => (a.hp - b.hp) + (S.dist(a.pos, p.pos) - S.dist(b.pos, p.pos)) * .05)[0]; p.hold = { to: S.clampP(t.pos), until: g.t + 2 }; p.dash = g.t + 1; });
      this.summoners(g, f, g.r() < .5 ? mem : mem.slice().reverse());
      const act = mem.filter(p => !p.dead);
      act.forEach(p => { if (!p.ff || p.ff.id !== f.id) p.ff = { id: f.id, v: Math.exp((g.r() - .5) * this.FORM * (1 - this.A(p, 'composure') * .35 - this.A(p, 'focus') * (Sim.min(g) >= 30 ? .2 : 0))) }; });
      g.fNow = f.id;
      for (let i = 0; i < 4; i++) {
        g.tt = g.t - 1 + (i + 1) * this.DT;
        const ord = act.slice(); for (let j = ord.length - 1; j > 0; j--) { const r = Math.floor(g.r() * (j + 1)); [ord[j], ord[r]] = [ord[r], ord[j]]; }   /* 같은 0.25초 안에서는 순서를 섞는다 (늘 블루가 먼저 치던 편향) */
        for (const a of ord) this.act(g, f, a, !!chase);
        if (!mem.some(p => p.side === 'B' && !p.dead) || !mem.some(p => p.side === 'R' && !p.dead)) break;
      }
      g.tt = null; g.fNow = 0;
      this.retreat(g, f);
      const live = mem.filter(p => !p.dead && !p.fled);
      if (live.length) f.at = [live.reduce((a, p) => a + p.pos[0], 0) / live.length, live.reduce((a, p) => a + p.pos[1], 0) / live.length];
      if (!chase) S.form(g, f, live);
      mem.forEach(p => { if (!p.dead && ((p.cc || 0) > g.t || (p.castUntil || 0) > g.t)) p.hold = { to: [...p.pos], until: Math.ceil(Math.max(p.cc || 0, p.castUntil || 0)) }; });   // 묶였거나 채널링 중이면 제자리
    }
    g.fights.filter(f => f.done).forEach(f => S.fightEnd(g, f));
    g.fights = g.fights.filter(f => !f.done);
  },
  // 한 선수의 0.25초: 스킬 하나(준비된 것 중 가치가 가장 큰 것) + 평타
  act(g, f, a, chasing) {
    if (a.dead || a.recall || a.tpCh || (a.cc || 0) > g.tt) return;
    const foes = g.pl.filter(q => q.side !== a.side && !q.dead && !q.recall && !q.tpCh && (f.mem.has(q) || q.fled === f.id));
    if (!foes.length) return;
    const us = [...f.mem].filter(q => q.side === a.side && !q.dead);
    if (!((a.castUntil || 0) > g.tt)) { const o = this.choose(g, f, a, foes, us); if (o) this.cast(g, f, a, o, foes, us); }
    if ((a.castUntil || 0) > g.tt || a.fled === f.id || a.dead) return;
    const v = this.autoTarget(g, f, a, foes); if (!v) return;
    this.deal(g, a, v, this.frac(a, v, this.autoRaw(a, v)) * this.DT * this.mul(g, a, v), f);
    a.hitTo = v; a.hitAt = g.t;
  },
  // 평타 대상: 사거리 안 · 벽에 안 가린 적 중 — 약한 쪽 · 몸이 약한 쪽 · 한타 지시 · 한타 능력치(딜러를 제대로 노리나) · 치던 대상
  autoTarget(g, f, a, foes) {
    const reach = a.rng < 5 ? a.rng + 1.2 : a.rng + .3, D = Sim.dist;
    const L = foes.filter(q => D(q.pos, a.pos) <= reach && Rift.los(a.pos, q.pos)); if (!L.length) return null;
    const tg = g.side[a.side].ins.target, carry = q => q.role === 'BOT' || q.role === 'MID', tf = this.A(a, 'teamfight');
    const near = q => Math.max(0, (reach - D(q.pos, a.pos)) / reach);
    const kf = q => a.kind === 'tank' ? .5 + near(q) * 1.5 : a.kind === 'bruiser' ? .8 + near(q) * .7 : a.kind === 'dive' ? (this.isCarry(q) || q.kind === 'ench' ? 1.7 : .7) : a.kind === 'adc' ? .7 + near(q) : 1;
    const w = q => (1.4 - q.hp) * Sim.KIND[q.kind].take * kf(q) * (q.fled ? .6 : 1) * (q === a.hitTo ? 1.25 : 1)
      * (tg === 'carry' ? (carry(q) ? 1.6 : .75) : tg === 'front' ? (carry(q) ? .8 : 1.25) + near(q) * .5 : 1) * (1 + tf * (this.isCarry(q) ? .25 : -.1));
    return L.sort((x, y) => w(y) - w(x))[0];
  },
  choose(g, f, a, foes, us) {
    const low = a.hp < .3 || a.fled === f.id; let best = null;
    for (const s of this.kit(a)) {
      if (!this.ready(g, a, s)) continue;
      const o = this.value(g, f, a, s, foes, us, low); if (!o) continue;
      // 궁은 아낀다: 한타(4인 이상)에서 큰 값일 때 · 작은 싸움은 확실한 마무리나 큰 값일 때만. 한타 · 이니쉬 능력치가 높을수록 제때 쓴다
      const need = s.key === 'R' ? (f.size >= 4 ? .32 - this.A(a, 'teamfight') * .05 - (s.kind === 'init' ? this.A(a, 'engage') * .05 : 0) : .5 - this.A(a, 'crack') * .06) : .03;
      if (o.v >= need && (!best || o.v - (s.key === 'R' ? .1 : 0) > best.v)) best = o;
    }
    return best;
  },
  // 스킬 하나의 가치: 기대 피해(죽일 수 있으면 더) × 명중 + 묶기 + 보호막 − 위험
  value(g, f, a, s, foes, us, low) {
    const fx = s.fx, D = Sim.dist, kind = s.kind, fled = a.fled === f.id;
    if (kind === 'esc' || (fled && kind === 'dash' && !this.CC[s.cc])) {
      if (!low) return null;
      const th = foes.filter(q => D(q.pos, a.pos) < q.rng + 3).length; if (!th) return null;
      return { s, v: .2 + th * .08, to: Sim.toward(a.pos, a.side, Math.min(6, this.range(a, s))), hits: [], esc: true };
    }
    if (kind === 'ally' || (kind === 'self' && !s.dmg && !s.oh)) {
      if (!s.sh) return null;
      const cand = (kind === 'ally' ? us : [a]).filter(q => !q.dead && D(q.pos, a.pos) <= Math.max(6, this.range(a, s)));
      let best = null;
      for (const q of cand) {
        const inc = this.incoming(g, q, foes); if (inc <= 0) continue;
        const sh = CStats.shield(a, s.key, q); if (!sh) continue;
        const v = Math.min(sh.v, inc * Math.max(1, sh.dur)) * (1.2 + this.A(a, 'protect') * .3) + (q.hp < inc * 2 ? .15 : 0) + (this.isCarry(q) && q !== a ? .03 : 0);
        if (!best || v > best.v) best = { s, v, tg: q, to: [...q.pos], hits: [], ally: s.shape === 'circle' || s.shape === 'global' ? us.filter(x => !x.dead) : [q] };
      }
      return best;
    }
    if (fled) return null;
    const R = this.range(a, s), glob = fx && fx.s === 'global';
    const cand = foes.filter(q => D(q.pos, a.pos) <= R + .3 && (glob || Rift.los(a.pos, q.pos))).sort((x, y) => D(x.pos, a.pos) - D(y.pos, a.pos)).slice(0, 4);
    if (!cand.length) return null;
    const A = s.oh ? CStats.now(a) : null;
    let best = null;
    for (const tg of cand) {
      const to = [...tg.pos];
      let hits = kind === 'self' ? (D(tg.pos, a.pos) <= a.rng + 1.2 ? [tg] : []) : glob && fx.w ? foes.filter(q => this.seg(a.pos, this.past(a.pos, to, R), q.pos) < fx.w / 300 + .8) : Skills.hits(a, s, fx, to, tg, foes, this.seg);
      if (!fx && s.shape === 'target') hits = [tg];
      if (!hits.length) continue;
      let v = 0;
      for (const q of hits) {
        const ph = this.hitP(g, a, fx, q, s);
        let dv = 0;
        if (s.oh && A) { const d = CStats.skillDmg(a, s.key, q); if (d) dv = this.frac(a, q, d) * A.as * s.oh.e * Math.max(2, (s.oh.d || 3) * 2) * .6 * this.mul(g, a, q, true); }
        else if (s.dmg) { const d = CStats.skillDmg(a, s.key, q), fr = d ? this.frac(a, q, d) * this.mul(g, a, q, true) : 0; dv = Math.min(fr, Math.max(0, q.hp)) * (fr >= q.hp ? 1.6 : 1); }
        const cc = this.CC[s.cc] ? this.CC[s.cc] * (s.key === 'R' ? 1.4 : 1) * .2 * (this.isCarry(q) ? 1.2 : 1) * (us.length >= 2 ? 1.15 : .8) : s.cc === 'slow' ? .03 : 0;
        v += ph * (dv * (1 + this.A(a, 'teamfight') * (this.isCarry(q) ? .15 : 0)) + cc);
      }
      if (kind === 'dash' || kind === 'init') {
        const n = foes.filter(q => D(q.pos, to) < 6).length, m2 = us.filter(q => D(q.pos, to) < 8).length;
        v -= Math.max(0, n - m2) * .06 * (a.kind === 'tank' ? .4 : 1) * (1.3 - a.hp);
      }
      if (!best || v > best.v) best = { s, v, tg, to, hits };
    }
    return best;
  },
  past(from, to, R) { const dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy) || 1, r = Math.min(R, 150); return [from[0] + dx / L * r, from[1] + dy / L * r]; },
  move(g, p, to) { const q = Sim.clampP(to); if (Rift.wall(q)) return; p.pos = q; p.warp = g.t; p.trail = [q]; p.dash = g.t + 1; p.rt = null; },
  moveToward(g, p, at, d) { if (!(d > .2)) return; const dx = at[0] - p.pos[0], dy = at[1] - p.pos[1], L = Math.hypot(dx, dy) || 1; this.move(g, p, [p.pos[0] + dx / L * d, p.pos[1] + dy / L * d]); },
  cast(g, f, a, o, foes, us, far) {
    const s = o.s, fx = s.fx, D = Sim.dist, from = [...a.pos], t = g.tt ?? g.t;
    a.cd2[s.key] = t + this.cdReal(a, s.key);
    if (s.key === 'R') a.ultAt = Math.ceil(a.cd2.R);
    if (a.mpMax) a.mpCur = Math.max(0, a.mpCur - CStats.cost(a, s.key));
    // 이동기: 도주는 본진 쪽으로, 돌진은 대상에게 (붙을 만큼만)
    if (o.esc) this.move(g, a, o.to);
    else if (o.tg && (s.kind === 'dash' || s.kind === 'init' || (fx && (fx.s === 'dash' || fx.s === 'blink')))) this.moveToward(g, a, o.tg.pos, Math.min(this.range(a, s), D(o.tg.pos, a.pos) - 1.5));
    const hit = [], miss = [];
    (o.hits || []).forEach(q => (g.r() < this.hitP(g, a, fx, q, s) ? hit : miss).push(q));
    if (s.oh) (a.oh ||= {})[s.key] = g.t + Math.max(2, Math.round((s.oh.d || 3) * 2));
    else if (s.dmg) hit.forEach(q => { const d = CStats.skillDmg(a, s.key, q); if (d) this.deal(g, a, q, this.frac(a, q, d) * this.mul(g, a, q, true), f || g.fights.find(x => x.mem.has(q)), { far }); });
    // 묶기: 실제로 행동을 막는다 (궁은 더 길게). 끌기 · 밀기는 자리도 바꾼다
    const ccd = this.CC[s.cc];
    if (ccd) hit.forEach(q => {
      if (q.dead) return;
      q.cc = Math.max(q.cc || 0, t + ccd * (s.key === 'R' ? 1.4 : 1));
      if (s.cc === 'pull') this.moveToward(g, q, a.pos, Math.min(2.5, D(q.pos, a.pos) - 1.5));
      else if (s.cc === 'back') { const dx = q.pos[0] - a.pos[0], dy = q.pos[1] - a.pos[1], L = Math.hypot(dx, dy) || 1; this.move(g, q, [q.pos[0] + dx / L * 2, q.pos[1] + dy / L * 2]); }
    });
    if (s.cc === 'slow') hit.forEach(q => { q.slow = Math.max(q.slow || 0, g.t + 2); });
    if (s.kind !== 'ally' && s.kind !== 'esc' && hit.length) a.km = { v: Math.max(a.km && a.km.until > t ? a.km.v : 1, s.kind === 'self' ? 1.15 : 1.05), until: t + 3 };   // 스킬 뒤 평타 강화 (짧게)
    const ally = o.ally || [];
    if (s.sh) (ally.length ? ally : [a]).forEach(q => { const sh = CStats.shield(a, s.key, q); if (sh) q.sh = { v: Math.max(q.sh && q.sh.until > g.t ? q.sh.v : 0, sh.v), until: g.t + Math.max(1, Math.round(sh.dur)) }; });
    if (fx && fx.ch) a.castUntil = t + fx.ch;
    const ix = q => g.pl.indexOf(q);
    g.sk.push({ t: g.t, i: ix(a), key: s.key, kind: s.kind, shape: s.shape, cc: s.cc, name: s.name, icon: s.icon, form: '', fx, from, to: o.to || [...a.pos], hit: hit.map(ix), miss: miss.map(ix), ally: ally.map(ix), big: !!f && f.size >= 4 });
    if (s.key === 'R' && hit.length >= 3 && ccd && g.r() < .6) Sim.line(g, 'ccMulti', { p: a.name, u: s.name, n: hit.length });
    return hit;
  },
  // 소환사 주문 (1초마다): 정화 · 방어막 · 회복 · 점멸(도주 · 이니시 · 마무리) · 점화 · 탈진 · 유체화. 쓰는 기준은 예측 · 받는 피해 · 능력치
  summoners(g, f, mem) {
    if (typeof Spells === 'undefined') return;
    const D = Sim.dist;
    for (const p of mem) {
      if (!p.ss || p.dead || p.recall || p.tpCh) continue;
      const foes = g.pl.filter(q => q.side !== p.side && !q.dead && !q.recall && !q.tpCh && (f.mem.has(q) || q.fled === f.id)); if (!foes.length) continue;
      const us = mem.filter(q => q.side === p.side && !q.dead), inc = this.incoming(g, p, foes), sk = .55 + this.A(p, 'reflex') * .2 + this.A(p, 'composure') * .1;
      if ((p.cc || 0) > g.t && Spells.ready(g, p, 'Cleanse') && inc > .06) { p.cc = 0; Spells.use(g, p, 'Cleanse', null, Sim.lt(g, 'cleanse', { p: p.name })); }
      if ((p.cc || 0) > g.t) continue;
      if (p.hp < .4 && inc * 2 >= p.hp) {
        if (Spells.ready(g, p, 'Barrier') && g.r() < sk + .25) { const v = (95 + 25 * p.lvl) / Spells.maxHP(p); p.sh = { v: Math.max(p.sh && p.sh.until > g.t ? p.sh.v : 0, v), until: g.t + 2 }; Spells.use(g, p, 'Barrier'); }
        else if (Spells.ready(g, p, 'Heal') && g.r() < sk + .25) {
          const amt = 80 + 15.6 * p.lvl, cap = typeof Kits !== 'undefined' ? Kits.hpCap(p, g) : 1; p.hp = Math.min(cap, p.hp + amt / Spells.maxHP(p));
          const al = us.filter(q => q !== p && q.hp < .6 && D(q.pos, p.pos) < 5.5).sort((a, b) => a.hp - b.hp)[0]; if (al) al.hp = Math.min(1, al.hp + amt / Spells.maxHP(al));
          Spells.use(g, p, 'Heal');
        }
      }
      // 점멸 도주: 1.5초 안에 죽을 만큼 맞고 있거나 도망 중인데 붙어 있으면
      if ((p.fled === f.id || inc * 1.5 >= p.hp) && p.hp < .3 && inc > 0 && Spells.ready(g, p, 'Flash') && g.r() < sk + this.A(p, 'survival') * .1) {
        const home = Sim.fountain(p.side), base = Math.atan2(home[1] - p.pos[1], home[0] - p.pos[0]);
        let best = null;
        for (const da of [0, -.5, .5, -1, 1]) { const ang = base + da, to = Spells.blinkTo(p.pos, [Math.cos(ang), Math.sin(ang)]); if (!to) continue; const over = !Rift.los(p.pos, to), far = foes.reduce((m, q) => Math.min(m, D(q.pos, to)), 99), sc = far + (over ? 3 : 0) - Math.abs(da); if (!best || sc > best.sc) best = { to, sc, over }; }
        if (best) { Spells.flash(g, p, best.to, Sim.lt(g, best.over ? 'flashWall' : 'flashEscape', { p: p.name })); p.fled = f.id; Sim.retreat(g, p, 18); continue; }
      }
      if (p.fled) { if (Spells.ready(g, p, 'Ghost') && inc > 0 && g.r() < sk) { p.ghost = g.t + 5; Sim.refresh(p); Spells.use(g, p, 'Ghost'); } continue; }
      // 점멸 이니시: 싸움이 막 열릴 때, 묶는 스킬(궁 우선)이 준비됐고 이길 싸움이면 점멸로 붙어 바로 묶는다
      if (g.t - f.t0 <= 1 && f.size >= 3 && !(f.fe && f.fe[p.side]) && Spells.ready(g, p, 'Flash')) {
        const s = this.kit(p).filter(x => ['stun', 'up', 'pull'].includes(x.cc) && x.kind !== 'self' && this.ready(g, p, x)).sort((x, y) => (y.key === 'R') - (x.key === 'R'))[0];
        if (s && this.pWin(g, us, foes.filter(q => !q.fled)) >= .5 && g.r() < (.4 + this.A(p, 'engage') * .2 + this.A(p, 'crack') * .1) * sk / .55) {
          const R = this.range(p, s), tg = foes.filter(q => { const d = D(q.pos, p.pos); return d > R && d <= R + Spells.FLASH && Rift.los(p.pos, q.pos); }).sort((x, y) => this.isCarry(y) - this.isCarry(x) || D(x.pos, p.pos) - D(y.pos, p.pos))[0];
          const to = tg && Spells.blinkTo(p.pos, [tg.pos[0] - p.pos[0], tg.pos[1] - p.pos[1]], Math.min(Spells.FLASH, D(tg.pos, p.pos) - R + .8));
          if (to) {
            (f.fe ||= {})[p.side] = 1; p.flashEng = g.t;
            const rc = s.cc, hitW = { up: '그대로 띄워집니다', stun: '그대로 묶입니다', pull: '그대로 끌려옵니다' }[rc];
            Spells.flash(g, p, to, Sim.lt(g, hitW ? 'flashEngage' : 'flashEngageNoHit', { p: p.name, u: s.name, tg: tg.name, hit: hitW }));
            const o = this.value(g, f, p, s, foes, us, false); if (o) this.cast(g, f, p, o, foes, us);
            continue;
          }
        }
      }
      // 점멸 마무리: 내 한 방(준비된 스킬 + 평타 2초)으로 죽는 적이 사거리 바로 밖
      if (Spells.ready(g, p, 'Flash') && p.hp > .25) {
        const reach = p.rng < 5 ? p.rng + 1.2 : p.rng, burst = q => this.kit(p).filter(x => x.dmg && !x.oh && this.ready(g, p, x)).reduce((a, x) => a + this.frac(p, q, CStats.skillDmg(p, x.key, q)), 0) * this.mul(g, p, q, true) + this.frac(p, q, this.autoRaw(p, q)) * 2 * this.mul(g, p, q);
        const v = foes.filter(q => { const d = D(q.pos, p.pos); return q.flashChased !== g.t && d > reach && d <= reach + Spells.FLASH && Rift.los(p.pos, q.pos) && burst(q) >= q.hp; }).sort((a, b) => a.hp - b.hp)[0];
        if (v && g.r() < (Spells.ready(g, v, 'Flash') ? .35 : .65) * sk / .55) { const to = Spells.blinkTo(p.pos, [v.pos[0] - p.pos[0], v.pos[1] - p.pos[1]], Math.min(Spells.FLASH, D(v.pos, p.pos) - reach + .6)); if (to) { p.hitTo = v; v.flashChased = g.t; Spells.flash(g, p, to, Sim.lt(g, 'flashChase', { p: p.name, v: v.name })); continue; } }
      }
      // 점화: 고정 피해(5초)로 마무리 각
      if (Spells.ready(g, p, 'Ignite')) {
        const amt = 70 + 20 * p.lvl, v = foes.filter(q => D(q.pos, p.pos) <= 4.5 && Rift.los(p.pos, q.pos) && amt / Spells.maxHP(q) * .8 + this.incoming(g, q, us) * 2 >= q.hp).sort((a, b) => a.hp - b.hp)[0];
        if (v && g.r() < sk + .2) { Spells.use(g, p, 'Ignite', v.pos); this.deal(g, p, v, amt / Spells.maxHP(v) * .8, f); }
      }
      // 탈진: 우리 딜러를 무는 적 중 가장 아픈 쪽에게
      if (Spells.ready(g, p, 'Exhaust')) {
        const cs = us.filter(q => this.isCarry(q) && q.hp < .7), v = foes.filter(q => D(q.pos, p.pos) <= 4.5 && cs.some(c => D(c.pos, q.pos) < q.rng + 1)).sort((a, b) => this.dpsOf(g, b, CStats.now(p) || { arm: 50, mr: 50 }) - this.dpsOf(g, a, CStats.now(p) || { arm: 50, mr: 50 }))[0];
        if (v && g.r() < sk + this.A(p, 'protect') * .2) { v.exh = g.t + 2.5; Spells.use(g, p, 'Exhaust', v.pos, g.r() < .4 ? Sim.lt(g, 'exhaust', { p: p.name, v: v.name }) : null); }
      }
      if (Spells.ready(g, p, 'Ghost') && foes.some(q => q.fled === f.id && q.hp < .3) && g.r() < sk * .6) { p.ghost = g.t + 5; Sim.refresh(p); Spells.use(g, p, 'Ghost'); }
    }
  },
  // 후퇴 (1초마다): 예측이 크게 밀리면 팀이 빠지고, 받는 피해로 곧 죽을 선수는 혼자라도 빠진다. 본진 안에서는 버틴다
  retreat(g, f) {
    const live = [...f.mem].filter(p => !p.dead && !p.fled), B = live.filter(p => p.side === 'B'), R = live.filter(p => p.side === 'R');
    if (!B.length || !R.length) return;
    const pB = this.pWin(g, B, R), go = new Set();
    for (const [k, us, foes, pw] of [['B', B, R, pB], ['R', R, B, 1 - pB]]) {
      const ag = ({ safe: .06, norm: 0, aggr: -.06 })[g.side[k].ins.aggr] || 0;
      const home = ['top', 'mid', 'bot'].some(l => { const st = Sim.structOf(g, k, l); return /nexus|inhib/.test(st.kind) && Sim.dist(st.pos, f.at) < 18; });
      if (g.t - f.t0 >= 2 && pw < .2 + ag && !home) { us.forEach(q => { if (g.r() < .75 + this.A(q, 'composure') * .15) go.add(q); }); continue; }
      us.forEach(q => {
        const inc = this.incoming(g, q, foes), thr = (Sim.min(g) < 10 ? .4 : .3) + ag - this.A(q, 'survival') * .05;
        if (q.hp < thr && (inc * 2 > q.hp || pw < .45) && !home && g.r() < .65 + this.A(q, 'survival') * .15 + this.A(q, 'composure') * .1) go.add(q);
      });
      // 둘 이상 잘렸고 숫자에서 밀리면 남은 팀원도 빠진다
      const o = Sim.other(k); if (f.kills[o] >= 2 && us.length < foes.length && !home) us.forEach(q => { if (g.r() < .75) go.add(q); });
    }
    go.forEach(p => { p.fled = f.id; Sim.retreat(g, p, 18); });
  },
  // 전역 · 초장거리 궁 (1초마다): 보이는 적에게 실제 사거리 · 폭 · 날아가는 시간 · 피해로. 맞고 죽을 만할 때 쓴다
  globalUlts(g) {
    if (g.t < 360) return;
    for (const a of g.pl) {
      if (a.dead || a.recall || a.tpCh || a.lvl < 6 || (a.cc || 0) > g.t || (a.castUntil || 0) > g.t) continue;
      const s = this.kit(a).find(x => x.key === 'R'); if (!s || !s.dmg || !s.fx) continue;
      const fx = s.fx; if (!(fx.s === 'global' || (fx.r || 0) >= 3000) || !this.ready(g, a, s)) continue;
      const myF = g.fights.find(f => f.mem.has(a)); if (myF) continue;   // 싸움 안에서는 일반 판단으로
      const R = this.range(a, s);
      const foes = g.pl.filter(q => q.side !== a.side && !q.dead && !q.recall && Sim.dist(q.pos, a.pos) <= R && this.known(g, a.side, q) && (typeof Vision === 'undefined' || Vision.seen(g, a.side, q.pos)));
      if (!foes.length) continue;
      let best = null;
      for (const tg of foes) {
        const hits = fx.w ? foes.filter(q => this.seg(a.pos, this.past(a.pos, tg.pos, R), q.pos) < fx.w / 300 + .8) : foes;
        let v = 0;
        for (const q of hits) { const d = CStats.skillDmg(a, 'R', q); if (!d) continue; const fr = this.frac(a, q, d) * this.mul(g, a, q, true), ph = this.hitP(g, a, fx, q, s); v += ph * (fr >= q.hp ? 1 + q.hp : fr * .4); }
        if (!best || v > best.v) best = { s, v, tg, to: [...tg.pos], hits };
      }
      if (!best || best.v < .5 - this.A(a, 'crack') * .05) continue;
      const k0 = g.kills.length, hit = this.cast(g, null, a, best, foes, [], true);
      g.fx.push({ type: 'beam', side: a.side, from: [...a.pos], at: [...best.tg.pos], t: g.t, dur: 1.6, c: a.c, name: Sim.rName(a) });
      if (g.kills.length > k0 && g.t - ((g.ufT ||= {})[a.name] ?? -999) > 150) { g.ufT[a.name] = g.t; Sim.line(g, 'ultFinish', { s: a.name, u: Sim.rName(a), v: g.kills[g.kills.length - 1].v.name }); }
      else if (!hit.length && g.r() < .3) Sim.say(g, 'cast', `${a.name}의 ${Sim.rName(a)}, 빗나갑니다!`);
    }
  },

  // ---------- 판단 ----------
  // 마주침: 서로 보이는 만큼만 보고 각자 판단한다 (안개). 불리한 쪽은 물러나고, 대치가 길어지면 끊는다 (밀리는 쪽이 멀리 빠지거나 붙는다)
  encounter(g, m) {
    const S = Sim;
    if (g.over || g.t < 100) return;
    const busy = new Set(); g.fights.forEach(f => f.mem.forEach(p => busy.add(p)));
    const ok = p => !p.recall && !p.tpCh && !p.fled && !busy.has(p);
    if (m >= 8) g.pl.forEach(p => { if (p.dead || !ok(p) || p.hold) return; const foes = S.near(g, S.other(p.side), p.pos, 13).filter(q => this.known(g, p.side, q)); if (foes.length < 3) return; const mates = S.near(g, p.side, p.pos, 12); if (this.pWin(g, mates, foes) < .4 && !/nexus|inhib/.test(((S.threat(g, p.side) || {}).st || {}).kind || '')) S.retreat(g, p, 14); });
    if (S.OVL_ON !== false) { const O = (g.ovl ||= {}), now = {};
      S.alive(g, 'B').forEach(a => { if (ok(a)) S.alive(g, 'R').forEach(b => { if (!ok(b) || S.dist(a.pos, b.pos) > 1.6) return; const key = a.p.id + '|' + b.p.id; now[key] = (O[key] || 0) + 1;
        if (now[key] >= 2 && S.fightAt(g, [(a.pos[0] + b.pos[0]) / 2, (a.pos[1] + b.pos[1]) / 2], 8, { where: '' })) now[key] = 0; }); });
      g.ovl = now; }
    let best = null;
    S.alive(g, 'B').forEach(a => { if (ok(a)) S.alive(g, 'R').forEach(b => {
      if (!ok(b)) return;
      const d = S.dist(a.pos, b.pos); if (d > 5.5 || (best && d >= best.d)) return;
      if (a.role === b.role && a.role !== 'JGL' && (m < 14 || ['TOP', 'BOT'].includes(a.role)) && S.distLane(a.pos, S.LANE_OF[a.role]) < 6) return;
      if (m < 14 && ['BOT', 'SUP'].includes(a.role) && ['BOT', 'SUP'].includes(b.role)) return;
      if (!Rift.los(a.pos, b.pos)) return;
      const face = S.laneFace(a, b);
      if ((a.metAt || 0) > g.t && (b.metAt || 0) > g.t) { if (d < 4.5 && !face) S.standoff(g, [a], [b]); return; }
      best = { a, b, d, face };
    }); });
    if (!best) return;
    const at = [(best.a.pos[0] + best.b.pos[0]) / 2, (best.a.pos[1] + best.b.pos[1]) / 2];
    const A = S.near(g, 'B', at, 12).filter(ok), Bp = S.near(g, 'R', at, 12).filter(ok);
    const tries = best.face ? 0 : Math.max(...[...A, ...Bp].map(p => g.t - (p.metT || -99) < 40 ? p.metN || 0 : 0));
    [...A, ...Bp].forEach(p => { p.metAt = g.t + 12; p.metN = tries + 1; p.metT = g.t; });
    // 각자 보이는 상대로 계산 (포탑 곁이면 유리)
    const tw = k => ['top', 'mid', 'bot'].some(l => { const st = S.structOf(g, k, l); return st.kind !== 'nexus' && S.dist(st.pos, at) < 12; }) ? .5 : 0;
    const eB = this.pWin(g, A, Bp.filter(q => this.known(g, 'B', q)), tw('B') - tw('R'));
    const eR = this.pWin(g, Bp, A.filter(q => this.known(g, 'R', q)), tw('R') - tw('B'));
    const home = k => ['top', 'mid', 'bot'].some(l => /nexus|inhib/.test(S.structOf(g, k, l).kind) && S.dist(S.structOf(g, k, l).pos, at) < 20);
    const lowB = A.some(p => p.hp < .2), lowR = Bp.some(p => p.hp < .2), kill = ((lowR && !lowB && A.length && A.every(p => p.hp > .5)) || (lowB && !lowR && Bp.length && Bp.every(p => p.hp > .5))) && g.r() < (S.KILLP ?? .6);
    if (!best.face && !kill) {
      let back = false;
      [['B', A, eB], ['R', Bp, eR]].forEach(([k, ps, e]) => { if (e < .3 && !home(k) && g.r() < .8 + ps.reduce((s, p) => s + this.A(p, 'mapAwareness'), 0) / Math.max(1, ps.length) * .15) { ps.forEach(p => S.retreat(g, p, 14 + (tries >= 2 ? 6 : 0))); back = true; if (A.length + Bp.length >= 4 && g.r() < .35) S.line(g, 'standoff', { t: g.side[k].t.short }); } });
      if (back) return;
    }
    // 대치 끊기: 세 번째 마주침부터는 견제만 하지 않는다 — 비슷하면 붙고, 밀리는 쪽은 멀리 빠진다
    if (!kill && !best.face && tries >= 2) {
      const weak = eB < eR ? ['B', A, eB] : ['R', Bp, eR];
      if (weak[2] < .42 && !home(weak[0])) { weak[1].forEach(p => S.retreat(g, p, 20)); return; }
    } else if (!kill && g.r() > S.MEET * (best.face ? .3 : 1 + tries) * S.agr(g)) { if (!best.face) S.standoff(g, A, Bp); return; }
    const lane = ['top', 'mid', 'bot'].sort((x, y) => S.distLane(at, x) - S.distLane(at, y))[0];
    S.fightAt(g, at, 14, { where: home('B') || home('R') ? '본진' : S.distLane(at, lane) < 6 ? S.laneKo(lane) : '정글' });
  },
  // 라인전 교전 (10초마다): 맞상대끼리 — 예측이 크게 앞서거나 상대 체력이 낮으면 들어간다. 대부분은 견제(laneTick)로 끝난다
  TRADE0: .018,
  laning(g, m) {
    const S = Sim;
    ['TOP', 'MID'].forEach(role => {
      const a = S.alive(g, 'B').find(p => p.role === role), b = S.alive(g, 'R').find(p => p.role === role), lane = S.LANE_OF[role];
      if (g.t < 90 || !a || !b || a.tac === 'hold' || b.tac === 'hold' || a.recall || b.recall || a.tpCh || b.tpCh || S.dist(a.pos, b.pos) > 13 || S.distLane(a.pos, lane) > 5 || S.distLane(b.pos, lane) > 5) return;
      const pA = this.pWin(g, [a], [b]), edge = Math.abs(pA - .5), strong = pA > .5 ? a : b, weak = strong === a ? b : a;
      const go = this.TRADE0 * S.agr(g) * Math.max((a.fx || {}).trade || 1, (b.fx || {}).trade || 1) * (strong.tac === 'press' ? 1.5 : 1) * (1 + this.A(strong, 'laning') * .3)
        + Math.max(0, edge - .12) * .6 * (weak.hp < .5 ? 1.6 : 1);
      if (g.r() > go) return;
      const press = (a.tac === 'press' ? 3 : 0) - (b.tac === 'press' ? 3 : 0) + ((a.fx || {}).duel || 0) - ((b.fx || {}).duel || 0), muE = (a.mu.wr - .5) * 25;
      S.fightAt(g, [(a.pos[0] + b.pos[0]) / 2, (a.pos[1] + b.pos[1]) / 2], 8, { bonus: { side: 'B', v: press + muE }, onEnd: f => { if (f.n && g.kills.length > 1) { const w = g.pl.find(x => x.side === f.wk && x.role === role), l = g.pl.find(x => x.side !== f.wk && x.role === role); (S.line(g, 'solo', { w: w.name, l: l.name, lane: S.laneKo(lane) }), g.r() < .4 && S.line(g, 'soloHype', { w: w.name })); } } });
    });
    const bb = S.near(g, 'B', Rift.lane('bot', .5), 60).filter(p => ['BOT', 'SUP'].includes(p.role)), rb = S.near(g, 'R', Rift.lane('bot', .5), 60).filter(p => ['BOT', 'SUP'].includes(p.role));
    if (g.t >= 90 && bb.length && rb.length && S.dist(bb[0].pos, rb[0].pos) < 13 && S.distLane(bb[0].pos, 'bot') < 5) {
      const pB = this.pWin(g, bb, rb), edge = Math.abs(pB - .5), weakHp = Math.min(...(pB > .5 ? rb : bb).map(p => p.hp));
      if (g.r() < this.TRADE0 * .9 * S.agr(g) + Math.max(0, edge - .12) * .6 * (weakHp < .5 ? 1.6 : 1)) S.fightAt(g, [(bb[0].pos[0] + rb[0].pos[0]) / 2, (bb[0].pos[1] + rb[0].pos[1]) / 2], 10, { where: '바텀' });
    }
  },
  // 라인 견제 (1초마다, 14분 전): 사거리가 길수록 · 라인전 능력치가 높을수록 자주 친다. 견제로는 죽지 않는다(체력 18% 아래로는 안 깎음) — 마무리는 교전으로
  laneTick(g) {
    Sim.T = g.t;
    const S = Sim, m = S.min(g); if (m >= 14 || g.t < 90) return;
    const busy = S.busySet(g);
    for (const a of g.pl) {
      if (a.dead || a.role === 'JGL' || a.recall || a.tpCh || busy.has(a) || (a.cc || 0) > g.t || !S.inLane(a)) continue;
      const lane = S.LANE_OF[a.role];
      const foes = g.pl.filter(q => q.side !== a.side && !q.dead && q.role !== 'JGL' && !q.recall && !busy.has(q) && S.LANE_OF[q.role] === lane && S.dist(q.pos, a.pos) < 9 && Rift.los(a.pos, q.pos)); if (!foes.length) continue;
      const v = foes.sort((x, y) => x.hp - y.hp)[0], rd = a.rng - v.rng;
      const pk = (.035 + Math.max(0, rd) * .03 + this.A(a, 'laning') * .02 + (a.tac === 'press' ? .025 : ['safe', 'farm', 'hold'].includes(a.tac) ? -.01 : 0) + (a.kind === 'arti' || a.kind === 'mage' ? .015 : 0)) * (a.hp < .4 ? .3 : 1) * (a.role === 'SUP' ? .8 : 1);
      if (g.r() > pk) continue;
      const s = this.kit(a).find(x => x.key !== 'R' && x.dmg && !x.oh && x.kind === 'atk' && this.ready(g, a, x) && this.range(a, x) >= S.dist(a.pos, v.pos) && (!a.mpMax || a.mpCur > a.mpMax * .4));
      if (s) {
        a.cd2[s.key] = g.t + this.cdReal(a, s.key); if (a.mpMax) a.mpCur = Math.max(0, a.mpCur - CStats.cost(a, s.key));
        const hits = Skills.hits(a, s, s.fx, [...v.pos], v, foes, this.seg).filter(q => g.r() < this.hitP(g, a, s.fx, q, s)), ix = q => g.pl.indexOf(q);
        hits.forEach(q => { const d = CStats.skillDmg(a, s.key, q); if (d) this.deal(g, a, q, this.frac(a, q, d) * this.mul(g, a, q, true), null, { floor: .18 }); });
        g.sk.push({ t: g.t, i: ix(a), key: s.key, kind: s.kind, shape: s.shape, cc: '', name: s.name, icon: s.icon, form: '', fx: s.fx, from: [...a.pos], to: [...v.pos], hit: hits.map(ix), miss: [], ally: [], big: false, kit: true });
      } else if (S.dist(a.pos, v.pos) <= a.rng + .3) {
        this.deal(g, a, v, this.frac(a, v, this.autoRaw(a, v)) * .9 * this.mul(g, a, v), null, { floor: .18 }); a.hitTo = v; a.hitAt = g.t;
        if (S.dist(a.pos, v.pos) <= v.rng + .3 && g.r() < .6 + this.A(v, 'laning') * .2) { this.deal(g, v, a, this.frac(v, a, this.autoRaw(v, a)) * .7 * this.mul(g, v, a), null, { floor: .18 }); v.hitTo = a; v.hitAt = g.t; }   // 맞받아치기 (사거리 안이면)
      }
    }
  },
  // 라인 주도권: 구버전 값 + 사거리 차이 · 라인전 능력치
  prioAdj(g, p, m, v) {
    if (p.role === 'JGL') return v;
    const key = p.role === 'SUP' ? 'BOT' : p.role, me = p.role === 'SUP' ? (g.pl.find(q => q.side === p.side && q.role === 'BOT') || p) : p, o = g.pl.find(q => q.side !== p.side && q.role === key);
    if (!o || Math.abs(v) >= .5) return v;
    return Math.max(-.5, Math.min(.5, v + (me.rng - o.rng) * .04 + (this.A(me, 'laning') - this.A(o, 'laning')) * .12));
  },
  // 막타: 주도권이 밀리거나 체력이 낮아 상대 곁에 못 서면 덜 먹는다 · 성장 능력치
  csGive(g, k, at, dn, m, tower) {
    const S = Sim; if (dn <= 0) return;
    S.minionXp(g, k, at, dn, m);
    const busy = S.busySet(g), ps = S.alive(g, k).filter(p => !p.recall && !p.tpCh && !busy.has(p) && S.dist(p.pos, at) <= 10); if (!ps.length) return;
    const main = ps.filter(p => p.role !== 'SUP'), L = main.length ? main : ps, gold = S.MIN_G + m * .25;
    L.forEach(p => {
      const pr = m < 14 && S.inLane(p) ? S.prio(g, p, m) : 0;
      const zoned = m < 14 && p.hp < .4 && g.pl.some(q => q.side !== k && !q.dead && q.role !== 'JGL' && S.dist(q.pos, p.pos) < 7);
      const lh = Math.min(.97, (S.LH + (p.ovr - 75) * .006 + this.A(p, 'farming') * .04) * ((p.fx || {}).cs || 1) * (['farm', 'safe', 'hold'].includes(p.tac) ? 1.05 : 1) * (tower ? .8 + this.A(p, 'farming') * .05 : 1) * (1 + Math.min(0, pr) * .6) * (zoned ? .8 : 1)) * (p.role === 'SUP' ? .5 : 1);
      const c = dn / L.length * lh; p.cs += c; p.gold += c * gold;
    });
  },
  // 팀 정비 (5초마다): 싸움 뒤 팀 체력이 바닥이고 근처에 상대가 없으면 다 같이 귀환 (오브젝트가 곧 나오면 기다린다)
  brain(g) {
    const S = Sim, m = S.min(g);
    ['B', 'R'].forEach(k => {
      const s = g.side[k], us = S.alive(g, k).filter(p => !p.recall && S.dist(p.pos, S.fountain(k)) > 20);
      s.plan = S.threat(g, k) ? 'DEFEND' : S.finish(g, k) ? 'END' : s.push && s.push.until > g.t ? 'SIEGE' : 'MAP';
      if (us.length < 2 || s.plan !== 'MAP' || g.fights.some(f => us.some(p => f.mem.has(p)))) return;
      const hp = us.reduce((a, p) => a + p.hp, 0) / us.length, oom = us.filter(p => p.mpMax && p.mpCur < p.mpMax * .2).length;
      const soon = ['drag', 'baron', 'herald'].some(o => { const ob = g.obj[o]; return ob && ob.at && (!ob.until || g.t < ob.until) && ob.at - g.t < 40 && ob.at - g.t > -60; });
      const safe = !us.some(p => S.near(g, S.other(k), p.pos, 20).length);
      if (m >= 6 && !soon && safe && (hp < .5 || oom >= 3) && g.t - (s.reset2 || -99) > 60) { s.reset = g.t; s.reset2 = g.t; s.plan = 'RESET'; }
    });
  },
  // 접촉 (1초마다): 평타 사거리 안에 보이는 적이 들어오면 그냥 지나치지 않는다 — 친다(견제). 맞은 쪽은 싸우거나 물러난다. 둘 다 이길 만하면 교전
  //   (예전에는 마주침을 5.5 안에서만 보고, 그마저 확률로 '대치'로 넘겨 사거리 안에서 서로 요리조리 움직이기만 하는 장면이 있었다 — 베타 피드백)
  CONTACT_GO: .9,
  contact(g) {
    const S = Sim, m = S.min(g); if (g.t < 100 || g.over) return;
    const busy = S.busySet(g), free = p => !p.dead && !p.recall && !p.tpCh && !p.fled && !busy.has(p) && !((p.cc || 0) > g.t);
    const order = g.r() < .5 ? g.pl : g.pl.slice().reverse();   /* 매초 어느 쪽부터 볼지 섞는다 */
    for (const a of order) {
      if (!free(a) || a.hp < .3 || (a.cT || 0) > g.t || S.danger(g, a.side, a.pos, 0)) continue;
      const foes = g.pl.filter(q => q.side !== a.side && free(q) && S.dist(q.pos, a.pos) <= a.rng + .3 && Rift.los(a.pos, q.pos) && this.known(g, a.side, q)
        && !(m < 14 && S.inLane(a) && S.inLane(q) && S.LANE_OF[a.role] === S.LANE_OF[q.role]));   // 라인전 맞상대는 견제(laneTick)에서
      if (!foes.length) continue;
      const v = foes.sort((x, y) => x.hp - y.hp)[0];
      if (v.hold && v.hold.until > g.t + 1 && S.dist(v.hold.to, a.pos) > S.dist(v.pos, a.pos)) continue;   /* 이미 물러나는 중이면 쫓지 않는다 */
      a.cT = g.t + 4;
      this.deal(g, a, v, this.frac(a, v, this.autoRaw(a, v)) * .6 * this.mul(g, a, v), null, { floor: .4 }); a.hitTo = v; a.hitAt = g.t;   /* 한두 대 (견제로는 40% 아래로 안 깎는다) */
      if (S.dist(a.pos, v.pos) <= v.rng + .3) this.deal(g, v, a, this.frac(v, a, this.autoRaw(v, a)) * .5 * this.mul(g, v, a), null, { floor: .4 });
      const at = [(a.pos[0] + v.pos[0]) / 2, (a.pos[1] + v.pos[1]) / 2];
      const A = S.near(g, a.side, at, 12).filter(free), Bv = S.near(g, v.side, at, 12).filter(free);
      const home = k => ['top', 'mid', 'bot'].some(l => /nexus|inhib/.test(S.structOf(g, k, l).kind) && S.dist(S.structOf(g, k, l).pos, at) < 20);
      const eA = this.pWin(g, A, Bv.filter(q => this.known(g, a.side, q))), eV = this.pWin(g, Bv, A.filter(q => this.known(g, v.side, q)));
      // 확실히 강한 쪽만 들어간다 (교전 성향 · 이니쉬 능력치). 비슷하면 약한 쪽이 거리를 벌린다 — 사거리 안에서 그냥 서 있지 않는다
      const ag = k => ({ safe: .05, norm: 0, aggr: -.05 })[g.side[k].ins.aggr] || 0, eng = ps => ps.reduce((s, q) => s + this.A(q, 'engage') + this.A(q, 'crack') * .5, 0) * .02;
      const edge = (us, them) => us.length > them.length || Math.min(...them.map(q => q.hp)) < .5;   /* 끊기는 인원 우위나 빈사 상대가 있을 때만 (골드 차이만으로는 아니다) */
      const goA = eA >= this.CONTACT_GO + ag(a.side) - eng(A) && edge(A, Bv), goV = eV >= this.CONTACT_GO + ag(v.side) - eng(Bv) && edge(Bv, A);
      if (!goA && !goV) { const [ps, k] = eA < eV ? [A, a.side] : [Bv, v.side]; if (!home(k)) ps.forEach(q => S.retreat(g, q, 12)); continue; }
      // 밀리는 쪽은 보자마자 빠진다. 잡히는 건 강한 쪽에 붙을 수단(돌진기 · 묶기)이 준비됐거나 약한 쪽이 맵을 못 볼 때
      { const [hs, ws, wk] = goA ? [A, Bv, v.side] : [Bv, A, a.side];
        if (!home(wk)) {
          const tool = hs.some(q => this.kit(q).some(x => (['dash', 'init'].includes(x.kind) || ['stun', 'up', 'pull'].includes(x.cc)) && this.ready(g, q, x) && this.range(q, x) >= S.dist(q.pos, ws[0].pos)));
          const catchP = .06 + (tool ? .14 : 0) - ws.reduce((s2, q) => s2 + this.A(q, 'mapAwareness'), 0) / Math.max(1, ws.length) * .12 + (ws.some(q => (q.slow || 0) > g.t) ? .15 : 0);
          ws.forEach(q => S.retreat(g, q, 14));
          if (g.r() > catchP) continue;
        } }
      const lane = ['top', 'mid', 'bot'].sort((x, y) => S.distLane(at, x) - S.distLane(at, y))[0];
      S.fightAt(g, at, 12, { where: home('B') || home('R') ? '본진' : S.distLane(at, lane) < 6 ? S.laneKo(lane) : '정글' });
    }
  },
  // ---------- 팀 운영 (5초마다) ----------
  // 전술은 명령이 아니라 성향: 고른 운영 구도는 '본대를 떠나 사이드에 답하러 가는 문턱'을 움직일 뿐이다.
  //   사이드에서 상대가 우리 포탑을 칠 때(1~2명) — 막을 수 있는 선수를 보낸다 / 못 막으면 반대편에서 이득을 챙긴다(교환) / 정말 가치가 없으면 내준다
  //   점수 = 지킬 건물 가치 × 위급함  vs  보내는 비용(인원 × 이동 시간 × 운영 구도 성향 × 곧 나올 오브젝트)
  SETUP_COST: { five: 2, '14': .8, '131': .65 },
  structVal(st) { return st.kind === 'inhib' ? 3.2 : st.kind === 'tower' ? [1, 1.6, 2.3][st.i] : 4; },
  objSoon(g, k) { return ['drag', 'baron', 'herald'].some(o => { const ob = g.obj[o]; return ob && ob.at && (!ob.until || g.t < ob.until) && ob.at - g.t < 60 && (o !== 'baron' || Sim.min(g) >= 20); }); },
  macro(g) {
    const S = Sim, m = S.min(g); if (m < 12) return;
    (g.r() < .5 ? ['B', 'R'] : ['R', 'B']).forEach(k => {
      const s = g.side[k], o = S.other(k), prev = s.asg || {}; s.asg = {};
      if (S.threat(g, k) || S.finish(g, k)) return;   // 본진 위기 · 끝낼 기회는 다 같이 (구버전 규칙)
      const busy = S.busySet(g), used = new Set();
      for (const lane of S.LANES3) {
        const st = S.structOf(g, k, lane); if (!st || (st.kind === 'nexus' && lane !== 'mid')) continue;   /* 쌍둥이 · 넥서스도 (넥서스는 한 번만) */
        const atk = S.alive(g, o).filter(q => !q.recall && S.dist(q.pos, st.pos) < 18);
        if (!atk.length || atk.length > 2) continue;   // 3명 이상이면 본대 공성: 수비 규칙(defendSpot) 몫
        const here = S.alive(g, k).filter(q => !q.recall && S.dist(q.pos, st.pos) < 16);
        if (here.length && this.pWin(g, here, atk, .6) >= .5) continue;   // 이미 막고 있다
        const base = /nexus/.test(st.kind);
        const val = this.structVal(st) * (atk.some(q => q.hp > .6) ? 1 : .8);
        const tf = (this.SETUP_COST[s.ins.setup] ?? 1) * (this.objSoon(g, k) ? 2 : 1) * (s.push && s.push.until > g.t ? 1.5 : 1);
        const soonO = this.objSoon(g, k), cands = S.alive(g, k).filter(q => !q.recall && !q.tpCh && !busy.has(q) && !used.has(q) && !here.includes(q) && S.dist(q.pos, st.pos) < 80 && !(soonO && S.objFor(g, q, m)))
          .map(q => ({ q, sc: S.dist(q.pos, st.pos) / 2.4 - this.A(q, 'splitPush') * 10 - this.A(q, 'rotation') * 4 - (['bruiser', 'tank', 'dive'].includes(q.kind) ? 6 : 0) - ((Style.of(q.c) || {}).split || .4) * 10
            + (q.role === 'SUP' ? 18 : q.role === 'JGL' ? 6 : 0) + (prev[q.p.id] && prev[q.p.id].lane === lane ? -25 : 0) }))
          .sort((x, y) => x.sc - y.sc).map(x => x.q);
        const pick = [];
        for (const c of cands) { pick.push(c); if (this.pWin(g, [...here, ...pick], atk, .6) >= .55 || pick.length >= atk.length + 1) break; }
        const pw = pick.length ? this.pWin(g, [...here, ...pick], atk, .6) : 0, eta = pick.length ? Math.max(...pick.map(q => S.dist(q.pos, st.pos))) / 2.4 : 99;
        const cost = tf * pick.length * (eta > 35 ? 1.6 : 1) * (1 - this.A(pick[0] || {}, 'mapAwareness') * .15);
        if (pick.length && (pw >= .45 || base) && (val * 1.6 >= cost || base)) {   /* 본진은 무조건 */
          pick.forEach(q => { used.add(q); s.asg[q.p.id] = { lane, kind: 'def', until: g.t + 15 }; q.goal = this.defSpot(g, q, lane); q.hold = null; });
          if (!prev[pick[0].p.id] && g.t - (s.defSay || -99) > 180 && g.r() < .5) { s.defSay = g.t; const n = pick[0].name; S.say(g, 'cast', g.r() < .5 ? `${S.josa(n, '이', '가')} ${S.laneKo(lane)} 포탑을 막으러 가는 것 같습니다.` : `${g.side[k].t.short}, ${S.laneKo(lane)} 포탑을 그냥 주지 않습니다. ${n} 이동합니다.`); }
          continue;
        }
        // 막을 수 없으면 반대편에서 이득 (교환): 스플릿 하나가 빠진 만큼 나머지가 숫자에서 앞설 때
        if (m >= 14 && !(s.push && s.push.until > g.t) && !this.objSoon(g, k) && !Sim.objUp(g, 'baron')) {
          const rest = S.alive(g, o).filter(q => !atk.includes(q)), us = S.alive(g, k).filter(q => !q.recall && !used.has(q));
          const l2 = S.LANES3.filter(l => l !== lane).map(l => ({ l, st: S.structOf(g, o, l) })).filter(x => !/nexus/.test(x.st.kind)).sort((a2, b2) => S.dist(a2.st.pos, this.cen(us)) - S.dist(b2.st.pos, this.cen(us)))[0];
          if (l2 && us.length >= 3 && this.pWin(g, us, rest.filter(q => this.known(g, k, q) || g.r() < .6)) >= .5) {
            s.push = { lane: l2.l, until: g.t + 45 }; s.trade = g.t;
            if (g.t - (s.trSay || -99) > 240 && g.r() < .5) { s.trSay = g.t; S.say(g, 'cast', `${s.t.short}, 상대 스플릿은 두고 ${S.laneKo(l2.l)} 쪽에서 이득을 챙기러 갑니다.`); }
          }
        }
      }
    });
  },
  cen(ps) { return ps.length ? [ps.reduce((a, p) => a + p.pos[0], 0) / ps.length, ps.reduce((a, p) => a + p.pos[1], 0) / ps.length] : [50, 50]; },
  defSpot(g, p, lane) { const st = Sim.structOf(g, p.side, lane), q = Sim.toward(st.pos, p.side, 3); return Sim.clampP([q[0] + p.off[0] * .5, q[1] + p.off[1] * .5]); },
  // 목적지: 팀 운영이 맡긴 일이 있으면 그것, 아니면 구버전 운영(포지션 · 운영 구도 성향)
  target(g, p, m, old) {
    const a = (g.side[p.side].asg || {})[p.p.id];
    if (a && a.until > g.t && !Sim.threat(g, p.side)) return this.defSpot(g, p, a.lane);
    const amb = g.side[p.side].amb; if (amb && amb.id === p.p.id && amb.until > g.t && !Sim.threat(g, p.side)) return amb.at;
    return old(g, p, m);
  },
  // ---------- 공성 (미니언 없이 포탑을 칠지): 포탑 피해를 넣은 예측으로 ----------
  //   포탑 몫 = 수비 쪽 힘 보정 (미니언이 받아 주면 작다). 본진 앞은 오래 기다리면 문턱이 내려가고, 90초가 지나도 못 들어가면 빠진다
  siegeGo(g, m, k, st) {
    const S = Sim;
    if (m < 14 || !['tower', 'nexusT', 'inhib', 'nexus'].includes(st.kind)) return false;
    if (S.objUp(g, 'baron') && S.baronCall(g, k) && !/nexus/.test(st.kind)) return false;
    const o = S.other(k), nx = /nexus/.test(st.kind), W = (g.nxW ||= {});
    const atk = S.alive(g, k).filter(p => !p.recall && !p.tpCh && S.dist(p.pos, st.pos) <= (nx ? 16 : 14) && p.hp > .35), def = S.alive(g, o).filter(p => !p.recall && S.dist(p.pos, st.pos) <= 16);
    if (nx) { if (!W[k] || g.t - W[k].last > 15) W[k] = { t0: g.t }; W[k].last = g.t; }
    const wait = nx ? g.t - W[k].t0 : 0;
    const giveUp = () => { W[k] = { t0: g.t, last: 0, give: g.t + 60 }; S.alive(g, k).filter(p => S.dist(p.pos, st.pos) <= 30).forEach(p => S.retreat(g, p, 24)); };
    if (atk.length < 2) return false;
    const tanked = S.minNear(g, k, st.pos, S.TW_R + .5).reduce((a, w) => a + w.n, 0) >= 2;
    const tw = (tanked ? .25 : .75) * (st.kind === 'nexusT' || st.i >= 1 ? 1.15 : 1);
    const pw = this.pWin(g, atk, def, -tw), ag = ({ safe: .05, norm: 0, aggr: -.05 })[g.side[k].ins.aggr] || 0;
    const need = (nx ? .55 : .62) - (nx && wait >= 40 ? .08 : 0) + ag - atk.reduce((a, p) => a + this.A(p, 'objective'), 0) / atk.length * .04;
    const go = pw >= need || (!def.length && atk.length >= 3);
    if (!go) { if (nx && (wait >= 90 || (wait >= 15 && pw < .25))) giveUp(); return false; }
    const front = ['tank', 'bruiser', 'dive'];
    atk.forEach(p => { const d = S.dist(p.pos, st.pos) || 1, r = front.includes(p.kind) ? 2.2 : 4.6; p.dive = g.t + 2; p.hold = { to: S.clampP([st.pos[0] + (p.pos[0] - st.pos[0]) / d * r, st.pos[1] + (p.pos[1] - st.pos[1]) / d * r]), until: g.t + 2 }; });
    if (!g.siegeSaid || g.t - g.siegeSaid > 60) { g.siegeSaid = g.t; if (g.r() < .6) S.line(g, 'siegeDive', { t: g.side[k].t.short }); }
    return true;
  },
  // ---------- 강타 ----------
  //   오브젝트 체력이 강타 피해 아래로 내려오면 우리 정글이 강타로 마무리한다. 상대 정글이 둥지 곁(10 안)에 있으면 스틸을 노린다
  //   (우리 강타가 빠졌으면 크게, 아니면 강타 능력치 싸움 · 근처에서 싸우는 중이면 조금 더)
  smiteDmg(p) { return [600, 900, 1200][Math.min(2, typeof JunglePet !== 'undefined' ? JunglePet.stage(p) : 0)]; },
  canSmite(g, p, pit) { return p && !p.dead && !p.recall && !p.tpCh && !((p.cc || 0) > g.t) && typeof Spells !== 'undefined' && Spells.ready(g, p, 'Smite') && Sim.dist(p.pos, pit) < 10 && Rift.los(p.pos, pit); },
  objHit(g, o, ps, old) {
    let d = old(g, o, ps); if (!ps.length || typeof Spells === 'undefined') return d;
    const S = Sim, k = ps[0].side, ob = g.obj[o], pit = Rift.pos(S.PIT[o]), R0 = S.objNeed(g, o) - (ob.prog[k] || 0);
    const jg = g.pl.find(q => q.side === k && q.role === 'JGL'), en = g.pl.find(q => q.side !== k && q.role === 'JGL');
    const mine = this.canSmite(g, jg, pit) && R0 <= this.smiteDmg(jg), theirs = this.canSmite(g, en, pit) && R0 <= this.smiteDmg(en);
    if (!mine && !theirs) return d;
    const fight = g.fights.some(f => S.dist(f.at, pit) < 22);
    if (theirs) {
      const ch = mine ? .06 + this.A(en, 'smite') * .12 - this.A(jg, 'smite') * .06 + (fight ? .06 : 0) : .3 + this.A(en, 'smite') * .2 + (fight ? .1 : 0);
      if (g.r() < ch) { Spells.use(g, en, 'Smite', pit); g._steal = { o, thief: en }; return R0 + 1; }
    }
    if (mine && g.r() < .88 + this.A(jg, 'smite') * .1) {
      Spells.use(g, jg, 'Smite', pit);
      if ((theirs || fight) && g.r() < .6) S.say(g, 'cast', `${S.josa(jg.name, '이', '가')} 강타로 ${S.josa(S.OBJ[o], '을', '를')} 지켜 냅니다!`);
      return R0 + 1;
    }
    return d;
  },
  objAward(g, o, wk, t0, old) { const st = g._steal && g._steal.o === o ? g._steal.thief : null; g._steal = null; return old(g, o, wk, st || t0); },
  // 오브젝트 한타: 구버전은 둥지 앞에서 싸우는 동안 아무도 오브젝트를 치지 않았다. 이제 그 싸움에서 앞서는 쪽은 1~2명(정글 먼저)이 계속 치고, 강타로 마무리를 노린다
  objFight(g) {
    const S = Sim;
    for (const o of ['drag', 'baron', 'herald', 'grubs']) {
      if (!S.objUp(g, o) || g.over) continue;
      const ob = g.obj[o], pit = Rift.pos(S.PIT[o]), f = g.fights.find(x => S.dist(x.at, pit) < 22); if (!f) continue;
      const mem = [...f.mem].filter(p => !p.dead && !p.fled), B = mem.filter(p => p.side === 'B'), R = mem.filter(p => p.side === 'R'); if (!B.length && !R.length) continue;
      const pB = this.pWin(g, B, R);
      for (const [k, us, pw] of [['B', B, pB], ['R', R, 1 - pB]]) {
        if (pw < .55 && us.length) continue;
        const hs = S.alive(g, k).filter(p => !p.recall && !((p.cc || 0) > g.t) && S.dist(p.pos, pit) < 10 && Rift.los(p.pos, pit)).sort((a, b) => (b.role === 'JGL') - (a.role === 'JGL')).slice(0, 2);
        if (!hs.length) continue;
        ob.prog[k] = (ob.prog[k] || 0) + S.objHit(g, o, hs) * .7; (ob.hitT ||= {})[k] = g.t;
        if (ob.prog[k] >= S.objNeed(g, o)) { S.objAward(g, o, k); break; }
      }
    }
  },
  // ---------- 매복 ----------
  //   혼자 사이드 · 정글에 있는 상대 곁, 상대가 못 보는 부쉬에 정글(중반부터는 서폿도)이 숨어 기다린다. 다가오면 덮친다 (맵 리딩이 좋으면 눈치채고 빠진다)
  ambushPlan(g) {
    const S = Sim, m = S.min(g); if (m < 9 || typeof Vision === 'undefined') return;
    ['B', 'R'].forEach(k => {
      const s = g.side[k], o = S.other(k);
      if (s.amb && s.amb.until > g.t) return; s.amb = null;
      if (this.objSoon(g, k) || S.threat(g, k) || (s.push && s.push.until > g.t)) return;
      const busy = S.busySet(g), ag = ({ safe: .6, norm: 1, aggr: 1.4 })[s.ins.aggr] || 1;
      const hs = S.alive(g, k).filter(p => (p.role === 'JGL' || (p.role === 'SUP' && m >= 14)) && p.hp > .6 && !p.recall && !busy.has(p) && !(s.asg || {})[p.p.id] && !S.objFor(g, p, m));
      for (const h of hs) {
        if (g.r() > .25 * ag * (1 + this.A(h, 'pathing') * .4)) continue;
        const vs = S.alive(g, o).filter(v => !v.recall && this.known(g, k, v) && !S.alive(g, o).some(q => q !== v && S.dist(q.pos, v.pos) < 15) && !S.danger(g, k, v.pos, 3) && S.dist(v.pos, h.pos) < 45);
        for (const v of vs) {
          const fo = S.fountain(o), bush = Vision.BUSH.filter(([x, y]) => { const b = [x, y], d = S.dist(b, v.pos); return d >= 4 && d <= 12 && !Vision.lit(g, o, b) && !Vision.seen(g, o, b) && S.dist(b, h.pos) < 40; })
            .sort((a, b) => (S.dist(a, v.pos) + S.dist(a, h.pos) * .3 - (S.dist(a, fo) < S.dist(v.pos, fo) ? 3 : 0)) - (S.dist(b, v.pos) + S.dist(b, h.pos) * .3 - (S.dist(b, fo) < S.dist(v.pos, fo) ? 3 : 0)))[0];
          if (!bush) continue;
          s.amb = { id: h.p.id, v: v.p.id, at: [bush[0], bush[1]], until: g.t + 30 }; h.goal = s.amb.at; h.hold = null;
          return;
        }
      }
    });
  },
  ambushTick(g) {
    const S = Sim;
    ['B', 'R'].forEach(k => {
      const s = g.side[k], a = s.amb; if (!a) return;
      const h = g.pl.find(p => p.p.id === a.id), v = g.pl.find(p => p.p.id === a.v);
      if (!h || !v || h.dead || v.dead || v.recall || a.until <= g.t || g.fights.some(f => f.mem.has(h))) { s.amb = null; return; }
      if (S.dist(h.pos, a.at) > 2.2 || S.dist(v.pos, h.pos) > 7.5 || !Rift.los(h.pos, v.pos)) return;
      if (typeof Vision !== 'undefined' && Vision.seen(g, v.side, h.pos)) { s.amb = null; return; }   // 들켰다
      s.amb = null;
      if (g.r() < .12 + this.A(v, 'mapAwareness') * .2) { S.retreat(g, v, 14); return; }   // 눈치채고 빠진다
      v.cc = Math.max(v.cc || 0, g.t + .8); v.slow = g.t + 2; h.hold = { to: [...v.pos], until: g.t + 2 }; h.dash = g.t + 1;
      const f = S.fightAt(g, [(h.pos[0] + v.pos[0]) / 2, (h.pos[1] + v.pos[1]) / 2], 10, { where: '매복' });
      if (f && g.r() < .8) S.say(g, 'cast', `매복! ${S.josa(h.name, '이', '가')} 부쉬에서 ${S.josa(v.name, '을', '를')} 덮칩니다!`);
    });
  },
  // 매초 (Sim.step 뒤)
  tick(g) { this.see(g); this.ambushTick(g); this.contact(g); this.objFight(g); if (g.t % 5 === 0) { this.brain(g); this.macro(g); this.ambushPlan(g); } },
  // 10초마다 (Sim.decide 앞): 수행력 다시 계산 (시기 곡선 · 조합 시기 · 클러치)
  tick10(g) { g.pl.forEach(p => this.exeOf(g, p)); },
};

// 엔진에 붙이기: 켠 경기(g.v2)에서만 v2로, 아니면 구버전 그대로 (맨 마지막에 붙어 다른 확장보다 바깥에서 고른다)
(() => {
  if (typeof Sim === 'undefined') return;
  const W = (name, fn) => { if (!Sim[name]) return; const old = Sim[name].bind(Sim); Sim[name] = (...a) => fn(old, ...a); };
  W('create', (old, ...a) => { const g = old(...a); if (g && g.pl && Sim2.on()) Sim2.init(g); return g; });
  W('fightTick', (old, g) => g.v2 ? Sim2.fightTick(g) : old(g));
  W('tpow', (old, g, k, who) => g.v2 ? Sim2.tpow(g, k, who) : old(g, k, who));
  W('encounter', (old, g, m) => g.v2 ? Sim2.encounter(g, m) : old(g, m));
  W('laning', (old, g, m) => g.v2 ? Sim2.laning(g, m) : old(g, m));
  W('prio', (old, g, p, m) => g.v2 ? Sim2.prioAdj(g, p, m, old(g, p, m)) : old(g, p, m));
  W('csGive', (old, g, ...a) => g.v2 ? Sim2.csGive(g, ...a) : old(g, ...a));
  W('ultReady', (old, g, p) => g.v2 ? !p.dead && !p.recall && !p.tpCh && p.lvl >= 6 && g.t >= ((p.cd2 || {}).R || 0) : old(g, p));
  W('useUlt', (old, g, p) => { if (!g.v2) return old(g, p); p.cd2.R = g.t + Sim2.cdReal(p, 'R'); p.ultAt = p.cd2.R; });
  W('target', (old, g, p, m) => g.v2 ? Sim2.target(g, p, m, old) : old(g, p, m));
  W('siegeGo', (old, g, m, k, st) => g.v2 ? Sim2.siegeGo(g, m, k, st) : old(g, m, k, st));
  W('objHit', (old, g, o, ps) => g.v2 ? Sim2.objHit(g, o, ps, old) : old(g, o, ps));
  W('objAward', (old, g, o, wk, t0) => g.v2 ? Sim2.objAward(g, o, wk, t0, old) : old(g, o, wk, t0));
  W('decide', (old, g, m) => { if (g.v2) Sim2.tick10(g, m); return old(g, m); });
  W('step', (old, g) => { old(g); if (g.v2 && !g.over) Sim2.tick(g); });
  if (typeof Kits !== 'undefined') { const kt = Kits.tick.bind(Kits); Kits.tick = g => g.v2 ? Sim2.laneTick(g) : kt(g); }
})();

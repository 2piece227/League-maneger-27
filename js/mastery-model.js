// 챔피언 숙련도 모델 (0~20)
//
// 숙련도 경험치(XP) 하나를 쌓는다. 단계가 오를수록 다음 단계에 필요한 XP가 지수적으로 커진다.
//   단계 = A · ln(1 + XP / K)        ↔   필요 XP = K · (e^(단계/A) − 1)
// - 솔랭 1판은 XP가 극히 적다 (솔랭 100판 ≈ 4단계, 300판 ≈ 7단계).
// - 대회 1판은 솔랭의 수십 배지만, 상위 단계는 그마저도 수십 판이 필요하다.
// - 시그니처(18+)는 수년간 대회에서 꺼내고 이겨야 닿는 단계. 20은 사실상 전설.
//
// 선수 특성(추후)은 mods로 XP 배율을 바꾼다. 예) 장인 { proMul: 1.2 }, 연습벌레 { soloMul: 1.5 }
const MasteryModel = {
  A: 3.83,
  K: 10,
  SOLO_XP: 0.2,   // 솔랭 1판
  PRO_XP: 16,     // 대회 1판 (경기력 계수 0.6~1.4 곱함)
  MAX: 20,

  // 실제 솔랭 기록이 없으므로 대회에서 꺼낸 챔피언은 그만큼 솔랭으로도 연습했다고 추정한다.
  // TODO: 기능 연결 — 게임 안 솔랭·스크림 시뮬레이션 결과로 누적
  estSoloGames(proGames) { return 30 + proGames * 8; },

  // 경기력 계수: 승률(표본 보정)과 KDA
  perf(g, w, k, d, a) {
    const wr = (w + 5) / (g + 10);
    const kda = (k + a) / Math.max(1, d);
    return Math.max(0.6, Math.min(1.4, 1 + (wr - 0.5) * 1.6 + Math.max(-0.2, Math.min(0.2, (kda - 3) * 0.07))));
  },

  xpOf(e, mods = {}) {
    const solo = e.solo != null ? e.solo : this.estSoloGames(e.g);
    return solo * this.SOLO_XP * (mods.soloMul || 1)
      + e.g * this.PRO_XP * this.perf(e.g, e.w, e.k, e.d, e.a) * (mods.proMul || 1);
  },
  level(xp) { return Math.min(this.MAX, this.A * Math.log1p(xp / this.K)); },
  xpFor(level) { return this.K * Math.expm1(level / this.A); },

  // e: { g, w, k, d, a, solo? } → { xp, value, level, next(0~1), need }
  calc(e, mods) {
    const xp = this.xpOf(e, mods);
    const value = this.level(xp);
    const level = Math.floor(value);
    if (level >= this.MAX) return { xp, value, level, next: 1, need: 0 };
    const lo = this.xpFor(level), hi = this.xpFor(level + 1);
    return { xp, value, level, next: (xp - lo) / (hi - lo), need: Math.ceil(hi - xp) };
  },

  // 시그니처: 숙련도 18 이상, 선수당 최대 2개
  SIG_MIN: 18,
  SIG_MAX: 2,
};

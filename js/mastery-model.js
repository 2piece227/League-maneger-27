// 챔피언 숙련도 모델 (0~20)
//
//   숙련도 = 솔랭 숙련(최대 10) + 대회 숙련(최대 10)
//   - 솔랭: 판수에 따라 1 - e^(-x/k) 곡선. 처음엔 빠르게 오르지만 10 근처에서 멈춘다.
//   - 대회: 대회 경험치(판수 × 경기력)로만 오르고, 마찬가지로 갈수록 느려진다.
//   → 솔랭만으로는 5~10까지는 쉽게 가지만, 그 이상은 대회 경험을 먹어야 조금씩 오른다.
//
// 선수 특성(추후 추가)은 mods로 곡선 계수를 바꾼다.
//   예) 장인: proCap +1 · 메타 적응: soloK 감소(빨리 익힘) · 넓은 챔피언 폭: proK 감소
const MasteryModel = {
  SOLO_CAP: 10,
  PRO_CAP: 10,
  SOLO_K: 40,   // 솔랭 약 40판이면 솔랭 숙련의 63%
  PRO_K: 35,    // 대회 경험치 35면 대회 숙련의 63%

  // 실제 솔랭 기록이 없으므로, 대회에서 꺼낸 챔피언은 그만큼 솔랭으로도 연습했다고 추정한다.
  // TODO: 기능 연결 — 게임 안 솔랭·스크림 시뮬레이션 결과로 누적
  estSoloGames(proGames) { return 30 + proGames * 8; },

  // 경기력 계수 0.6~1.4: 승률(표본 보정)과 KDA
  perf(g, w, k, d, a) {
    const wr = (w + 5) / (g + 10);
    const kda = (k + a) / Math.max(1, d);
    return Math.max(0.6, Math.min(1.4, 1 + (wr - 0.5) * 1.6 + Math.max(-0.2, Math.min(0.2, (kda - 3) * 0.07))));
  },

  curve(x, cap, k) { return cap * (1 - Math.exp(-Math.max(0, x) / k)); },

  // e: { g, w, k, d, a, solo? } → { solo, pro, total, proXp }
  calc(e, mods = {}) {
    const soloGames = e.solo != null ? e.solo : this.estSoloGames(e.g);
    const proXp = e.g * this.perf(e.g, e.w, e.k, e.d, e.a);
    const solo = this.curve(soloGames, this.SOLO_CAP + (mods.soloCap || 0), this.SOLO_K * (mods.soloK || 1));
    const pro = this.curve(proXp, this.PRO_CAP + (mods.proCap || 0), this.PRO_K * (mods.proK || 1));
    return { solo, pro, proXp, total: Math.min(20, solo + pro) };
  },

  // 시그니처: 리그 최상급 장인 챔피언 — 숙련도 19 이상 · 대회 20판 이상, 선수당 최대 2개
  SIG_MIN: 19,
  SIG_GAMES: 20,
  SIG_MAX: 2,
};

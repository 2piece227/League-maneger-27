// 게임 날짜. 커리어는 수집 데이터 기준일(START)에서 시작하고, 이후로는 App.state.date 가 진행된다.
// 연도·시즌은 모두 이 날짜에서 계산한다 (고정 연도 없음).
const Clock = {
  START: '2026-11-16', // 커리어 시작일: 2026 월즈 결승(11월 15일 한국 시간 새벽) 다음 날 = 스토브리그 첫날
  today() { return (typeof App !== 'undefined' && App.state && App.state.date) || this.START; },
  year(d = this.today()) { return +d.slice(0, 4); },
  // 계속 버튼(Engine.continue)이 하루씩 넘긴다
  set(ymd) { App.state.date = ymd; },
};

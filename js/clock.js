// 게임 날짜. 커리어는 수집 데이터 기준일(START)에서 시작하고, 이후로는 App.state.date 가 진행된다.
// 연도·시즌은 모두 이 날짜에서 계산한다 (고정 연도 없음).
const Clock = {
  START: '2026-11-10', // 데이터 기준일 = 커리어 시작일
  today() { return (typeof App !== 'undefined' && App.state && App.state.date) || this.START; },
  year(d = this.today()) { return +d.slice(0, 4); },
  // TODO: 기능 연결 — 계속 버튼으로 하루씩 진행
  set(ymd) { App.state.date = ymd; },
};

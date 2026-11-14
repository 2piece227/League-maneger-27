// 라이벌리: 정해진 팀 쌍. 점수(1~5, 0.5 단위)가 높을수록 경기 전후 반응이 크다.
// 쓰는 곳: 메시지함 이적 소식 필터(js/market.js) · 중요 경기 판정(티저, js/interviews.js) · 라이벌전 결과(팬·사기, js/season.js)
//          · 다음 경기 · 경기 중 표시 · 중계 첫 멘트 · 뉴스 제목과 커뮤니티 반응 · 구단 역사
const Rivalry = {
  LIST: [
    { a: 't1', b: 'gen-g', name: '롤 클라시코', alt: '강남 더비', score: 5, desc: 'LCK 최고 인기 구단과 최강 구단의 맞대결. 결승에서 몇 번이고 다시 만난 두 팀이다.' },
    { a: 'karmine-corp', b: 'movistar-koi', name: '피레네 더비', alt: '프랑스 vs 스페인', score: 5, desc: '피레네 산맥을 사이에 둔 프랑스와 스페인. 팬덤의 열기로는 LEC에서 가장 뜨거운 라이벌이다.' },
    { a: 'gen-g', b: 'dplus-kia', name: '북벌전', score: 4, desc: '정상을 지키려는 팀과 다시 올라서려는 팀. 만날 때마다 시즌 흐름이 바뀐다.' },
    { a: 't1', b: 'kt-rolster', name: '통신사 대전', score: 3.5, desc: '국내 두 통신사 구단의 오랜 맞대결. LCK 역사와 함께해 온 라이벌이다.' },
  ],
  of(a, b) { return this.LIST.find(r => (r.a === a && r.b === b) || (r.a === b && r.b === a)) || null; },
  forTeam(id) { return this.LIST.filter(r => r.a === id || r.b === id); },
  other(r, id) { return r.a === id ? r.b : r.a; },
  // 우리 팀의 라이벌 구단 id 목록
  mine() { const id = App.state.teamId; return id ? this.forTeam(id).map(r => this.other(r, id)) : []; },
  isRival(id) { return this.mine().includes(id); },
  // 별 다섯 칸: 꽉 찬 별 · 반 별(왼쪽만 칠한 별) · 빈 별
  stars(score) { const full = Math.floor(score), half = score - full >= .5; return '★'.repeat(full) + (half ? '<s>★</s>' : '') + '<i>' + '★'.repeat(5 - full - (half ? 1 : 0)) + '</i>'; },
  badge(r) { return r ? `<span class="rv-badge" title="${UI.esc(r.desc)}">⚔ ${UI.esc(r.name)} <b>${this.stars(r.score)}</b></span>` : ''; },
  // 경기 기준
  ofMatch(m) { return m && m.t1 && m.t2 ? this.of(m.t1, m.t2) : null; },

  // 우리 라이벌전이 끝난 뒤: 팬 · 선수단 분위기 (점수만큼 크게)
  after(m, series) {
    const my = App.state.teamId, r = this.ofMatch(m); if (!r || App.state.unemployed || (m.t1 !== my && m.t2 !== my)) return;
    const sc = Season.seriesScore(series), o = m.t1 === my ? m.t2 : m.t1, won = (sc[my] || 0) > (sc[o] || 0), k = r.score / 5;
    World.apply(won ? { fans: Math.round(3 * k + 1), moraleAll: r.score >= 4 ? 1 : 0 } : { fans: -Math.round(3 * k + 1), moraleAll: r.score >= 4.5 ? -1 : 0 }, { why: `${r.name} ${won ? '승리' : '패배'}` });
    const H = (App.state.rivalLog ||= {}), key = [r.a, r.b].join('|'), h = (H[key] ||= { w: 0, l: 0 }); won ? h.w++ : h.l++;
  },
  // 이 커리어에서의 맞대결 전적 (우리 기준)
  record(r) { const h = (App.state.rivalLog || {})[[r.a, r.b].join('|')]; return h || { w: 0, l: 0 }; },
};

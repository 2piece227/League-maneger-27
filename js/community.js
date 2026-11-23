// 선수별 감독 관계 · 커뮤니티 반응
//
// 관계(Rel): 선수마다 0~100 (처음 50 + 충성도). 사기를 건드리는 일(면담·약속·칭찬·질책·트레이드설…)마다 같이 움직인다.
//   경기력에는 아주 조금(사기와 같은 자리), 재계약·이적 요청에는 크게 (js/negotiate.js · 트레이드설).
// 커뮤니티: 뉴스를 열면 가상의 커뮤니티 반응이 달린다. 기사 종류와 등장 팀·선수에 맞춰 글을 고른다(같은 기사는 늘 같은 반응).
const Rel = {
  st() { return (App.state.relp ||= {}); },
  of(pid) { const s = this.st(); if (s[pid] == null) { const hit = Player.find(pid), loy = hit && ((hit.p.attributes || {}).hidden || {}).loyalty; s[pid] = Math.round(45 + ((loy || 11) - 11) * 1.2); } return s[pid]; },
  why: null,   // 지금 처리 중인 일 (메시지 제목 등). 관계 기록에 이유로 남는다
  add(pid, v, why) {
    if (!pid || !v) return; const s = this.st(), before = this.of(pid); s[pid] = Math.max(0, Math.min(100, before + v));
    const L = (App.state.relLog ||= {}), l = (L[pid] ||= []); l.push({ d: Clock.today(), v: Math.round((s[pid] - before) * 10) / 10, why: why || this.why || '' }); if (l.length > 8) l.shift();
  },
  log(pid) { return ((App.state.relLog || {})[pid] || []).slice().reverse(); },
  word(pid) { const v = this.of(pid); return v >= 80 ? '두터움' : v >= 60 ? '좋음' : v >= 40 ? '보통' : v >= 20 ? '서먹함' : '냉랭함'; },
  // OVR 보정 (사기와 같은 자리, ±0.5)
  ovr(pid) { return (this.of(pid) - 50) / 100; },
};
// 사기가 움직이면 관계도 같이 (World.apply 의 morale / moraleAll)
(() => {
  const apply = World.apply.bind(World);
  World.apply = (fx, ctx) => {
    const why = ctx && ctx.why;
    if (fx.morale && ctx && ctx.pid) Rel.add(ctx.pid, fx.morale * 3, why);
    if (fx.moraleAll && typeof Roster !== 'undefined' && Roster.team()) Roster.team().players.forEach(p => Rel.add(p.id, fx.moraleAll * 2, why));
    return apply(fx, ctx);
  };
})();

const Community = {
  // 가상의 커뮤니티 (실제 사이트 이름은 쓰지 않는다)
  SITES: [['롤마당', 'a'], ['협곡 갤러리', 'b'], ['인벤토리 게시판', 'c'], ['드래곤 광장', 'd'], ['e스포츠 라운지', 'e'], ['소환사 광장', 'f']],
  NICK_A: ['협곡', '바론', '정글', '미드', '탑', '원딜', '서폿', '와드', '용', '포탑', '한타', '솔랭', '월즈', '롤', '점멸', '귀환', '갱킹', '스틸', '라인', '미니언'],
  NICK_B: ['지박령', '장인', '요정', '러버', '박이', '충', '왕', '마스터', '고인물', '뉴비', '덕후', '중독', '전문가', '수호자', '도둑', '철학자', '평론가'],
  r(seed, k) { return G.rand(seed, 'cm' + k); },
  pick(seed, k, arr) { return arr[Math.floor(this.r(seed, k) * arr.length)]; },
  nick(seed, k) { const n = this.pick(seed, k + 'a', this.NICK_A) + this.pick(seed, k + 'b', this.NICK_B); return this.r(seed, k + 'n') < .3 ? n + Math.floor(this.r(seed, k + 'd') * 99 + 1) : n; },
  // 기사에서 팀 · 선수 찾기 (제목에 나오는 순서대로. 결과 기사는 앞 팀 점수가 앞)
  find(x) {
    const txt = x.title + ' ' + (x.body || ''), at = t => { const i = [txt.indexOf(t.short + ' '), txt.indexOf(t.short + ','), txt.indexOf(t.short + '·'), txt.indexOf(t.name)].filter(v => v >= 0); return i.length ? Math.min(...i) : -1; };
    const teams = App.db.teams.filter(t => at(t) >= 0).sort((a, b) => at(a) - at(b)), hit = x.pid && Player.find(x.pid);
    return { teams, p: hit ? hit.p : null, pt: hit ? hit.t : null };
  },
  // 지난 1년 리그 경기 승률이 리그 하위 절반이면 '부진'
  weakLast(t) {
    if (!t || !t.league || typeof Results === 'undefined' || !Results.list) return false;
    const from = Store.addDays(Clock.today(), -400), rate = id => { const ms = Results.list.filter(m => m.league === t.league && (m.t1 === id || m.t2 === id) && (m.kst || m.t || '').slice(0, 10) >= from && m.w); if (ms.length < 4) return null; return ms.filter(m => (m.w === 1 ? m.t1 : m.t2) === id).length / ms.length; };
    const mine = rate(t.id); if (mine == null) return false;
    const all = App.db.teams.filter(x => x.league === t.league).map(x => rate(x.id)).filter(v => v != null).sort((a, b) => b - a);
    return all.indexOf(mine) >= all.length / 2;
  },
  kind(x) {
    const t = x.title;
    if (x.hire) return 'hire';
    if (/^\[Thank you\]/.test(t)) return 'thanks';   // 계약 만료 작별 인사 (js/contract.js Lapse)
    if (/^\[패치\]/.test(t)) return 'patch';
    if (/^\[우승\]/.test(t)) return 'title';
    if (/^\[파이널 MVP\]/.test(t)) return 'fmvp';
    if (/^\[올프로\]/.test(t)) return 'allpro';
    if (/^\[LCK 어워드\]/.test(t)) return 'gala';
    if (/역풍|도발.*패배/.test(t)) return 'trashLose';
    if (/도발.*이겼|티저 화제/.test(t)) return 'trashWin';
    if (/트레이드/.test(t)) return /이적설|카드/.test(t) ? 'rumor' : 'trade';
    if (/결별/.test(t)) return 'fire';
    if (/방출/.test(t)) return 'release';
    if (/휴식/.test(t)) return 'rest';
    if (/^\[결과\]/.test(t)) return 'win';
    if (/입단|잔류|재계약|콜업|영입|이적했|떠나/.test(t)) return 'sign';
    if (/^\[FA\]/.test(t)) return 'fa';
    if (/이적설|관심설/.test(t)) return 'rumor';
    if (/솔랭/.test(t)) return 'soloq';
    if (/^\[분석\]/.test(t)) return 'analysis';
    return 'generic';
  },
  // 문장 틀. {w}이긴 팀 {l}진 팀 {t}주인공 팀 {o}상대/다른 팀 {p}선수 {role}포지션 {rv}라이벌전 이름 {c}챔피언 {nerf}너프된 챔피언 {buff}버프된 챔피언 {pog}POG {sc}스코어
  // 필요한 빈칸을 채울 값이 없으면 그 문장은 쓰지 않는다 (예전에는 '거기' · '그 선수' 같은 말로 채워져 어색했다)
  POOLS: {
    win: {
      neutral: ['{w} 운영 깔끔하네', '오늘 경기 재밌었다', '{l} 밴픽부터 말렸다', '{w} 정글 동선 좋더라', '{l} 한타 집중력 문제 있음', '이 정도면 {w} 우승 후보 맞다', '{l} 바텀 라인전 너무 말림', '{w} 후반 운영은 교과서네', '오브젝트 싸움에서 갈렸다', '{l} 초반 주도권은 좋았는데 굴리질 못하네', '용 앞 한타 하나로 끝났네', '{w} 밴픽 준비 잘해 왔다', '{l} 요즘 폼이 확실히 떨어졌다', '해설진 예상이 다 빗나갔네 ㅋㅋ', '{w} 미드 주도권이 컸다'],
      fanW: ['이게 {w}지 ㅋㅋㅋ', '{w} 폼 미쳤다 진짜', '오늘 치킨 시킨다', '{w} 팬이라 행복하다', '역시 믿고 보는 {w}', '이 기세로 끝까지 가자', '{w} 경기는 보는 맛이 있다', '오늘 하이라이트 몇 번째 돌려 보는지 모름', '다음 경기도 이렇게만 하자'],
      fanL: ['{l} 팬인데 오늘은 인정한다', '{l} 밴픽 누가 하냐', '{l} 정글 동선 누가 짰냐', '다음 경기 기대 안 함…', '{l} 오늘 커뮤 못 들어가겠다', '그래도 응원한다 {l}', '오늘 경기 다시 보기 싫다', '{l} 피드백 제대로 하고 와라', '이번 주는 그냥 잊자'],
      sweep: ['{sc} 완승이네', '{l} 한 세트도 못 따냈네', '{w} 상대로 실력 차이가 너무 났다', '깔끔한 {sc}'],
      close: ['풀세트 명경기였다', '마지막 세트 한타 하나로 갈렸네', '{l} 진짜 아깝다', '심장 쫄깃했다 오늘', '이 정도면 진 팀도 박수 받아야 함'],
      pog: ['POG {pog} 납득', '{pog} 오늘 미쳤다', '오늘은 {pog} 경기였다', '{pog} 폼 올라온 게 보인다', '{pog} 없었으면 졌다'],
      upset: ['이걸 {w}가 잡네 ㄷㄷ', '오늘 이변 맞지?', '{l} 순위 생각하면 충격패', '{w} 무시하면 안 되겠다'],
    },
    rivalWin: ['{rv} 승자는 {w}', '{rv} 이겼으면 이번 주는 행복하다 ㅋㅋ', '{l} 팬들 오늘 조용하네 ㅋㅋㅋ', '{rv} 승리 기념 짤 만든다', '이래서 {rv}를 기다린다', '{l} 상대로는 지면 안 되지', '{rv} 직관 간 사람 부럽다', '오늘 {rv} 레전드 경기였음'],
    rivalLose: ['{rv}에서 지는 건 진짜 못 참겠다', '다른 경기는 몰라도 {rv}는 이겨야지', '{w} 팬들 신났네 아…', '{rv} 패배는 일주일 간다', '복수전 언제냐'],
    fmvp: {
      neutral: ['{p} 파엠 받을 만했다', '결승 {p} 미쳤다 진짜', '{p} 커리어 하이 찍었네', '파엠 이견 없음', '{p} 결승 체질이다', '{t} 우승 일등공신 {p}', '결승에서 저렇게 하는 게 진짜 클래스다'],
      fanW: ['{p} 사랑한다', '우리 {p} 파엠 ㅠㅠ', '{p} 연봉 올려 줘라 프런트야', '{p} 영구결번 가자'],
      fanL: ['{p} 결승에서 너무 잘하더라', '인정할 건 인정한다 {p} 잘했다'],
    },
    allpro: {
      neutral: ['{p} 1st 팀 당연하지', '올프로 이번엔 납득된다', '3rd 팀 선정은 좀 의문인데', '{role} 1st는 이견 없음', '올프로 뽑힌 애들 월즈에서도 보자', '{p} 시즌 내내 잘했다', '내 기준 1st는 따로 있다'],
      fanW: ['우리 팀 올프로 몇 명이냐 ㅋㅋ', '{p} 1st 팀 축하한다', '{t} 올프로 싹쓸이 가자'],
      fanL: ['우리 애들은 왜 없냐', '올프로 투표 다시 해라'],
    },
    gala: {
      neutral: ['올해의 선수 {p} 납득', '{p} 올해 진짜 미쳤었지', '신인상 누구냐 기대된다', '시상식 정장 다들 멋있네 ㅋㅋ', '올해 LCK 재밌었다', '내년에도 이런 시즌 보자', '올해의 감독상은 좀 의외다'],
      fanW: ['{p} 상 받는 거 보니 뿌듯하다', '{t} 올해 최고의 해였다'],
      fanL: ['내년엔 우리 차례다'],
    },
    title: {
      neutral: ['{t} 우승 ㅊㅊ!!!', '이번 시즌 MVP는 누구냐', '우승 축하합니다 고생했다', '솔직히 {t} 우승 예상한 사람?', '결승 진짜 명경기였다', '{t} 이번 시즌 내내 강했지', '이번 우승은 감독 공이 크다', '국제대회 가서도 이렇게만 하자'],
      fanW: ['{t} 왕조 다시 시작이다', '{t} 팬들 오늘 잠 못 잔다 ㅋㅋ', '눈물 난다 진짜', '{t} 응원한 보람 있다', '우승 굿즈 언제 나오냐'],
      fanL: ['준우승도 잘했다', '다음엔 우리 차례다', '결승 한타 하나가 아쉽다'],
    },
    join: ['{p} {t} 간다고? 개추', '{p} 연봉 얼마냐 ㄷㄷ', '{t} 이번 오프시즌 잘했다', '{p} 폼 돌아오면 무섭지', '이 영입 맞냐…', '{t} 팬인데 기대된다', '{role} 보강 제대로 했네', '{p} {t}랑 합 잘 맞을 듯', '{t} 프런트 일 잘하네', '{p}면 바로 주전이지', '{t} 이제 {role} 걱정은 끝', '{p} 이번 시즌 증명해야 한다', '{p} 어서 와라 환영한다'],
    stay: ['{p} 잔류 다행이다', '{t} 프런트 일 잘했다', '{p} 연봉 얼마 올려 줬냐 ㄷㄷ', '역시 {p}는 {t}에 있어야지', '{p} 남아 줘서 고맙다', '재계약 기간 길게 잡았네', '{t} 팬들 한숨 돌렸다'],
    // 작별 인사 (Thank you): 떠나는 선수에게 고마움 · 아쉬움 · 다음 행선지 궁금증. 그 팀 팬은 더 짠하게
    thanks: {
      neutral: ['{p} 고생 많았다', '{t}에서 보여 준 거 잊지 않는다', '{p} 다음 팀 어디 가려나', '{p} 실력이면 새 팀 금방 찾는다', 'Thank you 글 보니까 찡하네', '이별은 늘 아쉽다', '{p} 어디서든 응원한다', 'FA 시장에서 {p} 행선지가 제일 궁금함', '{p} 커리어 이제부터다', '{t} 작별 영상 잘 만들었더라', '{p} 데려갈 팀 줄 섰을 듯'],
      fanW: ['{p} 그동안 고마웠다 진짜…', '{t} 유니폼 입은 {p} 못 보는 거 실화냐', '{p} 덕분에 행복했다', '보내 주기 싫다 ㅠㅠ', '{p} 나중에 꼭 돌아와라', '{t} 프런트 대체자 제대로 구해라', '{p} 우리 상대로만 살살 해 줘', '{p}랑 같이 본 경기들 다 기억한다', '오늘은 {t} 팬 갤 조용하다…'],
    },
    // 핵심 선수 · 프랜차이즈 스타를 놓쳤을 때: 그 팀 팬이 프런트에 화낸다
    thanksStar: ['프런트 뭐 하냐 {p}를 보내?', '{p} 못 잡은 건 프런트 책임이다', '{t}의 상징을 이렇게 보내냐', '{p} 없는 {t}는 상상이 안 된다', '연봉 아끼다 팀 망한다', '단장 나와라 진짜', '이건 납득 못 함', '{t}에서 몇 년을 뛰었는데 이런 이별이냐', '{p}는 {t} 그 자체였다'],
    // 팀이 지난 시즌 부진했을 때: 떠나는 걸 이해하고, 따라가겠다는 팬도
    thanksWeak: ['솔직히 {t} 성적 보면 떠나는 게 맞다', '{p} 더 좋은 팀 가서 우승해라', '{p} 커리어 생각하면 이해한다', '{p} 가는 팀 응원하러 간다', '나도 {p} 따라 응원 팀 옮긴다 ㅋㅋ', '{t}에서 고생만 했다 이제 꽃길 걷자', '{p} 재능이 아까웠지', '{p} 탓 아니다 팀이 문제였다'],
    THANKS_REPLY: ['ㅠㅠ', '진짜 고마웠다', '인정', '좋은 데 가라', '눈물 난다', '잘 가라', '어디서든 응원한다', '이별은 언제나 싫다'],
    leave: ['{p} 잘 가라… 고마웠다', '{p} 떠나는 건 좀 슬프다', '{t} 팬인데 보내 주자', '{p} 새 팀에서 잘하길', '이적료 대박이네', '{t} 이제 {role}는 어쩌냐', '{p} 응원은 계속한다'],
    fa: ['{p} 어디 가냐 진짜', '제발 우리 팀 와라 {p}', '{p} 몸값 감당 가능한 팀 있나', '{p} 은퇴만 하지 마라', '{p} 데려오는 팀이 이번 시즌 무섭다', '{t}가 {p}를 잡았어야지', '{role} 급한 팀들 줄 서겠네', '{p} 해외 가는 거 아님?', '{t} 재정 문제인가'],
    rumor: ['찌라시 아니냐', '{p} 가면 진짜 슬플 듯', '이번엔 진짜일 것 같은데', '{t} 오피셜 언제 뜸?', '{p} 본인 방송에서 부정했다던데', '출처가 어디냐', '이런 소문 나오면 보통 진짜더라', '{t} 팬들 멘붕 오겠다', '기자 이름 보고 걸러라'],
    trade: ['{p} 맞교환이라니 충격', '양쪽 다 이득인 트레이드 같은데', '{t} 이번 트레이드 이해 안 됨', '트레이드 승자는 누구냐', '{p} 새 팀에서 잘하길', '이런 트레이드 오랜만이네', '{role} 맞교환이면 팀 색깔 바뀌겠다'],
    trashWin: ['말한 대로 했네 ㅋㅋㅋ', '도발하고 이기는 게 낭만이지', '{w} 티저 맛집', '상대 팀 팬들 조용하다 ㅋㅋ', '이래서 이스포츠 보는 거지', '{w} 선수들 입담도 실력이네'],
    trashLose: ['도발하고 졌네 ㅋㅋㅋㅋ', '티저 찍은 사람 반성해라', '이래서 입 털면 안 된다', '{l} 오늘 커뮤 못 들어가겠다', '다음엔 조용히 이기자', '상대 팀 선수 인터뷰 기대된다 ㅋㅋ'],
    rest: ['{p} 휴식이라니 아쉽다', '쉬고 와서 더 잘하면 됨', '{p} 이대로 은퇴는 아니겠지?', '제안이 마음에 안 들었나 보네', '{p} 정도면 기다려도 됨', '휴식기에 방송이라도 해 줘라'],
    release: ['{p} 방출이라니…', '{t} 결단 내렸네', '{p} 새 팀 금방 찾을 듯', '이건 좀 아쉽다', '{p} 그동안 고마웠다'],
    fire: ['감독 교체 타이밍 늦었다', '{t} 프런트 조급하다', '새 감독은 누구냐', '감독만의 문제는 아니었는데', '이번엔 제대로 된 사람 데려와라'],
    patch: ['{nerf} 너프 드디어 ㅋㅋ', '{nerf} 장인들 곡소리 들린다', '{nerf} 이제 대회에서 덜 보이겠네', '{buff} 버프면 대회에서 나오겠다', '{buff} 장인 행복회로 돌린다', '이번 패치 메타 바뀌겠다', '라이엇 밸런스팀 일 좀 해라', '버프 받은 챔프들 대회에서 나오나 보자', '이번 패치 프로들 반응 궁금하다', '패치 노트 짧네'],
    soloq: ['{p} 솔랭 1위 실화냐', '솔랭이랑 대회는 다르지', '{p} 폼 올라왔네', '방송 켜면 보러 간다', '솔랭 1위 지키는 게 제일 어렵다', '대회 앞두고 손 풀린 듯'],
    soloqAm: ['저 정도면 프로팀 데려가야지', '이 사람 누구냐 프로 지망생?', '아마추어가 1위면 프로들 뭐 하냐 ㅋㅋ'],
    analysis: ['{p} {c} 장인 인정', '{c} 밴 안 하면 진다', '이 통계 보니까 {p} 무섭다', '{c} 꺼내면 그 판은 끝', '상대 팀들 밴카드 하나 날아가겠다', '{p} {c}는 믿고 본다'],
    generic: ['오 이건 몰랐네', '기대된다', '이번 시즌 재밌겠다', '롤판 오늘도 평화롭다', '흠…', '정리 깔끔하다', '기사 빠르네'],
    hire: [],
  },
  // 대댓글: 어느 글에 달려도 어색하지 않은 맞장구 위주
  REPLY: ['ㄹㅇ', '인정', 'ㅋㅋㅋㅋㅋ', '반박 불가', '나도 그렇게 생각함', '이게 맞다', '좀 더 지켜보자', '결과로 증명하겠지', '추천 누르고 간다', '이 댓글 박제', '그건 좀 아닌 듯', '이 말이 정답'],
  AGO: ['방금', '3분 전', '12분 전', '27분 전', '1시간 전', '2시간 전', '5시간 전'],

  // 이적 기사 종류: 들어옴 · 남음 · 떠남
  signKind(x) { const t = x.title; return /재계약|잔류|옵션 행사/.test(t) ? 'stay' : /떠나|결별/.test(t) ? 'leave' : 'join'; },
  // 우리 경기 결과 기사면 저장된 경기 기록에서 POG · 순위 차이를 찾는다
  resultInfo(x, w, l) {
    const S = App.state.season || {}; if (!w || !l) return {};
    const hit = Object.values(S).find(r => r && [r.t1, r.t2].includes(w.id) && [r.t1, r.t2].includes(l.id) && (Schedule.all || []).some(m => m.t1 === r.t1 && m.t2 === r.t2 && m.t.slice(0, 10) === x.date));
    let pog = null;
    if (hit) { const c = {}; hit.games.forEach(g => { if (g.mvp) c[g.mvp] = (c[g.mvp] || 0) + 1; }); const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; const p = top && Player.find(top[0]); if (p) pog = p.p.name; }
    let upset = false;
    try { const cur = Results.current(w.league), rows = Results.table(w.league, cur.ids), iw = rows.findIndex(r => r.t.id === w.id), il = rows.findIndex(r => r.t.id === l.id); upset = iw >= 0 && il >= 0 && iw - il >= 4; } catch (e) {}
    return { pog, upset };
  },
  comments(x) {
    const seed = x.title + x.date; let k = this.kind(x); const F = this.find(x);
    if (k === 'sign') k = this.signKind(x);
    let w = F.teams[0], l = F.teams[1];
    const sc = x.title.match(/(\d+):(\d+)/); if (sc && F.teams.length >= 2 && +sc[1] < +sc[2]) [w, l] = [l, w];
    const t = k === 'leave' ? F.teams[0] || null : F.pt && F.pt.id !== 'free' ? F.pt : F.teams[0] || null, o = F.teams.find(y => y !== t) || null;
    const rv = F.teams.length >= 2 ? Rivalry.of(F.teams[0].id, F.teams[1].id) : null;
    const txt = x.title + ' ' + (x.body || '');
    const nerf = (Champions.list || []).find(c => txt.includes(c.name + ' ▼')), buff = (Champions.list || []).find(c => txt.includes(c.name + ' ▲')), cAny = (Champions.list || []).find(c => txt.includes(c.name));
    const R = k === 'win' ? this.resultInfo(x, w, l) : {}, n1 = sc ? Math.max(+sc[1], +sc[2]) : 0, n2 = sc ? Math.min(+sc[1], +sc[2]) : 0;
    const V = { w: w && w.short, l: l && l.short, t: t && t.short, o: o && o.short, p: F.p ? F.p.name : (x.title.match(/'([^']+)'/) || [])[1], role: F.p ? G.ROLE_KO[F.p.role] : null, rv: rv ? rv.name : null, c: cAny ? cAny.name : null, nerf: nerf && nerf.name, buff: buff && buff.name, pog: R.pog, sc: sc ? `${n1}:${n2}` : null };
    // 빈칸 바로 뒤 조사는 채운 값에 맞춘다 ({t}가 → T1이 · GEN이 / {rv}는 → 통신사 대전은)
    const J = { 은: ['은', '는'], 는: ['은', '는'], 이: ['이', '가'], 가: ['이', '가'], 을: ['을', '를'], 를: ['을', '를'], 과: ['과', '와'], 와: ['과', '와'], 이랑: ['이랑', '랑'], 랑: ['이랑', '랑'], 으로: ['으로', '로'], 로: ['으로', '로'] };
    const ok = s => [...s.matchAll(/\{(\w+)\}/g)].every(m => V[m[1]]);
    const fill = s => s.replace(/\{(\w+)\}(이랑|으로|은|는|이|가|을|를|과|와|랑|로)?(?=[\s.,!?…ㅋ]|$)/g, (m, key, j) => { const v = V[key]; return j ? Sim.josa(v, ...J[j]) : v; }).replace(/\{(\w+)\}/g, (m, key) => V[key]);
    // 문장 고르기: 종류별 풀 + 시점(중립 · 이긴 팀 팬 · 진 팀 팬) + 경기 사실(완승 · 풀세트 · POG · 이변) + 라이벌전이면 라이벌 팬 반응
    const P = this.POOLS[k] || this.POOLS.generic, lines = [];
    // 겹치지 않게: 풀을 기사마다 정해진 순서로 섞어 앞에서부터 n개
    const add = (arr, who, n) => { const cand = (arr || []).filter(ok).map((x, i) => [this.r(seed, who + 'o' + i), x]).sort((a, b) => a[0] - b[0]).map(e => e[1]); cand.slice(0, n).forEach(text => lines.push({ text, who })); };
    const heat = (rv ? 3 : 0) + (k === 'title' ? 3 : 0) + (F.p && (F.p.ovr || 0) >= 88 ? 2 : 0) + (Rivalry.mine().some(id => F.teams.some(y => y.id === id)) ? 1 : 0);
    const n = 6 + Math.min(6, heat) + Math.floor(this.r(seed, 'n') * 3);
    if (Array.isArray(P)) add(P, 'n', n);
    else { add(P.neutral, 'n', Math.ceil(n * .4)); add(P.fanW, 'w', Math.ceil(n * .25)); if (k !== 'title' || l) add(P.fanL, 'l', Math.ceil(n * .2)); }   // 우승 기사에 준우승 팀이 안 나오면 '준우승' 팬 글은 뺀다
    if (k === 'win') { if (sc && n2 === 0) add(P.sweep, 'sw', 1); if (sc && n2 > 0 && n1 - n2 === 1) add(P.close, 'cl', 2); if (R.pog) add(P.pog, 'pg', 2); if (R.upset) add(P.upset, 'up', 2); }
    if (k === 'soloq' && !F.p) add(this.POOLS.soloqAm, 'am', 2);
    if (k === 'thanks' && F.p && w) {   // 작별: 핵심 선수였나 · 팀이 부진했나
      const j = Fame.join && Fame.join[F.p.id], yrs = j ? Fmt.daysBetween(j, Clock.today()) / 365 : 0;
      const ov = F.p.ovr || 0, weak = this.weakLast(w), star = ov >= 88 || (yrs >= 3 && ov >= 80);
      // 부진한 팀을 떠나면 이해 · 응원 (팀의 얼굴급 슈퍼스타만 그래도 화낸다), 아니면 핵심 선수를 놓친 프런트에 화낸다
      if (weak && ov < 92) add(this.POOLS.thanksWeak, 'n', 4);
      else if (star) add(this.POOLS.thanksStar, 'w', 3 + (ov >= 92 ? 1 : 0));
    }
    if (rv && k === 'win') { add(this.POOLS.rivalWin, 'rw', 3); add(this.POOLS.rivalLose, 'rl', 2); }
    const used = new Set(), out = [];
    lines.forEach((L, i) => {
      const text = fill(L.text); if (used.has(text)) return; used.add(text);
      const fanT = L.who === 'w' || L.who === 'rw' ? w : L.who === 'l' || L.who === 'rl' ? l : null;
      const site = fanT && this.r(seed, 'fs' + i) < .55 ? [`${fanT.short} 팬 갤러리`, 'fan'] : this.pick(seed, 's' + i, this.SITES);
      const up = Math.floor(this.r(seed, 'u' + i) ** 2 * (300 + heat * 180)), reps = [];
      const nr = up > 200 ? Math.floor(this.r(seed, 'r' + i) * 3) : this.r(seed, 'r' + i) < .2 ? 1 : 0;
      for (let j = 0; j < nr; j++) reps.push({ nick: this.nick(seed, 'rn' + i + j), text: this.pick(seed, 'rp' + i + j, k === 'thanks' ? this.POOLS.THANKS_REPLY : this.REPLY), up: Math.floor(this.r(seed, 'ru' + i + j) * up * .4) });
      out.push({ site: site[0], cls: site[1], nick: this.nick(seed, 'nk' + i), text, up, ago: this.pick(seed, 'ag' + i, this.AGO), replies: reps });
    });
    return out.sort((a, b) => b.up - a.up);
  },
  // 감독 부임 반응: 평판 · 구단 레전드 여부
  hire() {
    const m = App.state.manager, t = Roster.team(); if (!m || !t) return null;
    const legend = m.background && m.background.formerTeam === t.id, rep = m.reputation || 50, nm = m.displayName || m.name;
    const lines = legend ? [`${Sim.josa(nm, '이', '가')} 다시 온다니 ㄷㄷ 기대되면 개추`, `레전드의 귀환이다`, `${t.short}의 피가 흐르는 감독`, `선수 때처럼만 해 줘라 ${nm}`, `이건 낭만이다`, `${t.short} 프런트 이번엔 잘했다`]
      : rep >= 75 ? [`${nm} 감독이면 무조건 우승 후보`, `${t.short} 이번엔 진심이네`, `명장 모셔 왔다 ㅋㅋ`, `연봉 얼마 줬냐`, `선수 영입도 따라오겠네`, `이 감독 밴픽 스타일 좋아함`]
      : rep >= 45 ? [`${nm}? 누구지 찾아보는 중`, `일단 지켜보자`, `${t.short} 프런트 믿어 본다`, `첫 시즌 성적 보고 판단함`, `코치 시절 평판은 좋았다던데`, `밴픽만 잘하면 된다`]
      : [`${Sim.josa(nm, '이', '가')} 누군데;;`, `${t.short} 프런트 정신 차려라`, `이거 맞냐…`, `신인 감독 키운다고 생각하자`, `기대는 안 하는데 잘하면 사과함`, `시즌 끝나고 다시 얘기하자`];
    const seed = 'hire' + nm + t.id;
    return lines.map((text, i) => { const s = this.pick(seed, 's' + i, this.SITES); return { site: i < 2 ? `${t.short} 팬 갤러리` : s[0], cls: i < 2 ? 'fan' : s[1], nick: this.nick(seed, 'n' + i), text, up: Math.floor(this.r(seed, 'u' + i) ** 2 * 900), ago: this.pick(seed, 'ag' + i, this.AGO), replies: [] }; }).sort((a, b) => b.up - a.up);
  },
  count(list) { return (list || []).reduce((s, c) => s + 1 + (c.replies || []).length, 0); },
  html(list) {
    return `<div class="cm-list">${list.map(c => `<div class="cm-row"><div class="cm-top"><span class="cm-site ${c.cls}">${UI.esc(c.site)}</span><b>${UI.esc(c.nick)}</b><small>${c.ago || ''}</small><em>▲ ${c.up}</em></div><p>${UI.esc(c.text)}</p>
      ${(c.replies || []).map(r => `<div class="cm-reply"><span>ㄴ</span><b>${UI.esc(r.nick)}</b><p>${UI.esc(r.text)}</p><em>▲ ${r.up}</em></div>`).join('')}</div>`).join('')}</div>`;
  },
};

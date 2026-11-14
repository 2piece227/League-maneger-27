// 선수별 감독 관계 · 커뮤니티 반응
//
// 관계(Rel): 선수마다 0~100 (처음 50 + 충성도). 사기를 건드리는 일(면담·약속·칭찬·질책·트레이드설…)마다 같이 움직인다.
//   경기력에는 아주 조금(사기와 같은 자리), 재계약·이적 요청에는 크게 (js/negotiate.js · 트레이드설).
// 커뮤니티: 뉴스를 열면 가상의 커뮤니티 반응이 달린다. 기사 종류와 등장 팀·선수에 맞춰 글을 고른다(같은 기사는 늘 같은 반응).
const Rel = {
  st() { return (App.state.relp ||= {}); },
  of(pid) { const s = this.st(); if (s[pid] == null) { const hit = Player.find(pid), loy = hit && ((hit.p.attributes || {}).hidden || {}).loyalty; s[pid] = Math.round(45 + ((loy || 11) - 11) * 1.2); } return s[pid]; },
  add(pid, v) { if (!pid || !v) return; const s = this.st(); s[pid] = Math.max(0, Math.min(100, this.of(pid) + v)); },
  word(pid) { const v = this.of(pid); return v >= 80 ? '두터움' : v >= 60 ? '좋음' : v >= 40 ? '보통' : v >= 20 ? '서먹함' : '냉랭함'; },
  // OVR 보정 (사기와 같은 자리, ±0.5)
  ovr(pid) { return (this.of(pid) - 50) / 100; },
};
// 사기가 움직이면 관계도 같이 (World.apply 의 morale / moraleAll)
(() => {
  const apply = World.apply.bind(World);
  World.apply = (fx, ctx) => {
    if (fx.morale && ctx && ctx.pid) Rel.add(ctx.pid, fx.morale * 3);
    if (fx.moraleAll && typeof Roster !== 'undefined' && Roster.team()) Roster.team().players.forEach(p => Rel.add(p.id, fx.moraleAll * 2));
    return apply(fx, ctx);
  };
})();

const Community = {
  SITES: [['팬 페이지', 'fan'], ['롤마당', 'a'], ['협곡 갤러리', 'b'], ['인벤토리 게시판', 'c'], ['드래곤 광장 (중국)', 'd']],
  NICK: ['협곡지박령', '와드요정', '바론스틸러', '정글차이', '미드갭', '탑솔러장인', '원딜은사랑', '서폿은죄가없다', '용버프', '포탑다이버', '한타각', '갱좀와주세요', '롤알못', '월즈가보자', '페이커는신', '라인전패배자', '정글바꿔', '솔랭박이', '스노우볼', '역전의명수'],
  r(seed, k) { return G.rand(seed, 'cm' + k); },
  pick(seed, k, arr) { return arr[Math.floor(this.r(seed, k) * arr.length)]; },
  // 기사에서 팀 · 선수 찾기
  find(x) {
    // 제목에 나오는 순서대로 (결과 기사는 앞 팀 점수가 앞)
    const txt = x.title + ' ' + (x.body || ''), at = t => { const i = [txt.indexOf(t.short), txt.indexOf(t.name)].filter(v => v >= 0); return i.length ? Math.min(...i) : -1; };
    const teams = App.db.teams.filter(t => at(t) >= 0).sort((a, b) => at(a) - at(b)), hit = x.pid && Player.find(x.pid);
    return { teams, p: hit ? hit.p : null, pt: hit ? hit.t : null };
  },
  POOLS: {
    win: ['{w} 이번 시즌 진짜 다르다', '{l} 오늘 경기 보고 할 말을 잃음', '{w} 운영 깔끔하네 ㅋㅋ', '{l} 밴픽부터 졌다', '와 {w} 폼 미쳤다', '{l} 팬인데 오늘은 인정한다', '이게 {w}지 ㅋㅋㅋ', '{l} 정글 동선 누가 짰냐'],
    title: ['{t} 우승 ㅊㅊ!!!', '{t} 왕조 다시 시작이다', '이번 시즌 MVP는 누구냐', '{t} 팬들 오늘 잠 못 잔다 ㅋㅋ', '우승 축하합니다 고생했다', '솔직히 {t} 우승 예상한 사람?'],
    sign: ['{p} {t} 간다고? 개추', '{p} 연봉 얼마냐 ㄷㄷ', '{t} 이번 오프시즌 잘했다', '{p} 폼 돌아오면 무섭지', '이 영입 맞냐…', '{t} 팬인데 기대된다', '{p} 잘 가라… 고마웠다'],
    fa: ['{p} 어디 가냐 진짜', '제발 우리 팀 와라 {p}', '{p} 몸값 감당 가능한 팀 있나', '{p} 은퇴만 하지 마라', '{p} 데려오는 팀이 우승한다'],
    rumor: ['찌라시 아니냐', '{p} 가면 진짜 슬플 듯', '이번엔 진짜일 것 같은데', '{t} 오피셜 언제 뜸?', '{p} 본인 방송에서 부정했다던데'],
    trashWin: ['말한 대로 했네 ㅋㅋㅋ', '도발하고 이기는 게 낭만이지', '{w} 티저 맛집', '상대 팀 팬들 조용하다 ㅋㅋ'],
    trashLose: ['도발하고 졌네 ㅋㅋㅋㅋ', '티저 찍은 사람 반성해라', '이래서 입 털면 안 된다', '{l} 오늘 커뮤 못 들어가겠다', '다음엔 조용히 이기자'],
    rest: ['{p} 휴식이라니 아쉽다', '쉬고 와서 더 잘하면 됨', '{p} 이대로 은퇴는 아니겠지?', '제안이 마음에 안 들었나 보네'],
    generic: ['오 이건 몰랐네', '기대된다', '이번 시즌 재밌겠다', '롤판 오늘도 평화롭다', '흠…', '이거 맞냐', '개추'],
  },
  kind(x) {
    const t = x.title;
    if (/우승/.test(t)) return 'title';
    if (/역풍|도발.*패배/.test(t)) return 'trashLose';
    if (/도발.*이겼|티저 화제/.test(t)) return 'trashWin';
    if (/휴식/.test(t)) return 'rest';
    if (/\[결과\]/.test(t)) return 'win';
    if (/입단|잔류|재계약|콜업|영입/.test(t)) return 'sign';
    if (/\[FA\]/.test(t)) return 'fa';
    if (/이적설|관심설/.test(t)) return 'rumor';
    return 'generic';
  },
  comments(x, n = 5) {
    const seed = x.title + x.date, k = this.kind(x), F = this.find(x), out = [];
    // 결과 기사: 앞 팀이 이긴 쪽인지 점수로 판단
    let w = F.teams[0], l = F.teams[1];
    const sc = x.title.match(/(\d+):(\d+)/); if (sc && F.teams.length >= 2 && +sc[1] < +sc[2]) [w, l] = [l, w];
    const fill = s => s.replace(/\{w\}/g, w ? w.short : '이긴 팀').replace(/\{l\}/g, l ? l.short : '진 팀').replace(/\{t\}/g, (F.teams[0] || F.pt || { short: '거기' }).short).replace(/\{p\}/g, F.p ? F.p.name : '그 선수');
    const pool = this.POOLS[k] || this.POOLS.generic, used = new Set();
    for (let i = 0; i < n * 3 && out.length < n; i++) {
      const line = this.pick(seed, 'l' + i, pool); if (used.has(line)) continue; used.add(line);
      const site = this.pick(seed, 's' + i, this.SITES), nick = this.pick(seed, 'n' + i, this.NICK);
      out.push({ site: site[0], cls: site[1], nick, text: fill(line), up: Math.floor(this.r(seed, 'u' + i) ** 2 * 900) });
    }
    return out.sort((a, b) => b.up - a.up);
  },
  // 감독 부임 반응: 평판 · 구단 레전드 여부
  hire() {
    const m = App.state.manager, t = Roster.team(); if (!m || !t) return null;
    const legend = m.background && m.background.formerTeam === t.id, rep = m.reputation || 50, nm = m.displayName || m.name;
    const lines = legend ? [`${nm}가 다시 온다니 ㄷㄷ 기대되면 개추`, `레전드의 귀환이다`, `${t.short}의 피가 흐르는 감독`, `선수 때처럼만 해 줘라 ${nm}`]
      : rep >= 75 ? [`${nm} 감독이면 무조건 우승 후보`, `${t.short} 이번엔 진심이네`, `명장 모셔 왔다 ㅋㅋ`, `연봉 얼마 줬냐`]
      : rep >= 45 ? [`${nm}? 누구지 찾아보는 중`, `일단 지켜보자`, `${t.short} 프런트 믿어 본다`, `첫 시즌 성적 보고 판단함`]
      : [`${nm}이 누군데;;`, `${t.short} 프런트 정신 차려라`, `이거 맞냐…`, `신인 감독 키운다고 생각하자`];
    const seed = 'hire' + nm + t.id;
    return lines.map((text, i) => ({ site: this.pick(seed, 's' + i, this.SITES)[0], cls: this.pick(seed, 's' + i, this.SITES)[1], nick: this.pick(seed, 'n' + i, this.NICK), text, up: Math.floor(this.r(seed, 'u' + i) ** 2 * 900) })).sort((a, b) => b.up - a.up);
  },
  html(list) { return `<div class="cm-list">${list.map(c => `<div class="cm-row"><span class="cm-site ${c.cls}">${UI.esc(c.site)}</span><b>${UI.esc(c.nick)}</b><p>${UI.esc(c.text)}</p><em>▲ ${c.up}</em></div>`).join('')}</div>`; },
  // 기사 열기: 본문 + 커뮤니티 반응
  open(x) {
    const list = x.hire ? this.hire() : this.comments(x);
    UI.modal({ title: UI.esc(x.title), body: `<p class="cm-body">${UI.esc(x.body || '')}</p><h4 class="cm-h">커뮤니티 반응</h4>${this.html(list || [])}`,
      actions: [{ label: '닫기' }, ...(x.link && x.link !== '#portal-news' ? [{ label: '관련 화면으로', primary: true, onClick: () => { location.hash = x.link; } }] : [])] });
  },
};

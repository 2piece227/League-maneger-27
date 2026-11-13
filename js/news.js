// 포털: 메시지(전체 화면) · 뉴스. 뉴스는 실제 데이터(계약 만료·일정·솔랭·숙련도)에서 기사 틀을 채운다.
// TODO: 기능 연결 — 경기 결과·이적·인터뷰 이벤트로 기사 생성
const News = {
  today() { return Clock.today(); },
  cat: 'all',
  CATS: { all: '전체', transfer: '이적시장', league: '리그', soloq: '솔랭', team: '우리 팀', patch: '패치' },

  async items() {
    await Promise.all([Portal.ready, Mastery.load(), Results.load(), Champions.load()]);
    const t = Roster.team(), today = this.today(), d = n => Store.addDays(today, -n);
    // 처음 실린 날을 저장해 두는 기사(패치·결산 등): 날이 지나도 날짜가 따라 움직이지 않는다
    const seen = k => ((App.state.newsSeen ||= {})[k] ||= today);
    const out = [];
    // 진행 중인 국제대회 (실제)
    Schedule.events.filter(e => e.past && e.end >= today).forEach(e => out.push({
      cat: 'league', date: today, title: `${e.label}, ${Fmt.dayLabel(e.end)} 결승`, body: `${e.label}가 막바지에 접어들었습니다. 결승이 끝나면 다음 날부터 스토브리그가 시작됩니다.`, link: '#portal-calendar',
    }));
    // FA 시장: 개장 2주 전에 예고, 개장일에 개장 기사 (날짜 고정)
    const stove = Schedule.events.find(e => e.kind === 'stove' && e.end >= today && Store.addDays(e.start, -14) <= today);
    if (stove && today < stove.start) out.push({ cat: 'transfer', date: Store.addDays(stove.start, -14), title: `FA 시장 ${Fmt.dayLabel(stove.start)} 개장 예정`, body: `각 구단의 재계약 협상 마감이 다가오고 있습니다. 계약이 끝나는 선수들은 ${Fmt.dayLabel(stove.start)}부터 자유롭게 협상할 수 있습니다.`, link: '#recruit-fa' });
    else if (stove) out.push({ cat: 'transfer', date: stove.start, title: `FA 시장 개장 — ${Fmt.dayLabel(stove.end)}까지`, body: `스토브리그가 시작됐습니다. 계약이 끝난 선수들은 이제 어느 팀과도 협상할 수 있습니다. FA 시장은 ${Fmt.dayLabel(stove.end)}까지 열립니다.`, link: '#recruit-fa' });
    // 이적설: 계약 만료 10~30일 전(선수마다 고정)에 한 번 나온다. 이미 끝난 계약·무소속은 빼고
    const rumorDay = p => Store.addDays(p.contractEnd, -(10 + Math.floor(G.rand(p.id + p.contractEnd, 'rd') * 21)));
    App.db.teams.flatMap(x => x.players.map(p => ({ p, t: x }))).filter(({ p, t: x }) => x.id !== t.id && !p.free && p.contractEnd && p.contractEnd > today && rumorDay(p) <= today)
      .sort((a, b) => Player.value(b.p, b.t) - Player.value(a.p, a.t)).slice(0, 6).forEach(({ p, t: x }) => {
        const to = App.db.teams.filter(y => y.id !== x.id && (y.rep || 2) >= (x.rep || 2) - 1)[Math.floor(G.rand(p.id, 'rumor') * 6)] || App.db.teams[0];
        out.push({ cat: 'transfer', date: rumorDay(p), title: `[이적설] ${p.name}, ${x.short}와 계약 만료 앞두고 ${to.short} 관심설`, body: `${x.name}의 ${G.ROLE_KO[p.role]} ${p.name}(${p.age}세)의 계약이 ${p.contractEnd.replace(/-/g, '.')}에 끝납니다. 업계에서는 ${to.name}이 영입을 검토하고 있다는 이야기가 나옵니다.`, pid: p.id, link: '#recruit-fa' });
      });
    // 이적시장 오피셜 (다른 구단 AI 결과, 최근 30일)
    (App.state.market?.news || []).filter(n => n.date >= d(30) && n.date <= today).forEach(n => out.push({ cat: 'transfer', date: n.date, title: n.title, body: n.body, pid: n.pid, link: '#recruit-fa' }));
    // 일정 발표 예정
    const rel = Schedule.nextRelease(t.league);
    if (rel && Store.addDays(rel.pub, -21) <= today) out.push({ cat: 'league', date: Store.addDays(rel.pub, -21), title: `${rel.label} 대진 ${Fmt.dayLabel(rel.pub)}경 발표 예정`, body: `${rel.label}는 ${Fmt.dayLabel(rel.start)} 개막합니다. 대진과 경기 일정은 개막 약 ${rel.lead}일 전에 공개될 예정입니다.`, link: '#portal-fixtures' });
    // 솔랭 1위
    const sq = (SoloQ.cache || SoloQ.build()).ladder[0];
    if (sq) out.push({ cat: 'soloq', date: today, title: `${SoloQ.SERVER[t.league]} 서버 솔랭 1위는 '${sq.name}'`, body: `${sq.type === 'pro' ? `${sq.team.name}의 ${sq.name}` : `${SoloQ.TYPES[sq.type][0]} '${sq.name}'`}이 ${sq.lpNow.toLocaleString()} LP로 1위를 지키고 있습니다. 승률 ${SoloQ.wr(sq)}%.${sq.prodigy ? ' 프로팀 스카우트들의 관심도 쏠리고 있습니다.' : ''}`, link: '#training-soloq', pid: sq.player && sq.player.id });
    // 시그니처 조명
    const sigs = Object.entries(Mastery.pools).flatMap(([pid, l]) => l.filter(e => e.sig).map(e => ({ pid, e })));
    const pick = sigs[Math.floor(G.rand(today, 'sig') * sigs.length)];
    if (pick) { const hit = Player.find(pick.pid), c = Champions.byId[pick.e.c]; if (hit) out.push({ cat: 'league', date: today, title: `[분석] ${hit.p.name}의 ${c.name}, 최근 3시즌 ${pick.e.g}판 승률 ${Mastery.wr(pick.e)}%`, body: `${hit.t.name} ${hit.p.name}의 시그니처 챔피언 ${c.name}. 상대 팀들은 밴픽에서 이 챔피언을 먼저 의식할 수밖에 없습니다.`, pid: hit.p.id, link: '#match-meta' }); }
    // 패치
    out.push({ cat: 'patch', date: seen('patch:' + Champions.meta.patch), title: `패치 ${Champions.meta.patch} 적용`, body: `새 시즌을 앞두고 패치 ${Champions.meta.patch}가 적용됐습니다. 프로 경기 픽 순위는 메타·패치 노트에서 확인할 수 있습니다.`, link: '#match-meta' });
    // 우리 팀
    const exp = t.players.filter(p => !p.free && p.contractEnd && p.contractEnd > today && Player.days(p) <= 30);
    if (exp.length) out.push({ cat: 'team', date: Store.addDays(exp.map(p => p.contractEnd).sort()[0], -30), title: `${t.short}, ${exp.map(p => p.name).join('·')} 재계약 여부 주목`, body: `${t.name}의 ${exp.length}명이 곧 계약 만료를 맞습니다. 팬들의 시선이 재계약 협상에 쏠리고 있습니다.`, link: '#roster-contracts' });
    // 최근 30일 기사만 (날짜가 고정된 기사는 시간이 지나면 자연히 내려간다)
    return out.filter(x => x.date <= today && x.date >= d(30)).sort((a, b) => b.date.localeCompare(a.date));
  },

  shown: 40,
  async render(el) {
    const items = await this.items();
    const all = items.filter(x => this.cat === 'all' || x.cat === this.cat), list = all.slice(0, this.shown);
    const [hero, ...rest] = list;
    const art = (x, big = false) => {
      const hit = x.pid && Player.find(x.pid);
      return `<a class="card nw-card ${big ? 'hero' : ''}" href="${x.link || '#portal-news'}" ${x.pid ? `data-pid="${x.pid}"` : ''}>
        ${hit ? G.face(hit.p, 'nw-ph') : ''}
        <div><span class="nw-tag ${x.cat}">${this.CATS[x.cat]}</span><small>${Fmt.dayLabel(x.date)}</small>
        <b>${UI.esc(x.title)}</b><p>${UI.esc(x.body)}</p></div></a>`;
    };
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('뉴스', 'e스포츠 소식')}
        <div class="ch-bar"><div class="seg nw-cat">${Object.entries(this.CATS).map(([k, l]) => `<button class="${this.cat === k ? 'on' : ''}" data-c="${k}">${l}</button>`).join('')}</div></div>
        ${hero ? art(hero, true) : '<p class="ms-none">기사가 없습니다.</p>'}
        <div class="nw-grid">${rest.map(x => art(x)).join('')}</div>
        ${all.length > list.length ? `<div class="nw-more-wrap"><button class="btn-ghost nw-more">더 보기 (${all.length - list.length}개 남음)</button></div>` : ''}
      </div>`;
    $('.nw-cat', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.cat = b.dataset.c; this.shown = 40; this.render(el); };
    const more = $('.nw-more', el); if (more) more.onclick = () => { this.shown += 40; this.render(el); };
  },

  async messages(el) {
    await Portal.ready;
    el.innerHTML = '<div class="portal portal-full"><section class="msg-panel panel" id="msg-panel"></section></div>';
    Portal.renderMessages();
  },
};

Views['portal-news'] = el => News.render(el);
Views['portal-messages'] = el => News.messages(el);


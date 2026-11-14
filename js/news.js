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
      cat: 'league', date: today, title: `${e.label}, ${Fmt.dayLabel(e.end)} 결승`, body: `${Sim.josa(e.label, '이', '가')} 막바지에 접어들었습니다. 결승이 끝나면 다음 날부터 스토브리그가 시작됩니다.`, link: '#portal-calendar',
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
        out.push({ cat: 'transfer', date: rumorDay(p), title: `[이적설] ${p.name}, ${Sim.josa(x.short, '과', '와')} 계약 만료 앞두고 ${to.short} 관심설`, body: `${x.name}의 ${G.ROLE_KO[p.role]} ${p.name}(${p.age}세)의 계약이 ${p.contractEnd.replace(/-/g, '.')}에 끝납니다. 업계에서는 ${to.name}이 영입을 검토하고 있다는 이야기가 나옵니다.`, pid: p.id, link: '#recruit-fa' });
      });
    // 이적시장 오피셜 (다른 구단 AI 결과, 최근 30일)
    (App.state.market?.news || []).filter(n => n.date >= d(30) && n.date <= today).forEach(n => {
      const cat = /^\[패치\]/.test(n.title) ? 'patch' : /^\[(결과|우승|이슈)\]/.test(n.title) ? 'league' : 'transfer';
      out.push({ cat, date: n.date, title: n.title, body: n.body, pid: n.pid, link: { patch: '#match-meta', league: '#match-history', transfer: '#recruit-fa' }[cat] });
    });
    // 일정 발표 예정
    const rel = Schedule.nextRelease(t.league);
    if (rel && Store.addDays(rel.pub, -21) <= today) out.push({ cat: 'league', date: Store.addDays(rel.pub, -21), title: `${rel.label} 대진 ${Fmt.dayLabel(rel.pub)}경 발표 예정`, body: `${rel.label}는 ${Fmt.dayLabel(rel.start)} 개막합니다. 대진과 경기 일정은 개막 약 ${rel.lead}일 전에 공개될 예정입니다.`, link: '#portal-fixtures' });
    // 솔랭 1위
    const sq = (SoloQ.cache || SoloQ.build()).ladder[0];
    if (sq) out.push({ cat: 'soloq', date: today, title: `${SoloQ.SERVER[t.league]} 서버 솔랭 1위는 '${sq.name}'`, body: `${sq.type === 'pro' ? `${sq.team.name}의 ${sq.name}` : `${SoloQ.TYPES[sq.type][0]} '${sq.name}'`}${Sim.josa(sq.name, '이', '가').slice(sq.name.length)} ${sq.lpNow.toLocaleString()} LP로 1위를 지키고 있습니다. 승률 ${SoloQ.wr(sq)}%.${sq.prodigy ? ' 프로팀 스카우트들의 관심도 쏠리고 있습니다.' : ''}`, link: '#training-soloq', pid: sq.player && sq.player.id });
    // 시그니처 조명
    const sigs = Object.entries(Mastery.pools).flatMap(([pid, l]) => l.filter(e => e.sig).map(e => ({ pid, e })));
    const pick = sigs[Math.floor(G.rand(today, 'sig') * sigs.length)];
    if (pick) { const hit = Player.find(pick.pid), c = Champions.byId[pick.e.c]; if (hit) out.push({ cat: 'league', date: today, title: `[분석] ${hit.p.name}의 ${c.name}, 최근 3시즌 ${pick.e.g}판 승률 ${Mastery.wr(pick.e)}%`, body: `${hit.t.name} ${hit.p.name}의 시그니처 챔피언 ${c.name}. 상대 팀들은 밴픽에서 이 챔피언을 먼저 의식할 수밖에 없습니다.`, pid: hit.p.id, link: '#match-meta' }); }
    // 패치
    out.push({ cat: 'patch', date: seen('patch:' + Champions.meta.patch), title: `패치 ${Champions.meta.patch} 적용`, body: `새 시즌을 앞두고 패치 ${Champions.meta.patch}가 적용됐습니다. 프로 경기 픽 순위는 메타·패치 노트에서 확인할 수 있습니다.`, link: '#match-meta' });
    // 우리 팀
    const exp = t.players.filter(p => !p.free && p.contractEnd && p.contractEnd > today && Player.days(p) <= 30);
    if (exp.length) out.push({ cat: 'team', date: Store.addDays(exp.map(p => p.contractEnd).sort()[0], -30), title: `${t.short}, ${exp.map(p => p.name).join('·')} 재계약 여부 주목`, body: `${t.name}의 ${exp.length}명이 곧 계약 만료를 맞습니다. 팬들의 시선이 재계약 협상에 쏠리고 있습니다.`, link: '#roster-contracts' });
    // 감독 부임 기사 (커리어 시작일 · 팀을 옮긴 날)
    const mg = App.state.manager; if (mg) { const since = ((App.state.jobs || []).at(-1) || {}).until || (mg.createdAt || Clock.START).slice(0, 10); out.push({ cat: 'team', date: since, hire: true, title: `[오피셜] ${t.name}, 신임 감독 ${mg.displayName || mg.name} 선임`, body: `${t.name}가 ${mg.displayName || mg.name} 감독과 계약했습니다. ${Manager.BACKGROUNDS[mg.background.type].label} 출신으로, 팬들의 관심이 쏠리고 있습니다.` }); }
    // 최근 30일 기사만 (날짜가 고정된 기사는 시간이 지나면 자연히 내려간다)
    return out.filter(x => x.date <= today && x.date >= d(30)).sort((a, b) => b.date.localeCompare(a.date));
  },

  shown: 40,
  open: null,          // 열어 둔 기사 (날짜|제목)
  key(x) { return x.date + '|' + x.title; },
  OUTLETS: ['협곡일보', 'e스포츠 투데이', '리그 위클리', '게임 데일리', '소환사 신문'],
  REPORTERS: ['김하늘', '이도윤', '박서연', '최민재', '정유나', '한지호', '오세린', '강태민'],
  // 카드 · 기사 그림: 선수 사진 또는 팀 로고 (프로필로 넘어가는 링크는 걸지 않는다)
  visual(x, cls) {
    const F = Community.find(x), hit = x.pid && Player.find(x.pid);
    const t = (hit && hit.t && hit.t.id !== 'free' ? hit.t : null) || F.teams[0];
    // 사진을 못 불러오면 팀 로고(없으면 분류 글자)로 바꾼다
    const fb = t ? this.teamPic(t, cls) : `<div class="${cls} nw-logo"><b>${{ patch: '패치', soloq: '솔랭', league: 'LoL', transfer: 'FA', team: '팀' }[x.cat] || 'LoL'}</b></div>`;
    if (hit && hit.p.photo) return `<img class="${cls}" src="${hit.p.photo}" alt="" referrerpolicy="no-referrer" loading="lazy" data-fb="${UI.esc(fb)}" onerror="this.outerHTML=this.dataset.fb">`;
    if (t) return fb;
    return `<div class="${cls} nw-logo"><b>${{ patch: '패치', soloq: '솔랭', league: 'LoL', transfer: 'FA', team: '팀' }[x.cat] || 'LoL'}</b></div>`;
  },
  teamPic(t, cls) { return `<div class="${cls} nw-logo" style="--c:${t.color || '#334'}">${t.logo ? `<img src="${t.logo}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:'${UI.esc(t.short)}'}))">` : `<b>${UI.esc(t.short)}</b>`}</div>`; },
  // 기사 본문: 리드 문단 + 종류별 배경 문단 + 핵심 정보
  article(x) {
    const k = Community.kind(x), F = Community.find(x), paras = [x.body || ''], facts = [];
    const p = F.p, t1 = F.teams[0], t2 = F.teams[1];
    const rank = t => { if (!t) return null; const cur = Results.current(t.league), rows = Results.table(t.league, cur.ids), i = rows.findIndex(r => r.t.id === t.id); return i >= 0 ? { n: i + 1, name: cur.name, r: rows[i] } : null; };
    const rv = t1 && t2 ? Rivalry.of(t1.id, t2.id) : null;
    if (k === 'win' && t1 && t2) {
      const a = rank(t1), b = rank(t2);
      if (a && b) paras.push(`현재 ${a.name} 순위는 ${t1.short} ${a.n}위(${a.r.w}승 ${a.r.l}패), ${t2.short} ${b.n}위(${b.r.w}승 ${b.r.l}패)입니다.`);
      const h = Results.h2h(t1.id, t2.id); if (h.length) { const w = h.filter(m => Results.won(m, t1.id)).length; paras.push(`이번 커리어에서 두 팀의 상대 전적은 ${t1.short} 기준 ${w}승 ${h.length - w}패입니다.`); }
    }
    if (rv) paras.push(`두 팀의 맞대결은 '${rv.name}'${rv.alt ? `(${rv.alt})` : ''}${Sim.josa(rv.alt || rv.name, '으로', '로').slice((rv.alt || rv.name).length)} 불립니다. ${rv.desc}`);
    if (k === 'title' && t1) { const n = Object.values(App.state.champs || {}).filter(id => id === t1.id).length; paras.push(`${Sim.josa(t1.short, '은', '는')} 이번 커리어에서 ${n}번째 우승을 차지했습니다.${Rivalry.forTeam(t1.id).length ? ` 라이벌 ${Rivalry.forTeam(t1.id).map(r => Schedule.team(Rivalry.other(r, t1.id)).short).join('·')} 팬들의 속은 쓰릴 듯합니다.` : ''}`); }
    if (p && ['sign', 'fa', 'rumor', 'trade', 'rest', 'release', 'soloq', 'analysis'].includes(k)) {
      facts.push(['선수', `${p.name}${p.nativeName || p.realName ? ` (${p.nativeName || p.realName})` : ''}`], ['포지션', G.ROLE_KO[p.role] || '-'], ['나이', p.age ? p.age + '세' : '-'], ['국적', G.nationName(p.nation)], ['오버롤', p.ovr || '-']);
      if (F.pt && F.pt.id !== 'free') facts.push(['현 소속', F.pt.name]);
      if (p.contractEnd) facts.push(['계약 만료', p.contractEnd.replace(/-/g, '.')]);
      const sig = (Mastery.signatures ? Mastery.signatures(p.id) : []).map(e => (Champions.byId[e.c] || {}).name).filter(Boolean);
      if (sig.length) facts.push(['시그니처', sig.join(', ')]);
      if (k === 'sign' || k === 'trade') paras.push(`${p.name}의 합류로 ${(F.teams.find(y => y.id === (F.pt || {}).id) || t1 || { short: '새 팀' }).short}의 ${G.ROLE_KO[p.role] || ''} 자리는 한층 두터워졌습니다. 시즌이 시작되면 주전 경쟁 결과를 지켜볼 만합니다.`);
      if (k === 'rumor') paras.push('구단은 아직 공식 입장을 내지 않았습니다. 이적 시장에서는 이런 이야기가 오피셜로 이어지는 경우도, 소문으로 끝나는 경우도 많습니다.');
    }
    if (k === 'patch') { const list = (x.body || '').split(/ \/ |적용됐습니다\. /).slice(1).filter(Boolean); if (list.length) { paras.length = 1; paras[0] = (x.body || '').split('적용됐습니다.')[0] + '적용됐습니다. 바뀐 챔피언은 아래와 같습니다.'; facts.push(...list.map(l => { const m = l.match(/^(.+?) ([▲▼]) (.+)$/); return m ? [m[1], `${m[2] === '▲' ? '<em class="up">▲ 버프</em>' : '<em class="dn">▼ 너프</em>'} ${UI.esc(m[3])}`] : ['', UI.esc(l)]; })); } }
    const seed = this.key(x), by = `${Community.pick(seed, 'o', this.OUTLETS)} ${Community.pick(seed, 'r', this.REPORTERS)} 기자`;
    return { paras: paras.filter(Boolean), facts, by, teams: F.teams.slice(0, 2), p, rv };
  },
  async render(el) {
    const items = await this.items();
    if (this.open) { const x = items.find(i => this.key(i) === this.open); if (x) return this.read(el, x, items); this.open = null; }
    const all = items.filter(x => this.cat === 'all' || x.cat === this.cat), list = all.slice(0, this.shown);
    const [hero, ...rest] = list;
    const card = (x, big = false) => `<button class="card nw-card ${big ? 'hero' : ''}" data-k="${UI.esc(this.key(x))}">
        ${this.visual(x, 'nw-ph')}
        <div class="nw-txt"><span class="nw-tag ${x.cat}">${this.CATS[x.cat]}</span><small>${Fmt.dayLabel(x.date)}</small>
        <b>${UI.esc(x.title)}</b><p>${UI.esc(x.body)}</p><small class="nw-cm">💬 댓글 ${Community.count(x.hire ? Community.hire() : Community.comments(x))}</small></div></button>`;
    el.innerHTML = `
      <div class="cr-page">
        ${Career.head('뉴스', 'e스포츠 소식 · 기사를 누르면 본문과 커뮤니티 반응을 볼 수 있습니다')}
        <div class="ch-bar"><div class="seg nw-cat">${Object.entries(this.CATS).map(([k, l]) => `<button class="${this.cat === k ? 'on' : ''}" data-c="${k}">${l}</button>`).join('')}</div></div>
        ${hero ? card(hero, true) : '<p class="ms-none">기사가 없습니다.</p>'}
        <div class="nw-grid">${rest.map(x => card(x)).join('')}</div>
        ${all.length > list.length ? `<div class="nw-more-wrap"><button class="btn-ghost nw-more">더 보기 (${all.length - list.length}개 남음)</button></div>` : ''}
      </div>`;
    $('.nw-cat', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; this.cat = b.dataset.c; this.shown = 40; this.render(el); };
    const more = $('.nw-more', el); if (more) more.onclick = () => { this.shown += 40; this.render(el); };
    el.querySelectorAll('.nw-card').forEach(a => a.onclick = () => { this.open = a.dataset.k; el.scrollTop = 0; this.render(el); });
  },
  // 기사 화면: 본문 · 핵심 정보 · 관련 바로가기 · 커뮤니티 반응 · 다른 기사
  read(el, x, items) {
    const A = this.article(x), list = x.hire ? Community.hire() : Community.comments(x), my = App.state.teamId;
    const others = items.filter(y => y !== x).slice(0, 8);
    el.innerHTML = `
      <div class="cr-page nw-read">
        <div class="nw-read-top"><button class="btn-ghost nw-back">← 뉴스 목록</button></div>
        <div class="nw-read-grid">
          <article class="card nw-art">
            <div class="nw-art-meta"><span class="nw-tag ${x.cat}">${this.CATS[x.cat]}</span><small>${Fmt.dayLabel(x.date)} · ${UI.esc(A.by)}</small>${A.rv ? Rivalry.badge(A.rv) : ''}</div>
            <h1>${UI.esc(x.title)}</h1>
            <div class="nw-art-hero">${A.teams.length >= 2 && !A.p ? A.teams.map(t => this.teamPic(t, 'nw-big')).join('<b class="nw-vs">VS</b>') : this.visual(x, 'nw-big')}</div>
            ${A.paras.map(t => `<p>${UI.esc(t)}</p>`).join('')}
            ${A.facts.length ? `<dl class="nw-facts">${A.facts.map(([k, v]) => `<dt>${UI.esc(String(k))}</dt><dd>${typeof v === 'string' && v.includes('<em') ? v : UI.esc(String(v))}</dd>`).join('')}</dl>` : ''}
            <div class="nw-rel">
              ${A.p ? `<button class="btn-ghost nw-go" data-pp-open="${A.p.id}">${UI.esc(A.p.name)} 프로필</button>` : ''}
              ${A.teams.map(t => `<button class="btn-ghost nw-go" data-team="${t.id}">${UI.esc(t.short)} ${t.id === my ? '로스터' : '분석'}</button>`).join('')}
              ${x.link && x.link !== '#portal-news' ? `<button class="btn-ghost nw-go" data-link="${x.link}">관련 화면</button>` : ''}
            </div>
          </article>
          <aside class="card nw-side"><h4>다른 기사</h4>${others.map(y => `<button class="nw-side-row" data-k="${UI.esc(this.key(y))}"><span class="nw-tag ${y.cat}">${this.CATS[y.cat]}</span><b>${UI.esc(y.title)}</b><small>${Fmt.dayLabel(y.date)}</small></button>`).join('')}</aside>
        </div>
        <section class="card nw-cm-box"><div class="card-head"><h3>커뮤니티 반응 <small>댓글 ${Community.count(list)}</small></h3></div>${Community.html(list || [])}</section>
      </div>`;
    $('.nw-back', el).onclick = () => { this.open = null; this.render(el); };
    el.querySelectorAll('.nw-side-row').forEach(b => b.onclick = () => { this.open = b.dataset.k; el.scrollTop = 0; this.render(el); });
    el.querySelectorAll('.nw-go').forEach(b => b.onclick = () => {
      if (b.dataset.ppOpen) return Player.open(b.dataset.ppOpen);
      if (b.dataset.team) { this.open = null; if (b.dataset.team === my) return Router.go('roster-first-team'); Match.oppId = b.dataset.team; return Router.go('match-opponent'); }
      if (b.dataset.link) { this.open = null; location.hash = b.dataset.link; }
    });
  },

  async messages(el) {
    await Portal.ready;
    el.innerHTML = '<div class="portal portal-full"><section class="msg-panel panel" id="msg-panel"></section></div>';
    Portal.renderMessages();
  },
};

Views['portal-news'] = el => News.render(el);
Views['portal-messages'] = el => News.messages(el);


// 다른 화면으로 가면 열어 둔 기사는 닫는다 (뉴스 탭을 다시 누르면 목록부터)
Router.onRoute(r => { if (r !== 'portal-news') News.open = null; });

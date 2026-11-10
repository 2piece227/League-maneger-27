// 포털 > 개요: 메시지 목록 + 오른쪽 카드 열. 데이터는 data/mock/portal.json
const Portal = {
  data: null,
  filter: 'all',
  query: '',
  openId: null,

  async load() {
    if (this.data) return this.data;
    try {
      this.data = await fetch('data/mock/portal.json').then(r => r.json());
    } catch (e) {
      console.warn('[portal] 목업 로드 실패', e);
      this.data = { date: '2027-01-14', team: { short: '?', color: '#555' }, messages: [], week: [], standings: { rows: [] }, soloRank: [] };
    }
    return this.data;
  },

  // 상단 바 배지와 날짜. 선택한 팀이 있으면 그 팀 기준으로 목업을 실제 팀·선수 이름으로 바꾼다.
  setTeam(team) {
    this.ready = this._setTeam(team);
    return this.ready;
  },

  async _setTeam(team) {
    const raw = await this.load();
    this.raw = this.raw || JSON.parse(JSON.stringify(raw));
    this.data = team ? this.localize(this.raw, team) : JSON.parse(JSON.stringify(this.raw));
    this.openId = null;
    const t = team || this.data.team;
    this.myTeamId = t.id;
    const badge = $('#tb-badge');
    badge.innerHTML = t.logo ? UI.img(t.logo, '', UI.esc(t.short)) : UI.esc(t.short);
    badge.classList.toggle('has-logo', !!t.logo);
    badge.style.setProperty('--c', t.color);
    badge.title = t.name;
    $$('.tb-date').forEach(el => el.textContent = Fmt.date(this.data.date));
  },

  // 목업 수치는 그대로 두고, 팀·선수 자리만 내 리그의 실제 팀과 내 로스터로 채운다.
  // TODO: 기능 연결 — 실제 시즌 진행 데이터로 교체
  localize(raw, team) {
    const d = JSON.parse(JSON.stringify(raw));
    const league = App.db.teams.filter(t => t.league === team.league);
    const order = raw.standings.rows.map(r => r.team.short);
    const rank = t => { const i = order.indexOf(t.short); return i < 0 ? 99 : i; };
    const sorted = [...league].sort((a, b) => rank(a) - rank(b) || b.rep - a.rep);
    d.standings.rows = sorted.map((t, i) => {
      const r = raw.standings.rows[i] || { w: 0, l: 2, setDiff: -5 };
      return { rank: i + 1, team: t, w: r.w, l: r.l, setDiff: r.setDiff };
    });
    d.standings.competition = `${team.league} 2027 정규 시즌`;
    const others = sorted.filter(t => t.id !== team.id);
    const opp = others[1] || others[0], opp2 = others.find(t => t !== opp) || opp;
    const scrim = others.filter(t => t !== opp && t !== opp2);
    d.nextMatch.opponent = { ...opp, rank: sorted.indexOf(opp) + 1 };

    const starters = team.players.filter(p => !p.sub);
    const byRole = r => starters.find(p => p.role === r) || starters[0] || { name: '선수' };
    const sub = team.players.find(p => p.sub);
    d.soloRank = d.soloRank.map(s => ({ ...s, p: byRole(s.role), player: byRole(s.role).name }));
    if (sub) d.challengers.callUp = { ...d.challengers.callUp, player: sub.name, role: sub.role, p: sub };
    const staff = team.staff || [];
    const tok = {
      opp: opp.name, oppShort: opp.short, opp2: opp2.name, opp2Short: opp2.short,
      s1: (scrim[0] || opp).short, s2: (scrim[1] || opp2).short,
      pTOP: byRole('TOP').name, pMID: byRole('MID').name,
      sub: sub ? sub.name : '유망주',
      coach: (staff[0] || {}).name || '수석', coach2: (staff[1] || staff[0] || {}).name || '2군',
      league: team.league, cl: { LCK: 'LCK CL', LPL: 'LDL', LEC: 'EMEA Masters', LCS: 'NACL' }[team.league] || '2군 리그',
    };
    const fill = o => JSON.parse(JSON.stringify(o).replace(/\{(\w+)\}/g, (m, k) => k in tok ? JSON.stringify(String(tok[k])).slice(1, -1) : m));
    d.messages = fill(d.messages);
    d.week = fill(d.week);
    d.nextMatch.competition = fill(d.nextMatch.competition);
    d.challengers.lastResult = fill(d.challengers.lastResult);
    d.messages.forEach(m => {
      if (m.from.role === 'player') m.from.photo = (team.players.find(p => p.name === m.from.name) || {}).photo;
    });
    d.team = team;
    return d;
  },

  async render(el) {
    await this.ready;
    const d = await this.load();
    el.innerHTML = `
      <div class="portal">
        <section class="msg-panel panel" id="msg-panel"></section>
        <aside class="portal-cards">
          ${this.cardNextMatch(d)}
          ${this.cardStandings(d)}
          ${this.cardSoloRank(d)}
          ${this.cardChallengers(d)}
          ${this.cardWeek(d)}
        </aside>
      </div>`;
    this.renderMessages();
  },

  // ---------- 메시지 ----------
  counts() {
    const m = this.data.messages;
    return { todo: m.filter(x => x.priority === 'todo').length, unread: m.filter(x => !x.read).length };
  },

  visibleMessages() {
    const q = this.query.trim().toLowerCase();
    return this.data.messages.filter(m => {
      if (this.filter === 'new' && !m.isNew) return false;
      if (this.filter === 'todo' && m.priority !== 'todo') return false;
      if (this.filter === 'unread' && m.read) return false;
      return !q || (m.subject + m.from.name).toLowerCase().includes(q);
    });
  },

  renderMessages() {
    const panel = $('#msg-panel');
    if (!panel) return;
    if (this.openId) { this.renderDetail(panel); return; }

    const c = this.counts();
    const chips = [['all', '전체'], ['new', '새 메시지'], ['todo', `할 일 (${c.todo})`], ['unread', `안 읽음 (${c.unread})`]];
    const list = this.visibleMessages();
    const groups = {};
    list.forEach(m => (groups[m.date] = groups[m.date] || []).push(m));

    panel.innerHTML = `
      <div class="msg-head">
        <h2>메시지</h2>
        <div class="chips">${chips.map(([k, l]) => `<button class="chip ${this.filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
        <div class="msg-tools">
          <button class="icon-btn" id="msg-search-btn" title="검색">${Icons.search}</button>
          <button class="icon-btn" id="msg-readall" title="모두 읽음">${Icons.checks}</button>
        </div>
      </div>
      <div class="msg-search ${this.searchOpen ? 'open' : ''}"><input id="msg-search" placeholder="제목·보낸 사람 검색" value="${UI.esc(this.query)}"></div>
      <div class="msg-list">
        ${Object.keys(groups).length ? Object.entries(groups).map(([date, ms]) => `
          <div class="msg-day">${Fmt.dayLabel(date)}</div>
          ${ms.map(m => `
            <button class="msg-row pr-${m.priority} ${m.read ? '' : 'unread'}" data-id="${m.id}">
              <span class="msg-dot"></span>
              <span class="msg-icon">${this.senderIcon(m)}</span>
              <span class="msg-text"><small>${UI.esc(m.from.name)}</small><b>${UI.esc(m.subject)}</b></span>
              <span class="msg-meta">${m.priority === 'urgent' ? '<i class="flag">!</i>' : ''}<time>${m.time}</time></span>
            </button>`).join('')}`).join('') : '<p class="msg-empty">해당하는 메시지가 없습니다.</p>'}
      </div>`;

    $$('.chip', panel).forEach(b => b.onclick = () => { this.filter = b.dataset.filter; this.renderMessages(); });
    $$('.msg-row', panel).forEach(b => b.onclick = () => this.open(b.dataset.id));
    $('#msg-readall', panel).onclick = () => { this.data.messages.forEach(m => m.read = true); GameStubs.markAllRead(); this.renderMessages(); };
    $('#msg-search-btn', panel).onclick = () => { this.searchOpen = !this.searchOpen; this.renderMessages(); if (this.searchOpen) $('#msg-search').focus(); };
    $('#msg-search', panel).oninput = e => {
      this.query = e.target.value;
      const pos = e.target.selectionStart;
      this.renderMessages();
      const input = $('#msg-search');
      input.focus();
      input.setSelectionRange(pos, pos);
    };
  },

  senderIcon(m) {
    const ic = Icons.role[m.from.role] || Icons.role.coach;
    return m.from.photo ? UI.img(m.from.photo, 'msg-face', ic) : ic;
  },

  open(id) {
    const m = this.data.messages.find(x => x.id === id);
    if (!m) return;
    m.read = true;
    this.openId = id;
    this.renderMessages();
  },

  renderDetail(panel) {
    const m = this.data.messages.find(x => x.id === this.openId);
    panel.innerHTML = `
      <div class="msg-detail pr-${m.priority}">
        <button class="btn-ghost btn-sm" id="msg-back">← 목록으로</button>
        <div class="md-head">
          <span class="msg-icon lg">${this.senderIcon(m)}</span>
          <div>
            <h2>${UI.esc(m.subject)}</h2>
            <div class="md-from">${UI.esc(m.from.name)} · ${Fmt.dayLabel(m.date)} ${m.time}</div>
          </div>
        </div>
        ${m.priority !== 'normal' ? `<div class="md-badge">${m.priority === 'urgent' ? '긴급' : '할 일'}</div>` : ''}
        <div class="md-body">${UI.esc(m.body).split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}</div>
        ${m.priority === 'todo' ? '<div class="md-actions"><button class="btn-primary btn-sm" id="msg-act">처리하기</button></div>' : ''}
      </div>`;
    $('#msg-back').onclick = () => { this.openId = null; this.renderMessages(); };
    const act = $('#msg-act');
    if (act) act.onclick = () => GameStubs.handleMessageTask(m.id);
  },

  // ---------- 카드 ----------
  badge(t, cls = '') {
    return G.team(t, cls);
  },

  cardNextMatch(d) {
    const n = d.nextMatch;
    if (!n) return '';
    return `
      <div class="card">
        <div class="card-head"><h3>다음 경기</h3><a href="#match-next">자세히</a></div>
        <div class="nm-body">
          ${this.badge(n.opponent, 'lg')}
          <div class="nm-info">
            <b>vs ${UI.esc(n.opponent.name)}</b>
            <small>${UI.esc(n.competition)}</small>
            <small class="num">${Fmt.dateTime(n.datetime)}</small>
          </div>
        </div>
        <div class="nm-foot">
          <div><span class="k">최근 5경기</span><span class="form">${n.form.map(r => `<i class="${r === 'W' ? 'w' : 'l'}" title="${r === 'W' ? '승' : '패'}"></i>`).join('')}</span></div>
          <div><span class="k">리그 순위</span><b class="num">${n.opponent.rank}위</b></div>
        </div>
      </div>`;
  },

  cardStandings(d) {
    const rows = d.standings.rows;
    const top = rows.slice(0, 5);
    const mine = rows.find(r => r.team.id === this.myTeamId);
    const list = mine && !top.includes(mine) ? [...top, null, mine] : top;
    return `
      <div class="card">
        <div class="card-head"><h3>리그 순위</h3><a href="#match-standings">전체 보기</a></div>
        <table class="mini-table">
          <thead><tr><th>#</th><th>팀</th><th>승</th><th>패</th><th>득실</th></tr></thead>
          <tbody>${list.map(r => r ? `
            <tr class="${r === mine ? 'me' : ''}">
              <td class="num">${r.rank}</td>
              <td><span class="tm-cell">${this.badge(r.team, 'sm')}<span>${UI.esc(r.team.name)}</span></span></td>
              <td class="num">${r.w}</td><td class="num">${r.l}</td>
              <td class="num">${r.setDiff > 0 ? '+' : ''}${r.setDiff}</td>
            </tr>` : '<tr class="gap"><td colspan="5">⋯</td></tr>').join('')}</tbody>
        </table>
      </div>`;
  },

  cardSoloRank(d) {
    return `
      <div class="card">
        <div class="card-head"><h3>소속 선수 솔랭 순위</h3><a href="#training-soloq">전체</a></div>
        <table class="mini-table">
          <tbody>${d.soloRank.map(p => `
            <tr>
              <td><span class="tm-cell">${p.p ? G.face(p.p, 'pl-ph xs') : ''}<b>${UI.esc(p.player)}</b></span></td>
              <td>${G.pos(p.role)}</td>
              <td class="tier">${p.tier} <span class="num">${p.lp.toLocaleString()} LP</span></td>
              <td class="num delta ${p.change > 0 ? 'up' : p.change < 0 ? 'down' : ''}">${p.change > 0 ? '▲' + p.change : p.change < 0 ? '▼' + -p.change : '–'}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
  },

  cardChallengers(d) {
    const c = d.challengers;
    if (!c) return '';
    const r = c.lastResult;
    return `
      <div class="card">
        <div class="card-head"><h3>챌린저스 소식</h3><a href="#roster-challengers">2군 보기</a></div>
        <div class="cl-line"><span class="res ${r.win ? 'w' : 'l'}">${r.win ? '승' : '패'}</span>
          ${UI.esc(r.competition)} vs ${UI.esc(r.opponent)} <b class="num">${r.score}</b></div>
        <div class="cl-line"><span class="k">콜업 추천</span>${c.callUp.p ? G.face(c.callUp.p, 'pl-ph xs') : ''}<b>${UI.esc(c.callUp.player)}</b> ${G.pos(c.callUp.role)}
          <small>${UI.esc(c.callUp.reason)}</small></div>
      </div>`;
  },

  cardWeek(d) {
    return `
      <div class="card">
        <div class="card-head"><h3>이번 주</h3><a href="#portal-calendar">캘린더</a></div>
        <div class="week">${d.week.map(day => `
          <div class="wk-day ${day.date === d.date ? 'today' : ''}">
            <div class="wk-dow">${Fmt.dow(day.date)}</div>
            <div class="wk-num num">${+day.date.slice(8)}</div>
            <div class="wk-ev">${day.events.map(e => `<i class="ev ev-${e.type}" title="${UI.esc(e.label)}">${Icons.event[e.type] || ''}</i>`).join('')}</div>
          </div>`).join('')}</div>
        <div class="wk-legend"><span><i class="ev ev-match">${Icons.event.match}</i>경기</span><span><i class="ev ev-scrim">${Icons.event.scrim}</i>스크림</span><span><i class="ev ev-training">${Icons.event.training}</i>훈련</span><span><i class="ev ev-event">${Icons.event.event}</i>이벤트</span></div>
      </div>`;
  },
};

Views['portal-overview'] = el => Portal.render(el);

// 날짜 표기
const Fmt = {
  DOW: ['일', '월', '화', '수', '목', '금', '토'],
  parse(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); },
  dow(s) { return this.DOW[this.parse(s).getDay()]; },
  date(s) { return `${s.slice(0, 4)}.${s.slice(5, 7)}.${s.slice(8, 10)} (${this.dow(s)})`; },
  dayLabel(s) { const d = this.parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${this.dow(s)})`; },
  dateTime(s) { return `${this.dayLabel(s)} ${s.slice(11, 16)}`; },
};

// 인라인 SVG 아이콘
const Icons = (() => {
  const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return {
    search: svg('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4'),
    checks: svg('M2 13l4 4L16 7M12 15l2 2 8-10'),
    role: {
      coach: svg('M8 6h8M12 3v3M6 10a6 6 0 1 0 12 0H6zM9 21h6'),
      analyst: svg('M4 20V10M10 20V4M16 20v-7M22 20H2'),
      scout: svg('M3 11a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM13 11a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM11 11h2M5 7l2-3h2M19 7l-2-3h-2'),
      board: svg('M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6'),
      media: svg('M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3'),
      player: svg('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'),
    },
    morale: svg('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01'),
    event: {
      match: svg('M5 19L19 5M14 5h5v5M5 5l5 5M14 14l5 5'),
      scrim: svg('M4 12h16M12 4v16'),
      training: svg('M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12'),
      event: svg('M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z'),
    },
  };
})();

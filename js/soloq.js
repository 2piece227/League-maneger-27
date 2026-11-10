// 훈련 > 솔랭 순위: 경량 시뮬레이션으로 만든 서버 상위 100명 래더 + 전적
//
// - 프로·스트리머·일반인·장인이 섞여 있다. 일반인·장인 중 유망주에게는 테스트 제의를 할 수 있다.
// - 승률은 실력 차가 있어도 45~62% 안쪽: 솔랭은 팀운이 크고, 라인도 가끔 튄다.
// - 감독이 연습 챔피언을 지정하면 최근 7일 동안만 그 챔피언 빈도가 늘어난다.
// 결과는 날짜·선수로 고정된 시드에서 나오므로 같은 날 다시 열어도 같다.
const SoloQ = {
  DAYS: 45,          // 시즌 시작부터 시뮬레이션하는 일수
  HISTORY: 20,       // 전적으로 남기는 최근 판수
  PRACTICE_DAYS: 7,
  filter: 'all',
  q: '',
  selId: null,
  cache: null,

  SERVER: { LCK: '한국', LPL: '중국', LEC: '유럽 서부', LCS: '북미' },
  TYPES: { pro: ['프로', 'pro'], streamer: ['스트리머', 'str'], amateur: ['일반인', 'ama'], otp: ['장인', 'otp'] },

  // 시드 고정 난수 (mulberry32)
  rng(seed) {
    let a = Math.floor(G.rand(seed) * 4294967296) >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  pick(r, arr) { return arr[Math.floor(r() * arr.length)]; },
  weighted(r, items) { // [[value, weight]]
    const sum = items.reduce((s, x) => s + x[1], 0);
    let v = r() * sum;
    for (const [val, w] of items) { if ((v -= w) <= 0) return val; }
    return items[items.length - 1][0];
  },

  // 가상 닉네임 (실존 인물과 무관)
  NICK: {
    ko: {
      a: ['새벽', '고독한', '침착한', '배고픈', '조용한', '미친', '느긋한', '불타는', '차가운', '행복한', '졸린', '전설의', '무명의', '잠못드는', '비오는날'],
      b: ['정글러', '탑신', '미드왕', '원딜러', '서폿충', '라이너', '갱킹러', '한타왕', '캐리머신', '소환사', '야간반', '수험생', '직장인', '대학생', '고3'],
      str: ['방송하는', '생방', 'TV', '채널', '라이브'],
    },
    en: {
      a: ['Silent', 'Lucky', 'Frozen', 'Crimson', 'Lazy', 'Rapid', 'Lonely', 'Golden', 'Shadow', 'Night', 'Wild', 'Tiny', 'Brave', 'Hollow', 'Neon'],
      b: ['Wolf', 'Fox', 'Raven', 'Tiger', 'Ghost', 'Blade', 'Storm', 'Comet', 'Panda', 'Viper', 'Knight', 'Owl', 'Shark', 'Moth', 'Lynx'],
      str: ['TTV', 'Live', 'OnAir', 'Stream', 'Cast'],
    },
  },

  nick(r, lang, type, champ) {
    const N = this.NICK[lang];
    const num = Math.floor(r() * 990) + 10;
    if (type === 'otp') return lang === 'ko' ? `${champ.name}장인${r() < .5 ? num : ''}` : `${champ.nameEn.replace(/[^A-Za-z]/g, '')}OTP${num}`;
    if (type === 'streamer') return lang === 'ko' ? `${this.pick(r, N.a)}${this.pick(r, N.str)}` : `${this.pick(r, N.str)} ${this.pick(r, N.a)}${this.pick(r, N.b)}`;
    return lang === 'ko' ? `${this.pick(r, N.a)}${this.pick(r, N.b)}${r() < .4 ? num : ''}` : `${this.pick(r, N.a)}${this.pick(r, N.b)}${r() < .5 ? num : ''}`;
  },

  today() { return (Portal.data && Portal.data.date) || '2026-11-10'; },
  practice() { return (App.state.practice ||= {}); },
  offers() { return (App.state.testOffers ||= {}); },

  // 계정 목록: 리그 프로 + 가상 일반 계정
  accounts(league) {
    const r = this.rng('accounts:' + league);
    const lang = league === 'LCK' ? 'ko' : 'en';
    const byPos = role => Champions.list.filter(c => c.positions.includes(role));
    const out = [];
    App.db.teams.filter(t => t.league === league).forEach(t => t.players.filter(p => p.role !== 'COACH').forEach(p => {
      const pr = this.rng('pro:' + p.id);
      const pool = Mastery.pool(p.id).filter(e => Champions.byId[e.c]);
      out.push({
        id: 'pro:' + p.id, type: 'pro', player: p, team: t, name: p.name, role: p.role,
        skill: 58 + pr() * 18 + (p.sub ? -4 : 0),
        games: [4, 9], // 스토브 시즌이라 하루 판수가 많다
        pool: pool.length ? pool.map(e => [e.c, e.g + e.g26 * 2 + 1]) : byPos(p.role).slice(0, 8).map(c => [c.id, 1]),
      });
    }));
    const n = 130 - out.length;
    for (let i = 0; i < n; i++) {
      const type = this.weighted(r, [['amateur', 55], ['streamer', 25], ['otp', 20]]);
      const role = this.pick(r, G.ROLES);
      const cands = byPos(role);
      const main = this.pick(r, cands);
      const size = type === 'otp' ? 1 : type === 'streamer' ? 9 : 5;
      const pool = [[main.id, type === 'otp' ? 30 : 5]];
      while (pool.length < size + (type === 'otp' ? 2 : 0)) {
        const c = this.pick(r, cands).id;
        if (!pool.some(x => x[0] === c)) pool.push([c, 1 + r() * 3]);
      }
      const prodigy = type !== 'streamer' && r() < .22;
      out.push({
        id: `${type}:${league}:${i}`, type, role, name: this.nick(r, lang, type, main),
        skill: (type === 'streamer' ? 56 + r() * 16 : type === 'otp' ? 57 + r() * 14 : 46 + r() * 20) + (prodigy ? 10 : 0),
        age: type === 'streamer' ? 21 + Math.floor(r() * 9) : 16 + Math.floor(r() * (prodigy ? 4 : 9)),
        prodigy,
        games: type === 'streamer' ? [7, 13] : type === 'otp' ? [5, 10] : [2, 8],
        pool,
      });
    }
    return out;
  },

  // 한 계정의 시즌 시뮬레이션
  simulate(acc, avgSkill) {
    const r = this.rng('sim:' + acc.id + ':' + this.today());
    // 챔피언 선택은 별도 난수: 연습 지시를 바꿔도 승패·LP 흐름은 그대로 두고 픽만 바뀌게
    const rc = this.rng('pick:' + acc.id + ':' + this.today());
    const prac = acc.player && this.practice()[acc.player.id];
    const res = { lp: 0, w: 0, l: 0, lpYesterday: 0, champs: {}, roles: {}, history: [] };
    const all = Champions.list;
    for (let day = this.DAYS; day >= 1; day--) {
      const n = acc.games[0] + Math.floor(r() * (acc.games[1] - acc.games[0] + 1));
      for (let i = 0; i < n; i++) {
        // 라인: 대부분 주 라인, 가끔 튄다
        const offRole = r() < (acc.type === 'otp' ? .06 : .14);
        const role = offRole ? this.pick(r, G.ROLES.filter(x => x !== acc.role)) : acc.role;
        const pracRoll = rc(), offPick = this.pick(rc, all.filter(c => c.positions.includes(role))).id, mainPick = this.weighted(rc, acc.pool);
        const champ = prac && day <= this.PRACTICE_DAYS && pracRoll < .45 ? prac.c : offRole ? offPick : mainPick;
        // 승률: 실력 차는 작게, 팀운은 크게
        const p = Math.max(.45, Math.min(.62, .5 + (acc.skill - avgSkill) * .006 - (offRole ? .05 : 0)));
        const win = r() < p;
        const lp = win ? 17 + Math.floor(r() * 7) : -(15 + Math.floor(r() * 7));
        res.lp += lp;
        if (day > 1) res.lpYesterday += lp;
        win ? res.w++ : res.l++;
        const cs = res.champs[champ] ||= { g: 0, w: 0 };
        cs.g++; if (win) cs.w++;
        res.roles[role] = (res.roles[role] || 0) + 1;
        const k = Math.floor(r() * (win ? 10 : 6) + (acc.skill - 50) / 10);
        res.history.push({
          day, champ, role, win, lp,
          k: Math.max(0, k), d: Math.floor(r() * (win ? 5 : 8)) + (win ? 0 : 1), a: Math.floor(r() * 14),
          min: 22 + Math.floor(r() * 16), practice: prac && champ === prac.c && day <= this.PRACTICE_DAYS,
        });
        if (res.history.length > this.HISTORY) res.history.shift();
      }
    }
    res.history.reverse();
    return res;
  },

  build() {
    const team = Roster.team();
    const key = team.league + '|' + this.today() + '|' + JSON.stringify(this.practice());
    if (this.cache && this.cache.key === key) return this.cache;
    const accs = this.accounts(team.league);
    const avg = accs.reduce((s, a) => s + a.skill, 0) / accs.length;
    accs.forEach(a => Object.assign(a, this.simulate(a, avg)));
    const base = 900; // 챌린저 컷 근처에서 출발
    accs.forEach(a => { a.lpNow = base + a.lp; a.lpPrev = base + a.lpYesterday; });
    const prevRank = [...accs].sort((x, y) => y.lpPrev - x.lpPrev).reduce((m, a, i) => (m[a.id] = i + 1, m), {});
    const ladder = accs.sort((x, y) => y.lpNow - x.lpNow).slice(0, 100);
    ladder.forEach((a, i) => { a.rank = i + 1; a.delta = prevRank[a.id] - a.rank; });
    this.cache = { key, ladder, team };
    return this.cache;
  },

  // 서버 상위 100명은 모두 챌린저 (챌린저 정원 300명)
  tier() { return ['챌린저', 'ch']; },
  wr(a) { return Math.round(a.w / Math.max(1, a.w + a.l) * 100); },
  topChamps(a, n) { return Object.entries(a.champs).sort((x, y) => y[1].g - x[1].g).slice(0, n); },
  ic(c, cls = '') { const ch = Champions.byId[c]; return ch ? `<img class="sq-ic ${cls}" src="${ch.icon}" alt="" title="${UI.esc(ch.name)}" loading="lazy">` : ''; },
  dayLabel(d) { return d === 1 ? '오늘' : d === 2 ? '어제' : `${d - 1}일 전`; },

  async render(el) {
    el.innerHTML = '<div class="placeholder-view"><p>솔랭 순위를 불러오는 중…</p></div>';
    await Promise.all([Portal.ready, Mastery.load()]);
    const { ladder, team } = this.build();
    const mine = ladder.filter(a => a.team && a.team.id === team.id);
    if (!ladder.some(a => a.id === this.selId)) this.selId = (mine[0] || ladder[0]).id;
    const count = t => ladder.filter(a => a.type === t).length;
    const F = [['all', '전체'], ['mine', `우리 팀 ${mine.length}`], ['pro', `프로 ${count('pro')}`], ['streamer', `스트리머 ${count('streamer')}`], ['amateur', `일반인 ${count('amateur')}`], ['otp', `장인 ${count('otp')}`], ['prodigy', '유망주']];

    el.innerHTML = `
      <div class="sq-page">
        <div class="sq-main">
          <div class="card rs-head">
            <div class="rs-title">
              <h2>솔랭 순위 <small>${this.SERVER[team.league]} 서버 상위 100</small></h2>
              <span>${this.today().replace(/-/g, '.')} 기준 · 2027 시즌 프리시즌</span>
            </div>
            <div class="rs-stats">
              <div><span class="k">우리 팀 최고 순위</span><b>${mine.length ? mine[0].rank + '위' : '-'}</b></div>
              <div><span class="k">100위 내 우리 선수</span><b>${mine.length}</b></div>
              <div><span class="k">유망주</span><b>${ladder.filter(a => a.prodigy).length}</b></div>
            </div>
          </div>
          <div class="ch-bar">
            <div class="seg sq-filter">${F.map(([k, l]) => `<button class="${this.filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
            <input class="ch-search sq-search" type="search" placeholder="소환사명 검색" value="${UI.esc(this.q)}">
          </div>
          <div class="card rs-table-wrap sq-wrap">
            <table class="rs-table sq-table">
              <thead><tr><th class="num">#</th><th>소환사</th><th>라인</th><th>티어</th><th class="num">LP</th><th>승패</th><th>모스트</th><th>최근 10판</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
        <aside class="card sq-detail"></aside>
      </div>`;

    $('.sq-filter', el).onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      this.filter = b.dataset.f;
      $$('.sq-filter button', el).forEach(x => x.classList.toggle('on', x === b));
      this.drawTable(el);
    };
    $('.sq-search', el).oninput = e => { this.q = e.target.value; this.drawTable(el); };
    $('.sq-table tbody', el).onclick = e => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      this.selId = tr.dataset.id;
      $$('.sq-table tbody tr', el).forEach(x => x.classList.toggle('sel', x === tr));
      this.drawDetail(el);
      if (matchMedia('(max-width: 1023px)').matches) $('.sq-detail', el).scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    this.drawTable(el);
    this.drawDetail(el);
  },

  drawTable(el) {
    const { ladder, team } = this.cache;
    const q = this.q.trim().toLowerCase();
    const rows = ladder.filter(a =>
      (this.filter === 'all' || (this.filter === 'mine' ? a.team && a.team.id === team.id : this.filter === 'prodigy' ? a.prodigy : a.type === this.filter)) &&
      (!q || a.name.toLowerCase().includes(q)));
    $('.sq-table tbody', el).innerHTML = rows.map(a => {
      const [tl, tc] = this.tier(a);
      const [typeLabel, typeCls] = this.TYPES[a.type];
      const wr = this.wr(a);
      return `
        <tr data-id="${a.id}" class="${a.id === this.selId ? 'sel' : ''} ${a.team && a.team.id === team.id ? 'mine' : ''}">
          <td class="num"><b class="sq-rank">${a.rank}</b><small class="sq-delta ${a.delta > 0 ? 'up' : a.delta < 0 ? 'down' : ''}">${a.delta > 0 ? '▲' + a.delta : a.delta < 0 ? '▼' + -a.delta : '-'}</small></td>
          <td><div class="sq-name">${a.team ? G.team(a.team, 'xs') : ''}<b>${UI.esc(a.name)}</b><i class="sq-type ${typeCls}">${typeLabel}</i>${a.prodigy ? '<i class="sq-type prodigy">유망주</i>' : ''}${this.offers()[a.id] ? '<i class="sq-type offered">제의함</i>' : ''}</div></td>
          <td>${G.pos(a.role)}</td>
          <td><span class="sq-tier ${tc}">${tl}</span></td>
          <td class="num"><b>${a.lpNow.toLocaleString()}</b></td>
          <td><div class="sq-wl"><span>${a.w}승 ${a.l}패</span><div class="sq-wr"><i style="width:${wr}%"></i></div><b class="${wr >= 58 ? 'good' : ''}">${wr}%</b></div></td>
          <td><div class="sq-most">${this.topChamps(a, 3).map(([c]) => this.ic(c)).join('')}</div></td>
          <td><div class="sq-form">${a.history.slice(0, 10).map(h => `<i class="${h.win ? 'w' : 'l'}"></i>`).join('')}</div></td>
        </tr>`;
    }).join('') || '<tr><td colspan="8" class="ms-none" style="text-align:center;padding:30px">해당하는 소환사가 없습니다.</td></tr>';
  },

  drawDetail(el) {
    const a = this.cache.ladder.find(x => x.id === this.selId);
    const box = $('.sq-detail', el);
    if (!a) { box.innerHTML = ''; return; }
    const mine = a.team && a.team.id === this.cache.team.id;
    const [typeLabel, typeCls] = this.TYPES[a.type];
    const total = a.w + a.l;
    const prac = a.player && this.practice()[a.player.id];
    const offered = this.offers()[a.id];

    box.innerHTML = `
      <div class="sq-d-head">
        ${a.player ? G.face(a.player, 'pl-ph') : `<div class="pl-ph pl-ph-empty sq-anon">${G.pos(a.role)}</div>`}
        <div>
          <h3>${UI.esc(a.name)}</h3>
          <div class="sq-d-sub"><i class="sq-type ${typeCls}">${typeLabel}</i>${a.team ? `${G.team(a.team, 'xs')}<span>${UI.esc(a.team.name)}</span>` : `<span>${a.age}세</span>`}${a.prodigy ? '<i class="sq-type prodigy">유망주</i>' : ''}</div>
        </div>
        <div class="sq-d-rank"><b>${a.rank}</b><span>위</span></div>
      </div>
      <div class="sq-d-stats">
        <div><span>LP</span><b class="num">${a.lpNow.toLocaleString()}</b></div>
        <div><span>승률</span><b class="num">${this.wr(a)}%</b></div>
        <div><span>${this.DAYS}일 판수</span><b class="num">${total}</b></div>
      </div>

      ${mine ? `
        <div class="sq-box">
          <div class="sq-box-head"><b>연습 챔피언 지시</b><small>지정하면 ${this.PRACTICE_DAYS}일 동안 그 챔피언 판수가 늘어납니다</small></div>
          <div class="sq-prac">
            <select class="sq-prac-sel">
              <option value="">지시 없음</option>
              ${Champions.list.filter(c => c.positions.includes(a.role)).map(c => `<option value="${c.id}" ${prac && prac.c === c.id ? 'selected' : ''}>${UI.esc(c.name)}</option>`).join('')}
            </select>
            ${prac ? `${this.ic(prac.c)}<span class="sq-prac-on">연습 중</span>` : ''}
          </div>
        </div>` : ''}

      ${!a.team && a.type !== 'streamer' ? `
        <div class="sq-box ${a.prodigy ? 'hot' : ''}">
          <div class="sq-box-head"><b>테스트 제의</b><small>${a.prodigy ? '스카우트 팀이 주목하는 유망주입니다' : '프로 경력이 없는 일반 소환사입니다'}</small></div>
          <div class="sq-offer">
            <span>${a.age}세 · ${G.ROLE_KO[a.role]} · 잠재력 ${UI.stars(a.prodigy ? 4 : a.skill > 62 ? 3 : 2)}</span>
            <button class="btn-primary sq-offer-btn" ${offered ? 'disabled' : ''}>${offered ? '제의 완료' : '테스트 제의'}</button>
          </div>
        </div>` : ''}

      <h4>라인 분포</h4>
      <div class="sq-roles">${G.ROLES.map(r => {
        const v = Math.round((a.roles[r] || 0) / total * 100);
        return `<div class="${r === a.role ? 'main' : ''}">${G.pos(r)}<div class="sq-bar"><i style="width:${v}%"></i></div><span class="num">${v}%</span></div>`;
      }).join('')}</div>

      <h4>솔랭 챔피언 <small>${this.DAYS}일</small></h4>
      <div class="sq-champs">${this.topChamps(a, 6).map(([c, s]) => `
        <div>${this.ic(c)}<b>${UI.esc(Champions.byId[c].name)}</b><span class="num">${s.g}판</span><span class="num ${s.w / s.g >= .6 ? 'good' : ''}">${Math.round(s.w / s.g * 100)}%</span></div>`).join('')}
      </div>

      <h4>최근 전적 <small>${this.HISTORY}판</small></h4>
      <div class="sq-hist">${a.history.map(h => `
        <div class="sq-game ${h.win ? 'w' : 'l'}">
          <b class="sq-res">${h.win ? '승' : '패'}</b>
          ${this.ic(h.champ)}
          <span class="sq-g-role ${h.role !== a.role ? 'off' : ''}" title="${h.role !== a.role ? '라인 튐' : ''}">${G.pos(h.role)}</span>
          <span class="sq-kda num">${h.k} / <em>${h.d}</em> / ${h.a}</span>
          <span class="sq-lp num">${h.lp > 0 ? '+' : ''}${h.lp}</span>
          <span class="sq-when">${h.min}분 · ${this.dayLabel(h.day)}</span>
          ${h.practice ? '<i class="sq-type prac">연습</i>' : ''}
        </div>`).join('')}
      </div>`;

    const sel = $('.sq-prac-sel', box);
    if (sel) sel.onchange = () => {
      // TODO: 기능 연결 — 날짜 진행 시 만료, 솔랭 판수를 숙련도 경험치로 누적
      if (sel.value) this.practice()[a.player.id] = { c: sel.value, from: this.today() };
      else delete this.practice()[a.player.id];
      this.build();
      this.drawTable(el);
      this.drawDetail(el);
    };
    const offer = $('.sq-offer-btn', box);
    if (offer) offer.onclick = () => UI.modal({
      title: '테스트 제의',
      body: `<p><b>${UI.esc(a.name)}</b> (${a.age}세 · ${G.ROLE_KO[a.role]})에게 입단 테스트를 제의합니다.</p><p style="color:var(--muted);font-size:12px">수락하면 챌린저스 팀과 함께 일주일간 테스트를 진행합니다. 결과는 메시지로 전달됩니다.</p>`,
      actions: [{ label: '취소' }, {
        label: '제의 보내기', primary: true,
        onClick: () => { this.offers()[a.id] = { date: this.today() }; this.drawTable(el); this.drawDetail(el); }, // TODO: 기능 연결 — 수락 여부·테스트 결과 메시지
      }],
    });
  },
};

Views['training-soloq'] = el => SoloQ.render(el);

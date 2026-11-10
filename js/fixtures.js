// 포털 > 경기 일정 · 캘린더: Schedule(실제 2026 일정 기반 2027 시즌)을 보여준다
const Fixtures = {
  scope: 'mine',   // mine | league
  eventId: 'all',
  month: null,     // 캘린더: 'YYYY-MM'
  selDay: null,

  team() { return Roster.team(); },
  today() { return (Portal.data && Portal.data.date) || '2026-11-10'; },

  side(id, cls = '', m = null) {
    const t = Schedule.team(id);
    if (t) return `<span class="fx-team ${cls}">${G.team(t, 'xs')}<b>${UI.esc(t.short)}</b></span>`;
    const label = m && m.group ? m.group : '미정';
    return `<span class="fx-team tbd ${cls}" title="${m && m.group ? '앞 단계 순위가 정해지면 배정' : '진출팀 확정 후 배정'}"><i class="fx-tbd">?</i><b>${UI.esc(label)}</b></span>`;
  },
  ord(m) { const o = Schedule.orderLabel(m); return o ? `<span class="fx-ord">${o}</span>` : ''; },
  evBadge(ev) {
    const [, cls] = Schedule.KIND[ev.kind];
    return `<span class="fx-ev ${cls}">${UI.esc(ev.short)}</span>`;
  },
  time(m) { return m.t.slice(11, 16); },

  // ---------- 경기 일정 ----------
  async renderFixtures(el) {
    el.innerHTML = '<div class="placeholder-view"><p>일정을 불러오는 중…</p></div>';
    await Portal.ready;
    await Schedule.load();
    const t = this.team();
    const mine = Schedule.forTeam(t.id);
    const next = Schedule.next(t.id, this.today());
    const evs = Schedule.eventsFor(t.league).filter(e => e.league !== 'ALL' && !e.past && Schedule.released(e));
    const rel = Schedule.nextRelease(t.league, this.today());

    el.innerHTML = `
      <div class="fx-page">
        <div class="fx-main">
          <div class="card rs-head">
            <div class="rs-title">
              <h2>경기 일정 <small>${UI.esc(t.name)} · ${Schedule.YEAR} 시즌</small></h2>
              <span>2026 실제 ${t.league} 일정 틀 · 한국 시간 · 일정은 실제와 비슷한 시기에 단계별로 발표됩니다</span>
            </div>
            <div class="rs-stats">
              <div><span class="k">확정 경기</span><b>${mine.length}</b></div>
              <div><span class="k">다음 경기</span><b>${next ? 'D-' + Fmt.daysBetween(this.today(), next.t) : '-'}</b></div>
              <div><span class="k">다음 일정 발표</span><b>${rel ? rel.pub.slice(5).replace('-', '.') : '-'}</b></div>
            </div>
          </div>
          <div class="ch-bar">
            <div class="seg fx-scope">
              <button class="${this.scope === 'mine' ? 'on' : ''}" data-s="mine">우리 팀</button>
              <button class="${this.scope === 'league' ? 'on' : ''}" data-s="league">${t.league} 전체</button>
            </div>
            <select class="ch-sort fx-ev-sel">
              <option value="all">모든 대회</option>
              ${evs.map(e => `<option value="${e.id}" ${this.eventId === e.id ? 'selected' : ''}>${UI.esc(e.label)}</option>`).join('')}
            </select>
            <span class="ch-count fx-count"></span>
          </div>
          <div class="fx-list"></div>
        </div>
        <aside class="card fx-side">${this.timeline(t.league)}</aside>
      </div>`;

    $('.fx-scope', el).onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      this.scope = b.dataset.s;
      $$('.fx-scope button', el).forEach(x => x.classList.toggle('on', x === b));
      this.drawList(el);
    };
    $('.fx-ev-sel', el).onchange = e => { this.eventId = e.target.value; this.drawList(el); };
    this.drawList(el);
  },

  drawList(el) {
    const t = this.team();
    let list = this.scope === 'mine' ? Schedule.forTeam(t.id) : [...Schedule.forLeague(t.league), ...Schedule.matches.filter(m => m.league === 'INTL')];
    if (this.eventId !== 'all') list = list.filter(m => m.event === this.eventId);
    list.sort((a, b) => a.t.localeCompare(b.t));
    $('.fx-count', el).textContent = `${list.length}경기`;
    const next = Schedule.next(t.id, this.today());
    let lastMonth = '', lastDay = '';
    $('.fx-list', el).innerHTML = list.length ? list.map(m => {
      const ev = Schedule.eventOf(m);
      const ym = m.t.slice(0, 7), day = m.t.slice(0, 10);
      const head = ym !== lastMonth ? `<h3 class="fx-month">${+ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월</h3>` : '';
      const dayCell = day !== lastDay ? `<div class="fx-day"><b>${+day.slice(8)}</b><span>${Fmt.dow(day)}</span></div>` : '<div class="fx-day"></div>';
      lastMonth = ym; lastDay = day;
      const isMine = m.t1 === t.id || m.t2 === t.id;
      return `${head}
        <div class="fx-row ${isMine ? 'mine' : ''} ${next && next.id === m.id ? 'next' : ''}">
          ${dayCell}
          <span class="fx-time num">${this.time(m)}${this.ord(m)}</span>
          ${this.evBadge(ev)}
          <div class="fx-vs">${this.side(m.t1, 'l', m)}<i>vs</i>${this.side(m.t2, 'r', m)}</div>
          <span class="fx-tab">${UI.esc(m.tab || '')}</span>
          <span class="fx-bo">Bo${m.bo}</span>
          ${next && next.id === m.id ? '<span class="fx-next">다음 경기</span>' : ''}
        </div>`;
    }).join('') : this.emptyNote(t.league);
  },

  emptyNote(league) {
    const rel = Schedule.nextRelease(league, this.today());
    const first = Schedule.firstEvent(league);
    return `<div class="card fx-empty">
      <b>아직 발표된 경기 일정이 없습니다</b>
      ${first ? `<span>${UI.esc(first.label)}은 ${Fmt.dayLabel(first.start)} 개막합니다.</span>` : ''}
      ${rel ? `<span>${UI.esc(rel.short)} 대진·일정은 <em>${Fmt.dayLabel(rel.pub)}경</em> 발표 예정입니다. (실제 2026년에는 개막 ${rel.lead}일 전에 공개)</span>` : ''}
      <small>멀리 있는 대회는 기간만 정해져 있고, 대진은 발표일이 되어야 나옵니다.</small>
    </div>`;
  },

  // 시즌 흐름: 리그 단계 + 국제대회
  timeline(league) {
    const today = this.today();
    const evs = Schedule.eventsFor(league).filter(e => e.kind !== 'event' || e.league === league).sort((a, b) => a.start.localeCompare(b.start));
    return `
      <h3 class="fx-side-h">${Schedule.YEAR} 시즌 흐름</h3>
      <div class="fx-tl">${evs.map(e => {
        const state = e.end < today ? 'done' : e.start <= today ? 'now' : '';
        const [kind, cls] = Schedule.KIND[e.kind];
        return `
          <div class="fx-tl-row ${state}">
            <i class="fx-dot ${cls}"></i>
            <div>
              <b>${UI.esc(e.label)}</b>
              <span>${e.start.slice(5).replace('-', '.')} – ${e.end.slice(5).replace('-', '.')} · ${kind}${state === 'now' ? ' · <em>진행 중</em>' : ''}</span>
              ${Schedule.releaseText(e) ? `<small class="${Schedule.released(e) ? 'rel' : 'unrel'}">${Schedule.releaseText(e)}</small>` : ''}
            </div>
          </div>`;
      }).join('')}</div>`;
  },

  // ---------- 캘린더 ----------
  async renderCalendar(el) {
    el.innerHTML = '<div class="placeholder-view"><p>캘린더를 불러오는 중…</p></div>';
    await Portal.ready;
    await Schedule.load();
    const t = this.team();
    this.month = this.month || this.today().slice(0, 7);
    this.selDay = this.selDay || this.today();
    el.innerHTML = `
      <div class="fx-page cal-page">
        <div class="fx-main">
          <div class="card cal-head">
            <button class="cal-nav" data-d="-1" aria-label="이전 달">‹</button>
            <h2 class="cal-title"></h2>
            <button class="cal-nav" data-d="1" aria-label="다음 달">›</button>
            <button class="btn-ghost cal-today">오늘</button>
            <div class="cal-legend">
              ${['stove', 'regular', 'playoffs', 'intl'].map(k => `<span><i class="fx-dot ${Schedule.KIND[k][1]}"></i>${Schedule.KIND[k][0]}</span>`).join('')}
              <span><i class="cal-my-dot"></i>우리 팀 경기</span>
            </div>
          </div>
          <div class="card cal-grid-wrap"><div class="cal-grid"></div></div>
        </div>
        <aside class="card fx-side cal-side"></aside>
      </div>`;
    $$('.cal-nav', el).forEach(b => b.onclick = () => { this.month = this.shiftMonth(this.month, +b.dataset.d); this.drawMonth(el); });
    $('.cal-today', el).onclick = () => { this.month = this.today().slice(0, 7); this.selDay = this.today(); this.drawMonth(el); this.drawDay(el); };
    $('.cal-grid', el).onclick = e => {
      const c = e.target.closest('[data-day]'); if (!c) return;
      this.selDay = c.dataset.day;
      $$('.cal-cell', el).forEach(x => x.classList.toggle('sel', x === c));
      this.drawDay(el);
      if (matchMedia('(max-width: 1023px)').matches) $('.cal-side', el).scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    this.drawMonth(el);
    this.drawDay(el);
  },

  shiftMonth(ym, n) {
    const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1);
    const out = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return out < '2026-11' ? '2026-11' : out > '2027-12' ? '2027-12' : out;
  },

  drawMonth(el) {
    const t = this.team();
    const [y, m] = this.month.split('-').map(Number);
    $('.cal-title', el).textContent = `${y}년 ${m}월`;
    const first = new Date(y, m - 1, 1);
    const lead = (first.getDay() + 6) % 7; // 월요일 시작
    const days = new Date(y, m, 0).getDate();
    const ymd = d => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const mine = Schedule.forTeam(t.id);
    const league = Schedule.forLeague(t.league);
    const today = this.today();
    const pubs = day => Schedule.eventsFor(t.league).filter(e => e.pub === day && e.kind !== 'stove' && !e.past && (e.league === t.league || e.league === 'INTL'));
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="cal-cell empty"></div>');
    for (let d = 1; d <= days; d++) {
      const day = ymd(d);
      const evs = Schedule.eventsOn(t.league, day).filter(e => e.kind !== 'event' || e.league === t.league);
      const my = mine.filter(x => x.t.startsWith(day));
      const lg = league.filter(x => x.t.startsWith(day)).length + Schedule.matches.filter(x => x.league === 'INTL' && x.t.startsWith(day)).length;
      cells.push(`
        <div class="cal-cell ${day === today ? 'today' : ''} ${day === this.selDay ? 'sel' : ''} ${day < today ? 'past' : ''}" data-day="${day}">
          <span class="cal-d">${d}</span>
          <div class="cal-bars">${evs.map(e => `<i class="fx-bar ${Schedule.KIND[e.kind][1]} ${Schedule.released(e) ? '' : 'unrel'}" title="${UI.esc(e.label)}${Schedule.released(e) ? '' : ' · 일정 미발표'}"></i>`).join('')}</div>
          ${pubs(day).map(e => `<span class="cal-pub" title="${UI.esc(e.label)} 일정 발표">📢 ${UI.esc(e.short)}</span>`).join('')}
          ${my.map(x => { const o = Schedule.opponent(x, t.id); return `<div class="cal-my">${o ? G.team(o, 'xs') : ''}<span>${o ? UI.esc(o.short) : '미정'}</span><small>${this.time(x)}</small></div>`; }).join('')}
          ${!my.length && lg ? `<span class="cal-lg">경기 ${lg}</span>` : ''}
        </div>`);
    }
    $('.cal-grid', el).innerHTML = ['월', '화', '수', '목', '금', '토', '일'].map(d => `<div class="cal-dow">${d}</div>`).join('') + cells.join('');
  },

  drawDay(el) {
    const t = this.team();
    const day = this.selDay;
    const evs = Schedule.eventsOn(t.league, day);
    const ms = Schedule.matches.filter(m => m.t.startsWith(day) && (m.league === t.league || m.league === 'INTL'));
    // TODO: 기능 연결 — 훈련·스크림·면담 등 구단 일정
    $('.cal-side', el).innerHTML = `
      <h3 class="fx-side-h">${Fmt.date(day)}</h3>
      ${evs.length ? `<div class="cal-evs">${evs.map(e => `<div>${this.evBadge(e)}<span>${e.start.slice(5).replace('-', '.')} – ${e.end.slice(5).replace('-', '.')}${Schedule.released(e) ? '' : ' · 일정 미발표'}</span></div>`).join('')}</div>` : '<p class="ms-none">공식 일정 없음</p>'}
      ${(() => { const p = Schedule.eventsFor(t.league).filter(e => e.pub === day && e.kind !== 'stove' && !e.past); return p.length ? `<div class="cal-evs">${p.map(e => `<div>📢 <span>${UI.esc(e.label)} 대진·일정 발표</span></div>`).join('')}</div>` : ''; })()}
      <h4>경기 <small>${ms.length}</small></h4>
      ${ms.length ? ms.map(m => `
        <div class="fx-row compact ${m.t1 === t.id || m.t2 === t.id ? 'mine' : ''}">
          <span class="fx-time num">${this.time(m)}${this.ord(m)}</span>
          <div class="fx-vs">${this.side(m.t1, 'l', m)}<i>vs</i>${this.side(m.t2, 'r', m)}</div>
          <span class="fx-bo">Bo${m.bo}</span>
        </div>`).join('') : '<p class="ms-none">이 날은 경기가 없습니다.</p>'}`;
  },
};

Views['portal-fixtures'] = el => Fixtures.renderFixtures(el);
Views['portal-calendar'] = el => Fixtures.renderCalendar(el);

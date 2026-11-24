// 대회 페이지 (베타 건의): 대회 이름을 누르면 개요 · 순위 · 대진표 · 일정 · 결과 · 통계
//   + 경기 당일 아침 '오늘의 경기' 프리뷰 메시지 (대회 · 라운드 · 순위 영향 · 상대 폼 · 경계 선수)
const EventPage = {
  id: null, tab: 'over',
  ev() { return Schedule.byEvent && Schedule.byEvent[this.id]; },
  rec(m) { return (App.state.season || {})[m.id]; },
  open(id) { if (!id || !Schedule.byEvent[id]) return; this.id = id; this.tab = 'over'; Router.go('match-event'); },
  matches(id = this.id) { return Schedule.all.filter(m => m.event === id && !m.dead).sort((a, b) => a.t.localeCompare(b.t)); },
  // 녹아웃(대진표)인 라운드: 주차 · 그룹 · 스위스가 아닌 것. 월즈 1~5라운드는 스위스
  knock(e, tab) { if (/Week|Groups? (Day|Stage)|Swiss|Tiebreak|Last Chance/i.test(tab)) return false; if (e.base === 'worlds' && /^Round \d/.test(tab)) return false; return true; },
  swiss(e) { return e.base === 'worlds' || e.base === 'lcs-lockin'; },
  win(m) { const r = this.rec(m); return r ? (r.w === 1 ? r.t1 : r.t2) : null; },
  T(id) { return Schedule.team(id); },
  tname(id, cls = '') { const t = this.T(id); return t ? `<span class="fx-team ${cls}">${G.team(t, 'xs')}<b>${UI.esc(t.short)}</b></span>` : `<span class="fx-team tbd ${cls}"><i class="fx-tbd">?</i><b>미정</b></span>`; },
  // 지난 우승팀: 이 커리어에서 같은 대회의 이전 해 우승
  past(e) { return Object.entries(App.state.champs || {}).filter(([id]) => id !== e.id && (Schedule.byEvent[id] || {}).base === e.base).map(([id, tid]) => [Schedule.byEvent[id].year, tid]).sort((a, b) => b[0] - a[0]); },
  champion(e) { return (App.state.champs || {})[e.id] || null; },
  format(e, ms) {
    const tabs = [...new Set(ms.map(m => m.tab))], ko = tabs.filter(t => this.knock(e, t)), grp = tabs.filter(t => !this.knock(e, t)), bo = [...new Set(ms.map(m => m.bo))].sort();
    const parts = [];
    if (grp.length) parts.push(this.swiss(e) ? '스위스 스테이지' : /Group|Groups/i.test(grp[0]) ? '그룹 스테이지' : `풀리그 (${grp.length}주)`);
    if (ko.length) parts.push(`${/Play-In/i.test(ko.join()) ? '플레이-인 + ' : ''}토너먼트 ${ko.filter(t => !/Play-In|Knight/i.test(t)).length}라운드`);
    return `${parts.join(' → ')} · ${bo.map(b => 'Bo' + b).join(' / ')}`;
  },

  async view(el) {
    await Portal.ready; await Schedule.load();
    const e = this.ev(); if (!e) { el.innerHTML = '<div class="card fx-empty"><b>대회를 찾을 수 없습니다</b></div>'; return; }
    const ms = this.matches(), done = ms.filter(m => this.rec(m)), my = App.state.teamId, ko = ms.filter(m => this.knock(e, m.tab)), grp = ms.filter(m => !this.knock(e, m.tab));
    const tabs = [['over', '개요'], ...(grp.length ? [['table', this.swiss(e) ? '스위스' : '순위']] : []), ...(ko.length ? [['bracket', '대진표']] : []), ['games', '일정 · 결과'], ['stats', '선수 통계']];
    if (!tabs.some(t => t[0] === this.tab)) this.tab = 'over';
    const state = e.end < Clock.today() || (done.length && done.length === ms.length) ? '종료' : e.start <= Clock.today() ? '진행 중' : '예정';
    el.innerHTML = `
      <div class="cr-page">
        <div class="card rs-head ev-head">
          <div class="rs-title"><h2>${UI.esc(e.label)} <small class="ev-st ${state === '진행 중' ? 'on' : ''}">${state}</small></h2><span>${Schedule.KIND[e.kind][0]} · ${e.start.slice(5).replace('-', '.')} – ${e.end.slice(5).replace('-', '.')} · ${UI.esc(this.format(e, ms))}</span></div>
          <div class="rs-stats"><div><span class="k">치른 경기</span><b>${done.length} / ${ms.length}</b></div>${this.champion(e) ? `<div><span class="k">우승</span><b>${UI.esc(this.T(this.champion(e)).short)}</b></div>` : ''}</div>
        </div>
        <div class="ch-bar"><div class="seg ev-tabs">${tabs.map(([k, l]) => `<button class="${this.tab === k ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div></div>
        <div class="ev-body">${this[this.tab](e, ms, { done, ko, grp, my })}</div>
      </div>`;
    $('.ev-tabs', el).onclick = x => { const b = x.target.closest('button'); if (!b) return; this.tab = b.dataset.k; this.view(el); };
    el.onclick = x => { const r = x.target.closest('[data-mid]'), p = x.target.closest('.ev-body [data-pid]'); if (r && this.rec(Schedule.all.find(m => m.id === r.dataset.mid))) CompResults.report(r.dataset.mid); else if (p) Player.open(p.dataset.pid); };
  },

  over(e, ms, { done, my }) {
    const teams = [...new Set(ms.flatMap(m => [m.t1, m.t2]).filter(Boolean))], mine = teams.includes(my);
    const next = ms.find(m => !this.rec(m) && m.t1 && m.t2), last = [...done].reverse().slice(0, 5);
    const past = this.past(e);
    return `<div class="cr-grid">
      <div class="card"><div class="card-head"><h3>대회 정보</h3></div><ul class="op-notes">
        <li>기간 <b>${Fmt.dayLabel(e.start)} ~ ${Fmt.dayLabel(e.end)}</b></li>
        <li>방식 <b>${UI.esc(this.format(e, ms))}</b></li>
        <li>참가 팀 <b>${teams.length || '미정'}</b>${mine ? ' · <em class="ev-mine">우리 팀 참가</em>' : ''}</li>
        ${this.champion(e) ? `<li>우승 ${this.tname(this.champion(e))}</li>` : ''}
        ${past.length ? `<li>역대 우승 (이 커리어) ${past.slice(0, 4).map(([y, t]) => `${y} ${this.tname(t)}`).join(' · ')}</li>` : ''}
      </ul>${teams.length ? `<div class="ev-teams">${teams.map(id => this.tname(id)).join('')}</div>` : ''}</div>
      <div class="card"><div class="card-head"><h3>최근 결과 · 다음 경기</h3></div>
        ${last.map(m => this.row(m)).join('') || '<p class="ms-none">아직 치른 경기가 없습니다.</p>'}
        ${next ? `<h4 class="op-cap">다음 경기</h4>${this.row(next)}` : ''}
      </div></div>`;
  },
  row(m) {
    const r = this.rec(m), t1 = r ? r.t1 : m.t1, t2 = r ? r.t2 : m.t2;
    return `<div class="fx-row compact cr-row ${r ? 'played' : ''}" ${r ? `data-mid="${m.id}"` : ''}><span class="fx-time num">${m.t.slice(5, 10).replace('-', '.')}</span><div class="fx-vs">${this.tname(t1, 'l' + (r ? (r.w === 1 ? ' cr-win' : ' cr-lose') : ''))}${r ? `<b class="fx-score">${r.s1} : ${r.s2}</b>` : '<i>vs</i>'}${this.tname(t2, 'r' + (r ? (r.w === 2 ? ' cr-win' : ' cr-lose') : ''))}</div></div>`;
  },

  // 순위 (풀리그 · 그룹) / 스위스는 전적별
  table(e, ms, { grp, my }) {
    const rows = {};
    grp.forEach(m => { const r = this.rec(m); [m.t1, m.t2].forEach(id => { if (id) rows[id] ||= { id, w: 0, l: 0, sw: 0, sl: 0, g: m.group }; }); if (!r) return;
      [[r.t1, r.s1, r.s2, r.w === 1], [r.t2, r.s2, r.s1, r.w === 2]].forEach(([id, a, b, won]) => { const x = rows[id] ||= { id, w: 0, l: 0, sw: 0, sl: 0 }; won ? x.w++ : x.l++; x.sw += a; x.sl += b; }); });
    const L = Object.values(rows).sort((a, b) => b.w - a.w || a.l - b.l || (b.sw - b.sl) - (a.sw - a.sl));
    if (this.swiss(e)) {
      const by = {}; L.forEach(x => (by[`${x.w}-${x.l}`] ||= []).push(x));
      return `<div class="ev-swiss">${Object.entries(by).sort((a, b) => b[0].split('-')[0] - a[0].split('-')[0] || a[0].split('-')[1] - b[0].split('-')[1]).map(([k, l]) => { const [w, lo] = k.split('-').map(Number);
        return `<div class="card ev-sw ${w >= 3 ? 'up' : lo >= 3 ? 'out' : ''}"><div class="card-head"><h3>${k} <small>${w >= 3 ? '진출' : lo >= 3 ? '탈락' : ''}</small></h3></div>${l.map(x => `<div class="ev-swr ${x.id === my ? 'mine' : ''}">${this.tname(x.id)}</div>`).join('')}</div>`; }).join('')}</div>`;
    }
    const groups = [...new Set(L.map(x => x.g).filter(Boolean))];
    const tbl = list => `<div class="card rs-table-wrap" style="padding:0"><table class="rs-table st-table"><thead><tr><th class="num">#</th><th>팀</th><th class="num">승</th><th class="num">패</th><th class="num">세트 득실</th></tr></thead><tbody>
      ${list.map((x, i) => `<tr class="${x.id === my ? 'mine' : ''}"><td class="num"><b>${i + 1}</b></td><td>${this.tname(x.id)}</td><td class="num">${x.w}</td><td class="num">${x.l}</td><td class="num ${x.sw - x.sl > 0 ? 'good' : x.sw - x.sl < 0 ? 'bad' : ''}">${x.sw - x.sl > 0 ? '+' : ''}${x.sw - x.sl}</td></tr>`).join('')}</tbody></table></div>`;
    return groups.length > 1 ? groups.map(gn => `<h4 class="op-cap">${UI.esc(gn)}</h4>${tbl(L.filter(x => x.g === gn))}`).join('') : tbl(L);
  },

  // 대진표: 라운드(탭)마다 한 열, 날짜순
  bracket(e, ms, { ko, my }) {
    const cols = [];
    ko.forEach(m => { let c = cols.find(x => x.tab === m.tab); if (!c) cols.push(c = { tab: m.tab, ms: [], t: m.t }); c.ms.push(m); });
    cols.sort((a, b) => a.t.localeCompare(b.t));
    return `<div class="ev-bracket">${cols.map(c => `<div class="ev-col"><h4>${UI.esc(G.tab(c.tab))}</h4>${c.ms.map(m => {
      const r = this.rec(m), t1 = r ? r.t1 : m.t1, t2 = r ? r.t2 : m.t2, w = this.win(m), seed = (m.seeds || []).length ? m.seeds : null;
      const line = (id, s, k) => `<div class="ev-bt ${w ? (w === id ? 'w' : 'l') : ''} ${id && id === my ? 'mine' : ''}">${id ? this.tname(id) : `<span class="fx-team tbd"><i class="fx-tbd">?</i><b>${seed ? `${seed[k]}번 시드` : '미정'}</b></span>`}<b class="num">${r ? s : ''}</b></div>`;
      return `<div class="ev-match cr-row ${r ? 'played' : ''}" ${r ? `data-mid="${m.id}"` : ''}><small>${m.t.slice(5, 10).replace('-', '.')} · Bo${m.bo}</small>${line(t1, r && r.s1, 0)}${line(t2, r && r.s2, 1)}</div>`;
    }).join('')}</div>`).join('')}</div>`;
  },
  games(e, ms) {
    let last = '';
    return `<div class="fx-list">${ms.map(m => { const d = m.t.slice(0, 10), h = d !== last ? `<h3 class="fx-month">${Fmt.dayLabel(d)} · ${UI.esc(G.tab(m.tab))}</h3>` : ''; last = d; return h + this.row(m); }).join('')}</div>`;
  },
  stats(e) {
    const rows = typeof PStats !== 'undefined' ? PStats.rows([e.id]) : [], mx = Math.max(0, ...rows.map(r => r.g)), L = rows.filter(r => r.g >= Math.max(1, mx * .4));
    if (!L.length) return '<div class="card fx-empty"><b>아직 기록이 없습니다</b></div>';
    const top = (k, l, f) => `<div class="card"><div class="card-head"><h3>${l}</h3></div>${[...L].sort((a, b) => b[k] - a[k]).slice(0, 5).map((r, i) => `<div class="cr-pog" data-pid="${r.pid}"><span class="num">${i + 1}</span>${r.t ? G.team(r.t, 'xs') : ''}<b>${UI.esc(r.p.name)}</b><span class="num">${f(r[k])}</span></div>`).join('')}</div>`;
    return `<div class="ev-tops">${top('rat', '평점', v => v.toFixed(1))}${top('kda', 'KDA', v => v.toFixed(1))}${top('pog', 'POG', v => v + '회')}${top('dpm', 'DPM', v => Math.round(v))}${top('kp', '킬 관여', v => Math.round(v * 100) + '%')}${top('cspm', 'CS/분', v => v.toFixed(1))}</div>
      <p class="cr-dim" style="margin-top:8px">전체 순위는 <a href="#match-stats">경기 → 선수 통계</a>에서 볼 수 있습니다.</p>`;
  },

  // ---------- 경기 당일 프리뷰 ----------
  preview(today) {
    if (App.state.unemployed || typeof Season === 'undefined') return;
    const m = Season.today(); if (!m) return;
    const P = (App.state.preview ||= {}); if (P[m.id]) return; P[m.id] = 1;
    const my = App.state.teamId, e = Schedule.eventOf(m), o = Schedule.opponent(m, my); if (!e || !o) return;
    const lines = [`${e.label} · ${G.tab(m.tab)} · Bo${m.bo} · ${m.t.slice(11, 16)}`];
    const rv = typeof Rivalry !== 'undefined' && Rivalry.ofMatch(m); if (rv) lines.push(`라이벌전 '${rv.name}'`);
    if (!this.knock(e, m.tab) && e.kind === 'regular') {
      const tb = Results.table(e.league, [e.id]), ri = tb.findIndex(r => r.t.id === my), oi = tb.findIndex(r => r.t.id === o.id);
      if (ri >= 0) {
        const sim = won => { const c = tb.map(r => ({ id: r.t.id, w: r.w + (r.t.id === my ? +won : r.t.id === o.id ? +!won : 0), l: r.l + (r.t.id === my ? +!won : r.t.id === o.id ? +won : 0), d: r.sw - r.sl })); c.sort((a, b) => b.w - a.w || a.l - b.l || b.d - a.d); return c.findIndex(x => x.id === my) + 1; };
        lines.push(`현재 ${ri + 1}위 (${tb[ri].w}승 ${tb[ri].l}패)${oi >= 0 ? ` · 상대 ${oi + 1}위 (${tb[oi].w}승 ${tb[oi].l}패)` : ''}`, `이기면 ${sim(true)}위 · 지면 ${sim(false)}위`);
      }
    } else lines.push(/^(Grand )?Finals?$/i.test(m.tab) ? '결승전입니다. 이기면 우승입니다.' : '토너먼트 경기입니다. 지면 탈락하거나 하위 대진으로 내려갑니다.');
    const form = Match.form(o.id), h = Results.h2h(my, o.id), hw = h.filter(x => Results.won(x, my)).length;
    lines.push(`상대 최근 5경기 ${form.join('') || '-'}${h.length ? ` · 상대 전적 ${hw}승 ${h.length - hw}패` : ''}`);
    const key = typeof PStats !== 'undefined' ? PStats.rows(Object.keys(PStats.st()).filter(id => id.startsWith(e.year + ':'))).filter(r => r.t && r.t.id === o.id && r.g >= 3).sort((a, b) => b.rat - a.rat)[0] : null;
    if (key) lines.push(`경계할 선수: ${key.p.name} (평점 ${key.rat.toFixed(1)} · KDA ${key.kda.toFixed(1)} · POG ${key.pog})`);
    const big = /^(Grand )?Finals?$/i.test(m.tab) ? '결승' : e.kind === 'intl' ? '국제대회' : e.kind === 'playoffs' ? '플레이오프' : rv ? '라이벌전' : '';
    Inbox.push({ time: '09:00', from: { name: '전력분석관', role: 'coach' }, subject: `오늘의 경기${big ? ` [${big}]` : ''} — ${o.short}전 (${e.short || e.label})`, link: 'match-next', body: lines.join('\n') });
  },
};
Views['match-event'] = el => EventPage.view(el);
Engine.on(today => { try { EventPage.preview(today); } catch (e) { console.warn('[preview]', e); } });
// 대회 이름(data-ev)을 누르면 대회 페이지
document.addEventListener('click', e => { const x = e.target.closest('[data-ev]'); if (x && Schedule.byEvent && Schedule.byEvent[x.dataset.ev]) { e.preventDefault(); e.stopPropagation(); const back = x.closest('.modal-back'); if (back) { const b = $('.modal-foot button', back); if (b) b.click(); } EventPage.open(x.dataset.ev); } }, true);   // 캡처: 경기 행(리포트 열기)보다 먼저

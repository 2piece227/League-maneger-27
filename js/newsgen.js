// 뉴스 다양화 (베타 건의): 대회 개막 프리뷰 · 파워랭킹 · 주간 결산 · 빅매치 / 결승 프리뷰 · 이변 · 연승 · 연패 · 최종 순위 · 국제대회 지역 성적
//   기사는 Market.post 로 쌓여 뉴스 화면과 커뮤니티 반응(js/community.js POOLS)에 그대로 붙는다. 우리 리그 + 국제대회만
const NewsGen = {
  st() { return (App.state.ng ||= { done: {}, cap: {}, pwr: {} }); },
  once(key) { const D = this.st().done; if (D[key]) return false; D[key] = 1; return true; },
  cap(today, n = 2) { const C = this.st().cap; if ((C[today] || 0) >= n) return false; C[today] = (C[today] || 0) + 1; return true; },
  lg() { const t = Roster.team(); return t ? t.league : 'LCK'; },
  mine(e) { return e && (e.league === this.lg() || e.league === 'INTL'); },
  T(id) { return Schedule.team(id); },
  rec(m) { return (App.state.season || {})[m.id]; },
  pw(id) { try { return Season.pw(id); } catch (e) { return 70; } },
  // 최근 경기 흐름: +n 연승 / -n 연패
  streak(id) { const L = Results.forTeam(id); let n = 0, s = 0; for (let i = L.length - 1; i >= 0; i--) { const w = Results.won(L[i], id) ? 1 : -1; if (!s) s = w; if (w !== s) break; n++; } return s * n; },
  keyPlayer(tid, Y) { if (typeof PStats === 'undefined') return null; return PStats.yearRows(Y).filter(r => r.t && r.t.id === tid && r.g >= 3).sort((a, b) => b.rat - a.rat)[0] || null; },
  form(id) { return (Match.form(id) || []).join(''); },

  day(today) {
    if (!App.db || !Schedule.events || !App.state.teamId) return;
    const Y = Schedule.season(), evs = Schedule.events.filter(e => e.year === Y && this.mine(e) && ['regular', 'playoffs', 'intl'].includes(e.kind));
    evs.forEach(e => {
      if (Store.addDays(e.start, -3) === today && Schedule.released(e) && this.once('open:' + e.id)) this.opening(e);
      if (e.start === today && e.kind === 'regular' && e.league !== 'INTL' && this.once('pwr:' + e.id)) this.power(e);
      if (e.end < today && this.once('end:' + e.id)) this.ending(e);
    });
    if (new Date(today + 'T00:00:00Z').getUTCDay() === 1) { const e = evs.find(x => x.kind === 'regular' && x.league === this.lg() && x.start < today && Store.addDays(x.end, 2) >= today); if (e && this.once('wk:' + today)) this.weekly(e, today); }
    const tm = Store.addDays(today, 1);
    Schedule.all.filter(m => m.t1 && m.t2 && m.t.slice(0, 10) === tm && this.mine(Schedule.eventOf(m))).forEach(m => this.preview(m));
  },

  // ---------- 개막 프리뷰 ----------
  opening(e) {
    const ids = [...new Set(Schedule.all.filter(m => m.event === e.id).flatMap(m => [m.t1, m.t2]).filter(Boolean))];
    if (!ids.length) { Market.post(`[개막] ${e.label} ${Fmt.dayLabel(e.start)} 개막`, `${Sim.josa(e.label, '이', '가')} 곧 시작됩니다. 진출팀은 앞 대회 결과가 나오면 확정됩니다.`, null); return; }
    const R = ids.map(id => ({ t: this.T(id), v: this.pw(id) })).filter(x => x.t).sort((a, b) => b.v - a.v);
    const fav = R.slice(0, 2), dark = R[Math.min(R.length - 1, 3 + Math.floor(G.rand(e.id, 'dk') * 2))], my = R.find(x => x.t.id === App.state.teamId);
    const body = [`${Sim.josa(e.label, '이', '가')} ${Fmt.dayLabel(e.start)} 막을 올립니다. ${ids.length}팀이 ${Fmt.dayLabel(e.end)}까지 경쟁합니다.`, '',
      `우승 후보: ${fav.map(x => x.t.name).join(', ')}`, dark && !fav.includes(dark) ? `다크호스: ${dark.t.name}` : '',
      my ? `${my.t.short} 전망: 전력 ${R.indexOf(my) + 1}위권 — ${R.indexOf(my) < 2 ? '우승을 노릴 전력입니다.' : R.indexOf(my) < 5 ? '상위권 진입이 목표입니다.' : '반전이 필요한 시즌입니다.'}` : '',
      ...fav.map(x => { const k = this.keyPlayer(x.t.id, e.year); return k ? `${x.t.short} 핵심: ${k.p.name}` : ''; })].filter(Boolean).join('\n');
    Market.post(`[개막] ${e.label} 개막 — 우승 후보 ${fav.map(x => x.t.short).join(' · ')}`, body, null);
  },
  // ---------- 파워랭킹 (정규 시즌 시작일) ----------
  power(e) {
    const prev = this.st().pwr[e.league] || [], tb = Results.table(e.league, Results.mainEvents(e.league));
    const R = App.db.teams.filter(t => t.league === e.league).map(t => { const r = tb.find(x => x.t.id === t.id); return { t, v: this.pw(t.id) + (r ? (r.w - r.l) * .3 : 0) + this.streak(t.id) * .15 }; }).sort((a, b) => b.v - a.v);
    this.st().pwr[e.league] = R.map(x => x.t.id);
    const mv = id => { const i = prev.indexOf(id), j = R.findIndex(x => x.t.id === id); return i < 0 ? '' : i > j ? ` ▲${i - j}` : i < j ? ` ▼${j - i}` : ' -'; };
    const note = x => { const s = this.streak(x.t.id); return s >= 3 ? `${s}연승 중` : s <= -3 ? `${-s}연패 중` : ''; };
    Market.post(`[파워랭킹] ${e.label} — 1위 ${R[0].t.short}, 2위 ${R[1].t.short}`, `${e.label} 개막에 맞춘 파워랭킹입니다.\n\n${R.map((x, i) => `${i + 1}. ${x.t.name}${mv(x.t.id)}${note(x) ? ' · ' + note(x) : ''}`).join('\n')}`, null);
  },
  // ---------- 주간 결산 (월요일) ----------
  weekly(e, today) {
    const from = Store.addDays(today, -7), ms = Schedule.all.filter(m => m.event === e.id && m.t.slice(0, 10) >= from && m.t.slice(0, 10) < today && this.rec(m)); if (ms.length < 3) return;
    const tb = Results.table(e.league, [e.id]), lead = tb[0], pog = {};
    ms.forEach(m => (this.rec(m).games || []).forEach(g => { if (g.mvp) pog[g.mvp] = (pog[g.mvp] || 0) + 1; }));
    const best = Object.entries(pog).sort((a, b) => b[1] - a[1])[0], bp = best && Player.find(best[0]);
    const ups = ms.filter(m => { const r = this.rec(m), w = r.w === 1 ? r.t1 : r.t2, l = r.w === 1 ? r.t2 : r.t1; return this.pw(l) - this.pw(w) >= 3; });
    const wk = G.tab(ms[ms.length - 1].tab);
    const lines = ms.map(m => { const r = this.rec(m); return `${this.T(r.t1).short} ${r.s1}:${r.s2} ${this.T(r.t2).short}`; });
    const hot = tb.map(r => ({ r, s: this.streak(r.t.id) })).sort((a, b) => b.s - a.s)[0];
    Market.post(`[주간 결산] ${e.league} ${wk} — ${lead ? `${lead.t.short} 선두` : ''}${bp ? `, 이번 주 POG ${bp.p.name}` : ''}`,
      [`${e.label} ${wk} 결산입니다.`, '', '이번 주 결과', ...lines, '', `순위: ${tb.slice(0, 4).map((r, i) => `${i + 1}위 ${r.t.short}(${r.w}-${r.l})`).join(' · ')}`,
        hot && hot.s >= 3 ? `상승세: ${hot.r.t.short} ${hot.s}연승` : '', bp ? `이번 주 POG: ${bp.p.name} (${bp.t.short}, ${best[1]}회)` : '', ups.length ? `이변: ${ups.map(m => { const r = this.rec(m); return `${this.T(r.t1).short} ${r.s1}:${r.s2} ${this.T(r.t2).short}`; }).join(', ')}` : ''].filter(x => x !== '').join('\n'), bp ? bp.p.id : null);
  },
  // ---------- 빅매치 · 결승 프리뷰 (전날) ----------
  preview(m) {
    const e = Schedule.eventOf(m), rv = typeof Rivalry !== 'undefined' && Rivalry.ofMatch(m), fin = /^(Grand )?Finals?$/i.test(m.tab);
    const tb = e.kind === 'regular' ? Results.table(e.league, [e.id]) : [], ri = id => tb.findIndex(r => r.t.id === id);
    const top = tb.length >= 6 && ri(m.t1) >= 0 && ri(m.t1) < 3 && ri(m.t2) >= 0 && ri(m.t2) < 3;
    if (!rv && !fin && !top && !(e.kind === 'playoffs' && /Round [34]/.test(m.tab))) return;
    if (!this.once('pv:' + m.id)) return;
    const a = this.T(m.t1), b = this.T(m.t2), h = Results.h2h(a.id, b.id), aw = h.filter(x => Results.won(x, a.id)).length;
    const La = Draft.lineup(a), Lb = Draft.lineup(b);
    const mu = G.ROLES.map((r, i) => { const x = La[i], y = Lb[i]; if (!x || !y) return ''; const d = (x.ovr || 0) - (y.ovr || 0); return `${G.ROLE_KO[r]}: ${x.name} ${x.ovr} vs ${y.ovr} ${y.name}${Math.abs(d) >= 4 ? (d > 0 ? ` (${a.short} 우위)` : ` (${b.short} 우위)`) : ''}`; }).filter(Boolean);
    const ka = this.keyPlayer(a.id, e.year), kb = this.keyPlayer(b.id, e.year);
    const head = fin ? `[결승 프리뷰] ${a.short} vs ${b.short}, ${e.short || e.label} 우승컵의 주인은?` : `[프리뷰] ${rv ? rv.name + ' ' : ''}${a.short} vs ${b.short}${top ? ' — 상위권 맞대결' : ''}`;
    Market.post(head, [`내일 ${m.t.slice(11, 16)} ${e.label} ${G.tab(m.tab)} · Bo${m.bo}`, '',
      `최근 5경기: ${a.short} ${this.form(a.id) || '-'} / ${b.short} ${this.form(b.id) || '-'}`, h.length ? `상대 전적: ${a.short} ${aw}승 ${h.length - aw}패` : '상대 전적: 첫 맞대결',
      tb.length && ri(a.id) >= 0 ? `순위: ${a.short} ${ri(a.id) + 1}위 · ${b.short} ${ri(b.id) + 1}위` : '', '', '포지션 맞대결', ...mu, '',
      ka || kb ? `주목할 선수: ${[ka, kb].filter(Boolean).map(k => `${k.p.name}(평점 ${k.rat.toFixed(1)})`).join(' · ')}` : ''].filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n'), null);
  },
  // ---------- 대회 종료: 최종 순위 · 국제대회 지역 성적 ----------
  ending(e) {
    if (e.kind === 'regular' && e.league !== 'INTL') {
      const tb = Results.table(e.league, [e.id]); if (tb.length < 4) return;
      Market.post(`[최종 순위] ${e.label} — 1위 ${tb[0].t.short}`, `${e.label} 일정이 모두 끝났습니다.\n\n${tb.map((r, i) => `${i + 1}. ${r.t.name} ${r.w}승 ${r.l}패 (세트 ${r.sw - r.sl > 0 ? '+' : ''}${r.sw - r.sl})`).join('\n')}`, null);
    } else if (e.kind === 'intl') {
      const ms = Schedule.all.filter(m => m.event === e.id && this.rec(m)); if (!ms.length) return;
      const last = {}; ms.forEach(m => { const r = this.rec(m); [r.t1, r.t2].forEach(id => { last[id] = m; }); });
      const champ = (App.state.champs || {})[e.id], by = {};
      Object.entries(last).forEach(([id, m]) => { const t = this.T(id); if (!t) return; const stage = id === champ ? '우승' : G.tab(m.tab); (by[t.league] ||= []).push(`${t.short}(${stage})`); });
      Market.post(`[국제] ${e.label} 지역별 성적${champ ? ` — 우승 ${this.T(champ).short} (${this.T(champ).league})` : ''}`, Object.entries(by).map(([lg, l]) => `${lg}: ${l.join(', ')}`).join('\n'), null);
    }
  },
  // ---------- 경기 결과 직후: 이변 · 연승 · 연패 ----------
  after(m) {
    const e = Schedule.eventOf(m); if (!this.mine(e)) return;
    const r = this.rec(m); if (!r) return;
    const w = r.w === 1 ? r.t1 : r.t2, l = r.w === 1 ? r.t2 : r.t1, W = this.T(w), L = this.T(l), today = Clock.today();
    const ws = Math.max(r.s1, r.s2), ls = Math.min(r.s1, r.s2);
    if (this.pw(l) - this.pw(w) >= 3.5 && this.cap(today)) {
      const tb = e.kind === 'regular' ? Results.table(e.league, [e.id]) : [], rk = id => { const i = tb.findIndex(x => x.t.id === id); return i >= 0 ? `${i + 1}위 ` : ''; };
      Market.post(`[이변] ${rk(w)}${W.short}, ${rk(l)}${L.short} 잡았다 — ${W.short} ${ws}:${ls} ${L.short}`, `${e.label}에서 이변이 일어났습니다. 전력상 열세로 평가받던 ${Sim.josa(W.name, '이', '가')} ${Sim.josa(L.name, '을', '를')} ${ws}:${Sim.josa(ls, '으로', '로')} 꺾었습니다.`, null);
    }
    [[w, 1], [l, -1]].forEach(([id, sg]) => {
      const s = this.streak(id), t = this.T(id); if (!t) return;
      if (sg > 0 && [5, 7, 10, 15].includes(s) && this.cap(today, 3)) Market.post(`[연승] ${t.short} ${s}연승 질주`, `${Sim.josa(t.name, '이', '가')} ${s}연승을 달리고 있습니다. 최근 경기력이면 당분간 막기 어려워 보입니다.`, null);
      if (sg < 0 && [4, 6, 8].includes(-s) && this.cap(today, 3)) Market.post(`[연패] ${t.short} ${-s}연패 늪`, `${Sim.josa(t.name, '이', '가')} ${-s}연패에 빠졌습니다. 분위기 반전이 시급합니다.${id === App.state.teamId ? '' : ' 감독 교체설까지 나오고 있습니다.'}`, null);
    });
  },
};
Engine.on(today => { try { NewsGen.day(today); } catch (e) { console.warn('[newsgen]', e); } });
(() => { const rec = Season.recordSeries.bind(Season); Season.recordSeries = (id, series) => { const had = !!(App.state.season || {})[id]; rec(id, series); if (had) return; try { const m = Schedule.all.find(x => x.id === id); if (m) NewsGen.after(m); } catch (e) { console.warn('[newsgen]', e); } }; })();

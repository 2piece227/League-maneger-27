// 주간 성장 리포트 (베타 건의): 매주 월요일 코치가 우리 선수들의 변화를 알려 준다.
//   OVR 변화 · 연습 챔피언 숙련도 진행 · 성장 정체 경고 · 노쇠 경고. 선수별 OVR 기록(월 1회)은 프로필 그래프에 쓴다.
const Growth = {
  st() { return (App.state.growth ||= { snap: null, up: {}, hist: {} }); },
  mine() {
    const t = Roster.team(); if (!t) return [];
    return [...t.players.map(p => [p, '1군']), ...(t.cl || []).map(p => [p, '2군']), ...(t.academy || []).map(p => [p, '아카데미'])].filter(([p]) => p.role !== 'COACH');
  },
  mOf(pid, c) { const e = Mastery.pool(pid).find(x => x.c === c); return e ? Math.round(e.m * 10) / 10 : 0; },
  snapshot(today) {
    const prac = App.state.practice || {}, o = {}, m = {};
    this.mine().forEach(([p]) => { o[p.id] = p.ovr || 0; const x = prac[p.id]; if (x) m[p.id] = { c: x.c, v: this.mOf(p.id, x.c) }; });
    return { date: today, o, m };
  },
  // 선수별 OVR 기록: 매월 1일 (최대 36개)
  record(today) {
    if (today.slice(8) !== '01') return;
    const H = this.st().hist;
    this.mine().forEach(([p]) => { const l = H[p.id] ||= []; if (!l.length || l[l.length - 1][0] !== today) l.push([today, p.ovr || 0]); if (l.length > 36) l.shift(); });
  },
  week(today) {
    if (new Date(today + 'T00:00:00Z').getUTCDay() !== 1) return;   // 월요일
    const S = this.st(), prev = S.snap, cur = this.snapshot(today);
    S.snap = cur;
    if (!prev || App.state.unemployed) return;
    const rows = this.mine(), up = [], down = [], prac = [], stall = [];
    rows.forEach(([p, lv]) => {
      const a = prev.o[p.id], b = cur.o[p.id];
      if (a != null && b > a) { up.push(`▲ ${p.name} (${lv} · ${G.ROLE_KO[p.role]}) OVR ${a} → ${b}`); S.up[p.id] = today; }
      else if (a != null && b < a) down.push(`▼ ${p.name} (${lv}) OVR ${a} → ${b}${(p.age || 0) >= 27 ? ' — 나이에 따른 하락' : ''}`);
      S.up[p.id] ||= today;
      const pm = prev.m[p.id], cm = cur.m[p.id];
      if (cm) {
        // 연습은 지정한 다음 날부터 SoloQ.PRACTICE_DAYS일만 효과가 있다
        const c = Champions.byId[cm.c], nm = c ? c.name : cm.c, x = (App.state.practice || {})[p.id] || {}, end = Store.addDays(x.from || today, SoloQ.PRACTICE_DAYS);
        const from = pm && pm.c === cm.c ? pm.v : null, gain = from != null ? `숙련 ${from} → ${cm.v}` : `숙련 ${cm.v}`;
        if (today <= end) prac.push(`• ${p.name} — ${nm} 연습 중 (${Fmt.daysBetween(x.from, today)}/${SoloQ.PRACTICE_DAYS}일) · ${gain}`);
        else if (Fmt.daysBetween(end, today) <= 7) prac.push(`• ${p.name} — ${nm} 연습 기간이 끝났습니다 · ${gain}. 더 올리려면 개인 훈련에서 다시 지정하세요`);
      }
      const left = (p.pa || 0) - (p.ca || 0);
      if ((p.age || 30) <= 23 && left > .3 && Fmt.daysBetween(S.up[p.id], today) >= 28) stall.push(`• ${p.name} (${lv}) — 4주 넘게 성장이 없습니다. ${lv === '1군' && p.sub ? '벤치에서는 성장이 느립니다. 출전 기회나 2군 경기가 필요합니다.' : '출전 시간을 늘려 보세요.'}`);
    });
    if (!up.length && !down.length && !prac.length && !stall.length) return;
    const sec = (h, l) => l.length ? `${h}\n${l.join('\n')}` : '';
    const body = [sec('[성장]', up), sec('[하락]', down), sec('[연습 챔피언]', prac), sec('[주의]', stall)].filter(Boolean).join('\n\n');
    const coach = (((Roster.team().staff || [])[1] || (Roster.team().staff || [])[0]) || {}).name || '코치';
    Inbox.push({ from: { name: `${coach} 코치`, role: 'coach' }, subject: `주간 성장 리포트 — ${up.length ? `${up.length}명 성장` : '변화 요약'}${stall.length ? ` · 정체 ${stall.length}명` : ''}`, link: 'training-individual',
      body: `지난 한 주 선수들의 변화입니다.\n\n${body}` });
  },
  // 프로필용 작은 그래프 (월별 OVR)
  spark(pid) {
    const l = (this.st().hist || {})[pid]; if (!l || l.length < 2) return '';
    const vs = l.map(x => x[1]), lo = Math.min(...vs) - 1, hi = Math.max(...vs) + 1, W = 160, H = 36;
    const pts = vs.map((v, i) => `${(i / (vs.length - 1) * W).toFixed(1)},${(H - (v - lo) / (hi - lo) * H).toFixed(1)}`).join(' ');
    const d = vs[vs.length - 1] - vs[0];
    return `<div class="gr-spark" title="월별 OVR (${l[0][0].slice(0, 7)} ~ ${l[l.length - 1][0].slice(0, 7)})"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2"/></svg><small>${l.length}개월 ${d > 0 ? '+' : ''}${d}</small></div>`;
  },
};
Engine.on(today => { Growth.record(today); Growth.week(today); });

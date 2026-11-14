// 패치 AI: 시즌 중 2주마다(1월 첫 주부터) 패치가 나온다. 비시즌(스토브)에는 큰 패치 한 번.
// 대상은 "프로권에서 쓰는 챔피언"만: 이번 시즌 게임 안 프로 경기 픽 + 시즌 메타(프로 70% · 솔랭 30%)를 합친 존재감으로
//   - 존재감 상위(OP)는 너프 — 세기는 존재감과 난수로
//   - 프로권 중하위권은 적당히 버프 (안 쓰이던 챔피언을 갑자기 1티어로 만들지는 않는다)
//   - 가끔 이미 좋은 챔피언을 더 좋게 (선수들이 따로 연습해야 할 만큼)
// 누적 조정값 App.state.champAdj[챔피언] (-4~+4, 패치마다 25%씩 0으로 돌아간다)
//   → 엔진 전투력(Sim.ppow +조정값) · 밴픽 메타(Draft.metaNow ×e^(0.3×조정값))
const Patch = {
  st() { return (App.state.patch ||= { list: [], adj: {} }); },
  adj(c) { return this.st().adj[c] || 0; },
  label(Y, n) { return `${Y % 100}.${n}`; },
  // 이번 시즌 프로권 존재감 (게임 안 픽 + 시즌 메타)
  presence() {
    const Y = String(Schedule.season()), cnt = {}; let games = 0;
    Object.entries(Season.st()).forEach(([id, r]) => { if (!id.startsWith(Y) || !r.games) return; r.games.forEach(g => { games++; [...(g.picks.B || []), ...(g.picks.R || [])].forEach(c => { cnt[c] = (cnt[c] || 0) + 1; }); }); });
    const out = {};
    Champions.list.forEach(ch => { const meta = (Draft.M ? Draft.blend(ch.nameEn) : 0) * Math.exp(this.adj(ch.id) * .3), ing = games >= 30 ? (cnt[ch.id] || 0) / games : null; out[ch.id] = ing == null ? meta : ing * .6 + meta * .4; });
    return out;
  },
  NERF: ['기본 공격력 감소', '{R} 피해량 감소', '{R} 재사용 대기시간 증가', '{Q} 피해량 감소', '체력 성장 감소', '{W} 보호막 감소', '이동 속도 감소', '{E} 재사용 대기시간 증가'],
  BUFF: ['기본 공격력 증가', '{R} 피해량 증가', '{R} 재사용 대기시간 감소', '{Q} 피해량 증가', '방어력 증가', '{W} 효과 강화', '이동 속도 증가', '{E} 마나 소모량 감소'],
  line(c, up, r) {
    const ch = Champions.byId[c], sp = k => (((ch.spells || []).find(s => s.key === k) || {}).name || k).split('/')[0].trim(), pool = up ? this.BUFF : this.NERF;
    return pool[Math.floor(r * pool.length)].replace('{R}', sp('R')).replace('{Q}', sp('Q')).replace('{W}', sp('W')).replace('{E}', sp('E'));
  },
  make(today, big) {
    const S = this.st(), Y = Schedule.season(), n = S.list.filter(p => p.y === Y).length + 1, v = this.label(Y, n), R = k => G.rand((App.state.seed || '') + ':patch:' + v + k, 'pt');
    Object.keys(S.adj).forEach(c => { S.adj[c] = Math.round(S.adj[c] * .75 * 10) / 10; if (Math.abs(S.adj[c]) < .2) delete S.adj[c]; });   // 지난 조정은 조금씩 풀린다
    const pres = this.presence(), ranked = Object.entries(pres).filter(([, v2]) => v2 > .02).sort((a, b) => b[1] - a[1]);
    const changes = [];
    // 너프: 상위 (OP)
    const last = (S.list.at(-1) || { changes: [] }).changes.filter(x => x.d < 0).map(x => x.c);
    ranked.slice(0, big ? 7 : 4).forEach(([c, p], i) => { if (R('n' + c) > .75 - (p > .4 ? .3 : 0) - (last.includes(c) ? -.2 : 0) || (last.includes(c) && R('rep' + c) < .5)) return; /* 직전 패치에 너프된 챔피언은 연속 너프를 덜 받는다 */ const d = -Math.round((.6 + p * 2 + R('s' + c)) * 10) / 10; changes.push({ c, d: Math.max(-2.5, d) }); });
    // 버프: 프로권 중하위권
    const mid = ranked.slice(8, 40), nb = big ? 5 : 3;
    for (let i = 0; i < nb && mid.length; i++) { const j = Math.floor(R('b' + i) * mid.length), [c] = mid.splice(j, 1)[0]; changes.push({ c, d: Math.round((.6 + R('bs' + c) * 1.2) * 10) / 10 }); }
    // 가끔: 좋은 챔피언을 더 좋게
    if (R('god') < .18) { const [c] = ranked[4 + Math.floor(R('gi') * 6)] || []; if (c && !changes.some(x => x.c === c)) changes.push({ c, d: 2, big: true }); }
    changes.forEach(x => { S.adj[x.c] = Math.max(-4, Math.min(4, (S.adj[x.c] || 0) + x.d)); x.txt = this.line(x.c, x.d > 0, R('t' + x.c)); });
    S.list.push({ v, y: Y, date: today, big, changes });
    if (Draft) Draft._meta = null;
    const nm = c => Champions.byId[c].name, up = changes.filter(x => x.d > 0), dn = changes.filter(x => x.d < 0);
    Market.post(`[패치] ${v} ${big ? '대규모 ' : ''}패치 — ${dn.slice(0, 3).map(x => nm(x.c)).join('·')} 너프${up.length ? `, ${up.slice(0, 3).map(x => nm(x.c)).join('·')} 버프` : ''}`,
      `패치 ${v}가 적용됐습니다. ${changes.map(x => `${nm(x.c)} ${x.d > 0 ? '▲' : '▼'} ${x.txt}`).join(' / ')}`, null);
    // 우리 선수 중 버프 받은 챔피언 숙련도가 낮으면 코치가 연습을 권한다
    const t = Roster.team(); if (!t) return;
    const tips = up.map(x => { const ch = Champions.byId[x.c], r = (ch.positions || [])[0], p = t.players.find(q => q.role === r && !q.sub); if (!p) return null; const e = Mastery.pool(p.id).find(q => q.c === x.c); return (!e || e.m < 12) ? `${p.name} — ${ch.name}` : null; }).filter(Boolean);
    if (tips.length && !App.state.unemployed) Inbox.push({ from: { name: '코칭스태프', role: 'coach' }, subject: `패치 ${v} — 연습이 필요한 챔피언`, link: 'training-individual', body: `이번 패치로 ${tips.join(', ')}이(가) 좋아졌는데, 우리 선수의 숙련도가 아직 낮습니다.\n\n개인 훈련에서 연습 챔피언으로 지정하는 걸 추천합니다.` });
  },
  daily(today) {
    const Y = Schedule.season(), S = this.st();
    if (S.list.some(p => p.date === today)) return;
    const stove = Schedule.events.find(e => e.kind === 'stove' && e.year === Y);
    // 비시즌 대규모 패치: 스토브 시작 3주 뒤
    if (stove && today === Store.addDays(stove.start, 21)) return this.make(today, true);
    // 시즌 패치: 1월 둘째 주부터 2주마다 (수요일)
    const d0 = `${Y}-01-07`; if (today < d0 || today > `${Y}-11-01`) return;
    const days = Fmt.daysBetween(d0, today); if (days % 14 === 0) this.make(today, false);
  },
  // 메타 화면에 붙이는 패치 노트
  notes(k = 3) {
    const L = this.st().list.slice(-k).reverse(); if (!L.length) return '<p class="ms-none">아직 시즌 패치가 없습니다. 비시즌 대규모 패치는 스토브리그 시작 3주 뒤, 시즌 중에는 2주마다 나옵니다.</p>';
    return L.map(p => `<div class="pt-patch"><b>패치 ${p.v}${p.big ? ' (대규모)' : ''}</b><small>${Fmt.dayLabel(p.date)}</small>${p.changes.map(x => `<div class="pt-row ${x.d > 0 ? 'up' : 'dn'}">${SoloQ.ic(x.c)}<span>${UI.esc(Champions.byId[x.c].name)}</span><em>${x.d > 0 ? '▲ 버프' : '▼ 너프'}${x.big ? ' (대폭)' : ''}</em><small>${UI.esc(x.txt)}</small></div>`).join('')}</div>`).join('');
  },
};
Engine.on(today => { if (App.state.teamId && Champions.list && Schedule.events) Patch.daily(today); });

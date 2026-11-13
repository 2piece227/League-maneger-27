// 엔진 벤치 (브라우저 콘솔): await import('/tools/bench.js') 후 await LMBench.setup(); LMBench.run(60)
// tools/validate-engine.md 표와 같은 항목을 센다. Sim.audit 위반도 함께.
window.LMBench = {
  async setup(team = 't1') {
    if (!Roster.team || !App.state.teamId) {
      App.state.manager ||= { name: '테스트', reputation: 50, background: { type: Object.keys(Manager.BACKGROUNDS)[0] } };
      App.state.teamId = team; Game.start(App.state.manager, App.db.teams.find(t => t.id === team)); App.show('game');
    }
    await Promise.all([Mastery.load(), Champions.load(), Stats.load(), Results.load()]);
    const lck = App.db.teams.filter(t => t.league === 'LCK').map(t => t.id);
    this.pairs = []; lck.forEach(a => lck.forEach(b => { if (a < b) this.pairs.push([a, b]); }));
  },
  // N판: 같은 대진을 양 진영 번갈아
  run(N = 60, pairs = this.pairs) {
    const R = { n: 0, len: 0, kills: 0, wk: 0, lk: 0, drag: 0, baron: 0, noBaron: 0, tow: 0, her: 0, gold: 0, gd: 0, au: 0, bw: 0, fb5: 0, d5: 0, ms: 0, jcs: 0, jcsEnd: 0, roam: {}, auS: [], big: 0 };
    for (let i = 0; i < N; i++) {
      const [a, b] = pairs[Math.floor(i / 2) % pairs.length];
      Sim.audit = [];
      const S = Draft.make({ series: { key: 'bn' + i + Math.random(), bo: 1, games: [] }, teams: { B: i % 2 ? b : a, R: i % 2 ? a : b } }); Draft.auto(S);
      const t0 = performance.now(), g = Sim.create(S, 1); let c = 0, cs10 = null;
      while (!g.over && c++ < 4000) { Sim.step(g); if (g.t === 600) cs10 = g.pl.filter(p => p.role === 'JGL').reduce((s, p) => s + p.cs, 0) / 2; }
      R.ms += performance.now() - t0;
      const w = g.over.win, l = w === 'B' ? 'R' : 'B';
      R.n++; R.len += g.t / 60; R.kills += g.side.B.kills + g.side.R.kills; R.wk += g.side[w].kills; R.lk += g.side[l].kills;
      R.drag += g.side.B.drag.length + g.side.R.drag.length; const bn = g.side.B.baron + g.side.R.baron; R.baron += bn; if (!bn) R.noBaron++;
      R.tow += g.side.B.down + g.side.R.down; R.her += g.side.B.herald + g.side.R.herald;
      R.gold += Sim.gold(g, 'B') + Sim.gold(g, 'R'); R.gd += Math.abs(Sim.lead(g, 'B'));
      R.au += Sim.audit.length; if (Sim.audit.length) R.auS.push(...Sim.audit.slice(0, 2));
      if (w === 'B') R.bw++;
      const fb = g.kills[0]; if (fb && fb.t === 300) R.fb5++;
      const d1 = g.ev.find(e => e.kind === 'drag'); if (d1 && d1.t === 300) R.d5++;
      R.jcs += cs10 || 0; R.jcsEnd += g.pl.filter(p => p.role === 'JGL').reduce((s, p) => s + p.cs / (g.t / 60), 0) / 2;
      g.pl.forEach(p => { if (p.roams) { const k = p.role + ':' + (p.tac || '-'); (R.roam[k] ||= [0, 0]); R.roam[k][0] += p.roams; R.roam[k][1]++; } });
      if (Math.abs(g.side.B.kills - g.side.R.kills) >= 15) R.big++;
    }
    const n = R.n, f = v => (v / n).toFixed(1);
    return { games: n, len: f(R.len), kills: f(R.kills), winLose: f(R.wk) + '/' + f(R.lk), oneSided: Math.round(R.big / n * 100) + '%', drag: f(R.drag), baron: (R.baron / n).toFixed(2), noBaron: Math.round(R.noBaron / n * 100) + '%',
      towers: f(R.tow), herald: (R.her / n).toFixed(2), gold: Math.round(R.gold / n), endGoldDiff: Math.round(R.gd / n), blueWin: Math.round(R.bw / n * 100) + '%',
      fb0500: R.fb5, drag0500: R.d5, jgCs10: f(R.jcs), jgCsPerMin: (R.jcsEnd / n).toFixed(1), msPerGame: Math.round(R.ms / n), audit: R.au, auditSample: R.auS.slice(0, 6),
      roamsPerGame: Object.fromEntries(Object.entries(R.roam).map(([k, [s, c]]) => [k, (s / c).toFixed(1)])) };
  },
};

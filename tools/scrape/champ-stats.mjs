// 프로 경기 챔피언 실데이터 (2025~, LCK·LPL·LEC·LCS·국제대회) → data/champ-stats.json
// - 챔피언별 판수·승률·포지션, 경기 시간대별 승률(파워 커브), 많이 간 아이템(빌드), 소환사 주문
// - 라인 매치업(같은 포지션 맞상대): 승률 · 분당 CS/골드 차이
// - 조합 시너지(같은 팀 두 챔피언): 바텀 듀오 · 정글-미드 · 정글-탑 승률
// 경기 엔진(js/matchsim.js)과 밴픽 코치(js/draft.js)가 읽는다.  실행: node tools/scrape/champ-stats.mjs  (TEST=1 이면 1쪽만)
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { init, cargo, OUT, log } from './lp.mjs';

const FROM = process.env.FROM || '2025-01-01';
const WHERE = `SG.DateTime_UTC >= "${FROM}" AND (SG.OverviewPage LIKE "LCK/%" OR SG.OverviewPage LIKE "LPL/%" OR SG.OverviewPage LIKE "LEC/%" OR SG.OverviewPage LIKE "LCS/%" OR SG.OverviewPage LIKE "%World Championship%" OR SG.OverviewPage LIKE "%Mid-Season Invitational%" OR SG.OverviewPage LIKE "%First Stand%" OR SG.OverviewPage LIKE "%Esports World Cup%")`;

await init();
const rows = await cargo({
  tables: 'ScoreboardPlayers=SP,ScoreboardGames=SG', joinOn: 'SP.GameId=SG.GameId',
  fields: 'SP.GameId=G,SP.Champion=C,SP.IngameRole=R,SP.Side=S,SP.PlayerWin=W,SP.Items=I,SP.SummonerSpells=SS,SP.Kills=K,SP.Deaths=D,SP.Assists=A,SP.Gold=Gold,SP.CS=CS,SG.Gamelength_Number=Len',
  where: WHERE + (process.env.TEST ? ' AND SG.DateTime_UTC >= "2026-10-01"' : ''), orderBy: 'SP.GameId,SP.Side,SP.IngameRole',
});
log(`행 ${rows.length}개`);

const ROLE = { Top: 'TOP', Jungle: 'JGL', Mid: 'MID', Bot: 'BOT', Support: 'SUP' };
const games = {};
for (const r of rows) {
  const role = ROLE[r.R]; if (!role || !r.C) continue;
  (games[r.G] ||= { len: +r.Len || 30, B: {}, R: {} })[r.S === '1' ? 'B' : 'R'][role] = r;
}
const champ = {}, mu = {}, syn = {};
const bucket = len => len < 27 ? 0 : len < 33 ? 1 : 2;   // 27분 미만 · 27~33분 · 33분 이상
const add = (o, k, w) => { const x = (o[k] ||= { g: 0, w: 0 }); x.g++; if (w) x.w++; return x; };
let nGames = 0;
for (const g of Object.values(games)) {
  if (Object.keys(g.B).length < 5 || Object.keys(g.R).length < 5) continue;
  nGames++;
  for (const side of ['B', 'R']) {
    const me = g[side], op = g[side === 'B' ? 'R' : 'B'];
    for (const [role, r] of Object.entries(me)) {
      const win = r.W === 'Yes', c = (champ[r.C] ||= { g: 0, w: 0, roles: {}, len: [[0, 0], [0, 0], [0, 0]], items: {}, spells: {}, k: 0, d: 0, a: 0 });
      c.g++; if (win) c.w++; add(c.roles, role, win);
      const b = c.len[bucket(g.len)]; b[0]++; if (win) b[1]++;
      c.k += +r.K || 0; c.d += +r.D || 0; c.a += +r.A || 0;
      (r.I || '').split(';').map(s => s.trim()).filter(Boolean).forEach(it => { c.items[it] = (c.items[it] || 0) + 1; });
      (r.SS || '').split(',').map(s => s.trim()).filter(Boolean).forEach(sp => { c.spells[sp] = (c.spells[sp] || 0) + 1; });
      // 매치업: 같은 포지션 상대 (한쪽 관점만 저장해도 되지만 조회 편하게 양쪽 다)
      const o = op[role];
      if (o) {
        const x = add(mu, `${role}|${r.C}|${o.C}`, win);
        x.cs = (x.cs || 0) + ((+r.CS || 0) - (+o.CS || 0)) / g.len;
        x.gd = (x.gd || 0) + ((+r.Gold || 0) - (+o.Gold || 0)) / g.len;
      }
    }
    // 시너지: 바텀 듀오 · 정글-미드 · 정글-탑 · 미드-서폿
    for (const [a, b] of [['BOT', 'SUP'], ['JGL', 'MID'], ['JGL', 'TOP'], ['MID', 'SUP']]) {
      if (me[a] && me[b]) add(syn, `${a}-${b}|${me[a].C}|${me[b].C}`, me[a].W === 'Yes');
    }
  }
}
// 정리: 아이템은 상위 10개, 매치업·시너지는 3판 이상만
const out = { meta: { source: 'Leaguepedia ScoreboardPlayers+ScoreboardGames', from: FROM, games: nGames, scrapedAt: new Date().toISOString() }, champs: {}, matchups: {}, synergy: {} };
for (const [c, x] of Object.entries(champ)) {
  out.champs[c] = { g: x.g, w: x.w, roles: x.roles, len: x.len, kda: [+(x.k / x.g).toFixed(1), +(x.d / x.g).toFixed(1), +(x.a / x.g).toFixed(1)],
    items: Object.entries(x.items).sort((a, b) => b[1] - a[1]).slice(0, 12), spells: Object.entries(x.spells).sort((a, b) => b[1] - a[1]).slice(0, 4) };
}
for (const [k, x] of Object.entries(mu)) if (x.g >= 3) out.matchups[k] = [x.g, x.w, +(x.cs / x.g).toFixed(2), Math.round(x.gd / x.g)];
for (const [k, x] of Object.entries(syn)) if (x.g >= 3) out.synergy[k] = [x.g, x.w];
if (process.env.TEST) { console.log(JSON.stringify(out.meta), Object.keys(out.champs).length, Object.keys(out.matchups).length, JSON.stringify(Object.entries(out.champs)[0]).slice(0, 600)); process.exit(0); }
await writeFile(path.join(OUT, 'champ-stats.json'), JSON.stringify(out));
log(`경기 ${nGames} · 챔피언 ${Object.keys(out.champs).length} · 매치업 ${Object.keys(out.matchups).length} · 시너지 ${Object.keys(out.synergy).length}`);

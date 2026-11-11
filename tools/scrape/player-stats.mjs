// 선수별 경기 지표 (2025~ 프로 경기) → data/player-stats.json
// 능력치 자동 산정(tools/attr-auto.py)의 입력. 분당 CS·골드·딜·시야, 킬 관여, KDA, 승률, 국제전 기록
// 실행: node tools/scrape/player-stats.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { init, api, inList, OUT, log } from './lp.mjs';

const FROM = process.env.FROM || '2025-01-01';
const TEST = process.env.TEST;
const players = JSON.parse(await readFile(path.join(OUT, 'players.json'), 'utf8')).players.filter(p => p.role !== 'COACH' && p.sourcePage);
let cl = [];
try { cl = JSON.parse(await readFile(path.join(OUT, 'cl.json'), 'utf8')).players.filter(p => p.role !== 'COACH' && p.sourcePage); } catch {}
const all = [...players, ...cl];
const byLink = Object.fromEntries(all.map(p => [p.sourcePage, p.id]));
const INTL = '(SG.Tournament LIKE "%Worlds%" OR SG.Tournament LIKE "%Mid-Season%" OR SG.Tournament LIKE "%MSI%" OR SG.Tournament LIKE "%First Stand%" OR SG.Tournament LIKE "%Esports World Cup%")';

await init();
async function grouped(where) {
  const rows = [], links = TEST ? TEST.split(',') : Object.keys(byLink);
  for (let i = 0; i < links.length; i += 40) {
    for (let offset = 0; ; offset += 500) {
      const j = await api({
        action: 'cargoquery', tables: 'ScoreboardPlayers=SP,ScoreboardGames=SG', join_on: 'SP.GameId=SG.GameId',
        fields: 'SP.Link=Link,SP.Side=Side,SP.PlayerWin=Win,COUNT(*)=G,SUM(SP.Kills)=K,SUM(SP.Deaths)=D,SUM(SP.Assists)=A,SUM(SP.CS)=CS,SUM(SP.Gold)=Gold,SUM(SP.DamageToChampions)=Dmg,SUM(SP.VisionScore)=VS,SUM(SG.Gamelength_Number)=Min,SUM(SG.Team1Kills)=K1,SUM(SG.Team2Kills)=K2,SUM(SG.Team1Gold)=G1,SUM(SG.Team2Gold)=G2',
        where: `${inList('SP.Link', links.slice(i, i + 40))} AND SG.DateTime_UTC >= "${FROM}" AND ${where}`,
        group_by: 'SP.Link,SP.Side,SP.PlayerWin', limit: '500', offset: String(offset),
      });
      if (j.error) throw new Error(j.error.info);
      const batch = (j.cargoquery || []).map(r => r.title);
      rows.push(...batch);
      if (batch.length < 500) break;
    }
    log(`  선수 ${Math.min(i + 40, links.length)}/${links.length}`);
  }
  return rows;
}
const fold = rows => {
  const o = {};
  for (const r of rows) {
    const pid = byLink[r.Link] || r.Link, s = (o[pid] ||= { g: 0, w: 0, k: 0, d: 0, a: 0, cs: 0, gold: 0, dmg: 0, vs: 0, min: 0, tk: 0, tg: 0 });
    const n = x => +x || 0, side1 = r.Side === '1';
    s.g += n(r.G); if (r.Win === 'Yes') s.w += n(r.G);
    s.k += n(r.K); s.d += n(r.D); s.a += n(r.A); s.cs += n(r.CS); s.gold += n(r.Gold); s.dmg += n(r.Dmg); s.vs += n(r.VS); s.min += n(r.Min);
    s.tk += n(side1 ? r.K1 : r.K2); s.tg += n(side1 ? r.G1 : r.G2);
  }
  return o;
};
log('전체'); const tot = fold(await grouped('1=1'));
log('국제전'); const intl = fold(await grouped(INTL));
const out = {};
for (const [pid, s] of Object.entries(tot)) out[pid] = { ...s, intl: intl[pid] || null };
if (TEST) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
await writeFile(path.join(OUT, 'player-stats.json'), JSON.stringify({ meta: { source: 'Leaguepedia ScoreboardPlayers+ScoreboardGames', from: FROM, scrapedAt: new Date().toISOString(), players: Object.keys(out).length }, players: out }));
log(`선수 ${Object.keys(out).length}명`);

// 선수별 챔피언 폭 (최근 3시즌 프로 경기 기록) → data/champion-pools.json
// Leaguepedia ScoreboardPlayers를 선수·챔피언별로 묶어 판수·승수·KDA를 받고 숙련도(1~20)와 시그니처를 계산한다.
// 실행: node tools/scrape/champion-pools.mjs   (champions.json, players.json 이 먼저 있어야 함)
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { init, api, inList, OUT, log } from './lp.mjs';

const FROM = '2024-01-01';
const RECENT = '2026-01-01';

const players = JSON.parse(await readFile(path.join(OUT, 'players.json'), 'utf8')).players.filter(p => p.role !== 'COACH' && p.sourcePage);
const champs = JSON.parse(await readFile(path.join(OUT, 'champions.json'), 'utf8')).champions;
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const champId = Object.fromEntries(champs.flatMap(c => [[norm(c.nameEn), c.id], [norm(c.id), c.id]]));
const byLink = Object.fromEntries(players.map(p => [p.sourcePage, p.id]));

await init();

// 그룹 쿼리: 한 번에 선수 40명씩
async function grouped(where) {
  const rows = [];
  const links = Object.keys(byLink);
  for (let i = 0; i < links.length; i += 40) {
    for (let offset = 0; ; offset += 500) {
      const j = await api({
        action: 'cargoquery', tables: 'ScoreboardPlayers',
        fields: 'Link,Champion,COUNT(*)=G,SUM(Kills)=K,SUM(Deaths)=D,SUM(Assists)=A',
        where: `${inList('Link', links.slice(i, i + 40))} AND ${where}`,
        group_by: 'Link,Champion', limit: '500', offset: String(offset),
      });
      const batch = (j.cargoquery || []).map(r => r.title);
      rows.push(...batch);
      if (batch.length < 500) break;
    }
    log(`  선수 ${Math.min(i + 40, links.length)}/${links.length}`);
  }
  return rows;
}

log('전체 기록');
const all = await grouped(`DateTime_UTC >= "${FROM}"`);
log('승리 기록');
const wins = await grouped(`DateTime_UTC >= "${FROM}" AND PlayerWin = "Yes"`);
log(`최근 시즌 (${RECENT.slice(0, 4)})`);
const recent = await grouped(`DateTime_UTC >= "${RECENT}"`);

const key = r => r.Link + '|' + r.Champion;
const winMap = Object.fromEntries(wins.map(r => [key(r), +r.G]));
const recentMap = Object.fromEntries(recent.map(r => [key(r), +r.G]));
const unknown = new Set();

// 숙련도 1~20: 경험(판수, 로그) + 승률(표본 보정) + KDA
function mastery(g, w, k, d, a) {
  const exp = Math.min(1, Math.log1p(g) / Math.log1p(50));
  const wr = (w + 5) / (g + 10);
  const kda = (k + a) / Math.max(1, d);
  const v = 5 + exp * 11 + (wr - 0.5) * 12 + Math.max(-1.5, Math.min(1.5, (kda - 3) * 0.5));
  return Math.max(1, Math.min(20, Math.round(v)));
}

const pools = {};
for (const r of all) {
  const pid = byLink[r.Link];
  const cid = champId[norm(r.Champion)];
  if (!pid) continue;
  if (!cid) { unknown.add(r.Champion); continue; }
  const g = +r.G, w = winMap[key(r)] || 0, k = +r.K, d = +r.D, a = +r.A;
  (pools[pid] ||= []).push({ c: cid, g, w, k, d, a, g26: recentMap[key(r)] || 0, m: mastery(g, w, k, d, a) });
}

// 시그니처: 리그 최상급만 — 숙련도 19 이상·20판 이상 중 선수당 상위 2개
let sigCount = 0;
for (const list of Object.values(pools)) {
  list.sort((x, y) => y.m - x.m || y.g - x.g);
  list.filter(e => e.m >= 19 && e.g >= 20).slice(0, 2).forEach(e => { e.sig = true; sigCount++; });
}
if (unknown.size) console.warn('매칭 안 된 챔피언:', [...unknown].join(', '));

const noData = players.filter(p => !pools[p.id]).map(p => p.name);
await writeFile(path.join(OUT, 'champion-pools.json'), JSON.stringify({
  meta: { source: 'Leaguepedia ScoreboardPlayers', from: FROM, recentFrom: RECENT, scrapedAt: new Date().toISOString(), players: Object.keys(pools).length, signatures: sigCount },
  pools,
}));
log(`선수 ${Object.keys(pools).length}명, 시그니처 ${sigCount}개, 기록 없음 ${noData.length}명`);
if (noData.length) console.log('기록 없음:', noData.join(', '));

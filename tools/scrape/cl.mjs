// LCK CL(2군) 로스터 수집 → data/cl.json
// 실행: node tools/scrape/cl.mjs   (LM_SEASON=2026 기본)
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { init, cargo, imageUrls, inList, log, OUT } from './lp.mjs';

const SEASON = process.env.LM_SEASON || '2026';
const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const ROLE = { Top: 'TOP', Jungle: 'JGL', Mid: 'MID', Bot: 'BOT', Support: 'SUP' };

await init();
const rows = await cargo({
  tables: 'TournamentPlayers=TP,Tournaments=T',
  joinOn: 'TP.OverviewPage=T.OverviewPage',
  fields: 'TP.Team=Team,TP.Link=Link,TP.Role=Role,TP.OverviewPage=Page,T.DateStart=DateStart',
  where: `TP.OverviewPage LIKE "LCK CL/${SEASON} Season/%"`,
});
log(`CL 행 ${rows.length}`);

// 참가 팀이 가장 많은 대회 중 최신 페이지를 현재 로스터로
const pages = {};
rows.forEach(r => { const p = pages[r.Page] ||= { teams: new Set(), date: r.DateStart || '' }; p.teams.add(r.Team); });
const max = Math.max(...Object.values(pages).map(p => p.teams.size));
const [page] = Object.entries(pages).filter(([, p]) => p.teams.size >= max * .8).sort((a, b) => b[1].date.localeCompare(a[1].date))[0];
log(`기준 대회: ${page}`);
const current = rows.filter(r => r.Page === page);
const teamNames = [...new Set(current.map(r => r.Team))];

const teamRows = await cargo({ tables: 'Teams', fields: 'Name,OverviewPage,Short,Image', where: inList('OverviewPage', teamNames) });
const links = [...new Set(current.map(r => r.Link))];
const playerRows = [], imageRows = [];
for (const g of chunks(links, 100)) {
  playerRows.push(...await cargo({ tables: 'Players', fields: 'ID,OverviewPage,Name,NativeName,Country,NationalityPrimary,Birthdate,Role,Contract', where: inList('OverviewPage', g) }));
  imageRows.push(...await cargo({ tables: 'PlayerImages', fields: 'FileName,Link,Tournament,IsProfileImage,SortDate', where: inList('Link', g) }));
}
const year = r => Math.max(0, ...(`${r.Tournament} ${r.FileName}`.match(/20\d\d/g) || []).map(Number));
const rank = r => [r.IsProfileImage === '1' ? 1 : 0, year(r), r.SortDate || ''];
const better = (x, y) => { const a = rank(x), b = rank(y); return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]); };
const photo = {};
imageRows.forEach(r => { if (!photo[r.Link] || better(r, photo[r.Link]) > 0) photo[r.Link] = r; });
const urls = await imageUrls([...teamRows.map(t => t.Image), ...Object.values(photo).map(r => r.FileName)]);

const tb = Object.fromEntries(teamRows.map(t => [t.OverviewPage, t]));
const pb = Object.fromEntries(playerRows.map(p => [p.OverviewPage, p]));
const teams = teamNames.map(n => ({ id: slug(n), name: (tb[n] || {}).Name || n, short: (tb[n] || {}).Short || n.slice(0, 4), logo: urls[(tb[n] || {}).Image] || null, sourcePage: n }));
const players = current.map(r => {
  const p = pb[r.Link] || {};
  return {
    id: slug(r.Link), team: slug(r.Team), name: p.ID || r.Link, realName: p.Name || '', nativeName: p.NativeName || '',
    role: ROLE[r.Role] || (/coach/i.test(r.Role) ? 'COACH' : ROLE[p.Role] || r.Role || ''),
    nation: p.NationalityPrimary || p.Country || '', birthdate: p.Birthdate || null, contractEnd: p.Contract || null,
    photo: urls[(photo[r.Link] || {}).FileName] || null, sourcePage: r.Link,
  };
});
await writeFile(path.join(OUT, 'cl.json'), JSON.stringify({ meta: { source: 'Leaguepedia', page, scrapedAt: new Date().toISOString() }, teams, players }, null, 2));
log(`완료: 팀 ${teams.length}, 선수 ${players.length}`);

// LPL·LEC 팀의 2군(유스·아카데미 팀) 로스터 → data/cl.json 에 합친다 (LCK CL은 cl.mjs)
// LPL: LDL이 2025년으로 끝나서 2026년엔 유스 팀이 Asia Masters 등에 나간다. LEC: 각국 ERL에 아카데미 팀.
// LCS(LTA North)는 NACL 팀이 1군과 이름으로 이어지지 않아 데이터가 없다 → 게임에서 생성.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { init, cargo, imageUrls, inList, log, OUT } from './lp.mjs';

const MAP = {
  'bilibili-gaming': 'Bilibili Gaming Junior',
  'edward-gaming': 'EDward Gaming Youth Team',
  'lgd-gaming': 'LGD Gaming Young Team',
  'top-esports': 'Top Esports Challenger',
  'weibo-gaming': 'Weibo Gaming Youth Team',
  'team-we': 'Team WE Academy',
  'thundertalk-gaming': 'ThunderTalk Gaming Young',
  'karmine-corp': 'Karmine Corp Blue',
  'giantx': 'GIANTX PRIDE',
  'movistar-koi': 'Movistar KOI Fénix',
  'team-heretics': 'Team Heretics Academy',
};
const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ROLE = { Top: 'TOP', Jungle: 'JGL', Mid: 'MID', Bot: 'BOT', Support: 'SUP' };

await init();
const names = Object.values(MAP);
const rows = await cargo({
  tables: 'TournamentPlayers=TP,Tournaments=T', joinOn: 'TP.OverviewPage=T.OverviewPage',
  fields: 'TP.Team=Team,TP.Link=Link,TP.Role=Role,TP.OverviewPage=Page,T.DateStart=D,T.League=League',
  where: `T.DateStart >= "2025-06-01" AND ${inList('TP.Team', names)}`,
});
// 팀마다 가장 최근 대회의 로스터
const latest = {};
rows.forEach(r => { if (!latest[r.Team] || r.D > latest[r.Team].D) latest[r.Team] = r; });
const current = rows.filter(r => latest[r.Team] && r.Page === latest[r.Team].Page);
names.forEach(n => log(n, '←', latest[n] ? `${latest[n].League} (${latest[n].D})` : '없음'));

const teamRows = await cargo({ tables: 'Teams', fields: 'Name,OverviewPage,Short,Image', where: inList('OverviewPage', names) });
const links = [...new Set(current.map(r => r.Link))];
const playerRows = await cargo({ tables: 'Players', fields: 'ID,OverviewPage,Name,NativeName,Country,NationalityPrimary,Birthdate,Role,Contract', where: inList('OverviewPage', links) });
const imageRows = await cargo({ tables: 'PlayerImages', fields: 'FileName,Link,Tournament,IsProfileImage,SortDate', where: inList('Link', links) });
const year = r => Math.max(0, ...(`${r.Tournament} ${r.FileName}`.match(/20\d\d/g) || []).map(Number));
const rank = r => [r.IsProfileImage === '1' ? 1 : 0, year(r), r.SortDate || ''];
const better = (x, y) => { const a = rank(x), b = rank(y); return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]); };
const photo = {};
imageRows.forEach(r => { if (!photo[r.Link] || better(r, photo[r.Link]) > 0) photo[r.Link] = r; });
const urls = await imageUrls([...teamRows.map(t => t.Image), ...Object.values(photo).map(r => r.FileName)]);

const file = path.join(OUT, 'cl.json');
const cl = JSON.parse(await readFile(file, 'utf8'));
const tb = Object.fromEntries(teamRows.map(t => [t.OverviewPage, t]));
const pb = Object.fromEntries(playerRows.map(p => [p.OverviewPage, p]));
const newIds = new Set(names.map(slug));
cl.teams = cl.teams.filter(t => !newIds.has(t.id));
cl.players = cl.players.filter(p => !newIds.has(p.team));
for (const [parent, n] of Object.entries(MAP)) {
  if (!latest[n]) continue;
  cl.teams.push({ id: slug(n), name: (tb[n] || {}).Name || n, short: (tb[n] || {}).Short || n.slice(0, 4), logo: urls[(tb[n] || {}).Image] || null, sourcePage: n, parent, circuit: latest[n].League });
}
current.forEach(r => {
  const p = pb[r.Link] || {};
  cl.players.push({
    id: slug(r.Link), team: slug(r.Team), name: p.ID || r.Link, realName: p.Name || '', nativeName: p.NativeName || '',
    role: ROLE[r.Role] || (/coach/i.test(r.Role) ? 'COACH' : ROLE[p.Role] || r.Role || ''),
    nation: p.NationalityPrimary || p.Country || '', birthdate: p.Birthdate || null, contractEnd: p.Contract || null,
    photo: urls[(photo[r.Link] || {}).FileName] || null, sourcePage: r.Link,
  });
});
cl.teams.filter(t => !t.circuit && t.id.match(/challengers|academy|youth/)).forEach(t => { t.circuit ||= 'LCK Challengers League'; });
await writeFile(file, JSON.stringify(cl, null, 2));
log(`완료: 2군 팀 ${cl.teams.length}, 선수 ${cl.players.length}`);

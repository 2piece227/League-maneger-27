// 선수별 현 소속팀 입단일 (같은 구단에서 이어서 뛴 기간을 합친다) → data/tenures.json
// 평판의 프랜차이즈 점수(js/fame.js) 입력. 실행: node tools/scrape/tenures.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { init, api, inList, OUT, log } from './lp.mjs';

const players = JSON.parse(await readFile(path.join(OUT, 'players.json'), 'utf8')).players.filter(p => p.role !== 'COACH' && p.sourcePage);
const teams = Object.fromEntries(JSON.parse(await readFile(path.join(OUT, 'teams.json'), 'utf8')).teams.map(t => [t.id, t.sourcePage]));
// 이름이 바뀐 같은 구단 (2군·아카데미는 넣지 않는다: 1군 근속만 센다)
const FAMILY = [
  ['T1', 'SK Telecom T1'], ['Dplus Kia', 'DWG KIA', 'DAMWON Gaming'], ['Kiwoom DRX', 'DRX'], ['Gen.G', 'KSV'],
  ['DN SOOPers', 'DN Freecs', 'Kwangdong Freecs', 'Afreeca Freecs'], ['BNK FEARX', 'FearX', 'Liiv SANDBOX', 'SANDBOX Gaming'],
  ['HANJIN BRION', 'OKSavingsBank BRION', 'BRION', 'Fredit BRION'], ['Nongshim RedForce', 'Team Dynamics'],
  ['Ninjas in Pyjamas.CN', 'Ninjas in Pyjamas', 'Victory Five'], ['ThunderTalk Gaming', 'Dominus Esports'], ["Anyone's Legend", 'Rare Atom'],
  ['Movistar KOI', 'MAD Lions KOI', 'MAD Lions'], ['GIANTX', 'Excel Esports'], ['Shifters', 'Rogue'], ['Karmine Corp', 'Team BDS'],
  ['Disguised'], ['Shopify Rebellion'], ['LYON (2024 American Team)'],
];
const fam = n => { const f = FAMILY.find(x => x.includes(n)); return f ? f[0] : n; };

await init();
const rows = [];
for (let i = 0; i < players.length; i += 40) {
  const j = await api({ action: 'cargoquery', tables: 'Tenures', fields: 'Player,Team,DateJoin,DateLeave,IsCurrent', where: inList('Player', players.slice(i, i + 40).map(p => p.sourcePage)), limit: '500' });
  if (j.error) throw new Error(j.error.info);
  rows.push(...(j.cargoquery || []).map(r => r.title));
  log(`  선수 ${Math.min(i + 40, players.length)}/${players.length}`);
}
const days = (a, b) => (new Date(b) - new Date(a)) / 864e5;
const out = {};
for (const p of players) {
  const org = fam(teams[p.team]);
  const list = rows.filter(r => r.Player.toLowerCase() === p.sourcePage.toLowerCase() && r.DateJoin).sort((a, b) => a.DateJoin.localeCompare(b.DateJoin));
  let k = list.map(r => fam(r.Team) === org).lastIndexOf(true);
  if (k < 0) continue;
  let join = list[k].DateJoin;
  while (k > 0 && fam(list[k - 1].Team) === org && list[k - 1].DateLeave && days(list[k - 1].DateLeave, join) <= 60) join = list[--k].DateJoin;
  out[p.id] = join;
}
await writeFile(path.join(OUT, 'tenures.json'), JSON.stringify({ meta: { source: 'Leaguepedia Tenures', scrapedAt: new Date().toISOString(), players: Object.keys(out).length }, join: out }, null, 0));
log(`입단일 ${Object.keys(out).length}/${players.length}명`);

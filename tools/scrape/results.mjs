// 2026 실제 경기 결과 → data/results-2026.json (순위표·경기 기록·상대 전적용)
// 실행: node tools/scrape/results.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { init, cargo, OUT, log } from './lp.mjs';
import { EVENTS } from './events.mjs';

const teams = JSON.parse(await readFile(path.join(OUT, 'teams.json'), 'utf8')).teams;
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const teamId = Object.fromEntries(teams.flatMap(t => [[norm(t.sourcePage), t.id], [norm(t.name), t.id]]));
Object.assign(teamId, { brion: 'hanjin-brion', drx: 'kiwoom-drx' });

await init();
const out = [];
for (const [id, page, league, name, kind] of EVENTS) {
  const rows = await cargo({
    tables: 'MatchSchedule', fields: 'DateTime_UTC,BestOf,Tab,Team1,Team2,Team1Score,Team2Score,Winner',
    where: `OverviewPage = "${page}"`, orderBy: 'DateTime_UTC',
  });
  for (const m of rows) {
    const t = m.DateTime_UTC || m['DateTime UTC'];
    if (!t || !m.Winner) continue; // 치르지 않은 경기
    out.push({
      e: id, league, t: t.replace(' ', 'T') + 'Z', bo: +m.BestOf || 1, tab: m.Tab || '',
      t1: teamId[norm(m.Team1)] || null, t2: teamId[norm(m.Team2)] || null, n1: m.Team1, n2: m.Team2,
      s1: +m.Team1Score || 0, s2: +m.Team2Score || 0, w: +m.Winner,
    });
  }
  log(`  ${name}: ${rows.length}`);
}
await writeFile(path.join(OUT, 'results-2026.json'), JSON.stringify({
  meta: { source: 'Leaguepedia MatchSchedule', season: 2026, scrapedAt: new Date().toISOString(), events: Object.fromEntries(EVENTS.map(e => [e[0], { league: e[2], name: e[3], kind: e[4] }])) },
  matches: out,
}));
log(`결과 ${out.length}경기 저장`);

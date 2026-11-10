// 2026 실제 리그 일정 → data/season-template.json
// 리그·국제대회의 단계별 기간과 경기 슬롯(시각·Bo·대진)을 받아 둔다.
// 게임은 이 틀을 1년(364일, 요일 유지) 밀어서 2027 시즌 일정으로 쓴다.
// 실행: node tools/scrape/schedule.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { init, cargo, inList, OUT, log } from './lp.mjs';

// [id, OverviewPage, 리그, 표시 이름, 종류]  종류: regular | playoffs | intl | event
const EVENTS = [
  ['lck-cup', 'LCK/2026 Season/Cup', 'LCK', 'LCK컵', 'regular'],
  ['lck-r12', 'LCK/2026 Season/Rounds 1-2', 'LCK', '정규 시즌 1·2라운드', 'regular'],
  ['lck-rtm', 'LCK/2026 Season/Road to MSI', 'LCK', 'Road to MSI', 'playoffs'],
  ['lck-r34', 'LCK/2026 Season/Rounds 3-4', 'LCK', '정규 시즌 3·4라운드', 'regular'],
  ['lck-playin', 'LCK/2026 Season/Season Play-In', 'LCK', '플레이-인', 'playoffs'],
  ['lck-po', 'LCK/2026 Season/Season Playoffs', 'LCK', '플레이오프', 'playoffs'],
  ['lpl-s1', 'LPL/2026 Season/Split 1', 'LPL', '스플릿 1', 'regular'],
  ['lpl-s1po', 'LPL/2026 Season/Split 1 Playoffs', 'LPL', '스플릿 1 플레이오프', 'playoffs'],
  ['lpl-s2', 'LPL/2026 Season/Split 2', 'LPL', '스플릿 2', 'regular'],
  ['lpl-s2po', 'LPL/2026 Season/Split 2 Playoffs', 'LPL', '스플릿 2 플레이오프', 'playoffs'],
  ['lpl-s3', 'LPL/2026 Season/Split 3', 'LPL', '스플릿 3', 'regular'],
  ['lpl-gf', 'LPL/2026 Season/Grand Finals', 'LPL', '그랜드 파이널', 'playoffs'],
  ['lpl-rf', 'LPL/2026 Season/Regional Finals', 'LPL', '월즈 선발전', 'playoffs'],
  ['lec-versus', 'LEC/2026 Season/Versus Season', 'LEC', 'Versus', 'regular'],
  ['lec-versuspo', 'LEC/2026 Season/Versus Playoffs', 'LEC', 'Versus 플레이오프', 'playoffs'],
  ['lec-spring', 'LEC/2026 Season/Spring Season', 'LEC', 'Spring', 'regular'],
  ['lec-springpo', 'LEC/2026 Season/Spring Playoffs', 'LEC', 'Spring 플레이오프', 'playoffs'],
  ['lec-summer', 'LEC/2026 Season/Summer Season', 'LEC', 'Summer', 'regular'],
  ['lec-summerpo', 'LEC/2026 Season/Summer Playoffs', 'LEC', 'Summer 플레이오프', 'playoffs'],
  ['lcs-lockin', 'LCS/2026 Season/Lock-In', 'LCS', 'Lock-In', 'regular'],
  ['lcs-spring', 'LCS/2026 Season/Spring Season', 'LCS', 'Spring', 'regular'],
  ['lcs-springpo', 'LCS/2026 Season/Spring Playoffs', 'LCS', 'Spring 플레이오프', 'playoffs'],
  ['lcs-summer', 'LCS/2026 Season/Summer Season', 'LCS', 'Summer', 'regular'],
  ['lcs-summerpo', 'LCS/2026 Season/Summer Playoffs', 'LCS', 'Summer 플레이오프', 'playoffs'],
  ['first-stand', '2026 First Stand', 'INTL', '퍼스트 스탠드', 'intl'],
  ['msi', '2026 Mid-Season Invitational', 'INTL', 'MSI', 'intl'],
  ['ewc', 'Esports World Cup 2026', 'INTL', 'e스포츠 월드컵', 'intl'],
  ['worlds-playin', '2026 Season World Championship/Play-In', 'INTL', '월즈 플레이-인', 'intl'],
  ['worlds', '2026 Season World Championship/Main Event', 'INTL', '월드 챔피언십', 'intl'],
  ['kespa', '2026 LoL KeSPA Cup', 'LCK', 'KeSPA컵', 'event'],
];

const teams = JSON.parse(await readFile(path.join(OUT, 'teams.json'), 'utf8')).teams;
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const teamId = Object.fromEntries(teams.flatMap(t => [[norm(t.sourcePage), t.id], [norm(t.name), t.id]]));
// 시즌 중 이름이 바뀐 팀
Object.assign(teamId, { brion: 'hanjin-brion', drx: 'kiwoom-drx' });
const isTbd = s => !s || /^tbd$/i.test(s.trim());

await init();
const pages = EVENTS.map(e => e[1]);
const tours = await cargo({ tables: 'Tournaments', fields: 'OverviewPage,DateStart,Date', where: inList('OverviewPage', pages) });
const range = Object.fromEntries(tours.map(t => [t.OverviewPage, [t.DateStart, t.Date]]));

const matches = [];
for (const page of pages) {
  const rows = await cargo({
    tables: 'MatchSchedule', fields: 'OverviewPage,DateTime_UTC,BestOf,Tab,Round,Team1,Team2',
    where: `OverviewPage = "${page}"`, orderBy: 'DateTime_UTC',
  });
  matches.push(...rows);
  log(`  ${page}: ${rows.length}경기`);
}

const unknown = new Set();
const events = EVENTS.map(([id, page, league, name, kind]) => {
  const dt = m => m.DateTime_UTC || m['DateTime UTC']; // Cargo는 밑줄을 공백으로 돌려준다
  const slots = matches.filter(m => m.OverviewPage === page && dt(m)).map(m => {
    // 정규 시즌만 실제 대진을 유지하고, 토너먼트는 진출팀이 바뀌므로 비운다
    // 게임에 없는 팀(게스트·미수록 팀)이 낀 정규 경기는 뺀다
    // 정규 이벤트 안의 토너먼트 단계(LCK컵 플레이오프 등)도 대진을 비운다
    const keep = kind === 'regular' && !/playoff|final|knockout|bracket|play-?in|tiebreak|qualif|last chance|swiss round [2-9]/i.test(m.Tab || '');
    const side = name => { if (!keep || isTbd(name)) return null; const id = teamId[norm(name)]; if (!id) unknown.add(name); return id || false; };
    const t1 = side(m.Team1), t2 = side(m.Team2);
    if (t1 === false || t2 === false) return null;
    return { t: dt(m).replace(' ', 'T') + 'Z', bo: +m.BestOf || 1, tab: m.Tab || '', t1, t2 };
  }).filter(Boolean);
  const [start, end] = range[page] || [slots[0]?.t.slice(0, 10), slots.at(-1)?.t.slice(0, 10)];
  return { id, league, name, kind, start, end, slots };
});
if (unknown.size) console.warn('게임에 없는 팀 (해당 경기 제외):', [...unknown].join(', '));

await writeFile(path.join(OUT, 'season-template.json'), JSON.stringify({
  meta: { source: 'Leaguepedia Tournaments + MatchSchedule', baseYear: 2026, scrapedAt: new Date().toISOString() },
  events,
}));
log(`이벤트 ${events.length}개, 경기 ${events.reduce((s, e) => s + e.slots.length, 0)}개 저장`);

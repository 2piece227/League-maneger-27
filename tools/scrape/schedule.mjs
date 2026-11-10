// 2026 실제 리그 일정 → data/season-template.json
// 단계별 기간·경기 슬롯(시각·Bo·주차)·대진 구조·일정 공개일을 받아 둔다.
// 게임은 이 틀을 1년(364일, 요일 유지) 밀고, 팀만 새로 배치해 2027 시즌 일정을 만든다 (js/schedule.js).
// 실행: node tools/scrape/schedule.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { init, api, cargo, inList, OUT, log } from './lp.mjs';

import { EVENTS } from './events.mjs';

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

// 결과에 따라 대진이 갈리는 단계 → 앞 단계 순위로 배치
const DEPENDS = { 'lck-r34': 'lck-r12', 'lpl-s2': 'lpl-s1', 'lpl-s3': 'lpl-s2' };
const GROUP_NAMES = { LCK: ['레전드 그룹', '라이즈 그룹'], LPL: ['상위 그룹', '하위 그룹'] };

const matches = [];
for (const page of pages) {
  const rows = await cargo({
    tables: 'MatchSchedule', fields: 'OverviewPage,DateTime_UTC,BestOf,Tab,Team1,Team2,Winner,_pageName=Page',
    where: `OverviewPage = "${page}"`, orderBy: 'DateTime_UTC',
  });
  matches.push(...rows);
  log(`  ${page}: ${rows.length}경기`);
}

// 일정 데이터 페이지가 처음 만들어진 때 = 일정이 공개된 때
const dataPages = [...new Set(matches.map(m => m.Page).filter(Boolean))];
const created = {};
for (let i = 0; i < dataPages.length; i += 40) {
  const group = dataPages.slice(i, i + 40);
  for (const title of group) {
    const j = await api({ action: 'query', prop: 'revisions', rvdir: 'newer', rvlimit: '1', rvprop: 'timestamp', titles: title });
    const pg = Object.values(j.query.pages)[0];
    if (pg.revisions) created[title] = pg.revisions[0].timestamp;
  }
}

const dt = m => m.DateTime_UTC || m['DateTime UTC']; // Cargo는 밑줄을 공백으로 돌려준다
const unknown = new Set();
// 원본 팀 → 토큰: 'T:<게임 팀 id>' | 'X:<게임에 없는 팀>' | null(미정)
const token = name => {
  if (isTbd(name)) return null;
  const id = teamId[norm(name)];
  if (!id) { unknown.add(name); return 'X:' + name; }
  return 'T:' + id;
};
const isStage = tab => /playoff|final|knockout|bracket|play-?in|tiebreak|qualif|last chance|swiss round [2-9]/i.test(tab || '');

// 실제 2026 결과로 단계별 순위 (승수 → 세트 득실 대신 이름순)
function standings(page) {
  const w = {};
  for (const m of matches.filter(x => x.OverviewPage === page && !isStage(x.Tab))) {
    const a = token(m.Team1), b = token(m.Team2);
    if (!a || !b) continue;
    w[a] ??= 0; w[b] ??= 0;
    if (m.Winner === '1') w[a]++; else if (m.Winner === '2') w[b]++;
  }
  return Object.entries(w).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(x => x[0]);
}

const pageOf = Object.fromEntries(EVENTS.map(e => [e[0], e[1]]));
const events = EVENTS.map(([id, page, league, name, kind]) => {
  const rows = matches.filter(m => m.OverviewPage === page && dt(m));
  const prev = DEPENDS[id] ? standings(pageOf[DEPENDS[id]]) : null;
  const slots = rows.map(m => {
    const base = { t: dt(m).replace(' ', 'T') + 'Z', bo: +m.BestOf || 1, tab: m.Tab || '' };
    if (kind !== 'regular' || isStage(m.Tab)) return { ...base, a: null, b: null };
    const a = token(m.Team1), b = token(m.Team2);
    if (prev && a && b) {
      // 시드 = 앞 단계 순위 (1부터). 게임에 없는 팀의 시드도 그대로 둔다
      const sa = prev.indexOf(a) + 1, sb = prev.indexOf(b) + 1;
      return { ...base, a: 'S:' + sa, b: 'S:' + sb };
    }
    return { ...base, a, b };
  });
  // 의존 단계: 같은 그룹(연결 요소)끼리 묶고, 1위가 속한 쪽을 상위 그룹으로
  let groups = null;
  if (prev) {
    const adj = {};
    slots.forEach(s => { if (s.a && s.b) { (adj[s.a] ||= new Set()).add(s.b); (adj[s.b] ||= new Set()).add(s.a); } });
    const comp = {}; let n = 0;
    for (const k of Object.keys(adj).sort((x, y) => +x.slice(2) - +y.slice(2))) {
      if (comp[k] != null) continue;
      const st = [k]; comp[k] = n;
      while (st.length) { const u = st.pop(); for (const v of adj[u]) if (comp[v] == null) { comp[v] = n; st.push(v); } }
      n++;
    }
    const names = GROUP_NAMES[league] || ['A 그룹', 'B 그룹'];
    groups = Object.fromEntries(Object.entries(comp).map(([k, g]) => [k.slice(2), names[g] || `${g + 1}그룹`]));
    slots.forEach(s => { if (s.a) s.g = groups[s.a.slice(2)]; });
  }
  const pub = rows.map(m => created[m.Page]).filter(Boolean).sort()[0] || null;
  const [start, end] = range[page] || [slots[0]?.t.slice(0, 10), slots.at(-1)?.t.slice(0, 10)];
  return { id, league, name, kind, start, end, published: pub, dependsOn: DEPENDS[id] || null, slots };
});
if (unknown.size) console.warn('게임에 없는 팀 (해당 경기는 게임에서 제외):', [...unknown].join(', '));

await writeFile(path.join(OUT, 'season-template.json'), JSON.stringify({
  meta: { source: 'Leaguepedia Tournaments + MatchSchedule + 일정 페이지 생성일', baseYear: 2026, scrapedAt: new Date().toISOString() },
  events,
}));
log(`이벤트 ${events.length}개, 경기 슬롯 ${events.reduce((s, e) => s + e.slots.length, 0)}개 저장`);
for (const e of events) log(`  ${e.id}: 공개 ${e.published?.slice(0, 10) || '?'} · 시작 ${e.start}`);

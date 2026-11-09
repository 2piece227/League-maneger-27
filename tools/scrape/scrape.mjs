// Leaguepedia(Cargo API) 수집 스크립트 — 로컬에서 실행: node tools/scrape/scrape.mjs
// 결과: data/teams.json, data/players.json, data/history.json
// 익명 cargoquery는 레이트리밋이 빡빡하므로 요청 간 대기 + 백오프 재시도를 한다.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API = 'https://lol.fandom.com/api.php';
const UA = 'LM27-fan-project/0.1 (local data script)';
const SEASON = process.env.LM_SEASON || '2026';
const LEAGUES = ['LCK', 'LPL', 'LEC', 'LCS'];
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../data');
const CACHE = path.join(HERE, '.cache');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// 응답은 .cache/에 저장해서 중단 후 다시 돌려도 받은 부분은 건너뛴다
async function api(params) {
  const url = API + '?' + new URLSearchParams({ format: 'json', ...params });
  const file = path.join(CACHE, createHash('sha1').update(url).digest('hex') + '.json');
  try { return JSON.parse(await readFile(file, 'utf8')); } catch {}

  for (let attempt = 1; attempt <= 60; attempt++) {
    await sleep(attempt === 1 ? 5000 : 90000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      const json = await res.json();
      if (json.error) {
        log(`  ${json.error.code} (시도 ${attempt})`);
        if (json.error.code === 'ratelimited') continue;
        throw new Error(json.error.info);
      }
      await writeFile(file, JSON.stringify(json));
      return json;
    } catch (e) {
      log(`  요청 실패: ${e.message} (시도 ${attempt})`);
    }
  }
  throw new Error('재시도 초과: ' + url);
}

async function cargo({ tables, fields, where, joinOn, orderBy }) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const params = { action: 'cargoquery', tables, fields, where, limit: '500', offset: String(offset) };
    if (joinOn) params.join_on = joinOn;
    if (orderBy) params.order_by = orderBy;
    const json = await api(params);
    const batch = (json.cargoquery || []).map(r => r.title);
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}

const q = s => `"${String(s).replace(/"/g, '\\"')}"`;
const inList = (field, values) => `${field} IN (${values.map(q).join(',')})`;
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// File:XXX → 실제 이미지 URL
async function imageUrls(files) {
  const out = {};
  for (const group of chunks([...new Set(files.filter(Boolean))], 50)) {
    const json = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url', titles: group.map(f => 'File:' + f).join('|') });
    const norm = Object.fromEntries((json.query.normalized || []).map(n => [n.to, n.from]));
    for (const page of Object.values(json.query.pages || {})) {
      const url = page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url;
      if (!url) continue;
      const title = norm[page.title] || page.title;
      out[title.replace(/^File:/, '')] = url;
      out[page.title.replace(/^File:/, '')] = url;
    }
  }
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(CACHE, { recursive: true });

  // 1) 시즌 대회 로스터: 팀별로 가장 최근 대회의 로스터를 현재 로스터로 본다
  const roster = [];
  for (const lg of LEAGUES) {
    log(`${lg} ${SEASON} 로스터 조회`);
    const rows = await cargo({
      tables: 'TournamentPlayers=TP,Tournaments=T',
      joinOn: 'TP.OverviewPage=T.OverviewPage',
      fields: 'TP.Team=Team,TP.Link=Link,TP.Role=Role,TP.OverviewPage=Page,T.DateStart=DateStart',
      where: `TP.OverviewPage LIKE "${lg}/${SEASON} Season/%"`,
    });
    log(`  ${rows.length}행`);
    rows.forEach(r => roster.push({ ...r, league: lg }));
  }

  const latest = {};
  for (const r of roster) {
    const cur = latest[r.Team];
    if (!cur || (r.DateStart || '') > cur.date) latest[r.Team] = { date: r.DateStart || '', page: r.Page, league: r.league };
  }
  const current = roster.filter(r => latest[r.Team] && latest[r.Team].page === r.Page);
  const teamNames = Object.keys(latest);
  log(`팀 ${teamNames.length}개, 선수 ${current.length}명`);

  // 2) 팀 정보 (로고, 팀 사진)
  const teamRows = [];
  for (const group of chunks(teamNames, 100)) {
    teamRows.push(...await cargo({
      tables: 'Teams',
      fields: 'Name,OverviewPage,Short,Location,Region,Image,RosterPhoto',
      where: inList('OverviewPage', group),
    }));
  }

  // 3) 선수 정보 (실명, 사진, 국적, 생일)
  const links = [...new Set(current.map(r => r.Link))];
  const playerRows = [];
  for (const group of chunks(links, 100)) {
    playerRows.push(...await cargo({
      tables: 'Players',
      fields: 'ID,OverviewPage,Image,Name,NativeName,Country,NationalityPrimary,Birthdate,Role,Contract',
      where: inList('OverviewPage', group),
    }));
  }

  // 4) 역대 월즈 우승팀 로고
  const historyNames = ['Fnatic', 'Taipei Assassins', 'SK Telecom T1', 'Samsung White', 'Samsung Galaxy', 'Invictus Gaming', 'FunPlus Phoenix', 'DAMWON Gaming', 'EDward Gaming', 'DRX', 'T1'];
  const historyTeams = await cargo({ tables: 'Teams', fields: 'Name,OverviewPage,Image,RosterPhoto', where: inList('OverviewPage', historyNames) });

  // 5) 이미지 URL
  log('이미지 URL 조회');
  const files = [
    ...teamRows.flatMap(t => [t.Image, t.RosterPhoto]),
    ...playerRows.map(p => p.Image),
    ...historyTeams.map(t => t.Image),
  ];
  const urls = await imageUrls(files);

  const teamByPage = Object.fromEntries(teamRows.map(t => [t.OverviewPage, t]));
  const teams = teamNames.map(name => {
    const t = teamByPage[name] || {};
    return {
      id: slug(name),
      league: latest[name].league,
      name: t.Name || name,
      short: t.Short || name.slice(0, 4).toUpperCase(),
      city: t.Location || '',
      logo: urls[t.Image] || null,
      photo: urls[t.RosterPhoto] || null,
      sourcePage: name,
      rosterFrom: latest[name].page,
    };
  }).sort((a, b) => LEAGUES.indexOf(a.league) - LEAGUES.indexOf(b.league) || a.name.localeCompare(b.name));

  const playerByPage = Object.fromEntries(playerRows.map(p => [p.OverviewPage, p]));
  const ROLE = { Top: 'TOP', Jungle: 'JGL', Mid: 'MID', Bot: 'BOT', Support: 'SUP' };
  const players = current.map(r => {
    const p = playerByPage[r.Link] || {};
    return {
      id: slug(r.Link),
      team: slug(r.Team),
      name: p.ID || r.Link,
      realName: p.Name || '',
      nativeName: p.NativeName || '',
      role: ROLE[r.Role] || ROLE[p.Role] || r.Role || '',
      nation: p.NationalityPrimary || p.Country || '',
      birthdate: p.Birthdate || null,
      contractEnd: p.Contract || null,
      photo: urls[p.Image] || null,
      sourcePage: r.Link,
    };
  });

  const histByPage = Object.fromEntries(historyTeams.map(t => [t.OverviewPage, t]));
  const history = { worldsLogos: Object.fromEntries(historyNames.map(n => [n, urls[(histByPage[n] || {}).Image] || null])) };

  const meta = { source: 'Leaguepedia (lol.fandom.com) Cargo API', season: SEASON, scrapedAt: new Date().toISOString() };
  await writeFile(path.join(OUT, 'teams.json'), JSON.stringify({ meta, teams }, null, 2));
  await writeFile(path.join(OUT, 'players.json'), JSON.stringify({ meta, players }, null, 2));
  await writeFile(path.join(OUT, 'history.json'), JSON.stringify({ meta, ...history }, null, 2));
  log(`완료: 팀 ${teams.length}, 선수 ${players.length} → ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });

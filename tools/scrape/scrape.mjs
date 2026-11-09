// Leaguepedia(Cargo API) 수집 스크립트 — 로컬에서 실행: node tools/scrape/scrape.mjs
// 결과: data/teams.json, data/players.json, data/history.json
// 익명 cargoquery는 레이트리밋이 빡빡하므로 봇 비밀번호(.env)로 로그인하고, 대기 + 재시도를 한다.

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

// 봇 비밀번호 로그인 (tools/scrape/.env의 LP_USER / LP_PASS). 로그인하면 레이트리밋이 크게 완화된다.
let cookie = '';
async function readEnv() {
  try {
    const text = await readFile(path.join(HERE, '.env'), 'utf8');
    return Object.fromEntries(text.split(/\r?\n/).filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }));
  } catch { return {}; }
}
function keepCookies(res) {
  const jar = Object.fromEntries(cookie.split('; ').filter(Boolean).map(c => c.split(/=(.*)/s).slice(0, 2)));
  for (const c of res.headers.getSetCookie()) {
    const [kv] = c.split(';');
    const [k, v] = kv.split(/=(.*)/s);
    jar[k] = v;
  }
  cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}
async function login() {
  const { LP_USER, LP_PASS } = await readEnv();
  if (!LP_USER || !LP_PASS) { log('로그인 정보 없음 → 익명으로 진행 (느림)'); return false; }
  const headers = () => ({ 'User-Agent': UA, Cookie: cookie });
  const t = await fetch(API + '?action=query&meta=tokens&type=login&format=json', { headers: headers() });
  keepCookies(t);
  const token = (await t.json()).query.tokens.logintoken;
  const r = await fetch(API, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ action: 'login', format: 'json', lgname: LP_USER, lgpassword: LP_PASS, lgtoken: token }),
  });
  keepCookies(r);
  const result = (await r.json()).login;
  if (result.result !== 'Success') throw new Error('로그인 실패: ' + (result.reason || result.result));
  log(`로그인 성공: ${result.lgusername}`);
  return true;
}
let loggedIn = false;

// 응답은 .cache/에 저장해서 중단 후 다시 돌려도 받은 부분은 건너뛴다
async function api(params) {
  const url = API + '?' + new URLSearchParams({ format: 'json', ...params });
  const file = path.join(CACHE, createHash('sha1').update(url).digest('hex') + '.json');
  try { return JSON.parse(await readFile(file, 'utf8')); } catch {}

  for (let attempt = 1; attempt <= 60; attempt++) {
    await sleep(attempt === 1 ? (loggedIn ? 1000 : 5000) : (loggedIn ? 20000 : 90000));
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie } });
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
  loggedIn = await login();

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

  // 리그별 "본 대회" 중 가장 최근 것을 현재 로스터로 본다.
  // 참가 팀 수가 리그 최대치의 80% 미만인 페이지(쇼매치, 올스타, 플레이오프 일부)는 제외한다.
  const latest = {};
  for (const lg of LEAGUES) {
    const pages = {};
    for (const r of roster.filter(x => x.league === lg)) {
      const pg = pages[r.Page] || (pages[r.Page] = { teams: new Set(), date: r.DateStart || '' });
      pg.teams.add(r.Team);
    }
    const max = Math.max(...Object.values(pages).map(p => p.teams.size));
    const [page, info] = Object.entries(pages)
      .filter(([, p]) => p.teams.size >= max * 0.8)
      .sort((x, y) => y[1].date.localeCompare(x[1].date))[0];
    log(`  ${lg} 기준 대회: ${page} (${info.teams.size}팀)`);
    for (const t of info.teams) latest[t] = { date: info.date, page, league: lg };
  }
  const current = roster.filter(r => latest[r.Team] && latest[r.Team].page === r.Page);
  const teamNames = Object.keys(latest);
  log(`팀 ${teamNames.length}개, 인원 ${current.length}명`);

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

  // 3-1) 선수 프로필 사진: 프로필 지정 이미지 → 없으면 가장 최근 연도 이미지
  const imageRows = [];
  for (const group of chunks(links, 100)) {
    imageRows.push(...await cargo({
      tables: 'PlayerImages',
      fields: 'FileName,Link,Tournament,IsProfileImage,SortDate',
      where: inList('Link', group),
    }));
  }
  const year = r => Math.max(0, ...(`${r.Tournament} ${r.FileName}`.match(/20\d\d/g) || []).map(Number));
  const rank = r => [r.IsProfileImage === '1' ? 1 : 0, year(r), r.SortDate || ''];
  const better = (x, y) => { const a = rank(x), b = rank(y); return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]); };
  const photoFile = {};
  for (const r of imageRows) if (!photoFile[r.Link] || better(r, photoFile[r.Link]) > 0) photoFile[r.Link] = r;

  // 4) 역대 월즈 우승팀 로고
  const historyNames = ['Fnatic', 'Taipei Assassins', 'SK Telecom T1', 'Samsung White', 'Samsung Galaxy', 'Invictus Gaming', 'FunPlus Phoenix', 'DAMWON Gaming', 'EDward Gaming', 'DRX', 'T1'];
  // 이름이 바뀐 팀은 Teams 표에 옛 이름 페이지가 없으므로 파일명을 직접 지정한다
  const historyFiles = { 'DAMWON Gaming': 'DAMWON Gaminglogo square.png', DRX: 'DRXlogo square.png' };
  const historyTeams = await cargo({ tables: 'Teams', fields: 'Name,OverviewPage,Image,RosterPhoto', where: inList('OverviewPage', historyNames) });

  // 5) 이미지 URL
  log('이미지 URL 조회');
  const files = [
    ...teamRows.flatMap(t => [t.Image, t.RosterPhoto]),
    ...Object.values(photoFile).map(r => r.FileName),
    ...historyTeams.map(t => t.Image),
    ...Object.values(historyFiles),
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
      role: ROLE[r.Role] || (/coach/i.test(r.Role) ? 'COACH' : ROLE[p.Role] || r.Role || ''),
      nation: p.NationalityPrimary || p.Country || '',
      birthdate: p.Birthdate || null,
      contractEnd: p.Contract || null,
      photo: urls[(photoFile[r.Link] || {}).FileName] || null,
      sourcePage: r.Link,
    };
  });

  const histByPage = Object.fromEntries(historyTeams.map(t => [t.OverviewPage, t]));
  const history = { worldsLogos: Object.fromEntries(historyNames.map(n => [n, urls[historyFiles[n] || (histByPage[n] || {}).Image] || null])) };

  const meta = { source: 'Leaguepedia (lol.fandom.com) Cargo API', season: SEASON, scrapedAt: new Date().toISOString() };
  await writeFile(path.join(OUT, 'teams.json'), JSON.stringify({ meta, teams }, null, 2));
  await writeFile(path.join(OUT, 'players.json'), JSON.stringify({ meta, players }, null, 2));
  await writeFile(path.join(OUT, 'history.json'), JSON.stringify({ meta, ...history }, null, 2));
  log(`완료: 팀 ${teams.length}, 선수 ${players.length} → ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });

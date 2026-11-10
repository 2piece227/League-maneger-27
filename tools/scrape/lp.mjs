// Leaguepedia API 공용 헬퍼 (로그인, 캐시된 요청, cargo, 이미지 URL)
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API = 'https://lol.fandom.com/api.php';
const UA = 'LM27-fan-project/0.1 (local data script)';
const SEASON = process.env.LM_SEASON || '2026';
const LEAGUES = ['LCK', 'LPL', 'LEC', 'LCS'];
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.resolve(HERE, '../../data');
const CACHE = path.join(HERE, '.cache');

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

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
export let loggedIn = false;
export async function init() { await mkdir(CACHE, { recursive: true }); loggedIn = await login(); }

// 응답은 .cache/에 저장해서 중단 후 다시 돌려도 받은 부분은 건너뛴다
export async function api(params) {
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

export async function cargo({ tables, fields, where, joinOn, orderBy }) {
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

export const q = s => `"${String(s).replace(/"/g, '\\"')}"`;
export const inList = (field, values) => `${field} IN (${values.map(q).join(',')})`;
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');


// File:XXX → 실제 이미지 URL
export async function imageUrls(files) {
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

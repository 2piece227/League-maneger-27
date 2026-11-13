// 상위권 솔랭 메타: 한국 서버 챌린저·그랜드마스터 랭크 게임의 픽·밴 비율 → data/soloq-meta.json
// 실행: node tools/scrape/soloq-meta.mjs [게임 수, 기본 400]
// 필요: tools/scrape/.env 에 RIOT_KEY=... (개발자 키, 24시간 만료). 키는 출력하지 않는다.
// 개발자 키 한도(1초 20회 · 2분 100회)에 맞춰 천천히 받는다.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..', '..');
const env = Object.fromEntries((await readFile(path.join(HERE, '.env'), 'utf8').catch(() => '')).split(/\r?\n/).map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2]]));
const KEY = env.RIOT_KEY;
if (!KEY) { console.error('tools/scrape/.env 에 RIOT_KEY 가 없습니다.'); process.exit(1); }
const WANT = +(process.argv[2] || 400);

const stamps = [];
async function riot(host, p) {
  for (let attempt = 0; attempt < 5; attempt++) {
    // 2분 100회 · 1초 20회
    for (;;) { const now = Date.now(); while (stamps.length && now - stamps[0] > 121000) stamps.shift(); const last1 = stamps.filter(t => now - t < 1050).length; if (stamps.length < 98 && last1 < 19) break; await new Promise(r => setTimeout(r, 400)); }
    stamps.push(Date.now());
    const r = await fetch(`https://${host}.api.riotgames.com${p}`, { headers: { 'X-Riot-Token': KEY } });
    if (r.status === 429) { await new Promise(res => setTimeout(res, (+r.headers.get('retry-after') || 10) * 1000)); continue; }
    if (r.status === 401 || r.status === 403) { console.error('키가 만료됐거나 잘못됐습니다 (HTTP ' + r.status + ').'); process.exit(1); }
    if (!r.ok) return null;
    return r.json();
  }
  return null;
}

const champs = JSON.parse(await readFile(path.join(ROOT, 'data/champions.json'), 'utf8')).champions;
const byKey = Object.fromEntries(champs.map(c => [String(c.key), c.nameEn])), byId = Object.fromEntries(champs.map(c => [c.id, c.nameEn]));
const POS = { TOP: 'TOP', JUNGLE: 'JGL', MIDDLE: 'MID', BOTTOM: 'BOT', UTILITY: 'SUP' };

const players = [];
for (const tier of ['challengerleagues', 'grandmasterleagues']) {
  const L = await riot('kr', `/lol/league/v4/${tier}/by-queue/RANKED_SOLO_5x5`);
  (L && L.entries || []).sort((a, b) => b.leaguePoints - a.leaguePoints).forEach(e => e.puuid && players.push(e.puuid));
}
console.log('상위 랭커', players.length, '명');
const ids = new Set();
for (const pu of players) {
  if (ids.size >= WANT * 1.2) break;
  const l = await riot('asia', `/lol/match/v5/matches/by-puuid/${pu}/ids?queue=420&count=10`);
  (l || []).forEach(id => ids.add(id));
}
const C = {}; let games = 0, patch = null;
for (const id of ids) {
  if (games >= WANT) break;
  const m = await riot('asia', `/lol/match/v5/matches/${id}`); if (!m || !m.info || m.info.queueId !== 420) continue;
  games++; patch ||= m.info.gameVersion.split('.').slice(0, 2).join('.');
  const seen = new Set();
  m.info.participants.forEach(p => { const n = byId[p.championName] || p.championName, x = C[n] ||= { pick: 0, ban: 0, win: 0, roles: {} }; x.pick++; if (p.win) x.win++; const r = POS[p.teamPosition]; if (r) x.roles[r] = (x.roles[r] || 0) + 1; seen.add(n); });
  m.info.teams.forEach(t => t.bans.forEach(b => { const n = byKey[String(b.championId)]; if (n && !seen.has(n)) { (C[n] ||= { pick: 0, ban: 0, win: 0, roles: {} }).ban++; seen.add(n); } }));
  if (games % 50 === 0) console.log(games, '게임');
}
const out = { source: 'Riot API · KR 챌린저/그랜드마스터 랭크 게임', patch, games, scrapedAt: new Date().toISOString(),
  champs: Object.fromEntries(Object.entries(C).map(([n, x]) => [n, { presence: +((x.pick + x.ban) / games).toFixed(4), pick: +(x.pick / games).toFixed(4), ban: +(x.ban / games).toFixed(4), wr: x.pick ? +(x.win / x.pick).toFixed(3) : null, roles: x.roles }])) };
await writeFile(path.join(ROOT, 'data/soloq-meta.json'), JSON.stringify(out));
console.log('저장: data/soloq-meta.json', games, '게임, 패치', patch);

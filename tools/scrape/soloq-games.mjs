// 상위권 솔랭 경기 + 타임라인 수집 → tools/scrape/out/soloq-games.jsonl (한 줄에 한 게임, 이어받기 가능)
// 실행: node tools/scrape/soloq-games.mjs [게임 수, 기본 500]
// 필요: tools/scrape/.env 의 RIOT_KEY (개발자 키, 24시간). 키는 출력하지 않는다.
// 한 게임 = 경기 기록 1회 + 타임라인 1회. 개발자 키 한도(1초 20회 · 2분 100회)에 맞춰 천천히.
// 다음 단계: node tools/scrape/soloq-meta.mjs (메타) · python tools/soloq-analyze.py (엔진 목표치)
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), OUTF = path.join(HERE, 'out', 'soloq-games.jsonl');
const env = Object.fromEntries((await readFile(path.join(HERE, '.env'), 'utf8').catch(() => '')).split(/\r?\n/).map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2]]));
const KEY = env.RIOT_KEY;
if (!KEY) { console.error('tools/scrape/.env 에 RIOT_KEY 가 없습니다.'); process.exit(1); }
const WANT = +(process.argv[2] || 500);

const stamps = [];
async function riot(host, p) {
  for (let attempt = 0; attempt < 6; attempt++) {
    for (;;) { const now = Date.now(); while (stamps.length && now - stamps[0] > 121500) stamps.shift(); const last1 = stamps.filter(t => now - t < 1100).length; if (stamps.length < 97 && last1 < 18) break; await new Promise(r => setTimeout(r, 300)); }
    stamps.push(Date.now());
    let r; try { r = await fetch(`https://${host}.api.riotgames.com${p}`, { headers: { 'X-Riot-Token': KEY } }); } catch { await new Promise(res => setTimeout(res, 3000)); continue; }
    if (r.status === 429) { await new Promise(res => setTimeout(res, (+r.headers.get('retry-after') || 10) * 1000)); continue; }
    if (r.status === 401 || r.status === 403) { console.error('키가 만료됐거나 잘못됐습니다 (HTTP ' + r.status + ').'); process.exit(1); }
    if (r.status >= 500) { await new Promise(res => setTimeout(res, 2000)); continue; }
    if (!r.ok) return null;
    return r.json();
  }
  return null;
}

await mkdir(path.dirname(OUTF), { recursive: true });
const have = new Set((await readFile(OUTF, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(l => { try { return JSON.parse(l).id; } catch { return null; } }));
console.log('이미 받은 게임', have.size);

const players = [];
for (const tier of ['challengerleagues', 'grandmasterleagues']) {
  const L = await riot('kr', `/lol/league/v4/${tier}/by-queue/RANKED_SOLO_5x5`);
  (L && L.entries || []).sort((a, b) => b.leaguePoints - a.leaguePoints).forEach(e => e.puuid && players.push(e.puuid));
}
console.log('상위 랭커', players.length, '명');

let got = have.size, pi = 0;
const queue = [];
while (got < WANT) {
  if (!queue.length) {
    if (pi >= players.length) break;
    const l = await riot('asia', `/lol/match/v5/matches/by-puuid/${players[pi++]}/ids?queue=420&count=8`);
    (l || []).forEach(id => { if (!have.has(id) && !queue.includes(id)) queue.push(id); });
    continue;
  }
  const id = queue.shift(); have.add(id);
  const m = await riot('asia', `/lol/match/v5/matches/${id}`);
  if (!m || !m.info || m.info.queueId !== 420 || m.info.gameDuration < 900) continue;   // 15분 미만(항복·다시하기) 제외
  const tl = await riot('asia', `/lol/match/v5/matches/${id}/timeline`);
  if (!tl || !tl.info) continue;
  const I = m.info;
  const game = {
    id, ver: I.gameVersion, dur: I.gameDuration,
    p: I.participants.map(p => ({ i: p.participantId, t: p.teamId, c: p.championName, pos: p.teamPosition, win: p.win, k: p.kills, d: p.deaths, a: p.assists, cs: p.totalMinionsKilled, jcs: p.neutralMinionsKilled, gold: p.goldEarned, wards: p.wardsPlaced, s: [p.summoner1Id, p.summoner2Id] })),
    teams: I.teams.map(t => ({ t: t.teamId, win: t.win, bans: t.bans.map(b => b.championId), obj: Object.fromEntries(Object.entries(t.objectives || {}).map(([k, v]) => [k, v.kills])) })),
    // 1분마다: 선수별 [x, y, 골드, 레벨, CS]
    f: tl.info.frames.map(fr => Object.values(fr.participantFrames).map(q => [q.position ? q.position.x : 0, q.position ? q.position.y : 0, q.totalGold, q.level, q.minionsKilled + q.jungleMinionsKilled])),
    ev: tl.info.frames.flatMap(fr => fr.events).filter(e => ['CHAMPION_KILL', 'ELITE_MONSTER_KILL', 'BUILDING_KILL', 'TURRET_PLATE_DESTROYED', 'ITEM_PURCHASED', 'WARD_PLACED', 'CHAMPION_SPECIAL_KILL'].includes(e.type)).map(e => {
      const o = { ty: e.type, ts: e.timestamp };
      if (e.position) o.xy = [e.position.x, e.position.y];
      if (e.killerId != null) o.k = e.killerId;
      if (e.victimId != null) o.v = e.victimId;
      if (e.assistingParticipantIds) o.as = e.assistingParticipantIds;
      if (e.monsterType) { o.mo = e.monsterType; o.sub = e.monsterSubType; o.kt = e.killerTeamId; }
      if (e.buildingType) { o.b = e.buildingType; o.lane = e.laneType; o.tw = e.towerType; o.bt = e.teamId; }
      if (e.itemId) { o.it = e.itemId; o.pi = e.participantId; }
      if (e.wardType) { o.w = e.wardType; o.c = e.creatorId; }
      if (e.killType) o.kty = e.killType;
      return o;
    }),
  };
  await appendFile(OUTF, JSON.stringify(game) + '\n');
  got++;
  if (got % 25 === 0) console.log(new Date().toTimeString().slice(0, 8), got, '게임');
}
console.log('끝:', got, '게임 →', path.relative(process.cwd(), OUTF));

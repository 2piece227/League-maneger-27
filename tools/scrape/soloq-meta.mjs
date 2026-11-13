// 상위권 솔랭 메타: soloq-games.mjs 로 받은 경기(out/soloq-games.jsonl)의 픽·밴 비율 → data/soloq-meta.json
// 실행: node tools/scrape/soloq-meta.mjs   (API를 다시 부르지 않는다)
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..', '..');
const lines = (await readFile(path.join(HERE, 'out', 'soloq-games.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean);
if (!lines.length) { console.error('먼저 node tools/scrape/soloq-games.mjs 로 경기를 받으세요.'); process.exit(1); }
const champs = JSON.parse(await readFile(path.join(ROOT, 'data/champions.json'), 'utf8')).champions;
const byKey = Object.fromEntries(champs.map(c => [String(c.key), c.nameEn])), byId = Object.fromEntries(champs.map(c => [c.id, c.nameEn]));
const POS = { TOP: 'TOP', JUNGLE: 'JGL', MIDDLE: 'MID', BOTTOM: 'BOT', UTILITY: 'SUP' };
const C = {}; const vers = {}; let games = 0;
for (const l of lines) {
  const g = JSON.parse(l); games++;
  const v = g.ver.split('.').slice(0, 2).join('.'); vers[v] = (vers[v] || 0) + 1;
  const seen = new Set();
  g.p.forEach(p => { const n = byId[p.c] || p.c, x = C[n] ||= { pick: 0, ban: 0, win: 0, roles: {} }; x.pick++; if (p.win) x.win++; const r = POS[p.pos]; if (r) x.roles[r] = (x.roles[r] || 0) + 1; seen.add(n); });
  g.teams.forEach(t => t.bans.forEach(b => { const n = byKey[String(b)]; if (n && !seen.has(n)) { (C[n] ||= { pick: 0, ban: 0, win: 0, roles: {} }).ban++; seen.add(n); } }));
}
const patch = Object.entries(vers).sort((a, b) => b[1] - a[1])[0][0];
const out = { source: 'Riot API · KR 챌린저/그랜드마스터 랭크 게임', patch, games, scrapedAt: new Date().toISOString(),
  champs: Object.fromEntries(Object.entries(C).map(([n, x]) => [n, { presence: +((x.pick + x.ban) / games).toFixed(4), pick: +(x.pick / games).toFixed(4), ban: +(x.ban / games).toFixed(4), wr: x.pick ? +(x.win / x.pick).toFixed(3) : null, roles: x.roles }])) };
await writeFile(path.join(ROOT, 'data/soloq-meta.json'), JSON.stringify(out));
console.log('저장: data/soloq-meta.json', games, '게임, 패치', patch);
console.log('상위 10:', Object.entries(out.champs).sort((a, b) => b[1].presence - a[1].presence).slice(0, 10).map(([n, x]) => `${n} ${Math.round(x.presence * 100)}%`).join(', '));

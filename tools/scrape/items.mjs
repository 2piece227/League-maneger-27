// 아이템 정보·아이콘 (Riot Data Dragon) → data/items.json + assets/items/<id>.png
// 프로 경기 빌드(data/champ-stats.json)에 나온 아이템 + 그 하위 재료 전부 + 정글 펫 · 서폿 퀘스트 아이템 · 와드·장신구.
// 실행: node tools/scrape/items.mjs  (champ-stats.mjs 다음에)
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const DD = 'https://ddragon.leagueoflegends.com';
const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r; };

const [version] = await (await get(`${DD}/api/versions.json`)).json();
const [ko, en] = await Promise.all(['ko_KR', 'en_US'].map(async l => (await get(`${DD}/cdn/${version}/data/${l}/item.json`)).json()));
const stats = JSON.parse(await readFile(path.join(ROOT, 'data/champ-stats.json'), 'utf8'));
// Leaguepedia 기록에는 없거나 이름이 다른 것들
const EXTRA = ['Gustwalker Hatchling', 'Mosstomper Seedling', 'Scorchclaw Pup', 'World Atlas', 'Runic Compass', 'Bounty of Worlds', 'Control Ward', 'Stealth Ward', 'Oracle Lens', 'Farsight Alteration', 'Health Potion', 'Refillable Potion'];
const ALIAS = { "Luden's Companion": "Luden's Echo" };
const used = new Set([...Object.values(stats.champs).flatMap(c => c.items.map(([n]) => n)), ...EXTRA]);

const byName = {}, byId = {};
for (const [id, it] of Object.entries(en.data)) {
  if (!it.maps || !it.maps['11'] || !it.gold) continue;
  const k = it.name.toLowerCase(), prev = byName[k];
  if (prev && (prev.gold.purchasable || !it.gold.purchasable) && +prev.id < 10000) continue;   // 아레나 등 다른 모드용 복제(5자리 id)는 뒤로
  byName[k] = { id, ...it }; byId[id] = { id, ...it };
}
const find = n => byName[(ALIAS[n] || n).toLowerCase()];
const out = {}, add = (name, it) => {
  if (!it || out[name]) return;
  const k = ko.data[it.id] || {};
  out[name] = { id: it.id, ko: k.name || name, gold: it.gold.total, tags: it.tags || [], boots: (it.tags || []).includes('Boots'), from: (it.from || []).map(f => byId[f] && byId[f].name).filter(Boolean), depth: it.depth || 1 };
  (it.from || []).forEach(f => byId[f] && add(byId[f].name, byId[f]));     // 하위 재료까지
};
for (const name of used) add(name, find(name));
// Leaguepedia 이름 → Data Dragon 이름이 다르면 원래 이름으로도 찾을 수 있게
for (const [a, b] of Object.entries(ALIAS)) if (out[b]) out[a] = out[b];

await mkdir(path.join(ROOT, 'assets/items'), { recursive: true });
let n = 0;
for (const it of Object.values(out)) {
  const file = path.join(ROOT, 'assets/items', it.id + '.png');
  try { await access(file); continue; } catch {}
  const r = await get(`${DD}/cdn/${version}/img/item/${it.id}.png`);
  await writeFile(file, Buffer.from(await r.arrayBuffer())); n++;
}
await writeFile(path.join(ROOT, 'data/items.json'), JSON.stringify({ meta: { source: 'Riot Data Dragon', version }, items: out }));
console.log(`Data Dragon ${version} · 아이템 ${Object.keys(out).length}개 (아이콘 새로 받음 ${n}) · 이름 못 찾음 ${[...used].filter(x => !out[x]).join(', ') || '없음'}`);

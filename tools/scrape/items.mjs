// 아이템 정보·아이콘 (Riot Data Dragon) → data/items.json + assets/items/<id>.png
// 프로 경기 빌드(data/champ-stats.json)에 나온 아이템 + 신발 + 시작 아이템만 받는다.
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
const used = new Set(Object.values(stats.champs).flatMap(c => c.items.map(([n]) => n)));

// 이름(영문) → 아이템. 소환사의 협곡(맵 11)에서 살 수 있는 것 우선
const byName = {};
for (const [id, it] of Object.entries(en.data)) {
  if (!it.maps || !it.maps['11'] || !it.gold) continue;
  const prev = byName[it.name];
  if (prev && prev.gold.purchasable && !it.gold.purchasable) continue;
  byName[it.name] = { id, ...it };
}
const out = {};
for (const name of used) {
  const it = byName[name]; if (!it) continue;
  const k = ko.data[it.id] || {};
  out[name] = { id: it.id, ko: k.name || name, gold: it.gold.total, tags: it.tags || [], boots: (it.tags || []).includes('Boots'), into: it.into || [], depth: it.depth || 1 };
}
await mkdir(path.join(ROOT, 'assets/items'), { recursive: true });
let n = 0;
for (const it of Object.values(out)) {
  const file = path.join(ROOT, 'assets/items', it.id + '.png');
  try { await access(file); continue; } catch {}
  const r = await get(`${DD}/cdn/${version}/img/item/${it.id}.png`);
  await writeFile(file, Buffer.from(await r.arrayBuffer())); n++;
}
await writeFile(path.join(ROOT, 'data/items.json'), JSON.stringify({ meta: { source: 'Riot Data Dragon', version }, items: out }));
console.log(`Data Dragon ${version} · 아이템 ${Object.keys(out).length}개 (아이콘 새로 받음 ${n}) · 이름 못 찾음 ${[...used].filter(x => !out[x]).length}`);

// 챔피언 스킬 전체 수치: 패시브 + Q/W/E/R (변신 형태 포함) — 설명 · 랭크별 피해 · 계수 · CC 수치 · 사거리 · 범위 · 투사체 속도 · 시전 시간
//  → data/champ-skills.json  (Meraki Analytics, Riot 게임 파일 기반 공개 데이터)
//  럼블 열기 · 나르 분노처럼 패시브에 붙은 고유 자원 · 규칙은 설명(d) 문장에 수치와 함께 들어 있다.
// 실행: node tools/scrape/champ-skills.mjs
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const M = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US';
const r = await fetch(`${M}/champions.json`); if (!r.ok) throw new Error(`${r.status} champions.json`);
const champs = await r.json();

// 랭크마다 단위가 같으면 하나로 줄인다
const mod = m => { const u = [...new Set(m.units)]; return { v: m.values, u: u.length === 1 ? u[0] : m.units }; };
const keep = v => v != null && v !== '' && v !== 'null';
const form = a => {
  const o = { name: a.name, targeting: a.targeting, affects: a.affects, resource: a.resource, dmg: a.damageType, spellshield: a.spellshieldable,
    cd: a.cooldown && a.cooldown.modifiers ? a.cooldown.modifiers.map(mod) : null, cdNote: a.cooldown && a.cooldown.affectedByCdr === false ? 'no-haste' : undefined,
    cost: a.cost && a.cost.modifiers ? a.cost.modifiers.map(mod) : null,
    range: a.targetRange, radius: a.effectRadius, inner: a.innerRadius, width: a.width, angle: a.angle, speed: a.speed, missile: a.missileSpeed,
    cast: a.castTime, recharge: a.rechargeRate, tether: a.tetherRadius, collision: a.collisionRadius,
    fx: (a.effects || []).map(e => ({ d: e.description, lv: (e.leveling || []).map(l => ({ a: l.attribute, m: (l.modifiers || []).map(mod) })) })),
    notes: a.notes || undefined };
  for (const k of Object.keys(o)) if (!keep(o[k]) || (Array.isArray(o[k]) && !o[k].length)) delete o[k];
  return o;
};
const out = {};
for (const [id, c] of Object.entries(champs)) out[id] = Object.fromEntries(['P', 'Q', 'W', 'E', 'R'].map(k => [k, (c.abilities[k] || []).map(form)]));
await writeFile(path.join(ROOT, 'data/champ-skills.json'), JSON.stringify({ meta: { source: 'Meraki Analytics (Riot game files)', fetched: new Date().toISOString() }, champs: out }));
const forms = Object.values(out).reduce((n, c) => n + Object.values(c).reduce((m, f) => m + f.length, 0), 0);
console.log(`챔피언 ${Object.keys(out).length} · 스킬 형태 ${forms}개`);

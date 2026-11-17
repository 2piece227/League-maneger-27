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
// 보호막만 따로 작게 (게임이 바로 읽는다): 챔피언 → 스킬 → { b: 랭크별 기본값, r: [[계수, 종류]], dur: 지속(초) }
//  종류: ap 주문력 · ad 공격력 · bad 추가 공격력 · hp 최대 체력 · bhp 추가 체력 · arm 추가 방어력 · mr 추가 마저 · mp 최대 마나
const SH_PREF = ['Shield Strength', 'Shield', 'Maximum Shield Strength', 'Initial Shield Strength', 'Magic Shield Strength', 'Total Primary Target Shield', 'Minimum Shield Strength', 'Total Maximum Shield', 'Ally Initial Shield', 'Minimum Shield', 'Maximum Shield'];
const unitKind = u => { u = (Array.isArray(u) ? u[0] : u || '').trim();
  if (u === '') return 'flat'; if (/^% AP$/.test(u)) return 'ap'; if (/^% bonus AD$/.test(u)) return 'bad'; if (/^% AD$/.test(u)) return 'ad';
  if (/bonus health/.test(u)) return 'bhp'; if (/maximum health/.test(u) && !/target/.test(u)) return 'hp'; if (/bonus armor/.test(u)) return 'arm'; if (/bonus magic resistance/.test(u)) return 'mr'; if (/maximum mana/.test(u)) return 'mp'; return null; };
const shields = {};
for (const [id, c] of Object.entries(out)) for (const k of ['P', 'Q', 'W', 'E', 'R']) {
  const f = (c[k] || [])[0]; if (!f || !f.fx) continue;
  let best = null;
  f.fx.forEach(e => e.lv.forEach(l => { const i = SH_PREF.indexOf(l.a); if (i >= 0 && (!best || i < best.i)) best = { i, l, e }; }));
  if (!best) continue;
  const o = { b: [0], r: [] };
  best.l.m.forEach(m => { const t = unitKind(m.u); if (t === 'flat') o.b = m.v; else if (t) o.r.push([m.v[0], t, m.v.length > 1 && new Set(m.v).size > 1 ? m.v : undefined]); });
  const dm = best.e.d.match(/for (\d+(?:\.\d+)?) seconds/) || f.fx.map(e => e.d).join(' ').match(/shield[^.]*?for (\d+(?:\.\d+)?) seconds/i);
  o.dur = dm ? +dm[1] : 2.5;
  o.r = o.r.map(([v, t, vs]) => vs ? [vs, t] : [v, t]);
  (shields[id] ||= {})[k] = o;
}
await writeFile(path.join(ROOT, 'data/champ-shields.json'), JSON.stringify({ meta: { source: 'Meraki Analytics (Riot game files)' }, champs: shields }));
console.log(`보호막 스킬 ${Object.values(shields).reduce((n, c) => n + Object.keys(c).length, 0)}개`);
const forms = Object.values(out).reduce((n, c) => n + Object.values(c).reduce((m, f) => m + f.length, 0), 0);
console.log(`챔피언 ${Object.keys(out).length} · 스킬 형태 ${forms}개`);

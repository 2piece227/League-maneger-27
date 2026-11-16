// 챔피언 기본 스탯 · 스킬 수치 · 아이템 스탯 (Meraki Analytics, Riot 게임 파일 기반 공개 데이터)
//  → data/champ-base.json, data/item-stats.json
//  Data Dragon은 레벨당 공격력이 모두 0으로 나오고 아이템 스탯도 비어 있어서 이쪽을 쓴다.
// 실행: node tools/scrape/champ-base.mjs
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const M = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US';
const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const [champs, items] = await Promise.all([get(`${M}/champions.json`), get(`${M}/items.json`)]);

const st = (s, k) => s[k] || {};
const num = v => (v == null || v === '' || isNaN(+v) ? null : +v);
// 스킬 수치에서 첫 값 묶음만 (랭크별 배열)
const vals = x => (x && x.modifiers && x.modifiers[0] && x.modifiers[0].values) || null;
const one = v => { if (v == null) return null; const n = String(v).match(/[\d.]+/); return n ? +n[0] : null; };

const base = {};
for (const [id, c] of Object.entries(champs)) {
  const s = c.stats;
  base[id] = {
    res: c.resource, type: c.attackType,
    hp: st(s, 'health').flat, hpL: st(s, 'health').perLevel, hp5: st(s, 'healthRegen').flat, hp5L: st(s, 'healthRegen').perLevel,
    mp: st(s, 'mana').flat, mpL: st(s, 'mana').perLevel, mp5: st(s, 'manaRegen').flat, mp5L: st(s, 'manaRegen').perLevel,
    arm: st(s, 'armor').flat, armL: st(s, 'armor').perLevel, mr: st(s, 'magicResistance').flat, mrL: st(s, 'magicResistance').perLevel,
    ad: st(s, 'attackDamage').flat, adL: st(s, 'attackDamage').perLevel,
    as: st(s, 'attackSpeed').flat, asL: st(s, 'attackSpeed').perLevel, asR: st(s, 'attackSpeedRatio').flat,
    range: st(s, 'attackRange').flat, ms: st(s, 'movespeed').flat,
    // 스킬: 재사용 대기(랭크별) · 소모 · 대상 방식 · 사거리 · 범위 · 폭 · 각도
    sk: Object.fromEntries(['Q', 'W', 'E', 'R'].map(k => {
      const a = (c.abilities[k] || [])[0] || {};
      return [k, { name: a.name, cd: vals(a.cooldown), cost: vals(a.cost), resource: a.resource || null, targeting: a.targeting || null,
        range: one(a.targetRange), radius: one(a.effectRadius), width: one(a.width), angle: one(a.angle), dmg: a.damageType || null }];
    })),
  };
}
const S = (x, k) => (x.stats[k] || {});
const istats = {};
for (const it of Object.values(items)) {
  if (it.removed || !it.shop || !it.shop.purchasable && !/Hatchling|Seedling|Pup|World Atlas|Runic Compass|Bounty of Worlds/.test(it.name)) continue;
  const o = {
    hp: S(it, 'health').flat, ad: S(it, 'attackDamage').flat, ap: S(it, 'abilityPower').flat, arm: S(it, 'armor').flat, mr: S(it, 'magicResistance').flat,
    as: S(it, 'attackSpeed').percent, crit: S(it, 'criticalStrikeChance').percent, ms: S(it, 'movespeed').flat, msP: S(it, 'movespeed').percent,
    mp: S(it, 'mana').flat, ah: S(it, 'abilityHaste').flat, leth: S(it, 'lethality').flat, armPen: S(it, 'armorPenetration').percent,
    mpen: S(it, 'magicPenetration').flat, mpenP: S(it, 'magicPenetration').percent, hp5: S(it, 'healthRegen').percent, mp5: S(it, 'manaRegen').percent,
    ls: S(it, 'lifesteal').percent, omni: S(it, 'omnivamp').percent,
  };
  for (const k of Object.keys(o)) if (!o[k]) delete o[k];
  istats[it.name] = o;
}
await writeFile(path.join(ROOT, 'data/champ-base.json'), JSON.stringify({ meta: { source: 'Meraki Analytics (Riot game files)', fetched: new Date().toISOString() }, champs: base }));
await writeFile(path.join(ROOT, 'data/item-stats.json'), JSON.stringify({ meta: { source: 'Meraki Analytics (Riot game files)', fetched: new Date().toISOString() }, items: istats }));
const ours = JSON.parse(await readFile(path.join(ROOT, 'data/champions.json'), 'utf8')), list = Array.isArray(ours) ? ours : (ours.champions || Object.values(ours));
console.log(`챔피언 ${Object.keys(base).length} · 아이템 ${Object.keys(istats).length} · 게임에 있는데 없는 챔피언: ${list.map(c => c.id).filter(id => !base[id]).join(', ') || '없음'}`);

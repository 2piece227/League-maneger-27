// 스킬 피해 수치: data/champ-skills.json (Meraki) → data/skill-dmg.json (게임이 바로 읽는다)
//  챔피언 → Q/W/E/R → { t: 피해 종류(p 물리 · m 마법 · t 고정 · x 혼합), b: 랭크별 기본 피해, r: [[랭크별 계수(%), 종류, 추가]], n: 여러 번 맞는 횟수 }
//  계수 종류: ap 주문력 · ad 공격력 · bad 추가 공격력 · hp 본인 최대 체력 · bhp 본인 추가 체력 · arm/barm 방어력 · bmr 추가 마저 · mp 최대 마나
//            tmax 대상 최대 체력 · tmiss 대상 잃은 체력 · tcur 대상 현재 체력 (추가: 주문력 · 추가 방어 · 마저 100당 몇 %)
//  고르는 법: 챔피언 대상 피해 중 '총 피해' > 기본 피해 > 최소·최대(평균) > 추가 피해 > 초당 피해(× 3). 미니언 · 몬스터 전용 피해는 뺀다
// 실행: node tools/scrape/skill-dmg.mjs   (champ-skills.mjs · skill-fx.mjs 다음에)
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SK = JSON.parse(await readFile(path.join(ROOT, 'data/champ-skills.json'), 'utf8')).champs;
const FX = JSON.parse(await readFile(path.join(ROOT, 'data/skill-fx.json'), 'utf8')).champs;
const BAD = /minion|monster|non-champion|reduc|increase|bonus attack damage|heal|shield|attack speed|structure|turret|cap\b|capped|self|stored|absorb|modifier/i;

function kind(u) {
  u = (Array.isArray(u) ? u[0] : u || '').replace(/\s+/g, ' ').trim();
  const ex = {}; let m;
  const re = /\(\+ ([\d.]+)% per ([\d.]+) (AP|bonus armor|bonus magic resistance|bonus AD|AD|bonus health)\)/g;
  while ((m = re.exec(u))) ex[{ AP: 'ap', 'bonus armor': 'barm', 'bonus magic resistance': 'bmr', 'bonus AD': 'bad', AD: 'ad', 'bonus health': 'bhp' }[m[3]]] = +m[1] / +m[2] * 100;
  const e = Object.keys(ex).length ? ex : undefined;
  if (u === '') return ['flat'];
  if (/^% AP$/.test(u)) return ['ap']; if (/^% bonus AD$/.test(u)) return ['bad']; if (/^% AD$/.test(u)) return ['ad'];
  if (/target'?s? maximum health|the target's maximum health|primary target's maximum health/.test(u)) return ['tmax', e];
  if (/target'?s? missing health/.test(u)) return ['tmiss', e];
  if (/target'?s? current health/.test(u)) return ['tcur', e];
  if (/primary target's bonus health/.test(u)) return null;
  if (/^% bonus health$|of (?:his|her|its) bonus health/.test(u)) return ['bhp'];
  if (/^% maximum health$|of (?:his|her|its|[A-Z][\w']*'s) maximum health/.test(u)) return ['hp'];
  if (/^% bonus armor$/.test(u)) return ['barm']; if (/^% armor$/.test(u)) return ['arm'];
  if (/^% bonus magic resistance$/.test(u)) return ['bmr']; if (/^% maximum mana$/.test(u)) return ['mp'];
  return null;
}
function score(a) {
  if (BAD.test(a)) return 0;
  if (/^total (?:physical |magic |true |mixed |single-target )?damage$/i.test(a)) return 6;
  if (/^(?:physical |magic |true )?damage$/i.test(a)) return 5;
  if (/^initial/i.test(a)) return 4;
  if (/^(?:minimum|maximum)/i.test(a)) return 3.5;
  if (/per (?:tick|second)/i.test(a)) return 2;
  if (/per (?:bullet|bolt|hit|shot|missile|dagger|blade|wave|strike|stack)/i.test(a)) return 2.5;
  if (/^bonus .*damage$|on-hit|enhanced|empowered/i.test(a)) return 3;
  if (/damage/i.test(a)) return 1;
  return 0;
}
const typeOf = (a, f) => /physical/i.test(a) ? 'p' : /magic/i.test(a) ? 'm' : /true/i.test(a) ? 't' : /mixed/i.test(a) ? 'x' : /PHYSICAL/.test(f.dmg || '') ? 'p' : /TRUE/.test(f.dmg || '') ? 't' : /MIXED/.test(f.dmg || '') ? 'x' : 'm';
function parse(lv) {
  const o = { b: [0], r: [] }; let ok = false;
  for (const m of lv.m) { const k = kind(m.u); if (!k) continue; ok = true; if (k[0] === 'flat') o.b = m.v; else o.r.push(k[1] ? [m.v, k[0], k[1]] : [m.v, k[0]]); }
  return ok ? o : null;
}
const avg = (a, b) => { const L = Math.max(a.length, b.length), at = (v, i) => v[Math.min(v.length - 1, i)]; return Array.from({ length: L }, (_, i) => (at(a, i) + at(b, i)) / 2); };

const out = {}; let n = 0;
for (const [id, c] of Object.entries(SK)) {
  for (const k of ['Q', 'W', 'E', 'R']) {
    const f = (c[k] || [])[0]; if (!f || !f.fx) continue;
    const L = []; f.fx.forEach(e => e.lv.forEach(l => { const s = score(l.a); if (s > 0) L.push({ s, l }); }));
    if (!L.length) continue;
    L.sort((a, b) => b.s - a.s);
    let best = L[0], d = parse(best.l);
    if (best.s === 3.5) {   // 최소 · 최대가 같이 있으면 평균 (충전 · 거리 · 잃은 체력에 따라 달라지는 스킬)
      const mn = L.find(x => /^minimum/i.test(x.l.a)), mx = L.find(x => /^maximum/i.test(x.l.a) && x.l.a.replace(/^maximum/i, '') === (mn ? mn.l.a.replace(/^minimum/i, '') : ''));
      if (mn && mx) { const a = parse(mn.l), b = parse(mx.l); if (a && b && a.r.length === b.r.length) d = { b: avg(a.b, b.b), r: a.r.map((x, i) => [avg(x[0], b.r[i][0]), x[1], x[2]]) }; }
    }
    if (!d || (!d.b.some(v => v > 0) && !d.r.length)) continue;
    const fx = ((FX[id] || {})[k] || [])[0] || {};
    let mul = 1;
    if (/per (?:tick|second)/i.test(best.l.a)) mul = 3;
    else if (/per (?:bullet|bolt|hit|shot|missile|dagger|blade|wave|strike)/i.test(best.l.a)) mul = fx.n || 3;
    const o = { t: typeOf(best.l.a, f), b: d.b, r: d.r }; if (mul !== 1) o.n = mul;
    (out[id] ||= {})[k] = o; n++;
  }
}
await writeFile(path.join(ROOT, 'data/skill-dmg.json'), JSON.stringify({ meta: { source: 'Meraki Analytics (Riot game files)' }, champs: out }));
console.log(`피해 스킬 ${n}개 · 챔피언 ${Object.keys(out).length}`);
for (const [id, k] of [['KSante', 'Q'], ['KSante', 'W'], ['KSante', 'R'], ['Rumble', 'Q'], ['Rumble', 'E'], ['Rumble', 'R'], ['Ambessa', 'Q'], ['Ambessa', 'E'], ['Ambessa', 'R'], ['Jhin', 'R'], ['Lux', 'R'], ['Zed', 'Q'], ['Darius', 'R'], ['Vayne', 'W'], ['Sion', 'Q']]) console.log(id, k, JSON.stringify(out[id]?.[k]));

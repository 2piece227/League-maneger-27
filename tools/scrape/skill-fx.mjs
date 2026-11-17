// 스킬 연출 데이터: 수치 + 설명으로 모양 · 크기 · 속도 · 채널링 · 발사 수 · 이동기 · CC를 정한다 → data/skill-fx.json (작게, 게임이 바로 읽는다)
//  재료: data/champ-skills.json (Meraki: 폭 · 반경 · 각도 · 속도 · 설명) + Data Dragon 사거리(rangeBurn, Meraki에 사거리가 빈 스킬이 많다)
//  필드: s 모양(line 직선 · cone 부채꼴 · circle 지점 원 · target 대상 지정 · self 본인 · aura 본인 주변 원 · dash 돌진 · blink 순간이동 · global 전역 · wall 벽 · passive)
//        r 사거리 · w 폭 · rad 반경 · ang 각도(도) · spd 투사체 속도 · n 발사 수 · ch 채널링(초) · z 장판 지속(초) · cc · al 아군 대상 · stop 첫 대상에서 멈춤
// 실행: node tools/scrape/skill-fx.mjs   (champ-skills.mjs 다음에)
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SK = JSON.parse(await readFile(path.join(ROOT, 'data/champ-skills.json'), 'utf8')).champs;
const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const ver = (await get('https://ddragon.leagueoflegends.com/api/versions.json'))[0];
const DD = (await get(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/championFull.json`)).data;

const nums = v => (v == null ? [] : String(v).match(/\d+(?:\.\d+)?/g) || []).map(Number);
const first = v => nums(v)[0];
const W2N = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const KEYS = ['Q', 'W', 'E', 'R'];

function spec(f, ddRange, key) {
  const d = (f.fx || []).map(e => e.d).join(' ').replace(/\s+/g, ' '), dl = d.toLowerCase();
  const tg = String(f.targeting || '').split(/\s*\/\s*/)[0];
  const o = {};
  // 크기
  const mr = nums(f.range), dr = ddRange > 0 ? ddRange : null;
  let r = /global/i.test(String(f.range)) ? 99999 : mr.length ? (/based on channel|charge/.test(String(f.range)) ? Math.max(...mr) : mr[0]) : dr;
  if (r && r >= 20000 && !/global/i.test(String(f.range)) && !/anywhere|global|unlimited/.test(dl)) r = 3500;   // Data Dragon 25000 = 사거리 표기 없음 (진 궁 3500)
  if (r && r <= 25) r = null;                                                 // 20 같은 값은 본인 대상
  const w = first(f.width), rad = first(f.radius), ang = first(f.angle), spd = first(f.speed) || first(f.missile);
  if (r) o.r = r; if (w) o.w = w; if (rad) o.rad = rad; if (ang) o.ang = ang; if (spd && spd < 10000) o.spd = spd;
  // 발사 수 · 채널링 · 장판
  const sh = dl.match(/(\d+|two|three|four|five|six|seven|eight) (?:times|shots|rounds|bullets|missiles|bolts|waves|strikes|arrows|daggers|blades)/);
  if (sh) { const n = W2N[sh[1]] || +sh[1]; if (n >= 2 && n <= 12) o.n = n; }
  const chm = dl.match(/channel(?:s|ing)?(?: for)?(?: up to)? (\d+(?:\.\d+)?) seconds/);
  if (chm) o.ch = Math.min(+chm[1], o.n ? o.n * 1 : 4);
  const zm = dl.match(/(?:remain(?:s|ing)?|linger(?:s|ing)?|lasts?|persist(?:s|ing)?)(?: there)?(?: in place)? for (\d+(?:\.\d+)?) seconds/) || (tg === 'Location' && dl.match(/(?:zone|field|pool|area|storm)[^.]*?for (\d+(?:\.\d+)?) seconds/));
  if (zm && tg !== 'Unit') o.z = Math.min(5, +zm[1]);
  // 이동기
  const blink = /\bblinks?\b|teleports?\b/.test(dl), dash = /\bdash(?:es)?\b|\bleaps?\b|\blunges?\b|\bjumps?\b|\bvaults?\b|\bhops?\b|\bflips?\b|charges (?:forward|toward)|rushes|\bsurges? forward|\bdives?\b/.test(dl);
  const global = o.r >= 9000 || /anywhere on the map|global|all enemy champions/.test(dl);
  const wall = /wall of|summons a wall|creates a wall|impassable terrain|terrain wall/.test(dl);
  // 모양
  let s;
  if (tg === 'Passive' || (!tg && !f.cd)) s = 'passive';
  else if (wall && tg !== 'Unit') s = 'wall';
  else if (global && !dash && !blink) s = 'global';
  else if (blink && tg !== 'Auto') s = 'blink';
  else if (dash && tg !== 'Auto' && !(tg === 'Direction' && o.w && /fires|throws|launches|sends|hurls/.test(dl.slice(0, 120)))) s = 'dash';
  else if (tg === 'Direction' && o.n && o.w) s = 'line';                      // 여러 발 쏘는 직선 (진 궁: 60°는 조준 범위, 실제는 직선 4발)
  else if (tg === 'Direction' && o.rad && !o.w && !o.ang) s = 'aura';         // 본인 주변을 미는 스킬 (메가 나르 궁)
  else if (tg === 'Direction') s = o.ang ? 'cone' : 'line';
  else if (tg === 'Location') s = 'circle';
  else if (tg === 'Unit') s = 'target';
  else if (tg === 'Auto') s = o.rad ? 'aura' : (o.ang ? 'cone' : (o.w && o.r ? 'line' : 'self'));
  else s = 'self';
  o.s = s;
  if (s === 'line' && !o.w) o.w = 90;
  if (s === 'circle' && !o.rad) o.rad = 200;
  // 첫 대상에서 멈추나 (관통 X)
  if (/first enemy hit|first enemy it|first unit hit|first champion hit|stops at the first/.test(dl)) o.stop = 1;
  // CC
  // CC: 설명에 먼저 나오는 강한 CC (둔화는 다른 게 없을 때만)
  const CCS = [['up', /knock(?:s|ing)? (?:them |enemies |it )?(?:up|airborne)|airborne|knocked up/], ['back', /knock(?:s|ing)? (?:them |enemies |it )?(?:back|away)|knockback|knocked back|pushes/],
    ['pull', /\bpull(?:s|ing|ed)?\b|\bdrag(?:s|ging|ged)?\b/], ['stun', /\bstun|\broot|snare|suppress|\bcharm|\btaunt|\bfear|\bsleep|\bdrowsy|\bpolymorph/]];
  const hitCC = CCS.map(([k, re]) => { const m = dl.match(re); return m ? [k, m.index] : null; }).filter(Boolean).sort((a, b) => a[1] - b[1])[0];
  o.cc = hitCC ? hitCC[0] : /\bslow/.test(dl) ? 'slow' : '';
  if (!o.cc) delete o.cc;
  if (/(?:target|an|nearby|allied) all(?:y|ied champion)|allies|allied champions/.test(dl) && /shield|heal|grant/.test(dl) && !/enemies hit/.test(dl)) o.al = 1;
  if (key === 'R') o.ult = 1;
  return o;
}

const out = {};
for (const [id, c] of Object.entries(SK)) {
  const dd = DD[id]; const ranges = dd ? dd.spells.map(s => +s.rangeBurn.split('/')[0]) : [];
  out[id] = Object.fromEntries(KEYS.map((k, i) => [k, (c[k] || []).slice(0, 3).map(f => spec(f, ranges[i], k))]));
}
await writeFile(path.join(ROOT, 'data/skill-fx.json'), JSON.stringify({ meta: { source: 'Meraki Analytics + Data Dragon ' + ver }, champs: out }));
const cnt = {}; Object.values(out).forEach(c => Object.values(c).forEach(fs => fs.forEach(f => cnt[f.s] = (cnt[f.s] || 0) + 1)));
console.log(JSON.stringify(cnt));
for (const [id, k] of [['Jhin', 'R'], ['Ahri', 'E'], ['Malphite', 'R'], ['Lux', 'E'], ['Anivia', 'W'], ['Ezreal', 'E'], ['Ezreal', 'R'], ['Orianna', 'R'], ['Gnar', 'R'], ['Rumble', 'Q'], ['Lucian', 'R'], ['Leona', 'E'], ['Thresh', 'Q'], ['Varus', 'Q'], ['MissFortune', 'R'], ['Kaisa', 'R'], ['Karthus', 'R']]) console.log(id, k, JSON.stringify(out[id][k]));

// 챔피언 전체 정보 수집 → data/champions.json
// - Riot Data Dragon (ko_KR, en_US): 이름·칭호·스킬·기본 스탯·난이도
// - Meraki Analytics: 포지션·세부 역할·출시일·공격 유형
// 실행: node tools/scrape/champions.mjs
import { writeFile } from 'node:fs/promises';

const DD = 'https://ddragon.leagueoflegends.com';
const MERAKI = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json';
const get = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

const POS = { TOP: 'TOP', JUNGLE: 'JGL', MIDDLE: 'MID', BOTTOM: 'BOT', SUPPORT: 'SUP' };
const TAG_KO = { Fighter: '전사', Tank: '탱커', Mage: '마법사', Assassin: '암살자', Marksman: '원거리 딜러', Support: '서포터' };
const strip = s => (s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

const [version] = await get(`${DD}/api/versions.json`);
console.log('Data Dragon', version);
const [ko, en, meraki] = await Promise.all([
  get(`${DD}/cdn/${version}/data/ko_KR/championFull.json`),
  get(`${DD}/cdn/${version}/data/en_US/champion.json`),
  get(MERAKI).catch(e => { console.warn('Meraki 실패:', e.message); return {}; }),
]);

const img = (type, file) => `${DD}/cdn/${version}/img/${type}/${file}`;
const champions = Object.values(ko.data).map(c => {
  const m = meraki[c.id] || {};
  const s = c.stats;
  return {
    id: c.id,
    key: +c.key,
    name: c.name,
    nameEn: en.data[c.id]?.name || c.id,
    title: c.title,
    tags: c.tags,
    tagsKo: c.tags.map(t => TAG_KO[t] || t),
    positions: (m.positions || []).map(p => POS[p]).filter(Boolean),
    roles: m.roles || [],
    attackType: m.attackType || (s.attackrange > 300 ? 'RANGED' : 'MELEE'),
    damageType: m.adaptiveType || null,
    resource: c.partype,
    info: c.info, // attack, defense, magic, difficulty (0~10)
    stats: {
      hp: s.hp, hpPerLevel: s.hpperlevel,
      mp: s.mp, mpPerLevel: s.mpperlevel,
      armor: s.armor, armorPerLevel: s.armorperlevel,
      mr: s.spellblock, mrPerLevel: s.spellblockperlevel,
      ad: s.attackdamage, adPerLevel: s.attackdamageperlevel,
      as: s.attackspeed, asPerLevel: s.attackspeedperlevel,
      range: s.attackrange, ms: s.movespeed,
    },
    passive: { name: c.passive.name, desc: strip(c.passive.description), icon: img('passive', c.passive.image.full) },
    spells: c.spells.map((sp, i) => ({
      key: 'QWER'[i], name: sp.name, desc: strip(sp.description),
      cooldown: sp.cooldownBurn, cost: sp.costBurn, icon: img('spell', sp.image.full),
    })),
    releaseDate: m.releaseDate || null,
    icon: img('champion', c.image.full),
    splash: `${DD}/cdn/img/champion/splash/${c.id}_0.jpg`,
    loading: `${DD}/cdn/img/champion/loading/${c.id}_0.jpg`,
    lore: c.blurb,
  };
}).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

// Meraki에 아직 없는 신규 챔피언은 대표 역할군으로 포지션을 추정한다
const GUESS = { Fighter: 'TOP', Tank: 'TOP', Mage: 'MID', Assassin: 'MID', Marksman: 'BOT', Support: 'SUP' };
champions.filter(c => !c.positions.length).forEach(c => {
  c.positions = [GUESS[c.tags[0]] || 'MID'];
  c.positionsGuessed = true;
  console.warn(`포지션 추정: ${c.id} (${c.tags.join('/')}) → ${c.positions[0]}`);
});

await writeFile(new URL('../../data/champions.json', import.meta.url), JSON.stringify({
  meta: { source: 'Riot Data Dragon + Meraki Analytics', patch: version, scrapedAt: new Date().toISOString(), count: champions.length },
  champions,
}, null, 1));
console.log(`챔피언 ${champions.length}명 저장`);

// 역대 롤드컵 우승팀 단체사진 → data/history.json의 worldsPhotos
// Leaguepedia에 우승 사진이 체계적으로 없어서, 연도별로 찾은 파일명을 직접 지정한다. (없는 해는 로고로 표시)
// 실행: node tools/scrape/worlds-photos.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { init, imageUrls, OUT, log } from './lp.mjs';

const FILES = {
  2012: 'TPA S2WC.jpg',
  2014: 'SSW 2014 WCS.jpg',
  2015: 'SKT T1 Roster 2015 Spring.jpg',
  2016: 'SKT T1 2016 IEM WC.jpg',
  2017: 'Samsung Galaxy 2017 LCK SPRING.png',
  2018: 'IG-Worlds2018.jpg',
  2019: 'FPX Worlds 2019.png',
  2020: 'DWG Worlds 2020.png',
  2021: 'EDG 2021 Summer.jpg',
  2022: 'DRX 2022 Worlds.jpg',
  2023: 'T1 Worlds 2023.jpg',
  2024: '2024 T1 Summer.jpg',
  2025: 'T1 Worlds 2025.jpg',
};

await init();
const urls = await imageUrls(Object.values(FILES));
const file = path.join(OUT, 'history.json');
const history = JSON.parse(await readFile(file, 'utf8'));
history.worldsPhotos = Object.fromEntries(Object.entries(FILES).map(([y, f]) => [y, urls[f] || null]));
await writeFile(file, JSON.stringify(history, null, 2));
log('worldsPhotos', Object.values(history.worldsPhotos).filter(Boolean).length, '/', Object.keys(FILES).length);

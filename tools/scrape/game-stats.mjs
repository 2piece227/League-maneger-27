// 프로 경기 게임별 기록 (2025~, LCK·LPL·LEC·LCS·국제대회) → tools/scrape/out/games.json
// 경기 엔진 검증용 (게임 길이 · 킬 · 드래곤 · 바론 · 포탑 · 골드 · 승패). 게임 본체는 읽지 않는다.
// 실행: node tools/scrape/game-stats.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, cargo, log } from './lp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FROM = process.env.FROM || '2025-01-01';
const WHERE = `SG.DateTime_UTC >= "${FROM}" AND (SG.OverviewPage LIKE "LCK/%" OR SG.OverviewPage LIKE "LPL/%" OR SG.OverviewPage LIKE "LEC/%" OR SG.OverviewPage LIKE "LCS/%" OR SG.OverviewPage LIKE "%World Championship%" OR SG.OverviewPage LIKE "%Mid-Season Invitational%" OR SG.OverviewPage LIKE "%First Stand%")`;
await init();
const rows = await cargo({
  tables: 'ScoreboardGames=SG',
  fields: 'SG.GameId=G,SG.OverviewPage=O,SG.DateTime_UTC=D,SG.Team1=T1,SG.Team2=T2,SG.WinTeam=W,SG.Gamelength_Number=Len,SG.Team1Kills=K1,SG.Team2Kills=K2,SG.Team1Dragons=D1,SG.Team2Dragons=D2,SG.Team1Barons=B1,SG.Team2Barons=B2,SG.Team1Towers=TW1,SG.Team2Towers=TW2,SG.Team1RiftHeralds=H1,SG.Team2RiftHeralds=H2,SG.Team1VoidGrubs=VG1,SG.Team2VoidGrubs=VG2,SG.Team1Gold=G1,SG.Team2Gold=G2',
  where: WHERE, orderBy: 'SG.DateTime_UTC',
});
await mkdir(path.join(HERE, 'out'), { recursive: true });
await writeFile(path.join(HERE, 'out/games.json'), JSON.stringify(rows));
log(`게임 ${rows.length}개`);

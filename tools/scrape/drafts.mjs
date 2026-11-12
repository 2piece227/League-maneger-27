// 프로 밴픽 기록 (2023~, LCK·LPL·LEC·LCS·국제대회) → tools/scrape/out/drafts.json
// 밴픽 AI 학습용 (tools/draft-learn.py). 게임 본체는 학습 결과(data/draft-model.json)만 읽는다.
// 실행: node tools/scrape/drafts.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, cargo, log } from './lp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FROM = process.env.FROM || '2023-01-01';
const LG = '(PB.OverviewPage LIKE "LCK/%" OR PB.OverviewPage LIKE "LPL/%" OR PB.OverviewPage LIKE "LEC/%" OR PB.OverviewPage LIKE "LCS/%" OR PB.OverviewPage LIKE "%World Championship%" OR PB.OverviewPage LIKE "%Mid-Season Invitational%" OR PB.OverviewPage LIKE "%First Stand%")';
const cols = [];
for (const t of [1, 2]) for (let i = 1; i <= 5; i++) cols.push(`PB.Team${t}Ban${i}=b${t}${i}`, `PB.Team${t}Pick${i}=p${t}${i}`, `PB.Team${t}Role${i}=r${t}${i}`);
await init();
const rows = await cargo({
  tables: 'PicksAndBansS7=PB,ScoreboardGames=SG', joinOn: 'PB.GameId=SG.GameId',
  fields: ['PB.GameId=G', 'PB.OverviewPage=O', 'PB.MatchId=M', 'PB.N_GameInMatch=N', 'PB.Team1=T1', 'PB.Team2=T2', 'PB.Winner=W', 'SG.DateTime_UTC=D', 'SG.Patch=P', 'SG.Gamelength_Number=L', ...cols].join(','),
  where: `SG.DateTime_UTC >= "${FROM}" AND ${LG}`, orderBy: 'SG.DateTime_UTC',
});
await mkdir(path.join(HERE, 'out'), { recursive: true });
await writeFile(path.join(HERE, 'out/drafts.json'), JSON.stringify(rows));
log(`밴픽 ${rows.length}게임`);

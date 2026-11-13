# 인수인계: 경기 엔진 재작성 (2026-11-13)

> 새 대화에서 이 문서만 읽고 작업을 시작할 수 있게 정리했다. 먼저 끝까지 읽고, **사용자에게 계획을 보여 준 뒤 확인을 받고** 고칠 것.

## 0. 프로젝트와 작업 규칙
- **LM 27**: 리그 오브 레전드 e스포츠(LCK·LPL·LEC·LCS) FM풍 팬게임. 정적 HTML/JS, GitHub Pages 배포.
  - 저장소 `2piece227/League-maneger-27` (main), 사이트 https://2piece227.github.io/League-maneger-27/
- **대화는 한국어로 한다.**
- **수정할 때마다 바로 commit + push 한다 (묻지 않는다).** 커밋 메시지 끝에 Co-Authored-By 줄을 붙인다.
- **사용자는 아이패드 Safari(가로 약 1000px)로 플레이한다.** 화면은 스크롤 없이 한 화면에 맞추고, 무거운 DOM 갱신을 피한다.
- **실명·로고·사진을 쓴다.** 하단 Riot 고지문은 유지한다.
- **캐시 무효화:** JS·CSS를 고치면 `index.html`의 `?v=` 숫자를 바꾼다. 예시 스크립트(Python):
  ```python
  import re,time; h=open('index.html',encoding='utf8').read(); h=re.sub(r'\?v=\d+"','?v=%s"'%time.strftime('%y%m%d%H%M'),h); open('index.html','w',encoding='utf8').write(h)
  ```
- **비밀값:** `tools/scrape/.env`(git 무시)에 Leaguepedia 계정, 그리고 이번에 `RIOT_KEY`(Riot 개발자 키, 24시간 만료)가 들어간다.
  - 값을 절대 출력·커밋하지 않는다. 스크레이퍼 출력은 `grep -v -i pass`로 거른다.
- **미리보기:** `.claude/launch.json`의 `lm27`(포트 5527). 브라우저 창이 숨겨져 있으면 requestAnimationFrame과 타이머가 멈추니 성능은 직접 측정할 것.

## 1. 지금 구조 (경기 관련)
| 파일 | 역할 |
|---|---|
| `js/matchsim.js` | 엔진. `Rift`(맵 좌표·길 그래프, `assets/map/rift.webp` 기준 %) + `Sim`(10초 단위 진행) |
| `js/live.js` | 옵저버 중계 화면. 화면 전체 오버레이, 프레임마다 시간을 쌓아 한 틱(10초)이 차면 `Sim.step`, 아이콘은 transform으로 이동 |
| `js/draft.js` | 밴픽·전술. `Style`(챔피언 성향) · `Draft`(진행, 코치, AI). 밴픽 AI는 학습 모델 사용 (아래 4절) |
| `js/season.js` | 공식 경기 결과 기록, 다른 팀 경기는 `lightSeries`(경량 시뮬), 경기날 `today()` / `delegate()` |
| `js/stats.js` | 프로 실데이터 조회: 챔피언 승률, 시간대별 승률, 매치업, 시너지, 아이템 빌드, 텔레포트 여부 |
| `css/live.css`, `css/draft.css` | 화면 스타일 |
| `data/champ-stats.json` | 2025~ 4,209게임 챔피언 통계 (`tools/scrape/champ-stats.mjs`) |
| `data/items.json`, `assets/items/` | 아이템·아이콘 (`tools/scrape/items.mjs`) |
| `assets/obj/*.png` | 드래곤 6종·바론·전령·유충·포탑·억제기·넥서스 실제 아이콘 |
| `data/draft-model.json` | 밴픽 학습 모델 (`tools/draft-learn.py`, `tools/draft-extra.py`) |
| `tools/validate-engine.md` | **엔진 검증 기준표. 재작성 후에도 이 수치에 맞아야 한다** |

### 엔진이 지금 하는 일 (`Sim`)
- `create(S)`: 밴픽 결과 S로 경기 상태 g를 만든다. 선수 OVR, 숙련, 메타, 실데이터 매치업·시너지, 전술, 코치 역량을 쓴다.
- `step(g)`: 10초마다 실행. 성장 → 이동(`target` → `walk`) → 오브젝트 → 라인전 솔로킬 확률 → 근접 교전 확률 → 공성 → 귀환 판단.
- 교전: `fightAt(at, radius)`가 그 자리 근처 선수들의 전투력(`tpow`)으로 승패를 한 번에 굴리고, 킬 수를 정한다. `win()`의 나눗수 11.5, 골드 차이 반영 1천당 0.8.
- 구조물: `structOf`, `hit`, `siege`(웨이브 압박 포함). 억제기 쪽은 14분 전, 넥서스 쪽은 21분 전에는 안 깨진다.
- 검사 장치: `Sim.audit = []`로 켜면 먼 거리 처치, 설명 없는 순간 이동, 맵 밖 위치, 초반 상대 본진 진입을 기록한다. 지금은 위반 0건.

### 이미 맞춰 둔 실제 수치 (재작성 후에도 유지할 것, 자세한 표는 `tools/validate-engine.md`)
- **실제 프로 3,944게임:** 경기 32.6분, 킬 28.8, 이긴 팀 19.6 / 진 팀 9.3, 드래곤 4.6, 바론 1.2, 포탑 11.7, 끝날 때 골드 차이 1만
- **강팀 대 약팀 (2026 실제 862경기, 시즌 세트 승률 차이별 강팀 세트 승률):** 0~10%p 57%, 10~20%p 67%, 20~30%p 79%, 30~40%p 80%, 40%p 이상 85%
  - 지금 엔진은 58/69/73/81/90%로 거의 같다.

## 2. 사용자가 지적한 문제 (2026-11-13)
> "경기 자체가 애매하다. 이상하게 있는 경우가 있고, 전술이나 픽은 그냥 확률 싸움이다. 로밍에 넣어 뒀는데 로밍을 안 간다. 귀환·텔포 이펙트는 타이밍이 안 맞고, 킬이 나면 뭔가 빨라져서 가독성이 떨어진다. 소규모 교전도 없고 게임을 돌린다는 느낌이 안 든다."

## 3. 원인 분석 (코드 기준으로 확인한 것)
**근본 원인: 엔진이 "결과를 먼저 정하고 그림을 맞추는" 구조다.** 10초마다 교전 여부를 확률로 굴려 킬과 포탑 파괴를 정하고, 아이콘은 그걸 설명하려고 옮겨질 뿐이다. 챔피언이 각자 행동하고 그 결과가 부딪혀 나오는 구조가 아니다.

1. **전술 대부분이 행동과 연결돼 있지 않다.** 팀 전술은 교전 승률(`tpow`) 보정뿐이다. 포지션 전술 중 행동이 있는 것은 아래뿐이다.
   - 행동 있음: 서폿 `roam`, 정글 `gank`·`farm`, 탑 `split`, 탑·미드 `press`(솔로킬 확률)
   - 행동 없음: 미드 `roam`·`join`, 원딜 `press`·`join`, 서폿 `vision`·`protect`·`lane`, 정글 `invade`·`obj`, 탑 `skirm`·`hold`
   - 전술 목록은 `Draft.ROLE_TAC`와 `Draft.TEAM_TAC`에 있다.
2. **귀환·텔레포트 연출이 어긋난다.**
   - `teleport()`는 아이콘을 즉시 옮기고 효과를 같은 순간에 띄운다. 실제로는 4초 정신집중 후 도착한다.
   - 귀환은 10초 단위로 처리되어 8초 정신집중과 맞지 않는다.
3. **킬이 나면 빨라진다.** `fightAt`이 참가자를 같은 10초 안에 싸움 장소로 끌고 가고(`shift`), 진 쪽은 다시 14만큼 뒤로 뺀다. 그 10초 동안 평소의 2~3배를 움직인다. 이동 한도 `budget = 40`도 평소 속도(24)보다 크다.
4. **소규모 교전이 거의 없다.**
   - 라인전 솔로킬 확률은 10초당 0.8%이고, 교전이 한 번 나면 `g.calm`으로 60초 동안 경기 전체가 잠잠하다.
   - 교전은 항상 킬로 끝나서, 딜교환·체력 깎임·점멸 생존 같은 "킬 없는 교전"이 없다. 체력 바도 거의 안 움직인다.
5. **이상한 위치가 생긴다.**
   - 목표 지점(`laneSpot` / `groupSpot` / `siegeSpot`)이 고정점이라 대부분 서 있다.
   - 같은 팀이 같은 목표를 받아 한 점에 겹친다. 스크린샷에서 맵에 아이콘이 3개만 보였다.
   - 웨이브를 받으며 앞뒤로 움직이고, 와드를 박고, 정글을 도는 모습이 없다.

## 4. 이미 끝난 것 (건드리지 않아도 됨)
- **밴픽 AI:** 프로 밴픽 7,844게임(2023~26)으로 페이즈별 판단 가중치를 학습했다(조건부 로짓). 사용자가 "밴픽은 이제 문제없다"고 했다.
  - 판단 기준: 메타·숙련·상대 숙련·플렉스·남은 포지션·시너지·카운터·위협
  - 관련 함수: `Draft.feats`, `Draft.suggest`, `Draft.aiAct`
  - 게임 안 메타: 시즌 기준에 2주 패치 흔들림을 더한다(`Draft.metaNow`).
- **경기날 흐름 (FM 방식):** 계속 → 밴픽 → 전술 확정 → 경기 → 8초 뒤 다음 세트 밴픽 → 시리즈 종료 → 계속
  - 관련 함수: `Draft.matchDay`, `Season.today`, `Engine.continue`
  - 코치 위임: `Season.delegate`
- **중계 화면:** 실제 맵 이미지, 실제 오브젝트 아이콘, 매치 스코어, 킬·오브젝트 알림과 로그, 아이템 6칸·와드·장신구, 해설
- **조사(josa):** `Sim.josa(word, '이', '가')`

## 5. 합의된 고칠 방안 (사용자 승인 전, 계획 단계)
엔진을 "행동이 먼저, 결과는 그 결과로" 구조로 다시 쓴다. 중계 화면, 밴픽, 시즌 연동은 그대로 쓴다.

1. **1초 단위 진행.** 화면은 계산된 위치를 그대로 보간해서 그린다. 몰아서 움직이는 일을 없애고, 정신집중(텔레포트 4초, 귀환 8초)과 효과를 정확히 맞춘다.
2. **챔피언별 행동 상태:**
   - 라인전: 웨이브 받기, 딜교환, 밀고 빠지기
   - 정글: 캠프 처치 시간, 바위게, 부쉬를 거치는 갱 경로
   - 로밍, 와드 설치, 귀환·복귀, 사이드 운영, 오브젝트 준비, 공성
   - **모든 포지션 전술이 실제 행동을 바꾸게 한다.**
     - 미드 로밍: 웨이브를 밀고 사이드·강가로
     - 서폿 시야 장악: 와드 설치 동선
     - 원딜 보호: 원딜 곁을 떠나지 않음
     - 정글 카정: 상대 정글 캠프 진입
     - 탑 소규모 교전: 강가 합류
3. **체력이 이어지는 교전.** 사거리 안이면 매초 피해를 주고받는다. 딜교환 후 빠지기, 체력이 낮으면 귀환, 점멸 생존이 생긴다. 킬은 체력 0일 때만 난다. 한타는 5~15초에 걸쳐 차례로 죽는다.
   - 실력·숙련·상성·전술 적합도·코치는 "피해량"에 들어간다.
4. **웨이브·시야 단순화.** 라인 웨이브 위치가 계속 움직이며 포탑 공격과 위치를 정한다. 와드가 있으면 갱을 미리 보고 피할 확률이 생긴다.
5. **겹침 방지.** 같은 팀이라도 역할별로 위치를 흩는다.
6. **검증.** `tools/validate-engine.md`의 수치를 유지한다. 새 지표도 추가한다: 킬 없는 교전 수, 로밍 횟수, 킬 위치·시간 분포.

### 실제 위치 데이터: Riot API (사용자 결정 — 개발자 키를 쓰기로 함)
- 사용자가 `tools/scrape/.env`에 `RIOT_KEY=...`를 넣는다. 24시간 만료이고 속도 제한이 있다(초당 20, 2분에 100). 약 500경기에 40분 정도 걸린다.
- 받을 것: 한국 서버 챌린저·그랜드마스터 랭크 게임의 Match-V5 경기 기록과 타임라인.
  - `league-v4` → `match-v5/matches/by-puuid` → `matches/{id}` 와 `matches/{id}/timeline`
  - 지역은 `kr`과 `asia`.
- 타임라인에서 얻는 것:
  - 1분마다 10명의 위치·골드·CS·레벨
  - `CHAMPION_KILL`(위치, 시각, 도운 사람) → 킬 위치·시간 분포, 교전 크기, 한타 킬 간격
  - `ITEM_PURCHASED` → 귀환 시각·횟수, 실제 구매 순서
  - `ELITE_MONSTER_KILL`, `BUILDING_KILL`, `TURRET_PLATE_DESTROYED`
  - `WARD_PLACED`는 위치가 없고 시각만 있다.
- **솔랭은 프로보다 킬이 많고 운영이 덜 조직적이다.** 킬 수·시간·오브젝트 같은 총량은 프로 기준(Leaguepedia)을 유지하고, 위치·타이밍 패턴만 솔랭에서 가져와 보정한다.
- 수집 스크립트는 `tools/scrape/` 아래에 만들고, 결과 원본은 `tools/scrape/out/`(git 무시)에 둔다. 게임이 읽을 요약만 `data/`에 넣는다.
- 맵 좌표 변환: Riot 좌표(약 0~14870)를 `assets/map/rift.webp` 기준 %(블루 = 왼쪽 아래)로 바꾼다. y축이 반대이니 주의.
  - 기준점 몇 개로 맞춘다: 블루 우물 약 (7,93)%, 레드 우물 약 (92,5)%, 바론 둥지 (37,30)%, 드래곤 둥지 (64,69)%.

## 6. 검사·벤치 방법 (브라우저 콘솔, 미리보기 탭)
테스트 감독을 만들어 게임에 들어가기:
```js
App.state.manager ||= { name: '테스트', reputation: 50, background: { type: Object.keys(Manager.BACKGROUNDS)[0] } };
App.state.teamId = 't1'; Game.start(App.state.manager, App.db.teams.find(t => t.id === 't1')); App.show('game');
await Promise.all([Mastery.load(), Champions.load(), Stats.load(), Results.load()]);
```
경기 하나를 돌리고 검사하기:
```js
Sim.audit = [];
const S = Draft.make({ series: { key: 'x' + Math.random(), bo: 1, games: [] }, teams: { B: 't1', R: 'gen-g' } });
Draft.auto(S);
const g = Sim.create(S, 1); let c = 0; while (!g.over && c++ < 400) Sim.step(g);
[Sim.clock(g.t), g.side.B.kills + ':' + g.side.R.kills, Sim.audit.length];
```
- 수십 경기를 돌려 `tools/validate-engine.md`의 표와 비교한다.
- 강팀·약팀 곡선은 `Results.list`(2026 실제 경기)의 대진을 그대로 돌려 비교한다. 비교 방법은 validate 문서에 있다.
- 실제 게임 원본: `tools/scrape/out/games.json`(게임별 기록), `tools/scrape/out/drafts.json`(밴픽).
  - 없으면 `node tools/scrape/game-stats.mjs`, `node tools/scrape/drafts.mjs`로 다시 받는다.

## 7. 주의할 점
- 다른 팀 경기는 `Season.lightSeries`(경량)라 엔진이 무거워져도 날짜 진행 속도와는 상관없다. 다만 우리 경기를 코치에게 맡기면(`Season.delegate`, `autoSeries`) 정식 엔진을 쓴다. 한 경기 계산이 1초 안쪽이어야 한다.
- `Live`가 기대하는 엔진 상태 필드:
  - `g.t`, `g.pl[i]`: `pos`, `trail`, `dead`, `recall`, `hp`, `lvl`, `inv`, `wards`, `trinket`, `k/d/a`, `cs`, `gold`, `c`, `p`, `name`, `side`, `role`, `build`
  - `g.side[k]`: `kills`, `drag`, `grubs`, `herald`, `baron`, `baronUntil`, `down`, `thp`, `inhib`, `t`
  - `g.feed`(킬과 `obj:true` 오브젝트), `g.ev`, `g.comm`, `g.fx`, `g.over`
  - 1초 단위로 바꾸면 `Live.advance`의 한 틱 길이와 `at(trail, f)` 보간을 함께 고친다.
- 결과 기록은 `Season.gameResult(g)` 형식을 유지한다.
- 시즌·경기 기록 저장 구조(`App.state.season`, `App.state.plans`)는 유지한다.

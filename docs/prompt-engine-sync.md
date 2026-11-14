# 새 세션용 프롬프트: 경기 엔진 싱크로율 개선 (지형 · 챔피언별 행동 · 부드러운 화면)

아래 내용을 새 세션 첫 메시지로 붙여 넣는다.

---

LM 27(롤 e스포츠 FM풍 팬게임, 정적 HTML/JS, GitHub Pages) 경기 엔진의 **실제 롤과의 싱크로율**을 올리는 작업이야. 경기 방식(실시간 관전)은 그대로 두고, 점이 움직이는 모습이 실제 경기처럼 보이게 만드는 게 목표야.

## 먼저 읽을 것
- `docs/handoff-engine-rewrite.md` — 작업 규칙 · 엔진 구조 · 검사 방법
- `docs/handoff-fixes-and-engine-stage1-2.md` — 1·2단계(1초 진행, 전술 동선) 결과
- `tools/validate-engine.md` — 실제 데이터 목표치와 지금 수치 (3·4절이 최신)
- 코드: `js/matchsim.js`(엔진: `Rift` 맵 그래프 · `Sim.step/decide/fightTick/target/walk`), `js/live.js`(중계 화면), `js/draft.js`의 `Style`(챔피언 성향), `data/champions.json`(attackType 등)

## 작업 규칙
- 한국어로 대화. 수정마다 바로 커밋 + 푸시(묻지 않음). JS/CSS를 고치면 `index.html`의 `?v=` 숫자를 바꾼다.
- 사용자는 아이패드 Safari(가로 약 1000px)로 플레이한다. 스크롤 없이 한 화면, 가볍게.
- 비밀값은 `tools/scrape/.env`(git 제외). 출력·커밋 금지.
- **계획을 먼저 보여 주고 사용자가 OK 하면 시작한다.**

## 바꿀 것 (3가지)

### 1. 지형(벽) — 벽을 통과하지 않게
- 지금 이동은 `Rift`의 노드 그래프(라인·정글 길)를 따라가지만 벽 판정이 없어 드래곤·바론 둥지 안팎의 싸움, 벽 너머 교전이 어색하다.
- 솔랭 500판 타임라인(`tools/scrape/out/soloq-games.jsonl`, git 제외 — 이 PC에 있음)의 1분마다 선수 위치 수만 개로 **다닐 수 있는 칸 지도**(예: 100×95 격자, `data/rift-walk.json`)를 만든다. 좌표 변환은 `tools/soloq-analyze.py`의 `pct()`(Riot 좌표 → 맵 %, 블루 왼쪽 아래).
  - 파일이 없으면 `node tools/scrape/soloq-games.mjs 500`(RIOT_KEY 필요, 24시간 키라 새로 받아야 할 수 있음).
- 격자 위 A*(또는 격자 + 기존 노드 혼합)로 `Rift.path`를 바꾸고, 교전 위치·후퇴·둥지 진입이 벽을 넘지 않게 한다. 둥지는 입구로만 드나든다.
- `Sim.audit`에 "벽 안에 있음" 검사를 추가해 0건이어야 한다.

### 2. 챔피언별 행동 — 한타가 실제처럼 보이게
- 지금은 모든 챔피언이 같은 방식으로 다가가 같은 사거리(7)로 싸운다.
- `Style.of(c)`의 성향(engage · peel · poke · pick · front · late …)과 `champions.json`의 `attackType`으로 행동 유형을 나눈다. 예:
  - 탱커·이니시: 먼저 진입, 상대 앞라인과 부딪힘
  - 원딜·포킹: 뒤에서 사거리 유지(근접은 짧게, 원거리는 길게), 위험하면 물러남
  - 암살자: 옆으로 돌아 상대 딜러를 노림
  - 서포터(보호형): 우리 딜러 곁을 지킴
- 교전 때 진형(앞라인 · 뒷라인 · 측면)을 만들고 대상 선택도 유형에 맞춘다(암살자 → 딜러, 탱커 → 가까운 적).
- 팀 지시(`Draft.INS`: 한타 목표 · 교전 성향 등)와 특성 효과(`p.fx`)는 계속 동작해야 한다.

### 3. 끊김 없는 화면 — 캔버스 그리기
- 지금 `js/live.js`는 매 프레임 HTML 아이콘을 transform으로 옮긴다. PC에서도 살짝 끊긴다.
- 맵 위 챔피언·효과·오브젝트를 캔버스 하나에 그리도록 바꾼다(이미지 미리 불러오기, 레티나 대응). 클릭·툴팁이 필요한 부분만 HTML로 남긴다.
- 1024×700에서 하단이 잘리지 않아야 한다.

## 지켜야 할 것 (건드리지 말 것)
- `Live`가 기대하는 상태 필드, `Season.gameResult(g)` 형식, `App.state.season` · `App.state.plans` 저장 구조.
- 밴픽 AI · 전술 화면 · 라커룸 · 컨디션(`js/condition.js`) · 특성(`js/traits.js`) · 패치 AI(`js/patch.js`)의 동작.
- 교전은 체력이 이어지는 방식(`Sim.fightTick`) 그대로. 승패를 미리 정하는 방식으로 되돌리지 않는다.

## 검증 (매 단계)
- `await import('/tools/bench.js'); await LMBench.setup(); LMBench.run(150)` — 미리보기(`preview_start` 이름 `lm27`, 포트 5527) 콘솔에서.
- `tools/validate-engine.md`의 목표치에 맞춘다: 경기 시간 약 32.6분 · 킬 28.8 · 드래곤 4.6 · 바론 1.2(바론 없는 경기 9%) · 포탑 11.7 · 블루 승률 50% 안팎 · `Sim.audit` 0.
- 같이 다니는 인원은 `data/soloq-targets.json`의 `groupLargest`(20분 약 2.7, 30분 약 3.3명)와 비슷하게.
- **미뤄 둔 곡선 재조정도 같이**: 지금 일방적인 경기(킬 차 15 이상)가 약 35%(실제 22%). 컨디션 · 특성 · 패치가 더해져 팀 차이가 커진 탓. 강팀 대 약팀 승률 곡선(validate 문서 2절)과 함께 다시 맞춘다.
- 끝나면 `tools/validate-engine.md`에 새 절로 수치를 남긴다.

## 진행 순서 제안
1. 지형 격자 만들기 + 길찾기 교체 + 벽 검사 → 검증
2. 챔피언별 행동 · 한타 진형 → 검증 + 곡선 재조정
3. 캔버스 그리기 → 아이패드 크기에서 확인

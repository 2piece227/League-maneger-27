// 중계 대사 모음. 엔진(matchsim · spells · kits · skills · waves)은 여기 키만 부르고, 문장은 전부 이 파일에 있다.
//
// ── 중계진 기준 (모든 대사가 이 기준을 따른다) ──────────────────────────────
// 캐스터 (cast): 지금 무슨 일이 일어나는지만 말한다. 현재형, 짧게, 선수 이름 먼저.
//   · 진 캐스터: 큰 순간(퍼스트 블러드 · 에이스 · 바론 · 넥서스)에 소리를 길게 끈다 ("에이~스!").
//     평소엔 같은 말을 두 번 붙여 리듬을 만든다 ("잡아냅니다, 잡아냅니다!").
//   · 캐슬 캐스터: 빠르고 시원하게. 짧은 문장을 끊어 친다 ("들어가요! 잡혔습니다!").
// 왕자 해설 (anal): 왜 그런지, 무슨 의미인지를 하나만 짚는다. 차분하게, 느낌표 없이.
//   어미는 "~거든요 / ~죠 / ~예요 / ~습니다". 숫자(골드 · 인원 · 스택)가 있으면 숫자로 말한다.
// 구름 해설 (hype): 선수 플레이에 대한 감탄과 리액션만. 중립적인 상황 설명은 하지 않는다.
//   "비상!!"은 경기가 넘어갈 수 있는 위기에서만 쓴다 (넥서스가 열림 · 본진이 빈 채로 전멸 · 장로를 내줌).
//   한 경기에 두 번까지.
//
// 표기: 팀은 약칭(T1 · GEN), 경기 시작과 끝에서만 정식 이름. 챔피언 이름은 궁극기 · 밴픽처럼 꼭 필요할 때만.
// 빈칸: {p} → 값 그대로, {p:이} → 받침에 맞춰 이/가 (을 · 은 · 과 · 으로도 같은 식).
// 항목: who = 말하는 사람, all = 공통 문장, jin / castle = 캐스터별 문장 (있으면 그쪽을 쓴다).
const Lines = {
  JOSA: { '이다': ['이', ''], '이': ['이', '가'], '을': ['을', '를'], '은': ['은', '는'], '과': ['과', '와'], '으로': ['으로', '로'] },
  L: {
    // ── 밴픽 · 시작 ──
    draftOpen: { who: 'cast', jin: ['밴픽 끝났습니다~ 양 팀 조합 보시죠!'], castle: ['자, 밴픽 정리하고 가겠습니다.'] },
    draftBan: { who: 'anal', all: ['{t} 밴을 보면 {c:이} 다 {p}의 주력이거든요. {p:을} 묶고 시작하겠다는 거죠.'] },
    draftSwap: { who: 'hype', all: ['{c} {role}요? 와, 이걸 꺼내네요!', '{role} {c}! 이건 진짜 준비해 온 카드예요!'] },
    draftSig: { who: 'anal', all: ['{p}의 {c:이} 나왔습니다. 가장 자신 있는 챔피언이죠.', '{c:은} 상대가 풀어 줬어요. {p} 상대로는 꽤 과감한 선택이거든요.'] },
    draftMeta: { who: 'anal', all: ['이번 패치 가장 많이 나오는 {c:은} {t:이} 가져갔습니다.'] },
    start: { who: 'cast', jin: ['자~ {B:과} {R}의 {set}, 시작합니다~!'], castle: ['자, 바로 가겠습니다! {Bs} 대 {Rs}, {set} 시작합니다!', '양 팀 준비 끝났습니다. {set}, 시작합니다!'] },
    rivalHot: { who: 'hype', all: ['{rv}입니다! 오늘은 순위 생각 안 해요, 무조건 이겨야 되는 경기예요!', '{rv}! 경기 전부터 분위기가 장난 아닙니다!'] },
    rivalCalm: { who: 'anal', all: ['{rv:이다}죠. {desc}'] },
    tacSame: { who: 'anal', all: ['양 팀 모두 {tac} 전술로 나왔습니다. {comp}'] },
    tacDiff: { who: 'anal', all: ['{Bs:은} {bt}, {Rs:은} {rt} 전술입니다. {comp}'] },
    compEarly: { who: 'anal', all: ['{t:이} 초반에 확실히 강한 조합이에요.'] },
    compLate: { who: 'anal', all: ['{t:은} 시간이 갈수록 좋아지는 조합이에요.'] },
    compEven: { who: 'anal', all: ['조합 힘은 비슷해요. 운영 싸움이 될 겁니다.'] },
    matchup: { who: 'anal', all: ['{role} 구도는 {c:이} 유리합니다. 프로 경기 {n}판에서 승률 {wr}%거든요.'] },

    // ── 라인전 · 정글 ──
    firstBlood: { who: 'cast', jin: ['퍼스트~ 블러드! {k}~!', '잡~았습니다! 퍼스트 블러드는 {k}!'], castle: ['퍼스트 블러드! {k:이} {v:을} 잡아냅니다!', '첫 킬 나옵니다! {t} {k}!'] },
    solo: { who: 'cast', jin: ['{w}, 솔로킬! 솔로킬입니다!', '{w:이} {l:을} 잡아냅니다, 잡아냅니다!'], castle: ['{w}, {lane} 솔로킬!', '{l} 잡혔습니다! {w}, 1대1 이겨요!'] },
    soloHype: { who: 'hype', all: ['와, {w} 손 풀렸어요!', '{w}, 라인전에서 그냥 찍어 누르네요!'] },
    plate: { who: 'anal', all: ['{p:이} {lane} 포탑 방패를 하나 뜯었어요. 이것도 다 골드거든요.'] },
    gankLook: { who: 'anal', all: ['{p}, {lane}{dir} 봅니다. 그쪽에 상대 시야가 없거든요.'] },
    gankLow: { who: 'anal', all: ['{p:이} {lane:으로} 방향을 틉니다. {e} 체력이 {hp}%밖에 안 되거든요.'] },
    gankSeen: { who: 'anal', all: ['{p} 동선이 와드에 걸렸어요. {lane} 갱킹은 접을 거예요.'] },
    gankKill: { who: 'cast', jin: ['{p}의 갱킹! 잡아냅니다, 잡아냅니다!'], castle: ['{p}의 갱킹! {lane}에서 킬 나옵니다!'] },
    gankCounter: { who: 'anal', all: ['갱킹을 받아쳤어요. {t} 쪽이 미리 알고 있었던 거죠.'] },
    gankEscape: { who: 'anal', all: ['{p}의 갱킹, 점멸 하나 빼고 끝납니다. 그래도 점멸은 뺐죠.'] },
    pet: { who: 'anal', all: ['{p}, 정글 펫이 다 컸습니다. 이제 강타로 상대도 칠 수 있어요.'] },
    item: { who: 'anal', all: ['{p}, {i:을} 완성했습니다. {n}코어예요.'] },
    csLead: { who: 'anal', all: ['{role}은 {p} 쪽이 CS를 더 먹고 있어요. 매치업 차이가 그대로 나오죠.'] },
    early: { who: 'anal', all: ['아직은 양 팀 다 CS 챙기면서 탐색전입니다.', '정글러가 어디 있느냐, 지금은 그게 제일 중요한 시간이에요.', '6레벨이 되면 그림이 달라질 겁니다. 그 전까진 조용할 거예요.', '정글이 위아래로 갈렸어요. 반대쪽 라인이 버텨 주느냐가 관건이죠.'] },

    // ── 오브젝트 ──
    preGrubs: { who: 'anal', all: ['곧 공허 유충입니다. 탑 · 정글이 먼저 움직이는 쪽이 가져가죠.'] },
    preHerald: { who: 'anal', all: ['1분 뒤 전령입니다. 먹으면 포탑 하나가 따라오거든요.'] },
    preDrag: { who: 'anal', all: ['1분 뒤 첫 드래곤이에요. 바텀 주도권 있는 쪽이 먼저 자리 잡겠죠.'] },
    preDrag3: { who: 'anal', all: ['1분 뒤 드래곤. {t:은} 이번에 먹으면 3스택이에요.'] },
    preSoul: { who: 'anal', all: ['다음 드래곤에 {t} 영혼이 걸려 있어요. 상대는 무조건 막아야 됩니다.'] },
    preBaron: { who: 'anal', all: ['곧 바론입니다. 앞서 있는 {t:이} 시야부터 잡고 상대를 불러낼 거예요.'] },
    preElder: { who: 'cast', all: ['1분 뒤 장로 드래곤입니다! 이 한타에 경기가 걸려 있어요!'] },
    objFree: { who: 'anal', all: ['{w:이} {o:을} 그냥 가져갑니다. {l:은} 올 수 있는 상황이 아니었거든요.'] },
    steal: { who: 'cast', jin: ['스틸! 스틸! {p:이} {o:을} 빼앗습니다~!'], castle: ['{p}, 스틸! {o:을} 빼앗아요!'] },
    stealHype: { who: 'hype', all: ['와, 이걸 뺏네요! {p} 미쳤어요!'] },
    drag3: { who: 'anal', all: ['{t} 드래곤 3스택. 다음 드래곤이 영혼이에요.'] },
    soul: { who: 'cast', jin: ['{t}, {d} 드래곤 영혼~ 획득!'], castle: ['{t}, {d} 영혼 가져갑니다!'] },
    soulWhy: { who: 'anal', all: ['영혼까지 갔어요. 이제 정면 한타는 {t:이} 훨씬 편하죠.'] },
    elder: { who: 'cast', jin: ['{t}, 장로~ 드래곤!'], castle: ['{t}, 장로 가져갑니다!'] },
    grubs: { who: 'anal', all: ['유충은 {a} {an}마리, {b} {bn}마리로 나눠 가졌습니다.'] },
    herald: { who: 'anal', all: ['{t:이} 전령을 {lane:으로} 데려갑니다. 포탑 하나 가져가겠다는 거죠.'] },
    baron: { who: 'cast', jin: ['{t}, 바론~ 가져갑니다!'], castle: ['{t}, 바론 획득!', '바론 {t}! 이제 밀고 들어갑니다!'] },
    baronHurt: { who: 'cast', jin: ['두 명 잃고도 바론~! {t}, 가져갑니다!'], castle: ['상처뿐이지만 바론은 바론! {t} 챙깁니다!'] },
    baronWhy: { who: 'anal', all: ['바론 버프 들고 정비하면 {l:은} 막기 힘들어요. 포탑 하나씩 내줘야 될 거예요.'] },

    // ── 포탑 · 본진 ──
    towerFirst: { who: 'cast', all: ['{t:이} {lane} 첫 포탑을 깹니다!'] },
    towerTake: { who: 'anal', all: ['{t:이} {lane} {tw:을} 가져갑니다.'] },
    inhib: { who: 'cast', jin: ['억제기! {t:이} 억제기를 깹니다!'], castle: ['{t}, 억제기까지 깹니다! 슈퍼 미니언 나와요!'] },
    nexusTower: { who: 'hype', all: ['비상!! {d} 쌍둥이 포탑 하나 깨졌어요! 넥서스가 보입니다!'] },
    baseOpenAce: { who: 'hype', all: ['비상!! {d} 본진에 아무도 없어요! 이대로 끝날 수 있습니다!'] },
    elderLost: { who: 'hype', all: ['비상!! 장로를 내줬어요! {d}, 이번 한타 못 받으면 끝납니다!'] },
    towerKill: { who: 'cast', all: ['{v}, 포탑에 맞고 쓰러집니다!', '포탑이 {v:을} 마무리합니다!'] },

    // ── 싸움 ──
    tp: { who: 'cast', jin: ['{p}, 텔! 텔 탑니다!'], castle: ['{p} 텔! 날아옵니다!', '텔레포트, {p} 합류합니다!'] },
    globalUlt: { who: 'cast', all: ['{p}, {u:으로} 날아듭니다!'] },
    fightOpen: { who: 'cast', jin: ['{where}붙습니다! {p}, 들어갑니다, 들어갑니다!', '자~ {where}{nm} 열립니다! {p:이} 먼저!', '{p:이} 문을 엽니다~! {where}{nm}!', '{where}{nm}! 들어갑니다, {p}!'], castle: ['{where}{nm}! {p} 들어가요, 들어가요!', '{p:이} 먼저 엽니다! {where}{nm}!', '{p}, 들어갑니다! {where}{nm} 열려요!'] },
    fightPoke: { who: 'cast', all: ['{where}서로 긁고 있습니다. 누가 먼저 들어가느냐예요.', '{where}사거리 싸움이 시작됩니다.'] },
    outnumber: { who: 'anal', all: ['지금 {big} {n1}명, {small} {n2}명이에요. {miss:이} 없어서 {small:은} 버티기만 해야 되거든요.'] },
    danger: { who: 'cast', jin: ['{p}, {p}! 위험합니다, 위험합니다!'], castle: ['{p} 위험해요! {p} 빠져야 돼요!', '{p} 살아야 됩니다, 살아야 돼요!'] },
    survived: { who: 'cast', jin: ['{p}, 살았습니다! 살아 나갑니다!'], castle: ['{p} 살았어요!', '{p}, 버텨 냅니다!'] },
    cutFirst: { who: 'hype', all: ['{p:이} 먼저 잘렸어요! 이러면 딜이 안 나와요!', '{p} 먼저 터졌어요! 이건 아프다!'] },
    flank: { who: 'hype', all: ['{a}, 뒤로 돌아서 {v:을} 물었어요! 이게 되네요!', '와, {a}! 옆으로 파고들어서 뒷라인을 다 흔들어요!'] },
    ultFinish: { who: 'cast', jin: ['{s}의 {u}! {v:을} 끝까지 잡아냅니다~!', '{u}~! {s:이} {v:을} 마무리합니다!', '{v}, 못 피합니다! {s}의 {u}~!'], castle: ['{u}! {s:이} {v:을} 끝까지 잡아요!', '살았다 싶었는데요! {s}의 {u}, {v} 쓰러집니다!'] },
    ccMulti: { who: 'cast', jin: ['{p}의 {u}! {n}명! {n}명이 걸립니다~!'], castle: ['{u}! {p}, {n}명 묶어요!', '{p}의 {u}, {n}명 적중!'] },
    heat: { who: 'cast', all: ['{p}, 과열! 평타가 불을 뿜습니다!'] },
    ultHop: { who: 'cast', all: ['{p}의 {u}! {tg:을} 꽂고 넘어갑니다!'] },
    ksWall: { who: 'cast', all: ['{p}, {tg:을} 벽 너머로 끌고 갑니다!'] },
    ksKick: { who: 'cast', all: ['{p}, {tg:을} 진영 밖으로 차 냅니다!'] },
    flashEngage: { who: 'cast', jin: ['점멸 {u}! {p}, 들어갑니다~!'], castle: ['{p}, 점멸 {u}! {tg:이} {hit}!', '플래시 궁! {p} 바로 들어가요!'] },
    flashEngageNoHit: { who: 'cast', all: ['{p}, 점멸 {u}! 바로 {tg:을} 덮칩니다!'] },
    flashChase: { who: 'cast', all: ['{v} 점멸이 없어요! {p}, 점멸로 따라붙습니다!', '{p}, 점멸로 끝까지 쫓아갑니다!'] },
    flashWall: { who: 'cast', all: ['{p}, 점멸로 벽 넘어 빠집니다!'] },
    flashEscape: { who: 'cast', all: ['{p}, 점멸로 빠집니다!'] },
    cleanse: { who: 'cast', all: ['{p}, 정화로 풀어냅니다!'] },
    exhaust: { who: 'cast', all: ['{p}, {v}에게 탈진!'] },

    // ── 싸움 결과 ──
    ace: { who: 'cast', jin: ['에이~스! {t:이} 다 잡아냅니다~!'], castle: ['에이스! {t}, 다 잡았습니다!', '전멸! {t} 에이스!'] },
    aceHype: { who: 'hype', all: ['다 잡았어요! 이러면 그냥 걸어 들어가도 돼요!', '와, 한 명도 안 남았어요!'] },
    bigWin: { who: 'cast', jin: ['한타 대승! {t:이} {n}킬을 가져갑니다~!'], castle: ['한타 대승, {t}! {n}킬 가져갑니다!', '{t} 쪽으로 크게 기웁니다! {n} 대 {l}!'] },
    bigEdge: { who: 'cast', jin: ['{t}, 한타 가져갑니다! {n} 대 {l}!'], castle: ['한타 {t}! {n}킬 챙깁니다!', '{t:이} 한타를 가져갑니다, {n} 대 {l}!'] },
    bigTrade: { who: 'cast', all: ['{n} 대 {n}! 서로 주고받습니다!'] },
    fightWin: { who: 'cast', all: ['{where} 싸움, {t:이} {n}킬 챙깁니다.'] },
    fightEdge: { who: 'cast', all: ['{where} 싸움, {n} 대 {l:으로} {t:이} 조금 더 챙깁니다.'] },
    fightTrade: { who: 'cast', all: ['{where} 싸움, {n} 대 {n:으로} 주고받습니다.'] },
    fightNone: { who: 'anal', all: ['{where}부딪혔는데 킬은 없어요. 체력만 주고받고 빠집니다.'] },
    jungleCut: { who: 'anal', all: ['{l:이} 정글에서 잘렸어요. 들어갈 때 시야가 하나도 없었거든요.', '시야 없는 정글에서 {l:이} 끊겼어요. 이런 데스가 제일 아픕니다.'] },
    killScore: { who: 'cast', all: ['킬 스코어 {Bs} {bk}, {Rs} {rk}.'] },
    mvpBig: { who: 'cast', jin: ['{p}! {c}의 {u:으로} 한타를 가져옵니다~!'], castle: ['{p}의 {u}! 이걸로 한타 끝납니다!'] },
    mvpSmall: { who: 'cast', all: ['{p}의 {u}, 싸움을 가져옵니다!'] },
    mvpHype: { who: 'hype', all: ['와, {p}! {u} 각 너무 잘 봤어요!', '{p} 미쳤어요! {u} 하나로 끝났습니다!', '이건 {p:이} 다 했어요!'] },
    standoff: { who: 'anal', all: ['{t:이} 싸움을 받지 않고 물러납니다. 지금은 불리하다고 본 거죠.', '{t:은} 지금 싸울 이유가 없어요. 걸 게 없거든요.'] },
    ultTurn: { who: 'anal', all: ['{d:은} 궁극기가 {n}개 빠져 있어요. {u} 입장에선 지금이 들어갈 타이밍이죠.'] },

    // ── 한타 뒤: 왜 이겼나 (왕자) ──
    whyNum: { who: 'anal', all: ['숫자에서 이미 갈렸거든요. {w:이} 한 명 많은 걸 놓치지 않았어요.', '{l:은} 들어가면 안 되는 싸움이었어요. 인원이 모자랐거든요.'] },
    whyFewer: { who: 'anal', all: ['{w:이} {c} 명 적었는데 이겼어요. {l:은} 들어가는 타이밍이 다 따로였거든요.'] },
    whyBuff: { who: 'anal', all: ['{b} 버프 차이죠. 버프 든 {w:과} 정면으로 싸우면 이길 수가 없어요.'] },
    whyGold: { who: 'anal', all: ['골드 {gk}K 차이가 그대로 나온 거예요. 아이템 하나 이상 차이거든요.', '{l:은} 정면 한타로는 답이 없어요. 아이템이 한 단계 차이 나거든요.'] },
    whyUpset: { who: 'anal', all: ['골드는 {gk}K 뒤져 있었는데 이겼어요. {s:이} 다 해 줬습니다.'] },
    whyUpsetComp: { who: 'anal', all: ['골드는 {gk}K 뒤져 있었는데 이겼어요. 조합의 힘이죠.'] },
    whyEngage: { who: 'anal', all: ['이니시 차이예요. {w:이} 먼저, 원하는 자리에서 열었거든요.'] },
    whyComp: { who: 'anal', all: ['한타 조합 차이죠. 붙어서 싸우면 {w:이} 더 셉니다.'] },
    whyTank: { who: 'anal', all: ['{p:이} 앞에서 다 받아 줬어요. 그래서 뒤에 딜러들이 편하게 쳤죠.'] },
    whyFocus: { who: 'anal', all: ['집중 공격이 더 좋았어요. {w:은} 한 명씩 차례로 녹였거든요.'] },

    // ── 흐름 (왕자) ──
    leadBig: { who: 'anal', all: ['{t:이} {gk}K 앞서 있어요. 스노우볼 굴릴 수 있는 차이죠.', '{gk}K 차이. {o:은} 이제 뭐라도 만들어야 되는데, 갈 데가 마땅치 않아요.'] },
    leadBigLate: { who: 'anal', all: ['{t:이} {gk}K 앞서 있어요. 이제 굳히기에 들어갈 시간이죠.', '{gk}K 차이예요. {o:은} 한타 한 번에 모든 걸 걸어야 되는 상황이죠.'] },
    leadCut: { who: 'anal', all: ['조금 전까지 {t:이} {was}K 앞섰거든요. 지금은 {cur}K까지 따라잡혔어요.'] },
    leadFlip: { who: 'hype', all: ['역전! {t:이} 골드를 뒤집었어요!', '와, 이걸 뒤집네요! {t} 골드 역전!'] },
    split131: { who: 'anal', all: ['{t:은} 1-3-1이에요. {a:과} {b:이} 양쪽을 밀고 가운데 셋이 버티는 그림이죠.'] },
    five: { who: 'anal', all: ['{t:은} 다섯이 뭉쳐 다닙니다. 운영보다 한타로 풀겠다는 거죠.'] },
    topSplit: { who: 'anal', all: ['{p:이} 탑을 계속 밀고 있어요. 상대는 누가 막으러 가야 되거든요.'] },
    lateComp: { who: 'anal', all: ['{t:은} 후반 조합이라 급할 게 없어요. 시간은 {t} 편이거든요.'] },
    earlyStall: { who: 'anal', all: ['{t:은} 초반 조합인데 격차를 못 벌렸어요. 더 끌리면 힘들어지죠.'] },
    deepWard: { who: 'anal', all: ['{t:이} 상대 정글 깊숙이 와드를 박고 있어요. 동선은 보이겠지만 박다가 잘릴 수도 있죠.'] },
    aggr: { who: 'anal', all: ['{t:은} 계속 싸움을 걸어요. 교전 성향이 아주 적극적이죠.'] },
    fed: { who: 'anal', all: ['{p:이} {k}킬 {d}데스로 잘 컸어요. 한타에서 {c:을} 누가 막느냐가 관건이죠.'] },
    sideLane: { who: 'anal', all: ['이 시간엔 사이드 라인이 중요해요. 누가 먼저 라인을 받아 내느냐죠.'] },
    vision: { who: 'anal', all: ['다음 오브젝트 앞 시야 싸움이 시작됐어요. 와드 하나로 싸움 위치가 바뀌거든요.'] },
    lateClose: { who: 'cast', jin: ['아직 승부는 모릅니다~!', '한타 한 번에 끝날 수 있는 시간입니다!'], castle: ['아직 모릅니다! 한타 한 번이에요!', '양 팀 다 다음 싸움을 준비합니다.', '실수 하나면 그대로 끝나는 시간이에요.'] },
    lateBig: { who: 'cast', jin: ['{o}, 아직 안 끝났습니다~! 한 번만 받아치면 돼요!'], castle: ['{o:은} 한 번만 받아치면 됩니다! 아직 안 끝났어요!', '{t}, 서두를 필요 없습니다. 천천히 조여 갑니다.'] },

    // ── 끝 ──
    nexus: { who: 'cast', jin: ['넥서스~ 파괴! {T:이} {set:을} 가져갑니다~!'], castle: ['넥서스 파괴! {T}, {set} 승리!', '넥서스 깨면서 갑니다! {T:이} {set:을} 가져갑니다!'] },
    series: { who: 'cast', jin: ['끝~났습니다! {T}, 세트 스코어 {w} 대 {l:으로} 시리즈를 가져갑니다~!'], castle: ['끝났습니다! {T:이} {w} 대 {l:으로} 승리합니다!', '넥서스 깨면서 갑니다! {T}, {w} 대 {l}!'] },
    comeback: { who: 'anal', all: ['{l:이} {gk}천 골드까지 앞섰던 경기예요. 그걸 뒤집었습니다.'] },
    pog: { who: 'anal', all: ['오늘 POG는 {p}. {c:으로} {kda}를 기록했어요.', 'POG는 {p}입니다. {c} {kda}, 결정적인 순간마다 있었죠.'] },
  },
  fill(s, v) {
    return s.replace(/\{(\w+)(?::([가-힣]+))?\}/g, (m, k, j) => {
      const x = v[k] == null ? '' : String(v[k]); if (!j) return x;
      const P = this.JOSA[j]; return P ? Sim.josa(x, P[0], P[1]) : x + j;
    });
  },
  // 이번 경기에서 쓸 문장 하나: 캐스터별 → 공통, 아직 안 한 말부터
  text(g, key, v = {}) {
    const e = this.L[key]; if (!e) return null;
    const pool = (e.who === 'cast' && g.caster && e[g.caster]) || e.all || e.jin || [];
    const filled = pool.map(s => this.fill(s, v)), fresh = filled.filter(s => !(g.said || {})[s]);
    const L = fresh.length ? fresh : filled; return L.length ? L[Math.floor(g.r() * L.length)] : null;
  },
};

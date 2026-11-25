# 대진 연결표: 2026 실제 경기(data/results-2026.json)에서 대회마다 '이 경기의 두 팀은 어디서 오는가'를 뽑는다 → js/brackets-data.js
#   토큰: R5 = 앞 단계 순위 5위 (대회 안에 정해진 경기가 있으면 그 순위) · LCK2 = 그 리그 2위 (국제대회) · X = 게임에 없는 팀 자리(다음 순위 팀)
#         Q1 = 앞 플레이-인 진출 1번 · W3 / L3 = 3번 경기(시간순) 승자 / 패자
#   adv: 다음 대회(본선)로 올라간 팀의 토큰 (플레이-인). top: 최종 순위 앞자리 (Road to MSI처럼 결승 승자 말고도 진출하는 팀이 있을 때)
# 실행: python3 tools/bracket-wire.py
import json, os
ROOT = os.path.join(os.path.dirname(__file__), '..')
J = lambda f: json.load(open(os.path.join(ROOT, 'data', f), encoding='utf8'))
R = J('results-2026.json')['matches']
TPL = {e['id']: e for e in J('season-template.json')['events']}
GAME = {t['id']: t['league'] for t in J('teams.json')['teams']}
FEED = {'lck-po': 'lck-playin'}                              # 앞 플레이-인 → 본선
SKIP = {'lpl-s1', 'worlds-playin'}                          # worlds-playin: 게임에서 치르지 않는다 (js/schedule.js DROP)
# 리그별 출전 쿼터: 다른 지역 팀 · 플레이-인 자리 없이 4대 리그 팀으로 채운다
# 디펜딩 챔피언 자리 (2026 실제 대회의 전년도 우승팀). 게임에서는 'DEF' = 전년도 이 대회 우승팀 (첫 해는 2026 실제 우승팀)
DEFENDER = {'ewc': 'gen-g'}
QUOTA = {'worlds': {'LCK': 4, 'LPL': 4, 'LEC': 4, 'LCS': 4}, 'msi': {'LCK': 2, 'LPL': 2, 'LEC': 2, 'LCS': 2}}
DROPTAB = {'msi': 'Play-In'}                                # 대회 안에서 치르지 않는 단계 (js/schedule.js DROPTAB)                                           # 동률 결정전 한 경기: 그때그때 순위로 (일반 규칙)
TOP = {'lck-rtm': ['W2', 'W4', 'L4', 'L3']}                 # Road to MSI: 1·2위전 승자 · 최종전 승자가 MSI

tid = lambda m, k: m['t' + k] or m['n' + k]
# 템플릿 칸 순서(같은 시각이면 템플릿 순서 — 게임의 정렬과 같다)대로 실제 경기를 (시각 · Bo)로 짝짓는다. 아직 안 열린 경기는 None
def slotted(ev):
    left = [m for m in R if m['e'] == ev]; out = []
    for s in TPL[ev]['slots']:
        if ev in DROPTAB and s['tab'].startswith(DROPTAB[ev]): continue
        m = next((x for x in left if x['t'] == s['t'] and x['bo'] == s['bo']), None) or next((x for x in left if x['t'] == s['t']), None)
        if m: left.remove(m)
        out.append((s, m))
    return sorted(out, key=lambda x: x[0]['t'])
def opened(ev): return [s for s, m in slotted(ev) if s.get('a') is None]
def matches(ev, open_=True): return [m for s, m in slotted(ev) if (s.get('a') is None) == open_ and m]
def standings(ms):
    rows = {}
    for m in ms:
        for k, d, win in (('1', m['s1'] - m['s2'], m['w'] == 1), ('2', m['s2'] - m['s1'], m['w'] == 2)):
            x = rows.setdefault(tid(m, k), [0, 0]); x[0] += win; x[1] += d
    return sorted(rows, key=lambda t: (-rows[t][0], -rows[t][1]))
def winner(m): return tid(m, '1') if m['w'] == 1 else tid(m, '2')
def loser(m): return tid(m, '2') if m['w'] == 1 else tid(m, '1')
def at(ms, tok): m = ms[int(tok[1:])]; return winner(m) if tok[0] == 'W' else loser(m)
def ranking(ev):
    br = matches(ev)
    if not br: return standings(matches(ev, False) + br)
    if ev in TOP: top = [at(br, t) for t in TOP[ev]]; return top + [x for x in standings(br) if x not in top]
    fin = br[-1]; c, r = winner(fin), loser(fin)
    return [c, r] + [x for x in standings(br) if x not in (c, r)]
def league_rank(lg, date):
    evs = [e for e in TPL.values() if e['league'] == lg and e['kind'] in ('regular', 'playoffs') and e['end'] < date]
    evs.sort(key=lambda e: e['end'])
    r = ranking(evs[-1]['id']) if evs else []
    return [x for x in r if x in GAME]
def pool(ev):
    e = TPL[ev]
    regs = sorted([x for x in TPL.values() if x['league'] == e['league'] and x['kind'] == 'regular' and x['end'] <= e['start']], key=lambda x: x['end'])
    if not regs: return league_rank(e['league'], e['start'])
    last = regs[-1]; src = [last['id']] + ([last['dependsOn']] if last.get('dependsOn') else [])
    return standings([m for s in src for m in R if m['e'] == s])

out = {}
for ev, e in TPL.items():
    sl = [(s, m) for s, m in slotted(ev) if s.get('a') is None]
    ms = [m for s, m in sl if m]
    miss = [i for i, (s, m) in enumerate(sl) if not m]
    if not sl or ev in SKIP: continue
    # 아직 안 열린 결승(데이터 수집 뒤 경기): 마지막 두 4강 승자끼리
    if miss and (miss != [len(sl) - 1] or sl[-1][0]['tab'] != 'Finals'): print('건너뜀', ev, '빈 경기', len(miss)); continue
    tabs = [s['tab'] for s, m in sl]
    rnd, r = [], -1
    for i, t in enumerate(tabs): r += (i == 0 or t != tabs[i - 1]); rnd.append(r)
    fixed = matches(ev, False) if e['kind'] != 'intl' else []
    intl = e['league'] == 'INTL'
    feed = FEED.get(ev); fteams = set()
    if feed: fteams = {tid(m, k) for m in R if m['e'] == feed for k in '12'}
    if intl: ranks = {lg: league_rank(lg, e['start']) for lg in ('LCK', 'LPL', 'LEC', 'LCS')}
    else: order = standings(fixed) if fixed else pool(ev)   # 게임에 없는 팀도 순위 계산에는 넣는다 (자리 순서용)
    wire, seeds, quals = [], {}, []
    for i, m in enumerate(ms):
        pair = []
        for k in '12':
            t = tid(m, k); prev = [j for j in range(i) if t in (tid(ms[j], '1'), tid(ms[j], '2'))]
            if prev: j = prev[-1]; pair.append(('W' if winner(ms[j]) == t else 'L') + str(j)); continue
            if t in fteams: quals.append(t); pair.append('Q?'); seeds[(i, k)] = t; continue
            if t == DEFENDER.get(ev): pair.append('DEF'); continue
            if intl and t not in GAME: pair.append('X'); continue
            if intl:
                lg = GAME[t]; rk = ranks[lg].index(t) + 1 if t in ranks[lg] else None
                pair.append(f'{lg}{rk}' if rk else 'X')
            else: pair.append(('T', t, rnd[i]))
        wire.append(pair)
    if miss: sf = [i for i, t in enumerate(tabs) if t == 'Semifinals'][-2:]; wire.append([f'W{sf[0]}', f'W{sf[1]}'])
    if not intl:
        ent, low = {}, {}
        for p in wire:
            for x in p:
                if isinstance(x, tuple) and x[1] not in ent: ent[x[1]] = x[2]; low[x[1]] = any(isinstance(y, str) and y[0] == 'L' for y in p)
        rk = lambda t: order.index(t) if t in order else 99
        # 시드 순서: 패자조로 들어오는 팀은 아래, 늦은 라운드에 들어오는(부전승) 팀은 위, 같으면 실제 순위
        srt = sorted(ent, key=lambda t: (low[t], -ent[t], rk(t)))
        base = min(rk(t) for t in srt) + 1 if srt else 1
        base = min(base, max(1, len([g for g in GAME.values() if g == e['league']]) - len(srt) + 1))
        num = {t: f'R{base + n}' for n, t in enumerate(srt)}
        # 시드만 들어오는 첫 라운드(앞 단계 순위로 정하는 대회)는 표준 짝: 강한 쪽 순으로 1 대 2k, 2 대 2k-1 … (실제 시드 기준과 우리 순위 계산이 달라 1위 대 4위 같은 짝이 생기지 않게)
        r0 = [i for i in range(len(wire)) if rnd[i] == 0]
        if not fixed and len(r0) >= 2 and all(isinstance(x, tuple) for i in r0 for x in wire[i]):
            r0.sort(key=lambda i: min(rk(x[1]) for x in wire[i]))
            nums = sorted(int(num[x[1]][1:]) for i in r0 for x in wire[i]); k = len(r0)
            for j, i in enumerate(r0): num[wire[i][0][1]], num[wire[i][1][1]] = f'R{nums[j]}', f'R{nums[2 * k - 1 - j]}'
        wire = [[num[x[1]] if isinstance(x, tuple) else x for x in p] for p in wire]
    if intl and ev not in QUOTA:   # 리그별 순위는 빈틈 없이 (실제 예선 · 디펜딩 자리 때문에 5위 · 7위 같은 번호가 생기지 않게)
        import re
        for lg_ in ('LCK', 'LPL', 'LEC', 'LCS'):
            olds = sorted({int(x[3:]) for p in wire for x in p if re.fullmatch(lg_ + r'\d+', x)})
            ren = {f'{lg_}{o}': f'{lg_}{n + 1}' for n, o in enumerate(olds)}
            wire = [[ren.get(x, x) for x in p] for p in wire]
    if ev in QUOTA:
        import re
        seat = [(i, j) for i, p in enumerate(wire) for j, x in enumerate(p) if not re.fullmatch(r'[WL]\d+', x)]
        keep, want = {}, [f'{lg}{k}' for lg, n in QUOTA[ev].items() for k in range(1, n + 1)]
        for i, j in seat:
            x = wire[i][j]
            if x in want and x not in keep.values(): keep[(i, j)] = x
        rest = [x for x in want if x not in keep.values()]
        free = [s_ for s_ in seat if s_ not in keep]
        assert len(rest) == len(free), (ev, rest, free)
        lg = lambda x: re.match(r'[A-Z]+', x).group(0)
        for s_ in free:   # 1라운드에서 같은 리그끼리 붙지 않게: 상대와 리그가 다른 토큰 먼저
            i, j = s_; opp = wire[i][1 - j]
            pick = next((x for x in rest if not re.fullmatch(r'[A-Z]+\d+', opp) or lg(x) != lg(opp)), rest[0])
            rest.remove(pick); wire[i][j] = pick
        # 남은 충돌은 채운 자리끼리 맞바꿔 푼다
        isS = lambda x: re.fullmatch(r'[A-Z]+\d+', x)
        clash = lambda i: isS(wire[i][0]) and isS(wire[i][1]) and lg(wire[i][0]) == lg(wire[i][1])
        for a_ in free:
            if not clash(a_[0]): continue
            for b_ in free:
                if b_[0] == a_[0]: continue
                wire[a_[0]][a_[1]], wire[b_[0]][b_[1]] = wire[b_[0]][b_[1]], wire[a_[0]][a_[1]]
                if not clash(a_[0]) and not clash(b_[0]): break
                wire[a_[0]][a_[1]], wire[b_[0]][b_[1]] = wire[b_[0]][b_[1]], wire[a_[0]][a_[1]]
        assert not any(clash(i) for i in {x[0] for x in seat}), ('같은 리그 맞대결', ev)
    item = {'m': wire}
    if quals:   # 플레이-인 진출 순서 = 그 대회의 adv 순서
        fm = matches(feed)
        adv = []
        for t in quals:
            j = max(i for i, m in enumerate(fm) if t in (tid(m, '1'), tid(m, '2')))
            adv.append(('W' if winner(fm[j]) == t else 'L') + str(j))
        out.setdefault(feed, {})['adv'] = adv
        qi = iter(range(1, len(quals) + 1))
        item['m'] = [[f'Q{next(qi)}' if x == 'Q?' else x for x in p] for p in wire]
        item['feed'] = feed
    if ev in TOP: item['top'] = TOP[ev]
    if ev in DEFENDER: item['def'] = ranking(ev)[0]   # 게임 첫 해의 디펜딩 챔피언 = 2026 실제 우승팀
    out.setdefault(ev, {}).update(item)
# 플레이-인 adv가 먼저 계산된 대회 순서와 무관하게 남도록 정리
out = {k: v for k, v in out.items() if 'm' in v}
js = '// tools/bracket-wire.py가 만든 대진 연결표 (2026 실제 경기 기준). 직접 고치지 말고 스크립트를 다시 돌린다\nconst BRACKETS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(os.path.join(ROOT, 'js', 'brackets-data.js'), 'w', encoding='utf8').write(js)
for k, v in out.items():
    toks = [t for p in v['m'] for t in p if not (t[0] in 'WL' and t[1:].isdigit())]
    print(f"{k:14s} {len(v['m']):2d}경기 시드 {' '.join(toks)}{'  adv ' + ' '.join(v['adv']) if 'adv' in v else ''}")

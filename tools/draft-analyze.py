# 프로 밴픽 양상 분석 (설명용 통계). 입력: tools/scrape/out/drafts.json
# 실행: PYTHONIOENCODING=utf8 python tools/draft-analyze.py
import json, os, collections, math
ROOT = os.path.join(os.path.dirname(__file__), '..')
rows = json.load(open(os.path.join(ROOT, 'tools/scrape/out/drafts.json'), encoding='utf8'))
ROLE = {'Top': 'TOP', 'Jungle': 'JGL', 'Mid': 'MID', 'Bot': 'BOT', 'Support': 'SUP'}
SLOTS = [('B1', 1, 0), ('R1', 2, 0), ('R2', 2, 1), ('B2', 1, 1), ('B3', 1, 2), ('R3', 2, 2), ('R4', 2, 3), ('B4', 1, 3), ('B5', 1, 4), ('R5', 2, 4)]
G = []
for r in rows:
    p = {t: [r.get(f'p{t}{i}') for i in range(1, 6)] for t in (1, 2)}; ro = {t: [ROLE.get(r.get(f'r{t}{i}') or '') for i in range(1, 6)] for t in (1, 2)}
    if any(not x for t in (1, 2) for x in p[t] + ro[t]): continue
    b = {t: [r.get(f'b{t}{i}') for i in range(1, 6)] for t in (1, 2)}
    G.append({'d': r['D'], 'm': r.get('M'), 'n': int(r.get('N') or r.get('N GameInMatch') or 1), 't': {1: r['T1'], 2: r['T2']}, 'w': r.get('W'), 'p': p, 'r': ro, 'b': b, 'f': r['D'] >= '2025-01-01'})
G.sort(key=lambda g: g['d'])
print('게임', len(G), '피어리스', sum(g['f'] for g in G), '/ 이전', sum(not g['f'] for g in G))
out = {}
def pct(a, b): return round(100 * a / max(1, b), 1)

# 1) 픽 순서별 포지션
for mode in (False, True):
    rc = {s: collections.Counter() for s, *_ in SLOTS}
    for g in G:
        if g['f'] != mode: continue
        for s, t, i in SLOTS: rc[s][g['r'][t][i]] += 1
    out['roles_by_slot_' + ('fearless' if mode else 'classic')] = {s: {k: pct(v, sum(c.values())) for k, v in c.most_common()} for s, c in rc.items()}

# 2) 메타 · 숙련 · 견제 (최근 400게임 픽+밴, 팀별 최근 40게임)
pres = collections.deque(); cnt = collections.Counter(); team = collections.defaultdict(collections.deque); roles = collections.defaultdict(collections.Counter)
c = collections.Counter(); prev_match = collections.defaultdict(list)
for gi, g in enumerate(G):
    if gi > 400:
        top = {x for x, _ in cnt.most_common(12)}
        tc = {t: collections.Counter(ch for gm in team[g['t'][t]] for ch in gm) for t in (1, 2)}
        # 1페이즈 밴 (3+3), 2페이즈 밴 (2+2)
        for t in (1, 2):
            o = 3 - t
            for i, bn in enumerate(g['b'][t]):
                if not bn: continue
                ph = 'ban1' if i < 3 else 'ban2'
                c[ph + '_n'] += 1
                c[ph + '_top12'] += bn in top
                c[ph + '_oppComfort'] += tc[o][bn] >= 2
                c[ph + '_ownComfort'] += tc[t][bn] >= 2
                if ph == 'ban2':
                    # 상대 남은 포지션 (상대가 1페이즈에 고른 3명 제외)
                    o_first = g['r'][o][:3] if o == 1 else g['r'][o][:3]
                    sh = roles[bn]; tot = sum(sh.values()) or 1
                    main = max(sh, key=sh.get) if sh else None
                    c['ban2_roleKnown'] += main is not None
                    c['ban2_targetsOppOpenRole'] += main is not None and main not in o_first
                    c['ban2_targetsOwnOpenRole'] += main is not None and main not in g['r'][t][:3]
        # 첫 픽
        b1 = g['p'][1][0]; sh = roles[b1]; tot = sum(sh.values()) or 1
        c['B1_n'] += 1; c['B1_top12'] += b1 in top; c['B1_flex'] += sum(1 for v in sh.values() if v / tot >= .1) >= 2
        c['B1_comfort'] += tc[1][b1] >= 2
        # 듀오를 같은 차례에 뽑는가 (블루 B2·B3, 레드 R1·R2 / R4·R5 는 같은 차례 아님)
        for t, pair in [(1, (1, 2)), (2, (0, 1))]:
            rr = {g['r'][t][pair[0]], g['r'][t][pair[1]]}
            c['rot_n'] += 1; c['rot_botsup'] += rr == {'BOT', 'SUP'}; c['rot_jglmid'] += rr == {'JGL', 'MID'}; c['rot_jglsup'] += rr == {'JGL', 'SUP'}
        # 바텀 듀오가 1페이즈에 같이 나왔나 / 갈라졌나
        for t in (1, 2):
            first = g['r'][t][:3]
            c['duo_n'] += 1; c['duo_both_p1'] += 'BOT' in first and 'SUP' in first; c['duo_split'] += ('BOT' in first) != ('SUP' in first); c['duo_both_p2'] += 'BOT' not in first and 'SUP' not in first
        # 마지막 픽(R5): 블루는 이미 다 골랐다 → 카운터 픽 가능. 마지막 픽 포지션
        c['R5_' + g['r'][2][4]] += 1; c['B5_' + g['r'][1][4]] += 1
        # 피어리스 깊이: 같은 시리즈 앞 세트 수
        if g['f']: c['fl_games'] += 1; c['fl_comfort_picks'] += sum(tc[t][x] >= 2 for t in (1, 2) for x in g['p'][t]); c['fl_picks'] += 10
        else: c['cl_games'] += 1; c['cl_comfort_picks'] += sum(tc[t][x] >= 2 for t in (1, 2) for x in g['p'][t]); c['cl_picks'] += 10
    ch = [x for t in (1, 2) for x in g['p'][t]] + [x for t in (1, 2) for x in g['b'][t] if x]
    pres.append(ch); cnt.update(ch)
    if len(pres) > 400: cnt.subtract(pres.popleft())
    for t in (1, 2):
        q = team[g['t'][t]]; q.append(g['p'][t])
        if len(q) > 40: q.popleft()
        for x, r in zip(g['p'][t], g['r'][t]): roles[x][r] += 1
summary = {
  '1페이즈 밴': {'메타 상위12 비율': pct(c['ban1_top12'], c['ban1_n']), '상대 팀 숙련 챔프(최근 40게임 2판+)': pct(c['ban1_oppComfort'], c['ban1_n']), '우리 팀 숙련 챔프': pct(c['ban1_ownComfort'], c['ban1_n'])},
  '2페이즈 밴': {'메타 상위12 비율': pct(c['ban2_top12'], c['ban2_n']), '상대 팀 숙련 챔프': pct(c['ban2_oppComfort'], c['ban2_n']), '상대가 아직 안 고른 포지션 챔프': pct(c['ban2_targetsOppOpenRole'], c['ban2_roleKnown']), '우리가 아직 안 고른 포지션 챔프': pct(c['ban2_targetsOwnOpenRole'], c['ban2_roleKnown'])},
  '첫 픽(B1)': {'메타 상위12': pct(c['B1_top12'], c['B1_n']), '여러 포지션 가능(플렉스)': pct(c['B1_flex'], c['B1_n']), '팀 숙련 챔프': pct(c['B1_comfort'], c['B1_n'])},
  '같은 차례 두 픽(B2·B3, R1·R2)': {'원딜+서폿': pct(c['rot_botsup'], c['rot_n']), '정글+미드': pct(c['rot_jglmid'], c['rot_n']), '정글+서폿': pct(c['rot_jglsup'], c['rot_n'])},
  '바텀 듀오 시점': {'1페이즈에 둘 다': pct(c['duo_both_p1'], c['duo_n']), '하나만 먼저(아껴 둠)': pct(c['duo_split'], c['duo_n']), '2페이즈에 둘 다': pct(c['duo_both_p2'], c['duo_n'])},
  '마지막 픽 포지션(R5)': {r: pct(c['R5_' + r], c['B1_n']) for r in ['TOP', 'JGL', 'MID', 'BOT', 'SUP']},
  '블루 마지막 픽(B5)': {r: pct(c['B5_' + r], c['B1_n']) for r in ['TOP', 'JGL', 'MID', 'BOT', 'SUP']},
  '숙련 챔프 픽 비율': {'피어리스 이전': pct(c['cl_comfort_picks'], c['cl_picks']), '피어리스': pct(c['fl_comfort_picks'], c['fl_picks'])},
}
out['summary'] = summary
json.dump(out, open(os.path.join(ROOT, 'tools/scrape/out/draft-analysis.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(json.dumps(summary, ensure_ascii=False, indent=1))
for k in ('roles_by_slot_classic', 'roles_by_slot_fearless'):
    print(k, {s: list(v.items())[:2] for s, v in out[k].items()})

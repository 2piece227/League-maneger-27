# 상위권 솔랭 타임라인 → 엔진 3단계 목표치 (data/soloq-targets.json)
# 실행: python tools/soloq-analyze.py   (tools/scrape/soloq-games.mjs 다음에)
# 총량(킬 수 · 경기 시간 · 드래곤)은 프로 기준(tools/validate-engine.md)을 그대로 쓰고, 여기서는 "모양"만 뽑는다:
#   포지션 × 시간대별 위치 분포, 같이 다니는 인원, 교전 크기·장소·시각, 오브젝트 첫 시각, 귀환 시각, 와드
import json, os, math, collections
ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'tools/scrape/out/soloq-games.jsonl')
games = [json.loads(l) for l in open(SRC, encoding='utf8') if l.strip()]
POS = {'TOP': 'TOP', 'JUNGLE': 'JGL', 'MIDDLE': 'MID', 'BOTTOM': 'BOT', 'UTILITY': 'SUP'}
# Riot 좌표 → 맵 % (assets/map/rift.webp, 블루 왼쪽 아래). 기준: 블루 우물 (554,581)→(7,93), 레드 우물 (14267,14366)→(92,5)
def pct(x, y): return (7 + (x - 554) / 13713 * 85, 93 - (y - 581) / 13785 * 88)
def mirror(p): return (100 - p[0], 100 - p[1])
PH = [(0, 3), (3, 7), (7, 14), (14, 20), (20, 26), (26, 99)]
def ph(m):
    for i, (a, b) in enumerate(PH):
        if a <= m < b: return i
    return len(PH) - 1
G = 10   # 10x10 칸
def cell(p): return min(G - 1, max(0, int(p[1] / 100 * G))) * G + min(G - 1, max(0, int(p[0] / 100 * G)))
def dist(a, b): return math.hypot(a[0] - b[0], a[1] - b[1])
LANES = {'top': [(11, 85), (11, 11), (85, 11)], 'mid': [(14, 85), (85, 14)], 'bot': [(14, 89), (89, 89), (89, 14)]}
def seg(p, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]; t = max(0, min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy)))
    return math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t)
def where(p):
    d = {l: min(seg(p, pts[i], pts[i + 1]) for i in range(len(pts) - 1)) for l, pts in LANES.items()}
    l = min(d, key=d.get)
    if d[l] < 6: return l
    # 강: 왼쪽 위 → 오른쪽 아래 대각선 근처
    return 'river' if abs(p[0] - (100 - p[1])) < 10 else 'jungle'

heat = {r: [[0] * (G * G) for _ in PH] for r in POS.values()}
group = collections.defaultdict(list)       # 분 → 팀별 가장 큰 무리 크기
fights = []                                   # (분, 참여 인원, 장소)
killsByMin = collections.Counter(); partBy = collections.defaultdict(list)
firsts = collections.defaultdict(list); recalls = collections.defaultdict(list); wards = collections.defaultdict(lambda: collections.Counter())
roam = collections.defaultdict(lambda: [0, 0])
dur = []
for g in games:
    dur.append(g['dur'] / 60)
    role = {p['i']: POS.get(p['pos']) for p in g['p']}; team = {p['i']: p['t'] for p in g['p']}
    for mi, fr in enumerate(g['f']):
        pts = {}
        for idx, q in enumerate(fr):
            pid = idx + 1
            if not q[0] and not q[1]: continue
            p = pct(q[0], q[1]); r = role.get(pid)
            if team[pid] == 200: p2 = mirror(p)    # 레드는 뒤집어서 "자기 진영 기준"으로 모은다
            else: p2 = p
            pts[pid] = p
            if r: heat[r][ph(mi)][cell(p2)] += 1
            if r == 'MID' and 4 <= mi < 14: roam[mi][1] += 1; roam[mi][0] += where(p) != 'mid'
        for t in (100, 200):
            ps = [pts[i] for i in pts if team[i] == t and dist(pts[i], (7, 93) if t == 100 else (92, 5)) > 12]
            best = 0
            for a in ps: best = max(best, sum(1 for b in ps if dist(a, b) < 12))
            group[mi].append(best)
    ks = [e for e in g['ev'] if e['ty'] == 'CHAMPION_KILL' and 'xy' in e]
    for e in ks:
        m = e['ts'] / 60000; killsByMin[int(m)] += 1; partBy[ph(m)].append(1 + len(e.get('as', [])))
    # 교전: 15초 · 15% 안에 이어진 킬을 한 싸움으로
    used = set()
    for i, e in enumerate(ks):
        if i in used: continue
        grp = [e]; used.add(i); p0 = pct(*e['xy'])
        for j in range(i + 1, len(ks)):
            if ks[j]['ts'] - grp[-1]['ts'] > 15000: break
            if dist(pct(*ks[j]['xy']), p0) < 15: grp.append(ks[j]); used.add(j)
        people = set()
        for x in grp: people.update([x.get('k'), x.get('v')] + x.get('as', []))
        people.discard(0); people.discard(None)
        fights.append((e['ts'] / 60000, len(people), len(grp), where(p0)))
    seen = set()
    for e in g['ev']:
        if e['ty'] == 'ELITE_MONSTER_KILL':
            k = e['mo'] + (':' + e['sub'] if e['mo'] == 'DRAGON' and e.get('sub') == 'ELDER_DRAGON' else '')
            if k not in seen: seen.add(k); firsts[k].append(e['ts'] / 60000)
        if e['ty'] == 'WARD_PLACED' and e.get('c'): r = role.get(e['c']); wards[r][min(4, int(e['ts'] / 60000 / 7))] += 1
    # 귀환: 아이템 구매가 몰린 시각(30초 안 구매는 한 번), 시작 아이템(1분 전) 제외
    buys = collections.defaultdict(list)
    for e in g['ev']:
        if e['ty'] == 'ITEM_PURCHASED' and e['ts'] > 90000: buys[e['pi']].append(e['ts'] / 60000)
    for pid, ts in buys.items():
        last = -9; n = 0
        for t in sorted(ts):
            if t - last > .5: n += 1; recalls[(role.get(pid), n)].append(t)
            last = t

def q(v, p): v = sorted(v); return round(v[min(len(v) - 1, int(len(v) * p))], 2) if v else None
def avg(v): return round(sum(v) / len(v), 2) if v else None
out = {
    'games': len(games), 'source': '한국 챌린저·그랜드마스터 랭크 (Riot API)',
    'note': '위치는 자기 진영 기준(레드는 뒤집음). heat[포지션][시간대] = 10x10 칸 비율. 시간대: ' + ', '.join(f'{a}-{b}분' for a, b in PH),
    'phases': PH,
    'heat': {r: [[round(c / max(1, sum(h)), 4) for c in h] for h in hs] for r, hs in heat.items()},
    'groupLargest': {m: avg(v) for m, v in sorted(group.items()) if m <= 35},
    'killsPerMin': {m: round(c / len(games), 3) for m, c in sorted(killsByMin.items()) if m <= 35},
    'killParticipants': {PH[i][0]: avg(v) for i, v in sorted(partBy.items())},
    'fightSize': {f'{a}-{b}': {'n': sum(1 for f in fights if a <= f[0] < b) / len(games), 'people': avg([f[1] for f in fights if a <= f[0] < b]), 'kills': avg([f[2] for f in fights if a <= f[0] < b]),
                               'where': dict(collections.Counter(f[3] for f in fights if a <= f[0] < b).most_common())} for a, b in PH},
    'firstObjective': {k: {'p10': q(v, .1), 'median': q(v, .5), 'p90': q(v, .9)} for k, v in firsts.items()},
    'recall': {f'{r}:{n}': {'median': q(v, .5), 'p25': q(v, .25), 'p75': q(v, .75)} for (r, n), v in sorted(recalls.items(), key=lambda x: (str(x[0][0]), x[0][1])) if n <= 4 and r},
    'wardsPer7min': {r: {i * 7: round(c / len(games), 2) for i, c in sorted(cnt.items())} for r, cnt in wards.items() if r},
    'midOffLane': {m: round(a / max(1, b), 3) for m, (a, b) in sorted(roam.items())},
    'duration': {'median': q(dur, .5), 'mean': avg(dur)},
}
json.dump(out, open(os.path.join(ROOT, 'data/soloq-targets.json'), 'w', encoding='utf8'), ensure_ascii=False)
print('games', len(games), 'dur', out['duration'])
print('group largest by min', {m: out['groupLargest'][m] for m in (3, 6, 10, 15, 20, 25, 30) if m in out['groupLargest']})
print('fights', json.dumps(out['fightSize'], ensure_ascii=False))
print('first obj', out['firstObjective'])
print('recall', {k: v for k, v in out['recall'].items() if k.endswith(':1') or k.endswith(':2')})
print('mid off-lane', out['midOffLane'])
print('wards', out['wardsPer7min'])

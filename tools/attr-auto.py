# 능력치 자동 산정: 수동 기준 선수(data/attributes.json)에 맞춰 나머지 선수의 OVR·세부 능력치를 기록으로 추정한다.
# 입력: data/player-stats.json (tools/scrape/player-stats.mjs), players.json, cl.json, teams.json, overrides.json
# 출력: data/attributes-auto.json   실행: python tools/attr-auto.py [--report]
import json, math, sys, os
from datetime import date

ROOT = os.path.join(os.path.dirname(__file__), '..', 'data')
J = lambda f: json.load(open(os.path.join(ROOT, f), encoding='utf8'))
stats = J('player-stats.json')['players']
manual = J('attributes.json')['players']
teams = {t['id']: t for t in J('teams.json')['teams']}
ov = J('overrides.json')['teams']
cl = J('cl.json')
players = [dict(p, lvl='first') for p in J('players.json')['players']] + [dict(p, lvl='cl') for p in cl['players']]
clteams = {t['id']: t for t in cl['teams']}
TODAY = date(2026, 11, 12)

# ---------- 능력치 정의 (js/attributes.js와 같게) ----------
T = ['mechanics', 'laning', 'farming', 'reflex']
O = ['mapAwareness', 'rotation', 'objective', 'vision', 'teamfight']
M = ['composure', 'focus']
S = {'TOP': ['splitPush', 'durability'], 'JGL': ['pathing', 'smite'], 'MID': ['roaming', 'crack'], 'BOT': ['lateCarry', 'survival'], 'SUP': ['engage', 'protect']}
SKIP = {'JGL': ['laning'], 'SUP': ['farming']}
REF = {'TOP': 19.34, 'JGL': 19.65, 'MID': 19.67, 'BOT': 19.39, 'SUP': 19.80}

def raw(a, role):
    sk = SKIP.get(role, [])
    avg = lambda ks: sum(a[k] for k in ks if k not in sk) / len([k for k in ks if k not in sk])
    return .4 * avg(T) + .3 * avg(O) + .1 * avg(M) + .2 * avg(S[role])
ovr = lambda a, role: round(raw(a, role) / REF[role] * 99)

# ---------- 리그·팀 ----------
def team_of(p):
    t = teams.get(p['team']) or clteams.get(p['team'])
    if not t: return None, 'LCK', 2
    league = t.get('league') or 'LCK'
    rep = (ov.get(t.get('name'), {}) or {}).get('rep', 2)
    return t, league, rep
# 리그 격차 (OVR 점수). 약한 리그 기록은 상대가 약해 부풀려지므로 깎는다. 2군은 소속 리그 값에서 더 깎는다
LEAGUE = {'LCK': 0, 'LPL': -1, 'LEC': -7, 'LCS': -11}
CL_PEN = -13

# ---------- 지표 ----------
def metrics(s):
    m = max(s['min'], 1)
    return {
        'kda': (s['k'] + s['a']) / max(s['d'], 1), 'kp': (s['k'] + s['a']) / max(s['tk'], 1), 'dth': s['d'] / m,
        'cspm': s['cs'] / m, 'gsh': s['gold'] / max(s['tg'], 1), 'dpm': s['dmg'] / m, 'vspm': s['vs'] / m,
        'ksh': s['k'] / max(s['tk'], 1), 'wr': s['w'] / max(s['g'], 1),
    }
KEYS = ['kda', 'kp', 'dth', 'cspm', 'gsh', 'dpm', 'vspm', 'ksh', 'wr']
PRIOR = 25  # 판수가 적으면 포지션 평균 쪽으로 당긴다

rows = []
for p in players:
    if p.get('role') not in S: continue
    s = stats.get(p['id'])
    t, league, rep = team_of(p)
    rows.append({'p': p, 'role': p['role'], 'league': league, 'rep': rep, 's': s, 'm': metrics(s) if s and s['g'] >= 3 else None})

def zfit(role):
    rs = [r for r in rows if r['role'] == role and r['m'] and r['s']['g'] >= 15]
    mu = {k: sum(r['m'][k] for r in rs) / len(rs) for k in KEYS}
    sd = {k: math.sqrt(sum((r['m'][k] - mu[k]) ** 2 for r in rs) / len(rs)) or 1 for k in KEYS}
    return mu, sd
FIT = {role: zfit(role) for role in S}

for r in rows:
    mu, sd = FIT[r['role']]
    if r['m']:
        g = r['s']['g']
        r['z'] = {k: ((g * r['m'][k] + PRIOR * mu[k]) / (g + PRIOR) - mu[k]) / sd[k] for k in KEYS}
    else:
        r['z'] = {k: 0 for k in KEYS}
    r['z']['dth'] = -r['z']['dth']  # 덜 죽을수록 +

# 실력 지수: 포지션마다 중요한 지표 비중이 다르다
W = {
    'TOP': {'kda': .2, 'gsh': .2, 'dpm': .15, 'dth': .1, 'kp': .05, 'wr': .3},
    'JGL': {'kda': .2, 'kp': .2, 'gsh': .1, 'dth': .1, 'dpm': .05, 'wr': .35},
    'MID': {'kda': .2, 'gsh': .15, 'dpm': .2, 'kp': .1, 'dth': .05, 'wr': .3},
    'BOT': {'kda': .2, 'gsh': .15, 'dpm': .2, 'dth': .1, 'kp': .05, 'wr': .3},
    'SUP': {'kda': .15, 'kp': .2, 'vspm': .15, 'dth': .1, 'wr': .4},
}
def intl_bonus(r):
    i = r['s'] and r['s'].get('intl')
    if not i or i['g'] < 5: return 0
    return min(i['g'], 80) / 80 * .9 + (i['w'] / i['g'] - .5) * 2 * min(i['g'], 40) / 40
for r in rows:
    pi = sum(w * r['z'][k] for k, w in W[r['role']].items())
    pi += (r['rep'] - 3) * .25 + intl_bonus(r)
    if not r['m']: pi -= .8  # 1군 기록이 거의 없음 (신인·후보)
    r['pi'] = pi

# ---------- 기준 선수로 OVR 눈금 맞추기 (최소제곱) ----------
anc = [r for r in rows if r['p']['id'] in manual]
def sheet(x, role): return {**dict(zip(T, x['t'])), **dict(zip(O, x['o'])), **dict(zip(M, x['m'])), **dict(zip(S[role], x['s']))}
for r in anc: r['ovr_m'] = ovr(sheet(manual[r['p']['id']], r['role']), r['role'])
xs, ys = [r['pi'] for r in anc], [r['ovr_m'] for r in anc]
mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
B_MIN = float(os.environ.get('B', 6))  # 기준 선수끼리는 실력 차가 작아 기울기가 눌린다 → 하위권까지 퍼지게 최소 기울기
b = max(b, B_MIN)
lg = lambda r: LEAGUE.get(r['league'], -11) + (CL_PEN if r['p']['lvl'] == 'cl' else 0)
a = sum(y - b * x - lg(r) for r, x, y in zip(anc, xs, ys)) / len(anc)
for r in rows: r['ovr'] = max(40, min(99, round(a + b * r['pi'] + lg(r))))

# ---------- 세부 능력치: 목표 OVR 근처에서 지표대로 강점·약점을 준다 ----------
PROFILE = {  # 능력치 ← 지표 z 가중
    'mechanics': {'kda': .5, 'dpm': .5}, 'laning': {'gsh': .6, 'cspm': .4}, 'farming': {'cspm': 1}, 'reflex': {'dth': .7, 'kda': .3},
    'mapAwareness': {'dth': .6, 'kp': .4}, 'rotation': {'kp': 1}, 'objective': {'wr': .7, 'kp': .3}, 'vision': {'vspm': 1}, 'teamfight': {'dpm': .4, 'kp': .3, 'kda': .3},
    'composure': {'wr': .5, 'kda': .5}, 'focus': {'wr': .6, 'dth': .4},
    'splitPush': {'gsh': .6, 'cspm': .4}, 'durability': {'dth': 1}, 'pathing': {'kp': .5, 'gsh': .5}, 'smite': {'wr': 1},
    'roaming': {'kp': .7, 'ksh': .3}, 'crack': {'dpm': .5, 'ksh': .5}, 'lateCarry': {'dpm': .6, 'gsh': .4}, 'survival': {'dth': 1},
    'engage': {'kp': .7, 'kda': .3}, 'protect': {'dth': .5, 'kda': .5},
}
SPREAD = 1.1
def build(r):
    role, target = r['role'], r['ovr']
    ca = REF[role] * target / 99
    keys = T + O + M + S[role]
    base = {k: sum(w * r['z'].get(m, 0) for m, w in PROFILE[k].items()) * SPREAD for k in keys}
    if role == 'JGL': base['laning'] = None
    if role == 'SUP': base['farming'] = None
    off = 0
    for _ in range(30):  # 클램프 때문에 몇 번 맞춘다
        a = {k: (max(1, min(20, ca + off + v)) if v is not None else 0) for k, v in base.items()}
        d = target / 99 * REF[role] - raw({**a, 'laning': a.get('laning', 0), 'farming': a.get('farming', 0)}, role)
        if abs(d) < .01: break
        off += d
    a = {k: round(v) for k, v in a.items()}
    if role == 'JGL': a['laning'] = max(5, round(ca * .45))
    if role == 'SUP': a['farming'] = max(3, min(12, round(5 + r['z'].get('cspm', 0) * 1.5 + (ca - 17) * .5)))
    # 반올림 오차로 OVR이 1 어긋나면 운영 한 칸으로 맞춘다
    for _ in range(6):
        cur = ovr(a, role)
        if cur == target: break
        k = max(O, key=lambda x: a[x]) if cur > target else min(O, key=lambda x: a[x])
        a[k] = max(1, min(20, a[k] + (1 if cur < target else -1)))
    return {'t': [a[k] for k in T], 'o': [a[k] for k in O], 'm': [a[k] for k in M], 's': [a[k] for k in S[role]], 'ovr': ovr(a, role)}

out = {}
for r in rows:
    if r['p']['id'] in manual: continue
    out[r['p']['id']] = build(r)

if '--report' in sys.argv or True:
    print(f'눈금: OVR = {a:.1f} + {b:.2f} x 지수  (기준 {len(anc)}명)')
    print('기준 선수 검증 (수동 OVR / 기록 추정):')
    print('  ' + ', '.join(f"{r['p']['name']} {r['ovr_m']}/{r['ovr']}" for r in sorted(anc, key=lambda r: -r['ovr_m'])))
    err = sum(abs(r['ovr_m'] - r['ovr']) for r in anc) / len(anc); print(f'  평균 오차 {err:.1f}')
    json.dump([{'id': r['p']['id'], 'name': r['p']['name'], 'role': r['role'], 'team': r['p']['team'], 'league': r['league'], 'lvl': r['p']['lvl'],
                'g': r['s']['g'] if r['s'] else 0, 'pi': round(r['pi'], 2), 'ovr': r['ovr_m'] if r['p']['id'] in manual else r['ovr'], 'manual': r['p']['id'] in manual} for r in rows],
              open(os.path.join(os.environ.get('TMP', '.'), 'attr-report.json'), 'w', encoding='utf8'), ensure_ascii=False)

json.dump({'_note': '자동 산정 (tools/attr-auto.py). 수동 값(attributes.json)이 있으면 그쪽이 우선.', 'scale': {'a': round(a, 2), 'b': round(b, 2)}, 'players': out},
          open(os.path.join(ROOT, 'attributes-auto.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print(f'자동 산정 {len(out)}명 → data/attributes-auto.json')

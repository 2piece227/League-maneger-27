# 평판 자동 산정: "LM 27 연봉·평판·팀 명성 체계" 문서의 기준값(data/reputation.json)에 맞춰
# 나머지 선수 평판(0~100)을 기록으로 추정한다. 팀 평판은 reputation.json에 전부 수동으로 둔다.
# 입력: reputation.json, player-stats.json, players.json, cl.json, attributes(-auto).json
# 출력: data/reputation-auto.json   실행: python tools/rep-auto.py [--report]
import json, math, sys, os
from datetime import date
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..', 'data')
J = lambda f: json.load(open(os.path.join(ROOT, f), encoding='utf8'))
R = J('reputation.json')
stats = J('player-stats.json')['players']
sheet = {**J('attributes-auto.json')['players'], **J('attributes.json')['players']}
cl = J('cl.json')
clparent = {t['id']: t['parent'] for t in cl['teams']}
players = [dict(p, lvl='first') for p in J('players.json')['players']] + [dict(p, lvl='cl') for p in cl['players']]
TODAY = date(2026, 11, 12)
REF = {'TOP': 19.34, 'JGL': 19.65, 'MID': 19.67, 'BOT': 19.39, 'SUP': 19.80}
T = ['mechanics', 'laning', 'farming', 'reflex']; O = ['mapAwareness', 'rotation', 'objective', 'vision', 'teamfight']; M = ['composure', 'focus']
S = {'TOP': ['splitPush', 'durability'], 'JGL': ['pathing', 'smite'], 'MID': ['roaming', 'crack'], 'BOT': ['lateCarry', 'survival'], 'SUP': ['engage', 'protect']}
SKIP = {'JGL': ['laning'], 'SUP': ['farming']}

def ovr(p):
    x = sheet.get(p['id']); role = p['role']
    if not x: return None
    sk = SKIP.get(role, [])
    avg = lambda vs, ks: sum(v for v, k in zip(vs, ks) if k not in sk) / len([k for k in ks if k not in sk])
    r = .4 * avg(x['t'], T) + .3 * avg(x['o'], O) + .1 * avg(x['m'], M) + .2 * avg(x['s'], S[role])
    return round(r / REF[role] * 99)

def age(p):
    b = p.get('birthdate')
    if not b: return 22
    y, m, d = map(int, b[:10].split('-')); return TODAY.year - y - ((TODAY.month, TODAY.day) < (m, d))

def feats(p):
    s = stats.get(p['id']) or {}
    ig = (s.get('intl') or {}).get('g', 0); iw = (s.get('intl') or {}).get('w', 0)
    tid = p['team'] if p['lvl'] == 'first' else clparent.get(p['team'], p['team'])
    tf = R['teams'].get(tid, 55) * (1 if p['lvl'] == 'first' else .5)
    o = ovr(p) or (60 if p['lvl'] == 'cl' else 75)
    return [1, o - 85, math.log1p(ig), min(age(p), 28) - 22], o, tf

rows = [p for p in players if p.get('role') in S]
anch = R['players']
TEAM = 2  # 팀 평판 10점당 +2 (인기 팀 주전일수록 노출이 많다). 기준 선수가 상위 팀뿐이라 회귀로는 못 잡아서 고정
X, y = [], []
for p in rows:
    if p['id'] in anch: f, _, _ = feats(p); X.append(f); y.append(anch[p['id']] - TEAM * (feats(p)[2] - 70) / 10)
X, y = np.array(X), np.array(y, float)
lam = np.diag([0, 1, 1, 1]) * 2.0
TEAM = 2  # 팀 평판 10점당 +2 (인기 팀 주전일수록 노출이 많다). 기준 선수가 상위 팀뿐이라 회귀로는 못 잡아서 고정  # 기준 선수가 적어서 약하게 묶는다
w = np.linalg.solve(X.T @ X + lam, X.T @ y)

out, rep = {}, []
for p in rows:
    f, o, tf = feats(p)
    v = float(np.array(f) @ w) + TEAM * (tf - 70) / 10
    if p['lvl'] == 'cl': v = min(30, v * .6)  # 2군: 하부 리그에 알려진 정도까지
    v = int(round(max(0, min(100, v))))
    fixed = R.get('adjust', {}).get(p['id'])
    if p['id'] in anch: v2 = anch[p['id']]
    elif fixed is not None: v2 = fixed
    else: v2 = v
    if p['id'] not in anch: out[p['id']] = v2
    rep.append({'id': p['id'], 'name': p['name'], 'team': p['team'], 'lvl': p['lvl'], 'role': p['role'], 'ovr': o, 'tf': tf, 'auto': v, 'final': v2, 'anchor': p['id'] in anch})

json.dump({'_note': 'tools/rep-auto.py가 만든 선수 평판 (0~100). 기준값은 reputation.json', 'players': out}, open(os.path.join(ROOT, 'reputation-auto.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=0)
if '--report' in sys.argv:
    print('w', np.round(w, 2))
    err = [(r['name'], r['final'], r['auto']) for r in rep if r['anchor']]
    print('anchor fit', err)
    json.dump(rep, open(os.path.join(os.environ.get('TMP', '.'), 'rep-report.json'), 'w', encoding='utf8'), ensure_ascii=False)

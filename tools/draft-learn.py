# 프로 밴픽 학습 → data/draft-model.json
# 입력: tools/scrape/out/drafts.json (node tools/scrape/drafts.mjs, 2023~ 4대 리그 + 국제대회)
# 방법: 밴·픽 한 번 한 번을 "그 순간 남은 챔피언 중 하나를 고른 선택"으로 보고, 챔피언을 메타와 무관한 특징으로 바꾼 뒤
#       페이즈별 조건부 로짓(선택 확률 ∝ exp(가중치·특징))으로 가중치를 배운다. 특정 챔피언 이름은 학습에 들어가지 않는다.
# 특징 (모두 그 경기 전까지의 기록으로만 계산):
#   meta     최근 400게임 픽+밴 비율 (메타 우선도)
#   comfort  우리 팀이 남은 포지션에서 최근 40게임 동안 그 챔피언을 쓴 정도 (선수 숙련 대용)
#   comfortO 상대 팀의 같은 값 (밴에서는 견제, 픽에서는 뺏기)
#   flex     여러 포지션에서 쓰이는 정도
#   fit      우리 남은 포지션에 들어가는가 / fitO 상대 남은 포지션에 들어가는가
#   syn      이미 고른 우리 챔피언과의 시너지 (같은 팀 동시 픽 리프트)
#   counter  상대가 이미 고른 같은 포지션 챔피언 상대 승률
#   threat   우리가 이미 고른 챔피언을 상대로 한 그 챔피언의 승률 (밴: 우리 픽 카운터 견제)
#   wr       최근 승률
# 실행: python tools/draft-learn.py [--report]
import json, math, os, sys, random, collections
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..')
rows = json.load(open(os.path.join(ROOT, 'tools/scrape/out/drafts.json'), encoding='utf8'))
ROLE = {'Top': 'TOP', 'Jungle': 'JGL', 'Mid': 'MID', 'Bot': 'BOT', 'Support': 'SUP'}
ROLES = ['TOP', 'JGL', 'MID', 'BOT', 'SUP']
# 대회 밴픽 순서: (팀 1=블루 2=레드, 밴/픽, 번호)
ORDER = [(1, 'b', 1), (2, 'b', 1), (1, 'b', 2), (2, 'b', 2), (1, 'b', 3), (2, 'b', 3),
         (1, 'p', 1), (2, 'p', 1), (2, 'p', 2), (1, 'p', 2), (1, 'p', 3), (2, 'p', 3),
         (2, 'b', 4), (1, 'b', 4), (2, 'b', 5), (1, 'b', 5),
         (2, 'p', 4), (1, 'p', 4), (1, 'p', 5), (2, 'p', 5)]
def phase(i):
    if i < 6: return 'ban1'
    if i == 6: return 'first'
    if i < 12: return 'pick1'
    if i < 16: return 'ban2'
    if i < 19: return 'pick2'
    return 'last'
FEATS = ['meta', 'comfort', 'comfortO', 'flex', 'fit', 'fitO', 'syn', 'counter', 'threat', 'wr']

# ---------- 게임 정리 ----------
games = []
for r in rows:
    try:
        g = {'id': r['G'], 'm': r.get('M') or r['G'].rsplit('_', 1)[0], 'n': int(r.get('N') or r.get('N GameInMatch') or 1), 'd': r['D'], 't': {1: r['T1'], 2: r['T2']}, 'w': int(r['W']) if r.get('W') in ('1', '2') else 0}
        g['ban'] = {t: [r.get(f'b{t}{i}') or None for i in range(1, 6)] for t in (1, 2)}
        g['pick'] = {t: [r.get(f'p{t}{i}') or None for i in range(1, 6)] for t in (1, 2)}
        g['role'] = {t: [ROLE.get(r.get(f'r{t}{i}') or '') for i in range(1, 6)] for t in (1, 2)}
        if any(not x for t in (1, 2) for x in g['pick'][t]) or any(not x for t in (1, 2) for x in g['role'][t]): continue
        for t in (1, 2): g['ban'][t] = [b if b and b.lower() not in ('none', 'loss of ban') else None for b in g['ban'][t]]
        g['fearless'] = g['d'] >= '2025-01-01'
        games.append(g)
    except Exception: pass
games.sort(key=lambda g: (g['d'], g['n']))
print('게임', len(games), '(피어리스', sum(g['fearless'] for g in games), ')')

# ---------- 기록 누적기 (그 경기 전까지) ----------
class Hist:
    def __init__(s):
        s.pres = collections.deque(); s.cnt = collections.Counter()          # 최근 400게임 픽+밴
        s.team = collections.defaultdict(collections.deque)                   # 팀 → 최근 40게임 [(champ, role)]
        s.tc = collections.defaultdict(collections.Counter)                   # 팀 → (champ, role) 횟수 (최근 40게임)
        s.roles = collections.defaultdict(collections.Counter)                # 챔피언 → 포지션별 픽 수 (최근 1500게임 누적 근사)
        s.rq = collections.deque()
        s.pair = collections.Counter(); s.single = collections.Counter(); s.npair = 0   # 같은 팀 동시 픽
        s.pq = collections.deque()
        s.mut = collections.defaultdict(lambda: [0, 0])                       # (role, a, b) → [게임, a 승]
        s.wr = collections.defaultdict(lambda: [0, 0])
        s.wq = collections.deque(); s._sc = {}
    def add(s, g):
        s._sc = {}
        champs = [c for t in (1, 2) for c in g['pick'][t]] + [b for t in (1, 2) for b in g['ban'][t] if b]
        s.pres.append(champs); s.cnt.update(champs)
        if len(s.pres) > 400: s.cnt.subtract(s.pres.popleft())
        for t in (1, 2):
            q = s.team[g['t'][t]]; cur = list(zip(g['pick'][t], g['role'][t])); q.append(cur); s.tc[g['t'][t]].update(cur)
            if len(q) > 40: s.tc[g['t'][t]].subtract(q.popleft())
        rs = [(c, r) for t in (1, 2) for c, r in zip(g['pick'][t], g['role'][t])]
        s.rq.append(rs)
        for c, r in rs: s.roles[c][r] += 1
        if len(s.rq) > 1500:
            for c, r in s.rq.popleft(): s.roles[c][r] -= 1
        ps = []
        for t in (1, 2):
            p = sorted(g['pick'][t]); ps.append(p)
            for i in range(5):
                s.single[p[i]] += 1
                for j in range(i + 1, 5): s.pair[(p[i], p[j])] += 1
        s.npair += 2; s.pq.append(ps)
        if len(s.pq) > 1500:
            for p in s.pq.popleft():
                for i in range(5):
                    s.single[p[i]] -= 1
                    for j in range(i + 1, 5): s.pair[(p[i], p[j])] -= 1
            s.npair -= 2
        if g['w']:
            for t in (1, 2):
                o = 3 - t
                for c, r in zip(g['pick'][t], g['role'][t]):
                    s.wr[c][0] += 1; s.wr[c][1] += g['w'] == t
                    oc = g['pick'][o][g['role'][o].index(r)] if r in g['role'][o] else None
                    if oc: x = s.mut[(r, c, oc)]; x[0] += 1; x[1] += g['w'] == t
    # --- 조회 ---
    def meta(s, c): return s.cnt[c] / max(1, len(s.pres))
    def share(s, c):
        if c in s._sc: return s._sc[c]
        tot = sum(s.roles[c].values()); v = {r: s.roles[c][r] / tot for r in ROLES} if tot else {}
        s._sc[c] = v; return v
    def flex(s, c): sh = s.share(c); return sum(1 for v in sh.values() if v >= .1)
    def fits(s, c, open_roles):
        sh = s.share(c); return 1.0 if any(sh.get(r, 0) >= .15 for r in open_roles) else 0.0
    def comfort(s, team, c, open_roles):
        tc = s.tc.get(team); n = sum(tc[(c, r)] for r in open_roles) if tc else 0
        return math.log1p(n)
    def syn(s, c, mine):
        best = 0.0
        for o in mine:
            a, b = sorted((c, o)); n = s.pair[(a, b)]
            if n < 4 or not s.npair: continue
            exp = s.single[c] * s.single[o] / (s.npair * 2.5) + .5
            best = max(best, math.log((n + .5) / exp))
        return best
    def mu(s, role, a, b):
        x = s.mut.get((role, a, b)); return ((x[1] + 4) / (x[0] + 8) - .5) if x else 0.0
    def counter(s, c, mine_roles_open, opp):   # 상대가 고른 같은 포지션 챔피언 상대 (내 남은 포지션 중)
        best = 0.0
        for oc, orole in opp:
            if orole in mine_roles_open and s.share(c).get(orole, 0) >= .15: best = max(best, s.mu(orole, c, oc))
        return best
    def threat(s, c, mine):                  # 우리가 고른 챔피언(포지션 포함)을 상대로 c의 승률
        best = 0.0
        for mc, mr in mine:
            if s.share(c).get(mr, 0) >= .15: best = max(best, s.mu(mr, c, mc))
        return best
    def wrc(s, c): x = s.wr.get(c); return ((x[1] + 10) / (x[0] + 20) - .5) if x else 0.0

H = Hist()
data = {p: [] for p in ['ban1', 'first', 'pick1', 'ban2', 'pick2', 'last']}
ALL = set()
matches = collections.defaultdict(list)
stats = collections.Counter()
random.seed(7)
for gi, g in enumerate(games):
    ALL.update(c for t in (1, 2) for c in g['pick'][t] if c)
    if gi >= 300:                                      # 기록이 쌓인 뒤부터 학습
        used = set()
        if g['fearless']:
            for pg in matches[g['m']]:
                for t in (1, 2): used.update(pg['pick'][t])
        taken = set(used); picked = {1: [], 2: []}; pi = {1: 0, 2: 0}; bi = {1: 0, 2: 0}
        cands_all = [c for c in ALL]
        for i, (t, kind, n) in enumerate(ORDER):
            o = 3 - t
            ch = g['ban'][t][n - 1] if kind == 'b' else g['pick'][t][n - 1]
            open_t = [r for r in ROLES if r not in [x[1] for x in picked[t]]]
            open_o = [r for r in ROLES if r not in [x[1] for x in picked[o]]]
            if ch and ch not in taken:
                avail = [c for c in cands_all if c not in taken and c != ch]
                neg = random.sample(avail, min(24, len(avail)))
                def feat(c):
                    return [H.meta(c), H.comfort(g['t'][t], c, open_t), H.comfort(g['t'][o], c, open_o), H.flex(c) / 3, H.fits(c, open_t), H.fits(c, open_o),
                            H.syn(c, [x[0] for x in picked[t]]), H.counter(c, open_t, picked[o]), H.threat(c, picked[t]), H.wrc(c)]
                X = np.array([feat(ch)] + [feat(c) for c in neg])
                data[phase(i)].append((X, g['d'], g['fearless'], i))
            if ch: taken.add(ch)
            if kind == 'p': picked[t].append((g['pick'][t][n - 1], g['role'][t][n - 1]))
    H.add(g); matches[g['m']].append(g)

import pickle
pickle.dump({p: [(x.astype(np.float32), d, fl, i) for x, d, fl, i in v] for p, v in data.items()}, open(os.path.join(ROOT, 'tools/scrape/out/draft-train.pkl'), 'wb'))
# ---------- 학습: 조건부 로짓 (정답은 항상 0번) ----------
def fit(items, l2=1e-3, it=400, lr=.05):
    X = np.stack([x for x, *_ in items]).astype(np.float64); n, k, f = X.shape
    mu_, sd = X.reshape(-1, f).mean(0), X.reshape(-1, f).std(0) + 1e-6
    Z = (X - mu_) / sd; w = np.zeros(f); m = np.zeros(f); v = np.zeros(f)
    for t in range(1, it + 1):
        s = Z @ w; s -= s.max(1, keepdims=True); p = np.exp(s); p /= p.sum(1, keepdims=True)
        grad = (Z[:, 0, :] - (p[:, :, None] * Z).sum(1)).mean(0) - l2 * w
        m = .9 * m + .1 * grad; v = .999 * v + .001 * grad ** 2
        w += lr * (m / (1 - .9 ** t)) / (np.sqrt(v / (1 - .999 ** t)) + 1e-8)
    s = Z @ w; s -= s.max(1, keepdims=True); p = np.exp(s); p /= p.sum(1, keepdims=True)
    ll = float(np.log(p[:, 0] + 1e-12).mean())
    return w / sd, mu_, ll
def evaluate(items, w):
    top1 = top5 = 0
    for X, *_ in items:
        s = X @ w; rank = (s > s[0]).sum()
        top1 += rank == 0; top5 += rank < 5
    return top1 / len(items), top5 / len(items)

model = {'feats': FEATS, 'phases': {}, 'eval': {}}
for ph, items in data.items():
    train = [x for x in items if x[1] < '2026-01-01']; test = [x for x in items if x[1] >= '2026-01-01']
    w, _, ll = fit(train)
    t1, t5 = evaluate(test, w) if test else (0, 0)
    # 비교 기준: 메타만 (현재 게임 AI와 비슷한 단순 기준)
    wm = np.zeros(len(FEATS)); wm[0] = 1; wm[4] = 3
    m1, m5 = evaluate(test, wm) if test else (0, 0)
    model['phases'][ph] = [round(float(v), 4) for v in w]
    model['eval'][ph] = {'n_train': len(train), 'n_test': len(test), 'top1': round(t1, 3), 'top5': round(t5, 3), 'meta_top1': round(m1, 3), 'meta_top5': round(m5, 3)}
    # 피어리스 · 비피어리스 따로 학습해 차이 확인
    for tag, sel in [('fearless', True), ('classic', False)]:
        sub = [x for x in items if x[2] == sel]
        if len(sub) > 500: model.setdefault('by_mode', {}).setdefault(tag, {})[ph] = [round(float(v), 4) for v in fit(sub)[0]]

# ---------- 게임에서 쓸 현재 기록 (최근 기준) ----------
names = sorted(ALL)
model['meta'] = {c: round(H.meta(c), 4) for c in names if H.meta(c) > 0}
model['roles'] = {c: {r: round(v, 3) for r, v in H.share(c).items() if v >= .05} for c in names if H.share(c)}
model['pairs'] = {}
for (a, b), n in H.pair.items():
    if n >= 6:
        exp = H.single[a] * H.single[b] / (H.npair * 2.5) + .5; lift = math.log((n + .5) / exp)
        if lift > .3: model['pairs'][a + '|' + b] = round(lift, 3)
model['meta_games'] = len(H.pres)
model['source'] = {'games': len(games), 'from': games[0]['d'][:10], 'to': games[-1]['d'][:10]}
json.dump(model, open(os.path.join(ROOT, 'data/draft-model.json'), 'w', encoding='utf8'), ensure_ascii=False)
print(json.dumps({'eval': model['eval'], 'weights': {p: dict(zip(FEATS, w)) for p, w in model['phases'].items()}, 'by_mode': model.get('by_mode')}, ensure_ascii=False, indent=1))

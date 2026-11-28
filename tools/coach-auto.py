# 코치 능력치 · 특성 자동 산정 → data/coaches-auto.json  (수동 값 data/coaches.json 이 우선)
#   python tools/coach-auto.py            (헤드 코치 여부를 Leaguepedia RosterChanges에서 받는다. 오프라인이면 --offline)
# 능력치(1~19): 팀 명성(reputation.json, 2군은 1군 명성의 0.6배) 기준 + 헤드 코치 +1.5 + 코치마다 고정 편차 + 주특기 하나 +2.5
# 특성 0~3개: 코치 수준이 높을수록 많이, 능력치가 높은 분야의 특성이 잘 붙는다. 전용 특성(대대대 · C언어)은 수동으로만
import hashlib, json, math, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
D = lambda f: os.path.join(ROOT, 'data', f)
STATS = ['draft', 'manage', 'tactic', 'develop']
# 분야별 범용 특성 (js/coaches.js Coach.TRAITS 와 같은 키)
POOL = {
    'draft': ['fearless-pro', 'sure-plan', 'dice', 'insight', 'red-side', 'joker'],
    'manage': ['pillar', 'comeback-will', 'win-streak', 'mood-maker', 'veteran-care'],
    'tactic': ['zhuge', 'big-stage', 'comeback-arch', 'teamfight', 'macro-god'],
    'develop': ['cl-master', 'scout-eye', 'pool-wide'],
    'any': ['network', 'star'],
}


def rng(seed):
    h = int(hashlib.md5(seed.encode()).hexdigest()[:12], 16)
    state = [h or 1]
    def r():
        state[0] = (state[0] * 6364136223846793005 + 1442695040888963407) % (1 << 64)
        return (state[0] >> 11) / float(1 << 53)
    return r


def gauss(r):
    return math.sqrt(-2 * math.log(max(1e-9, r()))) * math.cos(2 * math.pi * r())


def heads(links):
    """RosterChanges에서 코치마다 가장 최근 합류 직책 (Head Coach 여부)"""
    out = {}
    for i in range(0, len(links), 40):
        g = links[i:i + 40]
        where = 'Player IN (%s) AND Role LIKE "%%Coach%%" AND Direction="Join"' % ','.join('"%s"' % s.replace('"', '\\"') for s in g)
        q = urllib.parse.urlencode({'action': 'cargoquery', 'format': 'json', 'limit': '500', 'tables': 'RosterChanges',
                                    'fields': 'Player,Team,Role,Date_Sort', 'where': where, 'order_by': 'Date_Sort ASC'})
        for a in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request('https://lol.fandom.com/api.php?' + q, headers={'User-Agent': 'lm27-coach-auto'}), timeout=30) as resp:
                    rows = [x['title'] for x in json.load(resp).get('cargoquery', [])]
                break
            except Exception as e:
                print('  retry', a + 1, e); time.sleep(3 * (a + 1))
        else:
            raise SystemExit('Leaguepedia 요청 실패 (--offline 으로 건너뛸 수 있음)')
        for x in rows: out[x['Player'].lower()] = x['Role']   # 날짜 오름차순 → 마지막이 최근
        time.sleep(1)
    return out


def main():
    rep = json.load(open(D('reputation.json'), encoding='utf8'))['teams']
    P = json.load(open(D('players.json'), encoding='utf8'))['players']
    C = json.load(open(D('cl.json'), encoding='utf8'))
    parent = {t['id']: t.get('parent') for t in C.get('teams', [])}
    manual = json.load(open(D('coaches.json'), encoding='utf8'))['coaches']
    coaches = [(p, False) for p in P if p['role'] == 'COACH'] + [(p, True) for p in C['players'] if p['role'] == 'COACH']
    seen, uniq = set(), []
    for p, cl in coaches:
        if p['id'] not in seen: seen.add(p['id']); uniq.append((p, cl))
    H = {} if '--offline' in sys.argv else heads(sorted({p['sourcePage'] for p, _ in uniq if p.get('sourcePage')}))
    out, nTr = {}, {}
    for p, cl in uniq:
        r = rng('coach:' + p['id'])
        fame = rep.get(parent.get(p['team']) if cl else p['team'], 45 if not cl else 50)
        fame = fame * (.6 if cl else 1)
        head = (H.get((p.get('sourcePage') or '').lower()) or '').lower() == 'head coach'
        base = 6 + fame * .08 + (1.5 if head else 0)
        main = STATS[int(r() * 4)]
        st = {k: int(round(max(3, min(19, base + gauss(r) * 2.2 + (2.5 if k == main else 0))))) for k in STATS}
        q = sum(st.values()) / 4
        lam = max(.2, min(1.7, .45 + (q - 9) * .17))
        n = 0
        while n < 3 and r() < lam / (n + 1.6): n += 1
        tr = []
        for _ in range(n):
            w = {k: max(.5, st[k] - 7) for k in STATS}; w['any'] = 1.2 if fame >= 70 else .5
            cat = None; x = r() * sum(w.values())
            for k, v in w.items():
                x -= v
                if x <= 0: cat = k; break
            cand = [t for t in POOL[cat or 'any'] if t not in tr and not (t == 'star' and fame < 70)]
            if cand: tr.append(cand[int(r() * len(cand))])
        for t in tr: nTr[t] = nTr.get(t, 0) + 1
        out[p['id']] = {**st, 'traits': tr, 'head': head}
    with open(D('coaches-auto.json'), 'w', encoding='utf8') as f:
        json.dump({'_note': 'tools/coach-auto.py가 만든 코치 능력치 · 특성. 수동 값(coaches.json)이 있으면 그쪽이 우선.', 'coaches': out}, f, ensure_ascii=False, indent=1)
    hc = [k for k, v in out.items() if v['head']]
    print('코치', len(out), '| 헤드 코치', len(hc), '| 특성 분포', dict(sorted(nTr.items(), key=lambda x: -x[1])), '| 수동', len(manual))


if __name__ == '__main__':
    main()

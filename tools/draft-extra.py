# draft-model.json 보강: 시즌 전체 메타(최근 한 해) · 픽 순서별 포지션 비율(피어리스 시기)
# 실행: python tools/draft-extra.py  (draft-learn.py 다음에)
import json, os, collections
ROOT = os.path.join(os.path.dirname(__file__), '..')
rows = json.load(open(os.path.join(ROOT, 'tools/scrape/out/drafts.json'), encoding='utf8'))
ROLE = {'Top': 'TOP', 'Jungle': 'JGL', 'Mid': 'MID', 'Bot': 'BOT', 'Support': 'SUP'}
# ORDER 의 픽 차례 번호 (6~19) → (팀, 몇 번째 픽)
PICKS = {6: (1, 0), 7: (2, 0), 8: (2, 1), 9: (1, 1), 10: (1, 2), 11: (2, 2), 16: (2, 3), 17: (1, 3), 18: (1, 4), 19: (2, 4)}
last = max(r['D'] for r in rows)[:4]
season = [r for r in rows if r['D'][:4] == last]
cnt = collections.Counter()
for r in season:
    for t in (1, 2):
        for i in range(1, 6):
            for k in ('p', 'b'):
                c = r.get(f'{k}{t}{i}')
                if c and c.lower() not in ('none', 'loss of ban'): cnt[c] += 1
slot = {s: collections.Counter() for s in PICKS}
for r in rows:
    if r['D'] < '2025-01-01': continue
    for s, (t, i) in PICKS.items():
        ro = ROLE.get(r.get(f'r{t}{i + 1}') or '')
        if ro: slot[s][ro] += 1
m = json.load(open(os.path.join(ROOT, 'data/draft-model.json'), encoding='utf8'))
m['meta_season'] = {c: round(v / len(season), 4) for c, v in cnt.items()}
m['meta_season_year'] = last
m['slot_role'] = {str(s): {r: round(v / sum(c.values()), 3) for r, v in c.items()} for s, c in slot.items()}
json.dump(m, open(os.path.join(ROOT, 'data/draft-model.json'), 'w', encoding='utf8'), ensure_ascii=False)
print(last, len(season), sorted(m['meta_season'].items(), key=lambda x: -x[1])[:10])
print(m['slot_role'])

# 빠진 선수 정보 채우기: data/players.json · data/cl.json 에서 생년월일 · 국적 · 본명 · 계약이 빈 사람만
# Leaguepedia Players 표에서 다시 받아 빈 칸만 채운다 (있는 값은 건드리지 않는다). 로스터는 바꾸지 않는다.
#   python tools/fill-missing.py          (로그인 필요 없음)
# 예전 스크레이퍼가 페이지명 대소문자(kyeahoo / Kyeahoo)를 가려서 놓친 선수를 메우는 용도.
import json, os, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
API = 'https://lol.fandom.com/api.php'
ROLE = {'Top': 'TOP', 'Jungle': 'JGL', 'Mid': 'MID', 'Bot': 'BOT', 'Support': 'SUP'}


def cargo(where):
    q = urllib.parse.urlencode({'action': 'cargoquery', 'format': 'json', 'tables': 'Players', 'limit': '500',
                                'fields': 'ID,OverviewPage,Name,NativeName,Country,NationalityPrimary,Birthdate,Role,Contract', 'where': where})
    for i in range(4):
        try:
            req = urllib.request.Request(API + '?' + q, headers={'User-Agent': 'lm27-data-fill'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return [x['title'] for x in json.load(r).get('cargoquery', [])]
        except Exception as e:
            print('  retry', i + 1, e); time.sleep(3 * (i + 1))
    raise SystemExit('Leaguepedia 요청 실패')


def missing(p):
    return not p.get('birthdate') or not p.get('nation') or not p.get('realName')


def fill(path):
    D = json.load(open(path, encoding='utf8'))
    need = [p for p in D['players'] if missing(p) or ',' in (p.get('role') or '')]
    pages = sorted({p['sourcePage'] for p in need if p.get('sourcePage')})
    rows = {}
    for i in range(0, len(pages), 40):
        g = pages[i:i + 40]
        where = 'OverviewPage IN (%s)' % ','.join('"%s"' % s.replace('"', '\\"') for s in g)
        for r in cargo(where): rows[r['OverviewPage'].lower()] = r
        time.sleep(1)
    n = {'birthdate': 0, 'nation': 0, 'realName': 0, 'nativeName': 0, 'contractEnd': 0, 'role': 0}
    still = []
    for p in need:
        r = rows.get((p.get('sourcePage') or '').lower())
        if r:
            pairs = [('birthdate', r.get('Birthdate')), ('nation', r.get('NationalityPrimary') or r.get('Country')),
                     ('realName', (r.get('Name') or '').replace('&nbsp;', ' ').replace(' ', ' ').strip()), ('nativeName', r.get('NativeName')), ('contractEnd', r.get('Contract'))]
            for k, v in pairs:
                if v and not p.get(k): p[k] = v; n[k] += 1
        if ',' in (p.get('role') or ''):   # 'Bot,Support' → 첫 포지션
            p['role'] = ROLE.get(p['role'].split(',')[0].strip().capitalize(), p['role']); n['role'] += 1
        if not p.get('birthdate'): still.append(p['id'])
    with open(path, 'w', encoding='utf8') as f: json.dump(D, f, ensure_ascii=False, indent=2)
    print(os.path.basename(path), '채움', n, '| 여전히 생년월일 없음', len(still), still)


if __name__ == '__main__':
    for f in ('players.json', 'cl.json'): fill(os.path.join(ROOT, 'data', f))

# 챔피언 이미지 로컬 저장 (외부 CDN이 막힌 기기에서도 보이도록)
# data/champions.json 의 원격 URL을 받아 webp로 줄여 assets/champions/ 에 저장하고 경로를 바꾼다.
# 실행 순서: node tools/scrape/champions.mjs → python tools/scrape/champion-images.py
import io, json, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(ROOT, 'data', 'champions.json')
OUT = 'assets/champions'
# 종류별 (가로 크기, 품질)
SPEC = {'icon': (96, 82), 'splash': (760, 68), 'spell': (48, 80)}

d = json.load(open(DATA, encoding='utf8'))
jobs = []  # (원격 URL, 로컬 경로, 종류)

def local(url, kind, name):
    if not url.startswith('http'):
        return url
    path = f'{OUT}/{kind}/{name}.webp'
    jobs.append((url, path, kind))
    return path

for c in d['champions']:
    cid = c['id']
    c['icon'] = local(c['icon'], 'icon', cid)
    c['splash'] = local(c['splash'], 'splash', cid)
    c.pop('loading', None)
    c['passive']['icon'] = local(c['passive']['icon'], 'spell', f'{cid}_P')
    for sp in c['spells']:
        sp['icon'] = local(sp['icon'], 'spell', f"{cid}_{sp['key']}")

def fetch(job):
    url, path, kind = job
    dst = os.path.join(ROOT, path)
    if os.path.exists(dst):
        return None
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    try:
        raw = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'LM27-scraper'}), timeout=30).read()
        im = Image.open(io.BytesIO(raw)).convert('RGB')
        w, q = SPEC[kind]
        if im.width > w:
            im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im.save(dst, 'WEBP', quality=q, method=6)
    except Exception as e:
        return f'{url}: {e}'

with ThreadPoolExecutor(12) as ex:
    errs = [e for e in ex.map(fetch, jobs) if e]
for e in errs:
    print('실패', e, file=sys.stderr)

json.dump(d, open(DATA, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(os.path.join(ROOT, OUT)) for f in fs)
print(f'이미지 {len(jobs)}개 처리, 실패 {len(errs)}개, 총 {total / 1e6:.1f}MB')

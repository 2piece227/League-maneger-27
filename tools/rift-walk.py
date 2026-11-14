# 맵 이미지(assets/map/rift.webp)에서 "다닐 수 있는 칸" 격자를 뽑아 js/riftwalk.js 로 내보낸다.
# 실행: python3 tools/rift-walk.py [미리보기.png]      (Pillow · numpy 필요)
# 방법: 벽·수풀·바위는 무늬가 거칠고 길·강·본진 바닥은 매끈하다 → 밝기의 지역 표준편차(질감)로 가른다.
#   1) 질감 > TH 인 픽셀이 45% 넘는 칸(0.5% × 0.5%)은 벽   2) 본진 안쪽은 비운다(포탑·넥서스 그림)
#   3) 작은 벽 조각(식물·장식)은 지운다   4) 맵 바깥은 벽, 우물은 길   5) 출입구(FIX_OPEN) 수동 보정
#   6) 블루 우물에서 걸어서 닿지 않는 칸은 벽
import sys, os, numpy as np
from collections import deque
from PIL import Image, ImageFilter, ImageDraw
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
N, TH, MIN = 200, 9, 30
FIX_OPEN = [(63, 9, 68, 12.5), (87.5, 29, 91.5, 35), (69.5, 27.5, 74, 32.5), (32, 87.5, 37, 91.7), (9, 60, 13.5, 66.5),
            (10.8, 10, 16, 20.6), (78, 87.3, 89, 89.6), (83, 83.5, 89.3, 89.6), (85.5, 78.5, 89.3, 81.5)]   # 본진 출입구 · 탑/바텀 모서리 라인 폭 (x0, y0, x1, y1 — 맵 %)
FIX_WALL = []
im = Image.open(os.path.join(ROOT, 'assets/map/rift.webp')).convert('RGB')
a = np.asarray(im).astype(float); lum = a.mean(axis=2); H, W = lum.shape
bl = np.asarray(Image.fromarray(lum.astype('uint8')).filter(ImageFilter.BoxBlur(4))).astype(float)
tex = np.sqrt(np.asarray(Image.fromarray(np.clip((lum - bl) ** 2, 0, 255).astype('uint8')).filter(ImageFilter.BoxBlur(5))).astype(float))
ys = (np.arange(H) * N // H)[:, None].repeat(W, 1); xs = (np.arange(W) * N // W)[None, :].repeat(H, 0)
cnt = np.zeros((N, N)); tot = np.zeros((N, N)); np.add.at(cnt, (ys, xs), tex > TH); np.add.at(tot, (ys, xs), 1)
wall = cnt / tot > .45
def box(r): return slice(int(r[1] * 2), int(r[3] * 2)), slice(int(r[0] * 2), int(r[2] * 2))
wall[box((9, 66.5, 30, 91))] = False; wall[box((69, 9, 90.5, 29))] = False
def flood(mask, seeds):
    seen = np.zeros((N, N), bool); q = deque(seeds)
    for s in seeds: seen[s] = True
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            u, v = y + dy, x + dx
            if 0 <= u < N and 0 <= v < N and mask[u, v] and not seen[u, v]: seen[u, v] = True; q.append((u, v))
    return seen
done = np.zeros((N, N), bool)
for y in range(N):
    for x in range(N):
        if wall[y, x] and not done[y, x]:
            c = flood(wall, [(y, x)]); done |= c
            if c.sum() < MIN: wall[c] = False
for r in FIX_OPEN: wall[box(r)] = False
for r in FIX_WALL: wall[box(r)] = True
yy, xx = np.mgrid[0:N, 0:N]; px = (xx + .5) / 2; py = (yy + .5) / 2
wall |= (px < 8.6) | (px > 91.6) | (py < 8) | (py > 91.8)
wall &= ~((np.hypot(px - 7, py - 93) < 6.5) | (np.hypot(px - 92, py - 5) < 6.5))
wall = ~flood(~wall, [(186, 14)])
rows = [''.join('%x' % int(''.join('1' if v else '0' for v in row[i:i + 4]), 2) for i in range(0, N, 4)) for row in wall]
with open(os.path.join(ROOT, 'js/riftwalk.js'), 'w', encoding='utf8') as f:
    f.write('// 지형 격자 (tools/rift-walk.py 가 assets/map/rift.webp 에서 만든다). 칸 = 맵 0.5%, 1 = 벽. 한 줄 = 한 행(위→아래), 16진수 한 글자 = 4칸\n')
    f.write('const RIFT_WALK = { n: %d, rows: [\n%s\n] };\n' % (N, ',\n'.join("'%s'" % r for r in rows)))
print('walkable cells', int((~wall).sum()), 'of', N * N)
if len(sys.argv) > 1:
    big = im.resize((1500, 1419)).convert('RGBA'); ov = Image.new('RGBA', big.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for y in range(N):
        for x in range(N):
            if wall[y, x]: d.rectangle([x * 7.5, y * 7.095, x * 7.5 + 7.5, y * 7.095 + 7.095], fill=(255, 40, 40, 120))
    Image.alpha_composite(big, ov).convert('RGB').save(sys.argv[1])

"""A realistic rendering of the Kosel's stones, seen from a scaffolding: the wall runs from the lower left to the upper
right, the camera looking slightly up and to the right. Herodian ashlars with drafted margins and raised bosses, each
course set back a little from the one below, hyssop and caper plants in the joints, haze into the distance, a sliver
of sky at the top right. Rendered per pixel with numpy, then softened."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import math, random, sys
ROLLDEG = float(sys.argv[1]) if len(sys.argv) > 1 else -24

W, H = 900, 1950
SS = 1.5
w, h = int(W * SS), int(H * SS)
rng = np.random.default_rng(11)
random.seed(11)

# ---------- value noise ----------
def hash2(ix, iy, seed):
    n = (ix * 374761393 + iy * 668265263 + seed * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    n = n ^ (n >> 16)
    return (n & 0xFFFF) / 65535.0

def vnoise(x, y, seed=0):
    ix = np.floor(x).astype(np.int64); iy = np.floor(y).astype(np.int64)
    fx = x - ix; fy = y - iy
    ux = fx * fx * (3 - 2 * fx); uy = fy * fy * (3 - 2 * fy)
    a = hash2(ix, iy, seed); b = hash2(ix + 1, iy, seed)
    c = hash2(ix, iy + 1, seed); d = hash2(ix + 1, iy + 1, seed)
    return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy

def fbm(x, y, oct=5, seed=0, lac=2.03, gain=0.5):
    s = np.zeros_like(x); amp = 0.5; f = 1.0; tot = 0
    for o in range(oct):
        s += amp * vnoise(x * f, y * f, seed + o * 17); tot += amp
        amp *= gain; f *= lac
    return s / tot

# ---------- camera ----------
cam = np.array([0.0, 9.0, 2.6])            # on a scaffolding, 2.6 m from the wall, 9 m up
yaw, pitch = math.radians(62), math.radians(9)
ROLL = math.radians(ROLLDEG)
f = np.array([math.sin(yaw) * math.cos(pitch), math.sin(pitch), -math.cos(yaw) * math.cos(pitch)])
up0 = np.array([0, 1.0, 0])
r = np.cross(f, up0); r /= np.linalg.norm(r)
u = np.cross(r, f)
r, u = r * math.cos(ROLL) + u * math.sin(ROLL), -r * math.sin(ROLL) + u * math.cos(ROLL)
fovy = math.radians(78); ty = math.tan(fovy / 2); tx = ty * w / h
sx = (np.arange(w) + .5) / w * 2 - 1
sy = 1 - (np.arange(h) + .5) / h * 2
SX, SY = np.meshgrid(sx, sy)
D = f[None, None, :] + SX[..., None] * tx * r[None, None, :] + SY[..., None] * ty * u[None, None, :]
D /= np.linalg.norm(D, axis=2, keepdims=True)
dz = D[..., 2]
t = np.where(dz < -1e-4, -cam[2] / np.minimum(dz, -1e-4), 1e9)
X = cam[0] + t * D[..., 0]
Y = cam[1] + t * D[..., 1]
WALL_TOP = 21.0
wall = (dz < -1e-4) & (Y < WALL_TOP + 0.6 * vnoise(X * .7, np.zeros_like(X), 3)) & (t < 400)
X = np.where(wall, X, 0); Y = np.where(wall, Y, 0); t = np.where(wall, t, 400)

# ---------- courses and stones ----------
course_h = []
y = -3.0
while y < WALL_TOP + 2:
    hh = rng.uniform(0.95, 1.2) if y < 15 else rng.uniform(0.6, 0.8)  # smaller later stones near the top
    course_h.append((y, hh)); y += hh
cy0 = np.array([c[0] for c in course_h]); chh = np.array([c[1] for c in course_h])
ci = np.clip(np.searchsorted(cy0, Y, side='right') - 1, 0, len(cy0) - 1)
ylo = cy0[ci]; yh = chh[ci]
v = (Y - ylo)                                  # height inside course

# stone joints per course
joints = []
for k, (yy, hh) in enumerate(course_h):
    xs = [-10 + rng.uniform(0, 2)]
    big = yy < 15
    while xs[-1] < 420:
        L = rng.uniform(1.6, 4.4) if big else rng.uniform(0.8, 1.6)
        if big and rng.random() < .08: L = rng.uniform(5, 7.5)       # an occasional giant
        xs.append(xs[-1] + L)
    joints.append(np.array(xs))
x_lo = np.zeros_like(X); x_hi = np.zeros_like(X); sid = np.zeros(X.shape, np.int64)
for k in range(len(course_h)):
    m = ci == k
    if not m.any(): continue
    js = joints[k]
    j = np.clip(np.searchsorted(js, X[m], side='right') - 1, 0, len(js) - 2)
    x_lo[m] = js[j]; x_hi[m] = js[j + 1]; sid[m] = k * 1000 + j
# jitter the joints a little so the edges aren't ruled lines
jit = (fbm(X * 3, Y * 3, 3, 40) - .5) * .05
dx = np.minimum(X - x_lo, x_hi - X) + jit
dy = np.minimum(v, yh - v) + jit
d = np.minimum(dx, dy)                           # distance to the stone's edge (m)

def height(d, X, Y, big):
    marg = np.where(big, 0.10, 0.06)
    joint = np.clip(d / 0.018, 0, 1)
    h = -0.05 * (1 - joint) ** 2                # the joint
    bev = np.clip((d - marg) / 0.07, 0, 1)
    boss = bev * bev * (3 - 2 * bev) * 0.022     # the raised boss
    rough = (fbm(X * 6, Y * 6, 6, 7) - .5) * 0.022 * (0.4 + bev)
    pits = np.clip(fbm(X * 14, Y * 14, 3, 9) - .74, 0, 1) * -0.05
    hollows = np.clip(fbm(X * 1.1, Y * 1.1, 5, 13) - .6, 0, 1) * -0.22
    chips = np.clip(fbm(X * 3, Y * 3, 4, 21) - .62, 0, 1) * -0.16 * (1 - bev * .7)   # worn, broken edges
    return h + boss + rough + pits + chips + hollows

big = Y < 15
Hc = height(d, X, Y, big)
e = 0.006
Hx = height(np.minimum(np.minimum(X + e - x_lo, x_hi - X - e) + jit, dy), X + e, Y, big)
Hy = height(np.minimum(dx, np.minimum(v + e, yh - v - e) + jit), X, Y + e, big)
nx = -(Hx - Hc) / e; ny = -(Hy - Hc) / e
N = np.stack([nx * 1.1, ny * 1.1, np.ones_like(nx)], -1)
N /= np.linalg.norm(N, axis=2, keepdims=True)

L = np.array([-0.55, 0.38, 0.74]); L /= np.linalg.norm(L)
lam = np.clip((N * L).sum(-1), 0, 1)
V = -D; Hh = V + L; Hh /= np.linalg.norm(Hh, axis=2, keepdims=True)
spec = np.clip((N * Hh).sum(-1), 0, 1) ** 24 * .08

# ---------- color ----------
pal = np.array([[238, 222, 190], [232, 212, 174], [226, 211, 184], [236, 216, 180], [228, 202, 160], [222, 208, 184], [232, 204, 158]]) / 255
pick = hash2(sid, sid * 7 + 3, 5)
base = pal[(pick * len(pal)).astype(int) % len(pal)]
tone = 0.95 + 0.1 * hash2(sid, sid + 11, 9)
col = base * tone[..., None]
mott = fbm(X * 1.3, Y * 1.3, 5, 31)
col *= (0.86 + 0.28 * mott)[..., None]
# grey-brown weathering and dark water streaks running down from each joint
streak = np.clip(fbm(X * 3.2, Y * .3, 4, 51) - .58, 0, 1) * np.clip(1 - v / yh, 0, 1) * 1.8
col *= (1 - 0.18 * streak)[..., None]
grain = fbm(X * 45, Y * 45, 3, 81)
speck = np.clip(fbm(X * 18, Y * 18, 3, 83) - .62, 0, 1) * 2.5
col *= (0.93 + 0.14 * grain)[..., None]
col = col * (1 - speck[..., None] * .25) + np.array([.62, .5, .36]) * speck[..., None] * .25
lichen = np.clip(fbm(X * 2.5, Y * 2.5, 4, 61) - .62, 0, 1) * 2.2
col = col * (1 - lichen[..., None] * .25) + np.array([.6, .55, .42]) * lichen[..., None] * .25
# the set-back ledge at the top of each course catches the light
ledge = np.exp(-((yh - v) / 0.02) ** 2) * (d > 0.02)
shade = 0.34 + 0.78 * lam
shade = shade - np.clip(-Hc, 0, .12) * 3.2            # joints, hollows and pits darker (ambient occlusion)
img = col * shade[..., None] + spec[..., None]
img *= np.array([1.05, 1.0, .9])                    # warm sun

# ---------- haze into the distance ----------
haze = np.array([236, 226, 206]) / 255
fog = 1 - np.exp(-np.maximum(t - 4, 0) / 55)
img = img * (1 - fog[..., None]) + haze * fog[..., None]

# ---------- sky ----------
skyc_top = np.array([166, 190, 206]) / 255; skyc_low = np.array([240, 230, 210]) / 255
g = np.clip((SY + 1) / 2, 0, 1)[..., None]
sky = skyc_low * (1 - g) + skyc_top * g
cl = fbm(SX * 3 + 5, SY * 9, 5, 71)
sky = sky * (1 - np.clip(cl - .55, 0, 1)[..., None] * .8) + np.clip(cl - .55, 0, 1)[..., None] * .8 * np.array([.98, .96, .93])
img = np.where(wall[..., None], img, sky)
img = np.clip(img, 0, 1)
out = Image.fromarray((img * 255).astype(np.uint8))

# ---------- plants in the joints ----------
def proj(P):
    q = P - cam
    zc = q @ f
    if zc <= 0.3: return None
    return ((q @ r) / (zc * tx) + 1) / 2 * w, (1 - (q @ u) / (zc * ty)) / 2 * h, zc

layer = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(layer)
shadow = Image.new('RGBA', (w, h), (0, 0, 0, 0)); ds = ImageDraw.Draw(shadow)
greens = [(96, 108, 62), (112, 120, 70), (84, 94, 56), (128, 124, 78), (146, 122, 80), (110, 96, 62), (124, 134, 84), (156, 136, 92)]
spots = []
for k, (yy, hh) in enumerate(course_h):
    if yy < 2 or yy > WALL_TOP - .5: continue
    for jx in joints[k]:
        if 0.5 < jx < 120 and random.random() < (.11 if jx < 25 else .04):
            spots.append((jx, yy + random.uniform(-.05, hh * .5)))
    if random.random() < .35:
        spots.append((random.uniform(1, 40), yy))
drawn = 0
for (px, py) in spots:
    c = proj(np.array([px, py, 0.05]))
    if not c: continue
    x0, y0, zc = c
    if not (-50 < x0 < w + 50 and -50 < y0 < h + 50): continue
    drawn += 1
    sc = (h / (2 * ty)) / zc * random.uniform(.7, 1.4)   # pixels per metre at that distance
    n = random.randint(40, 90)
    hanging = random.random() < .45
    for i in range(n):
        ang = random.uniform(-math.pi, 0) if not hanging else random.uniform(-.3, math.pi + .3)
        rad = random.random() ** .7 * sc * .28 * (1.5 if hanging else 1)
        lx = x0 + math.cos(ang) * rad * 1.2; ly = y0 + math.sin(ang) * rad * (1.5 if hanging else .9)
        lw = sc * random.uniform(.018, .034); lh = lw * random.uniform(.55, .9)
        gc = random.choice(greens); tone = random.uniform(.75, 1.15)
        cc = tuple(int(min(255, ch * tone)) for ch in gc) + (240,)
        a = random.uniform(0, math.pi)                 # a pointed leaf, turned any way
        ca, sa = math.cos(a), math.sin(a)
        pts = []
        for k2 in range(10):
            th = k2 / 10 * 2 * math.pi
            px_, py_ = math.cos(th) * lw * 1.4, math.sin(th) * lh * .6 * (1 - .35 * abs(math.cos(th)))
            pts.append((lx + px_ * ca - py_ * sa, ly + px_ * sa + py_ * ca))
        sh = [(p[0] + sc * .01, p[1] + sc * .018) for p in pts]
        ds.polygon(sh, fill=(40, 30, 20, 80))
        dr.polygon(pts, fill=cc)
        dr.line([pts[0], pts[5]], fill=tuple(min(255, int(ch * 1.2)) for ch in cc[:3]) + (120,), width=1)
    for i in range(random.randint(2, 6)):   # a few thin stems
        ang = random.uniform(-2.6, -.5) if not hanging else random.uniform(.6, 2.5)
        ln = sc * random.uniform(.18, .42)
        dr.line([x0, y0, x0 + math.cos(ang) * ln, y0 + math.sin(ang) * ln], fill=(110, 92, 62, 200), width=max(1, int(sc * .006)))
shadow = shadow.filter(ImageFilter.GaussianBlur(3 * SS))
print('layer bbox', layer.getbbox())
out = out.convert('RGBA'); out.alpha_composite(shadow); out.alpha_composite(layer)
out = out.convert('RGB').resize((W, H), Image.LANCZOS)

# ---------- soften: a touch of blur, more in the far distance (depth) ----------
far = Image.fromarray((np.clip(fog, 0, 1) * 255).astype(np.uint8)).resize((W, H)).filter(ImageFilter.GaussianBlur(8))
soft = out.filter(ImageFilter.GaussianBlur(2.2))
out = Image.composite(soft, out.filter(ImageFilter.GaussianBlur(.5)), far)
# a gentle warm vignette
vg = np.ones((H, W, 3))
yy, xx = np.mgrid[0:H, 0:W]
vv = 1 - 0.12 * (((xx / W - .45) ** 2 + (yy / H - .55) ** 2 * .6) * 2.2)
arr = np.asarray(out).astype(float) * vv[..., None]
out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
out.save('/home/claude/chavrusa-check/kosel.jpg', quality=82, optimize=True, progressive=True)
out.resize((W // 3, H // 3)).save('/home/claude/chavrusa-check/kosel-small.png')
print('done', len(spots), drawn)

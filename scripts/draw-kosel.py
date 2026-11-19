"""The Kosel as a drawing: a gentle angle (the wall receding a little to the right, looking a little up), stones
drawn with ink outlines and washes, drafted margins around raised faces, hatching in the shadows, sprays of hyssop
and caper in the joints, a soft sky at the top. Written as SVG, then rendered to a picture."""
import math, random, subprocess
random.seed(5)
VW, VH = 420, 910

# ---- a gentle perspective: wall plane (x along the wall, y up) seen from a little left, a little below ----
cam = (0.0, 3.0, 12.0)
yaw, pitch = math.radians(-14), math.radians(7)
def rot(v):
    x, y, z = v
    # yaw about y, then pitch about x
    cx, sx_ = math.cos(-yaw), math.sin(-yaw)
    x, z = x * cx + z * sx_, -x * sx_ + z * cx
    cp, sp = math.cos(-pitch), math.sin(-pitch)
    y, z = y * cp - z * sp, y * sp + z * cp
    return x, y, z
F = 520.0
def P(x, y):
    q = (x - cam[0], y - cam[1], 0 - cam[2])
    X, Y, Z = rot(q)
    Z = -Z
    return (VW * .42 + F * X / Z, VH * .62 - F * Y / Z)

def J(p, a=0.9):
    return (p[0] + random.uniform(-a, a), p[1] + random.uniform(-a, a))

def path(pts, close=True):
    s = 'M' + ' L'.join(f'{p[0]:.1f} {p[1]:.1f}' for p in pts)
    return s + (' Z' if close else '')

def wobbly(a, b, n=4, amp=.8):
    """points along a hand-drawn edge from a to b"""
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(J((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), amp if 0 < i < n else .3))
    return out

def quad(x0, y0, x1, y1, n=4, amp=.8):
    A, B, C, D = P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)
    return wobbly(A, B, n, amp)[:-1] + wobbly(B, C, 2, amp)[:-1] + wobbly(C, D, n, amp)[:-1] + wobbly(D, A, 2, amp)[:-1]

out = []
out.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VW} {VH}" width="{VW}" height="{VH}">')
out.append("""<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9cfdc"/><stop offset=".6" stop-color="#e4e3d6"/><stop offset="1" stop-color="#f3e6cc"/></linearGradient>
<filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="4" result="n"/>
<feColorMatrix in="n" values="0 0 0 0 .45  0 0 0 0 .38  0 0 0 0 .28  0 0 0 .09 0"/><feComposite in2="SourceGraphic" operator="in"/><feBlend in="SourceGraphic" mode="multiply"/></filter>
<filter id="wash" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="9" result="t"/>
<feDisplacementMap in="SourceGraphic" in2="t" scale="3.5" xChannelSelector="R" yChannelSelector="G"/></filter>
<filter id="blot"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="4" seed="12"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .42  0 0 0 0 .3  0 0 0 -2.2 1.25"/></filter>
GRADS
<filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
</defs>""")
out.append(f'<rect width="{VW}" height="{VH}" fill="url(#sky)"/>')
# clouds, drawn softly
for cx, cy, rx in ((90, 70, 80), (300, 120, 95), (180, 160, 60), (360, 40, 50)):
    out.append(f'<g opacity=".75" filter="url(#soft)"><ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{rx*.18:.0f}" fill="#fbf8f0"/><ellipse cx="{cx+rx*.3:.0f}" cy="{cy-8}" rx="{rx*.55:.0f}" ry="{rx*.2:.0f}" fill="#fdfbf5"/></g>')
# birds
for bx, by, s in ((250, 205, 1), (272, 192, .8), (120, 230, .7)):
    out.append(f'<path d="M{bx} {by} q{5*s:.1f} {-5*s:.1f} {10*s:.1f} 0 q{5*s:.1f} {-5*s:.1f} {10*s:.1f} 0" fill="none" stroke="#6f6658" stroke-width="1.1" stroke-linecap="round"/>')

# ---- courses ----
courses = []
y = -8.0
WALL_TOP = 17.0
while y < WALL_TOP:
    hh = random.uniform(1.0, 1.25) if y < 10 else random.uniform(.6, .85)
    courses.append((y, min(hh, WALL_TOP - y)))
    y += hh
X0, X1 = -30, 70
inks = '#7a6248'
def mix(hexc, other, t):
    a = [int(hexc[i:i+2], 16) for i in (1, 3, 5)]; b = [int(other[i:i+2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(x + (y - x) * t):02x}' for x, y in zip(a, b))
fills = ['#e8d7b4', '#e3cfa6', '#ddd0b5', '#ead9b6', '#dcc49a', '#e6d3ae', '#d8cab0', '#e9d2a2']
plants = []
wall_g = ['<g filter="url(#wash)">']
hatch_g = ['<g stroke="#8a7254" stroke-width=".55" stroke-linecap="round" opacity=".28">']
for k, (yy, hh) in enumerate(courses):
    big = yy < 10
    x = X0 + random.uniform(0, 2.5)
    setback = k * .02
    while x < X1:
        L = random.uniform(2.0, 4.6) if big else random.uniform(.9, 1.7)
        if big and random.random() < .07: L = random.uniform(5.5, 7.5)
        x2 = x + L
        A = P(x, yy); C = P(x2, yy + hh)
        if C[0] < -40 or A[0] > VW + 40 or C[1] > VH + 40 and A[1] > VH + 40:
            x = x2; continue
        fi = random.randrange(len(fills)); fc = fills[fi]
        # the stone and its drafted margin
        wall_g.append(f'<path d="{path(quad(x, yy, x2, yy + hh, 5, .9))}" fill="{mix(fc, '#8a6e4c', .22)}" stroke="{inks}" stroke-width="1.3" stroke-linejoin="round"/>')
        m = .11 if big else .07
        if L > 2 * m + .2:
            boss = quad(x + m, yy + m, x2 - m, yy + hh - m, 5, .7)
            lighter = fc
            wall_g.append(f'<path d="{path(boss)}" fill="url(#g{fi})" stroke="{inks}" stroke-width=".6" stroke-opacity=".6"/>')
            # shadow under the boss (light from the upper left): along its lower and right edge
            a, b, c = P(x + m, yy + m), P(x2 - m, yy + m), P(x2 - m, yy + hh - m)
            wall_g.append(f'<path d="M{a[0]:.1f} {a[1]+.8:.1f} L{b[0]:.1f} {b[1]+.8:.1f} L{c[0]+.8:.1f} {c[1]:.1f}" fill="none" stroke="#9c8462" stroke-width="1.6" stroke-opacity=".45"/>')
        # weathering: a few soft patches and chips
        if random.random() < .55:
            px = random.uniform(x + .3, x2 - .3); py = random.uniform(yy + .2, yy + hh - .2)
            q = P(px, py); sz = 520 / max(6, 12 + px * .25) * random.uniform(.25, .7)
            wall_g.append(f'<ellipse cx="{q[0]:.1f}" cy="{q[1]:.1f}" rx="{sz:.1f}" ry="{sz*.6:.1f}" fill="#b89f78" opacity=".16"/>')
        if random.random() < .35:
            px = random.choice([x + .05, x2 - .05]); py = random.uniform(yy, yy + hh)
            q = P(px, py); sz = random.uniform(2, 5)
            wall_g.append(f'<path d="M{q[0]:.1f} {q[1]:.1f} l{sz:.1f} {sz*.4:.1f} l{-sz*.3:.1f} {sz:.1f} z" fill="#a88d67" opacity=".5"/>')
        # hatching in the lower part of some stones, like pen shading
        if random.random() < .45:
            for i in range(random.randint(4, 9)):
                hx = random.uniform(x + .2, x2 - .4); hy = yy + random.uniform(.05, .3)
                a = P(hx, hy); b = P(hx + random.uniform(.05, .12), hy + .22)
                hatch_g.append(f'<path d="M{a[0]:.1f} {a[1]:.1f} L{b[0]:.1f} {b[1]:.1f}"/>')
        # dark water streaks running down from a joint
        if random.random() < .18:
            sx_ = random.uniform(x + .3, x2 - .3)
            a = P(sx_, yy + hh); b = P(sx_ + .05, yy + hh * random.uniform(.2, .6))
            wall_g.append(f'<path d="M{a[0]:.1f} {a[1]:.1f} L{b[0]:.1f} {b[1]:.1f}" stroke="#8d7a5e" stroke-width="{random.uniform(2,4):.1f}" stroke-linecap="round" opacity=".18"/>')
        if -4 < yy < WALL_TOP - .4 and random.random() < .09:
            plants.append((x, yy + random.uniform(0, hh * .6)))
        x = x2
wall_g.append('</g>')
hatch_g.append('</g>')
out += wall_g + hatch_g
# the wall's broken top line against the sky
top = [P(-12, WALL_TOP)]
xx = -12
while xx < X1:
    xx += random.uniform(.6, 1.4)
    top.append(J(P(xx, WALL_TOP + random.choice([0, 0, .15, -.1])), .4))
out.append(f'<path d="{path(top, False)}" fill="none" stroke="{inks}" stroke-width="1.4"/>')
for i in range(10):
    plants.append((random.uniform(-8, 40), WALL_TOP - random.uniform(0, .3)))

# ---- plants: drawn sprays with outlined leaves ----
leafc = ['#7f8a52', '#8f9660', '#6f7a46', '#9b8f5c', '#a0865a', '#86905a', '#a38a5e', '#8c7c50', '#b09668']
def leaf(x, y, ang, L, col):
    w = L * .38
    ca, sa = math.cos(ang), math.sin(ang)
    def T(px, py): return (x + px * ca - py * sa, y + px * sa + py * ca)
    p0, c1, p1, c2 = T(0, 0), T(L * .5, -w), T(L, 0), T(L * .5, w)
    return (f'<path d="M{p0[0]:.1f} {p0[1]:.1f} Q{c1[0]:.1f} {c1[1]:.1f} {p1[0]:.1f} {p1[1]:.1f} Q{c2[0]:.1f} {c2[1]:.1f} {p0[0]:.1f} {p0[1]:.1f}Z" '
            f'fill="{col}" stroke="#4f5634" stroke-width=".5"/><path d="M{p0[0]:.1f} {p0[1]:.1f} L{T(L*.85,0)[0]:.1f} {T(L*.85,0)[1]:.1f}" stroke="#c9c58e" stroke-width=".35" opacity=".7"/>')
for (px, py) in plants:
    q = P(px, py)
    if not (-20 < q[0] < VW + 20 and -20 < q[1] < VH + 20): continue
    sc = 520 / max(6, 12 + px * .25) * 1.75
    hanging = random.random() < .45
    g = ['<g>']
    for s in range(random.randint(6, 12)):
        ang = random.uniform(-2.7, -.4) if not hanging else random.uniform(.5, 2.6)
        ln = sc * random.uniform(.25, .6)
        bend = random.uniform(-.4, .4)
        ex, ey = q[0] + math.cos(ang) * ln, q[1] + math.sin(ang) * ln
        mx, my = q[0] + math.cos(ang + bend) * ln * .55, q[1] + math.sin(ang + bend) * ln * .55
        g.append(f'<path d="M{q[0]:.1f} {q[1]:.1f} Q{mx:.1f} {my:.1f} {ex:.1f} {ey:.1f}" fill="none" stroke="#6b5c40" stroke-width="{max(.6, sc*.012):.2f}"/>')
        for i in range(random.randint(8, 15)):
            t = random.uniform(.15, 1)
            bx = (1 - t) ** 2 * q[0] + 2 * (1 - t) * t * mx + t * t * ex
            by = (1 - t) ** 2 * q[1] + 2 * (1 - t) * t * my + t * t * ey
            la = ang + random.choice([-1, 1]) * random.uniform(.5, 1.2)
            g.append(leaf(bx, by, la, sc * random.uniform(.05, .1), random.choice(leafc)))
    g.append('</g>')
    out += g
# the paper grain over everything
out.append(f'<rect width="{VW}" height="{VH}" fill="#f3e9d4" filter="url(#paper)" opacity=".55" style="mix-blend-mode:multiply"/>')
grads = ''.join(f'<linearGradient id="g{i}" x1="0" y1="0" x2=".25" y2="1"><stop offset="0" stop-color="{mix(c, "#fffaf0", .35)}"/><stop offset=".55" stop-color="{c}"/><stop offset="1" stop-color="{mix(c, "#9a7c56", .18)}"/></linearGradient>' for i, c in enumerate(fills))
out[1] = out[1].replace('GRADS', grads)
out.insert(len(out) - 1, f'<rect width="{VW}" height="{VH}" filter="url(#blot)" opacity=".22" style="mix-blend-mode:multiply"/>')
out.append('</svg>')
open('/home/claude/chavrusa-check/kosel-draw.svg', 'w').write('\n'.join(out))
subprocess.run(['rsvg-convert', '-w', '1080', '/home/claude/chavrusa-check/kosel-draw.svg', '-o', '/home/claude/chavrusa-check/kosel-draw.png'], check=True)
print('ok', len(plants))

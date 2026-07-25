from PIL import Image, ImageDraw
import os, math

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(OUT, exist_ok=True)


def grad(size, c0=(13, 148, 136), c1=(29, 78, 216)):
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            tt = (x / size * 0.55 + y / size * 0.45)
            px[x, y] = tuple(int(c0[i] + (c1[i] - c0[i]) * tt) for i in range(3))
    return img


def draw_mark(img, pad_frac=0.16, stroke_frac=0.075):
    s = img.size[0]
    d = ImageDraw.Draw(img)
    w = max(2, int(s * stroke_frac))
    # damped oscillation curve (the model's signature dynamic)
    x0, x1 = s * pad_frac, s * (1 - pad_frac)
    ymid = s * 0.60
    pts = []
    n = 1400
    for i in range(n + 1):
        u = i / n
        x = x0 + (x1 - x0) * u
        y = ymid - math.sin(u * math.pi * 3.1) * (s * 0.26) * math.exp(-1.9 * u)
        pts.append((x, y))
    # round brush: overlapping discs give a smooth, artefact-free stroke
    r = w / 2.0
    for (x, y) in pts:
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255))
    # sensor dot
    r = s * 0.075
    cx, cy = s * 0.755, s * 0.295
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255))
    return img


def rounded(img, radius_frac=0.22):
    s = img.size[0]
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius_frac), fill=255)
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def make(size, maskable=False, square=False):
    ss = size * 4
    base = grad(ss)
    if maskable:
        # keep the mark inside the 80% safe zone
        inner = Image.new('RGB', (ss, ss))
        inner.paste(base, (0, 0))
        draw_mark(inner, pad_frac=0.26, stroke_frac=0.062)
        img = inner.convert('RGBA')
    else:
        draw_mark(base)
        img = base.convert('RGBA') if square else rounded(base)
    return img.resize((size, size), Image.LANCZOS)


for s in (192, 512):
    make(s).save(os.path.join(OUT, f'icon-{s}.png'))
    make(s, maskable=True).save(os.path.join(OUT, f'maskable-{s}.png'))
make(180, square=True).save(os.path.join(OUT, 'apple-touch-icon.png'))
make(32).save(os.path.join(OUT, 'favicon-32.png'))
print('icons written to', os.path.abspath(OUT))

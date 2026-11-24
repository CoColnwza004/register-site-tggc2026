"""Remove the white background from the TGGC 2026 logo (JPEG) and export PNGs.

White connected to the image border is removed, plus enclosed white pockets
thicker than ~12px; thin white strokes (globe grid, leaf vein) stay. Edge pixels get a soft alpha (de-matted
from white) so the mark sits cleanly on dark or light backgrounds.

Usage: python3 scripts/cut-logo.py <logo.jpg> <out-dir>
"""
import sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
h, w, _ = im.shape
mn = im.min(axis=2)

near_white = mn > 232
reached = np.zeros_like(near_white)
reached[0, :] = near_white[0, :]; reached[-1, :] = near_white[-1, :]
reached[:, 0] = near_white[:, 0]; reached[:, -1] = near_white[:, -1]

def dilate(m):
    d = m.copy()
    d[1:, :] |= m[:-1, :]; d[:-1, :] |= m[1:, :]
    d[:, 1:] |= m[:, :-1]; d[:, :-1] |= m[:, 1:]
    return d

while True:
    nxt = dilate(reached) & near_white
    if (nxt == reached).all():
        break
    reached = nxt

# also remove enclosed white pockets that are thick (blob-like); thin white
# strokes such as the globe grid and the leaf vein do not survive erosion
def erode(m):
    e = m.copy()
    e[1:, :] &= m[:-1, :]; e[:-1, :] &= m[1:, :]
    e[:, 1:] &= m[:, :-1]; e[:, :-1] &= m[:, 1:]
    return e

core = near_white.copy()
for _ in range(6):
    core = erode(core)
pocket = core & ~reached
while True:
    nxt = dilate(pocket) & near_white
    if (nxt == pocket).all():
        break
    pocket = nxt
reached |= pocket

# soft edge: a 3px band around the removed background
band = reached.copy()
for _ in range(3):
    band = dilate(band)
band &= ~reached

alpha = np.ones((h, w), np.float32)
alpha[reached] = 0.0
# how far a band pixel is from white -> its coverage
cov = np.clip((255.0 - mn) / (255.0 - 150.0), 0, 1)
alpha[band] = cov[band]

# un-premultiply from white so edges don't keep a white halo
rgb = im.copy()
a3 = np.maximum(alpha[..., None], 1e-3)
rgb = np.where(band[..., None], (im - (1 - a3) * 255.0) / a3, im)
rgb = np.clip(rgb, 0, 255)

rgba = np.dstack([rgb, alpha * 255.0]).astype(np.uint8)
full = Image.fromarray(rgba, "RGBA")

def trim(img, pad=8):
    bbox = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    x0, y0, x1, y1 = bbox
    return img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))

logo = trim(full)
logo.save(f"{out}/logo-full.png", optimize=True)

# mark only: everything left of the wordmark
mark = trim(full.crop((0, 0, 548, h)))
side = max(mark.size)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2))
sq = sq.resize((512, 512), Image.LANCZOS)
sq.save(f"{out}/logo-mark.png", optimize=True)
print("full", logo.size, "mark", sq.size)

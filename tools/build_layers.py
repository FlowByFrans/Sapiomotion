"""Split the mark-bloom render into depth layers for 2.5D animation.

leaves : the blue foliage (back), with the area hidden behind the mark and
         flowers inpainted so the layers can separate during motion
front  : the glass mark + white peonies

Both are written premultiplied-ready RGBA PNGs to assets/gen/.
"""
import os
import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'gen')
os.makedirs(OUT, exist_ok=True)

im = np.array(Image.open(os.path.join(ROOT, 'assets', 'mark-bloom.webp')).convert('RGBA'))
rgb, a = im[..., :3], im[..., 3]
hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
h, s, v = (hsv[..., i].astype(int) for i in range(3))

opaque = a > 8
leaf = opaque & (((h >= 95) & (h <= 132) & (s > 55)) | (v < 70))
leaf = cv2.morphologyEx(leaf.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)

# front = everything opaque that isn't foliage, cleaned up
front = opaque & ~leaf
front = cv2.morphologyEx(front.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(front)
keep = np.zeros_like(front)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] > 1500:
        keep[lab == i] = 1
front = keep.astype(bool)

# soft matte for the front layer
fm = cv2.GaussianBlur(front.astype(np.float32), (0, 0), 1.2)
fm = np.clip((fm - 0.15) / 0.7, 0, 1) * (a / 255.0)

# leaves: the original image with the region behind the front layer filled
# by a normalized blur of the foliage alone (pull-push fill), so the two
# layers recombine exactly when aligned and separate cleanly in motion
cover = cv2.morphologyEx((leaf | front).astype(np.uint8), cv2.MORPH_CLOSE,
                         cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61))).astype(bool)
hole = cv2.dilate(front.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool) & cover
w = (leaf & ~hole).astype(np.float32)
src = rgb.astype(np.float32) * w[..., None]
fill = np.broadcast_to(np.median(rgb[leaf], 0).astype(np.float32), src.shape).copy()
for sig in (60, 25, 10):
    num = cv2.GaussianBlur(src, (0, 0), sig)
    den = cv2.GaussianBlur(w, (0, 0), sig)[..., None]
    est = num / np.maximum(den, 1e-4)
    fill = np.where(den > (0.02 if sig == 60 else 0.05), est, fill)
fill *= 0.55  # shadowed foliage behind the flowers
hm = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 2.0)[..., None]
filled = (rgb * (1 - hm) + fill * hm).clip(0, 255).astype(np.uint8)
leaf_alpha = np.maximum(a, (hole * 255).astype(np.uint8))

# leaves alone (hole transparent) + the hole fill as its own layer, so the
# foliage can unfurl around an empty, glowing core before the mark lands
hole_a = (hm[..., 0] * 255).astype(np.uint8)
leaves_only_a = (a.astype(np.float32) * (1 - hm[..., 0])).astype(np.uint8)
Image.fromarray(np.dstack([rgb, leaves_only_a])).save(os.path.join(OUT, 'bloom_leaves.png'))
Image.fromarray(np.dstack([fill.clip(0, 255).astype(np.uint8), np.maximum(hole_a, 0)])).save(os.path.join(OUT, 'bloom_fill.png'))
Image.fromarray(np.dstack([rgb, (fm * 255).astype(np.uint8)])).save(os.path.join(OUT, 'bloom_front.png'))

prev = Image.new('RGBA', (im.shape[1] * 2, im.shape[0]), (25, 25, 30, 255))
prev.alpha_composite(Image.open(os.path.join(OUT, 'bloom_fill.png')), (0, 0))
prev.alpha_composite(Image.open(os.path.join(OUT, 'bloom_leaves.png')), (0, 0))
prev.alpha_composite(Image.open(os.path.join(OUT, 'bloom_front.png')), (im.shape[1], 0))
prev.resize((im.shape[1], im.shape[0] // 2)).save(os.path.join(OUT, 'bloom_layers_preview.png'))
print('ok')

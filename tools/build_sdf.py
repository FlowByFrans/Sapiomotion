"""Build a multi-channel signed distance field for the SRT wordmark.

The supplied wordmark is only 404x128, so it can't be scaled to fill a 1080p
frame as a bitmap. We upsample the alpha, threshold it into a clean mask,
compute a true signed distance per letter (S, R, T) plus the full word, and
store it as float16 so the shader can render razor-sharp edges, outlines and
glows at any size.

Output: assets/gen/srt_sdf.bin  (RGBA float16, row-major, top row first)
        assets/gen/srt_sdf.json (dimensions + metric info)
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'srt-wordmark.png')
OUT = os.path.join(ROOT, 'assets', 'gen')
os.makedirs(OUT, exist_ok=True)

UP = 8          # supersample factor used for the distance computation
STORE = 4       # final texture scale relative to the source
PAD = 24        # padding (source px) around the word so glows have room

src = Image.open(SRC).convert('RGBA')
w0, h0 = src.size
alpha = np.array(src)[..., 3].astype(np.float32) / 255.0

# pad then upsample with Lanczos; the smooth logo survives this cleanly
padded = np.pad(alpha, PAD)
big = Image.fromarray((padded * 255).astype(np.uint8)).resize(
    ((w0 + 2 * PAD) * UP, (h0 + 2 * PAD) * UP), Image.LANCZOS)
big = np.array(big).astype(np.float32) / 255.0
big = ndimage.gaussian_filter(big, UP * 0.35)
mask = big > 0.5

# letter split from connected components of the source alpha, ordered by x
lab, n = ndimage.label(mask)
objs = ndimage.find_objects(lab)
order = sorted(range(n), key=lambda i: objs[i][1].start)
assert n == 3, f'expected 3 letters, got {n}'

def sdf(m):
    inside = ndimage.distance_transform_edt(m)
    outside = ndimage.distance_transform_edt(~m)
    return (outside - inside) / UP  # in source pixels, negative inside

chans = []
for i in order:
    chans.append(sdf(lab == (i + 1)))
chans.append(sdf(mask))
field = np.stack(chans, -1)

# downsample to storage resolution (block mean keeps distances accurate)
f = UP // STORE
H, W = field.shape[:2]
field = field.reshape(H // f, f, W // f, f, 4).mean((1, 3))
field.astype(np.float16).tofile(os.path.join(OUT, 'srt_sdf.bin'))

boxes = []
for i in order:
    ys, xs = objs[i]
    boxes.append([xs.start / UP - PAD, ys.start / UP - PAD, xs.stop / UP - PAD, ys.stop / UP - PAD])

meta = {
    'width': field.shape[1], 'height': field.shape[0],
    'pad': PAD, 'srcWidth': w0, 'srcHeight': h0,
    'unit': 'source pixels', 'letters': boxes,
}
json.dump(meta, open(os.path.join(OUT, 'srt_sdf.json'), 'w'), indent=1)
print(meta)

# preview for sanity
prev = np.clip(0.5 - field[..., 3] * STORE, 0, 1)
Image.fromarray((prev * 255).astype(np.uint8)).save(os.path.join(OUT, 'srt_preview.png'))

"""Tileable smooth noise texture (256x256 RGBA8) used by the shaders for
domain warping, ray patterns and organic reveal edges. Each channel is an
independent field at a different scale."""
import os
import numpy as np
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'gen')
os.makedirs(OUT, exist_ok=True)

N = 256
rs = np.random.RandomState(7)
chans = []
for sigma in (10, 10, 4, 22):
    f = ndimage.gaussian_filter(rs.rand(N, N), sigma, mode='wrap')
    f = (f - f.mean()) / (f.std() * 4.0) + 0.5   # ~ +-2 sigma -> 0..1
    chans.append(np.clip(f, 0, 1))
tex = (np.stack(chans, -1) * 255).round().astype(np.uint8)
tex.tofile(os.path.join(OUT, 'noise.bin'))
print('noise', tex.shape, tex.mean((0, 1)))

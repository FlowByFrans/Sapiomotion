"""Spectrogram + loudness strip of out/audio.wav with cue markers, for review."""
import os, re, wave, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import signal
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
w = wave.open(os.path.join(ROOT, 'out/audio.wav'))
sr = w.getframerate()
x = np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, 2).astype(np.float32) / 32768
m = x.mean(1)
f, t, S = signal.stft(m, sr, nperseg=2048, noverlap=2048 - 240)
S = 20 * np.log10(np.abs(S) + 1e-7)
# log-frequency axis 30 Hz .. 20 kHz
Wd, Hs, He = 1500, 360, 120
fl = np.geomspace(30, 20000, Hs)
img = np.zeros((Hs, len(t)))
for i, fq in enumerate(fl):
    img[Hs - 1 - i] = S[np.argmin(abs(f - fq))]
img = np.clip((img + 90) / 80, 0, 1)
im = Image.fromarray((np.stack([img ** 1.5, img ** 0.8, img ** 0.5], -1) * 255).astype(np.uint8)).resize((Wd, Hs))
canvas = Image.new('RGB', (Wd, Hs + He + 20), (10, 10, 14))
canvas.paste(im, (0, 0))
d = ImageDraw.Draw(canvas)
# loudness (short-term RMS dB, L and R)
hop = sr // 200
for c, col in ((0, (255, 120, 120)), (1, (120, 200, 255))):
    r = np.sqrt(np.convolve(x[:, c] ** 2, np.ones(hop * 4) / (hop * 4), 'same'))[::hop]
    db = 20 * np.log10(r + 1e-6)
    pts = [(i / len(db) * Wd, Hs + 10 + (1 - np.clip((v + 50) / 50, 0, 1)) * He) for i, v in enumerate(db)]
    d.line(pts, fill=col, width=1)
src = open(os.path.join(ROOT, 'src/timeline.js')).read()
blk = src[src.index('export const CUE'):]; blk = blk[:blk.index('};')]
for k, v in re.findall(r'(\w+):\s*([\d.]+)', blk):
    xx = float(v) / 5.0 * Wd
    d.line([(xx, 0), (xx, Hs + He + 20)], fill=(255, 255, 0), width=1)
    d.text((xx + 2, 2 + (hash(k) % 5) * 11), k, fill=(255, 255, 0))
for hz in (100, 1000, 10000):
    yy = Hs - 1 - np.argmin(abs(fl - hz))
    d.text((2, yy), f'{hz}Hz', fill=(200, 200, 200))
canvas.save(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'out/stills/audio.png'))

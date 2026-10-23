"""Sound design for the SRT spot, synthesized from scratch and locked to the
same cue sheet as the picture (src/timeline.js). 48 kHz stereo WAV.

Layers: tunnel riser + fly-bys, the downbeat punch, a short 120 BPM groove,
block-build ticks, the grid-collapse shutter, the bloom chord, stereo
marquee whooshes, a reverse swell into the logo hit, and the glint shimmer.
"""
import os, re, wave
import numpy as np
from scipy import signal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
DUR = 5.0
N = int(SR * DUR)
rs = np.random.RandomState(1234)

# ------------------------------------------------------------------ cues
src = open(os.path.join(ROOT, 'src', 'timeline.js')).read()
block = src[src.index('export const CUE'):]
block = block[:block.index('};')]
CUE = {k: float(v) for k, v in re.findall(r'(\w+):\s*([\d.]+)', block)}

def zoom_log(t):  # mirrors comp.js
    return 2.2 * t + 6.6 * t ** 4

# ------------------------------------------------------------------ helpers
L = np.zeros(N); Rr = np.zeros(N)
T = np.arange(N) / SR

def place(sig, t0, gain=1.0, pan=0.0):
    """Mix a mono or (n, 2) signal into the bus at time t0 with equal-power pan."""
    i0 = int(round(t0 * SR))
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        st = np.stack([sig * np.cos(a), sig * np.sin(a)], 1)
    else:
        st = sig
    j0, j1 = max(i0, 0), min(i0 + len(st), N)
    if j1 <= j0:
        return
    seg = st[j0 - i0:j1 - i0] * gain
    L[j0:j1] += seg[:, 0]; Rr[j0:j1] += seg[:, 1]

def tt(d):
    return np.arange(int(d * SR)) / SR

def env_ad(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(t / max(a, 1e-4), 1.0) * np.exp(-np.maximum(t - a, 0) / d)

def bandpass(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos')
    return signal.sosfilt(sos, x)

def lowpass(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'lowpass', fs=SR, output='sos'), x)

def highpass(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'highpass', fs=SR, output='sos'), x)

def sweep_filter(x, f_of_t, kind='lowpass', q=0.9, block=64):
    """Time-varying TPT state-variable filter (Zavalishin), updated per block.
    Unconditionally stable, so cutoffs can sweep freely."""
    out = np.zeros(len(x))
    ic1 = ic2 = 0.0
    k = 1.0 / q
    for s in range(0, len(x), block):
        e = min(s + block, len(x))
        fc = min(max(f_of_t((s + e) / 2 / SR), 20.0), SR * 0.45)
        g = np.tan(np.pi * fc / SR)
        a1 = 1.0 / (1.0 + g * (g + k)); a2 = g * a1; a3 = g * a2
        for i in range(s, e):
            v3 = x[i] - ic2
            v1 = a1 * ic1 + a2 * v3
            v2 = ic2 + a2 * ic1 + a3 * v3
            ic1 = 2 * v1 - ic1
            ic2 = 2 * v2 - ic2
            if kind == 'lowpass':
                out[i] = v2
            elif kind == 'bandpass':
                out[i] = v1
            else:
                out[i] = x[i] - k * v1 - v2
    return out

def saw(freq_t, n, phase0=0.0):
    """Band-limited-ish saw from a frequency curve (additive, 24 partials)."""
    ph = np.cumsum(freq_t) / SR + phase0
    out = np.zeros(n)
    for k in range(1, 25):
        mask = (freq_t * k) < SR * 0.45
        out += mask * np.sin(2 * np.pi * k * ph) / k
    return out * 0.6

def reverb_ir(dur=2.2, decay=0.7, bright=6000, seed=3):
    r = np.random.RandomState(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    ir = r.randn(n, 2) * np.exp(-t / decay)[:, None]
    # darken the tail over time
    for c in range(2):
        ir[:, c] = sweep_filter(ir[:, c], lambda x: bright * np.exp(-x * 1.6) + 500, 'lowpass', 0.7, 256)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    return ir / np.sqrt((ir ** 2).sum(0, keepdims=True))

IR = reverb_ir()

def verb(x, mix=0.3, ir=IR):
    """Mono in -> stereo out (dry centred + wet)."""
    wet = np.stack([signal.fftconvolve(x, ir[:, 0])[: len(x) + len(ir) - 1], signal.fftconvolve(x, ir[:, 1])], 1)
    dry = np.zeros_like(wet); dry[: len(x)] = np.stack([x, x], 1) * 0.707
    return dry * (1 - mix) + wet * mix

def pan_sweep(x, p0, p1):
    p = np.linspace(p0, p1, len(x))
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1)

def softclip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)

# ------------------------------------------------------------------ instruments
def kick(punch=1.0, length=0.45, f_end=48, f_start=210):
    t = tt(length)
    f = f_end + (f_start - f_end) * np.exp(-t * 38)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    click = highpass(rs.randn(len(t)), 2500) * np.exp(-t * 400) * 0.35
    return softclip((body + click) * 1.4 * punch, 1.6)

def sub_boom(length=1.8, f0=95, f1=36, decay=1.1):
    t = tt(length)
    f = f1 + (f0 - f1) * np.exp(-t * 5)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)  # harmonics so phones hear it
    return softclip(x * np.exp(-t / decay) * np.minimum(t / 0.004, 1), 1.3)

def noise_hit(length=1.2, f_hi=9000, f_lo=900, decay=0.25):
    t = tt(length)
    n = rs.randn(len(t))
    x = sweep_filter(n, lambda s: f_lo + (f_hi - f_lo) * np.exp(-s * 6), 'lowpass', 0.8)
    return x * np.exp(-t / decay) * np.minimum(t / 0.002, 1)

def whoosh(length=0.35, f0=300, f1=5000, peak=0.6, q=1.6, seed=None):
    r = np.random.RandomState(seed) if seed is not None else rs
    t = tt(length)
    n = r.randn(len(t))
    x = sweep_filter(n, lambda s: f0 * (f1 / f0) ** min(s / length, 1), 'bandpass', q)
    e = np.where(t < peak * length, (t / (peak * length)) ** 2, np.exp(-(t - peak * length) / (0.18 * length)))
    return x * e

def ping(freq, length=0.09, decay=0.02):
    t = tt(length)
    return (np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2.76 * t)) * np.exp(-t / decay) * np.minimum(t / 0.0008, 1)

def hat(length=0.06, decay=0.012):
    t = tt(length)
    return highpass(rs.randn(len(t)), 7000, 4) * np.exp(-t / decay)

def chord(freqs, length, attack=0.005, decay=0.9, cutoff0=6000, cutoff1=900, detune=0.006):
    t = tt(length)
    out = np.zeros(len(t))
    for f in freqs:
        for d in (-detune, 0, detune):
            out += saw(np.full(len(t), f * (1 + d)), len(t), rs.rand())
    out /= len(freqs) * 3
    out = sweep_filter(out, lambda s: cutoff1 + (cutoff0 - cutoff1) * np.exp(-s * 3.5), 'lowpass', 1.1)
    return out * np.minimum(t / attack, 1) * np.exp(-t / decay)

def metal(length=1.4):
    t = tt(length)
    parts = [(523.0, 0.5, 0.6), (1347.0, 0.35, 0.35), (2711.0, 0.25, 0.22), (3907.0, 0.15, 0.15)]
    x = sum(a * np.sin(2 * np.pi * f * t + rs.rand() * 6) * np.exp(-t / d) for f, a, d in parts)
    return x * np.minimum(t / 0.001, 1)

def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)

# ------------------------------------------------------------------ arrangement
hit0, punch, pop, logo = 0.0, CUE['tunnelEnd'], CUE['bloomPop'], CUE['logoHit']

# 0.00 opening hit
place(kick(0.9), hit0, 0.8)
place(verb(noise_hit(0.8, 7000, 1200, 0.12), 0.35), hit0, 0.22)

# tunnel riser 0 -> 1.0: rising saw cluster + noise sweep, follows the speed ramp
d = punch
t = tt(d)
lam = zoom_log(t)
rise = lam / zoom_log(punch)
f_root = note(50) * 2 ** (rise * 1.0)          # D3 -> D4 glide
riser = np.zeros(len(t))
for iv, g in ((0, 1.0), (7, 0.6), (12, 0.5), (15, 0.35)):
    riser += g * saw(f_root * 2 ** (iv / 12), len(t), rs.rand())
riser = sweep_filter(riser, lambda s: 400 + 7000 * (zoom_log(s) / zoom_log(punch)) ** 1.3, 'lowpass', 1.4)
riser *= (0.15 + 0.85 * rise ** 1.5)
place(pan_sweep(riser, -0.3, 0.3), 0.0, 0.28)
nz = sweep_filter(rs.randn(len(t)), lambda s: 600 + 9000 * (zoom_log(s) / zoom_log(punch)) ** 1.2, 'bandpass', 1.2)
place(nz * (0.05 + rise ** 2), 0.0, 0.25)

# fly-bys: each nested copy passing the lens
nest0, H = 0.44, 1.0
for k in range(8):
    target = np.log(2.0 / nest0) + k * np.log(2)
    ts = np.linspace(0, punch, 4000)
    idx = np.searchsorted(zoom_log(ts), target)
    if idx >= len(ts):
        continue
    tk = ts[idx]
    length = max(0.07, 0.22 - k * 0.02)
    w = whoosh(length, 2500, 600, 0.55, 2.0, seed=k)
    place(pan_sweep(w, -0.7 if k % 2 else 0.7, 0.7 if k % 2 else -0.7), tk - length * 0.55, 0.35 + 0.05 * k)

# 1.00 punch: kick + sub + crash; the groove starts here
place(kick(1.2), punch, 1.0)
place(sub_boom(1.0, 110, 40, 0.45), punch, 0.55)
place(verb(noise_hit(1.0, 11000, 1500, 0.18), 0.4), punch, 0.35)

# groove 1.0 -> 3.0 (kicks on the beat, hats on the offbeat 16ths, bass on 8ths)
for b in np.arange(1.5, 3.01, 0.5):
    if abs(b - 2.0) < 1e-6:
        continue  # the grid collapse owns beat 2.0
    place(kick(0.9), b, 0.75)
for h in np.arange(1.25, 3.3, 0.25):
    place(hat(), h, 0.18, pan=0.25)
for h in np.arange(1.125, 3.3, 0.25):
    place(hat(0.03, 0.006), h, 0.08, pan=-0.3)
bass_notes = [(1.0, 38), (1.25, 38), (1.5, 38), (1.75, 41), (2.25, 43), (2.5, 43), (2.75, 45), (3.0, 45), (3.25, 38)]
for tb, m in bass_notes:
    tb_len = 0.22
    tn = tt(tb_len)
    x = saw(np.full(len(tn), note(m)), len(tn)) + 0.6 * np.sin(2 * np.pi * note(m) * tn)
    x = lowpass(x, 700) * np.minimum(tn / 0.004, 1) * np.exp(-tn / 0.12)
    # kick ducking baked in: start a touch late on downbeats
    place(softclip(x * 1.5, 1.4), tb + 0.012, 0.32)

# block build ticks: follow the cell build density (1.02 .. 1.6)
for i in range(46):
    tb = 1.02 + 0.58 * (rs.rand() ** 0.8)
    place(ping(1800 + rs.rand() * 4200, 0.06, 0.012 + rs.rand() * 0.01), tb, 0.06 + rs.rand() * 0.05, pan=rs.rand() * 1.6 - 0.8)

# 1.86 -> 2.08 grid collapse: accelerating shutter clicks + falling glitch sweep
clicks = 1.86 + 0.22 * (1 - (1 - np.linspace(0, 1, 16)) ** 1.7)
for j, tc in enumerate(clicks):
    place(ping(900 + j * 120, 0.03, 0.006) + hat(0.03, 0.004) * 0.6, tc, 0.12, pan=-0.8 + 1.6 * j / 15)
g = tt(0.26)
gl = np.sign(np.sin(2 * np.pi * (1600 * np.exp(-g * 9) + 80) * g)) * np.exp(-g * 6)
place(lowpass(gl, 5000) * 0.5, 1.86, 0.18)

# 2.00 bloom: airy swell into the pop
sw = tt(pop - 1.97)
air = sweep_filter(rs.randn(len(sw)), lambda s: 500 + 6000 * (s / (pop - 1.97)) ** 2, 'bandpass', 1.0)
place(air * (sw / sw[-1]) ** 2, 1.97, 0.25)

# 2.22 pop: kick, sub, bright Dmaj9 stab + sparkle for the petals
place(kick(1.1), pop, 0.9)
place(sub_boom(0.9, 100, 44, 0.35), pop, 0.4)
stab = chord([note(m) for m in (62, 66, 69, 73, 76)], 1.4, 0.004, 0.55, 7000, 900)
place(verb(stab, 0.45), pop, 0.42)
for i in range(26):
    tb = pop + 0.02 + rs.rand() ** 1.6 * 0.6
    place(ping(note(86 + rs.choice([0, 2, 4, 7, 9, 11, 12])) , 0.25, 0.06), tb, 0.045, pan=rs.rand() * 1.8 - 0.9)

# 3.02 -> 3.4 marquee: one whoosh per band, panned in its travel direction
order = [3, 2, 4, 1, 5, 0, 6]
for i in range(7):
    o = order[i]
    t_in = CUE['wipeIn'] + o * 0.02
    w = whoosh(0.3, 500, 4500, 0.35, 1.8, seed=40 + i)
    p0, p1 = (0.9, -0.9) if i % 2 == 0 else (-0.9, 0.9)
    place(pan_sweep(w, p0, p1), t_in - 0.05, 0.2)
    t_out = 3.40 + o * 0.02
    w = whoosh(0.3, 3500, 700, 0.6, 1.8, seed=60 + i)
    place(pan_sweep(w, p0 * 0.5, p1), t_out, 0.16)

# reverse swell sucked into the logo hit
rv_len = logo - 3.3
rv = verb(noise_hit(rv_len, 9000, 2000, 0.3), 0.8)[: int(rv_len * SR)][::-1]
rv *= np.linspace(0, 1, len(rv))[:, None] ** 2
place(rv, logo - rv_len, 0.5)
tr = tt(rv_len)
tone = sum(saw(note(m) * 2 ** (tr / rv_len * 0.08), len(tr), rs.rand()) for m in (50, 57, 62))
tone = sweep_filter(tone, lambda s: 300 + 5000 * (s / rv_len) ** 2, 'lowpass', 1.2) * (tr / rv_len) ** 2
place(tone, logo - rv_len, 0.12)

# duck everything just before the hit for contrast
i0, i1 = int((logo - 0.06) * SR), int(logo * SR)
duck = np.linspace(1, 0.15, i1 - i0)
L[i0:i1] *= duck; Rr[i0:i1] *= duck

# 3.75 logo hit
place(kick(1.4, 0.6), logo, 1.0)
place(sub_boom(1.25, 120, 36, 0.6), logo, 0.75)
place(verb(noise_hit(1.25, 12000, 1200, 0.3), 0.5), logo, 0.42)
place(verb(metal(1.25), 0.55), logo, 0.12)
pad = chord([note(m) for m in (50, 57, 62, 66, 69, 76)], DUR - logo, 0.03, 1.6, 4500, 1200, 0.008)
place(verb(pad, 0.5), logo, 0.3)

# 4.12 glint: shimmering "shing" that travels left to right
gt = tt(0.7)
sh = sum(np.sin(2 * np.pi * f * gt * (1 + 0.02 * gt)) * np.exp(-gt / d) for f, d in ((3520, 0.25), (5274, 0.18), (7040, 0.12), (8870, 0.08)))
sh *= np.minimum(gt / 0.01, 1)
air = highpass(rs.randn(len(gt)), 8000) * np.exp(-gt / 0.1) * 0.25
st = pan_sweep(sh + air, -0.8, 0.8)
place(st, CUE['glint'] + 0.04, 0.16)
place(verb(sh, 0.9)[:, :] * 0.5, CUE['glint'] + 0.04, 0.08)

# ------------------------------------------------------------------ master
mix = np.stack([L, Rr], 1)
mix = highpass(mix.T, 25).T
# gentle glue compression (RMS envelope follower)
rms = np.sqrt(signal.sosfilt(signal.butter(1, 12, fs=SR, output='sos'), (mix ** 2).mean(1)) + 1e-9)
thr = 0.25
gain = np.where(rms > thr, (thr / rms) ** 0.45, 1.0)
mix *= gain[:, None]
mix = softclip(mix * 1.25, 1.2)
peak = np.abs(mix).max()
mix *= 0.89 / peak  # -1 dBFS
fi, fo = int(0.004 * SR), int(0.03 * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]
mix[-fo:] *= np.linspace(1, 0, fo)[:, None]

out = os.path.join(ROOT, 'out', 'audio.wav')
os.makedirs(os.path.dirname(out), exist_ok=True)
pcm = (mix * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', out, 'peak', np.abs(mix).max(), 'rms dB', 20 * np.log10(np.sqrt((mix ** 2).mean())))

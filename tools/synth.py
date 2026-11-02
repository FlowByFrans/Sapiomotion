"""Small synthesis toolkit shared by the scores: a stereo bus, filters,
oscillators, a few instruments, a synthetic reverb and a mastering chain."""
import wave
import numpy as np
from scipy import signal

SR = 48000


class Bus:
    def __init__(self, dur, sr=SR):
        self.sr = sr
        self.n = int(dur * sr)
        self.L = np.zeros(self.n)
        self.R = np.zeros(self.n)

    def place(self, sig, t0, gain=1.0, pan=0.0):
        """Mix mono (equal-power panned) or (n, 2) stereo audio in at t0."""
        i0 = int(round(t0 * self.sr))
        if sig.ndim == 1:
            a = (pan + 1) * np.pi / 4
            st = np.stack([sig * np.cos(a), sig * np.sin(a)], 1)
        else:
            st = sig
        j0, j1 = max(i0, 0), min(i0 + len(st), self.n)
        if j1 <= j0:
            return
        seg = st[j0 - i0:j1 - i0] * gain
        self.L[j0:j1] += seg[:, 0]
        self.R[j0:j1] += seg[:, 1]

    def stereo(self):
        return np.stack([self.L, self.R], 1)


def tt(d, sr=SR):
    return np.arange(int(d * sr)) / sr


def lowpass(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'lowpass', fs=SR, output='sos'), x, axis=0)


def highpass(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'highpass', fs=SR, output='sos'), x, axis=0)


def bandpass(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x, axis=0)


def svf(x, f_of_t, kind='lowpass', q=0.9, block=64):
    """Time-varying TPT state-variable filter (stable for any cutoff sweep)."""
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
            out[i] = v2 if kind == 'lowpass' else v1 if kind == 'bandpass' else x[i] - k * v1 - v2
    return out


def saw(freq, n, phase=0.0, partials=28):
    f = np.full(n, freq) if np.isscalar(freq) else freq
    ph = np.cumsum(f) / SR + phase
    out = np.zeros(n)
    for k in range(1, partials + 1):
        out += (f * k < SR * 0.45) * np.sin(2 * np.pi * k * ph) / k
    return out * 0.6


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def softclip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def pan_sweep(x, p0, p1):
    p = np.linspace(p0, p1, len(x))
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1)


def reverb_ir(dur=2.6, decay=0.8, bright=5500, seed=3):
    r = np.random.RandomState(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    ir = r.randn(n, 2) * np.exp(-t / decay)[:, None]
    for c in range(2):
        ir[:, c] = svf(ir[:, c], lambda x: bright * np.exp(-x * 1.4) + 400, 'lowpass', 0.7, 512)
    fade = int(0.01 * SR)
    ir[:fade] *= np.linspace(0, 1, fade)[:, None]
    return ir / np.sqrt((ir ** 2).sum(0, keepdims=True))


_IR = None


def verb(x, mix=0.3, ir=None):
    """Mono in, stereo out: dry centred plus convolved wet."""
    global _IR
    if ir is None:
        if _IR is None:
            _IR = reverb_ir()
        ir = _IR
    wet = np.stack([signal.fftconvolve(x, ir[:, 0]), signal.fftconvolve(x, ir[:, 1])], 1)
    dry = np.zeros_like(wet)
    dry[:len(x)] = np.stack([x, x], 1) * 0.707
    return dry * (1 - mix) + wet * mix


# ------------------------------------------------------------------ instruments
def pluck(freq, dur=1.6, bright=1.0, rs=None):
    """Felt-piano-ish tone: inharmonic partials with frequency-dependent decay."""
    t = tt(dur)
    out = np.zeros(len(t))
    B = 0.0004
    for k in range(1, 10):
        fk = freq * k * np.sqrt(1 + B * k * k)
        if fk > SR * 0.45:
            break
        amp = (1.0 / k ** 1.25) * (bright if k > 2 else 1.0)
        out += amp * np.sin(2 * np.pi * fk * t) * np.exp(-t * (1.6 + 0.9 * k))
    out *= np.minimum(t / 0.003, 1)
    if rs is not None:
        out += highpass(rs.randn(len(t)), 2500) * np.exp(-t * 300) * 0.05
    return out


def pad(freqs, dur, cutoff=1200, detune=0.007, attack=0.35, release=0.6, rs=None):
    t = tt(dur)
    rs = rs or np.random.RandomState(0)
    out = np.zeros(len(t))
    for f in freqs:
        for d in (-detune, 0.0, detune):
            out += saw(f * (1 + d), len(t), rs.rand())
        out += 0.5 * np.sin(2 * np.pi * f * t + rs.rand() * 6)
    out /= len(freqs) * 3.5
    out = lowpass(out, cutoff, 2)
    env = np.minimum(t / attack, 1) * np.minimum((dur - t) / release, 1).clip(0, 1)
    return out * env


def click(rs, pitch=4200, dur=0.05, body=1.0):
    """Shutter tick: bright noise snap plus a tiny pitched ping."""
    t = tt(dur)
    n = bandpass(rs.randn(len(t)), 1800, 9000) * np.exp(-t * 520)
    p = np.sin(2 * np.pi * pitch * t) * np.exp(-t * 160) * 0.35 * body
    return (n + p) * np.minimum(t / 0.0005, 1)


def thump(f0=150, f1=42, dur=0.5, decay=6.0):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.25 * np.sin(2 * ph)
    return softclip(x * np.exp(-t * decay) * np.minimum(t / 0.002, 1) * 1.3, 1.4)


def boom(dur=2.4, f0=90, f1=34, decay=0.9):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 4)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.3 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph)
    return softclip(x * np.exp(-t / decay) * np.minimum(t / 0.004, 1), 1.2)


def noise_riser(rs, dur, f0=400, f1=9000, q=1.1):
    t = tt(dur)
    x = svf(rs.randn(len(t)), lambda s: f0 * (f1 / f0) ** min(s / dur, 1), 'bandpass', q)
    return x * (t / dur) ** 2


# ------------------------------------------------------------------ master
def master(mix, target_peak=0.89, thr=0.22, ratio_exp=0.4, drive=1.15, fade_in=0.003, fade_out=0.35):
    mix = highpass(mix, 28)
    rms = np.sqrt(signal.sosfilt(signal.butter(1, 10, fs=SR, output='sos'), (mix ** 2).mean(1)) + 1e-9)
    gain = np.where(rms > thr, (thr / rms) ** ratio_exp, 1.0)
    mix = mix * gain[:, None]
    mix = softclip(mix * drive, 1.1)
    mix *= target_peak / np.abs(mix).max()
    fi, fo = int(fade_in * SR), int(fade_out * SR)
    mix[:fi] *= np.linspace(0, 1, fi)[:, None]
    mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
    return mix


def write_wav(path, mix):
    pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())

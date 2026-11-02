"""Score for the Sapio hype cut, following the picture's cut list
(out/hype-cuts.json, written by the renderer).

Like the reference, it's a quiet tonal bed with a tick on every cut, so the
edit itself becomes the rhythm: ticks thicken through the 2-frame strobe and
thin out as the cuts slow. Statements land on a soft thump and a felt-piano
chord, and the lockup resolves to D major."""
import json, os
import numpy as np
from synth import (Bus, SR, tt, note, pad, pluck, click, thump, boom, noise_riser, verb,
                   lowpass, highpass, svf, pan_sweep, master, write_wav)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cuts = json.load(open(os.path.join(ROOT, 'out', 'hype-cuts.json')))
FPS = cuts['fps']
DUR = cuts['frames'] / FPS
shots = cuts['cuts']
for s in shots:
    s['t'] = s['frame'] / FPS
start_of = lambda sec: min(s['t'] for s in shots if s['section'] == sec)
T_SETUP, T_MONT, T_PRIN, T_LOCK = start_of('setup'), start_of('montage'), start_of('principles'), start_of('lockup')
T_FLASH = next(s['t'] for s in shots if s['tag'] == 'flash')

rs = np.random.RandomState(2026)
bus = Bus(DUR)

# ------------------------------------------------------------------ harmonic bed
# Bm(add9) -> Gmaj7(#11) (rising through the montage) -> Em9 -> A7sus4 -> Dmaj9
chords = [
    (0.0, T_MONT, [47, 54, 62, 69, 73], 900),
    (T_MONT, T_PRIN, [43, 50, 54, 59, 61], None),
    (T_PRIN, T_PRIN + (T_FLASH - T_PRIN) * 0.45, [40, 47, 55, 62, 66], 1500),
    (T_PRIN + (T_FLASH - T_PRIN) * 0.45, T_FLASH, [45, 52, 55, 59, 62, 64], 1900),
]
for i, (a, b, notes, cut) in enumerate(chords):
    dur = b - a + 0.5
    p = pad([note(m) for m in notes], dur, cutoff=cut or 1000, attack=0.25 if i else 0.06, release=0.5, rs=rs)
    if cut is None:  # montage: the filter opens with the acceleration
        p = svf(p * 1.6, lambda s, d=dur: 500 + 5200 * (s / d) ** 2, 'lowpass', 1.3)
    bus.place(verb(p, 0.35), a, 0.55)

# ------------------------------------------------------------------ ticks on every cut
for k, s in enumerate(shots):
    if s['frame'] == 0:
        continue
    sec = s['section']
    if sec == 'montage':
        prog = (s['t'] - T_MONT) / (T_PRIN - T_MONT)
        g, pitch = 0.22 + 0.12 * prog, 3600 + 2200 * prog
    elif sec == 'principles':
        g, pitch = 0.32, 4000
    else:
        g, pitch = 0.36, 4400
    if s['tag'] in ('flash', 'lockup'):
        continue
    bus.place(click(rs, pitch=pitch * (0.97 + 0.06 * rs.rand())), s['t'], g, pan=(rs.rand() - 0.5) * 0.9)

# open: the stutter cuts get low "bloops" so the first second has weight
for s in shots[:5]:
    t = tt(0.35)
    f = note(47) * (1 + 0.5 * np.exp(-t * 30))
    blip = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    bus.place(blip, s['t'], 0.35)
bus.place(thump(), 0.0, 0.5)

# setup: construction drawing (pencil hiss) and page flicks on the excerpts
setup = [s for s in shots if s['section'] == 'setup']
hiss = highpass(rs.randn(int(setup[0]['frames'] / FPS * SR)), 3000) * 0.05
hiss *= 0.6 + 0.4 * np.sin(np.linspace(0, 40, len(hiss))) ** 2
bus.place(hiss, setup[0]['t'], 0.22)
for s in setup[1:4]:
    flick = svf(rs.randn(int(0.12 * SR)), lambda x: 6000 - 30000 * x, 'bandpass', 1.4) * np.exp(-tt(0.12) * 25)
    bus.place(pan_sweep(flick, 0.6, -0.6), s['t'] - 0.01, 0.25)
# piano motif across the setup (B minor pentatonic, spaced on the cuts)
motif = [(setup[0]['t'] + 0.05, 66), (setup[0]['t'] + 0.45, 69), (setup[0]['t'] + 0.8, 71), (setup[1]['t'], 74), (setup[2]['t'], 73), (setup[3]['t'], 71)]
for t0, m in motif:
    bus.place(verb(pluck(note(m), 1.6, rs=rs), 0.4), t0, 0.32, pan=(m - 70) / 12)

# ------------------------------------------------------------------ statements
for s in shots:
    if s['tag'] != 'statement':
        continue
    bus.place(thump(140, 44, 0.45, 7), s['t'], 0.55)
    root = 50 if s['section'] == 'setup' else 45
    chord = [root, root + 7, root + 12, root + 16, root + 19]
    st = sum(pluck(note(m), 2.0, rs=rs) for m in chord) / 3.0
    bus.place(verb(st, 0.45), s['t'] + 0.005, 0.38)

# ------------------------------------------------------------------ montage drive
bus.place(boom(1.6, 80, 36, 0.5), T_MONT, 0.5)
r = noise_riser(rs, T_PRIN - T_MONT, 500, 10000)
bus.place(pan_sweep(r, -0.5, 0.5), T_MONT, 0.22)
# a pulse under the strobe that speeds up with it
pulse_t = T_MONT
while pulse_t < T_PRIN - 0.05:
    prog = (pulse_t - T_MONT) / (T_PRIN - T_MONT)
    bus.place(thump(110, 50, 0.2, 14), pulse_t, 0.22 + 0.15 * prog)
    pulse_t += 0.24 - 0.15 * prog
bus.place(boom(1.2, 100, 40, 0.4), T_PRIN, 0.45)

# ------------------------------------------------------------------ into the lockup
sw_len = 0.5
swell = verb(svf(rs.randn(int(sw_len * SR)), lambda x: 300 + 9000 * (x / sw_len) ** 2, 'lowpass', 0.9), 0.8)[: int(sw_len * SR)]
swell *= np.linspace(0, 1, len(swell))[:, None] ** 2.5
bus.place(swell, T_FLASH - sw_len, 0.35)
bus.place(boom(2.6, 96, 33, 1.1), T_LOCK, 0.8)
bus.place(thump(170, 46, 0.6, 5), T_LOCK, 0.5)
resolve = pad([note(m) for m in (38, 45, 54, 61, 64, 69)], DUR - T_LOCK + 0.2, cutoff=2600, attack=0.02, release=1.4, rs=rs)
bus.place(verb(resolve, 0.5), T_LOCK, 0.7)
for i, m in enumerate((74, 78, 81, 85, 88)):
    bus.place(verb(pluck(note(m), 2.4, bright=0.6, rs=rs), 0.6), T_LOCK + 0.08 + i * 0.07, 0.2, pan=-0.6 + 0.3 * i)
shimmer = highpass(rs.randn(int(1.4 * SR)), 7000) * np.exp(-tt(1.4) * 3) * 0.12
bus.place(pan_sweep(shimmer, -0.7, 0.7), T_LOCK, 0.4)

mix = master(bus.stereo(), thr=0.16, ratio_exp=0.35, drive=1.1, fade_out=0.5)
out = os.path.join(ROOT, 'out', 'hype-audio.wav')
write_wav(out, mix)
print('wrote', out, 'dur', DUR, 'rms dB', round(20 * np.log10(np.sqrt((mix ** 2).mean())), 1))

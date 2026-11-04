"""Score for the logo showcase reel (out/reel-cues.json from the renderer):
an airy D-major bed, a whoosh shaped to each transition with a glassy chime
as the material lands, a liquid rise into the blue hero, and a soft bloom on
the finish."""
import json, os
import numpy as np
from synth import (Bus, SR, tt, note, pad, pluck, boom, verb, svf, highpass, lowpass,
                   pan_sweep, master, write_wav)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cues = json.load(open(os.path.join(ROOT, 'out', 'reel-cues.json')))
DUR = cues['frames'] / cues['fps']
TR = cues['transitions']          # [t0, duration, type]
HERO = cues['hero']
rs = np.random.RandomState(505)
bus = Bus(DUR)

def chime(freq, dur=1.8, bright=0.8):
    t = tt(dur)
    x = pluck(freq, dur, bright=bright, rs=rs) * 0.8
    x += 0.25 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t * 7)   # glassy partial
    return x

# bed: airy Dmaj9, opening quickly so the first frame already has air
bed = pad([note(m) for m in (50, 57, 61, 64, 69)], DUR + 0.3, cutoff=1400, attack=0.25, release=0.8, rs=rs)
bus.place(verb(bed, 0.45), 0.0, 0.42)
air = svf(rs.randn(int(DUR * SR)), lambda s: 5000 + 1500 * np.sin(s * 1.3), 'bandpass', 0.8) * 0.06
bus.place(pan_sweep(air, -0.4, 0.4), 0.0, 0.5)

landing_notes = [69, 73, 76, 78]          # A5, C#6, E6, F#6 — rising through the reel
for i, (t0, d, kind) in enumerate(TR):
    # whoosh shaped to the transition and panned along it
    n = int((d + 0.15) * SR)
    w = svf(rs.randn(n), lambda s, d=d: 500 * (12000 / 500) ** min(s / (d + 0.15), 1), 'bandpass', 1.4)
    env = np.sin(np.linspace(0, np.pi, n)) ** 2
    bus.place(pan_sweep(w * env, -0.7, 0.7) if kind in (1, 3) else np.stack([w * env] * 2, 1) * 0.7, t0 - 0.05, 0.22)
    if kind == 2:   # ripple: a water-drop "bloop" as the ring starts
        t = tt(0.35)
        f = 900 * np.exp(-t * 9) + 380
        drop = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
        bus.place(verb(drop, 0.5), t0, 0.22)
    if kind == 4:   # liquid fill: a rising filtered tone under the meniscus
        t = tt(d)
        rise = svf(rs.randn(len(t)), lambda s, d=d: 300 + 4000 * (s / d) ** 1.5, 'lowpass', 2.5) * (t / d)
        bus.place(rise, t0, 0.35)
    # chime as the new material lands (mid-transition)
    bus.place(verb(chime(note(landing_notes[i])), 0.5), t0 + d * 0.55, 0.3, pan=-0.3 + 0.2 * i)

# hero bloom: soft low swell, the full chord, a shimmer
bus.place(boom(1.8, 70, 36, 0.7), HERO, 0.4)
for k, m in enumerate((62, 66, 69, 73, 76, 81)):
    bus.place(verb(chime(note(m), 2.2, 0.6), 0.55), HERO + 0.02 + k * 0.035, 0.16, pan=-0.5 + 0.2 * k)
sh = highpass(rs.randn(int(1.2 * SR)), 7500) * np.exp(-tt(1.2) * 2.8) * 0.1
bus.place(pan_sweep(sh, -0.6, 0.6), HERO + 0.25, 0.5)

mix = master(bus.stereo(), thr=0.2, ratio_exp=0.3, drive=1.05, fade_out=0.3)
out = os.path.join(ROOT, 'out', 'reel-audio.wav')
write_wav(out, mix)
print('wrote', out, 'dur', DUR, 'rms dB', round(20 * np.log10(np.sqrt((mix ** 2).mean())), 1))

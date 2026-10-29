# SRT — 5s motion spot

A 5-second, 60 fps brand sizzle for crypto Twitter. It's built entirely from the
supplied brand assets, rendered by a custom WebGL2 compositor and cut to a
synthesized 120 BPM soundtrack.

| file | format |
| --- | --- |
| `out/srt-motion-1920x1080.mp4` | 16:9, 1080p60, H.264 High + AAC, BT.709 |
| `out/srt-motion-1080x1080.mp4` | 1:1 cut for mobile timelines |

## The edit

Every cut lands on the beat grid (beat = 0.5 s), and every hit has a sound.

| time | act | what happens |
| --- | --- | --- |
| 0.00 | **FLOW** | Infinite (Droste) zoom through nested SRT wordmarks over the liquid gradient. A speed ramp, a spiral camera roll and warp streaks build up. |
| 1.00 | **BUILD** | The camera punches through the last "R". Its fill was a window into the next world all along. Giant liquid-filled SRT type springs up, and the block tower assembles cell by cell. |
| 1.86 | → | The frame collapses into blocks. |
| 2.00 | **BLOOM** | The foliage unfurls around a glowing core, then the glass node and peonies spring out on a damped spring with a petal burst, god rays and a rotating type ring. |
| 3.02 | → | Seven marquee bands of SRT sweep across from alternating sides, and the scene swaps underneath. |
| 3.75 | **SRT** | The letters slam home with a shockwave, an echo outline and a camera shake. Then a specular glint runs across them and the end card holds. |

## How it's made

- **SDF wordmark.** The 404 px logo is upsampled and turned into a per-letter signed distance field (`tools/build_sdf.py`). Type stays razor sharp at 50× zoom and gets outlines, glows, bevels and glints for free.
- **Layer split.** The bloom render is separated into foliage, mark/flowers and a pull-push-filled shadow layer (`tools/build_layers.py`), so it can be animated in 2.5D.
- **Brand pattern.** The three-lobed node mark is rebuilt as a procedural SDF and tiled like the print on the white cubes.
- **Motion blur + AA.** Each frame averages 12 Halton-jittered sub-frames across a 180° shutter.
- **Post.** A bloom pyramid, hit-driven chromatic aberration, a lens shockwave, highlight roll-off, vignette and grain, with a crisp HUD composited on top.
- **Sound** (`tools/sound.py`). Pure numpy/scipy synthesis reads the same cue sheet as the picture: riser and fly-bys, kicks and sub drops, block ticks, a Dmaj9 bloom stab, stereo marquee whooshes, a reverse swell into the hit, and the glint shimmer.

## Render it

```bash
npm install
pip install numpy scipy opencv-python-headless pillow
python3 tools/sound.py                         # out/audio.wav
node scripts/render.mjs                        # 1920x1080, 12 sub-frames
node scripts/render.mjs --size 1080x1080       # square cut
node scripts/render.mjs --still 0.5,2.3 --sub 4   # quick stills in out/stills
```

## Sapio: "Join the competition." loop

`src/join.js` is a calm, editorial 7.5 s loop at 60 fps, modelled on the
"Get on board" reference:

- A hairline grid and a vertical gradient that breathes between a mint-lit
  message state and a deep logo state.
- "Join the competition." in Figtree. It sits on two lines in the square cut
  and one line in widescreen, and leaves word by word with a soft lift and blur.
- The Sapio mark spins in as an extruded mint slab, using a perspective
  homography per layer, then slides into the lockup while "sapio" types out
  beside it.
- The line drops back in at the end, so the last frame meets the first and the
  video loops seamlessly on X.

| file | format |
| --- | --- |
| `out/sapio-join-1080x1080.mp4` | 1:1, 60 fps, H.264, BT.709, silent |
| `out/sapio-join-1920x1080.mp4` | 16:9, 60 fps, H.264, BT.709, silent |

```bash
node scripts/render.mjs --comp join --size 1080x1080 --out out/sapio-join-1080x1080.mp4
```

Timing lives in the `T` table at the top of `src/join.js`. The lockup comes
from `assets/sapio/sapio-lockup.svg`, and the typeface is Figtree Medium
(SIL OFL, `assets/fonts/`).

## Notes

The generated assets in `assets/gen/` are rebuilt automatically on the first
render. You can also open `src/index.html?play` from a local server for a
real-time preview without motion blur.

Timing lives in `src/timeline.js` (`CUE`). The picture is in `src/comp.js`,
and the sound reads the same cues.

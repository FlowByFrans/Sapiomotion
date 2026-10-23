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

The generated assets in `assets/gen/` are rebuilt automatically on the first
render. You can also open `src/index.html?play` from a local server for a
real-time preview without motion blur.

Timing lives in `src/timeline.js` (`CUE`). The picture is in `src/comp.js`,
and the sound reads the same cues.

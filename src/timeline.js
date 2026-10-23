// Timing, easing and small math helpers shared by every scene.
// All cue times are in seconds; the edit is cut to a 120 BPM grid
// (beat = 0.5s) so picture and sound land on the same frames.

export const FPS = 60;
export const DURATION = 5.0;
export const BEAT = 0.5;

export const CUE = {
  tunnelEnd: 1.0,     // camera punches through the last SRT, into the blocks world
  blocksBuild: 1.0,   // tower assembles cell by cell
  gridOut: 1.86,      // screen collapses into cells
  bloomIn: 2.0,       // dark scene, foliage unfurls
  bloomPop: 2.22,     // glass mark + peonies pop
  wipeIn: 3.1,        // SRT marquee bands sweep in
  wipeCover: 3.42,    // bands fully cover the frame, scene swaps underneath
  finalIn: 3.42,
  logoHit: 3.75,      // wordmark slams home (beat 7.5)
  glint: 4.12,        // specular sweep across the wordmark
  end: 5.0,
};

export const PALETTE = {
  blue: [0.03, 0.27, 0.87],        // #0744DD
  electric: [0.149, 0.373, 0.933], // #265FEE
  periwinkle: [0.604, 0.678, 0.973],
  mint: [0.35, 0.94, 0.84],        // #59F0D7
  aqua: [0.012, 0.765, 0.749],     // #03C3BF
  teal: [0.027, 0.27, 0.31],       // #07454F
  navy: [0.012, 0.031, 0.10],
  ink: [0.07, 0.075, 0.09],
  paper: [0.906, 0.922, 0.949],    // blocks world background
  white: [1, 1, 1],
};

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
// normalized progress of t through [a, b]
export const prog = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (x) => x * x * (3 - 2 * x);

export const ease = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inQuart: (x) => x * x * x * x,
  outQuart: (x) => 1 - Math.pow(1 - x, 4),
  inOutQuart: (x) => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2),
  outQuint: (x) => 1 - Math.pow(1 - x, 5),
  inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inOutExpo: (x) =>
    x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
  // damped spring settling from 0 to 1; k = stiffness-ish, z = damping
  spring: (x, k = 9, z = 0.32) => (x <= 0 ? 0 : 1 - Math.exp(-z * k * x) * Math.cos(k * x * Math.sqrt(1 - z * z))),
  // Bezier-like "designer" curve: fast attack, long silky settle
  snap: (x) => 1 - Math.pow(1 - x, 6),
};

// Deterministic PRNG so every render is identical.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D affine as a column-major mat3 (WebGL layout). Maps a unit quad
// (0..1)^2 to a centered rectangle w x h, rotated, scaled and placed at (x, y)
// in screen pixels (origin at frame centre, y down).
export function quadMatrix({ x = 0, y = 0, w, h, rot = 0, sx = 1, sy = 1, ax = 0.5, ay = 0.5 }) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const W = w * sx, H = h * sy;
  // local = (u - ax) * W, (v - ay) * H ; then rotate, translate
  const ox = -ax * W, oy = -ay * H;
  return new Float32Array([
    c * W, s * W, 0,
    -s * H, c * H, 0,
    c * ox - s * oy + x, s * ox + c * oy + y, 1,
  ]);
}

// Compose: apply camera (zoom about the frame centre, rotation, pan) to a quad matrix.
export function withCamera(m, cam) {
  if (!cam) return m;
  const z = cam.zoom ?? 1, r = cam.rot ?? 0, px = cam.x ?? 0, py = cam.y ?? 0;
  const c = Math.cos(r) * z, s = Math.sin(r) * z;
  const out = new Float32Array(9);
  for (let col = 0; col < 3; col++) {
    const X = m[col * 3], Y = m[col * 3 + 1], Wc = m[col * 3 + 2];
    out[col * 3] = c * X - s * Y + px * Wc;
    out[col * 3 + 1] = s * X + c * Y + py * Wc;
    out[col * 3 + 2] = Wc;
  }
  return out;
}

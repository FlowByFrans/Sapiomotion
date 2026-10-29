// "Join the competition." -> Sapio lockup. A calm, editorial loop modelled on
// the reference: hairline grid, a vertical gradient that breathes between a
// mint-lit "message" state and a deep "logo" state, word-by-word type, a
// spinning extruded mark and a typed-out wordmark. The last frame matches the
// first, so it loops seamlessly.

import { clamp, lerp, prog, ease } from './timeline.js';

export const JOIN_META = { fps: 60, duration: 7.5 };

const T = {
  wordsOut: 1.55,     // first word starts leaving
  bg: [1.7, 2.5],     // gradient: message -> logo state
  markIn: 2.2,        // mark appears, spinning
  markRest: 3.15,     // spin settles
  slide: [3.0, 3.42], // mark slides into the lockup
  letters: 3.32,      // s a p i o, one by one, once the mark has cleared
  glowBack: [5.2, 6.9],
  logoOut: 6.5,
  wordsIn: 6.62,
};

const TEXT = 'Join the competition.';
const INK = '#ECEEF3';

// Sapio lockup paths (from assets/sapio/sapio-lockup.svg, 568 x 193 units)
const SVG_W = 568;
const BASE_Y = 77.5;  // visual centre: top of mark to baseline

// gradient stops: A = message state (mint glow), B = logo state
const STOPS = [0.0, 0.2, 0.4, 0.56, 0.7, 0.82, 0.92, 1.0];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const GRAD_A = ['#0A1033', '#0D1A5C', '#10289C', '#1D3BD9', '#3757F0', '#3A86E6', '#40C2D6', '#5BE3CB'].map(hex);
const GRAD_B = ['#0A102E', '#0C1442', '#0F1C57', '#102169', '#11247B', '#122888', '#142DA4', '#1B36C2'].map(hex);

export async function createJoin(R) {
  const W = R.W, H = R.H;
  const S = Math.min(W, H);
  const U = S / 1080;

  // ---------------------------------------------------------------- assets
  const font = new FontFace('Figtree', 'url(../assets/fonts/Figtree-Medium.ttf)', { weight: '500' });
  await font.load();
  document.fonts.add(font);
  const svg = await (await fetch('../assets/sapio/sapio-lockup.svg')).text();
  const paths = [...svg.matchAll(/<path([^>]*)d="([^"]+)"/g)].map((m) => ({ d: m[2], evenodd: /evenodd/.test(m[1]) }));
  // order in the file: mark, p, a, o, s, i-stem, i-dot
  const [pMark, pP, pA, pO, pS, pIStem, pIDot] = paths;

  // ---------------------------------------------------------------- layout
  const twoLines = W / H < 1.4;
  const fontPx = Math.round((twoLines ? 128 : 150) * U);
  const lineH = fontPx * 1.06;
  const lines = twoLines ? [['Join', 'the'], ['competition.']] : [['Join', 'the', 'competition.']];
  const SS = 2; // supersampling of the type textures
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `500 ${fontPx * SS}px Figtree`;
  measure.letterSpacing = `${-0.012 * fontPx * SS}px`;
  const words = [];
  lines.forEach((ws, li) => {
    const line = ws.join(' ');
    const lw = measure.measureText(line).width / SS;
    let x = -lw / 2;
    ws.forEach((w) => {
      const ww = measure.measureText(w).width / SS;
      words.push({ text: w, x: x + ww / 2, y: (li - (lines.length - 1) / 2) * lineH, w: ww, tex: wordTexture(R, w, fontPx * SS) });
      x += measure.measureText(w + ' ').width / SS;
    });
  });
  const textBlockH = lines.length * lineH;

  // lockup scale: px per SVG unit
  const k = (Math.min(0.6 * S, 0.62 * W)) / SVG_W;
  const K = k * SS * 1.25; // raster scale (headroom for the spin overshoot)
  const toScreen = (x, y) => [(x - SVG_W / 2) * k, (y - BASE_Y) * k];
  const mkLetter = (ps, box) => {
    const tex = pathTexture(R, ps, box, K, INK);
    const [cx, cy] = toScreen((box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
    return { tex, cx, cy, w: (box[2] - box[0] + 8) * k, h: (box[3] - box[1] + 8) * k };
  };
  const letters = [
    mkLetter([pS], [153.9, 64.3, 223.0, 155.2]),
    mkLetter([pA], [228.6, 64.0, 321.4, 155.4]),
    mkLetter([pP], [336.2, 64.0, 428.8, 192.1]),
    mkLetter([pIStem, pIDot], [439.4, 46.2, 463.6, 153.3]),
    mkLetter([pO], [474.6, 64.0, 567.4, 155.4]),
  ];
  const markBox = [0, 0, 153.4, 153.4];
  const markFace = pathTexture(R, [pMark], markBox, K, 'mint');
  const markFlat = pathTexture(R, [pMark], markBox, K, '#FFFFFF');
  const markSize = (153.4 + 8) * k;
  const markHome = toScreen(76.7, 76.7);
  const lockupH = 155 * k;

  // ---------------------------------------------------------------- pieces
  function background(t) {
    const toLogo = ease.inOutCubic(prog(t, T.bg[0], T.bg[1]));
    const back = ease.inOutCubic(prog(t, T.glowBack[0], T.glowBack[1]));
    R.gradient({ time: (t / JOIN_META.duration) * Math.PI * 2, mix: clamp(toLogo - back), stops: STOPS, a: GRAD_A, b: GRAD_B, wave: 0.012 });
  }

  // words: leave left-to-right with a soft lift; return dropping into place
  function type(t) {
    words.forEach((w, i) => {
      let o = 1, dy = 0, lod = 0;
      const out = prog(t, T.wordsOut + i * 0.09, T.wordsOut + i * 0.09 + 0.2);
      const inn = prog(t, T.wordsIn + i * 0.12, T.wordsIn + i * 0.12 + 0.42);
      if (t >= T.wordsIn) {
        const e = ease.outCubic(inn);
        o = clamp(inn * 3.2);
        dy = -(1 - e) * 0.16 * fontPx;
        lod = (1 - clamp(inn * 2.5)) * 2.0;
      } else if (out > 0) {
        const e = ease.inCubic(out);
        o = 1 - ease.outQuad(out);
        dy = -e * 0.1 * fontPx;
        lod = e * 2.2;
      }
      if (o <= 0.002) return;
      const th = w.tex.h / SS, tw = w.tex.w / SS;
      R.sprite(w.tex, { x: w.x, y: w.y + dy, w: tw, h: th }, null, { opacity: o, lod: lod - 0.3 });
    });
  }

  // extruded mark spinning about a tilted axis, settling face-on
  function mark(t) {
    if (t < T.markIn || t >= T.logoOut + 0.12) return;
    const p = prog(t, T.markIn, T.markRest);
    const spin = -3 * Math.PI * (1 - ease.outQuart(p)) ;
    const sc = lerp(0.1, 1, ease.outQuart(prog(t, T.markIn, T.markRest - 0.15)));
    const slide = ease.inOutCubic(prog(t, T.slide[0], T.slide[1]));
    const cx = markHome[0] * slide, cy = markHome[1] * slide;
    const fade = clamp((t - T.markIn) / 0.25) * (1 - clamp((t - T.logoOut) / 0.1));
    const settle = 1 + 0.012 * ease.inOutCubic(prog(t, T.slide[1], T.logoOut));
    const size = markSize * sc * settle;
    const tilt = -0.52, pitch = 0.18 * (1 - ease.outCubic(p));
    const depth = 0.17 * size;
    const f = 2.2 * S;
    const LAYERS = 40;
    const layers = [];
    for (let i = 0; i <= LAYERS; i++) {
      const z = (i / LAYERS) * depth;
      const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([u, v]) => {
        let X = u * size, Y = v * size, Z = z;
        // R = Rz(tilt) Ry(spin) Rx(pitch) Rz(-tilt)
        [X, Y] = rot(X, Y, -tilt);
        [Y, Z] = rot(Y, Z, pitch);
        [X, Z] = rot(X, Z, spin);
        [X, Y] = rot(X, Y, tilt);
        const s = f / (f + Z);
        return [cx + X * s, cy + Y * s, Z];
      });
      const zc = corners.reduce((a, c) => a + c[2], 0) / 4;
      layers.push({ i, M: squareToQuad(corners), zc });
    }
    layers.sort((a, b) => b.zc - a.zc);
    // face normal faces the camera when the front layer is the nearest
    const facing = Math.cos(spin) * Math.cos(pitch);
    const lit = 0.55 + 0.45 * Math.abs(facing);
    const sideA = [0.05, 0.36, 0.42], sideB = [0.12, 0.62, 0.66];
    for (const L of layers) {
      const cap = L.i === 0 || L.i === LAYERS;
      if (cap) {
        R.sprite(markFace, { M: L.M, aspect: 1 }, null, { opacity: fade, bright: lit + 0.25 * Math.pow(Math.abs(Math.sin(spin * 0.5)), 8) });
      } else {
        const g = 0.5 + 0.5 * Math.sin(spin + L.i / LAYERS);
        const tint = sideA.map((v, j) => lerp(v, sideB[j], g));
        R.sprite(markFlat, { M: L.M, aspect: 1 }, null, { opacity: fade, tint, tintAmt: 1 });
      }
    }
  }

  function wordmark(t) {
    if (t < T.letters || t >= T.logoOut + 0.12) return;
    const fade = 1 - clamp((t - T.logoOut) / 0.1);
    const settle = 1 + 0.012 * ease.inOutCubic(prog(t, T.slide[1], T.logoOut));
    letters.forEach((L, i) => {
      const p = prog(t, T.letters + i * 0.065, T.letters + i * 0.065 + 0.16);
      if (p <= 0) return;
      const e = ease.outCubic(p);
      R.sprite(L.tex, { x: (L.cx - (1 - e) * 0.05 * lockupH) * settle, y: L.cy * settle, w: L.w * settle, h: L.h * settle }, null, {
        opacity: clamp(p * 2.5) * fade, lod: (1 - e) * 1.5 - 0.3,
      });
    });
  }

  // ---------------------------------------------------------------- frame
  function scene(R, t) {
    background(t);
    type(t);
    mark(t);
    wordmark(t);
  }

  function post() {
    return { bloom: 0.12, bloomThreshold: 0.92, chroma: 0.0, vignette: 0.12, grain: 0.022, exposure: 1.0 };
  }

  // hairline grid: margins + centre line broken around the content
  function hud(ctx, t) {
    const m = 56 * U;
    const top = 0.044 * H, bot = H - 0.044 * H;
    const toLogo = ease.inOutCubic(prog(t, 1.75, 2.35));
    const toText = ease.inOutCubic(prog(t, T.logoOut - 0.1, T.wordsIn + 0.3));
    const gText = textBlockH + 150 * U, gLogo = Math.max(lockupH, markSize) + 150 * U;
    const gap = lerp(lerp(gText, gLogo, toLogo), gText, toText);
    ctx.save();
    ctx.strokeStyle = 'rgba(214,222,255,0.62)';
    ctx.lineWidth = Math.max(1, 1.4 * U);
    const line = (x, y0, y1) => { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); };
    const cx = Math.round(W / 2) + 0.5;
    line(Math.round(m) + 0.5, top, bot);
    line(Math.round(W - m) + 0.5, top, bot);
    line(cx, top, H / 2 - gap / 2);
    line(cx, H / 2 + gap / 2, bot);
    ctx.restore();
  }

  return { scene, post, hud };
}

// ------------------------------------------------------------------ helpers
function rot(a, b, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [a * c - b * s, a * s + b * c];
}

// Homography taking the unit square to a quad (Heckbert), as a column-major
// mat3: corners in order (0,0) (1,0) (1,1) (0,1).
function squareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  return new Float32Array([a, d, g, b, e, h, c, f, 1]);
}

function wordTexture(R, text, px) {
  const ctx0 = document.createElement('canvas').getContext('2d');
  ctx0.font = `500 ${px}px Figtree`;
  ctx0.letterSpacing = `${-0.012 * px}px`;
  const m = ctx0.measureText(text);
  const pad = Math.ceil(px * 0.25);
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(m.width) + pad * 2;
  cv.height = Math.ceil(px * 1.3) + pad * 2;
  const ctx = cv.getContext('2d');
  ctx.font = `500 ${px}px Figtree`;
  ctx.letterSpacing = `${-0.012 * px}px`;
  ctx.fillStyle = INK;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, cv.height / 2 + px * 0.04);
  const t = R.textureFromCanvas(cv);
  return t;
}

// Rasterize SVG path(s) inside `box` (SVG units, padded by 4) at `scale`.
// fill 'mint' paints the brand glass gradient.
function pathTexture(R, ps, box, scale, fill) {
  const pad = 4;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil((box[2] - box[0] + 2 * pad) * scale);
  cv.height = Math.ceil((box[3] - box[1] + 2 * pad) * scale);
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  ctx.translate(-box[0] + pad, -box[1] + pad);
  if (fill === 'mint') {
    const g = ctx.createLinearGradient(box[0], box[1], box[2], box[3]);
    g.addColorStop(0, '#A9FFF0');
    g.addColorStop(0.45, '#5BF0D6');
    g.addColorStop(1, '#18BFC6');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = fill;
  }
  for (const p of ps) ctx.fill(new Path2D(p.d), p.evenodd ? 'evenodd' : 'nonzero');
  return R.textureFromCanvas(cv);
}

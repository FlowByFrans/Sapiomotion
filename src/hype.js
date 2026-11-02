// Sapio hype cut — an editorial montage after the "hype_real" reference,
// rebuilt in the Sapio identity and worded from the whitepaper
// ("Sapio: From Distributed Intelligence to Collective Action", rev. 16 Oct 2026).
//
// The edit mirrors the reference's rhythm: a stutter open, a setup with
// excerpt cards, a montage that accelerates to a 2-frame strobe, then an
// exponential slow-down onto statements and the lockup. Every on-screen line
// is quoted (or minimally condensed) from the whitepaper.
//
// Shots are chosen from the output frame index (never the sub-frame time), so
// cuts stay hard even with motion blur.

import { clamp, lerp, ease } from './timeline.js';

const FPS = 30;

const HEX = {
  blue: '#0A45DE',
  paper: '#F1F5F8',
  white: '#FBFCFD',
  ink: '#101421',
  mint: '#59F0D7',
  aqua: '#02BAC8',
  deep: '#0663B2',
  mist: '#C7D1E2',
};
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const alpha = (h, a) => `rgba(${rgb(h).map((v) => Math.round(v * 255)).join(',')},${a})`;

const SRC = 'SAPIO WHITEPAPER';

export async function createHype(R) {
  const W = R.W, H = R.H, U = Math.min(W, H) / 1080;

  // ---------------------------------------------------------------- assets
  const faces = [
    ['Figtree', 'Figtree-Medium.ttf', '500'], ['Figtree', 'Figtree-Bold.ttf', '700'], ['Figtree', 'Figtree-ExtraBold.ttf', '800'],
    ['STIX Two Text', 'STIXTwoText-Italic.ttf', '400', 'italic'],
  ];
  for (const [fam, file, weight, style] of faces) {
    const f = new FontFace(fam, `url(../assets/fonts/${file})`, { weight, style: style || 'normal' });
    await f.load();
    document.fonts.add(f);
  }
  await document.fonts.load('500 20px "JetBrains Mono"');
  const load = async (url) => {
    const blob = await (await fetch('../' + url)).blob();
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
    const t = R.textureFromCanvas(bmp);
    return t;
  };
  const tex = {
    flower1: await load('assets/brand/flower_01.png'),
    flower4: await load('assets/brand/flower_04.png'),
    leaf: await load('assets/brand/leaf_01.png'),
    box: await load('assets/brand/performance-box.png'),
    sketch: await load('assets/brand/sapio-sketch.png'),
    pattern: await load('assets/brand/sapio-pattern-white.png'),
    bloom: await load('assets/mark-bloom.webp'),
    tower: R.tex.tower,
    liquid: R.tex.liquid,
  };
  const svg = await (await fetch('../assets/sapio/sapio-lockup.svg')).text();
  const paths = [...svg.matchAll(/<path([^>]*)d="([^"]+)"/g)].map((m) => ({ d: m[2], p: new Path2D(m[2]), evenodd: /evenodd/.test(m[1]) }));
  const markPath = paths[0];
  const markLen = (() => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', markPath.d);
    return el.getTotalLength();
  })();

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // ---------------------------------------------------------------- helpers
  let used = false;
  let shotZoom = 1; // slow push-in applied to every image in the current shot
  const g = () => { used = true; return ctx; };
  const bg = (hex) => R.clear(rgb(hex));

  // brand image: h = display height (px). mode 'engrave' | 'duo' | 'color'
  function img(name, o = {}) {
    const t = tex[name];
    const cover = o.cover ? Math.max(H / t.h, W / t.w) : 0;
    const s = cover || (o.h ?? 0.9 * H) / t.h;
    const z = (o.zoom ?? 1) * shotZoom;
    const w = t.w * s * z, h = t.h * s * z;
    const fu = o.focus?.[0] ?? 0.5, fv = o.focus?.[1] ?? 0.5;
    const mode = { color: 0, engrave: 1, duo: 2 }[o.mode ?? 'engrave'];
    R.sprite(t, { x: (o.x ?? 0) - (fu - 0.5) * w, y: (o.y ?? 0) - (fv - 0.5) * h, w, h, rot: o.rot ?? 0 }, null, {
      mode, ink: rgb(o.ink ?? HEX.blue), paper: rgb(o.paper ?? HEX.paper),
      hatch: [(o.spacing ?? 5.5) * U, o.angle ?? 0.72, o.contrast ?? 1.35, o.cross ?? 0.56], tone: o.tone ?? 0, opacity: o.opacity ?? 1,
    });
  }

  function font(weight, px, fam = 'Figtree') { return `${weight} ${Math.round(px)}px ${fam}`; }
  function mono(text, x, y, o = {}) {
    const c = g();
    c.font = `500 ${Math.round((o.size ?? 16) * U)}px "JetBrains Mono"`;
    c.letterSpacing = `${(o.track ?? 0.08) * (o.size ?? 16) * U}px`;
    c.fillStyle = o.color ?? alpha(HEX.ink, 0.7);
    c.textAlign = o.align ?? 'left';
    c.textBaseline = o.base ?? 'alphabetic';
    c.fillText(text, x, y);
    c.letterSpacing = '0px';
  }
  // math in STIX italic; "_x" or "_{xy}" sets a subscript
  function math(text, x, y, o = {}) {
    const c = g();
    const size = (o.size ?? 28) * U;
    const parts = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '_') {
        let sub = text[i + 1];
        if (sub === '{') { const j = text.indexOf('}', i); sub = text.slice(i + 2, j); i = j; } else i++;
        parts.push([sub, true]);
      } else if (parts.length && !parts[parts.length - 1][1]) parts[parts.length - 1][0] += text[i];
      else parts.push([text[i], false]);
    }
    const fontFor = (sub) => font('italic 400', sub ? size * 0.64 : size, '"STIX Two Text"');
    let w = 0;
    for (const [t, sub] of parts) { c.font = fontFor(sub); w += c.measureText(t).width; }
    let cx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    c.fillStyle = o.color ?? HEX.ink;
    c.textAlign = 'left'; c.textBaseline = o.base ?? 'alphabetic';
    for (const [t, sub] of parts) {
      c.font = fontFor(sub);
      c.fillText(t, cx, y + (sub ? size * 0.2 : 0));
      cx += c.measureText(t).width;
    }
    return w;
  }

  function wrap(c, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (c.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  // frame chrome used on most plates: source label + plate counter
  function chrome(color, left, right) {
    mono(left, 56 * U, 64 * U, { color, size: 15 });
    if (right) mono(right, W - 56 * U, 64 * U, { color, size: 15, align: 'right' });
  }

  // ---------------------------------------------------------------- vector plates
  function waveBundle({ color, amp = 0.22 * H, phase = 0, n = 11, cy = H / 2, sharp = 1, lw = 1.5 }) {
    const c = g();
    c.strokeStyle = color;
    c.lineWidth = lw * U;
    const gap = 7.5 * U;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * gap;
      c.beginPath();
      for (let x = -40; x <= W + 40; x += 3) {
        const u = (x - W * 0.5) / (W * 0.035 * sharp);
        const env = Math.exp(-u * u * 0.5);
        const k = 1 + i * 0.05;
        const y = cy + off * (1 - env * 0.55) - amp * env * Math.sin(u * 1.9 * k + phase + i * 0.18) * (0.85 + 0.03 * i);
        x === -40 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
  }

  function rings({ color, n = 7, r0 = 0.07 * H, dr = 0.055 * H, dot = true, cross = true, labels }) {
    const c = g();
    const cx = W / 2, cy = H / 2;
    c.strokeStyle = color;
    c.lineWidth = 1.4 * U;
    for (let i = 0; i < n; i++) { c.beginPath(); c.arc(cx, cy, r0 + i * dr, 0, Math.PI * 2); c.stroke(); }
    if (cross) {
      c.globalAlpha = 0.6;
      c.beginPath(); c.moveTo(0, cy); c.lineTo(W, cy); c.moveTo(cx, 0); c.lineTo(cx, H); c.stroke();
      c.globalAlpha = 1;
    }
    if (dot) { c.fillStyle = color; c.beginPath(); c.arc(cx, cy, 0.022 * H, 0, Math.PI * 2); c.fill(); }
    if (labels) labels.forEach((l, i) => math(l, cx + (r0 + (i + 1) * dr) * 0.74 + 10 * U, cy - (r0 + (i + 1) * dr) * 0.74 - 6 * U, { color, size: 34 }));
  }

  function greek(sym, label, fg) {
    const c = g();
    c.font = font('400', 470 * U, '"STIX Two Text"').replace('400', 'italic 400');
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(sym, W / 2, H * 0.46);
    mono(label, W / 2, H * 0.84, { color: fg, size: 20, align: 'center', track: 0.2 });
  }

  function axes(c, x0, y0, x1, y1, color) {
    c.strokeStyle = color; c.lineWidth = 1.5 * U;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, y1); c.lineTo(x1, y1); c.stroke();
    c.globalAlpha = 0.25;
    for (let i = 1; i < 5; i++) { const y = lerp(y1, y0, i / 5); c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); }
    c.globalAlpha = 1;
  }

  function decayChart(fg, accent, reveal = 1) {
    const c = g();
    const x0 = 0.16 * W, x1 = 0.86 * W, y0 = 0.2 * H, y1 = 0.8 * H;
    axes(c, x0, y0, x1, y1, fg);
    const curves = [[0.02, accent], [0.035, fg], [0.06, alpha(HEX.mist, 0.9)]];
    for (const [th, col] of curves) {
      c.strokeStyle = col; c.lineWidth = 2.6 * U;
      c.beginPath();
      for (let i = 0; i <= 200 * reveal; i++) {
        const n = i * 2.3;
        let f = 1;
        for (let m = 1; m <= n; m += 1) f *= 1 / (1 + th * (1 + 0.4 * Math.sin(m * 0.3)));
        const x = lerp(x0, x1, i / 200), y = lerp(y1, y0, f * 0.95);
        i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
    c.setLineDash([8 * U, 8 * U]); c.strokeStyle = fg; c.lineWidth = 1.4 * U;
    const ye = lerp(y1, y0, 0.1 * 0.95);
    c.beginPath(); c.moveTo(x0, ye); c.lineTo(x1, ye); c.stroke(); c.setLineDash([]);
    math('ε = 0.1', x1, ye - 14 * U, { color: fg, align: 'right', size: 30 });
    math('f(n) = ∏ δ_m', x0 + 18 * U, y0 + 14 * U, { color: fg, size: 34 });
    mono('RELEASE EVENTS →', x1, y1 + 36 * U, { color: fg, align: 'right', size: 14 });
    chrome(fg, `${SRC} — FIG. 8`, 'RETENTION');
  }

  function auctionChart(fg, reveal = 1) {
    const c = g();
    const x0 = 0.16 * W, x1 = 0.86 * W, y0 = 0.2 * H, y1 = 0.8 * H;
    axes(c, x0, y0, x1, y1, fg);
    const mu = 0.12, aB = 3.2;
    const top = lerp(y1, y0, 0.92);
    c.setLineDash([10 * U, 8 * U]); c.lineWidth = 1.5 * U;
    c.beginPath(); c.moveTo(x0, top); c.lineTo(x1, top); c.stroke(); c.setLineDash([]);
    math('1 + μ', x1 - 4 * U, top - 16 * U, { color: fg, align: 'right', size: 34 });
    c.lineWidth = 3.2 * U;
    c.beginPath();
    for (let i = 0; i <= 160 * reveal; i++) {
      const tau = i / 160;
      const gB = (1 + mu) * (1 - Math.exp(-aB * tau)) / (1 - Math.exp(-aB));
      const x = lerp(x0, x1, tau), y = lerp(y1, y0, gB / (1 + mu) * 0.92);
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
    math('g_B(τ)', x0 + 18 * U, y0 + 14 * U, { color: fg, size: 36 });
    mono('τ →', x1, y1 + 36 * U, { color: fg, align: 'right', size: 14 });
    chrome(fg, `${SRC} — EQ. 12`, 'ZERO-START AUCTION');
  }

  function proposers(fg, accent) {
    const c = g();
    const lx = 0.2 * W, rx = 0.8 * W, cx = 0.5 * W, cy = 0.5 * H;
    c.strokeStyle = fg; c.fillStyle = fg; c.lineWidth = 1.6 * U;
    c.font = font('500', 22 * U); c.textBaseline = 'middle';
    for (let i = 0; i < 5; i++) {
      const y = lerp(0.24, 0.76, i / 4) * H;
      c.beginPath(); c.arc(lx, y, 26 * U, 0, Math.PI * 2); c.stroke();
      c.textAlign = 'center'; c.fillText(`P${i + 1}`, lx, y);
      c.beginPath(); c.moveTo(lx + 26 * U, y); c.bezierCurveTo(cx - 0.12 * W, y, cx - 0.12 * W, cy, cx - 0.1 * W, cy); c.stroke();
      c.beginPath(); c.moveTo(cx + 0.1 * W, cy); c.bezierCurveTo(cx + 0.12 * W, cy, cx + 0.12 * W, y, rx - 26 * U, y); c.stroke();
      c.beginPath(); c.rect(rx - 26 * U, y - 26 * U, 52 * U, 52 * U); c.stroke();
      c.fillText(`T${i + 1}`, rx, y);
    }
    c.strokeStyle = accent; c.lineWidth = 2.4 * U;
    c.beginPath(); c.rect(cx - 0.1 * W, cy - 0.09 * H, 0.2 * W, 0.18 * H); c.stroke();
    c.fillStyle = accent; c.textAlign = 'center';
    c.font = font('700', 28 * U); c.fillText('SAPIO RESERVE', cx, cy);
    chrome(fg, `${SRC} — FIG. 3`, 'PROPOSERS → RESERVE');
  }

  function routing(fg) {
    const c = g();
    const items = ['T_1', 'SRT_1', 'Multi', 'SRT_2', 'T_k'];
    c.strokeStyle = fg; c.lineWidth = 2.2 * U;
    const xs = items.map((_, i) => lerp(0.12, 0.88, i / 4) * W);
    items.forEach((t, i) => {
      math(t, xs[i], H / 2 + 30 * U, { color: fg, size: 96, align: 'center' });
      if (i < 4) {
        const a = xs[i] + 0.075 * W, b = xs[i + 1] - 0.075 * W;
        c.beginPath(); c.moveTo(a, H / 2); c.lineTo(b, H / 2); c.lineTo(b - 14 * U, H / 2 - 9 * U); c.moveTo(b, H / 2); c.lineTo(b - 14 * U, H / 2 + 9 * U); c.stroke();
      }
    });
    chrome(fg, `${SRC} — §3.8`, 'LIQUIDITY HIGHWAYS');
  }

  function formula(fg) {
    const c = g();
    const size = 92 * U;
    c.fillStyle = fg; c.strokeStyle = fg;
    c.textBaseline = 'alphabetic';
    const cx = W / 2, cy = H / 2;
    const run = (parts, x, y, measure = false) => {
      let w = 0;
      for (const [t, kind] of parts) {
        const sz = kind === 'sub' ? size * 0.62 : size;
        c.font = font('italic 400', sz, '"STIX Two Text"');
        const dy = kind === 'sub' ? size * 0.22 : 0;
        if (!measure) c.fillText(t, x + w, y + dy);
        w += c.measureText(t).width;
      }
      return w;
    };
    c.textAlign = 'left';
    const lhs = [['ŵ'], ['k', 'sub'], [' = ']];
    const num = [['w'], ['k', 'sub'], ['(1 + θ'], ['B', 'sub'], [') + θ'], ['P', 'sub'], [' p'], ['k', 'sub']];
    const den = [['1 + θ']];
    const lw = run(lhs, 0, 0, true), nw = run(num, 0, 0, true), dw = run(den, 0, 0, true);
    const x0 = cx - (lw + nw) / 2;
    run(lhs, x0, cy + size * 0.32);
    run(num, x0 + lw, cy - size * 0.28);
    run(den, x0 + lw + (nw - dw) / 2, cy + size * 0.92);
    c.lineWidth = 2.6 * U;
    c.beginPath(); c.moveTo(x0 + lw, cy + size * 0.06); c.lineTo(x0 + lw + nw, cy + size * 0.06); c.stroke();
    chrome(fg, `${SRC} — EQ. 6`, 'TARGET WEIGHT');
  }

  function treemap(fg, accent) {
    const c = g();
    const r = rngLocal(11);
    c.strokeStyle = fg; c.lineWidth = 1.4 * U;
    c.font = `500 ${Math.round(15 * U)}px "JetBrains Mono"`; c.fillStyle = fg;
    let k = 1;
    const split = (x, y, w, h, depth) => {
      if (depth === 0 || w * h < 0.012 * W * H) {
        c.strokeRect(x + 4 * U, y + 4 * U, w - 8 * U, h - 8 * U);
        c.fillText(`T${k++}`, x + 14 * U, y + 30 * U);
        return;
      }
      const f = 0.35 + r() * 0.3;
      if (w > h) { split(x, y, w * f, h, depth - 1); split(x + w * f, y, w * (1 - f), h, depth - 1); } else { split(x, y, w, h * f, depth - 1); split(x, y + h * f, w, h * (1 - f), depth - 1); }
    };
    const X = 0.1 * W, Y = 0.15 * H, WW = 0.8 * W, HH = 0.72 * H;
    split(X, Y, WW * 0.62, HH, 4);
    split(X + WW * 0.62, Y, WW * 0.38, HH, 3);
    c.strokeStyle = accent; c.lineWidth = 3 * U;
    c.strokeRect(X, Y, WW * 0.62, HH); c.strokeRect(X + WW * 0.62, Y, WW * 0.38, HH);
    math('SRT_1', X + 10 * U, Y - 16 * U, { color: accent, size: 30 });
    math('SRT_2', X + WW * 0.62 + 10 * U, Y - 16 * U, { color: accent, size: 30 });
    chrome(fg, `${SRC} — FIG. 1`, 'NESTED COMPOSITION');
  }

  function triangle(fg, accent) {
    const c = g();
    const cx = W / 2, cy = H * 0.54, R0 = 0.3 * H;
    const pts = [0, 1, 2].map((i) => [cx + R0 * Math.cos(-Math.PI / 2 + i * 2 * Math.PI / 3), cy + R0 * Math.sin(-Math.PI / 2 + i * 2 * Math.PI / 3)]);
    c.strokeStyle = fg; c.lineWidth = 2 * U;
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.stroke();
    c.fillStyle = accent;
    pts.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 10 * U, 0, Math.PI * 2); c.fill(); });
    const labels = ['SIGNAL FIDELITY', 'RESOURCE EFFICIENCY', 'SYSTEM SECURITY'];
    mono(labels[0], pts[0][0], pts[0][1] - 30 * U, { color: fg, size: 18, align: 'center' });
    mono(labels[1], pts[1][0] + 20 * U, pts[1][1] + 46 * U, { color: fg, size: 18, align: 'center' });
    mono(labels[2], pts[2][0] - 20 * U, pts[2][1] + 46 * U, { color: fg, size: 18, align: 'center' });
    chrome(fg, `${SRC} — FIG. 5`, 'DESIGN TENSIONS');
  }

  function markTiles(fg) {
    const c = g();
    const s = 150 * U;
    c.strokeStyle = fg; c.lineWidth = 2.2 * U / (s / 153.4) ;
    for (let gy = -1; gy < H / s + 1; gy++) {
      for (let gx = -1; gx < W / s + 1; gx++) {
        c.save();
        c.translate(gx * s + s / 2, gy * s + s / 2);
        c.rotate(((gx * 3 + gy * 5) % 4) * Math.PI / 2);
        c.scale(s / 153.4 * 0.9, s / 153.4 * 0.9);
        c.translate(-76.7, -76.7);
        c.stroke(markPath.p);
        c.restore();
      }
    }
  }

  // the brand's construction sketch, drawn as a live technical drawing
  function construction(p) {
    const c = g();
    const k = 0.66 * H / 153.4;
    const ox = W / 2 - 76.7 * k, oy = H / 2 - 76.7 * k;
    const X = (v) => ox + v * k, Y = (v) => oy + v * k;
    const lineP = ease.outCubic(clamp(p / 0.3));
    c.strokeStyle = alpha(HEX.ink, 0.28); c.lineWidth = 1.2 * U;
    const vx = [0, 28.4, 57.0, 77.7, 99.6, 115.7, 121.4, 153.4];
    const hy = [0, 38.3, 41.1, 69.8, 76.7, 98.5, 109.6, 131.5, 153.4];
    vx.forEach((v, i) => { const x = X(v); const e = clamp(lineP * 1.3 - i * 0.04); c.beginPath(); c.moveTo(x, H / 2 - e * H * 0.6); c.lineTo(x, H / 2 + e * H * 0.6); c.stroke(); });
    hy.forEach((v, i) => { const y = Y(v); const e = clamp(lineP * 1.3 - i * 0.03); c.beginPath(); c.moveTo(W / 2 - e * W * 0.6, y); c.lineTo(W / 2 + e * W * 0.6, y); c.stroke(); });
    // hatched construction boxes
    const boxes = [[77.7, 0.3, 153.4, 76.4], [0, 41.1, 57, 98.5], [78, 109.6, 121.4, 153.4], [56.3, 75.3, 78.4, 96.7], [78.4, 75.3, 111, 108]];
    const hp = ease.outCubic(clamp((p - 0.15) / 0.3));
    boxes.forEach(([a, b, cc, d], i) => {
      c.save();
      c.beginPath(); c.rect(X(a), Y(b), (cc - a) * k * clamp(hp * 1.4 - i * 0.08), (d - b) * k); c.clip();
      c.strokeStyle = alpha('#9AA7BA', 0.55); c.lineWidth = 5 * U;
      for (let s = -H; s < W + H; s += 16 * U) { c.beginPath(); c.moveTo(s, 0); c.lineTo(s - H, H); c.stroke(); }
      c.restore();
      c.strokeStyle = alpha(HEX.ink, 0.6); c.lineWidth = 1.4 * U;
      c.strokeRect(X(a), Y(b), (cc - a) * k, (d - b) * k);
    });
    // construction circles
    const circles = [[115.7, 38.3, 38.0, '56'], [28.4, 69.8, 28.7, '42'], [99.6, 131.5, 21.85, '32']];
    const cp = clamp((p - 0.2) / 0.35);
    circles.forEach(([x, y, r, l], i) => {
      const e = ease.inOutCubic(clamp(cp * 1.4 - i * 0.15));
      if (e <= 0) return;
      c.fillStyle = alpha('#E7ECF2', e);
      c.beginPath(); c.arc(X(x), Y(y), r * k, 0, Math.PI * 2); c.fill();
      c.strokeStyle = HEX.ink; c.lineWidth = 2 * U;
      c.beginPath(); c.arc(X(x), Y(y), r * k, -Math.PI / 2, -Math.PI / 2 + e * Math.PI * 2); c.stroke();
      c.globalAlpha = clamp((cp - 0.3) * 3);
      c.font = font('500', 34 * U); c.fillStyle = HEX.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(l, X(x), Y(y));
      c.globalAlpha = 1;
    });
    [[67.3, 86, '16'], [95, 91.4, '24']].forEach(([x, y, l]) => {
      c.globalAlpha = clamp((cp - 0.4) * 3);
      c.font = font('500', 30 * U); c.fillStyle = HEX.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(l, X(x), Y(y));
      c.globalAlpha = 1;
    });
    // trace the mark outline, then fill it with brand blue
    const tp = ease.inOutCubic(clamp((p - 0.4) / 0.42));
    c.save();
    c.translate(ox, oy); c.scale(k, k);
    if (tp > 0) {
      c.setLineDash([markLen * tp, markLen]);
      c.strokeStyle = HEX.ink; c.lineWidth = 3.2 * U / k;
      c.stroke(markPath.p);
      c.setLineDash([]);
    }
    const fp = ease.outCubic(clamp((p - 0.8) / 0.2));
    if (fp > 0) { c.fillStyle = alpha(HEX.blue, 0.94 * fp); c.fill(markPath.p); }
    c.restore();
    chrome(alpha(HEX.ink, 0.75), 'FROM DISTRIBUTED INTELLIGENCE', 'TO COLLECTIVE ACTION');
  }

  // whitepaper excerpt set like a news card
  function excerpt({ label, page, text, highlight, sub }, p, lt) {
    const c = g();
    const e = ease.outCubic(clamp(lt * FPS / 4));
    const m = 56 * U;
    mono(label, m, 64 * U, { color: HEX.blue, size: 16, track: 0.14 });
    mono(page, W - m, 64 * U, { color: alpha(HEX.ink, 0.5), size: 15, align: 'right' });
    c.fillStyle = alpha(HEX.ink, 0.15); c.fillRect(m, 84 * U, W - 2 * m, 1.5 * U);
    const size = 66 * U;
    c.font = font('700', size);
    c.letterSpacing = `${-0.01 * size}px`;
    const lines = wrap(c, text, 0.66 * W);
    const lh = size * 1.18;
    const top = H * 0.48 - (lines.length * lh) / 2 + (1 - e) * 14 * U;
    lines.forEach((ln, i) => {
      const y = top + i * lh;
      if (highlight) {
        const wd = c.measureText(ln).width;
        const hp = ease.outCubic(clamp(lt * FPS / 5 - i * 0.25));
        c.fillStyle = HEX.ink;
        c.fillRect(0.1 * W - 14 * U, y - size * 0.06, (wd + 28 * U) * hp, lh * 0.98);
        c.fillStyle = HEX.white;
      } else c.fillStyle = alpha(HEX.ink, e);
      c.textBaseline = 'top'; c.textAlign = 'left';
      c.fillText(ln, 0.1 * W, y);
    });
    c.letterSpacing = '0px';
    c.font = font('italic 400', 28 * U, '"STIX Two Text"');
    c.fillStyle = alpha(HEX.ink, 0.55 * e);
    c.fillText(sub, 0.1 * W, top + lines.length * lh + 26 * U);
  }

  // big statement plate
  function statement(text, { fg, size = 128, src, caps = false, maxW = 0.84 }, lt) {
    const c = g();
    const px = size * U;
    c.font = font('800', px);
    c.letterSpacing = `${-0.025 * px}px`;
    const str = caps ? text.toUpperCase() : text;
    const lines = wrap(c, str, maxW * W);
    const lh = px * 1.02;
    const top = H / 2 - (lines.length * lh) / 2;
    let wi = 0;
    const space = px * 0.24;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = fg;
    lines.forEach((ln, li) => {
      let x = 0.08 * W;
      for (const word of ln.split(' ')) {
        // words land in quick succession; the first is already 40% in on the cut frame
        const e = ease.outCubic(clamp((lt * FPS + 1.2) / 3 - wi * 0.3));
        c.globalAlpha = e;
        c.fillText(word, x, top + li * lh + (1 - e) * 28 * U);
        x += c.measureText(word).width + space;
        wi++;
      }
    });
    c.globalAlpha = 1;
    c.letterSpacing = '0px';
    if (src) chrome(fg, `${SRC} — ${src}`, '');
  }

  function loopDiagram(fg, p) {
    const c = g();
    const cx = 0.74 * W, cy = 0.5 * H, r = 0.27 * H;
    const nodes = [
      ['FORECAST AGGREGATION', 'The Forecast'],
      ['OPTIMISTIC EXECUTION', 'The Commitment'],
      ['PERFORMANCE MEASUREMENT', 'The Correction'],
    ];
    const ang = (i) => -Math.PI / 2 + i * (2 * Math.PI / 3);
    c.strokeStyle = fg; c.lineWidth = 2 * U;
    const e = ease.inOutCubic(clamp(p / 0.85));
    for (let i = 0; i < 3; i++) {
      const a0 = ang(i) + 0.32, a1 = ang(i + 1) - 0.32;
      const seg = clamp(e * 3 - i);
      if (seg <= 0) continue;
      const am = lerp(a0, a1, seg);
      c.beginPath(); c.arc(cx, cy, r, a0, am); c.stroke();
      if (seg >= 1) {
        const hx = cx + r * Math.cos(a1), hy = cy + r * Math.sin(a1);
        const tx = -Math.sin(a1), ty = Math.cos(a1);
        c.beginPath();
        c.moveTo(hx, hy); c.lineTo(hx - tx * 16 * U + ty * 9 * U, hy - ty * 16 * U - tx * 9 * U);
        c.moveTo(hx, hy); c.lineTo(hx - tx * 16 * U - ty * 9 * U, hy - ty * 16 * U + tx * 9 * U);
        c.stroke();
      }
    }
    nodes.forEach(([a, b], i) => {
      const x = cx + r * Math.cos(ang(i)), y = cy + r * Math.sin(ang(i));
      const v = clamp(e * 3 - i + 0.6);
      c.globalAlpha = v;
      c.beginPath(); c.arc(x, y, 9 * U, 0, Math.PI * 2); c.fillStyle = fg; c.fill();
      mono(a, x, y + (i === 0 ? -26 : 40) * U, { color: fg, size: 15, align: 'center', track: 0.12 });
      c.font = font('italic 400', 24 * U, '"STIX Two Text"'); c.textAlign = 'center'; c.fillStyle = fg;
      c.fillText(b, x, y + (i === 0 ? -52 : 70) * U);
      c.globalAlpha = 1;
    });
  }

  // ---------------------------------------------------------------- end card
  const lockupBox = { w: 568, h: 193 };
  function endCard(lt) {
    // embossed brand pattern, with engraved peonies drifting in from the right
    img('pattern', { mode: 'color', cover: true, zoom: 1.02 + lt * 0.006 });
    img('flower4', { x: 0.43 * W, y: 0.36 * H, h: 0.82 * H, angle: 0.6, tone: -0.22, contrast: 1.6, opacity: 0.9, rot: -0.2 + lt * 0.02 });
    img('leaf', { x: 0.46 * W - lt * 6 * U, y: -0.38 * H, h: 0.7 * H, angle: 1.1, tone: 0.1, opacity: 0.85, rot: 2.6 });
    const c = g();
    const f = lt * FPS;
    const scale = (0.42 * W) / lockupBox.w * (1 + 0.012 * clamp(lt / 2.2));
    const ox = W / 2 - (lockupBox.w / 2) * scale, oy = H * 0.47 - 77.5 * scale;
    // mark: quick spring in
    const me = ease.spring(clamp(f / 16), 9, 0.45);
    c.save();
    c.translate(ox + 76.7 * scale, oy + 76.7 * scale);
    c.scale(scale * (0.85 + 0.15 * me), scale * (0.85 + 0.15 * me));
    c.translate(-76.7, -76.7);
    c.globalAlpha = clamp(f / 4);
    // brand logo gradient (deep blue → aqua) across the whole lockup, in lockup units
    const lg = c.createLinearGradient(0, 0, lockupBox.w, 0);
    lg.addColorStop(0, HEX.deep); lg.addColorStop(0.55, '#039AD2'); lg.addColorStop(1, HEX.aqua);
    c.fillStyle = lg;
    c.fill(markPath.p);
    c.restore();
    // wordmark letters (file order p, a, o, s, i, i-dot) revealed s → o
    const order = [4, 2, 1, 5, 6, 3];
    order.forEach((pi, j) => {
      const le = ease.outCubic(clamp((f - 5 - j * 1.6) / 5));
      if (le <= 0) return;
      c.save();
      c.translate(ox - (1 - le) * 18 * U, oy);
      c.scale(scale, scale);
      c.globalAlpha = le;
      c.fillStyle = lg;
      c.fill(paths[pi].p, paths[pi].evenodd ? 'evenodd' : 'nonzero');
      c.restore();
    });
    const te = ease.outCubic(clamp((f - 16) / 8));
    c.globalAlpha = te;
    c.font = font('500', 40 * U);
    c.fillStyle = alpha(HEX.ink, 0.82);
    c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillText('From Distributed Intelligence to Collective Action', W / 2, oy + 205 * scale + (1 - te) * 12 * U);
    c.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- the edit
  const P = HEX;
  const shots = [];
  let section = 'open';
  const add = (d, draw, tag = 'cut') => shots.push({ d, draw, tag, section });

  // A — stutter open
  add(6, (s) => { bg(P.blue); waveBundle({ color: P.paper, phase: s.lt * 9, amp: 0.2 * H }); });
  add(6, (s) => { bg(P.paper); waveBundle({ color: P.blue, phase: 1.2 + s.lt * 9, amp: 0.26 * H, sharp: 1.3 }); });
  add(3, () => { bg(P.blue); rings({ color: P.paper }); });
  add(3, () => { bg(P.blue); const c = g(); c.font = font('800', 330 * U); c.letterSpacing = `${-0.03 * 330 * U}px`; c.fillStyle = P.paper; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText('NOW.', W * 0.94, H * 0.5); c.letterSpacing = '0px'; });
  add(3, (s) => { bg(P.paper); waveBundle({ color: P.blue, phase: 2.4 + s.lt * 9, amp: 0.32 * H, sharp: 0.8 }); });

  // B — setup: the mark constructed, the problem quoted, the thesis
  section = 'setup';
  add(34, (s) => { bg(P.paper); construction(s.p); });
  add(13, (s) => { bg(P.white); excerpt({ label: `${SRC} · ABSTRACT`, page: 'P. 1', text: 'Decentralized markets are excellent at revealing what participants believe.', sub: 'Sapio: From Distributed Intelligence to Collective Action' }, s.p, s.lt); });
  add(12, (s) => { bg(P.white); excerpt({ label: `${SRC} · ABSTRACT`, page: 'P. 1', text: 'They are less capable of turning that distributed intelligence into coordinated action.', highlight: true, sub: 'Sapio: From Distributed Intelligence to Collective Action' }, s.p, s.lt); });
  add(12, (s) => { bg(P.white); excerpt({ label: `${SRC} · §3.1`, page: 'P. 13', text: 'An index automates the weighting, but it does not automate the thinking.', sub: 'The starting point is a gap between intelligence and collective action.' }, s.p, s.lt); });
  add(30, (s) => {
    bg(P.blue);
    statement('Prediction becomes execution.', { fg: P.paper, size: 128, src: '§1.4', maxW: 0.5 }, s.lt);
    loopDiagram(P.paper, s.p);
  }, 'statement');

  // C — montage, accelerating into a 2-frame strobe
  section = 'montage';
  const plates = {
    flower1: () => { bg(P.paper); img('flower1', { h: 0.96 * H, tone: -0.46, contrast: 2.0 }); },
    theta: () => { bg(P.blue); greek('θ', 'THE SPEED LIMIT', P.paper); },
    leaf: () => { bg(P.paper); img('leaf', { h: 1.0 * H, angle: 1.05, rot: -0.15 }); },
    decay: (s) => { bg(P.ink); decayChart(P.paper, P.mint, 0.4 + 0.6 * s.p); },
    tower: () => { bg(P.paper); img('tower', { h: 1.12 * H, y: 0.05 * H, spacing: 5 }); },
    auction: (s) => { bg(P.blue); auctionChart(P.paper, 0.5 + 0.5 * s.p); },
    duoBloom: () => { bg(P.blue); img('bloom', { mode: 'duo', cover: true, zoom: 1.15, ink: P.blue, paper: P.paper, contrast: 1.5 }); },
    flower4: () => { bg(P.paper); img('flower4', { h: 0.98 * H, angle: 0.45, tone: -0.44, contrast: 2.0 }); },
    mu: () => { bg(P.paper); greek('μ', 'THE SETTLEMENT BAND', P.blue); },
    proposers: () => { bg(P.ink); proposers(P.paper, P.mint); },
    bloomZoom: () => { bg(P.paper); img('bloom', { h: H, zoom: 1.9, focus: [0.56, 0.47], angle: 0.9 }); },
    routing: () => { bg(P.blue); routing(P.paper); },
    tiles: () => { bg(P.paper); markTiles(P.blue); },
    leafZoom: () => { bg(P.paper); img('leaf', { h: H, zoom: 2.3, focus: [0.42, 0.4], angle: 0.4 }); },
    duoLiquid: () => { bg(P.blue); img('liquid', { mode: 'duo', cover: true, ink: P.ink, paper: P.blue, contrast: 1.6, tone: 0.1 }); },
    beta: () => { bg(P.ink); greek('β', 'THE PERFORMANCE EXPONENT', P.mint); },
    flowerZoom: () => { bg(P.paper); img('flower1', { h: H, zoom: 2.4, focus: [0.48, 0.52], angle: 1.3, tone: -0.46, contrast: 2.0 }); },
    formula: () => { bg(P.paper); formula(P.blue); },
    duoTower: () => { bg(P.blue); img('tower', { h: 1.15 * H, y: 0.06 * H, ink: P.paper, contrast: -1.3, spacing: 5 }); },
    clock: () => { bg(P.blue); rings({ color: P.paper, n: 5, r0: 0.1 * H, dr: 0.07 * H, labels: ['τ_s', 'τ_m', 'τ_p'] }); chrome(P.paper, `${SRC} — FIG. 7`, 'FINALIZATIONS ARE THE CLOCK'); },
    box: () => { bg(P.paper); img('box', { h: 0.82 * H, spacing: 5, angle: 0.3 }); },
    treemap: () => { bg(P.ink); treemap(P.paper, P.mint); },
    bloom: () => { bg(P.paper); img('bloom', { h: 1.0 * H, angle: 0.72 }); },
    lambda: () => { bg(P.blue); greek('λσ', 'THE STANDING OFFER', P.paper); },
    sketch: () => { bg(P.paper); img('sketch', { mode: 'duo', h: H, zoom: 2.2, focus: [0.68, 0.3], ink: P.blue, paper: P.paper, contrast: 1.4 }); },
    duoFlower: () => { bg(P.blue); img('flower4', { mode: 'duo', h: 1.05 * H, ink: P.blue, paper: P.paper, contrast: 1.2, tone: 0.1 }); },
    triangle: () => { bg(P.paper); triangle(P.ink, P.blue); },
    leafRot: () => { bg(P.paper); img('leaf', { h: 1.1 * H, rot: 1.2, angle: 0.2 }); },
    decayBlue: (s) => { bg(P.blue); decayChart(P.paper, P.mint, 1); },
    towerZoom: () => { bg(P.paper); img('tower', { h: H, zoom: 2.0, focus: [0.45, 0.42], angle: 1.0 }); },
    kappa: () => { bg(P.ink); greek('κ', 'THE SIGNED QUANTITY GUARD', P.paper); },
    duoBloomZoom: () => { bg(P.blue); img('bloom', { mode: 'duo', h: H, zoom: 2.1, focus: [0.52, 0.5], ink: P.blue, paper: P.paper, contrast: 1.5 }); },
    chi: () => { bg(P.ink); greek('χ', 'THE HARD SLASH', P.paper); },
  };
  const push = (fn, amt = 0.05) => (s) => { shotZoom = 1 + amt * s.p; fn(s); };
  [['flower1', 5], ['theta', 4], ['leaf', 3], ['decay', 3], ['tower', 3], ['auction', 3]].forEach(([k, d]) => add(d, plates[k]));
  ['duoBloom', 'flower4', 'mu', 'proposers', 'bloomZoom', 'routing', 'tiles', 'leafZoom', 'duoLiquid', 'beta', 'flowerZoom', 'formula', 'duoTower',
    'clock', 'box', 'treemap', 'bloom', 'lambda', 'sketch', 'duoFlower', 'triangle', 'leafRot', 'decayBlue', 'towerZoom', 'kappa', 'duoBloomZoom']
    .forEach((k) => add(2, plates[k]));

  // D — slowing down onto the principles
  section = 'principles';
  [['leafRot', 3], ['chi', 4], ['flower4', 4], ['auction', 5], ['tower', 6], ['duoBloom', 7]].forEach(([k, d]) => add(d, push(plates[k])));
  add(9, (s) => { bg(P.blue); statement('act now,', { fg: P.paper, size: 300, caps: true, src: '§2 · P. 8' }, s.lt); }, 'statement');
  add(10, (s) => { bg(P.paper); statement('judge later.', { fg: P.blue, size: 300, caps: true, src: '§2 · P. 8' }, s.lt); }, 'statement');
  add(11, (s) => { bg(P.paper); img('bloom', { h: 1.0 * H, zoom: 1 + 0.06 * s.p, angle: 0.72 }); });
  add(13, (s) => { bg(P.ink); statement('No privileged decider.', { fg: P.paper, size: 150, src: '§3.10 · P. 37' }, s.lt); }, 'statement');
  add(15, (s) => { bg(P.paper); statement('Everyone with stake is heard.', { fg: P.ink, size: 150, src: '§3.10 · P. 37' }, s.lt); }, 'statement');
  add(17, (s) => { bg(P.blue); statement('Accountability over size.', { fg: P.paper, size: 150, src: '§3.10 · P. 37' }, s.lt); }, 'statement');
  add(24, (s) => { bg(P.paper); statement('Foresight is the ceiling, not the floor.', { fg: P.ink, size: 138, src: '§2 · P. 9' }, s.lt); }, 'statement');
  add(1, () => { bg(P.blue); }, 'flash');

  // E — lockup
  section = 'lockup';
  add(66, (s) => { bg(P.paper); endCard(s.lt); }, 'lockup');

  let acc = 0;
  for (const sh of shots) { sh.start = acc; acc += sh.d; }
  const TOTAL = acc;

  // ---------------------------------------------------------------- frame
  function scene(R, t) {
    const frame = R.frame ?? Math.floor(t * FPS + 1e-6);
    let i = shots.length - 1;
    while (i > 0 && shots[i].start > frame) i--;
    const sh = shots[i];
    const lt = Math.max(0, t - sh.start / FPS);
    const s = { lt, p: clamp(lt / (sh.d / FPS)) };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    Object.assign(ctx, { textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1, letterSpacing: '0px', lineWidth: 1 });
    ctx.setLineDash([]);
    used = false;
    shotZoom = 1;
    sh.draw(s);
    if (used) {
      const L = R.layerTexture(cv);
      R.sprite(L, { x: 0, y: 0, w: W, h: H }, null, {});
    }
  }

  function post() {
    return { bloom: 0.0, bloomThreshold: 9, chroma: 0.0015, vignette: 0.0, grain: 0.03, exposure: 1 };
  }

  const cuts = shots.map((sh) => ({ frame: sh.start, frames: sh.d, tag: sh.tag, section: sh.section }));
  return { scene, post, hud: () => {}, total: TOTAL, cuts };
}

function rngLocal(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export const HYPE_META = { fps: FPS, duration: 390 / FPS };

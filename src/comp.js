// The edit. Four worlds cut on a 120 BPM grid:
//
//   0.00  FLOW   infinite zoom through nested SRT wordmarks over liquid light
//   1.00  BUILD  punch through the last "R" into a paper world; the block
//                tower assembles cell by cell in front of giant type
//   1.86  ->     the frame collapses into blocks
//   2.00  BLOOM  foliage unfurls, the glass node + peonies spring out of the dark
//   3.02  ->     marquee bands of SRT sweep the frame
//   3.39  SRT    letters slam home on the beat, shockwave, glint, hold
//
// Everything here is a pure function of time so any frame renders identically.

import { CUE, PALETTE as C, clamp, lerp, mix3, prog, ease, rng } from './timeline.js';

const TAU = Math.PI * 2;

export function createComp(R) {
  const W = R.W, H = R.H;
  const U = H / 1080;                    // layout unit
  const minWH = Math.min(W, H);
  const logoH = Math.min(0.28 * H, (0.5 * W) / 3.16);
  const zoomTarget = [205.5, 71.25];     // deepest point inside the R (source px)

  const ringTex = buildRingTexture(R);
  const petals = seedPetals(48);
  const bokehFar = seedBokeh(36, 11);
  const bokehNear = seedBokeh(10, 23);
  const chips = seedChips(18);
  const dust = seedBokeh(40, 51);

  // ---------------------------------------------------------------- FLOW
  // Log-space dolly: each nested copy is half the size of the one before,
  // the camera accelerates (speed ramp) and the 9th copy - a window into the
  // next world - fills the frame exactly on the downbeat.
  const NEST = 8;
  const NEST0 = Math.min(0.44 * H, (0.84 * W) / 3.16); // lead copy height on frame 0
  const zoomLog = (t) => 2.2 * t + 6.6 * Math.pow(t, 4);

  function flow(R, t, windowTex) {
    const lam = zoomLog(t);
    const lam1 = zoomLog(CUE.tunnelEnd);
    const TWIST = 0.13;
    // the camera rolls with the spiral so the dominant copy always reads
    // upright, and the window copy is square to the frame on the downbeat
    const cam = { rot: -NEST * TWIST * (lam / lam1) };
    R.liquid({ time: t, warp: 0.07, zoom: 1.3 * Math.exp(lam * 0.06), rot: cam.rot * 0.5, pan: [0.08 * W, 0.12 * H], swirl: -0.7 * t * t, dim: 0.34 + 0.14 * t, sat: 1.2 });
    R.streaks({ time: t, speed: 0.6 + 2.6 * t * t, intensity: 0.2 + 1.3 * Math.pow(t, 3), col: mix3(C.mint, C.white, 0.4) });

    for (let k = NEST; k >= 0; k--) {
      const h = NEST0 * Math.exp(lam) * Math.pow(0.5, k);
      if (h < 3 || h > 60 * H) continue;
      const fog = clamp((h - 3) / 40);
      const base = { h, anchor: zoomTarget, x: 0, y: 0, rot: k * TWIST };
      if (k === NEST) {
        R.word({ ...base, sceneTex: windowTex, stroke: [1, 1, 1, 1], strokeW: 1.4, glow: [...C.mint.map((v) => v * 0.5), 0], glowR: 8, opacity: fog }, cam);
        continue;
      }
      const style = ((k % 3) + 3) % 3;
      // copies thin out once they are much larger than the frame
      const pass = 1 - clamp((h - 1.6 * H) / (3.5 * H));
      if (pass <= 0) continue;
      const o = fog * pass;
      if (style === 0) {
        R.word({ ...base, fill: [0, 0, 0, 0], stroke: [1, 1, 1, 1], strokeW: 1.1, opacity: o }, cam);
      } else if (style === 1) {
        R.word({ ...base, fill: [0, 0, 0, 0], stroke: [...C.mint, 1], strokeW: 1.8, glow: [...C.aqua.map((v) => v * 0.25), 0], glowR: 3, opacity: o }, cam);
      } else {
        const a = 0.95 * (1 - clamp((h - 1.2 * H) / (2.5 * H)));
        R.word({ ...base, fill: [C.electric[0] * a, C.electric[1] * a, C.electric[2] * a, a], stroke: [1, 1, 1, 1], strokeW: 0.9, glow: [0.0, 0.05, 0.3, 0], glowR: 10, opacity: o }, cam);
      }
    }
  }

  // ---------------------------------------------------------------- BUILD
  function build(R, t, target) {
    const settle = ease.outExpo(prog(t, 0.72, 1.55));
    const zoom = lerp(0.62, 1.0, settle) * (1 + 0.035 * ease.inOutCubic(prog(t, 1.4, 2.1)));
    const cam = { zoom, rot: lerp(0.06, 0, settle) };

    // liquid light for the giant letter fill, rendered at half res
    R.bind(R.tAux, [0, 0, 0, 1]);
    R.liquid({ time: t + 2.0, warp: 0.08, zoom: 1.25, rot: 0.6, dim: 1.05, sat: 1.15 });
    R.bind(target, [0, 0, 0, 1]);

    R.pattern({ scale: 150 * U * zoom, offset: [t * 40 * U, t * 22 * U], rot: 0.12, bg: C.paper, ink: [0.84, 0.865, 0.905], cam: { zoom } });

    // giant type behind the tower
    const gh = 0.64 * H;
    const drift = lerp(70, -70, prog(t, 0.9, 2.1)) * U;
    for (let i = 0; i < 3; i++) {
      const t0 = 0.84 + i * 0.07;
      const p = prog(t, t0, t0 + 0.6);
      const s = ease.spring(p, 10, 0.42);
      const dy = (1 - s) * 0.95 * H;
      if (p <= 0) continue;
      R.word({ letter: i, h: gh, anchor: [202, 64], x: drift + (i - 1) * 12 * U * (1 - s), y: dy - 0.02 * H, rot: (1 - s) * (i - 1) * 0.25, sceneTex: R.tAux, stroke: [0.03, 0.08, 0.3, 1], strokeW: 0.0 }, cam);
    }

    // block tower, assembling bottom-up in square cells
    const rise = ease.outExpo(prog(t, 0.98, 1.6));
    const th = 1.0 * H;
    R.sprite(R.tex.tower, { x: 0.03 * W, y: 0.075 * H + (1 - rise) * 0.18 * H, w: th, h: th, sx: lerp(0.94, 1, rise), sy: lerp(0.94, 1, rise) }, cam, {
      gridN: 30, gridT: t - 1.02, gridSpread: 0.25, gridDur: 0.17, gridFlash: C.electric,
    });

    // flying chips
    const list = [];
    for (const c of chips) {
      const p = prog(t, c.t0, c.t0 + 1.0);
      if (p <= 0) continue;
      const e = ease.outExpo(p);
      list.push({
        x: (c.x + c.vx * e) * W, y: (c.y - c.vy * e - 0.08 * p) * H, size: c.s * U * (1 - 0.3 * p),
        rot: c.r0 + c.vr * e, col: c.col.concat([clamp(p * 8) * (1 - prog(t, 1.75, 1.95))]), shape: 2, soft: 0.1,
      });
    }
    R.particles(list, { zoom: zoom * 1.06 });
  }

  // ---------------------------------------------------------------- BLOOM
  function bloom(R, t, target) {
    R.bind(target, [0, 0, 0, 1]);
    R.clear([0.006, 0.016, 0.06]);
    const zoom = 1.0 + 0.09 * ease.inOutCubic(prog(t, 1.95, 3.5));
    const cam = { zoom, rot: -0.04 * prog(t, 1.95, 3.5) };
    const pop = CUE.bloomPop;
    const popK = Math.exp(-Math.max(0, t - pop) * 5) * (t > pop ? 1 : 0);

    R.rays({ center: [0, -0.02 * H], rot: t * 0.12, intensity: 0.15 + 0.75 * ease.outCubic(prog(t, 2.0, 2.4)) + 0.9 * popK,
      colA: mix3(C.mint, C.white, 0.2), colB: C.blue, fall: 2.4 });

    // far bokeh
    R.particles(bokehLayer(bokehFar, t, 0.55, [C.blue, C.aqua, C.periwinkle]), { zoom: 1 + (zoom - 1) * 0.4 }, 'add');

    // rotating ring of type behind the foliage
    const ringIn = ease.outExpo(prog(t, 2.18, 2.75));
    if (ringIn > 0) {
      const rs = 0.98 * H;
      R.sprite(ringTex, { w: rs, h: rs, rot: -t * 0.5 - (1 - ringIn) * 1.2, sx: lerp(0.7, 1, ringIn), sy: lerp(0.7, 1, ringIn) }, cam, { opacity: ringIn * 0.85 });
    }

    const bh = 1.02 * H;
    const unf = ease.outExpo(prog(t, 1.97, 2.75));
    const rev = ease.outCubic(prog(t, 1.97, 2.42));
    const breathe = 1 + 0.012 * Math.sin((t - 2.2) * 5.0) * prog(t, 2.5, 2.9);
    const leafQ = { w: bh, h: bh, rot: lerp(-0.85, 0, unf) + 0.03 * Math.sin(t * 2.1) * prog(t, 2.5, 2.9), sx: lerp(0.32, 1, unf) * breathe, sy: lerp(0.32, 1, unf) * breathe };
    const leafP = { swirl: lerp(-2.4, 0, unf), reveal: lerp(0.0, 1.7, rev), bright: 1.0 + 0.25 * popK };
    // shadowed foliage behind the mark fades in only once the mark has landed
    const fillIn = prog(t, pop + 0.05, pop + 0.35);
    if (fillIn > 0) R.sprite(R.tex.bloomFill, leafQ, cam, { ...leafP, opacity: fillIn });
    R.sprite(R.tex.bloomLeaves, leafQ, cam, leafP);

    const pp = prog(t, pop, pop + 0.8);
    if (pp > 0) {
      const s = ease.spring(pp, 12, 0.36);
      R.sprite(R.tex.bloomFront, { w: bh, h: bh, rot: (1 - s) * 0.42, sx: s, sy: s }, cam, { opacity: clamp(pp * 14), bright: 1 + 0.12 * popK });
    }

    // petal burst
    const pl = [];
    for (const p of petals) {
      const a = t - pop - p.delay;
      if (a <= 0) continue;
      const d = (1 - Math.exp(-a * p.drag)) / p.drag; // distance with drag
      const r = (0.06 + p.v * d) * H;
      const life = clamp(1 - a / p.life);
      if (life <= 0) continue;
      pl.push({
        x: Math.cos(p.ang) * r, y: Math.sin(p.ang) * r + a * a * 0.12 * H, size: p.s * U * (0.6 + 0.4 * life),
        rot: p.r0 + p.vr * a, col: [...p.col, 0.95 * Math.min(1, life * 2.5) * clamp(a * 20)], shape: 1, stretch: 0.55,
      });
    }
    R.particles(pl, cam);
    R.particles(bokehLayer(bokehNear, t, 1.4, [C.mint, C.white]), { zoom: 1 + (zoom - 1) * 2.0 }, 'add');
  }

  // ---------------------------------------------------------------- SRT (resolve)
  const LAND = [CUE.logoHit - 0.09, CUE.logoHit - 0.045, CUE.logoHit];
  function resolve(R, t, target) {
    R.bind(target, [0, 0, 0, 1]);
    const hit = CUE.logoHit;
    const a = Math.max(0, t - hit);
    const shake = t > hit ? Math.exp(-a * 9) : 0;
    const zoom = lerp(1.16, 1.0, ease.outExpo(prog(t, CUE.finalIn, 4.3))) * (1 + 0.025 * prog(t, 4.0, 5.0));
    const cam = {
      zoom: zoom * (1 + 0.025 * shake),
      x: Math.sin(t * 93) * 14 * U * shake,
      y: Math.cos(t * 71) * 10 * U * shake,
      rot: Math.sin(t * 57) * 0.006 * shake,
    };
    R.liquid({ time: t, warp: 0.06, zoom: zoom * 1.02, rot: -0.05 * t, dim: 0.95, sat: 1.05,
      shock: [0, 0, a * 1.4 * H, t > hit ? 70 * U * Math.exp(-a * 3.5) : 0] });

    // mint light fanning out from behind the type once it lands
    const raysIn = t > hit ? ease.outCubic(clamp(a / 0.5)) : 0;
    if (raysIn > 0) R.rays({ center: [cam.x, cam.y], rot: t * 0.08, intensity: 0.32 * raysIn + 0.5 * Math.exp(-a * 6), colA: mix3(C.mint, C.white, 0.3), colB: C.aqua, fall: 3.2 });

    // separation shadow behind the type
    R.particles([{ x: 0, y: 0.02 * H, size: logoH * 2.5, col: [0.0, 0.05, 0.2, 0.42], shape: 0, soft: 1.0, stretch: 2.1 }], cam);
    R.particles(bokehLayer(dust, t, 0.9, [C.mint, C.white, C.periwinkle]), { zoom: cam.zoom * 1.05, x: cam.x * 1.5, y: cam.y * 1.5 }, 'add');

    // impact echoes
    if (t > hit) {
      for (let e = 0; e < 2; e++) {
        const p = ease.outExpo(clamp(a / (0.55 + e * 0.2)));
        const s = 1 + p * (0.22 + e * 0.3);
        R.word({ h: logoH, sx: s, sy: s, fill: [0, 0, 0, 0], stroke: [...C.mint, 1], strokeW: 1.2 + e * 0.6, opacity: (1 - p) * 0.85, glow: [...C.mint.map((v) => v * 0.5), 0], glowR: 5 }, cam);
      }
    }

    const glint = t > CUE.glint ? lerp(-0.25, 1.3, ease.inOutCubic(prog(t, CUE.glint, CUE.glint + 0.5))) : -1;
    for (let i = 0; i < 3; i++) {
      const L = LAND[i];
      const p = prog(t, L - 0.32, L);
      if (p <= 0) continue;
      const e = ease.inQuart(p);
      const after = Math.max(0, t - L);
      const bounce = after > 0 ? -0.06 * Math.exp(-after * 14) * Math.cos(after * 40) : 0;
      const s = lerp(3.4, 1, e) + bounce;
      const fromRot = [0.5, -0.35, 0.42][i];
      R.word({
        letter: i, h: logoH, anchor: [202, 64], sx: s, sy: s, rot: fromRot * (1 - e), opacity: clamp(p * 3.5),
        fill: [1, 1, 1, 1], glow: [0.1, 0.4, 0.38, 0], glowR: 7, bevel: [0.35, 4, -0.6, -0.8], glint,
      }, cam);
    }
  }

  // ---------------------------------------------------------------- marquee wipe
  const BANDS = 7;
  const bandStyle = [
    { band: C.electric, text: C.white, outline: 0 },
    { band: C.paper, text: C.electric, outline: 1 },
    { band: C.mint, text: C.navy, outline: 0 },
    { band: [0.02, 0.03, 0.08], text: C.mint, outline: 1 },
    { band: C.white, text: C.blue, outline: 0 },
    { band: C.aqua, text: C.white, outline: 1 },
    { band: C.blue, text: C.mint, outline: 0 },
  ];
  function marquee(R, t) {
    const ang = -0.24;
    const X = (Math.abs(W * Math.cos(ang)) + Math.abs(H * Math.sin(ang))) / 2 + 40 * U;
    const bandH = (Math.abs(W * Math.sin(ang)) + Math.abs(H * Math.cos(ang))) / BANDS + 6 * U;
    const e1 = [], e2 = [], scroll = [], bandCol = [], textCol = [], outline = [];
    let any = false;
    for (let i = 0; i < BANDS; i++) {
      const order = [3, 2, 4, 1, 5, 0, 6][i];
      const pin = ease.outQuart(prog(t, CUE.wipeIn + order * 0.02, CUE.wipeIn + order * 0.02 + 0.24));
      const pout = ease.inQuart(prog(t, 3.40 + order * 0.02, 3.40 + order * 0.02 + 0.26));
      if (pin > 0 && pout < 1) any = true;
      const big = 1e5;
      if (i % 2 === 0) { // enters from the right, exits left
        e1.push(lerp(X, -X, pin));
        e2.push(pout > 0 ? lerp(X, -X, pout) : big);
      } else {
        e1.push(pout > 0 ? lerp(-X, X, pout) : -big);
        e2.push(lerp(-X, X, pin));
      }
      const dir = i % 2 === 0 ? -1 : 1;
      scroll.push(dir * (t - CUE.wipeIn) * (900 + 160 * i) * U);
      bandCol.push(bandStyle[i].band); textCol.push(bandStyle[i].text); outline.push(bandStyle[i].outline);
    }
    if (!any) return;
    R.marquee({ angle: ang, bandH, wordH: bandH * 0.56, e1, e2, scroll, bandCol, textCol, outline });
  }

  // ---------------------------------------------------------------- particles
  function seedBokeh(n, seed) {
    const r = rng(seed);
    return Array.from({ length: n }, () => ({
      x: r() - 0.5, y: r() - 0.5, z: 0.3 + r() * 0.7, s: 4 + r() * 26, ph: r() * TAU, sp: 0.2 + r() * 0.6, ci: Math.floor(r() * 3), a: 0.15 + r() * 0.5,
    }));
  }
  function bokehLayer(list, t, sizeMul, cols) {
    return list.map((b) => ({
      x: (b.x + Math.sin(t * b.sp + b.ph) * 0.02) * W * 1.1,
      y: (b.y - t * 0.03 * b.z + Math.cos(t * b.sp * 0.7 + b.ph) * 0.015) * H * 1.1,
      size: b.s * sizeMul * U * (0.6 + b.z), col: [...cols[b.ci % cols.length], b.a * (0.45 + 0.55 * Math.sin(t * 2 + b.ph) ** 2)],
      shape: 0, soft: 0.5 + 0.5 * (1 - b.z), add: true,
    }));
  }
  function seedPetals(n) {
    const r = rng(99);
    return Array.from({ length: n }, () => ({
      ang: r() * TAU, v: 0.6 + r() * 1.5, drag: 2.5 + r() * 3, delay: r() * 0.08, life: 0.7 + r() * 0.6,
      s: 12 + r() * 30, r0: r() * TAU, vr: (r() - 0.5) * 9,
      col: r() < 0.7 ? [0.93, 0.97, 0.96] : r() < 0.5 ? C.mint : C.periwinkle,
    }));
  }
  function seedChips(n) {
    const r = rng(5);
    return Array.from({ length: n }, () => {
      const side = r() < 0.5 ? -1 : 1;
      return {
        x: side * (0.12 + r() * 0.12), y: 0.1 + r() * 0.35, vx: side * (0.05 + r() * 0.25), vy: 0.15 + r() * 0.45,
        s: 10 + r() * 34, r0: r() * TAU, vr: (r() - 0.5) * 4, t0: 1.05 + r() * 0.45,
        col: [C.electric, C.white, [0.12, 0.13, 0.15], C.periwinkle][Math.floor(r() * 4)],
      };
    });
  }

  // ---------------------------------------------------------------- frame assembly
  const GRID0 = CUE.gridOut, GRID1 = 2.08;
  function scene(R, t) {
    const dbg = globalThis.SAPIO_DEBUG;
    if (dbg === 'liquid') { R.liquid({ time: t, warp: 0.06, dim: 1, sat: 1 }); return; }
    if (dbg === 'liquid0') { R.liquid({ time: t, warp: 0.0, dim: 1, sat: 1 }); return; }
    if (t < CUE.tunnelEnd) {
      const winH = NEST0 * Math.exp(zoomLog(t)) * Math.pow(0.5, NEST);
      if (winH > 3) build(R, t, R.tA);
      R.bind(R.tScene, [0, 0, 0, 1]);
      flow(R, t, R.tA);
    } else if (t < GRID0) {
      build(R, t, R.tScene);
    } else if (t < GRID1) {
      build(R, t, R.tA);
      bloom(R, t, R.tB);
      R.bind(R.tScene);
      R.gridx(R.tA, R.tB, { cell: 96 * U, t: prog(t, GRID0, GRID1) * 1.12, edge: C.electric });
    } else if (t < CUE.wipeCover) {
      bloom(R, t, R.tScene);
      marquee(R, t);
    } else {
      resolve(R, t, R.tScene);
      marquee(R, t);
    }
  }

  // per-frame post: hits drive chroma, lens shock and flashes
  const HITS = [
    { t: 0.0, chroma: 0.012, shock: 0.0, flash: 0 },
    { t: CUE.tunnelEnd, chroma: 0.03, shock: 0.0, flash: 0.0 },
    { t: CUE.gridOut + 0.1, chroma: 0.012, shock: 0, flash: 0 },
    { t: CUE.bloomPop, chroma: 0.02, shock: 0.014, flash: 0.0 },
    { t: CUE.wipeCover, chroma: 0.015, shock: 0, flash: 0 },
    { t: CUE.logoHit, chroma: 0.035, shock: 0.022, flash: 0.28 },
  ];
  function post(t) {
    let chroma = 0.003, shockR = 0, shockS = 0, flash = 0;
    for (const h of HITS) {
      const a = t - h.t;
      if (a < 0) {
        // anticipation: chroma swells into the hit
        chroma += h.chroma * 0.25 * Math.exp(a * 14);
        continue;
      }
      chroma += h.chroma * Math.exp(-a * 9);
      if (h.shock) { shockR = Math.max(shockR, a * 1.5); shockS += h.shock * Math.exp(-a * 4.5); }
      flash += h.flash * Math.exp(-a * 16);
    }
    const inBuild = t >= CUE.tunnelEnd && t < GRID0 + 0.1;
    const inBloom = t >= GRID0 + 0.1 && t < CUE.wipeCover;
    return {
      chroma, flash, flashCol: mix3(C.mint, C.white, 0.6),
      shock: [0.5, 0.5, shockR, shockS],
      bloom: inBuild ? 0.2 : inBloom ? 0.3 : t > CUE.wipeCover ? 0.3 : 0.45,
      bloomThreshold: inBuild ? 0.95 : inBloom ? 0.93 : t > CUE.wipeCover ? 0.9 : 0.8,
      vignette: inBuild ? 0.25 : 0.45,
      grain: 0.03,
      exposure: 1.0,
    };
  }

  // ---------------------------------------------------------------- HUD
  const CHAPTERS = [
    { t: 0, label: '01 — FLOW' },
    { t: CUE.tunnelEnd, label: '02 — BUILD' },
    { t: 1.96, label: '03 — BLOOM' },
    { t: CUE.wipeCover, label: '04 — SRT' },
  ];
  const GLYPHS = '01#/<>[]=+*ABCDEF';
  function hud(ctx, t, W, H, frame) {
    const m = 46 * U;
    const light = t >= CUE.tunnelEnd && t < 1.97;
    const ink = light ? 'rgba(12,16,28,' : 'rgba(255,255,255,';
    const intro = ease.outExpo(prog(t, 0.0, 0.5));
    ctx.save();
    ctx.globalAlpha = intro;
    ctx.lineWidth = 2 * U;
    ctx.strokeStyle = ink + '0.85)';
    const L = 22 * U;
    const corners = [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]];
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y);
      ctx.stroke();
    }
    const fs = Math.round(17 * U);
    ctx.font = `600 ${fs}px "JetBrains Mono"`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink + '0.92)';
    // chapter label with a decode effect on every change
    let ch = CHAPTERS[0];
    for (const c of CHAPTERS) if (t >= c.t) ch = c;
    const since = t - ch.t;
    const r = rng(frame * 7 + 3);
    let label = '';
    for (let i = 0; i < ch.label.length; i++) {
      const settled = since > 0.018 * i + 0.05;
      const c = ch.label[i];
      label += settled || c === ' ' ? c : GLYPHS[Math.floor(r() * GLYPHS.length)];
    }
    ctx.textAlign = 'left';
    ctx.fillText(label, m + 34 * U, m + 9 * U);
    // timecode
    const s = Math.floor(t), f = frame % 60;
    ctx.textAlign = 'right';
    ctx.fillText(`00:00:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`, W - m - 34 * U, m + 9 * U);
    // progress rail
    const x0 = m + 34 * U, x1 = W - m - 34 * U, y = H - m - 9 * U;
    ctx.fillStyle = ink + '0.25)';
    ctx.fillRect(x0, y - 0.75 * U, x1 - x0, 1.5 * U);
    ctx.fillStyle = ink + '0.95)';
    ctx.fillRect(x0, y - 1.5 * U, (x1 - x0) * clamp(t / CUE.end), 3 * U);
    // beat ticks
    for (let b = 0; b <= 10; b++) {
      const bx = x0 + (x1 - x0) * (b / 10);
      ctx.fillRect(bx - 0.75 * U, y - 6 * U, 1.5 * U, 12 * U);
    }
    // lockup rules: hairlines that shoot out from the wordmark on the hit
    const ra = t - CUE.logoHit;
    if (ra > 0) {
      const e = ease.outExpo(clamp(ra / 0.6));
      const halfW = logoH * 3.16 / 2 + 40 * U;
      const span = (W / 2 - m - 34 * U - halfW) * e;
      const y = H / 2 + logoH * 0.5 + 54 * U;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(W / 2 - halfW - span, H / 2 - 0.75 * U, span, 1.5 * U);
      ctx.fillRect(W / 2 + halfW, H / 2 - 0.75 * U, span, 1.5 * U);
      ctx.globalAlpha = intro * clamp((ra - 0.15) / 0.3);
      ctx.textAlign = 'center';
      ctx.font = `500 ${Math.round(15 * U)}px "JetBrains Mono"`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const word = '\u2014 S \u00b7 R \u00b7 T \u2014';
      ctx.fillText(word, W / 2, y);
    }
    ctx.restore();
  }

  return { scene, post, hud };
}

// Ring of type: "SRT" repeated around a circle, drawn once into a texture.
function buildRingTexture(R) {
  const size = 2048;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.translate(size / 2, size / 2);
  const rad = size * 0.455;
  ctx.strokeStyle = 'rgba(160,240,225,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, rad - 52, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([2, 14]);
  ctx.beginPath(); ctx.arc(0, 0, rad + 46, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '700 54px "JetBrains Mono"';
  ctx.fillStyle = 'rgba(235,255,250,0.95)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const unit = 'SRT • ';
  const text = unit.repeat(14);
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const a = (i / chars.length) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -rad);
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
  }
  return R.textureFromCanvas(cv);
}

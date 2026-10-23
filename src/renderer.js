// Render engine: owns GL state, render targets and the draw primitives the
// composition uses. Each output frame is the average of several jittered
// sub-frame renders spread across a 180-degree shutter (motion blur + AA),
// followed by a bloom pyramid and the final grade.

import { createGL, Program, Target, createQuad, blend, texFromImage, texFromHalfFloat, texFromRGBA8, texFromCanvas } from './gl.js';
import * as S from './shaders.js';
import { quadMatrix, withCamera } from './timeline.js';

const MAX_PARTICLES = 512;

export class Renderer {
  constructor(canvas, W, H) {
    this.W = W; this.H = H;
    canvas.width = W; canvas.height = H;
    const gl = (this.gl = createGL(canvas));
    this.quad = createQuad(gl);
    const P = (fs, label, vs = S.VS_QUAD) => new Program(gl, vs, fs, label);
    this.prog = {
      liquid: P(S.FS_LIQUID, 'liquid', S.VS_FULL),
      sprite: P(S.FS_SPRITE, 'sprite'),
      word: P(S.FS_WORD, 'word'),
      pattern: P(S.FS_PATTERN, 'pattern', S.VS_FULL),
      rays: P(S.FS_RAYS, 'rays', S.VS_FULL),
      streaks: P(S.FS_STREAKS, 'streaks', S.VS_FULL),
      particles: P(S.FS_PARTICLES, 'particles', S.VS_PARTICLES),
      gridx: P(S.FS_GRIDX, 'gridx', S.VS_FULL),
      marquee: P(S.FS_MARQUEE, 'marquee', S.VS_FULL),
      blit: P(S.FS_BLIT, 'blit', S.VS_FULL),
      down: P(S.FS_DOWN, 'down', S.VS_FULL),
      up: P(S.FS_UP, 'up', S.VS_FULL),
      post: P(S.FS_POST, 'post', S.VS_FULL),
    };
    // scene targets: main sub-frame target, two scratch scenes for
    // transitions, an aux target for textures used as fills, and the accumulator
    this.tScene = new Target(gl, W, H);
    this.tA = new Target(gl, W, H);
    this.tB = new Target(gl, W, H);
    this.tAux = new Target(gl, W >> 1, H >> 1);
    this.tAccum = new Target(gl, W, H);
    this.mips = [];
    let w = W, h = H;
    for (let i = 0; i < 6; i++) {
      w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
      this.mips.push(new Target(gl, w, h));
    }
    this._initParticles();
    this.jitter = [0, 0];
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = W; this.hudCanvas.height = H;
    this.hudTex = null;
  }

  async loadAssets(base) {
    const gl = this.gl;
    const img = async (url, opts) => {
      const blob = await (await fetch(base + url)).blob();
      const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
      return texFromImage(gl, bmp, opts);
    };
    const bin = async (url) => new Uint8Array(await (await fetch(base + url)).arrayBuffer());
    this.tex = {
      liquid: await img('assets/liquid-gradient.webp', { wrap: 'mirror' }),
      tower: await img('assets/block-tower.webp'),
      bloomFront: await img('assets/gen/bloom_front.png'),
      bloomLeaves: await img('assets/gen/bloom_leaves.png'),
      bloomFill: await img('assets/gen/bloom_fill.png'),
    };
    const nz = await bin('assets/gen/noise.bin');
    this.tex.noise = texFromRGBA8(gl, nz, 256, 256, { wrap: 'repeat' });
    const meta = await (await fetch(base + 'assets/gen/srt_sdf.json')).json();
    const raw = await bin('assets/gen/srt_sdf.bin');
    this.sdfMeta = meta;
    this.tex.sdf = texFromHalfFloat(gl, new Uint16Array(raw.buffer), meta.width, meta.height);
  }

  textureFromCanvas(cv) { return texFromCanvas(this.gl, cv); }

  // ------------------------------------------------------------ primitives
  _full(prog, uniforms) {
    const gl = this.gl;
    prog.use(uniforms);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _quad(prog, M, uniforms) {
    const gl = this.gl;
    prog.use({ uM: M, uRes: [this.W, this.H], uJitter: this.jitter, ...uniforms });
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  clear(rgb) {
    const gl = this.gl;
    gl.clearColor(rgb[0], rgb[1], rgb[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  liquid(p) {
    blend.none(this.gl);
    this._full(this.prog.liquid, {
      uTex: this.tex.liquid, uNoise: this.tex.noise, uRes: this._curRes(), uTexSize: [this.tex.liquid.w, this.tex.liquid.h],
      uTime: p.time, uWarp: p.warp ?? 0.05, uZoom: p.zoom ?? 1, uRot: p.rot ?? 0, uPan: p.pan ?? [0, 0],
      uDim: p.dim ?? 1, uSat: p.sat ?? 1, uShock: p.shock ?? [0, 0, 0, 0], uSwirl: p.swirl ?? 0,
    });
  }

  pattern(p) {
    blend.none(this.gl);
    const cam = p.cam || {};
    this._full(this.prog.pattern, {
      uRes: [this.W, this.H], uScale: p.scale, uOffset: p.offset ?? [0, 0], uRot: p.rot ?? 0,
      uBg: p.bg, uInk: p.ink, uInkAmt: p.inkAmt ?? 1,
      uCam: [cam.zoom ?? 1, cam.rot ?? 0, cam.x ?? 0, cam.y ?? 0],
    });
  }

  rays(p) {
    blend.add(this.gl);
    this._full(this.prog.rays, {
      uNoise: this.tex.noise, uRes: [this.W, this.H], uCenter: p.center ?? [0, 0], uRot: p.rot ?? 0,
      uIntensity: p.intensity ?? 1, uColA: p.colA, uColB: p.colB, uFall: p.fall ?? 2.5,
    });
  }

  streaks(p) {
    blend.add(this.gl);
    this._full(this.prog.streaks, {
      uRes: [this.W, this.H], uTime: p.time, uSpeed: p.speed, uIntensity: p.intensity, uCol: p.col,
    });
  }

  // Draw a texture on a transformed quad.
  sprite(tex, q, cam, p = {}) {
    blend.over(this.gl);
    const M = withCamera(quadMatrix(q), cam);
    this._quad(this.prog.sprite, M, {
      uTex: tex, uNoise: this.tex.noise, uOpacity: p.opacity ?? 1, uTint: p.tint ?? [1, 1, 1], uTintAmt: p.tintAmt ?? 0,
      uBright: p.bright ?? 1, uSwirl: p.swirl ?? 0, uSwirlC: p.swirlC ?? [0.5, 0.5], uReveal: p.reveal ?? 9,
      uGridN: p.gridN ?? 0, uGridT: p.gridT ?? 0, uGridDur: p.gridDur ?? 0.15, uGridSpread: p.gridSpread ?? 0.3,
      uGridFlash: p.gridFlash ?? [1, 1, 1], uAspect: q.w / q.h,
    });
  }

  // SRT wordmark (or one letter) via the SDF. `h` is cap height in screen px;
  // (x, y) is where the anchor point (source px, default word centre) lands.
  word(p, cam) {
    const m = this.sdfMeta;
    const pad = m.pad;
    const fw = m.srcWidth + 2 * pad, fh = m.srcHeight + 2 * pad;
    let rx0 = -pad, rx1 = m.srcWidth + pad;
    let chan = [0, 0, 0, 1];
    if (p.letter !== undefined) {
      const [x0, , x1] = m.letters[p.letter];
      const lp = Math.min(pad, p.letterPad ?? pad);
      rx0 = x0 - lp; rx1 = x1 + lp;
      chan = [0, 0, 0, 0]; chan[p.letter] = 1;
    }
    const k = p.h / m.srcHeight; // screen px per source px
    const anchor = p.anchor ?? [m.srcWidth / 2, m.srcHeight / 2];
    const qw = (rx1 - rx0) * k, qh = fh * k;
    const ax = (anchor[0] - rx0) / (rx1 - rx0);
    const ay = (anchor[1] + pad) / fh;
    const M = withCamera(quadMatrix({ x: p.x ?? 0, y: p.y ?? 0, w: qw, h: qh, rot: p.rot ?? 0, sx: p.sx ?? 1, sy: p.sy ?? 1, ax, ay }), cam);
    blend.over(this.gl);
    this._quad(this.prog.word, M, {
      uSdf: this.tex.sdf, uScene: p.sceneTex ?? this.tAux, uRect: [(rx0 + pad) / fw, 0, (rx1 - rx0) / fw, 1],
      uChanSel: chan, uFill: p.fill ?? [1, 1, 1, 1], uStroke: p.stroke ?? [0, 0, 0, 0], uStrokeW: p.strokeW ?? 0,
      uGlow: p.glow ?? [0, 0, 0, 0], uGlowR: p.glowR ?? 0, uGlowMax: (p.letter !== undefined ? Math.min(pad, p.letterPad ?? pad) : pad) * 0.95, uInflate: p.inflate ?? 0,
      uSceneFill: p.sceneTex ? 1 : 0, uGlint: p.glint ?? -1, uBevel: p.bevel ?? [0, 1, 0, 1],
      uOpacity: p.opacity ?? 1,
    });
  }

  _initParticles() {
    const gl = this.gl;
    this.pvao = gl.createVertexArray();
    gl.bindVertexArray(this.pvao);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.pbuf = gl.createBuffer();
    this.pdata = new Float32Array(MAX_PARTICLES * 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pbuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.pdata.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 48, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
  }

  // list of { x, y, size, rot, col:[r,g,b,a] (straight), shape, soft, stretch }
  particles(list, cam, mode = 'over') {
    if (!list.length) return;
    const gl = this.gl;
    const n = Math.min(list.length, MAX_PARTICLES);
    const d = this.pdata;
    for (let i = 0; i < n; i++) {
      const p = list[i], o = i * 12, a = p.col[3];
      d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.size; d[o + 3] = p.rot ?? 0;
      d[o + 4] = p.col[0] * a; d[o + 5] = p.col[1] * a; d[o + 6] = p.col[2] * a; d[o + 7] = p.add ? 0 : a;
      d[o + 8] = p.shape ?? 0; d[o + 9] = p.soft ?? 0.3; d[o + 10] = p.stretch ?? 1; d[o + 11] = 0;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pbuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.subarray(0, n * 12));
    const c = cam || {};
    const z = c.zoom ?? 1, r = c.rot ?? 0;
    const cs = Math.cos(r) * z, sn = Math.sin(r) * z;
    const M = new Float32Array([cs, sn, 0, -sn, cs, 0, c.x ?? 0, c.y ?? 0, 1]);
    mode === 'add' ? blend.add(gl) : blend.over(gl);
    this.prog.particles.use({ uRes: [this.W, this.H], uJitter: this.jitter, uCam: M });
    gl.bindVertexArray(this.pvao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.bindVertexArray(null);
  }

  gridx(A, B, p) {
    blend.none(this.gl);
    this._full(this.prog.gridx, { uA: A, uB: B, uRes: [this.W, this.H], uCell: p.cell, uT: p.t, uEdge: p.edge ?? [1, 1, 1] });
  }

  marquee(p) {
    blend.over(this.gl);
    const m = this.sdfMeta;
    const fl = (arr) => new Float32Array(arr.flat());
    this._full(this.prog.marquee, {
      uSdf: this.tex.sdf, uRes: [this.W, this.H], uAngle: p.angle, uBandH: p.bandH, uWordH: p.wordH,
      uSdfSize: [m.srcWidth + 2 * m.pad, m.srcHeight + 2 * m.pad], uPad: m.pad, uWordSrc: [m.srcWidth, m.srcHeight],
      uIn: fl(p.e1), uOut: fl(p.e2), uScroll: fl(p.scroll), uBandCol: fl(p.bandCol), uTextCol: fl(p.textCol), uOutline: fl(p.outline),
    });
  }

  blit(src, weight = 1, mode = 'none') {
    mode === 'add' ? blend.add(this.gl) : blend.none(this.gl);
    this._full(this.prog.blit, { uSrc: src, uWeight: weight });
  }

  _curRes() { return this._res || [this.W, this.H]; }

  // Bind a target for drawing; scene code calls this for scratch targets.
  bind(target, clear) {
    target.bind(clear);
    this._res = [target.w, target.h];
  }

  // ------------------------------------------------------------ frame
  // comp: { scene(R, t) -> draws into R.tScene, post(t) -> params, hud(ctx, t, W, H) }
  renderFrame(comp, frame, fps, opts = {}) {
    const gl = this.gl;
    const N = opts.subframes ?? 8;
    const shutter = opts.shutter ?? 0.5;
    const t0 = frame / fps;
    this.bind(this.tAccum, [0, 0, 0, 0]);
    for (let i = 0; i < N; i++) {
      const ts = t0 + ((i + 0.5) / N - 0.5) * shutter / fps;
      this.jitter = N > 1 ? [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5] : [0, 0];
      this.bind(this.tScene, [0, 0, 0, 1]);
      comp.scene(this, Math.max(0, ts));
      this.bind(this.tAccum);
      this.blit(this.tScene, 1 / N, 'add');
    }
    this.jitter = [0, 0];
    const pp = comp.post(t0);

    // bloom pyramid
    let src = this.tAccum;
    for (let i = 0; i < this.mips.length; i++) {
      const dst = this.mips[i];
      this.bind(dst);
      blend.none(gl);
      this._full(this.prog.down, { uSrc: src, uTexel: [1 / src.w, 1 / src.h], uPrefilter: i === 0 ? 1 : 0, uThreshold: pp.bloomThreshold ?? 0.75 });
      src = dst;
    }
    for (let i = this.mips.length - 1; i > 0; i--) {
      const s = this.mips[i], dst = this.mips[i - 1];
      this.bind(dst);
      blend.add(gl);
      this._full(this.prog.up, { uSrc: s, uTexel: [1 / s.w, 1 / s.h], uRadius: 1.0 });
    }

    // HUD overlay
    const ctx = this.hudCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.W, this.H);
    comp.hud(ctx, t0, this.W, this.H, frame);
    this.hudTex = texFromCanvas(gl, this.hudCanvas, this.hudTex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.W, this.H);
    blend.none(gl);
    this._full(this.prog.post, {
      uFlipY: -1, uScene: this.tAccum, uBloom: this.mips[0], uHud: this.hudTex, uRes: [this.W, this.H],
      uBloomAmt: pp.bloom ?? 0.6, uChroma: pp.chroma ?? 0.004, uShock: pp.shock ?? [0.5, 0.5, 0, 0],
      uFlash: pp.flash ?? 0, uFlashCol: pp.flashCol ?? [1, 1, 1], uExposure: pp.exposure ?? 1,
      uVignette: pp.vignette ?? 0.35, uGrain: pp.grain ?? 0.035, uSeed: (frame * 0.618) % 1 * 100, uLetterbox: pp.letterbox ?? 0,
    });
  }

  readPixels() {
    const gl = this.gl;
    const out = new Uint8Array(this.W * this.H * 4);
    gl.readPixels(0, 0, this.W, this.H, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }
}

function halton(i, b) {
  let f = 1, r = 0;
  while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); }
  return r;
}

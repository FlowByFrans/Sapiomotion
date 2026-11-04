// Sapio logo showcase reel — the mark in five materials, morphing in place.
//
// Only the five supplied renders are used. They share one pose and
// silhouette (the blue render is registered onto the others' frame), so every
// transition swaps material without the shape moving: a specular sweep, a
// liquid ripple, an organic dissolve and a liquid fill that brings in the
// electric-blue hero. The mark floats with a slight perspective tilt, a glint
// rides each hold, and the light studio background takes on each material's tint.

import { Program } from './gl.js';
import { VS_QUAD, VS_FULL } from './shaders.js';
import { clamp, lerp, prog, ease, rot, squareToQuad } from './timeline.js';

export const REEL_META = { fps: 60, duration: 5.0 };
const HERO = 3.88; // the liquid fill completes: the blue hero lands

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
`;

// two registered materials + a transition between them
const FS_MATERIAL = HEAD + `
in vec2 vUv;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uNoise;
uniform float uT;        // 0 = material A, 1 = material B
uniform int uType;       // 1 sweep, 2 ripple, 3 dissolve, 4 slats
uniform vec2 uDir;
uniform vec2 uCenter;
uniform vec3 uEdge;
uniform float uGlint;    // glint band position, < -0.5 = off
uniform float uOpacity;
out vec4 o;

float fbm(vec2 p){
  return texture(uNoise, p).r * 0.6 + texture(uNoise, p * 2.1 + 0.37).g * 0.3 + texture(uNoise, p * 4.3 + 0.71).b * 0.1;
}

void main(){
  vec2 uv = vUv;
  vec2 uvA = uv, uvB = uv;
  float m = 0.0, edge = 0.0, glow = 0.0;
  if (uType == 1) {
    float s = dot(uv - 0.5, normalize(uDir));
    float b = mix(-0.78, 0.78, uT);
    m = smoothstep(b + 0.015, b - 0.015, s);
    edge = exp(-pow((s - b) / 0.012, 2.0));
    glow = exp(-pow((s - b) / 0.09, 2.0));
  } else if (uType == 2) {
    vec2 d = uv - uCenter;
    float r = length(d);
    float R = uT * 1.35;
    m = smoothstep(R + 0.012, R - 0.012, r);
    float ring = exp(-pow((r - R) / 0.06, 2.0)) * step(0.001, uT) * (1.0 - smoothstep(0.85, 1.0, uT));
    vec2 n = normalize(d + 1e-5);
    uvA -= n * ring * 0.03;
    uvB += n * ring * 0.02;
    edge = exp(-pow((r - R) / 0.007, 2.0)) * step(0.001, uT) * (1.0 - smoothstep(0.85, 1.0, uT));
    glow = ring * 0.25;
  } else if (uType == 3) {
    // smooth organic front: low-frequency noise riding a diagonal flow
    float nz = texture(uNoise, uv * 0.42 + 0.21).a * 0.75 + texture(uNoise, uv * 0.9 + 0.57).r * 0.25;
    float flow = dot(uv - 0.5, normalize(vec2(1.0, 0.7))) * 0.9 + 0.5;
    float f = mix(nz, flow, 0.55);
    float thr = mix(-0.05, 1.05, uT);
    m = smoothstep(thr + 0.025, thr - 0.025, f);
    edge = exp(-pow((f - thr) / 0.008, 2.0)) * step(0.001, uT) * step(uT, 0.999);
    glow = exp(-pow((f - thr) / 0.05, 2.0)) * step(0.001, uT) * step(uT, 0.999);
  } else if (uType == 4) {
    // liquid fill: the blue rises through the mark with a wavy, lit meniscus
    float level = mix(1.12, -0.12, uT);
    float wave = 0.022 * sin(uv.x * 13.0 + uT * 11.0) + 0.012 * sin(uv.x * 29.0 - uT * 17.0);
    float d = uv.y - (level + wave);
    m = smoothstep(-0.006, 0.006, d);
    float live = step(0.001, uT) * step(uT, 0.999);
    float surf = exp(-pow(d / 0.03, 2.0)) * live;
    uvB.x += surf * 0.012 * sin(uv.y * 60.0 + uT * 30.0);
    uvA.y += exp(-pow((d + 0.02) / 0.03, 2.0)) * live * 0.006;
    edge = exp(-pow(d / 0.005, 2.0)) * live;
    glow = exp(-pow((d + 0.025) / 0.05, 2.0)) * live * 0.8;
  }
  vec4 a = texture(uA, uvA);
  vec4 b = texture(uB, uvB);
  vec4 c = mix(a, b, m);
  float cover = max(a.a, b.a);
  c.rgb += uEdge * (edge * 0.9 + glow * 0.28) * cover;
  if (uGlint > -0.5) {
    float x = dot(uv - 0.5, normalize(vec2(1.0, 0.55))) + 0.5;
    float g = exp(-pow((x - uGlint) / 0.045, 2.0)) + 0.4 * exp(-pow((x - uGlint + 0.09) / 0.015, 2.0));
    c.rgb += vec3(1.0) * g * 0.32 * c.a;
  }
  o = c * uOpacity;
}`;

// light studio backdrop: radial falloff, tinted per material, faint grain
const FS_BACKDROP = HEAD + `
in vec2 vUv;
uniform vec2 uRes;
uniform vec3 uC0;
uniform vec3 uC1;
uniform float uBoost;
out vec4 o;
void main(){
  vec2 q = (gl_FragCoord.xy - uRes * 0.5) / uRes.y;
  float r = length(q * vec2(0.92, 1.0) - vec2(0.0, 0.04));
  vec3 c = mix(uC0, uC1, smoothstep(0.05, 0.95, r));
  c += uBoost * exp(-r * r * 6.0) * vec3(1.0);
  o = vec4(c, 1.0);
}`;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// order, backdrop tints (centre, edge) and the edge light of the transition
// that brings each material in
const MATERIALS = [
  { key: 'silver', file: 'mark-silver.png', c0: '#F3F5F7', c1: '#D3D8DF', edge: '#FFFFFF' },
  { key: 'pearl', file: 'mark-pearl.png', c0: '#F7F3F8', c1: '#DCD4E4', edge: '#FFF4FF' },
  { key: 'mint', file: 'mark-mint-glass.png', c0: '#F2FAF9', c1: '#CFE6E6', edge: '#BFFFF2' },
  { key: 'steel', file: 'mark-steel-glass.png', c0: '#EEF2F7', c1: '#C3CEDD', edge: '#DDE8FF' },
  { key: 'blue', file: 'mark-blue-liquid.png', c0: '#EEF5FF', c1: '#BFD3F5', edge: '#9FF6FF' },
];
// transitions between consecutive materials
const TRANSITIONS = [
  { t0: 0.70, d: 0.40, type: 1, dir: [1.0, -0.55] },   // specular sweep
  { t0: 1.60, d: 0.46, type: 2, center: [0.70, 0.27] }, // ripple from the big lobe
  { t0: 2.52, d: 0.44, type: 3 },                      // organic dissolve
  { t0: 3.40, d: 0.50, type: 4 },                      // liquid fill into the blue hero
];

export async function createReel(R) {
  const W = R.W, H = R.H, S = Math.min(W, H);
  const gl = R.gl;
  const mat = new Program(gl, VS_QUAD, FS_MATERIAL, 'reel-material');
  const backdrop = new Program(gl, VS_FULL, FS_BACKDROP, 'reel-backdrop');

  const tex = [];
  for (const m of MATERIALS) {
    const blob = await (await fetch('../assets/reel/' + m.file)).blob();
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
    tex.push(R.textureFromCanvas(bmp));
  }
  const aspect = tex[0].w / tex[0].h;

  // which pair of materials is on screen at time t, and how far between them
  function state(t) {
    let a = 0, b = 0, p = 0, tr = null;
    for (let i = 0; i < TRANSITIONS.length; i++) {
      const T = TRANSITIONS[i];
      if (t >= T.t0 + T.d) { a = b = i + 1; continue; }
      if (t >= T.t0) { a = i; b = i + 1; p = ease.inOutCubic((t - T.t0) / T.d); tr = T; }
      break;
    }
    return { a, b, p, tr };
  }

  // a single glint per hold, timed between transitions
  const holds = [[0.1, 0.7], [1.1, 1.6], [2.06, 2.52], [2.96, 3.38], [HERO, 5.0]];
  function glintAt(t) {
    for (const [s, e] of holds) {
      const mid = s + (e - s) * 0.35, dur = Math.min(0.5, (e - s) * 0.9);
      if (t >= mid - dur / 2 && t <= mid + dur / 2) return lerp(-0.25, 1.25, ease.inOutCubic((t - (mid - dur / 2)) / dur));
    }
    return -1;
  }

  // homography for the mark: float, slow push, gentle turntable tilt
  function markMatrix(t, punch, shadow = false) {
    const h0 = 0.76 * S * (W > H ? 0.98 : 1);
    const push = lerp(0.95, 1.03, ease.inOutCubic(clamp(t / REEL_META.duration))) * (1 + 0.018 * punch);
    const w = h0 * aspect * push, h = h0 * push;
    const yaw = 0.11 * Math.sin((t / REEL_META.duration) * Math.PI * 2 + 0.4) + 0.05 * punch;
    const pitch = 0.06 * Math.sin((t / REEL_META.duration) * Math.PI * 2 * 0.8 + 1.7);
    const roll = -0.025 + 0.03 * ease.inOutCubic(clamp(t / REEL_META.duration));
    const cx = shadow ? 0.03 * S : 0, cy = (shadow ? 0.05 * S : 0) - 0.006 * S * Math.sin(t * 1.7);
    const f = 2.6 * S;
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([u, v]) => {
      let X = u * w, Y = v * h, Z = 0;
      [X, Y] = rot(X, Y, roll);
      [Y, Z] = rot(Y, Z, pitch);
      [X, Z] = rot(X, Z, yaw);
      const s = f / (f + Z);
      return [cx + X * s, cy + Y * s];
    });
    return squareToQuad(corners);
  }

  function scene(R, t) {
    const { a, b, p, tr } = state(t);
    const punch = tr ? Math.sin(p * Math.PI) : 0;
    // backdrop tint follows the material
    const mixc = (k) => hex(MATERIALS[a][k]).map((v, i) => lerp(v, hex(MATERIALS[b][k])[i], p));
    const heroBoost = 0.06 * Math.exp(-Math.max(0, t - HERO) * 3) * (t > HERO ? 1 : 0);
    gl.disable(gl.BLEND);
    R._full(backdrop, { uRes: [W, H], uC0: mixc('c0'), uC1: mixc('c1'), uBoost: heroBoost });

    // soft cast shadow: the mark's own silhouette, heavily mip-blurred
    R.sprite(tex[a], { M: markMatrix(t, punch, true), aspect }, null, { tint: [0.12, 0.15, 0.24], tintAmt: 1, opacity: 0.16, lod: 6.5 });

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    R._quad(mat, markMatrix(t, punch), {
      uA: tex[a], uB: tex[b], uNoise: R.tex.noise, uT: tr ? p : 0, uType: tr ? tr.type : 0,
      uDir: tr?.dir ?? [1, 0], uCenter: tr?.center ?? [0.5, 0.5], uEdge: hex(MATERIALS[b].edge),
      uGlint: tr ? -1 : glintAt(t), uOpacity: 1,
    });
  }

  function post(t) {
    const { tr, p } = state(t);
    return { bloom: 0.18, bloomThreshold: 0.96, chroma: tr ? 0.0025 * Math.sin(p * Math.PI) : 0.0, vignette: 0.06, grain: 0.012, exposure: 1 };
  }

  return { scene, post, hud: () => {}, cues: { transitions: TRANSITIONS.map((x) => [x.t0, x.d, x.type]), hero: HERO } };
}

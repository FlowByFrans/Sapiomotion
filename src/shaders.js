// GLSL sources. Every layer renders premultiplied RGBA into half-float
// targets; screen space is pixels with the origin at frame centre, y down.

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
`;

const COMMON = `
const float PI = 3.14159265;
const float TAU = 6.28318531;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

// ---------------------------------------------------------------- vertex
export const VS_QUAD = HEAD + `
layout(location=0) in vec2 aPos;
uniform mat3 uM;
uniform vec2 uRes;
uniform vec2 uJitter;
out vec2 vUv;
void main(){
  vec3 p = uM * vec3(aPos, 1.0);
  vec2 s = p.xy / p.z + uJitter;
  vec2 clip = vec2(s.x / (uRes.x * 0.5), -s.y / (uRes.y * 0.5));
  gl_Position = vec4(clip * p.z, 0.0, p.z);
  vUv = aPos;
}`;

export const VS_FULL = HEAD + `
layout(location=0) in vec2 aPos;
uniform float uFlipY;
out vec2 vUv;
void main(){
  vUv = aPos;
  vec2 c = aPos * 2.0 - 1.0;
  gl_Position = vec4(c.x, c.y * (uFlipY == 0.0 ? 1.0 : uFlipY), 0.0, 1.0);
}`;

// Instanced particles: per-instance a0 = (x, y, size, rot), a1 = premult rgba, a2 = (shape, soft, stretch, _)
export const VS_PARTICLES = HEAD + COMMON + `
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aA;
layout(location=2) in vec4 aCol;
layout(location=3) in vec4 aB;
uniform vec2 uRes;
uniform vec2 uJitter;
uniform mat3 uCam;
out vec2 vUv;
out vec4 vCol;
out vec4 vB;
void main(){
  vec2 q = (aPos - 0.5) * vec2(aA.z * aB.z, aA.z);
  vec2 p = rot2(aA.w) * q + aA.xy;
  vec3 c = uCam * vec3(p, 1.0);
  vec2 s = c.xy + uJitter;
  gl_Position = vec4(s.x / (uRes.x * 0.5), -s.y / (uRes.y * 0.5), 0.0, 1.0);
  vUv = aPos; vCol = aCol; vB = aB;
}`;

// ---------------------------------------------------------------- liquid background
// The supplied gradient render, cover-fitted and pushed around by a slow
// domain warp so it moves like lit liquid. Also carries its own shockwave.
export const FS_LIQUID = HEAD + COMMON + `
in vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uNoise;
uniform vec2 uRes;
uniform vec2 uTexSize;
uniform float uTime;
uniform float uWarp;
uniform float uZoom;
uniform float uRot;
uniform vec2 uPan;
uniform float uDim;
uniform float uSat;
uniform vec4 uShock; // xy centre px, z radius px, w strength
uniform float uSwirl;
out vec4 o;

float fbm(vec2 p){
  // two soft octaves: big, slow, liquid folds rather than coastline detail
  return texture(uNoise, p).r * 0.68 + texture(uNoise, p * 2.03 + vec2(0.31, 0.17)).g * 0.32;
}

void main(){
  vec2 p = gl_FragCoord.xy - uRes * 0.5;
  p.y = -p.y;
  // shockwave ring pushes the liquid outward
  vec2 sd = p - uShock.xy;
  float sr = length(sd);
  float ring = exp(-pow((sr - uShock.z) / (uRes.y * 0.07), 2.0));
  p -= normalize(sd + 1e-4) * ring * uShock.w;
  // swirl around centre (used in the tunnel)
  float r = length(p) / uRes.y;
  p = rot2(uSwirl * exp(-r * 1.6)) * p;
  p = rot2(uRot) * p / uZoom - uPan;
  float s = max(uRes.x / uTexSize.x, uRes.y / uTexSize.y);
  vec2 uv = p / (s * uTexSize) + 0.5;
  vec2 q = uv * vec2(0.9, 0.55) + vec2(uTime * 0.05, -uTime * 0.035);
  vec2 w = vec2(fbm(q), fbm(q + vec2(0.43, 0.71))) - 0.5;
  w += 0.35 * vec2(sin(uv.y * 5.0 + uTime * 1.3), cos(uv.x * 4.0 - uTime * 1.1));
  uv += w * uWarp;
  uv = 1.0 - abs(1.0 - abs(uv));  // mirror out of range
  vec3 c = texture(uTex, uv).rgb;
  float l = luma(c);
  c = mix(vec3(l), c, uSat);
  c *= uDim;
  o = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- vertical gradient
// Two 8-stop vertical gradients (A, B) blended by uMix, softened between
// stops, with a slow horizontal undulation so the light never sits dead still.
export const FS_GRADIENT = HEAD + COMMON + `
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uMix;
uniform float uStops[8];
uniform vec3 uA[8];
uniform vec3 uB[8];
uniform float uWave;
out vec4 o;
vec3 ramp1(vec3 c[8], float y){
  vec3 col = c[0];
  for (int i = 1; i < 8; i++){
    float t = clamp((y - uStops[i - 1]) / (uStops[i] - uStops[i - 1]), 0.0, 1.0);
    col = mix(col, c[i], t);
  }
  return col;
}
// linear stops, then a small box blur along y: smooth, with no plateaus
vec3 ramp(vec3 c[8], float y){
  vec3 s = vec3(0.0);
  for (int k = -3; k <= 3; k++) s += ramp1(c, y + float(k) * 0.018);
  return s / 7.0;
}
void main(){
  vec2 q = gl_FragCoord.xy / uRes;
  float y = 1.0 - q.y;
  float x = q.x * uRes.x / uRes.y;
  // uTime is a loop phase (0..2pi over the piece) so the motion is seamless
  y += uWave * (sin(x * 2.3 + uTime) * 0.6 + sin(x * 5.1 - 2.0 * uTime) * 0.4);
  vec3 c = mix(ramp(uA, y), ramp(uB, y), uMix);
  o = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- image sprite
// Textured quad with optional unfurl swirl, organic radial reveal and a
// cell-by-cell "block build".
export const FS_SPRITE = HEAD + COMMON + `
in vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uNoise;
uniform float uOpacity;
uniform vec3 uTint;
uniform float uTintAmt;
uniform float uBright;
uniform float uSwirl;
uniform vec2 uSwirlC;
uniform float uReveal;      // radius in uv units; >= 2 disables
uniform float uGridN;       // cells across; 0 disables
uniform float uGridT;       // build clock
uniform float uGridDur;
uniform float uGridSpread;
uniform vec3 uGridFlash;
uniform float uAspect;      // w / h of the quad, for square cells
uniform float uLod;         // mip bias: cheap defocus for soft fades
out vec4 o;

float easeOutBack(float x){ float s = 1.9; x -= 1.0; return 1.0 + (s + 1.0) * x * x * x + s * x * x; }

void main(){
  vec2 uv = vUv;
  float flash = 0.0;
  float edge = 0.0;
  if (uGridN > 0.0){
    vec2 n = vec2(uGridN, uGridN / uAspect);
    vec2 cell = floor(uv * n);
    vec2 cc = (cell + 0.5) / n;
    float delay = (1.0 - cc.y) * uGridSpread + hash12(cell + 3.7) * uGridSpread * 0.55 + abs(cc.x - 0.5) * uGridSpread * 0.4;
    float p = clamp((uGridT - delay) / uGridDur, 0.0, 1.0);
    if (p <= 0.0) discard;
    float sc = max(easeOutBack(p), 1e-3);
    vec2 f = fract(uv * n) - 0.5;
    f.y += (1.0 - p) * (1.0 - p) * 0.9;
    vec2 l = f / sc;
    if (abs(l.x) > 0.5 || abs(l.y) > 0.5) discard;
    uv = (cell + 0.5 + l) / n;
    flash = pow(1.0 - p, 2.0);
    edge = (1.0 - p) * smoothstep(0.42, 0.5, max(abs(l.x), abs(l.y)));
  }
  vec2 d = uv - uSwirlC;
  float r = length(d);
  if (uSwirl != 0.0){
    uv = uSwirlC + rot2(uSwirl * smoothstep(0.0, 0.8, r)) * d;
  }
  vec4 c = texture(uTex, uv, uLod);
  if (uReveal < 2.0){
    float a = atan(d.y, d.x);
    float nz = texture(uNoise, vec2(a / TAU * 2.0, 0.37)).b + texture(uNoise, vec2(a / TAU * 5.0, 0.71)).r * 0.5;
    float e = uReveal * (0.8 + nz * 0.35);
    c *= smoothstep(e, e - 0.05, r);
  }
  c.rgb = mix(c.rgb, uTint * c.a, uTintAmt);
  c.rgb *= uBright;
  c.rgb = mix(c.rgb, uGridFlash * c.a, flash * 0.85);
  c.rgb += uGridFlash * edge * c.a * 1.5;
  o = c * uOpacity;
}`;

// ---------------------------------------------------------------- SDF wordmark
// Channels: r = S, g = R, b = T, a = whole word. Distances in source px,
// negative inside.
export const FS_WORD = HEAD + COMMON + `
in vec2 vUv;
uniform sampler2D uSdf;
uniform sampler2D uScene;
uniform vec4 uRect;       // sdf uv rect (x, y, w, h)
uniform vec4 uChanSel;    // one-hot channel select
uniform vec4 uFill;       // premult fill
uniform vec4 uStroke;     // premult stroke
uniform float uStrokeW;   // source px
uniform vec4 uGlow;       // additive glow colour (alpha 0 -> pure add)
uniform float uGlowR;     // source px
uniform float uGlowMax;   // distance where glow must be gone (quad padding)
uniform float uInflate;
uniform float uSceneFill; // 1 = fill samples the scene texture (mask reveal)
uniform vec2 uRes;
uniform float uGlint;     // glint band centre, in word uv x (-1 off)
uniform vec4 uBevel;      // x amount, y width(px), zw light dir
uniform float uOpacity;
out vec4 o;

float sdfAt(vec2 uv){ return dot(texture(uSdf, uv), uChanSel) - uInflate; }

void main(){
  vec2 uv = uRect.xy + vUv * uRect.zw;
  float d = sdfAt(uv);
  float aa = max(fwidth(d) * 0.7, 1e-4);
  float fillA = smoothstep(aa, -aa, d);
  vec4 fill = uFill;
  if (uSceneFill > 0.5){
    fill = texture(uScene, gl_FragCoord.xy / uRes);
  }
  vec4 col = fill * fillA;
  if (uBevel.x > 0.0){
    vec2 e = uRect.zw * 0.0015;
    vec2 g = vec2(sdfAt(uv + vec2(e.x, 0.0)) - sdfAt(uv - vec2(e.x, 0.0)), sdfAt(uv + vec2(0.0, e.y)) - sdfAt(uv - vec2(0.0, e.y)));
    vec2 nrm = normalize(g + 1e-6);
    float rim = smoothstep(-uBevel.y, 0.0, d) * fillA;
    float lit = clamp(dot(-nrm, normalize(uBevel.zw)), 0.0, 1.0);
    col.rgb += vec3(1.0) * rim * lit * uBevel.x;
    col.rgb *= 1.0 - rim * (1.0 - lit) * 0.25 * uBevel.x;
  }
  if (uGlint > -0.5){
    float x = vUv.x + (vUv.y - 0.5) * 0.35;
    float b = exp(-pow((x - uGlint) / 0.035, 2.0)) + 0.35 * exp(-pow((x - uGlint + 0.07) / 0.012, 2.0));
    col.rgb += vec3(0.9, 1.0, 0.98) * b * fillA * 1.6;
  }
  float strokeA = smoothstep(aa, -aa, abs(d) - uStrokeW * 0.5) * step(0.0, uStrokeW - 1e-4);
  col = col + uStroke * strokeA * (1.0 - col.a);
  // glow hugs whatever is visible: the filled shape, or just the stroke
  float dg = uFill.a > 0.0 || uSceneFill > 0.5 ? d : abs(d) - uStrokeW * 0.5;
  float glow = exp(-max(dg, 0.0) / max(uGlowR, 1e-3)) * step(1e-3, uGlowR);
  glow *= 1.0 - smoothstep(uGlowMax * 0.5, uGlowMax, dg);   // never reach the quad edge
  float cover = max(fillA * max(uFill.a, uSceneFill), strokeA);
  col += vec4(uGlow.rgb * glow * (1.0 - cover * 0.7), 0.0);
  o = col * uOpacity;
}`;

// ---------------------------------------------------------------- procedural brand pattern
// The three-lobed node mark from the brand render, as a 2D SDF, tiled like
// the pattern printed on the white cubes.
export const MARK_SDF = `
float sdSeg(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float sdMark(vec2 p){
  vec2 J = vec2(-0.10, 0.02);
  vec2 A = vec2(0.30, -0.22), B = vec2(-0.60, -0.16), C = vec2(-0.16, 0.60);
  float d = length(p - A) - 0.36;
  d = smin(d, length(p - B) - 0.19, 0.05);
  d = smin(d, length(p - C) - 0.19, 0.05);
  d = smin(d, sdSeg(p, J, B, 0.085), 0.22);
  d = smin(d, sdSeg(p, J, C, 0.085), 0.22);
  d = smin(d, sdSeg(p, J, A, 0.11), 0.22);
  return d;
}`;

export const FS_PATTERN = HEAD + COMMON + MARK_SDF + `
in vec2 vUv;
uniform vec2 uRes;
uniform float uScale;   // tile size px
uniform vec2 uOffset;   // px
uniform float uRot;
uniform vec3 uBg;
uniform vec3 uInk;
uniform float uInkAmt;
uniform vec4 uCam;      // zoom, rot, x, y
out vec4 o;
void main(){
  vec2 p = gl_FragCoord.xy - uRes * 0.5; p.y = -p.y;
  p = rot2(-uCam.y) * (p - uCam.zw) / uCam.x;
  p = rot2(uRot) * p + uOffset;
  vec2 g = p / uScale;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id);
  f = rot2(floor(h * 4.0) * PI * 0.5) * f;
  float d = sdMark(f * 2.3);
  float px = 2.3 / uScale;
  float m = smoothstep(px, -px, d);
  vec3 c = mix(uBg, uInk, m * uInkAmt);
  // soft studio falloff
  vec2 q = (gl_FragCoord.xy / uRes - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  c *= 1.0 - dot(q, q) * 0.22;
  o = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- god rays / speed streaks
export const FS_RAYS = HEAD + COMMON + `
in vec2 vUv;
uniform sampler2D uNoise;
uniform vec2 uRes;
uniform vec2 uCenter;   // px from frame centre, y down
uniform float uRot;
uniform float uIntensity;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uFall;
out vec4 o;
void main(){
  vec2 p = gl_FragCoord.xy - uRes * 0.5; p.y = -p.y;
  p = (p - uCenter) / uRes.y;
  float r = length(p);
  float a = atan(p.y, p.x) / TAU;
  float n1 = texture(uNoise, vec2(a * 3.0 + uRot, 0.25)).g;
  float n2 = texture(uNoise, vec2(a * 7.0 - uRot * 1.7, 0.65)).b;
  float rays = pow(smoothstep(0.35, 0.95, n1), 2.0) * 0.8 + pow(smoothstep(0.4, 1.0, n2), 3.0) * 0.6;
  float fall = exp(-r * uFall) * smoothstep(0.0, 0.08, r);
  vec3 c = mix(uColB, uColA, exp(-r * 3.0)) * rays * fall + uColA * exp(-r * r * 18.0) * 0.6;
  o = vec4(c * uIntensity, 0.0);
}`;

export const FS_STREAKS = HEAD + COMMON + `
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uSpeed;
uniform float uIntensity;
uniform vec3 uCol;
out vec4 o;
void main(){
  vec2 p = gl_FragCoord.xy - uRes * 0.5;
  p /= uRes.y;
  float r = length(p);
  float a = atan(p.y, p.x) / TAU + 0.5;
  float N = 180.0;
  float A = a * N;
  float id = floor(A);
  float f = fract(A) - 0.5;
  float rnd = hash11(id * 1.37 + 0.5);
  float rnd2 = hash11(id * 2.71 + 4.2);
  float thick = 0.06 + 0.10 * rnd2;
  float line = smoothstep(thick, 0.0, abs(f));
  float z = log(r + 1e-3) * 1.3 - uTime * uSpeed * (0.6 + rnd) + rnd * 13.0;
  float seg = fract(z);
  float len = 0.25 + 0.5 * rnd2;
  float s = smoothstep(0.0, 0.04, seg) * smoothstep(len, len * 0.3, seg);
  float vis = step(0.45, rnd) * smoothstep(0.08, 0.35, r);
  vec3 c = uCol * line * s * vis * uIntensity * (0.5 + rnd2);
  o = vec4(c, 0.0);
}`;

// ---------------------------------------------------------------- particles
export const FS_PARTICLES = HEAD + COMMON + `
in vec2 vUv;
in vec4 vCol;
in vec4 vB;
out vec4 o;
void main(){
  vec2 q = vUv * 2.0 - 1.0;
  float a;
  if (vB.x < 0.5){
    // bokeh disc with a faint bright rim
    float r = length(q);
    a = smoothstep(1.0, 1.0 - max(vB.y, 0.02), r);
    a *= 0.75 + 0.25 * smoothstep(0.55, 0.95, r);
  } else if (vB.x < 1.5){
    // petal: pointed ellipse with a soft vein highlight
    vec2 e = q * vec2(1.0, 1.0 + 0.6 * q.x);
    float r = length(e);
    a = smoothstep(1.0, 0.75, r);
    a *= 0.8 + 0.2 * (1.0 - abs(q.y));
  } else {
    // square chip
    float m = max(abs(q.x), abs(q.y));
    a = smoothstep(1.0, 0.92, m);
  }
  o = vCol * a;
}`;

// ---------------------------------------------------------------- transitions
export const FS_GRIDX = HEAD + COMMON + `
in vec2 vUv;
uniform sampler2D uA;
uniform sampler2D uB;
uniform vec2 uRes;
uniform float uCell;
uniform float uT;      // 0..1
uniform vec3 uEdge;
out vec4 o;
float inBack(float x){ float s = 1.8; return (s + 1.0) * x * x * x - s * x * x; }
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 cell = floor(fc / uCell);
  vec2 cc = (cell + 0.5) * uCell;
  vec2 n = cc / uRes;
  float delay = n.x * 0.55 + (1.0 - n.y) * 0.15 + hash12(cell) * 0.18;
  float p = clamp((uT - delay) / 0.22, 0.0, 1.0);
  float s = 1.0 - clamp(inBack(p), 0.0, 1.0);
  vec2 l = (fc - cc) / max(s, 1e-3);
  vec4 b = texture(uB, vUv);
  if (s > 0.001 && abs(l.x) < uCell * 0.5 && abs(l.y) < uCell * 0.5){
    vec4 a = texture(uA, (cc + l) / uRes);
    float edge = smoothstep(uCell * 0.44, uCell * 0.5, max(abs(l.x), abs(l.y))) * step(0.001, p);
    a.rgb = mix(a.rgb, uEdge, edge * 0.9);
    a.rgb = mix(a.rgb, uEdge, p * 0.35);
    o = a;
  } else {
    o = b;
  }
}`;

// Diagonal marquee bands of repeated SRT wordmarks.
export const FS_MARQUEE = HEAD + COMMON + `
in vec2 vUv;
uniform sampler2D uSdf;
uniform vec2 uRes;
uniform float uAngle;
uniform float uBandH;      // px
uniform float uWordH;      // px (word cap height)
uniform vec2 uSdfSize;     // sdf texture size in source px (incl. padding)
uniform float uPad;
uniform vec2 uWordSrc;     // word size in source px
uniform float uIn[7];      // leading edge per band, px along band axis
uniform float uOut[7];     // trailing edge per band
uniform float uScroll[7];  // text scroll per band
uniform vec3 uBandCol[7];
uniform vec3 uTextCol[7];
uniform float uOutline[7];
out vec4 o;
void main(){
  vec2 p = gl_FragCoord.xy - uRes * 0.5; p.y = -p.y;
  vec2 q = rot2(uAngle) * p;
  float k = floor(q.y / uBandH + 3.5);
  if (k < 0.0 || k > 6.0) { o = vec4(0.0); return; }
  int i = int(k);
  float lead = uIn[i], trail = uOut[i];
  float cov = smoothstep(lead - 1.0, lead + 1.0, q.x) * smoothstep(trail + 1.0, trail - 1.0, q.x);
  if (cov <= 0.0) { o = vec4(0.0); return; }
  float yIn = q.y - (k - 3.5) * uBandH;        // 0..bandH
  float sc = uWordSrc.y / uWordH;              // source px per screen px
  float gap = uWordH * 0.9;
  float period = uWordSrc.x / sc + gap;
  float x = mod(q.x - uScroll[i], period);
  vec2 src = vec2(x * sc, (yIn - (uBandH - uWordH) * 0.5) * sc);
  vec2 uv = (src + uPad) / uSdfSize;
  float d = texture(uSdf, uv).a;
  if (src.x > uWordSrc.x + uPad * 0.9 || src.y < -uPad * 0.9 || src.y > uWordSrc.y + uPad * 0.9) d = 99.0;
  float aa = sc * 0.9;
  float fill = smoothstep(aa, -aa, d);
  float line = smoothstep(aa, -aa, abs(d) - 1.6);
  float t = mix(fill, line, uOutline[i]);
  vec3 c = mix(uBandCol[i], uTextCol[i], t);
  o = vec4(c, 1.0) * cov;
}`;

// ---------------------------------------------------------------- utility passes
export const FS_BLIT = HEAD + `
in vec2 vUv;
uniform sampler2D uSrc;
uniform float uWeight;
out vec4 o;
void main(){ o = texture(uSrc, vUv) * uWeight; }`;

export const FS_DOWN = HEAD + COMMON + `
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uPrefilter;
uniform float uThreshold;
out vec4 o;
vec3 s(vec2 off){ return texture(uSrc, vUv + off * uTexel).rgb; }
void main(){
  vec3 a = s(vec2(-2,-2)), b = s(vec2(0,-2)), c = s(vec2(2,-2));
  vec3 d = s(vec2(-1,-1)), e = s(vec2(1,-1));
  vec3 f = s(vec2(-2,0)), g = s(vec2(0,0)), h = s(vec2(2,0));
  vec3 i = s(vec2(-1,1)), j = s(vec2(1,1));
  vec3 k = s(vec2(-2,2)), l = s(vec2(0,2)), m = s(vec2(2,2));
  vec3 col = (d + e + i + j) * 0.125 + (a + c + k + m) * 0.03125 + (b + f + h + l) * 0.0625 + g * 0.125;
  if (uPrefilter > 0.5){
    float br = max(col.r, max(col.g, col.b));
    float knee = uThreshold * 0.5;
    float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    float w = max(soft, br - uThreshold) / max(br, 1e-4);
    col *= w;
  }
  o = vec4(col, 1.0);
}`;

export const FS_UP = HEAD + `
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
out vec4 o;
void main(){
  vec2 d = uTexel * uRadius;
  vec3 c = texture(uSrc, vUv).rgb * 4.0;
  c += (texture(uSrc, vUv + vec2(-d.x, 0)).rgb + texture(uSrc, vUv + vec2(d.x, 0)).rgb + texture(uSrc, vUv + vec2(0, -d.y)).rgb + texture(uSrc, vUv + vec2(0, d.y)).rgb) * 2.0;
  c += texture(uSrc, vUv + vec2(-d.x, -d.y)).rgb + texture(uSrc, vUv + vec2(d.x, -d.y)).rgb + texture(uSrc, vUv + vec2(-d.x, d.y)).rgb + texture(uSrc, vUv + vec2(d.x, d.y)).rgb;
  o = vec4(c / 16.0, 1.0);
}`;

// Final grade: shockwave lensing, chromatic aberration, bloom, flash,
// highlight roll-off, vignette, grain, crisp HUD on top, dither.
export const FS_POST = HEAD + COMMON + `
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uHud;
uniform vec2 uRes;
uniform float uBloomAmt;
uniform float uChroma;
uniform vec4 uShock;      // xy centre (uv), z radius (in height units), w strength
uniform float uFlash;
uniform vec3 uFlashCol;
uniform float uExposure;
uniform float uVignette;
uniform float uGrain;
uniform float uSeed;
uniform float uLetterbox;
out vec4 o;

vec3 knee(vec3 c){
  vec3 k = vec3(0.82);
  vec3 over = max(c - k, 0.0);
  return min(c, k) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}

void main(){
  vec2 uv = vUv;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 d = (uv - uShock.xy) * asp;
  float r = length(d);
  float ring = exp(-pow((r - uShock.z) / 0.06, 2.0));
  uv -= normalize(d + 1e-5) / asp * ring * uShock.w;
  vec2 cd = (uv - 0.5);
  vec2 off = cd * length(cd * asp) * uChroma;
  vec3 c;
  c.r = texture(uScene, uv + off).r;
  c.g = texture(uScene, uv).g;
  c.b = texture(uScene, uv - off).b;
  vec3 bl;
  bl.r = texture(uBloom, uv + off * 1.5).r;
  bl.g = texture(uBloom, uv).g;
  bl.b = texture(uBloom, uv - off * 1.5).b;
  c += bl * uBloomAmt;
  c += ring * uShock.w * 6.0 * vec3(0.7, 1.0, 0.95);
  c *= uExposure;
  c = mix(c, uFlashCol, clamp(uFlash, 0.0, 1.0));
  c = knee(c);
  vec2 q = (vUv - 0.5) * asp;
  c *= mix(1.0, 1.0 - dot(q, q) * 0.9, uVignette);
  vec4 hud = texture(uHud, vec2(vUv.x, 1.0 - vUv.y));
  c = c * (1.0 - hud.a) + hud.rgb;
  float g = hash12(vUv * uRes + uSeed * 91.7) - 0.5;
  float g2 = hash12(vUv * uRes * 0.5 + uSeed * 13.1) - 0.5;
  c += (g * 0.7 + g2 * 0.3) * uGrain * (0.6 + 0.4 * (1.0 - luma(c)));
  float lb = step(abs(vUv.y - 0.5), 0.5 - uLetterbox);
  c *= lb;
  c += (hash12(vUv * uRes + 7.0 + uSeed) - 0.5) / 255.0;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

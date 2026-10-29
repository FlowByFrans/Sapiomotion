// Browser entry. The render script drives this page frame by frame through
// window.SAPIO; opening it directly in a browser plays a live preview.

import { Renderer } from './renderer.js';
import { createComp } from './comp.js';
import { createJoin, JOIN_META } from './join.js';
import { FPS, DURATION } from './timeline.js';

// compositions: the SRT spot and the "Join the competition" -> Sapio loop
const COMPS = {
  srt: { create: createComp, fps: FPS, duration: DURATION },
  join: { create: createJoin, ...JOIN_META },
};

const api = {
  async init({ width = 1920, height = 1080, comp = 'srt' } = {}) {
    await document.fonts.load('600 17px "JetBrains Mono"');
    const R = new Renderer(document.getElementById('c'), width, height);
    await R.loadAssets('../');
    const def = COMPS[comp];
    this.R = R;
    this.fps = def.fps;
    this.comp = await def.create(R);
    return { frames: Math.round(def.fps * def.duration), fps: def.fps };
  },

  // Render one frame and return its pixels (top row first) as base64 RGBA.
  async frame(i, opts) {
    this.R.renderFrame(this.comp, i, this.fps, opts);
    const px = this.R.readPixels();
    const url = await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(new Blob([px]));
    });
    return url.slice(url.indexOf(',') + 1);
  },
};
window.SAPIO = api;

// live preview when opened by hand (?play)
const params = new URLSearchParams(location.search);
if (params.has('play')) {
  const { frames, fps } = await api.init({ comp: params.get('comp') || 'srt' });
  const start = performance.now();
  const tick = () => {
    const f = Math.floor(((performance.now() - start) / 1000) * fps) % frames;
    api.R.renderFrame(api.comp, f, fps, { subframes: 1 });
    requestAnimationFrame(tick);
  };
  tick();
}

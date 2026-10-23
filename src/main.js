// Browser entry. The render script drives this page frame by frame through
// window.SAPIO; opening it directly in a browser plays a live preview.

import { Renderer } from './renderer.js';
import { createComp } from './comp.js';
import { FPS, DURATION } from './timeline.js';

const api = {
  async init({ width = 1920, height = 1080 } = {}) {
    await document.fonts.load('600 17px "JetBrains Mono"');
    const R = new Renderer(document.getElementById('c'), width, height);
    await R.loadAssets('../');
    this.R = R;
    this.comp = createComp(R);
    return { frames: Math.round(FPS * DURATION), fps: FPS };
  },

  // Render one frame and return its pixels (top row first) as base64 RGBA.
  async frame(i, opts) {
    this.R.renderFrame(this.comp, i, FPS, opts);
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
if (new URLSearchParams(location.search).has('play')) {
  await api.init();
  const start = performance.now();
  const tick = () => {
    const f = Math.floor(((performance.now() - start) / 1000) * FPS) % Math.round(FPS * DURATION);
    api.R.renderFrame(api.comp, f, FPS, { subframes: 1 });
    requestAnimationFrame(tick);
  };
  tick();
}

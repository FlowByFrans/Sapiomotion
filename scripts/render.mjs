// Offline renderer: serves the repo, drives headless Chromium frame by frame
// and pipes raw RGBA into ffmpeg.
//
//   node scripts/render.mjs                       -> out/srt-1920x1080.mp4
//   node scripts/render.mjs --size 1080x1080      -> square cut
//   node scripts/render.mjs --still 0,0.5,1.2     -> PNG stills at those times
//   node scripts/render.mjs --sub 4 --range 0:60  -> quick partial preview
//   node scripts/render.mjs --comp join --size 1080x1080 -> Sapio "join" loop

import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, []),
);
const [W, H] = String(args.size || '1920x1080').split('x').map(Number);
const SUB = Number(args.sub || 12);
const COMP = String(args.comp || 'srt');
const OUT = path.resolve(ROOT, args.out || `out/${COMP}-${W}x${H}.mp4`);

// make sure generated assets exist
const gen = path.join(ROOT, 'assets/gen');
const need = ['srt_sdf.bin', 'srt_sdf.json', 'noise.bin', 'bloom_front.png', 'bloom_leaves.png', 'bloom_fill.png'];
if (!need.every((f) => fs.existsSync(path.join(gen, f)))) {
  for (const s of ['build_sdf.py', 'build_noise.py', 'build_layers.py']) execFileSync('python3', [path.join(ROOT, 'tools', s)], { stdio: 'inherit' });
}

const MIME = { '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => { console.error('[page error]', e.message); process.exit(1); });
await page.goto(`http://127.0.0.1:${port}/src/index.html`);
await page.waitForFunction(() => window.SAPIO);
const info = await page.evaluate(([w, h, comp]) => window.SAPIO.init({ width: w, height: h, comp }), [W, H, COMP]);
if (args.debug) await page.evaluate((d) => { window.SAPIO_DEBUG = d; }, String(args.debug));

const grab = async (i) => Buffer.from(await page.evaluate(([i, sub]) => window.SAPIO.frame(i, { subframes: sub }), [i, SUB]), 'base64');

if (args.still) {
  const dir = path.resolve(ROOT, args.dir || 'out/stills');
  fs.mkdirSync(dir, { recursive: true });
  for (const ts of String(args.still).split(',')) {
    const f = Math.round(Number(ts) * info.fps);
    const t0 = Date.now();
    const buf = await grab(f);
    const file = path.join(dir, `f${String(f).padStart(3, '0')}.png`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-', file], { input: buf });
    console.log(`still t=${ts} -> ${file} (${Date.now() - t0}ms)`);
  }
} else {
  const [a, b] = args.range ? String(args.range).split(':').map(Number) : [0, info.frames];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const audio = path.join(ROOT, COMP === 'srt' ? 'out/audio.wav' : `out/${COMP}-audio.wav`);
  const withAudio = !args.range && fs.existsSync(audio) && !args.mute;
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(info.fps), '-i', '-',
    ...(withAudio ? ['-i', audio] : []),
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf || 14), '-profile:v', 'high', '-level', '4.2',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-g', '60', '-bf', '2',
    ...(withAudio ? ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest'] : []),
    '-movflags', '+faststart', OUT,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = a; i < b; i++) {
    const buf = await grab(i);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 10 === 0) {
      const el = (Date.now() - t0) / 1000, per = el / (i - a + 1);
      console.log(`frame ${i}/${b}  ${per.toFixed(2)}s/f  eta ${Math.round(per * (b - i))}s`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`wrote ${OUT} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
await browser.close();
server.close();

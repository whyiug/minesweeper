/* global console, document, performance, PerformanceObserver, requestAnimationFrame */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import process from 'node:process';

const server = await createServer({ mode: 'e2e', server: { host: '127.0.0.1', port: 4178, strictPort: true } });
await server.listen();
const { createGame, reduceGame, seededRandom } = await server.ssrLoadModule('/src/core/index.ts');
const { getConfig } = await server.ssrLoadModule('/src/config/game.ts');
const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * .95)], maxMs: sorted.at(-1) };
};
const samples = [];
for (let seed = 0; seed < 1000; seed++) {
  const state = createGame(getConfig('expert', 'auto'), `measure-${seed}`);
  const random = seededRandom(seed);
  const before = performance.now();
  reduceGame(state, { type: 'REVEAL', index: 255 }, { now: 0, random });
  samples.push(performance.now() - before);
}
const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4178/?seed=42');
  await page.getByRole('button', { name: /高级/ }).click();
  await page.waitForTimeout(200);
  const rendered = await page.evaluate(async () => {
    const longTasks = [];
    const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)));
    observer.observe({ type: 'longtask', buffered: false });
    const values = [];
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (let index = 0; index < 40; index++) {
      document.querySelector('.new-game').click();
      await frame();
      const before = performance.now();
      document.querySelector('[data-cell="255"]').click();
      await frame();
      values.push(performance.now() - before);
    }
    observer.disconnect();
    return { values, longTasks, cellCount: document.querySelectorAll('.cell').length };
  });
  const pairs = [
    ['primary text', '#e8f1f9', '#20364d'], ['secondary text', '#a4b8cb', '#20364d'],
    ['board hint', '#a8c0d3', '#233c51'], ['number 1', '#1764a4', '#e5f1fa'],
    ['number 2', '#167258', '#e5f1fa'], ['number 3', '#b23d45', '#e5f1fa'],
    ['number 4', '#67429c', '#e5f1fa'], ['number 5', '#994225', '#e5f1fa'],
    ['number 6', '#08717d', '#e5f1fa'], ['number 7', '#394557', '#e5f1fa'],
    ['number 8', '#624e60', '#e5f1fa'], ['primary button', '#153d59', '#91cefa'],
    ['flag stroke', '#683d2d', '#f5c65c'], ['mine icon', '#243d52', '#ccdce8'],
  ];
  const luminance = hex => {
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const contrast = pairs.map(([name, foreground, background]) => {
    const a = luminance(foreground), b = luminance(background);
    return { name, foreground, background, ratio: Number(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toFixed(2)) };
  });
  const report = {
    measuredAt: new Date().toISOString(), host: { os: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, node: process.version, browser: browser.version() },
    ruleOnly: { scenario: 'expert/auto, first reveal255, 1000 distinct seeds, no rendering', ...summarize(samples) },
    browser: { scenario: 'Vite development e2e build, expert480 cells, synthetic accessible click, dispatch to second requestAnimationFrame; includes frame scheduling, not event-handler time or FPS', ...summarize(rendered.values), longTasksOver50ms: rendered.longTasks, cellCountAfter40Restarts: rendered.cellCount },
    limits: ['Shared Linux host; headless software browser; no CPU throttling.', 'No physical Mac, iPad, Safari or mobile-device performance measurement.', 'Timing reflects this run only, not a cross-device latency or 60 FPS guarantee.'],
    contrast: { method: 'WCAG sRGB relative luminance formula; explicit theme token pairs, opaque backgrounds; not a full accessibility conformance audit.', pairs: contrast },
  };
  await writeFile('evidence/measurements.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await server.close(); }

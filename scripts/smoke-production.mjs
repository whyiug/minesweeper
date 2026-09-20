/* global console, document, innerWidth */
import { preview } from 'vite';
import { chromium } from 'playwright';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const server = await preview({ preview: { host: '127.0.0.1', port: 4179, strictPort: true } });
const browser = await chromium.launch({ channel: 'chromium' });
const origin = 'http://127.0.0.1:4179';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], responses = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => responses.push({ url: response.url(), status: response.status() }));
  await page.goto(origin);
  if (await page.getByRole('gridcell').count() !== 81) throw new Error('Production default board is not 9x9');
  await page.locator('[data-cell="40"]').click();
  if (await page.locator('.cell.revealed').count() < 9) throw new Error('First-click safe area did not reveal');
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByRole('button', { name: '关闭面板' }).click();
  await page.reload();
  if (await page.locator('.cell.revealed').count() !== 0) throw new Error('Production game persisted across refresh');
  if (await page.getByRole('button', { name: '开启声音' }).count() !== 1) throw new Error('Production sound defaults changed');
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Unexpected horizontal page overflow');
  const icon = await page.request.get(`${origin}/icons/crystal.svg`);
  if (!icon.ok()) throw new Error('Missing icon');
  const files = await readdir('dist/assets');
  const js = (await Promise.all(files.filter(file => file.endsWith('.js')).map(file => readFile(`dist/assets/${file}`, 'utf8')))).join('\n');
  if (js.includes('URLSearchParams') || js.includes('get("seed")')) throw new Error('Test URL seed survived production compilation');
  if (errors.length || responses.some(response => ![200, 304].includes(response.status) || !response.url.startsWith(`${origin}/`))) throw new Error(`Resource verification failed: ${JSON.stringify({ errors, responses })}`);
  await page.screenshot({ path: 'evidence/screenshots/production-ready.png', fullPage: true });
  const report = { checkedAt: new Date().toISOString(), browser: browser.version(), source: 'local HTTP preview of production dist', defaultCells: 81, firstClickSafe: true, refreshStartsNewGame: true, defaultMuted: true, testSeedAbsentFromBundle: true, resourceResponses: responses, iconStatus: icon.status(), pageErrors: errors, deployed: false };
  await writeFile('evidence/production-smoke.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }

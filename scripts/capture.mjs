/* global console */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, rename, writeFile } from 'node:fs/promises';

const server = await createServer({ mode: 'e2e', server: { host: '127.0.0.1', port: 4177, strictPort: true } });
await server.listen();
const { generateTruth, seededRandom } = await server.ssrLoadModule('/src/core/index.ts');
const { getConfig } = await server.ssrLoadModule('/src/config/game.ts');
await mkdir('evidence/screenshots', { recursive: true });
await mkdir('evidence/video', { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: 'evidence/video', size: { width: 1440, height: 1000 } } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const cell = index => page.locator(`[data-cell="${index}"]`);
const go = () => page.goto('http://127.0.0.1:4177/?seed=42');
const shot = async name => { await page.waitForTimeout(350); await page.screenshot({ path: `evidence/screenshots/${name}.png`, fullPage: true }); };
try {
  await go();
  await shot('desktop-ready');
  const box = await cell(40).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(250); await page.mouse.up();
  await page.waitForTimeout(400);
  // Flag a real neighboring mine, then execute one visible-number chord.
  await cell(15).click({ button: 'right' });
  await page.waitForTimeout(200);
  await cell(5).click();
  await shot('desktop-beginner');
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await shot('settings');
  await page.getByRole('button', { name: '关闭面板' }).click();
  // Fast new game while animations may still be active; state is immediate.
  await page.getByRole('button', { name: '新的一局', exact: true }).click();
  await cell(40).click();
  await page.getByRole('button', { name: '新的一局', exact: true }).click();
  await cell(40).click();
  await cell(6).click({ button: 'right' });
  await cell(5).click();
  await shot('lost');
  await page.getByRole('button', { name: '新的一局', exact: true }).click();
  await cell(40).click();
  const truth = generateTruth(getConfig('beginner'), 40, seededRandom(42));
  for (let index = 0; index < 81; index++) {
    if (!truth.mines[index] && await cell(index).evaluate(element => element.classList.contains('hidden'))) await cell(index).click();
  }
  await shot('won');
  await page.getByRole('combobox', { name: '成绩称呼' }).selectOption('哥哥');
  await page.getByRole('button', { name: '保存成绩', exact: true }).click();
  await page.locator('.best-score').click();
  await shot('leaderboard');
  await page.getByRole('button', { name: '关闭面板' }).click();
  await go();
  await page.getByRole('button', { name: /中级/ }).click();
  await cell(136).click();
  await shot('desktop-intermediate');
  await go();
  await page.getByRole('button', { name: /高级/ }).click();
  await cell(255).click();
  await shot('desktop-expert');
  await go();
  await page.getByRole('button', { name: '自动', exact: true }).click();
  await cell(40).click(); await cell(15).click({ button: 'right' });
  await shot('auto-chord');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '新的一局', exact: true }).click();
  await cell(40).click(); await cell(15).click({ button: 'right' });
  await shot('reduced-motion');
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto('http://127.0.0.1:4177/?seed=42');
  await mobilePage.locator('[data-cell="40"]').tap();
  await mobilePage.getByRole('button', { name: '插旗', exact: true }).click();
  await mobilePage.locator('[data-cell="15"]').tap();
  await mobilePage.waitForTimeout(350);
  await mobilePage.screenshot({ path: 'evidence/screenshots/narrow.png', fullPage: true });
  await mobile.close();
  await writeFile('evidence/capture.json', JSON.stringify({ capturedAt: new Date().toISOString(), browser: browser.version(), viewport: { width: 1440, height: 1000 }, mobileViewport: { width: 390, height: 844 }, seed: 42, mode: 'e2e only', pageErrors: errors, note: 'Actual implementation. Screenshots are visual evidence; interaction.webm is an automated recording, not physical-device validation.' }, null, 2));
  console.log(JSON.stringify({ screenshots: 11, pageErrors: errors }));
} finally {
  const video = page.video();
  await context.close();
  if (video) await rename(await video.path(), 'evidence/video/interaction.webm');
  await browser.close(); await server.close();
}

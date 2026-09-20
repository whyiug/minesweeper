import { expect, test } from '@playwright/test';

test('real Web Audio initializes only on opt-in and muted actions create no voices', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    const audit = { contexts: 0, oscillators: 0, stopped: 0, state: '' };
    Object.assign(window, { audioAudit: audit });
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) { super(options); audit.contexts++; this.addEventListener('statechange', () => { audit.state = this.state; }); }
      createOscillator() {
        const oscillator = super.createOscillator(); audit.oscillators++;
        const stop = oscillator.stop.bind(oscillator);
        oscillator.stop = (when?: number) => { audit.stopped++; stop(when); };
        return oscillator;
      }
    };
  });
  const audit = () => page.evaluate(() => (window as unknown as { audioAudit: { contexts: number; oscillators: number; stopped: number; state: string } }).audioAudit);
  await page.goto('/?seed=42');
  await page.locator('[data-cell="40"]').click();
  expect((await audit()).contexts).toBe(0);
  await page.getByRole('button', { name: '开启声音' }).click();
  await expect.poll(async () => (await audit()).state).toBe('running');
  expect((await audit()).contexts).toBe(1);
  await page.locator('[data-cell="15"]').click({ button: 'right' });
  expect((await audit()).oscillators).toBe(1);
  await page.locator('[data-cell="5"]').click();
  expect((await audit()).oscillators).toBe(3);
  await page.getByRole('button', { name: '关闭声音' }).click();
  const before = await audit();
  await page.getByRole('button', { name: '新的一局', exact: true }).click();
  await page.locator('[data-cell="40"]').click();
  await page.locator('[data-cell="15"]').click({ button: 'right' });
  expect((await audit()).oscillators).toBe(before.oscillators);
});

test('small laptop fits intermediate board and chord controls; changing size preserves the game', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: /中级/ }).click();
  const board = await page.locator('.board').boundingBox();
  const controls = await page.locator('.chord-bar').boundingBox();
  expect(board!.y + board!.height).toBeLessThanOrEqual(800);
  expect(controls!.y + controls!.height).toBeLessThanOrEqual(800);
  await page.locator('[data-cell="136"]').click();
  const revealed = await page.locator('.cell.revealed').count();
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByRole('switch', { name: /大格子/ }).check();
  await page.getByRole('button', { name: '应用设置' }).click();
  await expect(page.locator('.cell.revealed')).toHaveCount(revealed);
  expect((await page.locator('[data-cell="0"]').boundingBox())!.width).toBe(48);
});

test('timer ticks do not rerender cells or accumulate decorative nodes', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.locator('[data-cell="40"]').click();
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    Object.assign(window, { cellMutations: 0 });
    const observer = new MutationObserver(records => {
      const target = window as unknown as { cellMutations: number };
      target.cellMutations += records.length;
    });
    observer.observe(document.querySelector('.board')!, { attributes: true, subtree: true, childList: true, characterData: true });
  });
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => (window as unknown as { cellMutations: number }).cellMutations)).toBe(0);
  await expect(page.getByRole('gridcell')).toHaveCount(81);
});

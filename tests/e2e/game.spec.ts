import { expect, test } from '@playwright/test';
import { getConfig } from '../../src/config/game';
import { generateTruth, seededRandom } from '../../src/core';

test('four presets, first-click area and hidden accessibility boundary', async ({ page }) => {
  for (const [id, name, count] of [['intro', '启蒙', 36], ['beginner', '初级', 81], ['intermediate', '中级', 256], ['expert', '高级', 480]] as const) {
    await page.goto('/?seed=42');
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.getByRole('gridcell')).toHaveCount(count);
    await expect(page.getByRole('gridcell').first()).toHaveAccessibleName('1 行 1 列，未翻开');
    expect(await page.locator('.cell.hidden').evaluateAll(elements => elements.every(element => !element.hasAttribute('data-mine') && !element.hasAttribute('data-number') && element.textContent === ''))).toBe(true);
    const config = getConfig(id);
    const first = Math.floor(config.rows / 2) * config.cols + Math.floor(config.cols / 2);
    await page.locator(`[data-cell="${first}"]`).click();
    await expect(page.locator(`[data-cell="${first}"]`)).toHaveAccessibleName(/空白/);
    await expect(page.locator('.phase-label')).toHaveText('游戏进行中');
  }
});

test('changing rules during play requires explicit new-game choice and cancel preserves board', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.locator('[data-cell="40"]').click();
  const count = await page.locator('.cell.revealed').count();
  await page.getByRole('button', { name: /中级/ }).click();
  await expect(page.getByRole('dialog')).toContainText('会结束当前局');
  await page.getByRole('button', { name: '继续当前局' }).click();
  await expect(page.locator('.cell.revealed')).toHaveCount(count);
  await page.getByRole('button', { name: '自动', exact: true }).click();
  await page.getByRole('button', { name: '应用并开始新局' }).click();
  await expect(page.locator('.cell.revealed')).toHaveCount(0);
  await expect(page.locator('.auto-warning')).toContainText('插错旗也可能触雷');
});

test('wrong flag causes loss in both single and atomic auto modes; terminal is frozen', async ({ page }) => {
  for (const mode of ['单击', '自动']) {
    await page.goto('/?seed=42');
    await page.getByRole('button', { name: mode, exact: true }).click();
    await page.locator('[data-cell="40"]').click();
    await page.locator('[data-cell="6"]').click({ button: 'right' });
    if (mode === '单击') await page.locator('[data-cell="5"]').click();
    await expect(page.locator('.phase-label')).toHaveText('本局结束');
    await expect(page.locator('.cell.exploded')).toHaveCount(1);
    await expect(page.locator('.cell.wrong-flag')).toHaveCount(1);
    const before = await page.locator('.cell').evaluateAll(elements => elements.map(element => [element.className, element.getAttribute('aria-label')]));
    // Intentionally send input despite aria-disabled to verify rules freeze as well as UI semantics.
    await page.locator('[data-cell="80"]').click({ button: 'right', force: true });
    expect(await page.locator('.cell').evaluateAll(elements => elements.map(element => [element.className, element.getAttribute('aria-label')]))).toEqual(before);
    await expect(page.getByRole('button', { name: '保存成绩' })).toHaveCount(0);
  }
});

test('winning requires all safe cells and exposes result without moving board', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.locator('[data-cell="40"]').click();
  const bounds = await page.locator('.board').boundingBox();
  const truth = generateTruth(getConfig(), 40, seededRandom(42));
  for (let index = 0; index < 81; index++) {
    const cell = page.locator(`[data-cell="${index}"]`);
    if (!truth.mines[index] && await cell.evaluate(element => element.classList.contains('hidden'))) await cell.click();
  }
  await expect(page.locator('.phase-label')).toHaveText('全部安全格已翻开');
  await expect(page.locator('.cell.revealed')).toHaveCount(71);
  await expect(page.getByRole('button', { name: '保存成绩' })).toBeVisible();
  expect(await page.locator('.board').boundingBox()).toEqual(bounds);
});

test('animations never postpone committed cells; immediate restart drops old animation work', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.locator('[data-cell="40"]').click();
  await expect(page.locator('.cell.revealed')).toHaveCount(37);
  await page.getByRole('button', { name: '新的一局', exact: true }).click();
  await expect(page.locator('.cell.revealed')).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(page.locator('.cell.revealed')).toHaveCount(0);
  expect(await page.locator('.board').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-cell="40"]').click();
  await expect(page.locator('.cell.revealed')).toHaveCount(37);
  expect(await page.locator('.board').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
});

test('settings cancel has no effect, sound defaults off, visible timer is optional', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开启声音' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByRole('switch', { name: /显示计时/ }).uncheck();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('.metrics [aria-label="用时"]')).toHaveText('00:00');
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByRole('switch', { name: /显示计时/ }).uncheck();
  await page.getByRole('switch', { name: /展开动效/ }).uncheck();
  await page.getByRole('button', { name: '应用设置' }).click();
  await expect(page.locator('.metrics [aria-label="用时已隐藏"]')).toHaveText('—:—');
  await page.locator('[data-cell="40"]').click();
  expect(await page.locator('.board').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
});

test('time is measured from clock differences, continues through visibility, flags do not start it', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-20T08:00:00Z') });
  await page.goto('/?seed=42');
  await page.locator('[data-cell="80"]').click({ button: 'right' });
  await page.clock.runFor(5_000);
  await expect(page.locator('.metrics [aria-label="用时"]')).toHaveText('00:00');
  await page.locator('[data-cell="40"]').click();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.clock.fastForward(1_010_000);
  await expect(page.locator('.metrics [aria-label="用时"]')).toHaveText('16:50');
});

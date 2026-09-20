import { expect, test, type Page } from '@playwright/test';
import { getConfig } from '../../src/config/game';
import { createGame, neighbors, reduceGame, seededRandom, type ChordMode } from '../../src/core';

const cell = (page: Page, index: number) => page.locator(`[data-cell="${index}"]`);

function openedGame(mode: ChordMode = 'single') {
  const state = reduceGame(createGame(getConfig('beginner', mode), 'input-browser-test'),
    { type: 'REVEAL', index: 0 }, { now: 1_000, random: seededRandom(42) });
  if (!state.truth) throw new Error('Test setup did not generate a board.');
  return { state, truth: state.truth };
}

function chordFixture(revealed: boolean, mode: ChordMode = 'single') {
  const { state, truth } = openedGame(mode);
  const index = state.covers.findIndex((cover, index) => {
    const adjacent = neighbors(index, state.config.rows, state.config.cols);
    return (cover === 'revealed') === revealed && cover !== 'flagged' && !truth.mines[index] && truth.counts[index] > 0 &&
      adjacent.some(next => state.covers[next] === 'hidden' && !truth.mines[next]);
  });
  if (index < 0) throw new Error('The fixed seed lacks the required input test position.');
  const adjacent = neighbors(index, state.config.rows, state.config.cols);
  return {
    index,
    flags: adjacent.filter(next => truth.mines[next]),
    hiddenSafe: adjacent.filter(next => state.covers[next] === 'hidden' && !truth.mines[next]),
  };
}

async function prepareChord(page: Page, revealed: boolean, mode: ChordMode = 'single') {
  const fixture = chordFixture(revealed, mode);
  if (mode === 'double') await page.locator('.chord-options').getByRole('button', { name: '双击', exact: true }).click();
  await cell(page, 0).click();
  for (const index of fixture.flags) await cell(page, index).click({ button: 'right' });
  return fixture;
}

test.beforeEach(async ({ page }) => { await page.goto('/?seed=42'); });

test('mouse right-click, Shift-click and Ctrl-click each submit one flag action without starting play', async ({ page }) => {
  const target = cell(page, 4);
  await target.click({ button: 'right' });
  await expect(target).toHaveClass(/flagged/);
  await expect(page.locator('.cell.flagged')).toHaveCount(1);
  await expect(page.locator('.cell.revealed')).toHaveCount(0);
  await expect(page.locator('.phase-label')).toHaveText('准备开始');
  await target.click({ modifiers: ['Shift'] });
  await expect(target).toHaveClass(/hidden/);
  await target.click({ modifiers: ['Control'] });
  await expect(target).toHaveClass(/flagged/);
  await expect(page.locator('.cell.revealed')).toHaveCount(0);
  // A fresh right click within the context-menu dedupe window still works.
  await target.click({ button: 'right' });
  await expect(target).toHaveClass(/hidden/);
});

test('press feedback is immediate, release commits, and dragging out cancels', async ({ page }) => {
  await cell(page, 0).hover();
  await page.mouse.down();
  await expect(cell(page, 0)).toHaveClass(/pressed/);
  await expect(page.locator('.cell.revealed')).toHaveCount(0);
  await cell(page, 1).hover();
  await page.mouse.up();
  await expect(page.locator('.cell.pressed')).toHaveCount(0);
  await expect(page.locator('.cell.revealed')).toHaveCount(0);
  await cell(page, 0).hover();
  await page.mouse.down();
  await expect(page.locator('.cell.revealed')).toHaveCount(0);
  await page.mouse.up();
  await expect(cell(page, 0)).toHaveClass(/revealed/);
});

test('single chord previews eligible neighbors and submits on release', async ({ page }) => {
  const fixture = await prepareChord(page, true);
  const target = cell(page, fixture.index);
  await target.hover();
  await page.mouse.down();
  for (const index of fixture.hiddenSafe) {
    await expect(cell(page, index)).toHaveClass(/hidden/);
    await expect(cell(page, index)).toHaveClass(/preview/);
  }
  await page.mouse.up();
  for (const index of fixture.hiddenSafe) await expect(cell(page, index)).toHaveClass(/revealed/);
  await expect(page.locator('.cell.preview')).toHaveCount(0);
  await expect(page.locator('.board')).not.toHaveClass(/phase-lost/);
});

test('a double click that opens a number does not accidentally chord; keyboard activation then chords once', async ({ page }) => {
  const fixture = await prepareChord(page, false, 'double');
  await cell(page, fixture.index).dblclick({ delay: 60 });
  await expect(cell(page, fixture.index)).toHaveClass(/revealed/);
  for (const index of fixture.hiddenSafe) await expect(cell(page, index)).toHaveClass(/hidden/);
  await cell(page, fixture.index).focus();
  await page.keyboard.press('Enter');
  for (const index of fixture.hiddenSafe) await expect(cell(page, index)).toHaveClass(/revealed/);
});

test('two pointer clicks on a preexisting number chord in double mode', async ({ page }) => {
  const fixture = await prepareChord(page, true, 'double');
  await cell(page, fixture.index).dblclick({ delay: 60 });
  for (const index of fixture.hiddenSafe) await expect(cell(page, index)).toHaveClass(/revealed/);
});

test('grid has one tab stop, arrow navigation, F flags and Space reveals', async ({ page }) => {
  await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  await cell(page, 0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, 1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 10)).toBeFocused();
  await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('f');
  await expect(cell(page, 10)).toHaveClass(/flagged/);
  await page.keyboard.press('Space');
  await expect(cell(page, 10)).toHaveClass(/flagged/);
  await expect(page.locator('.cell.revealed')).toHaveCount(0);
  await page.keyboard.press('f');
  await page.keyboard.press('Space');
  await expect(cell(page, 10)).toHaveClass(/revealed/);
  await expect(page.locator('.board')).not.toHaveClass(/phase-lost/);
});

test('settings keeps keyboard focus inside its dialog and Escape restores the trigger without applying drafts', async ({ page }) => {
  const trigger = page.getByRole('button', { name: '打开设置', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: '关闭面板', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '应用设置', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '关闭面板', exact: true })).toBeFocused();
  const sound = dialog.getByRole('switch').first();
  await sound.focus();
  await page.keyboard.press('Space');
  await expect(sound).toBeChecked();
  await page.keyboard.press('f');
  await expect(page.locator('.cell.flagged')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('button', { name: '开启声音', exact: true })).toBeVisible();
});

test('active-game mode changes require an explicit restart and cancellation preserves the board', async ({ page }) => {
  await cell(page, 0).click();
  const before = await page.locator('.cell.revealed').count();
  await page.locator('.chord-options').getByRole('button', { name: '自动', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '继续当前局', exact: true }).click();
  await expect(page.locator('.cell.revealed')).toHaveCount(before);
  await expect(page.locator('.chord-options').getByRole('button', { name: '单击', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.chord-options').getByRole('button', { name: '自动', exact: true }).click();
  await page.getByRole('button', { name: '应用并开始新局', exact: true }).click();
  await expect(page.locator('.cell.revealed')).toHaveCount(0);
  await expect(page.locator('.auto-warning')).toContainText('插错旗也可能触雷');
});

test('hidden grid labels expose only coordinates and cover state', async ({ page }) => {
  const initialLabels = await page.getByRole('gridcell').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
  expect(initialLabels).toHaveLength(81);
  for (const label of initialLabels) expect(label).toMatch(/^\d+ 行 \d+ 列，未翻开$/);
  await cell(page, 0).click();
  for (const label of await page.locator('.cell.hidden').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))) {
    expect(label).toMatch(/^\d+ 行 \d+ 列，未翻开$/);
  }
  expect(await page.locator('.cell.hidden').evaluateAll(elements => elements.every(element => !element.hasAttribute('data-mine') && !element.hasAttribute('data-number')))).toBe(true);
});

test('assistive-style detail-zero activation works immediately after idle scroll cleanup', async ({ page }) => {
  // A screen-reader-style click has no preceding pointer. This is a synthetic
  // DOM activation test, not a claim of testing an actual screen reader.
  await page.locator('.board-scroll').dispatchEvent('scroll');
  await cell(page, 0).evaluate(element => (element as HTMLButtonElement).click());
  await expect(cell(page, 0)).toHaveClass(/revealed/);
  await expect(page.locator('.phase-label')).toHaveText('游戏进行中');
});

test('narrow touch emulation uses real touchscreen tap for reveal and permanent flag-mode toggle', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto('/?seed=42');
    const toggle = page.locator('.touch-switch');
    await expect(toggle).toBeVisible();
    await toggle.getByRole('button', { name: '插旗', exact: true }).tap();
    await cell(page, 4).tap();
    await expect(cell(page, 4)).toHaveClass(/flagged/);
    await expect(page.locator('.cell.revealed')).toHaveCount(0);
    await toggle.getByRole('button', { name: '翻开', exact: true }).tap();
    await cell(page, 0).tap();
    await expect(cell(page, 0)).toHaveClass(/revealed/);
    await expect(cell(page, 4)).toHaveClass(/flagged/);
    expect(await page.locator('.board').evaluate(element => getComputedStyle(element).touchAction)).not.toBe('none');
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
  } finally { await context.close(); }
});

test('synthetic touch long press flags once and release never reveals', async ({ page }) => {
  const target = cell(page, 4);
  const event = { pointerId: 41, pointerType: 'touch', isPrimary: true, button: 0, clientX: 100, clientY: 100 };
  await target.dispatchEvent('pointerdown', event);
  await expect(target).toHaveClass(/pressed/);
  await expect(target).toHaveClass(/flagged/);
  await target.dispatchEvent('pointerup', event);
  await target.dispatchEvent('click', { detail: 1 });
  await expect(target).toHaveClass(/flagged/);
  await expect(page.locator('.cell.revealed')).toHaveCount(0);
});

for (const cancellation of ['movement', 'scroll', 'pointercancel', 'lostpointercapture', 'second-finger'] as const) {
  test(`synthetic touch ${cancellation} cancels pending long press and release`, async ({ page }) => {
    const target = cell(page, 0);
    const event = { pointerId: 41, pointerType: 'touch', isPrimary: true, button: 0, clientX: 100, clientY: 100 };
    await target.dispatchEvent('pointerdown', event);
    if (cancellation === 'movement') await target.dispatchEvent('pointermove', { ...event, clientX: 114 });
    else if (cancellation === 'scroll') await page.locator('.board-scroll').dispatchEvent('scroll');
    else if (cancellation === 'second-finger') await page.locator('.site-header').dispatchEvent('pointerdown', { ...event, pointerId: 42, isPrimary: false });
    else await target.dispatchEvent(cancellation, event);
    // This delay deliberately crosses the real long-press deadline; static
    // screenshots cannot demonstrate cancellation of an outstanding timer.
    await page.waitForTimeout(400);
    await target.dispatchEvent('pointerup', event);
    if (cancellation === 'second-finger') await page.locator('.site-header').dispatchEvent('pointerup', { ...event, pointerId: 42, isPrimary: false });
    await target.dispatchEvent('click', { detail: 1 });
    await expect(page.locator('.cell.revealed, .cell.flagged, .cell.pressed')).toHaveCount(0);
  });
}

test('expert narrow touch board scrolls locally and preserves usable cells', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto('/?seed=42');
    await page.locator('.difficulty-options').getByRole('button', { name: /高级/ }).tap();
    const measurements = await page.locator('.board-scroll').evaluate(element => ({
      scroll: element.scrollWidth,
      width: element.clientWidth,
      overflow: getComputedStyle(element).overflowX,
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(measurements.scroll).toBeGreaterThan(measurements.width);
    expect(measurements.overflow).toMatch(/auto|scroll/);
    expect(measurements.page).toBeLessThanOrEqual(measurements.viewport + 1);
    const bounds = await cell(page, 0).boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(36);
    expect(bounds?.height).toBeGreaterThanOrEqual(36);
    await page.locator('.board-scroll').evaluate(element => { element.scrollLeft = element.scrollWidth; });
    expect(await page.locator('.board-scroll').evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await expect(page.locator('.cell.revealed, .cell.flagged')).toHaveCount(0);
  } finally { await context.close(); }
});

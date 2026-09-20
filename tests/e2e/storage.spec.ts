import { expect, test, type Page } from '@playwright/test';
import { getConfig } from '../../src/config/game';
import { generateTruth, seededRandom } from '../../src/core/generate';
import type { ChordMode } from '../../src/core/types';
import { LEADERBOARD_KEY, type ScoreEntry } from '../../src/storage/leaderboard';

interface StorageCall { area: 'local' | 'session'; operation: 'get' | 'set' | 'remove'; key: string }
interface StorageAudit {
  calls: StorageCall[];
  accesses: number;
  readLocal(key: string): string | null;
  localKeys(): string[];
  sessionKeys(): string[];
}
declare global {
  interface Window { __storageAudit: StorageAudit }
}

async function auditStorage(page: Page, options: { initial?: Record<string, string>; denyWrites?: boolean; denyAccess?: boolean } = {}) {
  await page.addInitScript(({ initial, denyWrites, denyAccess }) => {
    const local = window.localStorage;
    const session = window.sessionStorage;
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    for (const [key, value] of Object.entries(initial ?? {})) originalSet.call(local, key, value);
    const audit: StorageAudit = {
      calls: [], accesses: 0,
      readLocal: (key) => originalGet.call(local, key),
      localKeys: () => Array.from({ length: local.length }, (_, index) => local.key(index)!).sort(),
      sessionKeys: () => Array.from({ length: session.length }, (_, index) => session.key(index)!).sort(),
    };
    window.__storageAudit = audit;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() {
      audit.accesses++;
      if (denyAccess) throw new DOMException('Storage disabled for this test', 'SecurityError');
      return local;
    } });
    Storage.prototype.getItem = function (key: string) {
      audit.calls.push({ area: this === local ? 'local' : 'session', operation: 'get', key });
      return originalGet.call(this, key);
    };
    Storage.prototype.setItem = function (key: string, value: string) {
      audit.calls.push({ area: this === local ? 'local' : 'session', operation: 'set', key });
      if (denyWrites && this === local) throw new DOMException('Storage quota exhausted for this test', 'QuotaExceededError');
      return originalSet.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key: string) {
      audit.calls.push({ area: this === local ? 'local' : 'session', operation: 'remove', key });
      return originalRemove.call(this, key);
    };
  }, options);
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const audit = window.__storageAudit;
    return { calls: audit.calls, accesses: audit.accesses, localKeys: audit.localKeys(), sessionKeys: audit.sessionKeys() };
  });
}

async function scores(page: Page): Promise<ScoreEntry[]> {
  return page.evaluate((key) => {
    const raw = window.__storageAudit.readLocal(key);
    return raw ? JSON.parse(raw).entries : [];
  }, LEADERBOARD_KEY);
}

/** The test oracle generates its own truth; the browser gets only genuine pointer actions. */
async function win(page: Page, mode: ChordMode = 'single') {
  await page.locator('[data-cell="40"]').click();
  await finishWin(page, mode);
}

async function finishWin(page: Page, mode: ChordMode = 'single') {
  const truth = generateTruth(getConfig('beginner', mode), 40, seededRandom(42));
  for (let index = 0; index < truth.mines.length; index++) {
    if (truth.mines[index]) continue;
    const target = page.locator(`[data-cell="${index}"]`);
    if ((await target.getAttribute('class'))?.split(' ').includes('hidden')) await target.click();
  }
  await expect(page.locator('.board')).toHaveClass(/phase-won/);
}

test('playing, toggling settings, and winning do not write any persistent state', async ({ page }) => {
  await auditStorage(page);
  await page.goto('/?seed=42');
  await expect(page.locator('.cell.hidden')).toHaveCount(81);
  await page.locator('[data-cell="0"]').click({ button: 'right' });
  await page.locator('[data-cell="0"]').click({ button: 'right' });
  await page.getByRole('button', { name: '开启声音', exact: true }).click();
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await page.getByRole('switch', { name: /显示计时/ }).uncheck();
  await page.getByRole('switch', { name: /展开动效/ }).uncheck();
  await page.getByRole('button', { name: '应用设置', exact: true }).click();
  await win(page);
  const audit = await snapshot(page);
  expect(audit.calls.filter((call) => call.operation !== 'get')).toEqual([]);
  expect(audit.localKeys).toEqual([]);
  expect(audit.sessionKeys).toEqual([]);
});

test('an active win saves the selected nickname once, including repeated save activation', async ({ page }) => {
  await auditStorage(page);
  await page.goto('/?seed=42');
  await win(page);
  await page.getByLabel('成绩称呼').selectOption('哥哥');
  await page.getByRole('button', { name: '保存成绩', exact: true }).click();
  await expect(page.getByRole('button', { name: '已保存', exact: true })).toBeDisabled();
  await page.locator('.save-score button').evaluate((element) => {
    (element as HTMLButtonElement).click();
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const entries = await scores(page);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ nickname: '哥哥', difficulty: 'beginner', controlClass: 'manual', rulesVersion: 'modern-v1' });
  expect(entries[0].elapsedMs).toBeGreaterThanOrEqual(0);
  expect(entries[0].gameId).toBeTruthy();
  const audit = await snapshot(page);
  expect(audit.calls.filter((call) => call.operation === 'set')).toEqual([{ area: 'local', operation: 'set', key: LEADERBOARD_KEY }]);
  expect(audit.localKeys).toEqual([LEADERBOARD_KEY]);
  expect(audit.sessionKeys).toEqual([]);
});

test('refresh retains only an explicitly saved score and resets game and settings', async ({ page }) => {
  await auditStorage(page);
  await page.goto('/?seed=42');
  await win(page);
  await page.getByLabel('成绩称呼').selectOption('弟弟');
  await page.getByRole('button', { name: '保存成绩', exact: true }).click();
  const saved = await scores(page);
  await page.getByRole('button', { name: '新的一局', exact: true }).click();
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await page.getByRole('switch', { name: /轻声音效/ }).check();
  await page.getByRole('switch', { name: /展开动效/ }).uncheck();
  await page.getByRole('switch', { name: /显示计时/ }).uncheck();
  await page.getByRole('switch', { name: /大格子/ }).check();
  await page.getByRole('button', { name: '应用设置', exact: true }).click();
  await page.locator('[data-cell="40"]').click();
  await expect(page.locator('.board')).toHaveClass(/phase-playing/);
  await page.reload();
  await expect(page.locator('.board')).toHaveClass(/phase-ready/);
  await expect(page.locator('.cell.hidden')).toHaveCount(81);
  await expect(page.getByRole('button', { name: '开启声音', exact: true })).toBeVisible();
  expect(await scores(page)).toEqual(saved);
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: /轻声音效/ })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: /展开动效/ })).toBeChecked();
  await expect(page.getByRole('switch', { name: /显示计时/ })).toBeChecked();
  await expect(page.getByRole('switch', { name: /大格子/ })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: /启用本机榜/ })).toBeChecked();
  const audit = await snapshot(page);
  expect(audit.localKeys).toEqual([LEADERBOARD_KEY]);
  expect(audit.sessionKeys).toEqual([]);
});

test('a disabled leaderboard performs no storage access across gameplay and panels', async ({ page }) => {
  await auditStorage(page);
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await page.getByRole('switch', { name: /启用本机榜/ }).uncheck();
  await page.getByRole('button', { name: '应用设置', exact: true }).click();
  const disabled = await snapshot(page);
  await page.locator('[data-cell="40"]').click();
  await page.getByRole('button', { name: '玩法帮助', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '新的一局', exact: true }).click();
  await page.locator('.best-score').click();
  await expect(page.getByText('本机榜已关闭。可在设置中启用。', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await page.getByRole('switch', { name: /展开动效/ }).uncheck();
  await page.getByRole('button', { name: '应用设置', exact: true }).click();
  expect(await snapshot(page)).toEqual(disabled);
});

test('finishing a game while the leaderboard is disabled neither accesses storage nor offers saving', async ({ page }) => {
  await auditStorage(page);
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await page.getByRole('switch', { name: /启用本机榜/ }).uncheck();
  await page.getByRole('button', { name: '应用设置', exact: true }).click();
  const disabled = await snapshot(page);
  await win(page);
  await expect(page.getByRole('heading', { name: '这一局，真不错', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存成绩', exact: true })).toHaveCount(0);
  expect(await snapshot(page)).toEqual(disabled);
  expect(await scores(page)).toEqual([]);
});

test('a backward clock can finish a game but makes the victory ineligible for the leaderboard', async ({ page }) => {
  await auditStorage(page);
  await page.goto('/?seed=42');
  await page.evaluate(() => { Date.now = () => 1_800_000_000_000; });
  await page.locator('[data-cell="40"]').click();
  await expect(page.locator('.board')).toHaveClass(/phase-playing/);
  await page.evaluate(() => { Date.now = () => 1_799_999_999_000; });
  await finishWin(page);
  await expect(page.getByText('时钟异常，这一局不计入本机榜。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存成绩', exact: true })).toHaveCount(0);
  expect(await scores(page)).toEqual([]);
  expect((await snapshot(page)).calls.filter((call) => call.operation !== 'get')).toEqual([]);
  await page.getByRole('button', { name: '新的一局', exact: true }).click();
  await expect(page.locator('.cell.hidden')).toHaveCount(81);
});

test('corrupted JSON is reported without a crash, rewrite, or blocked gameplay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await auditStorage(page, { initial: { [LEADERBOARD_KEY]: '{invalid' } });
  await page.goto('/?seed=42');
  await page.locator('.best-score').click();
  await expect(page.getByRole('status')).toContainText('本机榜数据无法读取');
  await page.keyboard.press('Escape');
  await page.locator('[data-cell="40"]').click();
  await expect(page.locator('.board')).toHaveClass(/phase-playing/);
  const raw = await page.evaluate((key) => window.__storageAudit.readLocal(key), LEADERBOARD_KEY);
  expect(raw).toBe('{invalid');
  expect((await snapshot(page)).calls.filter((call) => call.operation !== 'get')).toEqual([]);
  expect(errors).toEqual([]);
});

test('storage access denied by the browser remains an optional feature failure', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await auditStorage(page, { denyAccess: true });
  await page.goto('/?seed=42');
  await page.locator('[data-cell="40"]').click();
  await expect(page.locator('.board')).toHaveClass(/phase-playing/);
  await page.locator('.best-score').click();
  await expect(page.getByRole('status')).toContainText('浏览器暂时不允许访问本机榜');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '新的一局', exact: true }).click();
  await expect(page.locator('.cell.hidden')).toHaveCount(81);
  expect(errors).toEqual([]);
});

test('a denied score write shows a useful message and still allows a fresh game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await auditStorage(page, { denyWrites: true });
  await page.goto('/?seed=42');
  await win(page);
  await page.getByRole('button', { name: '保存成绩', exact: true }).click();
  await expect(page.locator('.save-message')).toContainText('成绩未能保存');
  await expect(page.getByRole('button', { name: '保存成绩', exact: true })).toBeEnabled();
  expect(await scores(page)).toEqual([]);
  await page.getByRole('button', { name: '新的一局', exact: true }).click();
  await expect(page.locator('.cell.hidden')).toHaveCount(81);
  expect(errors).toEqual([]);
});

test('manual and automatic wins appear in distinct leaderboard groups', async ({ page }) => {
  await auditStorage(page);
  await page.goto('/?seed=42');
  await win(page);
  await page.getByLabel('成绩称呼').selectOption('哥哥');
  await page.getByRole('button', { name: '保存成绩', exact: true }).click();
  await page.locator('.chord-options').getByRole('button', { name: '自动', exact: true }).click();
  await win(page, 'auto');
  await page.getByLabel('成绩称呼').selectOption('弟弟');
  await page.getByRole('button', { name: '保存成绩', exact: true }).click();
  const entries = await scores(page);
  expect(entries).toHaveLength(2);
  expect(new Set(entries.map((entry) => entry.gameId)).size).toBe(2);
  expect(new Set(entries.map((entry) => entry.controlClass))).toEqual(new Set(['manual', 'auto']));
  await page.locator('.best-score').click();
  await expect(page.getByRole('dialog').getByRole('button', { name: '自动', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.score-list li')).toHaveCount(1);
  await expect(page.locator('.score-list')).toContainText('弟弟');
  await page.getByRole('dialog').getByRole('button', { name: '手动', exact: true }).click();
  await expect(page.locator('.score-list li')).toHaveCount(1);
  await expect(page.locator('.score-list')).toContainText('哥哥');
});

test('clearing scores removes only the leaderboard key after explicit confirmation', async ({ page }) => {
  await auditStorage(page, { initial: { 'another-app:test': 'keep-this-value' } });
  await page.goto('/?seed=42');
  await win(page);
  await page.getByRole('button', { name: '保存成绩', exact: true }).click();
  await page.locator('.best-score').click();
  await page.getByRole('button', { name: '清空本机榜', exact: true }).click();
  expect(await scores(page)).toHaveLength(1);
  await page.getByRole('button', { name: '确认清空本机全部成绩', exact: true }).click();
  await expect(page.locator('.score-list li')).toHaveCount(0);
  const audit = await snapshot(page);
  expect(audit.localKeys).toEqual(['another-app:test']);
  expect(audit.calls.filter((call) => call.operation === 'remove')).toEqual([{ area: 'local', operation: 'remove', key: LEADERBOARD_KEY }]);
  const unrelated = await page.evaluate(() => window.__storageAudit.readLocal('another-app:test'));
  expect(unrelated).toBe('keep-this-value');
});

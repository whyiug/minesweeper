/** The leaderboard is the app's only persistent data. Access is deliberately lazy. */
export const LEADERBOARD_KEY = 'light-mines:leaderboard:v2';
export const RULES_VERSION = 'modern-v1' as const;

export interface ScoreEntry {
  id: string;
  gameId: string;
  nickname: '哥哥' | '弟弟' | '家长' | '访客';
  difficulty: 'intro' | 'beginner' | 'intermediate' | 'expert';
  controlClass: 'manual' | 'auto';
  elapsedMs: number;
  completedAt: string;
  rulesVersion: typeof RULES_VERSION;
}

type LeaderboardStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface LeaderboardResult {
  entries: ScoreEntry[];
  error?: string;
}
export interface SaveResult extends LeaderboardResult {
  saved: boolean;
}

const MAX_ENTRIES = 4 * 2 * 10;
const MAX_SERIALIZED_LENGTH = 64 * 1024;
const FIELDS = ['id', 'gameId', 'nickname', 'difficulty', 'controlClass', 'elapsedMs', 'completedAt', 'rulesVersion'];
const CORRUPT_ERROR = '本机榜数据无法读取。可清空本机榜后重新保存；游戏不受影响。';
const STORAGE_ERROR = '浏览器暂时不允许访问本机榜。游戏仍可正常进行。';

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value
    && [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

/** Treat localStorage as untrusted input, including records from older app versions. */
export function isScoreEntry(value: unknown): value is ScoreEntry {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).length !== FIELDS.length || !FIELDS.every((field) => Object.hasOwn(entry, field))) return false;
  return validId(entry.id) && validId(entry.gameId)
    && ['哥哥', '弟弟', '家长', '访客'].includes(entry.nickname as string)
    && ['intro', 'beginner', 'intermediate', 'expert'].includes(entry.difficulty as string)
    && ['manual', 'auto'].includes(entry.controlClass as string)
    && typeof entry.elapsedMs === 'number' && Number.isFinite(entry.elapsedMs)
    && entry.elapsedMs >= 0 && entry.elapsedMs <= Number.MAX_SAFE_INTEGER
    && validDate(entry.completedAt) && entry.rulesVersion === RULES_VERSION;
}

function compareScores(a: ScoreEntry, b: ScoreEntry): number {
  return a.elapsedMs - b.elapsedMs
    || (a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : 0)
    || (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0);
}

function topTen(entries: ScoreEntry[]): ScoreEntry[] {
  const counts = new Map<string, number>();
  return [...entries].sort(compareScores).filter((entry) => {
    const category = `${entry.difficulty}:${entry.controlClass}`;
    const count = counts.get(category) ?? 0;
    counts.set(category, count + 1);
    return count < 10;
  });
}

function decode(raw: string | null): LeaderboardResult {
  if (raw === null) return { entries: [] };
  if (raw.length > MAX_SERIALIZED_LENGTH) return { entries: [], error: CORRUPT_ERROR };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid envelope');
    const envelope = value as Record<string, unknown>;
    if (envelope.version !== 2 || Object.keys(envelope).length !== 2 || !Array.isArray(envelope.entries) || envelope.entries.length > MAX_ENTRIES) {
      throw new Error('Invalid version or count');
    }
    const entries: ScoreEntry[] = [];
    const games = new Set<string>();
    const ids = new Set<string>();
    const categoryCounts = new Map<string, number>();
    for (const entry of envelope.entries) {
      if (!isScoreEntry(entry) || games.has(entry.gameId) || ids.has(entry.id)) throw new Error('Invalid entry');
      const category = `${entry.difficulty}:${entry.controlClass}`;
      const count = (categoryCounts.get(category) ?? 0) + 1;
      if (count > 10) throw new Error('Invalid category count');
      categoryCounts.set(category, count);
      games.add(entry.gameId);
      ids.add(entry.id);
      entries.push(entry);
    }
    return { entries: entries.sort(compareScores) };
  } catch {
    return { entries: [], error: CORRUPT_ERROR };
  }
}

export function createLeaderboard(options: { enabled: boolean; getStorage: () => LeaderboardStorage }) {
  let enabled = options.enabled;

  function list(): LeaderboardResult {
    if (!enabled) return { entries: [] };
    try {
      return decode(options.getStorage().getItem(LEADERBOARD_KEY));
    } catch {
      return { entries: [], error: STORAGE_ERROR };
    }
  }

  return {
    setEnabled(next: boolean): void {
      enabled = next;
    },
    list,
    save(entry: ScoreEntry): SaveResult {
      if (!enabled) return { entries: [], saved: false, error: '本机榜已关闭。' };
      if (!isScoreEntry(entry)) return { entries: [], saved: false, error: '这条成绩的数据无效，无法保存。' };
      const current = list();
      if (current.error) return { ...current, saved: false };
      if (current.entries.some((existing) => existing.gameId === entry.gameId)) {
        return { ...current, saved: false, error: '本局成绩已保存，无需重复保存。' };
      }
      if (current.entries.some((existing) => existing.id === entry.id)) {
        return { ...current, saved: false, error: '成绩编号重复，无法保存。' };
      }
      const entries = topTen([...current.entries, { ...entry }]);
      if (!entries.some((existing) => existing.gameId === entry.gameId)) {
        return { ...current, saved: false, error: '这次成绩未进入当前分类的前 10 名。' };
      }
      try {
        options.getStorage().setItem(LEADERBOARD_KEY, JSON.stringify({ version: 2, entries }));
        return { entries, saved: true };
      } catch {
        return { ...current, saved: false, error: '成绩未能保存。浏览器存储可能已满或被禁用。' };
      }
    },
    clear(): LeaderboardResult {
      if (!enabled) return { entries: [] };
      try {
        options.getStorage().removeItem(LEADERBOARD_KEY);
        return { entries: [] };
      } catch {
        return { entries: [], error: '本机榜未能清空。请检查浏览器存储权限。' };
      }
    },
  };
}

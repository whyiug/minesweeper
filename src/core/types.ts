export type Difficulty = 'intro' | 'beginner' | 'intermediate' | 'expert';
export type Phase = 'ready' | 'playing' | 'won' | 'lost';
export type ChordMode = 'single' | 'double' | 'auto';
export type Cover = 'hidden' | 'flagged' | 'revealed';

export interface GameConfig {
  difficulty: Difficulty;
  rows: number;
  cols: number;
  mineCount: number;
  chordMode: ChordMode;
}

/** Private to the rules layer: never pass this object to board/cell components. */
export interface BoardTruth {
  mines: boolean[];
  counts: number[];
}

export interface GameEvent {
  id: string;
  gameId: string;
  type: 'reveal' | 'flag' | 'chord' | 'won' | 'lost';
  indices: number[];
  origin: number;
}

export interface GameState {
  gameId: string;
  config: GameConfig;
  phase: Phase;
  covers: Cover[];
  truth: BoardTruth | null;
  startedAt: number | null;
  endedAt: number | null;
  flagCount: number;
  revealedCount: number;
  exploded: number | null;
  sequence: number;
  /** Events from the latest committed transaction, consumed once by event id. */
  events: GameEvent[];
}

export type GameAction = {
  type: 'REVEAL' | 'FLAG' | 'CHORD';
  index: number;
};

export interface RuleContext {
  now: number;
  random: () => number;
}

export interface VisibleCell {
  index: number;
  cover: Cover;
  number?: number;
  mine?: boolean;
  wrongFlag?: boolean;
  exploded?: boolean;
}

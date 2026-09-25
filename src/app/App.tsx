import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DIFFICULTIES, getConfig } from '../config/game';
import { createGame, reduceGame, seededRandom, visibleView, type ChordMode, type Difficulty, type GameAction } from '../core';
import { Board } from '../components/Board';
import { Crystal, Face, Icon } from '../components/Icon';
import { Timer, formatTime } from '../components/Timer';
import { Modal } from '../components/Modal';
import { HelpPanel } from '../components/HelpPanel';
import { CHORD_LABELS, DEFAULT_SETTINGS, SettingsPanel, type Settings } from '../components/SettingsPanel';
import { LeaderboardPanel } from '../components/LeaderboardPanel';
import { createLeaderboard, type ScoreEntry } from '../storage/leaderboard';
import { createSoundController } from '../presentation/sound-controller';
import { createEffectController } from '../presentation/effect-controller';

function newRandom() {
  // The deterministic browser harness is available only in Vite's explicit e2e mode.
  // Production never reads a seed from URLs and never persists one.
  if (import.meta.env.MODE === 'e2e') return seededRandom(Number(new URLSearchParams(location.search).get('seed') ?? 42));
  return seededRandom(crypto.getRandomValues(new Uint32Array(1))[0]);
}

export default function App() {
  const [game, setGame] = useState(() => createGame(getConfig(), crypto.randomUUID()));
  const current = useRef(game); current.current = game;
  const random = useRef<(() => number) | null>(null);
  if (!random.current) random.current = newRandom();
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [touchMode, setTouchMode] = useState<'reveal' | 'flag'>('reveal');
  const [pressed, setPressed] = useState(false);
  const [panel, setPanel] = useState<'settings' | 'help' | 'leaderboard' | null>(null);
  const [pending, setPending] = useState<{ difficulty: Difficulty; mode: ChordMode } | null>(null);
  const [nickname, setNickname] = useState<ScoreEntry['nickname']>('访客');
  const [saved, setSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [storageError, setStorageError] = useState<string | undefined>();
  const leaderboard = useMemo(() => createLeaderboard({ enabled: DEFAULT_SETTINGS.leaderboard, getStorage: () => window.localStorage }), []);
  const sound = useRef<ReturnType<typeof createSoundController> | null>(null);
  const effects = useRef<ReturnType<typeof createEffectController> | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const motion = settings.motion && !systemReduced;
  const cells = useMemo(() => visibleView(game), [game]);
  const config = game.config;
  const difficulty = DIFFICULTIES[config.difficulty];
  const terminal = game.phase === 'won' || game.phase === 'lost';
  const elapsed = game.startedAt !== null && game.endedAt !== null ? game.endedAt - game.startedAt : 0;
  const eligible = game.phase === 'won' && game.startedAt !== null && game.endedAt !== null && Number.isFinite(elapsed) && elapsed >= 0;
  const remaining = config.mineCount - game.flagCount;
  const best = scores.filter(score => score.difficulty === config.difficulty && score.controlClass === (config.chordMode === 'auto' ? 'auto' : 'manual'))[0];

  useEffect(() => {
    const audio = createSoundController(); sound.current = audio;
    const effect = createEffectController(audio); effects.current = effect; effect.reset(current.current.gameId);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystemReduced(media.matches);
    const hidden = () => { if (document.hidden) effect.cancel(); };
    media.addEventListener('change', change); document.addEventListener('visibilitychange', hidden);
    return () => { effect.dispose(); audio.dispose(); media.removeEventListener('change', change); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useEffect(() => {
    leaderboard.setEnabled(settings.leaderboard);
    const result = leaderboard.list(); setScores(result.entries); setStorageError(result.error);
  }, [settings.leaderboard, leaderboard]);
  useLayoutEffect(() => { effects.current?.consume(game.events, stage.current, motion, config.cols); }, [game, motion, config.cols]);
  useEffect(() => { if (!motion) effects.current?.cancel(); }, [motion]);

  const dispatch = useCallback((action: GameAction) => {
    const next = reduceGame(current.current, action, { now: Date.now(), random: random.current! });
    if (next !== current.current) { current.current = next; setGame(next); }
  }, []);
  const finishCell = useCallback((element: HTMLElement | null) => effects.current?.finishCell(element), []);
  function start(difficultyId = config.difficulty, mode = config.chordMode) {
    const next = createGame(getConfig(difficultyId, mode), crypto.randomUUID());
    effects.current?.reset(next.gameId); random.current = newRandom(); current.current = next; setGame(next);
    setPending(null); setSaved(false); setSaveMessage(''); setPressed(false); setTouchMode('reveal');
  }
  function choose(difficultyId: Difficulty, mode: ChordMode) {
    if (difficultyId === config.difficulty && mode === config.chordMode) return;
    if (game.phase === 'playing' || game.flagCount > 0 && game.phase === 'ready') setPending({ difficulty: difficultyId, mode });
    else start(difficultyId, mode);
  }
  function applySettings(next: Settings, mode: ChordMode) {
    sound.current?.setEnabled(next.sound);
    if (next.sound) void sound.current?.unlock();
    leaderboard.setEnabled(next.leaderboard);
    setSettings(next); setPanel(null);
    if (mode !== config.chordMode) start(config.difficulty, mode);
  }
  function toggleSound() {
    const enabled = !settings.sound;
    sound.current?.setEnabled(enabled); if (enabled) void sound.current?.unlock();
    setSettings({ ...settings, sound: enabled });
  }
  function saveScore() {
    if (!eligible || saved || !settings.leaderboard) return;
    const result = leaderboard.save({ id: crypto.randomUUID(), gameId: game.gameId, nickname, difficulty: config.difficulty, controlClass: config.chordMode === 'auto' ? 'auto' : 'manual', elapsedMs: elapsed, completedAt: new Date(game.endedAt!).toISOString(), rulesVersion: 'modern-v1' });
    setScores(result.entries); setStorageError(result.error); setSaved(result.saved);
    setSaveMessage(result.saved ? '已记在这台设备上。' : result.error ?? '本次成绩未进入前 10 名。');
  }

  return <div className={`app ${motion ? 'with-motion' : 'reduced-motion'}`}>
    <header className="site-header"><div className="brand" aria-label="轻扫雷"><Crystal/><span>轻扫雷<small>LIGHT MINES</small></span></div><div className="difficulty-bar"><div className="difficulty-options" aria-label="选择难度">{Object.entries(DIFFICULTIES).map(([id, item], index) => <button key={id} className={`difficulty-option ${id === config.difficulty ? 'selected' : ''}`} aria-pressed={id === config.difficulty} onClick={() => choose(id as Difficulty, config.chordMode)}><span className="difficulty-dots" aria-hidden="true">{Array.from({ length: index + 1 }, (_, i) => <i key={i}/>)}</span><strong>{item.name}</strong><small>{item.cols} × {item.rows}<span> · {item.mineCount} 雷</span></small></button>)}</div></div><nav className="header-actions" aria-label="工具"><button className="icon-button" aria-label="玩法帮助" onClick={() => setPanel('help')}><Icon name="help"/></button><button className={`icon-button ${settings.sound ? 'active' : ''}`} aria-label={settings.sound ? '关闭声音' : '开启声音'} aria-pressed={settings.sound} onClick={toggleSound}><Icon name={settings.sound ? 'sound' : 'mute'}/></button><button className="icon-button" aria-label="打开设置" onClick={() => setPanel('settings')}><Icon name="settings"/></button></nav></header>
    <main>
      <div className={`game-layout layout-${config.difficulty}`}>
        <section className="game-stage" ref={stage} aria-label={`${difficulty.name}游戏`}>
          <div className="stage-heading"><div><span className="eyebrow">BLUE CRYSTAL / 蓝晶</span><h1>{difficulty.name}<span>从一格，慢慢展开。</span></h1></div><span className={`phase-label ${terminal ? game.phase : ''}`}><i/>{game.phase === 'ready' ? '准备开始' : game.phase === 'playing' ? '游戏进行中' : game.phase === 'won' ? '全部安全格已翻开' : '本局结束'}</span></div>
          <div className="mobile-status"><span><Icon name="flag"/><b>{remaining}</b><small>剩余旗数</small></span><span><Icon name="clock"/><Timer start={game.startedAt} end={game.endedAt} visible={settings.timer}/></span><button className="icon-button" aria-label="新的一局（快捷）" onClick={() => start()}><Icon name="refresh"/></button></div>
          <Board cells={cells} rows={config.rows} cols={config.cols} difficulty={config.difficulty} gameId={game.gameId} phase={game.phase} chordMode={config.chordMode} touchMode={touchMode} size={settings.large ? 'large' : 'fit'} dispatch={dispatch} onPress={setPressed} finishCell={finishCell}/>
          <div className="board-bottom"><span className="board-tip">{game.phase === 'ready' ? '选一格开始，首格和周围八格都安全' : game.phase === 'won' ? '每一份耐心，都有回响。' : game.phase === 'lost' ? '发现一颗雷。休息一下，或再来一局。' : remaining < 0 ? '旗子可能有些多，再检查一下。' : '数字是线索，旗子是你的判断'}</span><span className="board-dimensions">{config.cols} × {config.rows}</span></div>
          <div className="touch-switch segmented" aria-label="触屏操作模式"><button aria-pressed={touchMode === 'reveal'} onClick={() => setTouchMode('reveal')}><Icon name="reveal"/>翻开</button><button aria-pressed={touchMode === 'flag'} onClick={() => setTouchMode('flag')}><Icon name="flag"/>插旗</button></div>
          <div className="chord-bar"><span>连开方式</span><div className="chord-options">{(Object.keys(CHORD_LABELS) as ChordMode[]).map(mode => <button aria-pressed={config.chordMode === mode} key={mode} onClick={() => choose(config.difficulty, mode)}>{CHORD_LABELS[mode]}{config.chordMode === mode && <span className="selection-dot"/>}</button>)}</div><button className="text-button chord-help" onClick={() => setPanel('help')} aria-label="了解连开"><Icon name="help"/></button></div>
          <p className={`auto-warning ${config.chordMode === 'auto' ? 'shown' : ''}`}>{config.chordMode === 'auto' ? '插旗后可能自动打开周围格子，插错旗也可能触雷。' : '点击已开数字，在旗数相等时连开周围格子。'}</p>
        </section>
        <aside className="status-panel" aria-label="本局状态">
          <div className="mascot-wrap" key={game.gameId}><Face mood={pressed && !terminal ? 'pressed' : game.phase}/><span className="mascot-caption">{game.phase === 'won' ? '漂亮，完成了！' : game.phase === 'lost' ? '下一局，新的可能' : '不着急，慢慢来'}</span></div>
          <div className="metrics"><div><span className="metric-label"><Icon name="clock"/>本局用时</span><Timer start={game.startedAt} end={game.endedAt} visible={settings.timer}/></div><div><span className="metric-label"><Icon name="flag"/>剩余旗数</span><span className={`metric-value ${remaining < 0 ? 'overflags' : ''}`}>{String(remaining).padStart(2, '0')}</span></div></div>
          <button className="primary new-game" onClick={() => start()}><Icon name="refresh"/>新的一局</button>
          <div className={`result-panel ${terminal ? 'has-result' : ''}`} aria-live="polite" aria-atomic="true">
            {game.phase === 'won' ? <><div className="result-title"><Icon name="spark"/><h2>这一局，真不错</h2></div><p>用时 {formatTime(elapsed)} · {config.chordMode === 'auto' ? '自动' : '手动'}连开</p>{settings.leaderboard && eligible && <div className="save-score"><label className="sr-only" htmlFor="nickname">成绩称呼</label><select id="nickname" value={nickname} onChange={event => setNickname(event.target.value as ScoreEntry['nickname'])} disabled={saved}>{['哥哥', '弟弟', '家长', '访客'].map(name => <option key={name}>{name}</option>)}</select><button className="secondary" onClick={saveScore} disabled={saved}>{saved ? '已保存' : '保存成绩'}</button></div>}{!eligible && <p>时钟异常，这一局不计入本机榜。</p>}{saveMessage && <p className="save-message">{saveMessage}</p>}</> : game.phase === 'lost' ? <><div className="result-title"><Icon name="mine"/><h2>碰到一颗雷</h2></div><p>珊瑚色标出触雷格，叉号标出错旗。再来一局，换个新开始。</p></> : <p className="quiet-note">每打开一格，<br/>离答案就近一点。</p>}
          </div>
          <button className="best-score" onClick={() => setPanel('leaderboard')}><Icon name="cup"/><span><small>本机最好 · {config.chordMode === 'auto' ? '自动' : '手动'}</small><strong>{!settings.leaderboard ? '本机榜已关闭' : best ? formatTime(best.elapsedMs) : '等你来创造'}</strong></span><Icon name="chevron"/></button>
        </aside>
      </div>
      <div className="input-guide"><span><span className="mouse-icon"/>点击翻开</span><span><kbd>右键</kbd> 或 <kbd>Shift</kbd>＋点击插旗</span><span><kbd>↑ ↓ ← →</kbd> 移动 · <kbd>F</kbd> 插旗</span><button className="text-button" onClick={() => setPanel('help')}>全部玩法 <Icon name="chevron"/></button></div>
    </main>
    <footer className="site-footer"><span><span className="tiny-diamond"/>轻一点，慢一点。</span><span>随机标准扫雷 <i/> 刷新即新局 <i/> 成绩仅存本机</span></footer>
    {panel === 'settings' && <SettingsPanel settings={settings} chordMode={config.chordMode} active={game.phase === 'playing' || game.flagCount > 0 && game.phase === 'ready'} onApply={applySettings} onClose={() => setPanel(null)}/>}
    {panel === 'help' && <HelpPanel onClose={() => setPanel(null)}/>}
    {panel === 'leaderboard' && <LeaderboardPanel entries={scores} difficulty={config.difficulty} initialControl={config.chordMode === 'auto' ? 'auto' : 'manual'} enabled={settings.leaderboard} error={storageError} onClose={() => setPanel(null)} onClear={() => { const result = leaderboard.clear(); setScores(result.entries); setStorageError(result.error); }}/>}
    {pending && <Modal title="开始新的挑战？" onClose={() => setPending(null)}><p className="panel-intro">更换为{DIFFICULTIES[pending.difficulty].name} · {CHORD_LABELS[pending.mode]}连开，会结束当前局。</p><div className="panel-actions"><button className="secondary" onClick={() => setPending(null)}>继续当前局</button><button className="primary" onClick={() => start(pending.difficulty, pending.mode)}>应用并开始新局</button></div></Modal>}
  </div>;
}

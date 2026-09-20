import { useState } from 'react';
import { DIFFICULTIES } from '../config/game';
import type { Difficulty } from '../core/types';
import type { ScoreEntry } from '../storage/leaderboard';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { formatTime } from './Timer';
export function LeaderboardPanel({ entries, difficulty, initialControl, enabled, error, onClear, onClose }: { entries: ScoreEntry[]; difficulty: Difficulty; initialControl: 'manual' | 'auto'; enabled: boolean; error?: string; onClear: () => void; onClose: () => void }) {
  const [selected, setSelected] = useState(difficulty);
  const [control, setControl] = useState<'manual' | 'auto'>(initialControl);
  const [confirm, setConfirm] = useState(false);
  const list = entries.filter(entry => entry.difficulty === selected && entry.controlClass === control);
  return <Modal title="这里，记下好成绩" onClose={onClose}>
    <p className="panel-intro">本机榜 · 只属于这台设备、这个浏览器</p>
    {!enabled ? <p className="empty-state">本机榜已关闭。可在设置中启用。</p> : <>
      <div className="leader-filters"><label>难度<select value={selected} onChange={event => setSelected(event.target.value as Difficulty)}>{Object.entries(DIFFICULTIES).map(([id, item]) => <option value={id} key={id}>{item.name}</option>)}</select></label><div className="segmented"><button aria-pressed={control === 'manual'} onClick={() => setControl('manual')}>手动</button><button aria-pressed={control === 'auto'} onClick={() => setControl('auto')}>自动</button></div></div>
      {list.length ? <ol className="score-list">{list.map((entry, index) => <li key={entry.id}><span className="rank">{String(index + 1).padStart(2, '0')}</span><strong>{entry.nickname}</strong><span>{formatTime(entry.elapsedMs)}<small>{new Date(entry.completedAt).toLocaleDateString('zh-CN')}</small></span></li>)}</ol> : <div className="empty-state"><Icon name="cup"/><h3>第一个好成绩，等你写下</h3><p>获胜后选择一个称呼，主动保存即可。</p></div>}
      {error && <p className="notice" role="status">{error}</p>}
      <p className="fine-print">每种难度的手动／自动各保留前 10 名。不跨设备同步，浏览器清理数据后可能丢失。仅用于家庭娱乐。</p>
      <button className="text-button danger" onClick={() => { if (confirm) { onClear(); setConfirm(false); } else setConfirm(true); }}>{confirm ? '确认清空本机全部成绩' : '清空本机榜'}</button>{confirm && <button className="text-button" onClick={() => setConfirm(false)}>取消</button>}
    </>}
  </Modal>;
}

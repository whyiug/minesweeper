import { useState } from 'react';
import type { ChordMode } from '../core/types';
import { Modal } from './Modal';
export interface Settings { sound: boolean; motion: boolean; timer: boolean; large: boolean; leaderboard: boolean }
export const DEFAULT_SETTINGS: Settings = { sound: false, motion: true, timer: true, large: false, leaderboard: true };
export const CHORD_LABELS = { single: '单击', double: '双击', auto: '自动' };
export function SettingsPanel({ settings, chordMode, active, onApply, onClose }: { settings: Settings; chordMode: ChordMode; active: boolean; onApply: (settings: Settings, mode: ChordMode) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(settings);
  const [mode, setMode] = useState(chordMode);
  const toggles: [keyof Settings, string, string][] = [['sound', '轻声音效', '翻开、插旗与结果的短音提示'], ['motion', '展开动效', '系统要求减少动效时也会关闭'], ['timer', '显示计时', '隐藏后仍正常计时和计分'], ['large', '大格子', '更容易点按，棋盘可局部滚动'], ['leaderboard', '启用本机榜', '关闭后不再读取或写入成绩存储']];
  return <Modal title="按你的节奏" onClose={onClose}>
    <p className="panel-intro">设置仅在本次打开时有效。</p>
    <fieldset className="chord-setting"><legend>连开方式</legend><div className="segmented">{(Object.keys(CHORD_LABELS) as ChordMode[]).map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{CHORD_LABELS[value]}</button>)}</div>
      <p>{mode === 'auto' ? '插旗后可能自动打开周围格子，插错旗也可能触雷。' : mode === 'double' ? '双击已开的数字连开；键盘仍按一次 Enter。' : '点一下已开的数字，旗数相等时打开周围格子。'}</p>
    </fieldset>
    <div className="settings-list">{toggles.map(([key, label, hint]) => <label className="setting-row" key={key}><span><strong>{label}</strong><small>{hint}</small></span><input type="checkbox" role="switch" checked={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.checked })}/></label>)}</div>
    {active && mode !== chordMode && <p className="notice">更换连开方式会结束当前局，并开始新局。</p>}
    <div className="panel-actions"><button onClick={onClose} className="secondary">取消</button><button className="primary" onClick={() => onApply(draft, mode)}>{active && mode !== chordMode ? '应用并开始新局' : '应用设置'}</button></div>
  </Modal>;
}

import { Modal } from './Modal';
import { Icon } from './Icon';
export function HelpPanel({ onClose }: { onClose: () => void }) {
  return <Modal title="留一点时间，给专注" onClose={onClose}>
    <p className="panel-intro">找到所有安全格，就完成这一局。</p>
    <div className="help-row"><span className="example-number">2</span><div><h3>数字是线索</h3><p>数字表示周围八格的地雷数量。空白会展开到边缘数字。首次翻开及周围邻格始终安全；后续仍可能需要猜测。</p></div></div>
    <div className="help-row"><span className="example-flag"><Icon name="flag"/></span><div><h3>用旗记下你的判断</h3><p>右键、Mac 辅助点按或 Shift＋点击插旗。触屏可切换插旗模式，也可长按约 350 毫秒。旗子只是标记，系统不会确认它是否正确。</p></div></div>
    <div className="help-row"><span className="example-chord"><Icon name="spark"/></span><div><h3>连开，让推理更顺手</h3><p>已开数字周围旗数等于数字时，可一次打开其余邻格。可选单击、双击或自动。插错旗也可能触雷，预览边框不表示安全。</p></div></div>
    <div className="keyboard-guide"><kbd>↑ ↓ ← →</kbd><span>移动焦点</span><kbd>Enter / 空格</kbd><span>翻开或手动连开</span><kbd>F</kbd><span>插旗 / 取消旗子</span><kbd>Esc</kbd><span>关闭面板</span></div>
    <p className="fine-print">随机标准扫雷，不保证每局无猜。刷新就是新局；没有账号、广告或云存档。</p>
  </Modal>;
}

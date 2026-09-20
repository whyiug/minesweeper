import { memo, useEffect, useState } from 'react';
export function formatTime(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '时间异常';
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export const Timer = memo(function Timer({ start, end, visible }: { start: number | null; end: number | null; visible: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (start === null || end !== null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [start, end]);
  const elapsed = start === null ? 0 : (end ?? Math.max(now, start)) - start;
  return <span className="metric-value" aria-label={visible ? '用时' : '用时已隐藏'}>{visible ? formatTime(elapsed) : '—:—'}</span>;
});

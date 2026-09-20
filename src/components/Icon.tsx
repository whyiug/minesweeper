import type { CSSProperties } from 'react';

export type IconName = 'flag' | 'mine' | 'sound' | 'mute' | 'settings' | 'help' | 'refresh' | 'cup' | 'clock' | 'close' | 'reveal' | 'chevron' | 'check' | 'spark';
const paths: Record<IconName, string> = {
  flag: 'M6 21V3m0 1c4-4 8 4 13 0v10c-5 4-9-4-13 0M3 21h7',
  mine: 'M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM9 10l1-1',
  sound: 'M11 4 6 8H3v8h3l5 4ZM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14',
  mute: 'M11 4 6 8H3v8h3l5 4ZM16 9l6 6m0-6-6 6',
  settings: 'M4 7h16M4 17h16M9 4v6m6 4v6',
  help: 'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  refresh: 'M20 8a8 8 0 1 0 0 8M20 3v5h-5',
  cup: 'M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v6m-4 0h8',
  clock: 'M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  close: 'm6 6 12 12M6 18 18 6',
  reveal: 'M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  chevron: 'm9 5 7 7-7 7',
  check: 'm5 12 4 4L19 6',
  spark: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z',
};
export function Icon({ name, className = '', style }: { name: IconName; className?: string; style?: CSSProperties }) {
  return <svg className={`icon ${className}`} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function Crystal() {
  return <svg viewBox="0 0 48 48" className="crystal" aria-hidden="true"><path d="M24 4 42 21 24 44 6 21Z" fill="#66c8ff"/><path d="m24 4 0 40-10-23Z" fill="#b5e7ff"/><path d="m24 4 10 17-10 23 18-23Z" fill="#3299df"/></svg>;
}
export function Face({ mood }: { mood: 'ready' | 'playing' | 'won' | 'lost' | 'pressed' }) {
  return <svg className={`face face-${mood}`} viewBox="0 0 100 100" role="img" aria-label={{ready:'准备好了',playing:'专注中',won:'完成了',lost:'再来一局',pressed:'正在翻开'}[mood]}>
    <path d="M50 5 88 26v46L50 95 12 73V27Z" fill={mood === 'won' ? '#ffd675' : '#82d0fd'} />
    <path d="M50 5v90L12 73V27Z" fill={mood === 'won' ? '#ffe5a6' : '#b9e9ff'} />
    <path d="m12 27 38 14 38-15M50 41v54" fill="none" stroke="#fff" opacity=".18" strokeWidth="2" />
    {mood === 'lost' ? <g stroke="#214b66" strokeWidth="3" strokeLinecap="round"><path d="m31 43 9 9m-9 0 9-9m20 0 9 9m-9 0 9-9M39 69q11-9 22 0"/></g> : <g fill="#214b66"><ellipse cx="35" cy="48" rx="3.5" ry={mood === 'won' ? 2 : 5}/><ellipse cx="65" cy="48" rx="3.5" ry={mood === 'won' ? 2 : 5}/>{mood === 'pressed' ? <ellipse cx="50" cy="66" rx="5" ry="7"/> : <path d="M39 64q11 13 22 0" fill="none" stroke="#214b66" strokeWidth="3" strokeLinecap="round"/>}</g>}
    {mood === 'won' && <path d="m23 4 8 6 9-9 9 9 8-6-3 14H27Z" fill="#ffd675" stroke="#20364d" strokeWidth="2"/>}
  </svg>;
}

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ChordMode, Phase, VisibleCell } from '../core/types';
import { neighbors } from '../core/neighbors';
import { createPointerController } from '../input/pointer-controller';
import { createKeyboardController } from '../input/keyboard-controller';
import { Icon } from './Icon';

type Action = { type: 'REVEAL' | 'FLAG' | 'CHORD'; index: number };
interface Props {
  cells: VisibleCell[]; rows: number; cols: number; gameId: string; phase: Phase;
  chordMode: ChordMode; touchMode: 'reveal' | 'flag'; size: 'fit' | 'large'; difficulty: string;
  dispatch: (action: Action) => void; onPress: (pressed: boolean) => void;
  finishCell: (element: HTMLElement | null) => void;
}
export const Board = memo(function Board(props: Props) {
  const latest = useRef(props); latest.current = props;
  const grid = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [pressed, setPressed] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const controller = useMemo(() => createPointerController({
    getCell: index => latest.current.cells[index],
    getChordMode: () => latest.current.chordMode,
    getTouchMode: () => latest.current.touchMode,
    dispatch: action => latest.current.dispatch(action),
    onPress: index => { setPressed(index); latest.current.onPress(index !== null); },
    onPreview: setPreview,
  }), []);
  const keyboard = useMemo(() => createKeyboardController({
    getCell: index => latest.current.cells[index],
    getChordMode: () => latest.current.chordMode,
    dispatch: action => latest.current.dispatch(action),
    rows: props.rows, cols: props.cols,
    focus: index => { setFocusIndex(index); grid.current?.querySelector<HTMLElement>(`[data-cell="${index}"]`)?.focus(); },
  }), [props.rows, props.cols]);
  useEffect(() => {
    const cancel = () => controller.cancel();
    const down = (event: PointerEvent) => controller.observePointerDown(event);
    const up = (event: PointerEvent) => controller.observePointerUp(event);
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', cancel);
    window.addEventListener('scroll', cancel, true);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      controller.cancel(); window.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', cancel); window.removeEventListener('scroll', cancel, true); document.removeEventListener('visibilitychange', hidden);
    };
  }, [controller]);
  useEffect(() => { controller.cancel(); setFocusIndex(0); }, [props.gameId, controller]);
  const targets = useMemo(() => {
    if (preview === null) return [];
    const adjacent = neighbors(preview, props.rows, props.cols);
    return adjacent.filter(index => props.cells[index].cover === 'hidden');
  }, [preview, props.cells, props.cols, props.rows]);
  return <div className={`board-scroll size-${props.size} difficulty-${props.difficulty}`}>
    <div ref={grid} className={`board phase-${props.phase}`} role="grid" aria-label="扫雷棋盘" aria-rowcount={props.rows} aria-colcount={props.cols}
      style={{ '--cols': props.cols } as CSSProperties} onPointerMove={event => controller.pointerMove(event.nativeEvent)} onPointerLeave={event => controller.pointerLeave(event.nativeEvent)}
      onPointerCancel={event => controller.pointerCancel(event.nativeEvent)} onLostPointerCapture={event => controller.pointerCancel(event.nativeEvent)}>
      {Array.from({ length: props.rows }, (_, row) => <div role="row" key={row} className="board-row">{props.cells.slice(row * props.cols, (row + 1) * props.cols).map(cell => {
        const label = `${Math.floor(cell.index / props.cols) + 1} 行 ${cell.index % props.cols + 1} 列，${cell.wrongFlag ? '错旗' : cell.mine ? '地雷' : cell.cover === 'hidden' ? '未翻开' : cell.cover === 'flagged' ? '已插旗' : cell.number ? `周围 ${cell.number} 个雷` : '空白'}`;
        return <button key={cell.index} role="gridcell" data-cell={cell.index} aria-label={label} aria-rowindex={row + 1} aria-colindex={cell.index % props.cols + 1}
          aria-disabled={props.phase === 'won' || props.phase === 'lost'} tabIndex={focusIndex === cell.index ? 0 : -1}
          className={`cell ${cell.cover} n${cell.number ?? ''} ${cell.mine ? 'mine' : ''} ${cell.exploded ? 'exploded' : ''} ${cell.wrongFlag ? 'wrong-flag' : ''} ${pressed === cell.index ? 'pressed' : ''} ${targets.includes(cell.index) ? 'preview' : ''}`}
          onFocus={() => setFocusIndex(cell.index)}
          onPointerDown={event => { props.finishCell(event.currentTarget); controller.pointerDown(cell.index, event.nativeEvent); }}
          onPointerUp={event => controller.pointerUp(cell.index, event.nativeEvent)}
          onPointerLeave={event => controller.pointerLeave(event.nativeEvent)}
          onContextMenu={event => { event.preventDefault(); controller.contextMenu(cell.index, event.nativeEvent); }}
          onClick={event => controller.click(cell.index, event.nativeEvent)}
          onKeyDown={event => { props.finishCell(event.currentTarget); keyboard.keyDown(cell.index, event.nativeEvent); }}>
          {cell.cover === 'flagged' ? <Icon name="flag"/> : cell.mine ? <Icon name="mine"/> : cell.number ? <span>{cell.number}</span> : null}
          {cell.wrongFlag && <span className="wrong-cross" aria-hidden="true"/>}
        </button>;
      })}</div>)}
    </div>
  </div>;
});

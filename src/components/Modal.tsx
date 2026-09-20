import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const target = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    const cancel = (event: Event) => { event.preventDefault(); close.current(); };
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, summary, [tabindex], [contenteditable="true"]',
      )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') &&
        !element.hidden && element.getClientRects().length > 0 &&
        !element.closest('[inert], [aria-hidden="true"]'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!first) {
        event.preventDefault(); dialog.focus();
      } else if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (active === last || active === dialog || !dialog.contains(active))) {
        event.preventDefault(); first.focus();
      }
    };
    dialog.addEventListener('cancel', cancel);
    dialog.addEventListener('keydown', trapFocus);
    return () => { dialog.removeEventListener('cancel', cancel); dialog.removeEventListener('keydown', trapFocus); dialog.close(); target?.focus(); };
  }, []);
  return <dialog className={`modal ${wide ? 'modal-wide' : ''}`} ref={ref} aria-labelledby="panel-title" tabIndex={-1}>
    <header className="modal-header"><h2 id="panel-title">{title}</h2><button className="icon-button" aria-label="关闭面板" onClick={onClose}><Icon name="close"/></button></header>
    {children}
  </dialog>;
}

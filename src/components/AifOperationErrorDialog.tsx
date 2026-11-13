import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

type Props = { message: string; onClose: () => void };

export default function AifOperationErrorDialog({ message, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!message) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      } else if (event.key === 'Tab') {
        const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
        if (!buttons.length) return;
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = current < 0 ? (event.shiftKey ? buttons.length - 1 : 0)
          : (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        event.preventDefault();
        event.stopImmediatePropagation();
        buttons[next].focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) closeButton.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [message, onClose]);

  if (!message) return null;
  return createPortal(
    <div data-aif-error-dialog="true"
      className="fixed inset-0 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-[6px]"
      style={{ zIndex: 2147483000 }}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panel} role="alertdialog" aria-modal="true"
        aria-labelledby="aif-operation-error-title" aria-describedby="aif-operation-error-message"
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/25 bg-[#303a4c] text-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/15 px-5 py-4">
          <AlertTriangle size={21} className="shrink-0 text-rose-200" aria-hidden="true" />
          <h2 id="aif-operation-error-title" className="flex-1 text-base font-normal">A művelet nem hajtható végre</h2>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Bezárás"
            className="rounded-lg p-2 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            <X size={18} />
          </button>
        </div>
        <div id="aif-operation-error-message" className="overflow-y-auto whitespace-pre-wrap break-words px-5 py-5 text-sm leading-6">{message}</div>
        <div className="flex justify-end border-t border-white/15 px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-white/30 bg-[#233348] px-5 py-2 text-sm hover:bg-[#2b4059] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Rendben</button>
        </div>
      </div>
    </div>, document.body,
  );
}

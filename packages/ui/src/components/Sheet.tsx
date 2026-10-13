"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "./cx";

/**
 * A modal on a native `<dialog>`: a bottom sheet on phones, a right drawer from `md`. The browser traps focus and
 * turns Escape into a `cancel` event; both that and a click on the backdrop call `onClose`. The parent owns `open`.
 * Focus goes back to whatever opened it.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", ""); // jsdom and very old browsers
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
      opener.current?.focus();
      opener.current = null;
    }
  }, [open]);

  // Unmounting while open must not leave the page inert.
  useEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open && typeof d.close === "function") d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className={cx(
        "fixed m-0 w-full max-w-none overflow-hidden bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40",
        "inset-x-0 top-auto bottom-0 max-h-[88vh] rounded-t-3xl",
        "md:top-0 md:bottom-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-[30rem] md:rounded-t-none md:rounded-l-3xl",
        "not-open:hidden open:flex open:flex-col",
      )}
    >
      {open && (
        <>
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 id={titleId} className="text-lg">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-11 items-center justify-center rounded-full text-xl text-muted hover:bg-accent-soft">
              <span aria-hidden="true">✕</span>
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </>
      )}
    </dialog>
  );
}

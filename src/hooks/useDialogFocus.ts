import { useEffect } from "react";

/** Keep keyboard navigation inside the active modal and restore its opener. */
export function useDialogFocus(): void {
  useEffect(() => {
    let dialog: HTMLElement | null = null;
    let opener: HTMLElement | null = null;
    const focusable = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
    const sync = () => {
      const dialogs = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
      const next = dialogs[dialogs.length - 1] ?? null;
      if (next === dialog) return;
      if (!next) {
        if (opener?.isConnected) opener.focus();
        opener = null;
      } else {
        if (!dialog) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const first = focusable(next)[0];
        first?.focus();
      }
      dialog = next;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!dialog || e.key !== "Tab") return;
      const controls = focusable(dialog);
      if (!controls.length) { e.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", onKey, true);
    sync();
    return () => { observer.disconnect(); document.removeEventListener("keydown", onKey, true); };
  }, []);
}

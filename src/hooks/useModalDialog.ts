import { useEffect, useEffectEvent, useRef, type RefObject } from 'react';

const dialogs: HTMLElement[] = [];
const inertElements = new Map<HTMLElement, { count: number; original: boolean }>();
let bodyOverflow = '';

function attachDialog(dialog: HTMLElement, close: () => void) {
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const fallbackTrigger = trigger?.closest('details')?.querySelector('summary');
  const inerted: HTMLElement[] = [];
  let branch: HTMLElement = dialog.closest<HTMLElement>('.modal-overlay') || dialog;
  while (branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
      const saved = inertElements.get(sibling) || { count: 0, original: sibling.inert };
      saved.count += 1;
      inertElements.set(sibling, saved);
      sibling.inert = true;
      inerted.push(sibling);
    }
    if (branch.parentElement === document.body) break;
    branch = branch.parentElement;
  }
  if (!dialogs.length) { bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
  dialogs.push(dialog);
  dialog.tabIndex = -1;
  if (!dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
  const handleKey = (event: KeyboardEvent) => {
    if (dialogs.at(-1) !== dialog || event.defaultPrevented) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, summary, [tabindex]')]
      .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[inert]') && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
    const first = controls[0]; const last = controls.at(-1);
    if (!first) { event.preventDefault(); dialog.focus(); }
    else if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  };
  const keepFocus = (event: FocusEvent) => {
    if (dialogs.at(-1) === dialog && !dialog.contains(event.target as Node)) dialog.focus({ preventScroll: true });
  };
  document.addEventListener('keydown', handleKey);
  document.addEventListener('focusin', keepFocus);
  return () => {
    document.removeEventListener('keydown', handleKey);
    document.removeEventListener('focusin', keepFocus);
    dialogs.splice(dialogs.indexOf(dialog), 1);
    for (const element of inerted) {
      const saved = inertElements.get(element)!;
      if (--saved.count === 0) { element.inert = saved.original; inertElements.delete(element); }
    }
    if (!dialogs.length) document.body.style.overflow = bodyOverflow;
    if (trigger?.isConnected && !trigger.closest('[inert]') && trigger.getClientRects().length) trigger.focus({ preventScroll: true });
    else if (fallbackTrigger?.isConnected && !fallbackTrigger.closest('[inert]') && fallbackTrigger.getClientRects().length) fallbackTrigger.focus({ preventScroll: true });
    else dialogs.at(-1)?.focus({ preventScroll: true });
  };
}

// Each dialog owns its focus and temporarily makes the surrounding UI inert.
// Reference counts also cover previews and leave confirmations over another dialog.
export function useModalDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void, providedRef?: RefObject<T | null>, active = true) {
  const localRef = useRef<T>(null);
  const ref = providedRef || localRef;
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (active && ref.current) return attachDialog(ref.current, close);
  }, [active, ref]);
  return ref;
}

import { useCallback, useEffect, useRef } from 'react';

// Retain external-AI drafts while their field is collapsed or a dialog is closed.
export function useRetainedTextarea() {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const value = useRef('');
  const fieldRef = useCallback((node: HTMLTextAreaElement | null) => {
    if (ref.current) value.current = ref.current.value;
    ref.current = node;
    if (node) node.value = value.current;
  }, []);
  const reset = useCallback(() => {
    value.current = '';
    if (ref.current) ref.current.value = '';
  }, []);
  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!(ref.current?.value ?? value.current).trim()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, []);
  return { ref, fieldRef, reset };
}

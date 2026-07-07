import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast(timeoutMs = 2600) {
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), timeoutMs);
  }, [timeoutMs]);

  return { toast, notify };
}

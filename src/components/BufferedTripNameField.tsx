import { useState } from 'react';
import type { TranslateFn } from '../types/ui';

interface BufferedTripNameFieldProps {
  value: string;
  t: TranslateFn;
  onCommit: (value: string) => void;
}

export function BufferedTripNameField({ value, t, onCommit }: BufferedTripNameFieldProps) {
  const [draft, setDraft] = useState(value || '');

  const commitDraft = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <label className="trip-name-field">
      <span>{t('planName')}</span>
      <input
        className="input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

// Place at: src/app/dashboard/ModSearchAutocomplete.tsx
'use client';

import { useState, useRef } from 'react';
import { MOD_LABEL_TO_KEY } from '@/lib/tracker/modTypes';
import styles from './dashboard.module.css';

const ALL_LABELS = Object.keys(MOD_LABEL_TO_KEY);
const MAX_SUGGESTIONS = 8;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (label: string) => void;
  id: string;
  placeholder?: string;
}

// Deliberately not a native <input list> + <datalist> - that relies on
// each browser's own matching behaviour, which is inconsistent: some
// browsers (particularly on mobile) only match an exact case-sensitive
// prefix, so typing lowercase against a catalog of capitalised labels
// silently returns nothing. Filtering the list ourselves, the same way,
// every time, on every platform, is what actually fixes that.
export function ModSearchAutocomplete({ value, onChange, onSelect, id, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const query = value.trim().toLowerCase();
  const matches = query
    ? ALL_LABELS.filter((label) => label.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS)
    : [];

  function handleSelect(label: string) {
    onSelect(label);
    setOpen(false);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul className={styles.autocompleteList}>
          {matches.map((label) => (
            <li key={label}>
              {/* onMouseDown, not onClick - fires before the input's onBlur,
                  so the selection registers instead of the list closing first */}
              <button type="button" onMouseDown={(e) => { e.preventDefault(); handleSelect(label); }} className={styles.autocompleteItem}>
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

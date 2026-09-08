// Place at: src/app/dashboard/LabourSearchAutocomplete.tsx
'use client';

import { useState, useRef } from 'react';
import { LABOUR_LABEL_TO_KEY } from '@/lib/tracker/labourTypes';
import styles from './dashboard.module.css';

const ALL_LABELS = Object.keys(LABOUR_LABEL_TO_KEY);
const MAX_SUGGESTIONS = 8;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (label: string) => void;
  id: string;
  placeholder?: string;
}

// Same free-text filtering approach as ModSearchAutocomplete, needed for
// the same reason: at 300+ catalog entries a plain <select> is unusable
// to browse, and native <input list>/<datalist> matching is inconsistent
// across browsers.
export function LabourSearchAutocomplete({ value, onChange, onSelect, id, placeholder }: Props) {
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

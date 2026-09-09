// Place at: src/app/dashboard/CarModSearchAutocomplete.tsx
//
// Car equivalent of ModSearchAutocomplete.tsx - same hand-rolled
// filtering (not native <datalist>, for the same cross-browser reason),
// just over CAR_MOD_LABEL_TO_KEY instead of the motorcycle catalog.
'use client';

import { useState, useRef } from 'react';
import { CAR_MOD_LABEL_TO_KEY } from '@/lib/tracker/carModTypes';
import styles from './dashboard.module.css';

const ALL_LABELS = Object.keys(CAR_MOD_LABEL_TO_KEY);
const MAX_SUGGESTIONS = 8;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (label: string) => void;
  id: string;
  placeholder?: string;
}

export function CarModSearchAutocomplete({ value, onChange, onSelect, id, placeholder }: Props) {
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

// Place at: src/components/VehicleSpinner.tsx
//
// The one loading indicator for the whole app - a small, themed spinner
// so a button click always reads as "accepted, working on it" rather
// than looking like nothing happened. Bike: a wire-spoked wheel with a
// sprocket at the hub, spinning. Car: a 5-spoke alloy wheel, spinning,
// with a few bits of grit kicked out from underneath. Deliberately one
// shared component with a `kind` prop rather than two separate ones -
// every call site already knows (or can default) which vehicle it's
// about, the same way VdiIcon.tsx is one component for every icon name
// rather than a family of them.
//
// Every existing async button in this app already tracks its own
// loading boolean and disables itself/swaps its label while true (e.g.
// "Looking up…", "Getting your report…") - this only ever adds the
// missing VISUAL cue next to that existing text, it doesn't introduce
// new loading state anywhere.
import styles from './VehicleSpinner.module.css';

export type VehicleSpinnerKind = 'bike' | 'car';

interface Props {
  kind?: VehicleSpinnerKind;
  // Matches VdiIcon.tsx's own default/override convention.
  size?: number;
  // Screen-reader text - only used when decorative is false (see
  // below). Defaults to a generic fallback rather than assuming there's
  // adjacent text to borrow from.
  label?: string;
  // True at the vast majority of call sites: this spinner sits right
  // next to a button's own already-descriptive, already-changing text
  // ("Refreshing…", "Saving…") - that text alone already tells
  // assistive tech the state changed, so the spinner itself should stay
  // silent (aria-hidden, no role) rather than announce a second,
  // redundant "Loading". Only ever false for a standalone spinner with
  // nothing else nearby to announce the wait (see
  // NavigationLoadingOverlay.tsx, the one real exception).
  decorative?: boolean;
  className?: string;
}

function BikeWheel({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <g className={styles.wheel}>
        <circle cx="12" cy="12" r="9.5" stroke="var(--asphalt)" strokeWidth="2.2" />
        {/* Wire spokes - a wheel with N evenly-spaced identical spokes looks
            the same every 360/N degrees, which makes real rotation nearly
            imperceptible at a glance, especially at small render sizes.
            The valve-stem dot below (not repeated/symmetric) is what
            actually reads as "this is turning". */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <line
            key={deg}
            x1="12"
            y1="12"
            x2={12 + 8.2 * Math.cos((deg * Math.PI) / 180)}
            y2={12 + 8.2 * Math.sin((deg * Math.PI) / 180)}
            stroke="var(--slate)"
            strokeWidth="1.4"
          />
        ))}
        {/* Sprocket - a small toothed ring at the hub */}
        <circle cx="12" cy="12" r="3.2" fill="var(--amber)" />
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <rect
            key={deg}
            x="11.35"
            y="7.6"
            width="1.3"
            height="1.6"
            fill="var(--amber-ink)"
            transform={`rotate(${deg} 12 12)`}
          />
        ))}
        <circle cx="12" cy="12" r="1.1" fill="var(--asphalt)" />
        {/* Valve-stem cap - the one asymmetric mark on the rim. Its
            position is the actual visible proof the wheel is spinning;
            without it, 8-fold spoke symmetry hides the motion. */}
        <circle cx="12" cy="2.7" r="1.3" fill="var(--amber)" stroke="var(--asphalt)" strokeWidth="0.5" />
      </g>
    </svg>
  );
}

function CarWheel({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      {/* Grit kicked from under the wheel - sits behind the wheel graphic, unaffected by its rotation */}
      <circle className={styles.gravelBit} style={{ '--kick-x': '-7px', '--kick-y': '4px', animationDelay: '0ms' } as React.CSSProperties} cx="6" cy="18" r="0.9" fill="var(--slate)" />
      <circle className={styles.gravelBit} style={{ '--kick-x': '-4px', '--kick-y': '6px', animationDelay: '250ms' } as React.CSSProperties} cx="7" cy="17.5" r="0.7" fill="var(--asphalt-3)" />
      <circle className={styles.gravelBit} style={{ '--kick-x': '-9px', '--kick-y': '2px', animationDelay: '500ms' } as React.CSSProperties} cx="5.5" cy="18.5" r="0.6" fill="var(--slate)" />
      <g className={`${styles.wheel} ${styles.wheelCar}`}>
        <circle cx="12" cy="12" r="9.5" stroke="var(--asphalt)" strokeWidth="2.6" />
        <circle cx="12" cy="12" r="7.6" stroke="var(--asphalt-2)" strokeWidth="1" />
        {/* 5-spoke alloy pattern - solid wedges, not wire spokes. Still
            rotationally symmetric every 72 degrees on its own, same
            "can't see it spinning" problem the bike wheel has - the rim
            marker below is what actually shows the motion. */}
        {[0, 72, 144, 216, 288].map((deg) => (
          <path
            key={deg}
            d="M12 12 L14.1 6.3 A8 8 0 0 1 16.3 8.1 Z"
            fill="var(--asphalt-3)"
            transform={`rotate(${deg} 12 12)`}
          />
        ))}
        <circle cx="12" cy="12" r="2.6" fill="var(--amber)" />
        <circle cx="12" cy="12" r="1" fill="var(--asphalt)" />
        {/* Valve-stem cap - one asymmetric rim mark, the actual visible
            proof of rotation (see BikeWheel's own comment). */}
        <circle cx="12" cy="2.7" r="1.1" fill="var(--amber)" stroke="var(--asphalt)" strokeWidth="0.4" />
      </g>
    </svg>
  );
}

export function VehicleSpinner({ kind = 'bike', size = 20, label = 'Loading', decorative = true, className }: Props) {
  const a11yProps = decorative ? { 'aria-hidden': true as const } : { role: 'status' as const, 'aria-label': label };
  return (
    <span className={`${styles.root}${className ? ` ${className}` : ''}`} {...a11yProps}>
      {kind === 'car' ? <CarWheel size={size} /> : <BikeWheel size={size} />}
    </span>
  );
}

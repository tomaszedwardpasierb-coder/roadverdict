// Place at: src/components/StaticHeroImage.tsx
//
// A full-bleed background picture served from ready-made files in public/,
// not through Next's /_next/image resizer. The resizer's cache is wiped on
// every deploy, so after each restart the first visitors made the single
// small server re-encode every hero picture (AVIF at that) while it was also
// starting up - minutes of waiting for one image, with everything else
// queued behind it. Pre-sized WebP files are just served.
//
// The files are generated once (see public/images/hero/): `${base}-${width}.webp`
// for each width in `widths`. Behaves like <Image fill>: absolutely positioned
// to cover its parent, which must be position: relative.
type Props = {
  base: string; // e.g. "/images/hero/panel-04"
  widths: number[]; // ascending, e.g. [640, 896]
  sizes: string;
  alt: string;
  objectPosition?: string;
  priority?: boolean;
};

export function StaticHeroImage({ base, widths, sizes, alt, objectPosition = 'center center', priority = false }: Props) {
  const largest = widths[widths.length - 1];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${base}-${largest}.webp`}
      srcSet={widths.map((w) => `${base}-${w}.webp ${w}w`).join(', ')}
      sizes={sizes}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding={priority ? 'auto' : 'async'}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition }}
    />
  );
}

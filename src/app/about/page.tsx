// Place at: src/app/about/page.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About | RoadVerdict',
  description: 'Who runs RoadVerdict and why it exists.',
};

export default function AboutPage() {
  return (
    <div className="hero">
      <h1>About RoadVerdict</h1>
      <video
        src="/api/video/promo"
        controls
        muted
        loop
        playsInline
        style={{ width: '100%', borderRadius: '12px', marginBottom: '1.5rem' }}
      />
      <p style={{ maxWidth: 'none', margin: '0 0 1.5rem' }}>
        RoadVerdict is run independently, not by a large company - built to fix a genuinely
        annoying problem: not knowing whether a motorcycle service quote is fair, and not
        having a real record of what a bike has actually cost to own.
      </p>
      <p style={{ maxWidth: 'none' }}>
        This page is still being written - the short version for now is that RoadVerdict is a
        small, UK-focused, motorcycle-specific project, not a car app with a bike icon bolted
        on. Questions in the meantime: <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>.
      </p>
    </div>
  );
}

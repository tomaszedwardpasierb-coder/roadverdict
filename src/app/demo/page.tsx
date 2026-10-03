// Place at: src/app/demo/page.tsx
//
// The public sample-bike demo - see DemoExperience.tsx. Prerendered and
// static: the sample is made-up data in code, and the two live steps (read a
// receipt, ask a question) go to /api/demo/*, limited per visitor and per
// day. Kept out of search results for now (it's an interactive experience,
// not a page that answers a search); people reach it from the home page.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import { FunnelBeacon } from '@/components/FunnelBeacon';
import { DemoExperience } from './DemoExperience';

export const metadata: Metadata = {
  ...pageMetadata({
    title: 'Try RoadVerdict with a sample bike',
    description: 'Read a receipt with AI and ask a motorcycle logbook questions, on a sample bike with made-up data. No account needed.',
    path: '/demo',
  }),
  robots: { index: false, follow: true },
};

export default function DemoPage() {
  return (
    <>
      <DemoExperience />
      <FunnelBeacon step="demo" />
    </>
  );
}

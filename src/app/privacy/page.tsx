// Place at: src/app/privacy/page.tsx
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import { PrivacyContent } from './PrivacyContent';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy Policy',
  description:
    'How RoadVerdict collects, uses, and protects data across our free motorcycle tools, tracker, and account features.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return <PrivacyContent />;
}

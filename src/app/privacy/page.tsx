// Place at: src/app/privacy/page.tsx
import type { Metadata } from 'next';
import { PrivacyContent } from './PrivacyContent';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How RoadVerdict collects, uses, and protects data across our free motorcycle tools, tracker, and account features.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}

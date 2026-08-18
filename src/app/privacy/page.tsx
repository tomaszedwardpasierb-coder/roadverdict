// Place at: src/app/privacy/page.tsx
import type { Metadata } from 'next';
import { PrivacyContent } from './PrivacyContent';

export const metadata: Metadata = {
  title: 'Privacy Policy | RoadVerdict',
  description: 'How RoadVerdict collects, uses, and protects data across our free motorcycle tools, tracker, and account features.',
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}

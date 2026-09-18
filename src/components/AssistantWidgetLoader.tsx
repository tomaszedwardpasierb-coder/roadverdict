// Place at: src/components/AssistantWidgetLoader.tsx
'use client';

import dynamic from 'next/dynamic';

// AssistantWidget (chat UI, speech recognition glue, 5 proposal-card
// components, lucide icons) is mounted globally in the root layout, so
// every visitor on every page - including anonymous marketing/login/guide
// pages that never touch it - paid for it in the main bundle and in the
// server-rendered HTML. `ssr: false` drops it from SSR output and code-
// splits it into its own chunk that loads after the critical page content,
// instead of blocking/bloating the initial page load. Needs its own
// 'use client' wrapper file since `next/dynamic(..., { ssr: false })` isn't
// allowed directly inside a Server Component (layout.tsx).
const AssistantWidget = dynamic(
  () => import('./AssistantWidget').then((mod) => mod.AssistantWidget),
  { ssr: false }
);

export function AssistantWidgetLoader() {
  return <AssistantWidget />;
}

// Place at: src/app/tomasz/login/layout.tsx
//
// Same reason as src/app/login/layout.tsx: the admin login page must stay
// on the strict per-request CSP nonce, which needs per-request rendering.
export const dynamic = 'force-dynamic';

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

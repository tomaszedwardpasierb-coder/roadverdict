// Place at: src/app/tomasz/login/page.tsx
import type { Metadata } from 'next';
import { AdminLoginForm } from './AdminLoginForm';

export const metadata: Metadata = {
  title: 'Admin sign-in',
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <div className="hero">
      <h1>Admin sign-in</h1>
      <AdminLoginForm />
    </div>
  );
}

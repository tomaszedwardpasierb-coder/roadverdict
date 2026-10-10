// Place at: src/app/login/page.tsx
//
// Someone already signed in never sees the email form: they go straight on
// to where the link was taking them ("Save to my garage" on the MOT check,
// "Start your logbook" on a guide), or to the dashboard. They used to be
// asked for their email again, and were counted in the sign-up funnel as a
// sign-in page visitor who left without asking for a link.
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getSafeRedirectPath } from '@/lib/auth/safeRedirect';
import { LoginScreen } from './LoginScreen';

export default async function LoginPage(props: { searchParams: Promise<{ redirect?: string | string[] }> }) {
  if (await getSession()) {
    const { redirect: to } = await props.searchParams;
    redirect(getSafeRedirectPath(to) ?? '/dashboard');
  }
  return <LoginScreen />;
}

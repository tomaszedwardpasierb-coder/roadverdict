// Place at: src/lib/app/accountData.ts
//
// The Android app's Settings screen: the same account details the web's
// SettingsTab starts from (see dashboard/page.tsx) - the display name,
// whether two-factor sign-in is on, and when a requested deletion will
// happen - and whether the account is Pro, for the app's Vault, which needs
// both Pro and two-factor. Changes go through the website's own account routes.
import { getUserDoc } from "@/lib/tracker/userDoc";
import { getPendingDeletionInfo } from "@/lib/tracker/userAccount";
import { isTwoFactorEnabled } from "@/lib/auth/twoFactor";
import { isPro } from "@/lib/subscriptions";
import { isEligibleForProTrial } from "@/lib/payments/proTrial";
import { PRO_TRIAL_DAYS } from "@/lib/proPlan";

export type AccountSettings = {
  email: string;
  displayName: string;
  twoFactorEnabled: boolean;
  isPro: boolean;
  // The free Pro trial this account would get on the website (0 = none).
  proTrialDays: number;
  pendingDeletion: { daysRemaining: number; deleteAfterLabel: string } | null;
};

export async function getAccountSettings(email: string): Promise<AccountSettings> {
  const [user, twoFactorEnabled, pro] = await Promise.all([getUserDoc(email), isTwoFactorEnabled(email), isPro(email).catch(() => false)]);
  return {
    email,
    displayName: user?.displayName ?? "",
    twoFactorEnabled,
    isPro: pro,
    proTrialDays: !pro && isEligibleForProTrial(user) ? PRO_TRIAL_DAYS : 0,
    pendingDeletion: getPendingDeletionInfo(user),
  };
}

// Place at: src/lib/app/accountData.ts
//
// The Android app's Settings screen: the same account details the web's
// SettingsTab starts from (see dashboard/page.tsx) - the display name,
// whether two-factor sign-in is on, and when a requested deletion will
// happen. Changes go through the website's own account routes.
import { getUserDoc } from "@/lib/tracker/userDoc";
import { getPendingDeletionInfo } from "@/lib/tracker/userAccount";
import { isTwoFactorEnabled } from "@/lib/auth/twoFactor";

export type AccountSettings = {
  email: string;
  displayName: string;
  twoFactorEnabled: boolean;
  pendingDeletion: { daysRemaining: number; deleteAfterLabel: string } | null;
};

export async function getAccountSettings(email: string): Promise<AccountSettings> {
  const [user, twoFactorEnabled] = await Promise.all([getUserDoc(email), isTwoFactorEnabled(email)]);
  return {
    email,
    displayName: user?.displayName ?? "",
    twoFactorEnabled,
    pendingDeletion: getPendingDeletionInfo(user),
  };
}

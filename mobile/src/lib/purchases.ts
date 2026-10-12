// Pro bought inside the app, through RevenueCat (Google Play now, the App
// Store later). The server decides whether it's switched on and which key
// and customer id to use (/api/app/purchases); RevenueCat runs the store's
// own payment sheet; afterwards the server re-reads the purchase from
// RevenueCat so Pro switches on at once (lib/payments/storePro.ts on the
// web side).
//
// The native module only exists in builds that include it, so it's loaded
// lazily: without it (Expo Go, older builds) in-app buying is simply off
// and the screens fall back to the plain "on our website" wording.
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type PurchasesModule = typeof import('react-native-purchases');
type PurchasesPackage = import('react-native-purchases').PurchasesPackage;

export type ProSource = 'store' | 'web' | null;

export type PurchasesConfig = {
  enabled: boolean;
  apiKey?: string;
  appUserId?: string;
  isPro: boolean;
  proSource: ProSource;
  features?: string[];
};

let loaded: PurchasesModule | null | undefined;
function purchasesModule(): PurchasesModule | null {
  if (loaded !== undefined) return loaded;
  try {
    loaded = require('react-native-purchases') as PurchasesModule;
  } catch {
    loaded = null;
  }
  return loaded;
}

let configuredFor: string | null = null;

function configure(config: PurchasesConfig): PurchasesModule | null {
  const mod = purchasesModule();
  if (!mod || !config.enabled || !config.apiKey || !config.appUserId) return null;
  if (configuredFor !== config.appUserId) {
    mod.default.configure({ apiKey: config.apiKey, appUserID: config.appUserId });
    configuredFor = config.appUserId;
  }
  return mod;
}

// Whether in-app buying is on for this account and this build, and the
// account's Pro status - shared by the Upgrade screen and the hints that
// lead to it.
export function usePurchases() {
  const { token } = useAuth();
  const [config, setConfig] = useState<PurchasesConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const result = await apiFetch<PurchasesConfig>(`/api/app/purchases?platform=${platform}`, { token });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    // Off on this build when the module isn't there, whatever the server says.
    setConfig({ ...result.data, enabled: result.data.enabled && !!purchasesModule() });
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return { config, error, reload: load, canBuy: !!config?.enabled && !config.isPro };
}

export type ProPlanOption = { id: string; title: string; price: string; period: string; pkg: PurchasesPackage };

// The plans on sale, from the store itself, so prices are always the
// store's own (in pounds for UK accounts).
export async function loadPlans(config: PurchasesConfig): Promise<ProPlanOption[]> {
  const mod = configure(config);
  if (!mod) return [];
  const offerings = await mod.default.getOfferings();
  const pkgs = offerings.current?.availablePackages ?? [];
  const order = (p: PurchasesPackage) => (p.packageType === 'ANNUAL' ? 0 : p.packageType === 'MONTHLY' ? 1 : 2);
  return [...pkgs]
    .sort((a, b) => order(a) - order(b))
    .map((p) => ({
      id: p.identifier,
      title: p.packageType === 'ANNUAL' ? 'Yearly' : p.packageType === 'MONTHLY' ? 'Monthly' : p.product.title,
      price: p.product.priceString,
      period: p.packageType === 'ANNUAL' ? 'a year' : p.packageType === 'MONTHLY' ? 'a month' : '',
      pkg: p,
    }));
}

export type BuyResult = { kind: 'done'; isPro: boolean } | { kind: 'cancelled' } | { kind: 'error'; message: string };

async function syncWithServer(token: string | null): Promise<BuyResult> {
  const result = await apiFetch<{ isPro: boolean }>('/api/app/purchases', { method: 'POST', token });
  // The store has taken the payment either way; if our server can't confirm
  // yet, the webhook will - Pro then appears within a few minutes.
  return result.ok ? { kind: 'done', isPro: result.data.isPro } : { kind: 'done', isPro: false };
}

export async function buy(config: PurchasesConfig, option: ProPlanOption, token: string | null): Promise<BuyResult> {
  const mod = configure(config);
  if (!mod) return { kind: 'error', message: 'Buying in the app isn’t available right now.' };
  try {
    await mod.default.purchasePackage(option.pkg);
  } catch (err) {
    if ((err as { userCancelled?: boolean })?.userCancelled) return { kind: 'cancelled' };
    return { kind: 'error', message: 'The purchase didn’t go through. Please try again – if you were charged, tap Restore purchases.' };
  }
  return syncWithServer(token);
}

export async function restore(config: PurchasesConfig, token: string | null): Promise<BuyResult> {
  const mod = configure(config);
  if (!mod) return { kind: 'error', message: 'Restoring isn’t available right now.' };
  try {
    await mod.default.restorePurchases();
  } catch {
    return { kind: 'error', message: 'Couldn’t restore purchases just now. Please try again.' };
  }
  return syncWithServer(token);
}

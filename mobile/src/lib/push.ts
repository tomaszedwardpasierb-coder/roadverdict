// Push notifications: reminders that are due, and (later) approving a
// website sign-in. The phone registers its Expo push token with the server
// once someone is signed in, and removes it on sign-out (see auth.tsx), so
// a shared or sold phone stops getting the last owner's notifications.
// A tap opens the screen the notification names in its data.url.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import { apiFetch } from '@/lib/api';

const PUSH_TOKEN_KEY = 'rv.pushToken';

// Shown even while the app is open - a reminder is worth seeing either way.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

async function ensureChannel() {
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Reminders and alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#EE9A2E',
  });
}

// Asks once (from the first-open permission requests); after that, quietly
// registers whenever the app starts, in case the token changed.
export async function registerForPush(token: string | null, ask: boolean): Promise<void> {
  if (!token || !Device.isDevice) return;
  try {
    await ensureChannel();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const deviceName = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ');
    const result = await apiFetch('/api/app/push-token', { method: 'POST', token, body: { token: pushToken, deviceName } });
    if (result.ok) await SecureStore.setItemAsync(PUSH_TOKEN_KEY, pushToken);
  } catch {
    // No push this time (no Google Play services, no connection) - the
    // next start tries again, and nothing else depends on it.
  }
}

// Called by sign-out, before the session ends.
export async function unregisterPush(token: string | null): Promise<void> {
  const pushToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY).catch(() => null);
  if (!pushToken) return;
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY).catch(() => {});
  if (token) await apiFetch('/api/app/push-token', { method: 'DELETE', token, body: { token: pushToken } });
}

function openFrom(response: Notifications.NotificationResponse | null) {
  const url = response?.notification.request.content.data?.url;
  // Only the app's own screens - never anything a payload could point elsewhere.
  if (typeof url === 'string' && /^\/[a-z0-9-/]*$/i.test(url)) router.push(url as never);
}

// Opens the screen a tapped notification names - including one tapped
// while the app was closed. Returns the cleanup.
export function listenForTaps(): () => void {
  Notifications.getLastNotificationResponseAsync().then(openFrom).catch(() => {});
  const subscription = Notifications.addNotificationResponseReceivedListener(openFrom);
  return () => subscription.remove();
}

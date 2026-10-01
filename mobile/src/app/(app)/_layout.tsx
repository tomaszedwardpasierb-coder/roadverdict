import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { View } from 'react-native';

import { AppLockScreen } from '@/components/app-lock';
import { Brand } from '@/constants/brand';
import { AppLockProvider, useAppLock } from '@/lib/app-lock';
import { useAuth } from '@/lib/auth';
import { listenForTaps, registerForPush } from '@/lib/push';
import { requestMicrophone } from '@/lib/use-dictation';
import { VehicleProvider } from '@/lib/vehicle';

// Asked once, the first time someone is signed in: the camera (receipts,
// the Vault), the microphone (speaking to the assistant) and notifications
// (reminders). Android shows its own allow/deny dialogs; a "deny" for the
// camera or microphone is asked again in context, the first time it's used.
const PERMISSIONS_ASKED_KEY = 'rv.permissionsAsked';

async function firstOpenPermissions(token: string | null) {
  let firstTime = false;
  try {
    firstTime = !(await SecureStore.getItemAsync(PERMISSIONS_ASKED_KEY));
    if (firstTime) await SecureStore.setItemAsync(PERMISSIONS_ASKED_KEY, '1');
  } catch {
    firstTime = false;
  }
  if (firstTime) {
    await ImagePicker.requestCameraPermissionsAsync().catch(() => {});
    await requestMicrophone();
  }
  // Every start: registers for push (asking only the first time), so a
  // changed token is always the one the server has.
  await registerForPush(token, firstTime);
}

// Signed-in part of the app: the five tabs, with the ⊕ add sheet
// presented over whichever tab it was opened from - behind the app lock,
// when it's on.
export default function AppLayout() {
  return (
    <AppLockProvider>
      <SignedIn />
    </AppLockProvider>
  );
}

function SignedIn() {
  const { locked } = useAppLock();
  const { token } = useAuth();

  useEffect(() => {
    firstOpenPermissions(token);
  }, [token]);

  useEffect(() => listenForTaps(), []);

  // Until the saved lock setting is read, show nothing - never a flash of
  // the account before the lock goes up.
  if (locked === null) return <View style={{ flex: 1, backgroundColor: Brand.asphalt }} />;

  return (
    <VehicleProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Brand.paper } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add"
          options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
        />
      </Stack>
      {locked ? <AppLockScreen /> : null}
    </VehicleProvider>
  );
}

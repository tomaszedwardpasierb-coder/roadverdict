import { Stack } from 'expo-router';

import { Brand } from '@/constants/brand';
import { VehicleProvider } from '@/lib/vehicle';

// Signed-in part of the app: the five tabs, with the ⊕ add sheet
// presented over whichever tab it was opened from.
export default function AppLayout() {
  return (
    <VehicleProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Brand.paper } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add"
          options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
        />
      </Stack>
    </VehicleProvider>
  );
}

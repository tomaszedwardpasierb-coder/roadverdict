import { router, Tabs } from 'expo-router';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Brand } from '@/constants/brand';

function tabIcon(name: IconName) {
  function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} size={24} color={color} />;
  }
  return TabIcon;
}

// The ⊕ in the middle isn't a real tab - it opens the add sheet over
// whatever tab is showing, so tapping it never navigates away.
function AddButton() {
  return (
    <View style={styles.addSlot}>
      <Pressable
        onPress={() => router.push('/add')}
        accessibilityRole="button"
        accessibilityLabel="Add to logbook"
        style={({ pressed }) => [styles.addButton, pressed && styles.addPressed]}>
        <Icon name="plus" size={30} color={Brand.asphalt} strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Brand.ink,
        tabBarInactiveTintColor: Brand.muted,
        tabBarLabelStyle: styles.label,
        tabBarStyle: [styles.bar, { height: 64 + insets.bottom, paddingBottom: insets.bottom + 6 }],
        sceneStyle: { backgroundColor: Brand.paper },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="logbook" options={{ title: 'Logbook', tabBarIcon: tabIcon('logbook') }} />
      <Tabs.Screen name="new" options={{ title: 'Add', tabBarButton: () => <AddButton /> }} />
      <Tabs.Screen name="reminders" options={{ title: 'Reminders', tabBarIcon: tabIcon('bell') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('more') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: Brand.paperRaised, borderTopColor: Brand.line, paddingTop: 6 },
  label: { fontSize: 12, fontWeight: '600' },
  addSlot: { flex: 1, alignItems: 'center' },
  addButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginTop: -22,
    backgroundColor: Brand.amber,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: Brand.paperRaised,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  addPressed: { opacity: 0.85 },
});

// iPhone's number pads have no Done or return key, so a number field could
// only be closed by tapping somewhere else. Every number field points at
// this bar (inputAccessoryViewID); on iPhone it sits above the keyboard with
// a Done button. Android's number pads have their own key, and Android
// ignores the prop, so the bar only exists on iOS. Rendered once, in the
// root layout.
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View, type KeyboardTypeOptions } from 'react-native';

import { Brand } from '@/constants/brand';

export const KEYBOARD_DONE_ID = 'rv-keyboard-done';

// For fields whose keyboard type is a prop: the bar only for number pads.
export function doneBarFor(keyboardType: KeyboardTypeOptions | undefined): string | undefined {
  return keyboardType === 'number-pad' || keyboardType === 'decimal-pad' ? KEYBOARD_DONE_ID : undefined;
}

export function KeyboardDoneBar() {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View style={styles.bar}>
        <Pressable onPress={() => Keyboard.dismiss()} accessibilityRole="button" hitSlop={10} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D6D3CB',
    backgroundColor: '#F7F5F0',
  },
  pressed: { opacity: 0.6 },
  done: { fontSize: 16, fontWeight: '700', color: Brand.amberInk },
});

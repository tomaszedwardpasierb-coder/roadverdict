// A tappable date field that opens the calendar each phone expects.
// Android: the system calendar dialog (DateTimePickerAndroid). iPhone: that
// Android-only call does nothing there, so the same tap opens Apple's own
// calendar in a small sheet, with Done to close it. The look of the field
// itself (style, children) stays the screen's own.
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Brand } from '@/constants/brand';

type Props = {
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

export function DatePressable({ value, onChange, minimumDate, maximumDate, style, children }: Props) {
  const [showing, setShowing] = useState(false);

  function open() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate,
        maximumDate,
        onValueChange: (_event, picked) => {
          if (picked) onChange(picked);
        },
      });
    } else {
      setShowing(true);
    }
  }

  return (
    <>
      <Pressable onPress={open} accessibilityRole="button" accessibilityHint="Opens a calendar" style={style}>
        {children}
      </Pressable>
      {Platform.OS !== 'android' ? (
        <Modal visible={showing} transparent animationType="fade" onRequestClose={() => setShowing(false)}>
          <Pressable style={styles.backdrop} onPress={() => setShowing(false)} accessibilityLabel="Close the calendar">
            {/* Taps inside the sheet stay in the sheet. */}
            <View style={styles.sheet} onStartShouldSetResponder={() => true}>
              <DateTimePicker
                value={value}
                mode="date"
                display="inline"
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                themeVariant="light"
                accentColor={Brand.amberInk}
                onValueChange={(_event, picked) => onChange(picked)}
              />
              <Pressable
                onPress={() => setShowing(false)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.done, pressed && styles.pressed]}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(23, 24, 27, 0.45)' },
  sheet: { borderRadius: 16, padding: 12, gap: 8, backgroundColor: '#FFFFFF' },
  done: { alignItems: 'center', borderRadius: 12, paddingVertical: 12, backgroundColor: Brand.amber },
  pressed: { opacity: 0.85 },
  doneText: { fontSize: 16, fontWeight: '700', color: Brand.asphalt },
});

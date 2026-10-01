// Six boxes drawn over one real, transparent TextInput - the input keeps
// the platform's own number keyboard, paste, autofill and screen-reader
// behaviour, and the boxes are purely visual.
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Brand } from '@/constants/brand';

const LENGTH = 6;

export function CodeInput({
  value,
  onChange,
  onComplete,
  hasError,
  accessibilityLabel,
  light,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  hasError?: boolean;
  accessibilityLabel: string;
  // For the signed-in (light) screens; the sign-in screens are dark.
  light?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);

  function handleChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, LENGTH);
    onChange(digits);
    if (digits.length === LENGTH) onComplete(digits);
  }

  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessible={false} style={styles.row}>
      {Array.from({ length: LENGTH }, (_, i) => {
        const filled = i < value.length;
        const active = i === Math.min(value.length, LENGTH - 1);
        return (
          <View
            key={i}
            style={[styles.box, light && styles.boxLight, active && styles.boxActive, hasError && (light ? styles.boxErrorLight : styles.boxError)]}
            importantForAccessibility="no-hide-descendants">
            <Text style={[styles.digit, light && styles.digitLight]}>{filled ? value[i] : ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={LENGTH}
        autoFocus
        caretHidden
        accessibilityLabel={accessibilityLabel}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  box: {
    flex: 1,
    height: 64,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.asphaltLine,
    backgroundColor: Brand.asphaltRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: Brand.amber },
  boxError: { borderColor: Brand.dangerOnDark },
  digit: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
  boxLight: { borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  boxErrorLight: { borderColor: Brand.danger },
  digitLight: { color: Brand.ink },
  hiddenInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.01, color: 'transparent' },
});

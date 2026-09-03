import React, { useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

interface CodeInputProps {
  /** The code so far, always upper-case and at most `length` characters. */
  value: string;
  onChangeText: (value: string) => void;
  /** Fired the moment the last box is filled, so the code submits itself. */
  onComplete?: (value: string) => void;
  length?: number;
  editable?: boolean;
  autoFocus?: boolean;
}

/** Sign-in codes never contain these, so a stray keystroke is simply ignored. */
const ALLOWED = /[^A-Z0-9]/g;

function clean(raw: string, length: number): string {
  return raw.toUpperCase().replace(ALLOWED, '').slice(0, length);
}

/**
 * The row of single-character boxes a sign-in code is typed into.
 *
 * It behaves like one input rather than six: the boxes share a single value,
 * typing walks forward and backspace walks back. Android's autofill can drop
 * the whole code into the first box, so what arrives at any box is spread
 * across the ones that follow rather than truncated.
 */
export default function CodeInput({
  value,
  onChangeText,
  onComplete,
  length = 6,
  editable = true,
  autoFocus = false,
}: CodeInputProps) {
  const boxes = useRef<Array<TextInput | null>>([]);

  const focus = (index: number) => {
    boxes.current[Math.max(0, Math.min(length - 1, index))]?.focus();
  };

  const commit = (next: string) => {
    onChangeText(next);
    if (next.length === length) onComplete?.(next);
  };

  const handleChange = (index: number, raw: string) => {
    // React Native hands back the whole box contents, which for a box that
    // already held a character is the old one plus the new. Taking only what
    // is new keeps typing over a filled box replacing rather than appending.
    const typed = clean(raw, length).slice(value[index] ? 1 : 0);
    if (!typed) return;
    const next = clean(value.slice(0, index) + typed, length);
    commit(next);
    focus(index + typed.length);
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key !== 'Backspace') return;
    // Delete this box if it holds something, otherwise the one before it —
    // which is what makes repeated backspace clear the row.
    const target = value[index] ? index : index - 1;
    if (target < 0) return;
    onChangeText(value.slice(0, target) + value.slice(target + 1));
    focus(target);
  };

  return (
    <View style={styles.row}>
      {Array.from({ length }, (_, index) => (
        <TextInput
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          style={[styles.box, !editable && styles.boxDisabled]}
          value={value[index] ?? ''}
          onChangeText={(text) => handleChange(index, text)}
          onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
          editable={editable}
          autoFocus={autoFocus && index === 0}
          autoCapitalize="characters"
          autoCorrect={false}
          // Lets Android offer the code straight from the mail notification.
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          keyboardType="default"
          returnKeyType="done"
          selectTextOnFocus
          accessibilityLabel={`Character ${index + 1} of ${length}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
  },
  box: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d5d0c8',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    color: '#222',
    padding: 0,
  },
  boxDisabled: {
    opacity: 0.5,
  },
});

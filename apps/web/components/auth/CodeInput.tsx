'use client';

import { useEffect, useRef } from 'react';

interface CodeInputProps {
  /** The code so far, always upper-case and at most `length` characters. */
  value: string;
  onChange: (value: string) => void;
  /** Fired once the last box is filled, so the form can submit itself. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
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
 * typing walks forward, backspace walks back, and pasting a whole code fills
 * the row. The caret is kept at the first empty box so tapping anywhere in
 * the row lands somewhere useful — on a phone the row is wide and thumbs are
 * not precise.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  autoFocus = false,
  'aria-label': ariaLabel = 'Sign-in code',
}: CodeInputProps) {
  const boxes = useRef<Array<HTMLInputElement | null>>([]);

  /**
   * Put the caret in the first box.
   *
   * Not the autoFocus attribute: the row is mounted by a transition, so it
   * first renders `disabled` while the request that opened it is still in
   * flight — and a disabled input cannot take focus. Waiting for the boxes to
   * become usable is the whole point, and the ref keeps it to once, so later
   * re-enables (after a wrong code) do not yank the caret back.
   */
  const focused = useRef(false);
  useEffect(() => {
    if (!autoFocus || disabled || focused.current) return;
    focused.current = true;
    boxes.current[0]?.focus();
  }, [autoFocus, disabled]);

  // Only fire once per completed code, and never for a code being edited.
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (value.length !== length) {
      reported.current = null;
      return;
    }
    if (reported.current === value) return;
    reported.current = value;
    onComplete?.(value);
  }, [value, length, onComplete]);

  const focus = (index: number) => {
    boxes.current[Math.max(0, Math.min(length - 1, index))]?.focus();
  };

  const handleChange = (index: number, raw: string) => {
    // A phone keyboard can deliver several characters at once, and so can a
    // paste, so treat whatever arrived as starting at this box.
    const typed = clean(raw, length);
    if (!typed) return;
    const next = clean(value.slice(0, index) + typed, length);
    onChange(next);
    focus(index + typed.length);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      // Delete this box if it holds something, otherwise the one before it —
      // which is what makes holding backspace clear the row.
      const target = value[index] ? index : index - 1;
      if (target < 0) return;
      onChange(value.slice(0, target) + value.slice(target + 1));
      focus(target);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focus(index - 1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focus(index + 1);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = clean(event.clipboardData.getData('text'), length);
    if (!pasted) return;
    onChange(pasted);
    focus(pasted.length);
  };

  return (
    <div
      className="flex gap-2 justify-between"
      role="group"
      aria-label={ariaLabel}
      onPaste={handlePaste}
    >
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          type="text"
          inputMode="text"
          // Lets iOS and Android offer the code straight from the SMS/mail
          // notification instead of making someone switch apps to read it.
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          // Not maxLength=1: a paste or a swipe keyboard can deliver more,
          // and handleChange spreads the extra across the boxes that follow.
          value={value[index] ?? ''}
          disabled={disabled}
          aria-label={`Character ${index + 1} of ${length}`}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
          className="w-full min-w-0 aspect-square text-center text-xl font-mono uppercase rounded-lg bg-shelvarr-bg border border-shelvarr-border text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
      ))}
    </div>
  );
}

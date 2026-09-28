'use client';

/**
 * The reader's display controls: theme, typeface, type size, line height,
 * margins, alignment, and the reading speed the time estimate is built on.
 *
 * Presentational on purpose — it owns no state and saves nothing. Every
 * control calls `onChange` with a patch and the reader decides what to do
 * with it, which is what lets the same panel be driven by preferences that
 * arrived from the server moments earlier.
 *
 * Colours come from the chosen reading theme rather than the app's dark
 * chrome, so choosing Sepia doesn't leave a slab of Shelvarr navy sitting
 * next to the page. The chrome stays sans-serif throughout; only the typeface
 * previews are allowed to show a serif, because that is the thing being
 * chosen.
 */

import type {
  ReaderPreferences,
  ReaderTheme,
  ReaderTextAlignment,
  ReaderThemePalette,
  NumericRange,
} from '@/lib/reader/preferences';
import {
  READER_PREFERENCE_RANGES,
  READER_THEMES,
  READER_THEME_LABELS,
  READER_THEME_PALETTES,
  READER_TYPEFACES,
  READER_TYPEFACE_LABELS,
  READER_TYPEFACE_STACKS,
  DEFAULT_READER_PREFERENCES,
  stepPreference,
} from '@/lib/reader/preferences';

interface ReaderSettingsPanelProps {
  preferences: ReaderPreferences;
  palette: ReaderThemePalette;
  onChange: (patch: Partial<ReaderPreferences>) => void;
}

/**
 * Listed here rather than only in the component that implements them,
 * because an unlisted keyboard shortcut is a keyboard shortcut nobody uses.
 */
const READER_SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ['→ / Page Down / Space', 'Forward'],
  ['← / Page Up / ⇧Space', 'Back'],
  ['B', 'Bookmark where you are'],
  ['F or /', 'Search this book'],
  ['D', 'These settings'],
  ['H', 'Hide or show the header'],
  ['Esc', 'Close the panel, then the book'],
];

const ALIGNMENT_LABELS: Record<ReaderTextAlignment, string> = {
  original: 'As published',
  left: 'Ragged right',
  justify: 'Justified',
};

export function ReaderSettingsPanel({ preferences, palette, onChange }: ReaderSettingsPanelProps) {
  const isDefault =
    (Object.keys(DEFAULT_READER_PREFERENCES) as Array<keyof ReaderPreferences>).every(
      (key) => preferences[key] === DEFAULT_READER_PREFERENCES[key]
    );

  return (
    <div className="space-y-6 text-sm" style={{ color: palette.chromeText }}>
      <Field label="Theme">
        <div className="grid grid-cols-3 gap-2">
          {READER_THEMES.map((theme) => (
            <ThemeSwatch
              key={theme}
              theme={theme}
              selected={preferences.theme === theme}
              palette={palette}
              onSelect={() => onChange({ theme })}
            />
          ))}
        </div>
      </Field>

      <Field label="Typeface">
        <div className="grid grid-cols-2 gap-2">
          {READER_TYPEFACES.map((typeface) => (
            <button
              key={typeface}
              type="button"
              onClick={() => onChange({ typeface })}
              aria-pressed={preferences.typeface === typeface}
              className="rounded px-3 py-2 text-left transition-colors"
              style={{
                border: `1px solid ${preferences.typeface === typeface ? palette.link : palette.border}`,
                background: preferences.typeface === typeface ? palette.background : 'transparent',
                // The one place a serif is allowed in the chrome: you have to
                // be able to see what you are picking.
                fontFamily: READER_TYPEFACE_STACKS[typeface] ?? 'inherit',
              }}
            >
              {READER_TYPEFACE_LABELS[typeface]}
            </button>
          ))}
        </div>
      </Field>

      <Stepper
        label="Text size"
        value={`${preferences.fontSizePercent}%`}
        range={READER_PREFERENCE_RANGES.fontSizePercent}
        current={preferences.fontSizePercent}
        palette={palette}
        onStep={(next) => onChange({ fontSizePercent: next })}
      />

      <Stepper
        label="Line height"
        value={preferences.lineHeight.toFixed(1)}
        range={READER_PREFERENCE_RANGES.lineHeight}
        current={preferences.lineHeight}
        palette={palette}
        onStep={(next) => onChange({ lineHeight: next })}
      />

      <Stepper
        label="Margins"
        value={`${preferences.marginPercent}%`}
        range={READER_PREFERENCE_RANGES.marginPercent}
        current={preferences.marginPercent}
        palette={palette}
        onStep={(next) => onChange({ marginPercent: next })}
      />

      <Field label="Alignment">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(ALIGNMENT_LABELS) as ReaderTextAlignment[]).map((textAlign) => (
            <button
              key={textAlign}
              type="button"
              onClick={() => onChange({ textAlign })}
              aria-pressed={preferences.textAlign === textAlign}
              className="rounded px-2 py-2 text-xs transition-colors"
              style={{
                border: `1px solid ${preferences.textAlign === textAlign ? palette.link : palette.border}`,
                background: preferences.textAlign === textAlign ? palette.background : 'transparent',
              }}
            >
              {ALIGNMENT_LABELS[textAlign]}
            </button>
          ))}
        </div>
      </Field>

      <Stepper
        label="Reading speed"
        value={`${preferences.wordsPerMinute} wpm`}
        range={READER_PREFERENCE_RANGES.wordsPerMinute}
        current={preferences.wordsPerMinute}
        palette={palette}
        onStep={(next) => onChange({ wordsPerMinute: next })}
        hint="Only affects the “minutes left” estimate."
      />

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide opacity-60">Keyboard</p>
        <dl className="space-y-1 text-xs" style={{ color: palette.chromeMuted }}>
          {READER_SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="flex gap-2">
              <dt className="w-28 shrink-0 font-medium" style={{ color: palette.chromeText }}>
                {keys}
              </dt>
              <dd className="min-w-0">{what}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs" style={{ color: palette.chromeMuted }}>
          Saved to your account, not this browser.
        </p>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_READER_PREFERENCES, hideHeader: preferences.hideHeader })}
          disabled={isDefault}
          className="rounded px-2 py-1 text-xs transition-colors disabled:opacity-40"
          style={{ border: `1px solid ${palette.border}` }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide opacity-60">{label}</p>
      {children}
    </div>
  );
}

function ThemeSwatch({
  theme,
  selected,
  palette,
  onSelect,
}: {
  theme: ReaderTheme;
  selected: boolean;
  palette: ReaderThemePalette;
  onSelect: () => void;
}) {
  const preview = READER_THEME_PALETTES[theme];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="rounded px-2 py-3 text-xs transition-colors"
      style={{
        background: preview.background,
        color: preview.text,
        border: `2px solid ${selected ? palette.link : preview.border}`,
      }}
    >
      {READER_THEME_LABELS[theme]}
    </button>
  );
}

function Stepper({
  label,
  value,
  range,
  current,
  palette,
  onStep,
  hint,
}: {
  label: string;
  value: string;
  range: NumericRange;
  current: number;
  palette: ReaderThemePalette;
  onStep: (next: number) => void;
  hint?: string;
}) {
  // Buttons rather than a range input: the steps are coarse and named, and a
  // slider in a book reader is a thing you overshoot and then fight.
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wide opacity-60">{label}</p>
        <p className="text-xs tabular-nums" style={{ color: palette.chromeMuted }}>
          {value}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onStep(stepPreference(current, range, -1))}
          disabled={current <= range.min}
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="flex-1 rounded py-2 text-base leading-none transition-colors disabled:opacity-30"
          style={{ border: `1px solid ${palette.border}` }}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => onStep(stepPreference(current, range, 1))}
          disabled={current >= range.max}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="flex-1 rounded py-2 text-base leading-none transition-colors disabled:opacity-30"
          style={{ border: `1px solid ${palette.border}` }}
        >
          +
        </button>
      </div>
      {hint && (
        <p className="mt-1 text-xs" style={{ color: palette.chromeMuted }}>
          {hint}
        </p>
      )}
    </div>
  );
}

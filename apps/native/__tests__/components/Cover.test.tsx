import React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, type TextStyle } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { render, fireEvent, act } from '@testing-library/react-native';
import Cover, {
  COVER_ASPECT,
  CoverTrigger,
  coverGeometry,
  hsl,
  hueFor,
  spinePose,
} from '../../src/components/Cover';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';

jest.mock('../../src/hooks/useReducedMotion');

const mockUseReducedMotion = useReducedMotion as jest.Mock;
// The cover's drawing is decorative and hidden from screen readers, so tests
// that look at it have to ask for hidden elements too.
const hidden = { includeHiddenElements: true };

const sizeOf = (element: ReactTestInstance): TextStyle => StyleSheet.flatten(element.props.style);

describe('Cover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseReducedMotion.mockReturnValue(false);
  });

  describe('a book', () => {
    it('draws the image with a spine, and no pages', () => {
      const { getByTestId, queryByTestId } = render(
        <Cover uri="http://cover/1" headers={{ Authorization: 'Bearer t' }} title="Dune" author="Frank Herbert" />
      );

      expect(getByTestId('cover-image').props.source).toEqual({
        uri: 'http://cover/1',
        headers: { Authorization: 'Bearer t' },
      });
      expect(getByTestId('cover-spine', hidden)).toBeTruthy();
      expect(queryByTestId('cover-pages', hidden)).toBeNull();
      expect(queryByTestId('cover-plain', hidden)).toBeNull();
    });

    it('is two by three, as on the web', () => {
      const { getByTestId } = render(<Cover uri="http://cover/1" title="Dune" width={120} />);
      expect(sizeOf(getByTestId('cover'))).toMatchObject({ width: 120, height: 180 });
    });

    it('carries its title down the spine, out of the way of screen readers', () => {
      const { getByText, queryByText } = render(<Cover uri="http://cover/1" title="Dune" />);
      expect(queryByText('Dune')).toBeNull();
      expect(getByText('Dune', hidden)).toBeTruthy();
    });
  });

  describe('a comic', () => {
    it('draws a block of pages and no spine', () => {
      const { getByTestId, queryByTestId } = render(
        <Cover variant="comic" uri="http://cover/2" title="Saga" />
      );
      expect(getByTestId('cover-pages', hidden)).toBeTruthy();
      expect(queryByTestId('cover-spine', hidden)).toBeNull();
    });

    it('draws a sliver of its sheets at rest', () => {
      const { getByTestId } = render(<Cover variant="comic" uri="http://cover/2" title="Saga" width={100} />);
      // The deepest hairline stands 1.45% of the width out at the fore-edge.
      expect(sizeOf(getByTestId('cover-sheet-8', hidden)).transform).toEqual([{ translateX: 1.45 }, { translateY: 0.49 }]);
    });

    it("is a US comic's shape, a touch narrower than a book", () => {
      const { getByTestId } = render(<Cover variant="comic" uri="http://cover/2" title="Saga" width={106} />);
      expect(sizeOf(getByTestId('cover'))).toMatchObject({ width: 106, height: 164 });
      expect(COVER_ASPECT.comic).toBeLessThan(COVER_ASPECT.book);
    });
  });

  describe('without an image', () => {
    it('draws a typographic book cover with the title and author', () => {
      const { getByTestId, queryByTestId } = render(<Cover title="Dune" author="Frank Herbert" />);
      const plain = getByTestId('cover-plain', hidden);

      expect(queryByTestId('cover-image')).toBeNull();
      expect(plain).toHaveTextContent('DuneFrank Herbert');
      // Tinted from the title, and the same tint every time.
      expect(sizeOf(plain).backgroundColor).toBe(hsl(hueFor('Dune'), 9, 82));
    });

    it('leaves the author off when there is none', () => {
      const { getByTestId } = render(<Cover title="Dune" />);
      expect(getByTestId('cover-plain', hidden)).toHaveTextContent('Dune');
    });

    it('draws a comic as a bold masthead on a coloured ground', () => {
      const { getByTestId, getAllByText } = render(
        <Cover variant="comic" uri={null} title="Saga" author="Image · 2012" />
      );
      const plain = getByTestId('cover-plain', hidden);
      expect(sizeOf(plain).backgroundColor).toBe(hsl(hueFor('Saga'), 60, 42));

      const masthead = getAllByText('Saga', hidden)[0];
      expect(sizeOf(masthead)).toMatchObject({ fontWeight: '800', textTransform: 'uppercase' });
    });

    it('falls back to it when the image fails to load', () => {
      const { getByTestId, queryByTestId } = render(<Cover uri="http://cover/broken" title="Dune" />);

      fireEvent(getByTestId('cover-image'), 'error');

      expect(queryByTestId('cover-image')).toBeNull();
      expect(getByTestId('cover-plain', hidden)).toBeTruthy();
    });

    it('tries again when given a different image', () => {
      const { getByTestId, rerender } = render(<Cover uri="http://cover/broken" title="Dune" />);
      fireEvent(getByTestId('cover-image'), 'error');

      rerender(<Cover uri="http://cover/fixed" title="Dune" />);
      expect(getByTestId('cover-image').props.source.uri).toBe('http://cover/fixed');
    });
  });

  describe('badges and controls', () => {
    it('draws badges on the cover, where screen readers can find them', () => {
      const { getByText, getByLabelText } = render(
        <Cover variant="comic" uri="http://cover/2" title="Saga">
          <Text accessibilityLabel="Read">✓</Text>
          <Text>4/10</Text>
        </Cover>
      );
      expect(getByLabelText('Read')).toBeTruthy();
      expect(getByText('4/10')).toBeTruthy();
    });

    it('lays controls flat over the cover', () => {
      const onRemove = jest.fn();
      const { getByLabelText } = render(
        <Cover
          uri="http://cover/1"
          title="Dune"
          overlay={
            <TouchableOpacity accessibilityLabel="Remove from Next Up" onPress={onRemove}>
              <Text>×</Text>
            </TouchableOpacity>
          }
        />
      );
      fireEvent.press(getByLabelText('Remove from Next Up'));
      expect(onRemove).toHaveBeenCalled();
    });
  });

  describe('sizing', () => {
    it('fills the width it is given, and sizes its parts to it', () => {
      const { getByTestId } = render(<Cover uri="http://cover/1" title="Dune" />);
      const root = getByTestId('cover');
      expect(sizeOf(root)).toMatchObject({ width: '100%', aspectRatio: 2 / 3 });

      fireEvent(root, 'layout', { nativeEvent: { layout: { width: 300, height: 450 } } });
      // A book is 8% of its width deep.
      expect(sizeOf(getByTestId('cover-spine', hidden)).width).toBe(24);

      // Nothing to redraw for a sub-pixel wobble, or a zero-width first pass.
      fireEvent(root, 'layout', { nativeEvent: { layout: { width: 300.2, height: 450 } } });
      fireEvent(root, 'layout', { nativeEvent: { layout: { width: 0, height: 0 } } });
      expect(sizeOf(getByTestId('cover-spine', hidden)).width).toBe(24);
    });

    it('keeps the proportions of the web at any size', () => {
      const small = coverGeometry(100, 'book');
      const large = coverGeometry(300, 'book');
      expect(large.depth / large.width).toBeCloseTo(small.depth / small.width);
      expect(large.perspective).toBe(1800);
      expect(coverGeometry(100, 'comic').depth).toBeCloseTo(0.8);
    });
  });
});

describe('spinePose', () => {
  const g = coverGeometry(200, 'book');

  it('holds the spine edge-on while the book faces forward', () => {
    expect(spinePose(g, 0)).toEqual({ translateX: 0, scale: expect.any(Number), turn: -90 });
  });

  it("opens the spine to the angle the board's edge leaves it", () => {
    const pose = spinePose(g, 24);
    expect(pose.turn).toBe(-66);
    // The board's near edge comes forward, so the spine is drawn a little larger...
    expect(pose.scale).toBeGreaterThan(1);
    // ...and moved in to meet the hinge, which has swung towards the middle.
    expect(pose.translateX).toBeGreaterThan(0);
  });
});

describe('colour', () => {
  it('gives each title a steady hue', () => {
    expect(hueFor('')).toBe(0);
    expect(hueFor('Dune')).toBe(hueFor('Dune'));
    expect(hueFor('Dune')).not.toBe(hueFor('Saga'));
    expect(hueFor('A much longer title than most')).toBeLessThan(360);
  });

  it('turns HSL into hex', () => {
    expect(hsl(0, 100, 50)).toBe('#ff0000');
    expect(hsl(120, 100, 50)).toBe('#00ff00');
    expect(hsl(240, 100, 50)).toBe('#0000ff');
    expect(hsl(0, 0, 100)).toBe('#ffffff');
    // Past a full turn it wraps round.
    expect(hsl(480, 100, 50)).toBe(hsl(120, 100, 50));
  });
});

describe('CoverTrigger', () => {
  let spring: jest.SpyInstance;
  let timing: jest.SpyInstance;

  // Animations that finish at once, so a test can see where they end up.
  const finishAtOnce = ((value: Animated.Value, config: { toValue: number }) => ({
    start: () => value.setValue(config.toValue),
  })) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseReducedMotion.mockReturnValue(false);
    spring = jest.spyOn(Animated, 'spring');
    timing = jest.spyOn(Animated, 'timing');
  });

  afterEach(() => {
    spring.mockRestore();
    timing.mockRestore();
  });

  // The Pressable's own style callback, which is handed whether it is pressed.
  const pressableStyle = (root: ReactTestInstance) =>
    root.find((node) => typeof node.props.style === 'function').props.style as (state: { pressed: boolean }) => unknown;

  const renderCard = (props: Partial<React.ComponentProps<typeof CoverTrigger>> = {}, variant: 'book' | 'comic' = 'book') =>
    render(
      <CoverTrigger testID="card" {...props}>
        <Cover variant={variant} uri="http://cover/1" title="Dune" />
        <Text>Dune</Text>
      </CoverTrigger>
    );

  it("lifts the cover on press, on the web's curve, and springs it back on release", () => {
    const onPress = jest.fn();
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const { getByTestId } = renderCard({ onPress, onPressIn, onPressOut });
    const card = getByTestId('card');

    act(() => fireEvent(card, 'pressIn'));
    expect(timing).toHaveBeenCalledWith(
      expect.any(Animated.Value),
      expect.objectContaining({ toValue: 1, duration: 500, useNativeDriver: true })
    );
    // The comic gloss's sweep, which takes longer to cross.
    expect(timing).toHaveBeenCalledWith(expect.any(Animated.Value), expect.objectContaining({ duration: 1100 }));
    expect(onPressIn).toHaveBeenCalled();

    act(() => fireEvent(card, 'pressOut'));
    expect(spring).toHaveBeenLastCalledWith(
      expect.any(Animated.Value),
      expect.objectContaining({ toValue: 0, useNativeDriver: true })
    );
    expect(onPressOut).toHaveBeenCalled();

    fireEvent.press(card);
    expect(onPress).toHaveBeenCalled();
  });

  it('works without press-in or press-out handlers of its own', () => {
    const { getByTestId } = renderCard();
    act(() => fireEvent(getByTestId('card'), 'pressIn'));
    act(() => fireEvent(getByTestId('card'), 'pressOut'));
    expect(timing).toHaveBeenCalledTimes(2);
    expect(spring).toHaveBeenCalledTimes(1);
  });

  it('drives the covers inside it: the glow brightens as the cover lifts', () => {
    spring.mockImplementation(finishAtOnce);
    timing.mockImplementation(finishAtOnce);
    const { getByTestId } = renderCard();
    const glowOpacity = () => sizeOf(getByTestId('cover-glow', hidden)).opacity;

    expect(glowOpacity()).toBe(0.5);
    act(() => fireEvent(getByTestId('card'), 'pressIn'));
    expect(glowOpacity()).toBe(0.75);
    act(() => fireEvent(getByTestId('card'), 'pressOut'));
    expect(glowOpacity()).toBe(0.5);
  });

  it("fans a comic's sheets out and sweeps its gloss across once", () => {
    timing.mockImplementation(finishAtOnce);
    const { getByTestId } = renderCard({}, 'comic');
    const sweepX = () => (sizeOf(getByTestId('cover-sweep', hidden)).transform as { translateX: number }[])[0].translateX;
    const deepestSheet = () => sizeOf(getByTestId('cover-sheet-8', hidden)).transform;

    expect(sweepX()).toBeLessThan(0);
    act(() => fireEvent(getByTestId('card'), 'pressIn'));
    expect(sweepX()).toBe(0);
    // Out from 1.45% by 0.49% to 3.1% by 2.05% of the (estimated) width.
    const [{ translateX }, { translateY }] = deepestSheet() as [{ translateX: number }, { translateY: number }];
    expect(translateX).toBeCloseTo(3.1 * 1.5);
    expect(translateY).toBeCloseTo(2.05 * 1.5);
  });

  it('keeps covers still with reduced motion, and dims the card instead', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const onPress = jest.fn();
    const { getByTestId, UNSAFE_root } = renderCard({ onPress, style: { flex: 1 } });

    act(() => fireEvent(getByTestId('card'), 'pressIn'));
    act(() => fireEvent(getByTestId('card'), 'pressOut'));
    expect(timing).not.toHaveBeenCalled();
    expect(spring).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('card'));
    expect(onPress).toHaveBeenCalled();

    const style = pressableStyle(UNSAFE_root);
    expect(StyleSheet.flatten(style({ pressed: true }) as never)).toMatchObject({ flex: 1, opacity: 0.7 });
    expect(StyleSheet.flatten(style({ pressed: false }) as never)).toEqual({ flex: 1 });
  });

  it('does not dim a pressed card when the cover can lift instead', () => {
    const { UNSAFE_root } = renderCard({ style: { flex: 1 } });
    const style = pressableStyle(UNSAFE_root);
    expect(StyleSheet.flatten(style({ pressed: true }) as never)).toEqual({ flex: 1 });
  });
});

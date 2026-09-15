import React, { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { useReducedMotion } from '../hooks/useReducedMotion';

/*
 * Covers drawn as objects rather than flat rectangles, after the web app's
 * BookCover and app/covers.css.
 *
 * A book is a hardcover: the groove of its hinge, a hard drop shadow and a
 * blurred copy of the cover glowing underneath. Pressed, it lifts and turns a
 * little to show a spine carrying its title, and a sheen comes up. A comic is
 * a thin floppy, a touch narrower, with a fold at its staples and a sliver of
 * pages beneath. Pressed, it is picked up face-on: raised a little and a
 * degree off square, its pages fanning out and a gloss sweeping across it.
 *
 * Touch has no hover, so the web's hover is a press here: wrap a card in
 * CoverTrigger and pressing anywhere on it lifts the cover inside. Everything
 * is sized as a fraction of the cover's width (the web's container units), so
 * a grid thumbnail and a detail cover share one set of proportions.
 */

export type CoverVariant = 'book' | 'comic';

/** Width over height: a novel's 2:3, and a US comic's 6.625" by 10.25". */
export const COVER_ASPECT: Record<CoverVariant, number> = {
  book: 2 / 3,
  comic: 53 / 82,
};

/** How far a pressed book turns to show its spine. */
const BOOK_TURN_DEG = 24;
/** Drawn at this width until the cover has measured itself. */
const ESTIMATED_WIDTH = 150;
const PAGES = '#ebe5d6';

/**
 * A comic's sheets under its cover, from the top one down, each standing a
 * little further out at the fore-edge than the one above it (a saddle-stitched
 * comic's creep) with a hairline between each. Offsets are in hundredths of
 * the cover's width, at rest and pressed.
 */
const SHEETS: { colour: string; rest: [number, number]; pressed: [number, number] }[] = [
  { colour: '#f7f3ea', rest: [0.25, 0.08], pressed: [0.6, 0.4] },
  { colour: '#b9ae97', rest: [0.4, 0.13], pressed: [0.85, 0.55] },
  { colour: '#f0eadd', rest: [0.6, 0.2], pressed: [1.35, 0.9] },
  { colour: '#b3a790', rest: [0.75, 0.25], pressed: [1.6, 1.05] },
  { colour: '#e8e1d1', rest: [0.95, 0.32], pressed: [2.1, 1.4] },
  { colour: '#aa9e86', rest: [1.1, 0.37], pressed: [2.35, 1.55] },
  { colour: '#dfd7c4', rest: [1.3, 0.44], pressed: [2.85, 1.9] },
  { colour: '#9f937c', rest: [1.45, 0.49], pressed: [3.1, 2.05] },
];
// Drawn back to front.
const SHEETS_BACK_TO_FRONT = [...SHEETS].reverse();

/** The web's lift: 0.5s, cubic-bezier(0.2, 0.7, 0.3, 1). */
const LIFT_EASING = Easing.bezier(0.2, 0.7, 0.3, 1);
/** The comic gloss's sweep: 1.1s, cubic-bezier(0.3, 0.6, 0.3, 1). */
const SWEEP_EASING = Easing.bezier(0.3, 0.6, 0.3, 1);

// ---------------------------------------------------------------------------
// Press

interface CoverMotionValues {
  /** 0 at rest, 1 fully lifted. */
  lift: Animated.Value;
  /** The comic gloss's band of light, 0 off to the left, 1 off to the right. */
  sweep: Animated.Value;
}

const CoverMotionContext = createContext<CoverMotionValues | null>(null);

function useMotionValues(): CoverMotionValues {
  const lift = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  return useMemo(() => ({ lift, sweep }), [lift, sweep]);
}

type CoverTriggerProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * A Pressable whose press lifts every Cover inside it, the way hovering a
 * `book-cover-trigger` card lifts its cover on the web. With reduced motion
 * the covers hold still and the card dims on press instead.
 */
export function CoverTrigger({ style, children, onPressIn, onPressOut, ...rest }: CoverTriggerProps) {
  const reduceMotion = useReducedMotion();
  const values = useMotionValues();
  const { lift, sweep } = values;

  useEffect(() => {
    if (reduceMotion) {
      lift.stopAnimation();
      lift.setValue(0);
    }
  }, [reduceMotion, lift]);

  const pressIn = () => {
    if (reduceMotion) return;
    Animated.timing(lift, { toValue: 1, duration: 500, easing: LIFT_EASING, useNativeDriver: true }).start();
    sweep.setValue(0);
    Animated.timing(sweep, { toValue: 1, duration: 1100, easing: SWEEP_EASING, useNativeDriver: true }).start();
  };

  const pressOut = () => {
    if (reduceMotion) return;
    Animated.spring(lift, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
  };

  return (
    <CoverMotionContext.Provider value={values}>
      <Pressable
        {...rest}
        style={({ pressed }) => [style, reduceMotion && pressed && styles.pressedStill]}
        onPressIn={(event) => {
          pressIn();
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          pressOut();
          onPressOut?.(event);
        }}
      >
        {children}
      </Pressable>
    </CoverMotionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Cover

interface CoverProps {
  /** Without one, or once it fails to load, a typographic cover stands in. */
  uri?: string | null;
  /** Sent with the image request, for covers behind the API's auth. */
  headers?: Record<string, string>;
  title: string;
  /** Drawn under the title on a typographic cover: an author, or a comic's publisher. */
  author?: string | null;
  /** Comics are thinner, a little narrower, and have no spine to turn to. */
  variant?: CoverVariant;
  /** A fixed width. Without one the cover fills the width it is given. */
  width?: number;
  /** Badges and progress, drawn on the cover so they lift with it. */
  children?: ReactNode;
  /** Controls laid flat over the cover, which hold still while it lifts. */
  overlay?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Draw it before a card's title, in the same parent, so the title paints over
 * the cover's glow and shadow rather than under them.
 */
export default function Cover({
  uri,
  headers,
  title,
  author,
  variant = 'book',
  width,
  children,
  overlay,
  style,
  testID = 'cover',
}: CoverProps) {
  const stillValues = useMotionValues();
  const values = useContext(CoverMotionContext) ?? stillValues;

  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const [failedUri, setFailedUri] = useState<string | null>(null);

  const w = width ?? measuredWidth ?? ESTIMATED_WIDTH;
  const g = useMemo(() => coverGeometry(w, variant), [w, variant]);
  const motion = useMemo(() => coverMotion(values, g), [values, g]);

  const image = uri && uri !== failedUri ? uri : null;
  const source = image ? { uri: image, headers } : null;
  const hue = hueFor(title);
  const isBook = variant === 'book';

  const onLayout =
    width == null
      ? (event: LayoutChangeEvent) => {
          const next = event.nativeEvent.layout.width;
          if (next > 0 && Math.abs(next - (measuredWidth ?? 0)) > 0.5) setMeasuredWidth(next);
        }
      : undefined;

  const plainGlow = isBook ? hsl(hue, 30, 70) : hsl(hue, 60, 45);

  return (
    <View
      testID={testID}
      style={[width == null ? { width: '100%', aspectRatio: g.aspect } : { width, height: g.height }, style]}
      onLayout={onLayout}
    >
      {/* The glow: a blurred copy of the cover, behind everything else. */}
      <Animated.View
        testID={`${testID}-glow`}
        aria-hidden
        style={[
          styles.decor,
          g.glowBox,
          {
            filter: source ? g.glowFilter : undefined,
            opacity: motion.glowOpacity,
            transform: [{ translateY: motion.glowY }, { scale: motion.glowScale }],
          },
        ]}
      >
        {source ? (
          <View style={[g.glowInset, styles.glowImage, { borderRadius: g.glowRadius }]}>
            <Image
              source={source}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              blurRadius={g.blurRadius}
              cachePolicy="memory-disk"
            />
          </View>
        ) : (
          // No picture to blur, so a halo in the typographic cover's colour, cast
          // by a box that stays hidden behind the cover however far it lifts.
          <View style={[g.haloBox, { borderRadius: g.glowRadius, boxShadow: g.halo(plainGlow) }]} />
        )}
      </Animated.View>

      {/* The body: everything that moves when the cover is lifted. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [
              { translateY: motion.bodyY },
              { rotateZ: motion.bodyTilt },
              { scale: motion.bodyScale },
            ],
          },
        ]}
      >
        {isBook && (
          <Animated.View
            testID={`${testID}-spine`}
            aria-hidden
            style={[
              styles.spine,
              {
                left: -g.depth / 2,
                width: g.depth,
                borderRadius: g.spineRadius,
                backgroundColor: source ? '#2b2f36' : hsl(hue, 9, 76),
                opacity: motion.spineOpacity,
                transform: [
                  { translateX: motion.spineX },
                  { scale: motion.spineScale },
                  { perspective: g.perspective },
                  { rotateY: motion.spineTurn },
                ],
              },
            ]}
          >
            {source && (
              // The cover's own edge, mirrored so its colour runs on round the hinge.
              <View style={[StyleSheet.absoluteFill, styles.mirror]}>
                <Image
                  source={source}
                  style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: g.width }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              </View>
            )}
            <View style={[StyleSheet.absoluteFill, styles.spineShade]} />
            <Text
              numberOfLines={1}
              style={[styles.spineTitle, g.spineTitle, { color: source ? 'rgba(255, 255, 255, 0.85)' : '#2b2b2b' }]}
            >
              {title}
            </Text>
          </Animated.View>
        )}

        {!isBook && (
          // The comic's pages: a sliver at rest, fanning out as it lifts, and
          // casting the shadow on the table.
          <View testID={`${testID}-pages`} aria-hidden style={styles.decor}>
            <Animated.View
              style={[styles.decor, g.radius, styles.pages, { boxShadow: g.stackShadow, opacity: motion.restOpacity }]}
            />
            <Animated.View
              style={[styles.decor, g.radius, styles.pages, { boxShadow: g.stackShadowLifted, opacity: motion.liftOpacity }]}
            />
            {SHEETS_BACK_TO_FRONT.map((sheet, i) => (
              <Animated.View
                key={sheet.colour}
                testID={`${testID}-sheet-${SHEETS.length - i}`}
                style={[
                  styles.decor,
                  g.radius,
                  {
                    backgroundColor: sheet.colour,
                    transform: [{ translateX: motion.sheets[i].x }, { translateY: motion.sheets[i].y }],
                  },
                ]}
              />
            ))}
            <View style={[styles.decor, g.radius, styles.pages]} />
          </View>
        )}

        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            isBook && { transform: [{ perspective: g.perspective }, { rotateY: motion.turn }] },
          ]}
        >
          {/* The cover's shadow: a book's on the table, a comic's on its sheets. */}
          <Animated.View
            aria-hidden
            style={[styles.decor, g.radius, styles.board, { boxShadow: g.restShadow, opacity: motion.restOpacity }]}
          />
          <Animated.View
            aria-hidden
            style={[styles.decor, g.radius, styles.board, { boxShadow: g.liftShadow, opacity: motion.liftOpacity }]}
          />
          <View style={[StyleSheet.absoluteFill, g.radius, styles.front]}>
            {source ? (
              <Image
                testID={`${testID}-image`}
                source={source}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
                onError={() => setFailedUri(image)}
              />
            ) : (
              <View
                testID={`${testID}-plain`}
                aria-hidden
                style={[styles.plain, isBook ? styles.plainBook : styles.plainComic, g.plain, plainBackground(variant, hue)]}
              >
                <Text numberOfLines={6} style={[g.plainTitle, isBook ? styles.plainTitleBook : styles.plainTitleComic]}>
                  {title}
                </Text>
                {author ? (
                  <Text numberOfLines={2} style={[g.plainAuthor, isBook ? styles.plainAuthorBook : styles.plainAuthorComic]}>
                    {author}
                  </Text>
                ) : null}
              </View>
            )}
            {/* The hinge groove, or a comic's fold at the staples. */}
            <View aria-hidden style={[styles.decor, isBook ? styles.hinge : styles.fold]} />
            <Animated.View
              aria-hidden
              style={[styles.decor, isBook ? styles.sheen : styles.gloss, { opacity: motion.liftOpacity }]}
            />
            {!isBook && (
              // A band of light that sweeps across the comic once as it lifts.
              <Animated.View
                testID={`${testID}-sweep`}
                aria-hidden
                style={[
                  styles.band,
                  { width: g.width * 3, opacity: motion.liftOpacity, transform: [{ translateX: motion.sweepX }] },
                ]}
              />
            )}
            {children}
          </View>
        </Animated.View>
      </Animated.View>

      {overlay ? <View style={[StyleSheet.absoluteFill, styles.overlay]}>{overlay}</View> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Geometry

type Geometry = ReturnType<typeof coverGeometry>;

/** Sizes for a cover `width` wide, in the proportions of the web's container units. */
export function coverGeometry(width: number, variant: CoverVariant) {
  const cq = width / 100;
  const aspect = COVER_ASPECT[variant];
  const height = width / aspect;
  const isBook = variant === 'book';
  const px = (n: number) => `${round(n * cq)}px`;
  const shadow = (x: number, y: number, blur: number, colour: string, spread = 0) =>
    `${px(x)} ${px(y)} ${px(blur)}${spread ? ` ${px(spread)}` : ''} ${colour}`;

  const [leftRadius, rightRadius] = isBook ? [0.8 * cq, 2.4 * cq] : [0.3 * cq, 1 * cq];

  // The glow sits in from the sides and top and hangs a little below, as on
  // the web. Its box is padded out so the blur has room to feather the edges.
  const glowPad = 25 * cq;
  const glow = { top: 0.08 * height, left: 0.06 * width, width: 0.88 * width, height: 0.94 * height };

  return {
    isBook,
    width,
    height,
    aspect,
    cq,
    perspective: 6 * width,
    /** Thickness of the book, from its front board to its back. */
    depth: isBook ? 8 * cq : 0.8 * cq,
    radius: {
      borderTopLeftRadius: leftRadius,
      borderBottomLeftRadius: leftRadius,
      borderTopRightRadius: rightRadius,
      borderBottomRightRadius: rightRadius,
    },
    spineRadius: 0.6 * cq,
    glowBox: {
      top: glow.top - glowPad,
      left: glow.left - glowPad,
      width: glow.width + glowPad * 2,
      height: glow.height + glowPad * 2,
    },
    glowInset: { position: 'absolute' as const, top: glowPad, left: glowPad, width: glow.width, height: glow.height },
    glowHeight: glow.height,
    glowRadius: 8 * cq,
    glowFilter: `blur(${px(10)}) saturate(1.4)`,
    haloBox: {
      position: 'absolute' as const,
      top: glowPad + 0.15 * height - glow.top,
      left: glowPad + 0.12 * width - glow.left,
      width: 0.76 * width,
      height: 0.73 * height,
    },
    halo: (colour: string) => `0 ${px(4)} ${px(14)} ${px(12)} ${colour}`,
    blurRadius: Math.min(25, Math.max(4, Math.round(8 * cq))),
    restShadow: isBook ? shadow(2.5, 2.5, 2, 'rgba(0, 0, 0, 0.45)') : shadow(0.25, 0.15, 0.5, 'rgba(0, 0, 0, 0.3)'),
    liftShadow: isBook ? shadow(4, 4, 7, 'rgba(0, 0, 0, 0.45)') : shadow(0.4, 0.3, 0.9, 'rgba(0, 0, 0, 0.35)'),
    stackShadow: `${shadow(0.6, 1.2, 1.6, 'rgba(0, 0, 0, 0.45)')}, ${shadow(0, 2.5, 5, 'rgba(0, 0, 0, 0.3)', -1)}`,
    stackShadowLifted: `${shadow(1.2, 3.5, 3.5, 'rgba(0, 0, 0, 0.35)')}, ${shadow(1.5, 9, 13, 'rgba(0, 0, 0, 0.55)', -1)}`,
    // Rotated a quarter turn to run down the spine, centred on it.
    spineTitle: {
      width: height - 12 * cq,
      height: 8 * cq,
      left: 4 * cq - (height - 12 * cq) / 2,
      top: height / 2 - 4 * cq,
      fontSize: 4 * cq,
      lineHeight: 8 * cq,
    },
    // Deep enough at the top to clear a corner badge.
    plain: { paddingTop: 22 * cq, paddingRight: 11 * cq, paddingBottom: 11 * cq, paddingLeft: 13 * cq, gap: isBook ? 0 : 4 * cq },
    plainTitle: { fontSize: 9 * cq, lineHeight: 9 * cq * 1.15, letterSpacing: isBook ? 0 : 0.18 * cq },
    plainAuthor: { fontSize: 5.5 * cq, lineHeight: 5.5 * cq * 1.3 },
  };
}

/**
 * Where a spine of `depth` sits once the book in front of it has turned
 * `deg` about its centre, seen through `perspective`.
 *
 * React Native can't share one 3D space between views, so the spine is a strip
 * of its own, turned edge-on to the viewer at rest and opened to the angle the
 * board's edge leaves it, then moved and scaled onto the board's hinge.
 */
export function spinePose(g: Pick<Geometry, 'width' | 'depth' | 'perspective'>, deg: number) {
  const t = (deg * Math.PI) / 180;
  const { width: w, depth: d, perspective: p } = g;
  // The board's left edge swings towards the viewer.
  const hingeZ = (w / 2) * Math.sin(t);
  const hingeX = -(w / 2) * Math.cos(t) * (p / (p - hingeZ));
  // The strip, turned about its own centre, and scaled up to the depth its
  // middle really sits at.
  const scale = p / (p - (hingeZ - (d / 2) * Math.cos(t)));
  const nearEdge = (d / 2) * Math.sin(t) * (p / (p - (d / 2) * Math.cos(t)));
  return {
    translateX: hingeX + w / 2 - scale * nearEdge,
    scale,
    turn: deg - 90,
  };
}

const SAMPLES = [0, 0.25, 0.5, 0.75, 1];

function coverMotion({ lift, sweep }: CoverMotionValues, g: Geometry) {
  const { isBook, cq } = g;
  const range = (from: number, to: number) => lift.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  const clamped = (from: number, to: number) =>
    lift.interpolate({ inputRange: [0, 1], outputRange: [from, to], extrapolate: 'clamp' });
  const sampled = (outputRange: number[] | string[]) =>
    lift.interpolate({ inputRange: SAMPLES, outputRange, extrapolate: 'clamp' });

  const poses = SAMPLES.map((s) => spinePose(g, s * BOOK_TURN_DEG));

  return {
    // A book lifts and tips; a comic is picked up a little, a degree off square.
    bodyY: range(0, -(isBook ? 0.03 * g.height : 1.6 * cq)),
    bodyTilt: lift.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-1deg'] }),
    bodyScale: range(1, isBook ? 1.02 : 1.015),
    turn: sampled(SAMPLES.map((s) => `${s * BOOK_TURN_DEG}deg`)),
    spineX: sampled(poses.map((pose) => pose.translateX)),
    spineScale: sampled(poses.map((pose) => pose.scale)),
    spineTurn: sampled(poses.map((pose) => `${pose.turn}deg`)),
    spineOpacity: lift.interpolate({ inputRange: [0, 0.15], outputRange: [0, 1], extrapolate: 'clamp' }),
    sheets: SHEETS_BACK_TO_FRONT.map(({ rest, pressed }) => ({
      x: clamped(rest[0] * cq, pressed[0] * cq),
      y: clamped(rest[1] * cq, pressed[1] * cq),
    })),
    // Resting and lifted shadows cross-fade, since a shadow can't animate natively.
    restOpacity: clamped(1, 0),
    liftOpacity: clamped(0, 1),
    glowOpacity: range(0.5, 0.75),
    glowY: range(0.04 * g.glowHeight, 0.08 * g.glowHeight),
    glowScale: range(0.92, 1),
    sweepX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-2 * g.width, 0] }),
  };
}

// ---------------------------------------------------------------------------
// Colour

/**
 * A steady hue per title, so typographic covers differ from one another but
 * not from one visit to the next. The same hash as the web's.
 */
export function hueFor(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** An HSL colour as hex, which every platform's style parser accepts. */
export function hsl(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function plainBackground(variant: CoverVariant, hue: number): ViewStyle {
  const [from, to, angle] =
    variant === 'book'
      ? [hsl(hue, 9, 82), hsl(hue, 28, 95), 45]
      : [hsl(hue, 60, 42), hsl(hue + 40, 55, 28), 160];
  return {
    backgroundColor: from,
    experimental_backgroundImage: `linear-gradient(${angle}deg, ${from}, ${to})`,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

const styles = StyleSheet.create({
  decor: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
  pages: { backgroundColor: PAGES },
  board: { backgroundColor: '#111318' },
  front: { overflow: 'hidden', backgroundColor: '#e0dbd3' },
  glowImage: { overflow: 'hidden' },
  spine: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none' },
  mirror: { transform: [{ scaleX: -1 }] },
  spineShade: {
    experimental_backgroundImage:
      'linear-gradient(90deg, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.15) 35%, rgba(255, 255, 255, 0.1) 55%, rgba(0, 0, 0, 0.35))',
  },
  spineTitle: {
    position: 'absolute',
    textAlign: 'center',
    fontWeight: '600',
    transform: [{ rotate: '90deg' }],
  },
  hinge: {
    experimental_backgroundImage:
      'linear-gradient(90deg, transparent 2.5%, rgba(0, 0, 0, 0.25) 2.5%, rgba(0, 0, 0, 0.25) 3.3%, rgba(255, 255, 255, 0.16) 3.3%, transparent 6.5%), linear-gradient(90deg, rgba(0, 0, 0, 0.3), transparent 7%)',
  },
  // The fold at a comic's staples, and a crease catching the light past it.
  fold: {
    experimental_backgroundImage:
      'linear-gradient(90deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.12) 1.4%, rgba(255, 255, 255, 0.16) 1.9%, transparent 3.4%)',
  },
  sheen: {
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0) 60%)',
  },
  // A comic's top catching the light, and its fore-edge shading as the paper bows.
  gloss: {
    experimental_backgroundImage:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0) 55%), linear-gradient(90deg, rgba(0, 0, 0, 0) 60%, rgba(0, 0, 0, 0.14))',
  },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
    experimental_backgroundImage:
      'linear-gradient(110deg, transparent 38%, rgba(255, 255, 255, 0.3) 47%, rgba(255, 255, 255, 0.08) 53%, transparent 62%)',
  },
  plain: { ...StyleSheet.absoluteFillObject },
  // Title at the head and author at the foot; a comic's masthead keeps its
  // publisher close beneath, leaving the foot free for progress.
  plainBook: { justifyContent: 'space-between' },
  plainComic: { justifyContent: 'flex-start' },
  plainTitleBook: { color: '#2b2b2b', fontWeight: '600' },
  plainTitleComic: { color: '#fff', fontWeight: '800', textTransform: 'uppercase' },
  plainAuthorBook: { color: '#2b2b2b', opacity: 0.8 },
  plainAuthorComic: { color: '#fff', opacity: 0.8 },
  overlay: { pointerEvents: 'box-none' },
  pressedStill: { opacity: 0.7 },
});

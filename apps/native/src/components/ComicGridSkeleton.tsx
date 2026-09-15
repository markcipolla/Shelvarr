import React, { useEffect, useRef } from 'react';
import { View, Animated, FlatList, StyleSheet } from 'react-native';
import { useColumns } from '../hooks/useColumns';
import { COVER_ASPECT } from './Cover';

const SKELETON_COUNT = 12;
const SKELETON_ITEMS = Array.from({ length: SKELETON_COUNT }, (_, i) => ({
  id: `skeleton-${i}`,
}));

/** A single pulsing placeholder shaped like a ComicCard. */
function ShimmerCard() {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={styles.card}>
      <Animated.View style={[styles.cover, { opacity }]} />
      <Animated.View style={[styles.lineWide, { opacity }]} />
      <Animated.View style={[styles.lineNarrow, { opacity }]} />
    </View>
  );
}

/**
 * Placeholder grid shown while the comics list is loading with no cached data,
 * so the layout appears instantly instead of a blank screen with one spinner.
 */
export default function ComicGridSkeleton() {
  const columns = useColumns();
  /* istanbul ignore next -- columnWrapperStyle only applies when columns > 1 */
  const colWrapper = columns > 1 ? styles.row : undefined;

  return (
    <FlatList
      key={`skeleton-${columns}`}
      style={styles.container}
      data={SKELETON_ITEMS}
      numColumns={columns}
      keyExtractor={(item) => item.id}
      scrollEnabled={false}
      renderItem={() => <ShimmerCard />}
      contentContainerStyle={styles.list}
      columnWrapperStyle={colWrapper}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb' },
  list: { padding: 12 },
  row: { gap: 12 },
  card: { flex: 1, marginBottom: 12 },
  cover: {
    // A comic's shape, so the covers land where the placeholders were.
    aspectRatio: COVER_ASPECT.comic,
    borderTopLeftRadius: 1,
    borderBottomLeftRadius: 1,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: '#e0dbd3',
  },
  lineWide: {
    height: 12,
    borderRadius: 4,
    backgroundColor: '#e0dbd3',
    marginTop: 8,
    width: '90%',
  },
  lineNarrow: {
    height: 10,
    borderRadius: 4,
    backgroundColor: '#e0dbd3',
    marginTop: 6,
    width: '55%',
  },
});

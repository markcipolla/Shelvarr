import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Series } from '../types/komga';
import { getSeriesThumbnailUrl } from '../services/api/books';
import { useAuthHeaders } from '../hooks/useAuthHeaders';

const COVER_ASPECT_RATIO = 140 / 200;

interface Props {
  series: Series;
  onPress: () => void;
  placeholder?: boolean;
}

export default function SeriesCard({ series, onPress, placeholder }: Props) {
  const headers = useAuthHeaders();

  if (placeholder) {
    return <View style={styles.container} />;
  }

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <Image
        source={{ uri: getSeriesThumbnailUrl(series.id), headers }}
        style={styles.cover}
        resizeMode="cover"
      />
      <Text style={styles.title} numberOfLines={2}>
        {series.metadata.title || series.name}
      </Text>
      <Text style={styles.count}>{series.booksCount} books</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, marginBottom: 16 },
  cover: { width: '100%', height: undefined, aspectRatio: COVER_ASPECT_RATIO, borderRadius: 6, backgroundColor: '#e8e4de' },
  title: { fontSize: 20, color: '#222', marginTop: 6, lineHeight: 26 },
  count: { fontSize: 16, color: '#777', marginTop: 2 },
});

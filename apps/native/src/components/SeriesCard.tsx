import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Series } from '../types/api';
import { getSeriesThumbnailUrl } from '../services/api/books';
import { useAuthHeaders } from '../hooks/useAuthHeaders';
import Cover, { CoverTrigger } from './Cover';

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

  const title = series.metadata.title || series.name;

  return (
    <CoverTrigger style={styles.container} onPress={onPress}>
      <Cover uri={getSeriesThumbnailUrl(series.id)} headers={headers} title={title} />
      {/* After the cover, so its title sits above the cover's glow and shadow. */}
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.count}>{series.booksCount} books</Text>
    </CoverTrigger>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, marginBottom: 16 },
  title: { fontSize: 20, color: '#222', marginTop: 6, lineHeight: 26 },
  count: { fontSize: 16, color: '#777', marginTop: 2 },
});

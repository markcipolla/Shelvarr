import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Book } from '../types/komga';
import { getBookThumbnailUrl } from '../services/api/books';
import { useAuthHeaders } from '../hooks/useAuthHeaders';

const COVER_ASPECT_RATIO = 140 / 200; // match SeriesCard

interface Props {
  book: Book;
  onPress: () => void;
  fill?: boolean;
  placeholder?: boolean;
}

export default function BookCard({ book, onPress, fill, placeholder }: Props) {
  const headers = useAuthHeaders();

  if (placeholder) {
    return <View style={{ flex: 1, marginBottom: 12 }} />;
  }

  const progress = book.readProgress;
  const isRead = progress?.completed;
  const progressPercent = progress
    ? Math.round((progress.page / Math.max(book.media.pagesCount, 1)) * 100)
    : 0;

  const containerStyle: ViewStyle = fill
    ? { flex: 1, marginBottom: 12 }
    : { width: 120, marginRight: 12 };

  return (
    <TouchableOpacity style={containerStyle} onPress={onPress} activeOpacity={0.7}>
      <View style={fill ? styles.coverWrapper : undefined}>
        <Image
          source={{ uri: getBookThumbnailUrl(book.id), headers }}
          style={fill ? styles.coverFill : styles.cover}
          resizeMode="cover"
        />
        {isRead && (
          <View style={styles.readBadge}>
            <View style={styles.readTriangle} />
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {book.metadata.title || book.name}
        </Text>
        {progress && !progress.completed && (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cover: { width: 140, height: 200, borderRadius: 6, backgroundColor: '#e8e4de' },
  coverWrapper: { aspectRatio: COVER_ASPECT_RATIO, borderRadius: 6, overflow: 'hidden', backgroundColor: '#e8e4de' },
  coverFill: { width: '100%', height: '100%' },
  readBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    overflow: 'hidden',
  },
  readTriangle: {
    position: 'absolute',
    top: -14,
    right: -14,
    width: 28,
    height: 28,
    backgroundColor: '#d4a017',
    transform: [{ rotate: '45deg' }],
  },
  info: { marginTop: 6 },
  title: { fontSize: 13, color: '#222', lineHeight: 17 },
  progressBar: {
    height: 3,
    backgroundColor: '#d5d0c8',
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#8b5e3c', borderRadius: 2 },
});

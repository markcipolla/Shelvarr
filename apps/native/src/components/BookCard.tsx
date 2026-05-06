import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Book } from '../types/komga';
import { getBookThumbnailUrl } from '../services/api/books';
import { useAuthHeaders } from '../hooks/useAuthHeaders';
import { useConnectivityStore } from '../stores/useConnectivityStore';
import { useDownloadStore } from '../stores/useDownloadStore';

const COVER_ASPECT_RATIO = 140 / 200; // match SeriesCard

interface Props {
  book: Book;
  onPress: () => void;
  fill?: boolean;
  placeholder?: boolean;
}

export default function BookCard({ book, onPress, fill, placeholder }: Props) {
  const headers = useAuthHeaders();
  const online = useConnectivityStore((s) => s.online);
  const isDownloaded = useDownloadStore((s) => !!s.downloads[book?.id]);

  if (placeholder) {
    return <View style={{ flex: 1, marginBottom: 12 }} />;
  }

  // Offline + not cached locally → can't open detail or read; grey it out.
  const offlineUnavailable = !online && !isDownloaded;

  const progress = book.readProgress;
  const isRead = progress?.completed;
  const pagePercent = progress && book.media.pagesCount > 0
    ? Math.round((progress.page / book.media.pagesCount) * 100)
    : 0;
  const epubPercent = progress?.progression != null
    ? Math.round(progress.progression * 100)
    : 0;
  const progressPercent = Math.max(pagePercent, epubPercent);
  const showBar = !!progress && !progress.completed && progressPercent > 0;

  const containerStyle: ViewStyle = fill
    ? { flex: 1, marginBottom: 12 }
    : { width: 120, marginRight: 12 };

  const coverWrapperStyle: ViewStyle = fill
    ? styles.coverWrapper
    : styles.coverWrapperFixed;

  return (
    <TouchableOpacity
      style={[containerStyle, offlineUnavailable && styles.dimmed]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={offlineUnavailable}
      accessibilityState={{ disabled: offlineUnavailable }}
    >
      <View style={coverWrapperStyle}>
        <Image
          source={{ uri: getBookThumbnailUrl(book.id), headers }}
          style={fill ? styles.coverFill : styles.cover}
          resizeMode="cover"
        />
        {showBar && (
          <View style={styles.progressBarOverlay}>
            <View style={[styles.progressFillOverlay, { width: `${progressPercent}%` }]} />
          </View>
        )}
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
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cover: { width: 140, height: 200, borderRadius: 6, backgroundColor: '#e8e4de' },
  coverWrapper: { aspectRatio: COVER_ASPECT_RATIO, borderRadius: 6, overflow: 'hidden', backgroundColor: '#e8e4de' },
  coverWrapperFixed: { width: 140, height: 200, borderRadius: 6, overflow: 'hidden', backgroundColor: '#e8e4de' },
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
  progressBarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  progressFillOverlay: {
    height: '100%',
    backgroundColor: '#f5c518',
  },
  dimmed: { opacity: 0.4 },
});

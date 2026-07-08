import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Book } from '../types/komga';
import { getBookThumbnailUrl } from '../services/api/books';
import { useAuthHeaders } from '../hooks/useAuthHeaders';
import { useConnectivityStore } from '../stores/useConnectivityStore';
import { useDownloadStore } from '../stores/useDownloadStore';

const COVER_ASPECT_RATIO = 140 / 200; // match SeriesCard

interface StatusPill {
  label: string;
  backgroundColor: string;
  color: string;
}

// Derive a Hardcover status pill, skipping cases the card already shows: "read"
// (the corner triangle) and "reading" when a local progress bar is visible.
function getStatusPill(book: Book, isRead: boolean, showBar: boolean): StatusPill | null {
  if (isRead) return null;
  switch (book.hardcoverStatus) {
    case 'reading':
      return showBar ? null : { label: 'Reading', backgroundColor: '#2563eb', color: '#fff' };
    case 'want-to-read':
      return { label: 'Want to read', backgroundColor: '#f59e0b', color: '#1a1a1a' };
    case 'dnf':
      return { label: 'DNF', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' };
    default:
      return null;
  }
}

interface Props {
  book: Book;
  onPress: () => void;
  fill?: boolean;
  placeholder?: boolean;
  /** When provided, shows a "×" button to remove this book from Next Up. */
  onRemove?: () => void;
}

export default function BookCard({ book, onPress, fill, placeholder, onRemove }: Props) {
  const headers = useAuthHeaders();
  const online = useConnectivityStore((s) => s.online);
  const isDownloaded = useDownloadStore((s) => !!s.downloads[book?.id]);

  if (placeholder) {
    return <View style={{ flex: 1, marginBottom: 12 }} />;
  }

  // Offline + not cached locally → can't open detail or read; grey it out.
  const offlineUnavailable = !online && !isDownloaded;

  const progress = book.readProgress;
  // "Read" spans a locally-completed book and one marked read on Hardcover.
  const isRead = progress?.completed || book.hardcoverStatus === 'read';
  const pagePercent = progress && book.media.pagesCount > 0
    ? Math.round((progress.page / book.media.pagesCount) * 100)
    : 0;
  const epubPercent = progress?.progression != null
    ? Math.round(progress.progression * 100)
    : 0;
  const progressPercent = Math.max(pagePercent, epubPercent);
  const showBar = !!progress && !progress.completed && progressPercent > 0;

  // A small status pill for Hardcover statuses that aren't already conveyed by
  // the read badge or the local progress bar.
  const statusPill = getStatusPill(book, isRead, showBar);

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
        {statusPill && (
          <View style={[styles.statusPill, { backgroundColor: statusPill.backgroundColor }]}>
            <Text style={[styles.statusPillText, { color: statusPill.color }]} numberOfLines={1}>
              {statusPill.label}
            </Text>
          </View>
        )}
        {onRemove && (
          <TouchableOpacity
            style={styles.removeButton}
            onPress={onRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Remove from Next Up"
          >
            <Text style={styles.removeButtonText}>×</Text>
          </TouchableOpacity>
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
  statusPill: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    maxWidth: '90%',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusPillText: { fontSize: 10, fontWeight: '600' },
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
  removeButton: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: { color: '#fff', fontSize: 16, lineHeight: 18, fontWeight: '600' },
});

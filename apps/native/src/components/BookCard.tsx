import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Book } from '../types/api';
import { getBookThumbnailUrl } from '../services/api/books';
import { useAuthHeaders } from '../hooks/useAuthHeaders';
import { useConnectivityStore } from '../stores/useConnectivityStore';
import { useDownloadStore } from '../stores/useDownloadStore';
import Cover, { CoverTrigger } from './Cover';

/** A card outside a grid, in a horizontal row, is this wide. */
const FIXED_WIDTH = 120;

interface StatusPill {
  label: string;
  backgroundColor: string;
  color: string;
}

// Derive a Hardcover status pill, skipping cases the card already shows: "read"
// (the corner tick) and "reading" when a local progress bar is visible.
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
  /** When provided, shows a "×" button that takes this book off the shelf it is on. */
  onRemove?: () => void;
  /** What that "×" does, for screen readers — it differs by shelf. */
  removeLabel?: string;
}

export default function BookCard({
  book,
  onPress,
  fill,
  placeholder,
  onRemove,
  removeLabel = 'Remove from Next Up',
}: Props) {
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
    : { width: FIXED_WIDTH, marginRight: 12 };

  const title = book.metadata.title || book.name;
  const authors = book.metadata.authors.map((a) => a.name).join(', ');

  return (
    <CoverTrigger
      style={[containerStyle, offlineUnavailable && styles.dimmed]}
      onPress={onPress}
      disabled={offlineUnavailable}
      accessibilityState={{ disabled: offlineUnavailable }}
    >
      <Cover
        uri={getBookThumbnailUrl(book.id)}
        headers={headers}
        title={title}
        author={authors}
        width={fill ? undefined : FIXED_WIDTH}
        overlay={
          onRemove && (
            <TouchableOpacity
              style={styles.removeButton}
              onPress={onRemove}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={removeLabel}
            >
              <Text style={styles.removeButtonText}>×</Text>
            </TouchableOpacity>
          )
        }
      >
        {showBar && (
          <View style={styles.progressBarOverlay}>
            <View style={[styles.progressFillOverlay, { width: `${progressPercent}%` }]} />
          </View>
        )}
        {isRead && (
          <View style={styles.readBadge} accessibilityLabel="Read">
            <Text style={styles.readTick}>✓</Text>
          </View>
        )}
        {statusPill && (
          <View style={[styles.statusPill, { backgroundColor: statusPill.backgroundColor }]}>
            <Text style={[styles.statusPillText, { color: statusPill.color }]} numberOfLines={1}>
              {statusPill.label}
            </Text>
          </View>
        )}
      </Cover>
      {/* After the cover, so its title sits above the cover's glow and shadow. */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      </View>
    </CoverTrigger>
  );
}

const styles = StyleSheet.create({
  readBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2e7d32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readTick: { color: '#fff', fontSize: 15, lineHeight: 18, fontWeight: '700' },
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

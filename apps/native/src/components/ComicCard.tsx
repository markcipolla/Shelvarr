import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { getVolumeCoverUrl, type ComicVolumeListItem } from '../services/api/comics';
import { useAuthHeaders } from '../hooks/useAuthHeaders';
import Cover, { CoverTrigger } from './Cover';

/** A card outside a grid, in a horizontal row, is this wide. */
const FIXED_WIDTH = 120;

interface Props {
  volume: ComicVolumeListItem;
  onPress: () => void;
  fill?: boolean;
  placeholder?: boolean;
  /** Optional badge shown at the bottom-left, e.g. resume point for in-progress comics. */
  progressLabel?: string;
  /** When provided, shows a "×" button to remove this comic from Next Up. */
  onRemove?: () => void;
}

export default function ComicCard({ volume, onPress, fill, placeholder, progressLabel, onRemove }: Props) {
  // Covers are served by the same protected API as everything else, so the
  // image loader needs the session token too.
  const headers = useAuthHeaders();

  if (placeholder) {
    return <View style={{ flex: 1, marginBottom: 12 }} />;
  }

  const containerStyle: ViewStyle = fill
    ? { flex: 1, marginBottom: 12 }
    : { width: FIXED_WIDTH, marginRight: 12 };

  const subtitleParts = [volume.publisher, volume.year ? String(volume.year) : null].filter(Boolean);
  const subtitle = subtitleParts.join(' · ');
  const showBadge = volume.issue_count > 0;

  return (
    <CoverTrigger style={containerStyle} onPress={onPress}>
      <Cover
        variant="comic"
        uri={getVolumeCoverUrl(volume.id)}
        headers={headers}
        title={volume.title}
        author={subtitle}
        width={fill ? undefined : FIXED_WIDTH}
        overlay={
          onRemove ? (
            <TouchableOpacity
              style={styles.removeButton}
              onPress={onRemove}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Remove from Next Up"
            >
              <Text style={styles.removeButtonText}>×</Text>
            </TouchableOpacity>
          ) : null
        }
      >
        {volume.read ? (
          <View style={styles.readBadge} accessibilityLabel="Read">
            <Text style={styles.readBadgeText}>✓</Text>
          </View>
        ) : null}
        {showBadge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {volume.issues_downloaded}/{volume.issue_count}
            </Text>
          </View>
        )}
        {progressLabel ? (
          <View style={styles.progressBadge}>
            <Text style={styles.progressBadgeText}>{progressLabel}</Text>
          </View>
        ) : null}
      </Cover>
      {/* After the cover, so its title sits above the cover's glow and shadow. */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {volume.title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </CoverTrigger>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(139, 94, 60, 0.9)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  readBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readBadgeText: { color: '#fff', fontSize: 12, lineHeight: 14, fontWeight: '700' },
  progressBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  progressBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
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
  info: { marginTop: 6 },
  title: { fontSize: 13, color: '#222', lineHeight: 17 },
  subtitle: { fontSize: 11, color: '#777', marginTop: 2 },
});

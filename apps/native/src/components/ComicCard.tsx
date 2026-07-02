import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import type { KapowarrVolume } from '@shelvarr/types';
import { getVolumeCoverUrl } from '../services/api/comics';

const COVER_ASPECT_RATIO = 140 / 200;

interface Props {
  volume: KapowarrVolume;
  onPress: () => void;
  fill?: boolean;
  placeholder?: boolean;
  /** Optional badge shown at the bottom-left, e.g. resume point for in-progress comics. */
  progressLabel?: string;
}

export default function ComicCard({ volume, onPress, fill, placeholder, progressLabel }: Props) {
  if (placeholder) {
    return <View style={{ flex: 1, marginBottom: 12 }} />;
  }

  const containerStyle: ViewStyle = fill
    ? { flex: 1, marginBottom: 12 }
    : { width: 120, marginRight: 12 };

  const subtitleParts = [volume.publisher, volume.year ? String(volume.year) : null].filter(Boolean);
  const subtitle = subtitleParts.join(' · ');
  const showBadge = volume.issue_count > 0;

  return (
    <TouchableOpacity style={containerStyle} onPress={onPress} activeOpacity={0.7}>
      <View style={fill ? styles.coverWrapper : undefined}>
        <Image
          source={{ uri: getVolumeCoverUrl(volume.id) }}
          style={fill ? styles.coverFill : styles.cover}
          resizeMode="cover"
        />
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
      </View>
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
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cover: { width: 140, height: 200, borderRadius: 6, backgroundColor: '#e8e4de' },
  coverWrapper: { aspectRatio: COVER_ASPECT_RATIO, borderRadius: 6, overflow: 'hidden', backgroundColor: '#e8e4de' },
  coverFill: { width: '100%', height: '100%' },
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
  info: { marginTop: 6 },
  title: { fontSize: 13, color: '#222', lineHeight: 17 },
  subtitle: { fontSize: 11, color: '#777', marginTop: 2 },
});

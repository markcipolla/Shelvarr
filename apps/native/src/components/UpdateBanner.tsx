import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useUpdateStore } from '../stores/useUpdateStore';

function formatSize(bytes: number): string {
  if (bytes <= 0) return '';
  return ` · ${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Centred prompt offering the newest GitHub release. Renders nothing unless
 * there is something to act on, so it can sit permanently in the tree.
 */
export default function UpdateBanner() {
  const status = useUpdateStore((s) => s.status);
  const update = useUpdateStore((s) => s.update);
  const progress = useUpdateStore((s) => s.progress);
  const error = useUpdateStore((s) => s.error);
  const startUpdate = useUpdateStore((s) => s.startUpdate);
  const dismiss = useUpdateStore((s) => s.dismiss);

  const visible =
    !!update && (status === 'available' || status === 'downloading' || status === 'installing' || status === 'error');
  if (!visible) return null;

  const downloading = status === 'downloading';
  const installing = status === 'installing';
  const failed = status === 'error';

  return (
    // A full-screen, touch-transparent layer purely to centre the card: the
    // prompt still doesn't block the app behind it, same as when it sat at
    // the bottom.
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.container} accessibilityRole="alert">
        <Text style={styles.title}>
          {failed ? 'Update failed' : `Version ${update.version} available`}
        </Text>
        <Text style={styles.body} numberOfLines={3}>
          {failed
            ? error || 'Something went wrong.'
            : update.notes || `A newer build of Stackarr is ready to install${formatSize(update.apkSize)}.`}
        </Text>

        {downloading && (
          <View style={styles.progressTrack}>
            <View
              testID="update-progress-fill"
              style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
            />
          </View>
        )}

        {installing ? (
          <View style={styles.installingRow}>
            <ActivityIndicator color="#8b5e3c" />
            <Text style={styles.installingText}>Opening installer…</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={dismiss}>
              <Text style={styles.secondaryText}>Later</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, downloading && styles.buttonDisabled]}
              onPress={startUpdate}
              disabled={downloading}
            >
              <Text style={styles.primaryText}>
                {downloading
                  ? `Downloading ${Math.round(progress * 100)}%`
                  : failed
                    ? 'Try again'
                    : 'Update'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#e8e4de',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d5d0c8',
    padding: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  title: { fontSize: 16, fontWeight: '600', color: '#222' },
  body: { fontSize: 13, color: '#555', marginTop: 6 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d5d0c8',
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: '#8b5e3c' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 14 },
  secondaryText: { fontSize: 15, color: '#777' },
  primaryButton: {
    backgroundColor: '#8b5e3c',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginLeft: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  installingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  installingText: { fontSize: 14, color: '#555', marginLeft: 10 },
});

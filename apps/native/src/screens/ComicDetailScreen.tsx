import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import type { ComicVolumeDetail, ComicIssueSummary } from '@shelvarr/types';
import {
  fetchComicDetail,
  getVolumeCoverUrl,
  fetchVolumeProgress,
  ComicIssueProgress,
} from '../services/api/comics';
import { useAuthHeaders } from '../hooks/useAuthHeaders';
import { useComicDownloadStore } from '../stores/useComicDownloadStore';

type Props = NativeStackScreenProps<RootStackParamList, 'ComicDetail'>;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function formatSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function getIssueBadge(issue: ComicIssueSummary, downloaded: boolean, progress?: ComicIssueProgress) {
  if (progress?.completed) {
    return { label: 'Read', container: styles.badgeRead, text: styles.badgeTextOnColor };
  }
  if (progress && progress.page > 0) {
    const label = progress.total
      ? `Reading ${progress.page}/${progress.total}`
      : `Reading p.${progress.page}`;
    return { label, container: styles.badgeReading, text: styles.badgeTextOnColor };
  }
  if (downloaded) {
    return { label: 'Downloaded', container: styles.badgeDownloaded, text: styles.badgeTextDownloaded };
  }
  if (issue.files.length > 0) {
    return { label: 'Available', container: styles.badgeAvailable, text: styles.badgeTextAvailable };
  }
  return { label: 'Missing', container: styles.badgeMissing, text: styles.badgeTextMissing };
}

export default function ComicDetailScreen({ navigation, route }: Props) {
  const { volumeId } = route.params;
  const [volume, setVolume] = useState<ComicVolumeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Map<number, ComicIssueProgress>>(new Map());
  const downloads = useComicDownloadStore((s) => s.downloads);
  const headers = useAuthHeaders();

  // Reload read progress whenever the screen regains focus (e.g. after reading
  // an issue), so the per-issue badges stay current.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchVolumeProgress(volumeId).then((p) => {
        if (active) setProgress(p);
      });
      return () => {
        active = false;
      };
    }, [volumeId])
  );

  useEffect(() => {
    fetchComicDetail(volumeId)
      .then((res) => {
        // Prefer whatever the server said went wrong; fall back to a plain
        // "not there" only when it offered no reason.
        if (res.error || !res.volume) {
          setError(res.error || 'This comic is not on the server.');
          return;
        }
        setVolume(res.volume);
      })
      .catch(() => setError('Failed to load comic details'))
      .finally(() => setLoading(false));
  }, [volumeId]);

  const handleOpenIssue = (issue: ComicIssueSummary) => {
    navigation.navigate('IssueDetail', {
      volumeId,
      issueId: issue.id,
      volumeTitle: volume?.title,
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8b5e3c" />
      </View>
    );
  }

  if (error || !volume) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Comic not found'}</Text>
      </View>
    );
  }

  const subtitleParts = [volume.publisher, volume.year ? String(volume.year) : null].filter(Boolean);
  const subtitle = subtitleParts.join(' · ');
  const description = volume.description ? stripHtml(volume.description) : '';
  const totalSize = formatSize(volume.total_size);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Image
          source={{ uri: getVolumeCoverUrl(volume.id), headers }}
          style={styles.cover}
          resizeMode="cover"
        />
        <View style={styles.meta}>
          <Text style={styles.title}>{volume.title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {volume.volume_number > 0 && (
            <Text style={styles.detail}>Volume {volume.volume_number}</Text>
          )}
          <Text style={styles.detail}>
            Issues: {volume.issues_downloaded}/{volume.issue_count}
          </Text>
          {totalSize ? <Text style={styles.detail}>Size: {totalSize}</Text> : null}
          {volume.monitored ? <Text style={styles.monitored}>Monitored</Text> : null}
        </View>
      </View>

      {description ? <Text style={styles.summary}>{description}</Text> : null}

      {volume.issues.length > 0 && (
        <View style={styles.issuesSection}>
          <Text style={styles.issuesHeading}>Issues</Text>
          {volume.issues.map((issue) => {
            const badge = getIssueBadge(issue, !!downloads[issue.id], progress.get(issue.id));
            return (
              <TouchableOpacity
                key={issue.id}
                style={styles.issueRow}
                onPress={() => handleOpenIssue(issue)}
                activeOpacity={0.7}
              >
                <View style={styles.issueMain}>
                  <Text style={styles.issueNumber}>#{issue.issue_number}</Text>
                  <View style={styles.issueTextWrap}>
                    {issue.title ? (
                      <Text style={styles.issueTitle} numberOfLines={2}>
                        {issue.title}
                      </Text>
                    ) : null}
                    {issue.date ? <Text style={styles.issueDate}>{issue.date}</Text> : null}
                  </View>
                </View>
                <View style={[styles.issueBadge, badge.container]}>
                  <Text style={[styles.badgeText, badge.text]}>{badge.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f1eb', padding: 24 },
  errorText: { fontSize: 18, color: '#a33', textAlign: 'center', lineHeight: 24 },
  header: { flexDirection: 'row', padding: 16 },
  cover: { width: 200, height: 290, borderRadius: 6, backgroundColor: '#e8e4de' },
  meta: { flex: 1, marginLeft: 16, justifyContent: 'center' },
  title: { fontSize: 27, fontWeight: '600', color: '#222', marginBottom: 10 },
  subtitle: { fontSize: 21, color: '#555', marginBottom: 10 },
  detail: { fontSize: 20, color: '#777', marginBottom: 6 },
  monitored: { fontSize: 18, color: '#4a7c59', marginTop: 4, fontWeight: '500' },
  summary: { fontSize: 21, color: '#444', lineHeight: 30, padding: 16, paddingTop: 0 },
  issuesSection: { paddingHorizontal: 16, paddingBottom: 24 },
  issuesHeading: { fontSize: 22, fontWeight: '600', color: '#333', marginBottom: 12, marginTop: 8 },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0dcd4',
  },
  issueMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  issueNumber: { fontSize: 18, color: '#8b5e3c', fontWeight: '600', width: 56 },
  issueTextWrap: { flex: 1, marginRight: 8 },
  issueTitle: { fontSize: 18, color: '#222' },
  issueDate: { fontSize: 14, color: '#888', marginTop: 2 },
  issueBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  badgeDownloaded: { backgroundColor: '#8b5e3c' },
  badgeAvailable: { backgroundColor: '#d8cdbe' },
  badgeMissing: { backgroundColor: '#e8e4de' },
  badgeRead: { backgroundColor: '#4a7c59' },
  badgeReading: { backgroundColor: '#c78a3b' },
  badgeText: { fontSize: 14, fontWeight: '600' },
  badgeTextDownloaded: { color: '#fff' },
  badgeTextAvailable: { color: '#5c4a33' },
  badgeTextMissing: { color: '#999' },
  badgeTextOnColor: { color: '#fff' },
});

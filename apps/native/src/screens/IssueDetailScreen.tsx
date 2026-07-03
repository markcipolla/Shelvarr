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
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import type { KapowarrIssue } from '@shelvarr/types';
import {
  fetchComicIssue,
  getVolumeCoverUrl,
  fetchComicProgress,
  ComicProgress,
} from '../services/api/comics';
import {
  prepareComicForReading,
  downloadComic,
  removeDownloadedComic,
  describeComicReadError,
} from '../services/comicReader';
import { useComicDownloadStore } from '../stores/useComicDownloadStore';
import { useAuthHeaders } from '../hooks/useAuthHeaders';

type Props = NativeStackScreenProps<RootStackParamList, 'IssueDetail'>;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function formatSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default function IssueDetailScreen({ navigation, route }: Props) {
  const { volumeId, issueId, volumeTitle } = route.params;
  const [issue, setIssue] = useState<KapowarrIssue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const [readProgress, setReadProgress] = useState<number | null>(null);
  const [issueProgress, setIssueProgress] = useState<ComicProgress | null>(null);
  const [downloading, setDownloading] = useState(false);
  const headers = useAuthHeaders();
  const downloadedEntry = useComicDownloadStore((s) => s.downloads[issueId]);
  const downloadStoreProgress = useComicDownloadStore((s) => s.progress);
  const activeIssueId = useComicDownloadStore((s) => s.activeIssueId);
  const isDownloaded = !!downloadedEntry;

  // Refresh saved read progress on focus so the status badge reflects the
  // latest reading position after returning from the reader.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchComicProgress(issueId).then((p) => {
        if (active) setIssueProgress(p);
      });
      return () => {
        active = false;
      };
    }, [issueId])
  );

  useEffect(() => {
    fetchComicIssue(issueId, volumeId)
      .then((res) => {
        if (!res.configured) {
          setError('Kapowarr is not configured on your Shelvarr server.');
          return;
        }
        if (!res.issue) {
          setError(res.error || 'Issue not found');
          return;
        }
        setIssue(res.issue);
        navigation.setOptions({ title: `#${res.issue.issue_number}` });
      })
      .catch(() => setError('Failed to load issue details'))
      .finally(() => setLoading(false));
  }, [volumeId, issueId, navigation]);

  const handleRead = async () => {
    if (!issue) return;
    setReadLoading(true);
    setReadProgress(0);
    try {
      const result = await prepareComicForReading(issue, headers, setReadProgress, volumeTitle);
      const progress = await fetchComicProgress(issueId);
      const startPage = progress?.page ?? 1;

      if (result.kind === 'pdf') {
        navigation.navigate('PdfReader', {
          bookId: `comic-${issueId}`,
          filePath: result.filePath,
          startPage,
          totalPages: progress?.total ?? 1,
          kind: 'comic',
          issueId,
        });
      } else {
        navigation.navigate('ComicReader', {
          bookId: `comic-${issueId}`,
          extractedDir: result.extractedDir,
          startPage,
          totalPages: result.totalPages,
          streaming: false,
          kind: 'comic',
          issueId,
        });
      }
    } catch (err) {
      Alert.alert("Can't open comic", describeComicReadError(err));
    } finally {
      setReadLoading(false);
      setReadProgress(null);
    }
  };

  const handleDownload = async () => {
    if (!issue) return;
    setDownloading(true);
    try {
      await downloadComic(issue, headers, volumeTitle);
    } catch (err) {
      Alert.alert("Can't download comic", describeComicReadError(err));
    } finally {
      setDownloading(false);
    }
  };

  const handleRemoveDownload = async () => {
    try {
      await removeDownloadedComic(issueId);
    } catch (err) {
      Alert.alert('Error', describeComicReadError(err));
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8b5e3c" />
      </View>
    );
  }

  if (error || !issue) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Issue not found'}</Text>
      </View>
    );
  }

  const serverAvailable = issue.files.length > 0;
  const canRead = serverAvailable || isDownloaded;
  const isDownloadingThis = downloading && activeIssueId === issueId;
  const availabilityBadge = isDownloaded
    ? { label: 'Downloaded', container: styles.badgeDownloaded, text: styles.badgeTextDownloaded }
    : serverAvailable
      ? { label: 'Available', container: styles.badgeAvailable, text: styles.badgeTextAvailable }
      : { label: 'Missing', container: styles.badgeMissing, text: styles.badgeTextMissing };
  const readStatusLabel = issueProgress?.completed
    ? 'Read'
    : issueProgress && issueProgress.page > 0
      ? issueProgress.total
        ? `Reading ${issueProgress.page}/${issueProgress.total}`
        : `Reading p.${issueProgress.page}`
      : null;
  const description = issue.description ? stripHtml(issue.description) : '';
  const fileSize = formatSize(issue.files.reduce((sum, f) => sum + (f.size || 0), 0));
  // Kapowarr has no per-issue cover endpoint; issues share the volume cover.
  const coverUri = getVolumeCoverUrl(volumeId);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Image
          source={{ uri: coverUri, headers }}
          style={styles.cover}
          resizeMode="cover"
        />
        <View style={styles.meta}>
          <Text style={styles.issueNumber}>#{issue.issue_number}</Text>
          <Text style={styles.title}>{issue.title || 'Untitled'}</Text>
          {volumeTitle ? <Text style={styles.subtitle}>{volumeTitle}</Text> : null}
          {issue.date ? <Text style={styles.detail}>{issue.date}</Text> : null}
          {fileSize ? <Text style={styles.detail}>Size: {fileSize}</Text> : null}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, availabilityBadge.container]}>
              <Text style={[styles.badgeText, availabilityBadge.text]}>
                {availabilityBadge.label}
              </Text>
            </View>
            {readStatusLabel && (
              <View style={[styles.badge, styles.badgeRead]}>
                <Text style={[styles.badgeText, styles.badgeTextRead]}>{readStatusLabel}</Text>
              </View>
            )}
          </View>
          {canRead && (
            <TouchableOpacity
              style={[styles.readButton, readLoading && styles.readButtonDisabled]}
              onPress={handleRead}
              disabled={readLoading}
              accessibilityLabel="Read comic issue"
            >
              {readLoading ? (
                <View style={styles.readButtonInner}>
                  <ActivityIndicator size="small" color="#fff" />
                  {readProgress !== null && (
                    <Text style={styles.readButtonText}>
                      {Math.round(readProgress * 100)}%
                    </Text>
                  )}
                </View>
              ) : (
                <Text style={styles.readButtonText}>Read</Text>
              )}
            </TouchableOpacity>
          )}
          {isDownloaded ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleRemoveDownload}
              accessibilityLabel="Remove downloaded comic"
            >
              <Text style={styles.secondaryButtonText}>Remove Download</Text>
            </TouchableOpacity>
          ) : serverAvailable ? (
            <TouchableOpacity
              style={[styles.secondaryButton, downloading && styles.readButtonDisabled]}
              onPress={handleDownload}
              disabled={downloading}
              accessibilityLabel="Download comic issue"
            >
              {isDownloadingThis ? (
                <View style={styles.readButtonInner}>
                  <ActivityIndicator size="small" color="#333" />
                  <Text style={styles.secondaryButtonText}>
                    {Math.round(downloadStoreProgress * 100)}%
                  </Text>
                </View>
              ) : (
                <Text style={styles.secondaryButtonText}>Download</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {description ? <Text style={styles.summary}>{description}</Text> : null}
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
  issueNumber: { fontSize: 20, color: '#8b5e3c', fontWeight: '700', marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '600', color: '#222', marginBottom: 10 },
  subtitle: { fontSize: 20, color: '#555', marginBottom: 10 },
  detail: { fontSize: 18, color: '#777', marginBottom: 6 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badgeDownloaded: { backgroundColor: '#8b5e3c' },
  badgeAvailable: { backgroundColor: '#d8cdbe' },
  badgeMissing: { backgroundColor: '#e8e4de' },
  badgeRead: { backgroundColor: '#4a7c59' },
  badgeText: { fontSize: 14, fontWeight: '600' },
  badgeTextDownloaded: { color: '#fff' },
  badgeTextAvailable: { color: '#5c4a33' },
  badgeTextMissing: { color: '#999' },
  badgeTextRead: { color: '#fff' },
  summary: { fontSize: 21, color: '#444', lineHeight: 30, padding: 16, paddingTop: 0 },
  readButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#8b5e3c',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  readButtonDisabled: { opacity: 0.7 },
  readButtonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8e4de',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    minWidth: 80,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d5d0c8',
  },
  secondaryButtonText: { color: '#333', fontSize: 16, fontWeight: '600' },
});

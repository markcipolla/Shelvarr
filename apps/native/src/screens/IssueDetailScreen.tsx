import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import type { KapowarrIssue } from '@shelvarr/types';
import { fetchComicIssue, getIssueCoverUrl, getVolumeCoverUrl } from '../services/api/comics';
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
  const [coverFailed, setCoverFailed] = useState(false);
  const headers = useAuthHeaders();

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

  const downloaded = issue.files.length > 0;
  const description = issue.description ? stripHtml(issue.description) : '';
  const fileSize = formatSize(issue.files.reduce((sum, f) => sum + (f.size || 0), 0));
  const coverUri = coverFailed ? getVolumeCoverUrl(volumeId) : getIssueCoverUrl(issue.id);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Image
          source={{ uri: coverUri, headers }}
          style={styles.cover}
          resizeMode="cover"
          onError={() => setCoverFailed(true)}
        />
        <View style={styles.meta}>
          <Text style={styles.issueNumber}>#{issue.issue_number}</Text>
          <Text style={styles.title}>{issue.title || 'Untitled'}</Text>
          {volumeTitle ? <Text style={styles.subtitle}>{volumeTitle}</Text> : null}
          {issue.date ? <Text style={styles.detail}>{issue.date}</Text> : null}
          {fileSize ? <Text style={styles.detail}>Size: {fileSize}</Text> : null}
          <View style={[styles.badge, downloaded ? styles.badgeDownloaded : styles.badgeMissing]}>
            <Text style={[styles.badgeText, downloaded ? styles.badgeTextDownloaded : styles.badgeTextMissing]}>
              {downloaded ? 'Downloaded' : 'Missing'}
            </Text>
          </View>
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
  badgeDownloaded: { backgroundColor: '#8b5e3c' },
  badgeMissing: { backgroundColor: '#e8e4de' },
  badgeText: { fontSize: 14, fontWeight: '600' },
  badgeTextDownloaded: { color: '#fff' },
  badgeTextMissing: { color: '#999' },
  summary: { fontSize: 21, color: '#444', lineHeight: 30, padding: 16, paddingTop: 0 },
});

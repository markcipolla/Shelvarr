import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import {
  searchDownloads,
  queueDownload,
  getDownloadSourceStatuses,
  DownloadResult,
  DownloadSourceStatus,
  SearchLinks,
} from '../services/api/downloads';
import { updateWanted } from '../services/api/wanted';
import { fetchLibraries } from '../services/api/libraries';
import { Library } from '../types/komga';

type Props = NativeStackScreenProps<RootStackParamList, 'DownloadSearch'>;

const SOURCE_LABELS: Record<string, string> = {
  zlibrary: 'Z-Library',
  annas: "Anna's Archive",
  libgen: 'LibGen',
};

const STATUS_DOT: Record<string, string> = {
  up: '#3d8b3d',
  degraded: '#c79a2e',
  down: '#a33',
  unknown: '#999',
};

export default function DownloadSearchScreen({ route }: Props) {
  const { wantedBookId, title, author, isbn } = route.params;

  const [results, setResults] = useState<DownloadResult[]>([]);
  const [links, setLinks] = useState<SearchLinks | null>(null);
  const [statuses, setStatuses] = useState<DownloadSourceStatus[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const query = `${title} ${author || ''}`.trim();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [libs, srcStatuses, search] = await Promise.all([
      fetchLibraries().catch(() => [] as Library[]),
      getDownloadSourceStatuses(),
      searchDownloads(query, isbn),
    ]);

    setLibraries(libs);
    setSelectedLibraryId((prev) => prev ?? (libs.length > 0 ? libs[0].id : null));
    setStatuses(srcStatuses);

    if (search.success) {
      setResults(search.results || []);
      setLinks(search.links || null);
    } else {
      setError(search.error || 'Download search failed');
      setLinks(search.links || null);
    }
    setLoading(false);
  }, [query, isbn]);

  useEffect(() => {
    load();
  }, [load]);

  const statusForSource = (source: string): string =>
    statuses.find((s) => s.name === source || s.name.startsWith(source))?.status || 'unknown';

  const openLink = (url?: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => Alert.alert('Could not open link'));
  };

  const handleDownload = useCallback(
    async (result: DownloadResult) => {
      // Only LibGen supports server-side queuing; others open in the browser.
      if (result.source !== 'libgen') {
        openLink(result.downloadUrl || result.searchUrl);
        return;
      }

      if (!selectedLibraryId) {
        Alert.alert('Select a library', 'Choose a library to download into first.');
        return;
      }

      setDownloadingId(result.id);
      const res = await queueDownload({
        source: result.source,
        md5: result.md5 || result.id,
        title: result.title,
        author: result.author,
        extension: result.extension,
        libraryId: Number(selectedLibraryId),
        wantedBookId,
      });
      setDownloadingId(null);

      if (res.success) {
        // Reflect that we're now actively chasing this book.
        updateWanted(wantedBookId, { status: 'searching' });
        Alert.alert('Download queued', `"${result.title}" was queued for download.`);
      } else {
        Alert.alert('Could not queue download', res.error || 'Failed to queue download');
      }
    },
    [selectedLibraryId, wantedBookId]
  );

  const renderItem = ({ item }: { item: DownloadResult }) => {
    const isLibgen = item.source === 'libgen';
    const isDownloading = downloadingId === item.id;
    return (
      <View style={styles.row}>
        <View style={styles.resultHeader}>
          <Text style={styles.resultTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.sourceTag}>
            <Text style={styles.sourceTagText}>{SOURCE_LABELS[item.source] || item.source}</Text>
          </View>
        </View>
        {item.author ? (
          <Text style={styles.resultAuthor} numberOfLines={1}>
            {item.author}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          {item.extension ? (
            <Text style={styles.metaText}>{item.extension.toUpperCase()}</Text>
          ) : null}
          {item.size ? <Text style={styles.metaText}>{item.size}</Text> : null}
          {item.year ? <Text style={styles.metaText}>{item.year}</Text> : null}
          {item.language ? <Text style={styles.metaText}>{item.language}</Text> : null}
        </View>
        <View style={styles.resultButtons}>
          <TouchableOpacity
            style={[styles.dlButton, isDownloading && styles.buttonDisabled]}
            disabled={isDownloading}
            onPress={() => handleDownload(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.dlButtonText}>
              {isDownloading
                ? 'Queuing…'
                : isLibgen
                  ? '⬇ Download'
                  : '↗ Open in browser'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.viewButton}
            onPress={() => openLink(item.searchUrl)}
            activeOpacity={0.7}
          >
            <Text style={styles.viewButtonText}>View</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.searchingFor} numberOfLines={2}>
          {title}
          {author ? <Text style={styles.searchingForAuthor}>{`  by ${author}`}</Text> : null}
        </Text>

        {libraries.length > 0 && (
          <>
            <Text style={styles.label}>Download to library</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.libRow}
              contentContainerStyle={styles.libRowContent}
            >
              {libraries.map((lib) => {
                const selected = lib.id === selectedLibraryId;
                return (
                  <TouchableOpacity
                    key={lib.id}
                    style={[styles.libPill, selected && styles.libPillSelected]}
                    onPress={() => setSelectedLibraryId(lib.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.libPillText, selected && styles.libPillTextSelected]}>
                      {lib.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {links && (
          <>
            <Text style={styles.label}>Quick search links</Text>
            <View style={styles.quickLinks}>
              {(['libgen', 'annas', 'zlibrary'] as const).map((src) => (
                <TouchableOpacity
                  key={src}
                  style={styles.quickLink}
                  onPress={() => openLink(links[src])}
                  activeOpacity={0.7}
                >
                  <View style={[styles.statusDot, { backgroundColor: STATUS_DOT[statusForSource(src)] }]} />
                  <Text style={styles.quickLinkText}>{SOURCE_LABELS[src]}</Text>
                  <Text style={styles.quickLinkArrow}>↗</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8b5e3c" />
          <Text style={styles.loadingText}>Searching download sources…</Text>
        </View>
      ) : error && results.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.message}>Try the quick search links above.</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.message}>
            No download results found.{'\n'}Try the quick search links above.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item, index) => `${item.source}-${item.id}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb' },
  center: { flex: 1, padding: 32, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#666' },
  message: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginTop: 8 },
  errorText: { fontSize: 16, color: '#a33', textAlign: 'center', lineHeight: 22 },
  headerCard: {
    backgroundColor: '#e8e4de',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#d5d0c8',
  },
  searchingFor: { fontSize: 16, fontWeight: '600', color: '#222', lineHeight: 21 },
  searchingForAuthor: { fontSize: 14, fontWeight: '400', color: '#666' },
  label: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },
  libRow: { flexGrow: 0 },
  libRowContent: { paddingRight: 8 },
  libPill: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#d5d0c8',
  },
  libPillSelected: { backgroundColor: '#8b5e3c', borderColor: '#8b5e3c' },
  libPillText: { fontSize: 13, color: '#555', fontWeight: '500' },
  libPillTextSelected: { color: '#fff' },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap' },
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#d5d0c8',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  quickLinkText: { fontSize: 13, color: '#333', fontWeight: '500' },
  quickLinkArrow: { fontSize: 12, color: '#888', marginLeft: 6 },
  list: { padding: 12 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e8e4de',
  },
  resultHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  resultTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#222', lineHeight: 19 },
  sourceTag: {
    backgroundColor: '#efe7da',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 8,
  },
  sourceTagText: { fontSize: 11, color: '#8b5e3c', fontWeight: '600' },
  resultAuthor: { fontSize: 13, color: '#555', marginTop: 3 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  metaText: { fontSize: 12, color: '#888', marginRight: 12 },
  resultButtons: { flexDirection: 'row', marginTop: 10, alignItems: 'center' },
  dlButton: {
    backgroundColor: '#8b5e3c',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dlButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
  viewButton: {
    marginLeft: 8,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#d5d0c8',
  },
  viewButtonText: { color: '#555', fontSize: 13, fontWeight: '600' },
});

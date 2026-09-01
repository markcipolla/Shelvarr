import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useSettingsStore } from '../stores/useSettingsStore';
import { fetchComics, ComicVolumeSummary } from '../services/api/comics';
import { getCachedComics, searchCachedComics } from '../services/db/comics';
import { useComicDownloadStore } from '../stores/useComicDownloadStore';
import {
  listDownloadedComicVolumes,
  withDownloadedComicVolumes,
} from '../services/offlineLibrary';
import ComicCard from '../components/ComicCard';
import ComicGridSkeleton from '../components/ComicGridSkeleton';
import { useColumns } from '../hooks/useColumns';
import { padDataForGrid, isPlaceholder } from '../utils/gridHelpers';

type Props = NativeStackScreenProps<RootStackParamList, 'Comics'>;

/** Wait this long after the last keystroke before asking the server. */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * Downloaded issues, read at call time rather than subscribed to: the screen
 * reloads on focus anyway, and a download started elsewhere shouldn't refetch
 * the library mid-search.
 */
function comicDownloads() {
  return useComicDownloadStore.getState().downloads;
}

export default function ComicsScreen({ navigation }: Props) {
  const shelvarrUrl = useSettingsStore((s) => s.shelvarrUrl);
  const [volumes, setVolumes] = useState<ComicVolumeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const columns = useColumns();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether the last render had a query, so clearing the box can be told
  // apart from the empty query the screen starts with.
  const wasSearchingRef = useRef(false);

  const loadData = useCallback(async () => {
    if (!shelvarrUrl) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Stale-while-revalidate: paint cached comics instantly so the grid
    // appears without waiting on the network, then refresh in the background.
    try {
      const cached = await getCachedComics();
      if (cached.length > 0) {
        setVolumes(cached);
        setLoading(false);
      }
    } catch {
      // Ignore cache-read failures; the network fetch below still runs.
    }

    try {
      const res = await fetchComics();
      // A cached response means the server was unreachable; make sure issues
      // downloaded to this device are listed even if the cache lacks them.
      setVolumes(res.cached ? withDownloadedComicVolumes(res.volumes, comicDownloads()) : res.volumes);
      setError(res.error || null);
    } catch (err) {
      console.error('Failed to load comics:', err);
      // Nothing cached either — downloads are all that's left to show.
      const downloaded = listDownloadedComicVolumes(comicDownloads());
      if (downloaded.length > 0) {
        setVolumes(downloaded);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load comics');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shelvarrUrl]);

  /**
   * Search the library.
   *
   * Falls back to the on-device cache when the server can't be reached, so
   * searching keeps working offline over whatever has been synced.
   */
  const runSearch = useCallback(async (query: string) => {
    try {
      const res = await fetchComics(query);
      setVolumes(res.cached
        ? withDownloadedComicVolumes(res.volumes, comicDownloads(), query)
        : res.volumes);
      setError(res.error || null);
    } catch {
      try {
        const cached = await searchCachedComics(query);
        setVolumes(withDownloadedComicVolumes(cached, comicDownloads(), query));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      }
    } finally {
      setSearching(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Don't clobber search results when returning from a comic.
      if (search.trim()) return;
      setRefreshing(true);
      loadData();
    }, [loadData, search])
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = search.trim();
    if (!query) {
      setSearching(false);
      // Only reload when the user actually cleared a query. On first render
      // the box is empty anyway, and the focus effect is already loading.
      if (wasSearchingRef.current) {
        wasSearchingRef.current = false;
        loadData();
      }
      return;
    }

    wasSearchingRef.current = true;
    setSearching(true);
    debounceRef.current = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);

    /* istanbul ignore next */
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // `loadData` is stable per server URL; re-running on it would refetch the
    // whole library on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, runSearch]);

  if (!shelvarrUrl) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>
          No Shelvarr server configured.{'\n'}Tap the gear icon to set your Shelvarr URL.
        </Text>
      </View>
    );
  }

  const searchInput = (
    <TextInput
      style={styles.searchBar}
      placeholder="Search comics…"
      placeholderTextColor="#888"
      value={search}
      onChangeText={setSearch}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      clearButtonMode="while-editing"
    />
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.searchWrap}>{searchInput}</View>
        <ComicGridSkeleton />
      </View>
    );
  }

  const isSearching = search.trim().length > 0;

  /* istanbul ignore next -- columnWrapperStyle only applies when columns > 1 */
  const colWrapper = columns > 1 ? styles.row : undefined;

  const gridItems = volumes.map((v) => ({ id: String(v.id), volume: v }));

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>{searchInput}</View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : searching ? (
        <ActivityIndicator size="small" color="#8b5e3c" style={styles.inlineSpinner} />
      ) : volumes.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.message}>
            {isSearching ? `No comics match “${search.trim()}”.` : 'No comics found.'}
          </Text>
        </View>
      ) : (
        <FlatList
          key={`comics-${columns}`}
          data={padDataForGrid(gridItems, columns)}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            isPlaceholder(item) ? (
              <ComicCard volume={{} as ComicVolumeSummary} onPress={() => {}} fill placeholder />
            ) : (
              <ComicCard
                volume={(item as { volume: ComicVolumeSummary }).volume}
                fill
                onPress={() =>
                  navigation.navigate('ComicDetail', {
                    volumeId: (item as { volume: ComicVolumeSummary }).volume.id,
                  })
                }
              />
            )
          }
          contentContainerStyle={styles.list}
          columnWrapperStyle={colWrapper}
          ListHeaderComponent={
            refreshing && !isSearching ? (
              <ActivityIndicator size="small" color="#8b5e3c" style={styles.inlineSpinner} />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb' },
  searchWrap: { paddingHorizontal: 12, paddingTop: 12 },
  searchBar: {
    backgroundColor: '#fff',
    color: '#222',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#d5d0c8',
  },
  center: {
    flex: 1,
    backgroundColor: '#f5f1eb',
    padding: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 26,
  },
  errorText: {
    fontSize: 16,
    color: '#a33',
    textAlign: 'center',
    lineHeight: 22,
  },
  list: { padding: 12 },
  row: { gap: 12 },
  inlineSpinner: { marginVertical: 8 },
});

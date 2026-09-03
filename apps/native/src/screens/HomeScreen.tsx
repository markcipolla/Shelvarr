import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Book } from '../types/api';
import { searchBooks, fetchInProgressBooks, fetchNextUpBooks, fetchRecentlyAdded } from '../services/api/books';
import {
  fetchComics,
  fetchRecentComics,
  fetchInProgressComics,
  fetchNextUpComics,
  ComicVolumeSummary,
  InProgressComic,
  NextUpComic,
} from '../services/api/comics';
import BookCard from '../components/BookCard';
import ComicCard from '../components/ComicCard';
import { useColumns } from '../hooks/useColumns';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useDownloadStore } from '../stores/useDownloadStore';
import { useNextUpStore } from '../stores/useNextUpStore';
import { searchDownloadedBooks } from '../services/offlineLibrary';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

/** Resume badge for an in-progress comic, e.g. "#3 · 7/22" or "#3 · p.7". */
function inProgressComicLabel(item: InProgressComic): string {
  const parts: string[] = [];
  if (item.issueNumber) parts.push(`#${item.issueNumber}`);
  if (item.total) parts.push(`${item.page}/${item.total}`);
  else if (item.page > 0) parts.push(`p.${item.page}`);
  return parts.join(' · ') || 'Reading';
}

export default function HomeScreen({ navigation }: Props) {
  const shelvarrUrl = useSettingsStore((s) => s.shelvarrUrl);
  const downloadsMap = useDownloadStore((s) => s.downloads);
  const downloadedBooks = useMemo(
    () =>
      Object.values(downloadsMap)
        .filter((d) => d.persisted && d.book)
        .sort((a, b) => b.downloadedAt - a.downloadedAt)
        .map((d) => d.book as Book),
    [downloadsMap]
  );
  const dismissedBooks = useNextUpStore((s) => s.dismissedBooks);
  const dismissedComics = useNextUpStore((s) => s.dismissedComics);
  const dismissBook = useNextUpStore((s) => s.dismissBook);
  const dismissComic = useNextUpStore((s) => s.dismissComic);
  const [inProgress, setInProgress] = useState<Book[]>([]);
  const [nextUpBooks, setNextUpBooks] = useState<Book[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<Book[]>([]);
  const [recentComics, setRecentComics] = useState<ComicVolumeSummary[]>([]);
  const [inProgressComics, setInProgressComics] = useState<InProgressComic[]>([]);
  const [nextUpComics, setNextUpComics] = useState<NextUpComic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const columns = useColumns();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = (screenWidth - 32 - 12 * (columns - 1)) / columns;
  const [searchResults, setSearchResults] = useState<Book[]>([]);
  const [comicSearchResults, setComicSearchResults] = useState<ComicVolumeSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    if (!shelvarrUrl) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [inProgressRes, nextUpBooksRes, recentRes, comicsRes, inProgressComicsRes, nextUpComicsRes] =
        await Promise.all([
          fetchInProgressBooks(),
          fetchNextUpBooks().catch((err) => {
            console.error('Failed to load next-up books:', err);
            return null;
          }),
          fetchRecentlyAdded(),
          fetchRecentComics(10).catch((err) => {
            console.error('Failed to load recent comics:', err);
            return null;
          }),
          fetchInProgressComics(10).catch((err) => {
            console.error('Failed to load in-progress comics:', err);
            return [];
          }),
          fetchNextUpComics(10).catch((err) => {
            console.error('Failed to load next-up comics:', err);
            return [];
          }),
        ]);
      const inProgressIds = new Set(inProgressRes.content.map((b) => b.id));
      const nextUp = (nextUpBooksRes?.content ?? []).filter((b) => !inProgressIds.has(b.id));
      const nextUpIds = new Set(nextUp.map((b) => b.id));
      setInProgress(inProgressRes.content);
      setNextUpBooks(nextUp);
      setRecentlyAdded(
        recentRes.content.filter((b) => !inProgressIds.has(b.id) && !nextUpIds.has(b.id))
      );
      setRecentComics(comicsRes?.volumes ?? []);
      setInProgressComics(inProgressComicsRes);
      setNextUpComics(nextUpComicsRes);
    } catch (err) {
      console.error('Failed to load home data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shelvarrUrl]);

  useFocusEffect(
    useCallback(() => {
      setRefreshing(true);
      loadData();
    }, [loadData])
  );

  const performSearch = useCallback(async (query: string, page: number) => {
    /* istanbul ignore next -- useEffect handles empty queries before calling performSearch */
    if (!query.trim()) {
      setSearchResults([]);
      setComicSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      if (page === 0) {
        // Books and comics come from different sources; fetch both. Neither
        // failure may break the other half of the search.
        const [bookRes, comicRes] = await Promise.all([
          searchBooks(query, 0).catch((err) => {
            console.error('Book search failed:', err);
            return null;
          }),
          fetchComics(query).catch((err) => {
            console.error('Comic search failed:', err);
            return null;
          }),
        ]);
        if (bookRes) {
          setSearchResults(bookRes.content);
          setSearchHasMore(!bookRes.last);
        } else {
          // Offline: search the books whose files are on this device. There
          // are no further pages to ask the server for.
          setSearchResults(searchDownloadedBooks(useDownloadStore.getState().downloads, query));
          setSearchHasMore(false);
        }
        setSearchPage(0);
        setComicSearchResults(comicRes?.volumes ?? []);
      } else {
        const result = await searchBooks(query, page);
        setSearchResults((prev) => [...prev, ...result.content]);
        setSearchHasMore(!result.last);
        setSearchPage(page);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search.trim()) {
      setSearchResults([]);
      setComicSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      performSearch(search, 0);
    }, 400);
    /* istanbul ignore next */
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, performSearch]);

  /* istanbul ignore next */
  const loadMoreResults = () => {
    if (!searchHasMore || searching) return;
    performSearch(search, searchPage + 1);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const searchInput = (
    <TextInput
      style={styles.searchBar}
      placeholder="Search all books, comics, authors and series..."
      placeholderTextColor="#888"
      value={search}
      onChangeText={setSearch}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
    />
  );

  const visibleNextUpBooks = useMemo(
    () => nextUpBooks.filter((b) => !dismissedBooks[b.id]),
    [nextUpBooks, dismissedBooks]
  );
  const visibleNextUpComics = useMemo(
    () => nextUpComics.filter((c) => !dismissedComics[c.volume.id]),
    [nextUpComics, dismissedComics]
  );

  if (!shelvarrUrl) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 18, color: '#666', textAlign: 'center', paddingHorizontal: 32 }}>
          No server configured.{'\n'}Tap the gear icon to set your Shelvarr URL.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8b5e3c" />
      </View>
    );
  }

  const isSearching = search.trim().length > 0;

  if (isSearching) {
    const bookResults = searchResults;
    const comicResults = comicSearchResults;
    const hasResults = bookResults.length > 0 || comicResults.length > 0;

    const queryLower = search.trim().toLowerCase();
    const authorNames = new Set<string>();
    for (const b of searchResults) {
      for (const a of b.metadata.authors || []) {
        if (a.name && a.name.toLowerCase().includes(queryLower)) {
          authorNames.add(a.name);
        }
      }
    }
    const authorResults = Array.from(authorNames);

    const seriesNames = new Set<string>();
    for (const b of searchResults) {
      const name = b.seriesId;
      if (name && name.toLowerCase().includes(queryLower)) {
        seriesNames.add(name);
      }
    }
    const seriesResults = Array.from(seriesNames);

    const renderBookItem = ({ item }: { item: Book }) => (
      <BookCard
        book={item}
        onPress={() => navigation.navigate('BookDetail', { bookId: item.id })}
      />
    );

    let searchBody;
    if (searching && !hasResults) {
      searchBody = (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8b5e3c" />
        </View>
      );
    } else if (!hasResults) {
      searchBody = (
        <View style={styles.center}>
          <Text style={styles.noResults}>No results found</Text>
        </View>
      );
    } else {
      searchBody = (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          {bookResults.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Books</Text>
            <FlatList
              horizontal
              data={bookResults}
              keyExtractor={(item) => item.id}
              renderItem={renderBookItem}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              onEndReached={loadMoreResults}
              onEndReachedThreshold={0.5}
            />
          </View>
        )}

        {comicResults.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Comics</Text>
            <FlatList
              horizontal
              data={comicResults}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <ComicCard
                  volume={item}
                  onPress={() => navigation.navigate('ComicDetail', { volumeId: item.id })}
                />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {authorResults.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Authors</Text>
            <FlatList
              horizontal
              data={authorResults}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{item}</Text>
                </View>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {seriesResults.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Series</Text>
            <FlatList
              horizontal
              data={seriesResults}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{item}</Text>
                </View>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {searching && (
          <ActivityIndicator size="small" color="#8b5e3c" style={styles.searchSpinner} />
        )}
        </ScrollView>
      );
    }

    return (
      <View style={styles.container}>
        <View style={styles.searchBarContainer}>{searchInput}</View>
        {searchBody}
      </View>
    );
  }

  const hasAny =
    inProgress.length > 0 ||
    visibleNextUpBooks.length > 0 ||
    recentlyAdded.length > 0 ||
    downloadedBooks.length > 0 ||
    inProgressComics.length > 0 ||
    visibleNextUpComics.length > 0 ||
    recentComics.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.searchBarContainer}>{searchInput}</View>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5e3c" />}
      >
        {inProgress.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>In Progress</Text>
            <FlatList
              horizontal
              data={inProgress}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={{ width: cardWidth, marginRight: 12 }}>
                  <BookCard
                    book={item}
                    fill
                    onPress={() => navigation.navigate('BookDetail', { bookId: item.id })}
                  />
                </View>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {inProgressComics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>In Progress Comics</Text>
            <FlatList
              horizontal
              data={inProgressComics}
              keyExtractor={(item) => String(item.volume.id)}
              renderItem={({ item }) => (
                <View style={{ width: cardWidth, marginRight: 12 }}>
                  <ComicCard
                    volume={item.volume}
                    fill
                    progressLabel={inProgressComicLabel(item)}
                    onPress={() => navigation.navigate('ComicDetail', { volumeId: item.volume.id })}
                  />
                </View>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {visibleNextUpBooks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Next Up</Text>
            <FlatList
              horizontal
              data={visibleNextUpBooks}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={{ width: cardWidth, marginRight: 12 }}>
                  <BookCard
                    book={item}
                    fill
                    onPress={() => navigation.navigate('BookDetail', { bookId: item.id })}
                    onRemove={() => dismissBook(item.id)}
                  />
                </View>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {visibleNextUpComics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Next Up Comics</Text>
            <FlatList
              horizontal
              data={visibleNextUpComics}
              keyExtractor={(item) => String(item.volume.id)}
              renderItem={({ item }) => (
                <View style={{ width: cardWidth, marginRight: 12 }}>
                  <ComicCard
                    volume={item.volume}
                    fill
                    progressLabel={item.issueNumber ? `Next #${item.issueNumber}` : 'Next up'}
                    onPress={() =>
                      navigation.navigate('IssueDetail', {
                        volumeId: item.volume.id,
                        issueId: item.issueId,
                        volumeTitle: item.volume.title,
                      })
                    }
                    onRemove={() => dismissComic(item.volume.id)}
                  />
                </View>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {downloadedBooks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Downloaded</Text>
            <FlatList
              horizontal
              data={downloadedBooks}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={{ width: cardWidth, marginRight: 12 }}>
                  <BookCard
                    book={item}
                    fill
                    onPress={() => navigation.navigate('BookDetail', { bookId: item.id })}
                  />
                </View>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {recentlyAdded.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recently Added</Text>
            <FlatList
              horizontal
              data={recentlyAdded}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={{ width: cardWidth, marginRight: 12 }}>
                  <BookCard
                    book={item}
                    fill
                    onPress={() => navigation.navigate('BookDetail', { bookId: item.id })}
                  />
                </View>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {recentComics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recently Added Comics</Text>
            <FlatList
              horizontal
              data={recentComics}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <View style={{ width: cardWidth, marginRight: 12 }}>
                  <ComicCard
                    volume={item}
                    fill
                    onPress={() => navigation.navigate('ComicDetail', { volumeId: item.id })}
                  />
                </View>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {!hasAny && (
          refreshing ? (
            <ActivityIndicator size="large" color="#8b5e3c" style={styles.inlineSpinner} />
          ) : (
            <Text style={styles.emptyText}>No books yet</Text>
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb' },
  scrollContent: { paddingTop: 16, paddingBottom: 80 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f1eb' },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 21,
    fontWeight: '500',
    color: '#777',
    paddingHorizontal: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  horizontalList: { paddingHorizontal: 16, paddingBottom: 8 },
  emptyText: { color: '#999', fontSize: 20, paddingHorizontal: 16, paddingTop: 32, textAlign: 'center' },
  searchBarContainer: {
    backgroundColor: '#e8e4de',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#d5d0c8',
  },
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
  searchSpinner: { marginTop: 20, marginBottom: 20 },
  inlineSpinner: { marginTop: 40 },
  noResults: { color: '#888', fontSize: 22, textAlign: 'center' },
  pill: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d5d0c8',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    justifyContent: 'center',
  },
  pillText: { fontSize: 16, color: '#222' },
});

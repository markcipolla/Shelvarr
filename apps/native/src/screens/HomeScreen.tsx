import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { Book } from '../types/komga';
import { searchBooks, fetchInProgressBooks, fetchRecentlyAdded } from '../services/api/books';
import BookCard from '../components/BookCard';
import { useColumns } from '../hooks/useColumns';
import { useSettingsStore } from '../stores/useSettingsStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const shelvarrUrl = useSettingsStore((s) => s.shelvarrUrl);
  const [inProgress, setInProgress] = useState<Book[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const columns = useColumns();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = (screenWidth - 32 - 12 * (columns - 1)) / columns;
  const [searchResults, setSearchResults] = useState<Book[]>([]);
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
      const [inProgressRes, recentRes] = await Promise.all([
        fetchInProgressBooks(),
        fetchRecentlyAdded(),
      ]);
      const inProgressIds = new Set(inProgressRes.content.map((b) => b.id));
      setInProgress(inProgressRes.content);
      setRecentlyAdded(recentRes.content.filter((b) => !inProgressIds.has(b.id)));
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
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const result = await searchBooks(query, page);
      setSearchResults((prev) => (page === 0 ? result.content : [...prev, ...result.content]));
      setSearchHasMore(!result.last);
      setSearchPage(page);
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
    const comicMediaTypes = new Set(['application/x-cbz', 'application/x-cbr', 'application/x-cbt']);
    const isComic = (b: Book) => comicMediaTypes.has(b.media.mediaType);
    const bookResults = searchResults.filter((b) => !isComic(b));
    const comicResults = searchResults.filter(isComic);

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
    if (searching && searchResults.length === 0) {
      searchBody = (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8b5e3c" />
        </View>
      );
    } else if (searchResults.length === 0) {
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
              keyExtractor={(item) => item.id}
              renderItem={renderBookItem}
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

  const hasAny = inProgress.length > 0 || recentlyAdded.length > 0;

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

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Library, Book } from '../types/komga';
import { fetchLibraries } from '../services/api/libraries';
import { fetchOnDeck, searchBooks, fetchInProgressBooks, fetchRecentlyAdded } from '../services/api/books';
import BookCard from '../components/BookCard';
import { useColumns } from '../hooks/useColumns';
import { padDataForGrid, isPlaceholder } from '../utils/gridHelpers';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

interface LibraryData {
  library: Library;
  inProgress: Book[];
  onDeck: Book[];
  recentlyAdded: Book[];
}

export default function HomeScreen({ navigation }: Props) {
  const [libraryData, setLibraryData] = useState<LibraryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const columns = useColumns();
  const { width: screenWidth } = useWindowDimensions();
  // Card width: screen minus padding (16*2) and gaps (12*(columns-1)), divided by columns
  const cardWidth = (screenWidth - 32 - 12 * (columns - 1)) / columns;
  const [searchResults, setSearchResults] = useState<Book[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const libraries = await fetchLibraries();

      // Fetch in-progress and recently added per library in parallel
      const data = await Promise.all(
        libraries.map(async (library) => {
          const [inProgressRes, onDeckRes, recentRes] = await Promise.all([
            fetchInProgressBooks(library.id),
            fetchOnDeck(0, library.id),
            fetchRecentlyAdded(library.id),
          ]);

          // Dedupe: on-deck excludes in-progress, recently added excludes both
          const inProgressIds = new Set(inProgressRes.content.map((b) => b.id));
          const onDeck = onDeckRes.content.filter((b) => !inProgressIds.has(b.id));
          const shownIds = new Set([...inProgressIds, ...onDeck.map((b) => b.id)]);
          const recentlyAdded = recentRes.content.filter((b) => !shownIds.has(b.id));

          return { library, inProgress: inProgressRes.content, onDeck, recentlyAdded };
        })
      );

      setLibraryData(data);
    } catch (err) {
      console.error('Failed to load home data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload data every time the screen gains focus (e.g. after reading a book)
  useFocusEffect(
    useCallback(() => {
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

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <TextInput
          style={styles.searchBar}
          placeholder="Search all books..."
          placeholderTextColor="#888"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      ),
    });
  }, [navigation, search]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8b5e3c" />
      </View>
    );
  }

  const isSearching = search.trim().length > 0;

  if (isSearching) {
    /* istanbul ignore next */
    const searchColWrapper = columns > 1 ? styles.searchRow : undefined;
    /* istanbul ignore next */
    const renderSearchItem = ({ item }: { item: any }) =>
      isPlaceholder(item) ? (
        <BookCard book={item as any} onPress={() => {}} fill placeholder />
      ) : (
        <BookCard
          book={item as Book}
          fill
          onPress={() => navigation.navigate('BookDetail', { bookId: (item as Book).id })}
        />
      );
    return (
      <FlatList
        key={`search-${columns}`}
        style={styles.container}
        data={padDataForGrid(searchResults, columns)}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        renderItem={renderSearchItem}
        ListHeaderComponent={
          searching && searchResults.length === 0 ? (
            <ActivityIndicator size="large" color="#8b5e3c" style={styles.searchSpinner} />
          ) : !searching && searchResults.length === 0 ? (
            <Text style={styles.noResults}>No results found</Text>
          ) : null
        }
        ListFooterComponent={
          searching && searchResults.length > 0 ? (
            <ActivityIndicator size="small" color="#8b5e3c" style={styles.searchSpinner} />
          ) : null
        }
        contentContainerStyle={styles.searchList}
        columnWrapperStyle={searchColWrapper}
        onEndReached={loadMoreResults}
        onEndReachedThreshold={0.5}
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5e3c" />}
    >
      {libraryData.map(({ library, inProgress, onDeck, recentlyAdded }) => (
        <View key={library.id} style={styles.librarySection}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Library', { libraryId: library.id, libraryName: library.name })}
          >
            <Text style={styles.libraryTitle}>{library.name} ›</Text>
          </TouchableOpacity>

          {inProgress.length > 0 && (
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>In Progress</Text>
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

          {onDeck.length > 0 && (
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>On Deck</Text>
              <FlatList
                horizontal
                data={onDeck}
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
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>Recently Added</Text>
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

          {inProgress.length === 0 && onDeck.length === 0 && recentlyAdded.length === 0 && (
            <Text style={styles.emptyText}>No books yet</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb' },
  scrollContent: { paddingBottom: 80 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f1eb' },
  librarySection: {
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#d5d0c8',
  },
  libraryTitle: {
    fontSize: 30,
    fontWeight: '600',
    color: '#222',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  subsection: { marginTop: 4 },
  subsectionTitle: {
    fontSize: 21,
    fontWeight: '500',
    color: '#777',
    paddingHorizontal: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  horizontalList: { paddingHorizontal: 16, paddingBottom: 8 },
  emptyText: { color: '#999', fontSize: 20, paddingHorizontal: 16, paddingBottom: 8 },
  searchBar: {
    flex: 1,
    backgroundColor: '#fff',
    color: '#222',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 22,
    borderWidth: 1,
    borderColor: '#d5d0c8',
  },
  searchList: { padding: 12 },
  searchRow: { gap: 12 },
  searchSpinner: { marginTop: 40 },
  noResults: { color: '#888', fontSize: 22, textAlign: 'center', marginTop: 40 },
});

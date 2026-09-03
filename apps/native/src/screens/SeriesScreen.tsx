import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, FlatList, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Book } from '../types/api';
import { fetchBooksForSeries } from '../services/api/books';
import BookCard from '../components/BookCard';
import { useColumns } from '../hooks/useColumns';

type Props = NativeStackScreenProps<RootStackParamList, 'Series'>;

export default function SeriesScreen({ route, navigation }: Props) {
  const { seriesId, seriesName } = route.params;
  const [books, setBooks] = useState<Book[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const columns = useColumns();

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <TextInput
          style={styles.searchBar}
          placeholder={`Search ${seriesName}...`}
          placeholderTextColor="#888"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      ),
    });
  }, [navigation, seriesName, search]);

  const loadPage = useCallback(async (pageNum: number) => {
    try {
      const result = await fetchBooksForSeries(seriesId, pageNum);
      setBooks((prev) => (pageNum === 0 ? result.content : [...prev, ...result.content]));
      setHasMore(!result.last);
    } catch (err) {
      console.error('Failed to load books:', err);
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  const loadMore = () => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    loadPage(next);
  };

  const filteredBooks = useMemo(() => {
    if (!search.trim()) return books;
    const q = search.toLowerCase();
    /* istanbul ignore next */
    return books.filter((b) =>
      (b.metadata.title || b.name).toLowerCase().includes(q)
    );
  }, [books, search]);

  if (loading && books.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8b5e3c" />
      </View>
    );
  }

  /* istanbul ignore next */
  const colWrapper = columns > 1 ? styles.row : undefined;
  return (
    <FlatList
      key={`series-${columns}`}
      style={styles.container}
      data={filteredBooks}
      numColumns={columns}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <BookCard
          book={item}
          fill
          onPress={() => navigation.navigate('BookDetail', { bookId: item.id })}
        />
      )}
      contentContainerStyle={styles.list}
      columnWrapperStyle={colWrapper}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f1eb' },
  list: { padding: 12 },
  row: { gap: 12 },
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
});

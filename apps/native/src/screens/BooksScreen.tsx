import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useDownloadStore } from '../stores/useDownloadStore';
import { fetchBooks } from '../services/api/books';
import { listDownloadedBooks } from '../services/offlineLibrary';
import { Book } from '../types/komga';
import BookCard from '../components/BookCard';
import { useColumns } from '../hooks/useColumns';
import { padDataForGrid, isPlaceholder } from '../utils/gridHelpers';

type Props = NativeStackScreenProps<RootStackParamList, 'Books'>;

export default function BooksScreen({ navigation }: Props) {
  const shelvarrUrl = useSettingsStore((s) => s.shelvarrUrl);
  const downloads = useDownloadStore((s) => s.downloads);
  const downloadedBooks = useMemo(() => listDownloadedBooks(downloads), [downloads]);
  const [books, setBooks] = useState<Book[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // The server couldn't be reached, so the list falls back to downloads.
  const [offline, setOffline] = useState(false);
  const columns = useColumns();

  const loadPage = useCallback(async (pageNum: number) => {
    if (!shelvarrUrl) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const result = await fetchBooks(pageNum);
      setBooks((prev) => (pageNum === 0 ? result.content : [...prev, ...result.content]));
      setHasMore(!result.last);
      setPage(pageNum);
      setOffline(false);
    } catch (err) {
      console.error('Failed to load books:', err);
      // Show what's readable on this device instead of an empty shelf. Only
      // on the first page: a failed page 2 shouldn't replace what's shown.
      if (pageNum === 0) {
        setOffline(true);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shelvarrUrl]);

  useFocusEffect(
    useCallback(() => {
      setRefreshing(true);
      loadPage(0);
    }, [loadPage])
  );

  /* istanbul ignore next */
  const loadMore = () => {
    if (!hasMore || loading) return;
    loadPage(page + 1);
  };

  if (!shelvarrUrl) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>
          No Shelvarr server configured.{'\n'}Tap the gear icon to set your Shelvarr URL.
        </Text>
      </View>
    );
  }

  const data = offline ? downloadedBooks : books;

  if (loading && data.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8b5e3c" />
      </View>
    );
  }

  if (!refreshing && data.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>
          {offline
            ? 'Offline, and no books are downloaded to this device.'
            : 'No books found.'}
        </Text>
      </View>
    );
  }

  /* istanbul ignore next -- columnWrapperStyle only applies when columns > 1 */
  const colWrapper = columns > 1 ? styles.row : undefined;

  return (
    <FlatList
      key={`books-${columns}`}
      style={styles.container}
      data={padDataForGrid(data, columns)}
      numColumns={columns}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) =>
        isPlaceholder(item) ? (
          <BookCard book={{} as Book} onPress={() => {}} fill placeholder />
        ) : (
          <BookCard
            book={item as Book}
            fill
            onPress={() => navigation.navigate('BookDetail', { bookId: (item as Book).id })}
          />
        )
      }
      contentContainerStyle={styles.list}
      columnWrapperStyle={colWrapper}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        offline ? (
          <Text style={styles.offlineNotice}>
            Offline — showing books downloaded to this device.
          </Text>
        ) : refreshing ? (
          <ActivityIndicator size="small" color="#8b5e3c" style={styles.inlineSpinner} />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb' },
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
    lineHeight: 26,
  },
  list: { padding: 12 },
  row: { gap: 12 },
  inlineSpinner: { marginVertical: 8 },
  offlineNotice: {
    fontSize: 14,
    color: '#8b5e3c',
    textAlign: 'center',
    marginBottom: 8,
  },
});

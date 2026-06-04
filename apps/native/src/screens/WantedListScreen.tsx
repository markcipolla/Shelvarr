import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { useSettingsStore } from '../stores/useSettingsStore';
import {
  getWantedBooks,
  removeFromWanted,
  WantedBook,
  WantedStatus,
} from '../services/api/wanted';

type Props = BottomTabScreenProps<MainTabParamList, 'Wanted'>;

type WantedNav = CompositeNavigationProp<
  BottomTabScreenProps<MainTabParamList, 'Wanted'>['navigation'],
  NativeStackNavigationProp<RootStackParamList>
>;

const STATUS_LABELS: Record<WantedStatus, string> = {
  wanted: 'Wanted',
  searching: 'Searching',
  found: 'Found',
  acquired: 'Acquired',
};

const STATUS_COLORS: Record<WantedStatus, { bg: string; text: string }> = {
  wanted: { bg: '#efe7da', text: '#8b5e3c' },
  searching: { bg: '#e3edf5', text: '#2f6690' },
  found: { bg: '#e8f0e8', text: '#3d6b3d' },
  acquired: { bg: '#e8f0e8', text: '#3d6b3d' },
};

export default function WantedListScreen(_props: Props) {
  const navigation = useNavigation<WantedNav>();
  const shelvarrUrl = useSettingsStore((s) => s.shelvarrUrl);
  const [books, setBooks] = useState<WantedBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <TouchableOpacity
            onPress={() => navigation.navigate('WantedSearch')}
            style={styles.headerButton}
            accessibilityLabel="Add to wanted list"
          >
            <Text style={styles.headerButtonText}>＋</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={styles.headerButton}
            accessibilityLabel="Settings"
          >
            <Text style={styles.headerSettingsText}>⚙</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation]);

  const load = useCallback(async () => {
    if (!shelvarrUrl) {
      setLoading(false);
      return;
    }
    setError(null);
    const res = await getWantedBooks();
    if (res.success) {
      setBooks(res.books || []);
    } else {
      setError(res.error || 'Failed to load wanted list');
    }
    setLoading(false);
    setRefreshing(false);
  }, [shelvarrUrl]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleRemove = useCallback((book: WantedBook) => {
    Alert.alert('Remove from wanted list?', `"${book.title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          // Optimistically remove from the list
          setBooks((prev) => prev.filter((b) => b.id !== book.id));
          const res = await removeFromWanted(book.id);
          if (!res.success) {
            Alert.alert('Could not remove', res.error || 'Failed to remove from wanted list');
            load();
          }
        },
      },
    ]);
  }, [load]);

  const handleFindDownloads = useCallback(
    (book: WantedBook) => {
      navigation.navigate('DownloadSearch', {
        wantedBookId: book.id,
        title: book.title,
        author: book.author || undefined,
        isbn: book.isbn || undefined,
      });
    },
    [navigation]
  );

  if (!shelvarrUrl) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>
          No Shelvarr server configured.{'\n'}Tap the gear icon to set your Shelvarr URL.
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

  const renderItem = ({ item }: { item: WantedBook }) => {
    const statusColor = STATUS_COLORS[item.status] || STATUS_COLORS.wanted;
    return (
      <View style={styles.row}>
        <View style={styles.coverWrapper}>
          {item.cover_url ? (
            <Image source={{ uri: item.cover_url }} style={styles.cover} resizeMode="cover" />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Text style={styles.coverPlaceholderText}>📖</Text>
            </View>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.author ? (
            <Text style={styles.author} numberOfLines={1}>
              {item.author}
            </Text>
          ) : null}
          <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor.text }]}>
              {STATUS_LABELS[item.status] || item.status}
            </Text>
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.button}
              onPress={() => handleFindDownloads(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>⬇ Find Downloads</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemove(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.removeButtonText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {error && books.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load} activeOpacity={0.7}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : books.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.message}>
            Your wanted list is empty.{'\n'}Tap ＋ above to search for books to add.
          </Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('WantedSearch')}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>＋ Add Books</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5e3c" />
          }
        />
      )}
    </View>
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
  message: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 24 },
  errorText: { fontSize: 16, color: '#a33', textAlign: 'center', lineHeight: 22 },
  headerButtons: { flexDirection: 'row' },
  headerButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerButtonText: { color: '#8b5e3c', fontSize: 30, fontWeight: '600', marginTop: -2 },
  headerSettingsText: { color: '#222', fontSize: 24 },
  list: { padding: 12 },
  row: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e8e4de',
  },
  coverWrapper: {
    width: 70,
    height: 100,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#e8e4de',
    marginRight: 12,
  },
  cover: { width: '100%', height: '100%' },
  coverPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  coverPlaceholderText: { fontSize: 28 },
  info: { flex: 1, justifyContent: 'flex-start' },
  title: { fontSize: 15, fontWeight: '600', color: '#222', lineHeight: 19 },
  author: { fontSize: 13, color: '#555', marginTop: 2 },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', marginTop: 10, alignItems: 'center' },
  button: {
    backgroundColor: '#8b5e3c',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  removeButton: { marginLeft: 8, paddingHorizontal: 10, paddingVertical: 8 },
  removeButtonText: { color: '#a33', fontSize: 13, fontWeight: '600' },
  retryButton: {
    backgroundColor: '#8b5e3c',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 16,
  },
  addButton: {
    backgroundColor: '#8b5e3c',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 16,
  },
});

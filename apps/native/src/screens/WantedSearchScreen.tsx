import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useSettingsStore } from '../stores/useSettingsStore';
import {
  searchHardcover,
  addToWanted,
  HardcoverSearchResult,
} from '../services/api/wanted';

type Props = NativeStackScreenProps<RootStackParamList, 'WantedSearch'>;

type AddState = 'idle' | 'adding' | 'added';

export default function WantedSearchScreen(_props: Props) {
  const shelvarrUrl = useSettingsStore((s) => s.shelvarrUrl);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HardcoverSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);
  const [addState, setAddState] = useState<Record<string, AddState>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    setError(null);
    setHasSearched(true);
    const res = await searchHardcover(q);
    if (res.configured === false) {
      setConfigured(false);
      setResults([]);
      setError(res.error || 'Hardcover is not configured on this Shelvarr server');
    } else {
      setConfigured(true);
      if (res.success) {
        setResults(res.results || []);
        setAddState(
          Object.fromEntries(
            (res.results || []).map((r) => [r.hardcoverId, r.isWanted ? 'added' : 'idle'])
          )
        );
      } else {
        setResults([]);
        setError(res.error || 'Search failed');
      }
    }
    setSearching(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setHasSearched(false);
      setSearching(false);
      setError(null);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      runSearch(trimmed);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const handleAdd = useCallback(async (result: HardcoverSearchResult) => {
    setAddState((prev) => ({ ...prev, [result.hardcoverId]: 'adding' }));
    const res = await addToWanted({
      hardcoverId: result.hardcoverId,
      title: result.title,
      author: result.author,
      isbn: result.isbn,
      coverUrl: result.coverUrl,
      description: result.description,
    });
    if (res.success) {
      setAddState((prev) => ({ ...prev, [result.hardcoverId]: 'added' }));
    } else {
      setAddState((prev) => ({ ...prev, [result.hardcoverId]: 'idle' }));
      Alert.alert('Could not add', res.error || 'Failed to add to wanted list');
    }
  }, []);

  if (!shelvarrUrl) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>
          No Shelvarr server configured.{'\n'}Tap the gear icon to set your Shelvarr URL.
        </Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: HardcoverSearchResult }) => {
    const state = addState[item.hardcoverId] || 'idle';
    return (
      <View style={styles.row}>
        <View style={styles.coverWrapper}>
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
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
          {item.publishDate ? (
            <Text style={styles.year} numberOfLines={1}>
              {item.publishDate}
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            {state === 'added' ? (
              <View style={[styles.button, styles.buttonAdded]}>
                <Text style={styles.buttonAddedText}>✓ On Wanted List</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.button, state === 'adding' && styles.buttonDisabled]}
                disabled={state === 'adding'}
                onPress={() => handleAdd(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonText}>
                  {state === 'adding' ? 'Adding…' : '+ Want'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchBar}
          placeholder="Search Hardcover by title, author, ISBN…"
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          autoFocus
        />
      </View>

      {!configured ? (
        <View style={styles.center}>
          <Text style={styles.message}>
            Hardcover is not configured on your Shelvarr server.{'\n'}
            Add a Hardcover API key in the Shelvarr web settings to search for books.
          </Text>
        </View>
      ) : searching && results.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8b5e3c" />
        </View>
      ) : error && results.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.message}>
            {hasSearched
              ? `No results found for "${query.trim()}"`
              : 'Enter a search term above to find books on Hardcover and add them to your wanted list.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.hardcoverId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            searching ? (
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
  center: {
    flex: 1,
    backgroundColor: '#f5f1eb',
    padding: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#a33',
    textAlign: 'center',
    lineHeight: 22,
  },
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
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#d5d0c8',
  },
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
  info: { flex: 1, justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '600', color: '#222', lineHeight: 19 },
  author: { fontSize: 13, color: '#555', marginTop: 2 },
  year: { fontSize: 12, color: '#888', marginTop: 2 },
  buttonRow: { flexDirection: 'row', marginTop: 8 },
  button: {
    backgroundColor: '#8b5e3c',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  buttonAdded: {
    backgroundColor: '#e8f0e8',
    borderWidth: 1,
    borderColor: '#7a9a7a',
  },
  buttonAddedText: { color: '#3d6b3d', fontSize: 13, fontWeight: '600' },
  inlineSpinner: { marginVertical: 12 },
});

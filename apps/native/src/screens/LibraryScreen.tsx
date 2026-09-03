import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, FlatList, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Series } from '../types/api';
import { fetchSeriesForLibrary } from '../services/api/series';
import SeriesCard from '../components/SeriesCard';
import { useColumns } from '../hooks/useColumns';

type Props = NativeStackScreenProps<RootStackParamList, 'Library'>;

export default function LibraryScreen({ route, navigation }: Props) {
  const { libraryId, libraryName } = route.params;
  const [series, setSeries] = useState<Series[]>([]);
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
          placeholder={`Search ${libraryName}...`}
          placeholderTextColor="#888"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      ),
    });
  }, [navigation, libraryName, search]);

  const loadPage = useCallback(async (pageNum: number) => {
    try {
      const result = await fetchSeriesForLibrary(libraryId, pageNum);
      setSeries((prev) => (pageNum === 0 ? result.content : [...prev, ...result.content]));
      setHasMore(!result.last);
    } catch (err) {
      console.error('Failed to load series:', err);
    } finally {
      setLoading(false);
    }
  }, [libraryId]);

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  const loadMore = () => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    loadPage(next);
  };

  const filteredSeries = useMemo(() => {
    if (!search.trim()) return series;
    const q = search.toLowerCase();
    /* istanbul ignore next */
    return series.filter((s) =>
      (s.metadata.title || s.name).toLowerCase().includes(q)
    );
  }, [series, search]);

  if (loading && series.length === 0) {
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
      key={`library-${columns}`}
      style={styles.container}
      data={filteredSeries}
      numColumns={columns}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        /* istanbul ignore next */
        const seriesName = item.metadata.title || item.name;
        return (
          <SeriesCard
            series={item}
            onPress={() => navigation.navigate('Series', { seriesId: item.id, seriesName })}
          />
        );
      }}
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
  list: { padding: 16 },
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

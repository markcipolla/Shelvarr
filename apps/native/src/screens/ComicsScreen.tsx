import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useSettingsStore } from '../stores/useSettingsStore';
import { fetchComics, KapowarrVolume } from '../services/api/comics';
import ComicCard from '../components/ComicCard';
import { useColumns } from '../hooks/useColumns';
import { padDataForGrid, isPlaceholder } from '../utils/gridHelpers';

type Props = NativeStackScreenProps<RootStackParamList, 'Comics'>;

export default function ComicsScreen({ navigation }: Props) {
  const shelvarrUrl = useSettingsStore((s) => s.shelvarrUrl);
  const [volumes, setVolumes] = useState<KapowarrVolume[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const columns = useColumns();

  const loadData = useCallback(async () => {
    if (!shelvarrUrl) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await fetchComics();
      setConfigured(res.configured);
      setVolumes(res.volumes);
      setError(res.error || null);
    } catch (err) {
      console.error('Failed to load comics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load comics');
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

  if (!configured) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>
          Kapowarr is not configured on your Shelvarr server.{'\n'}
          Add Kapowarr credentials in the Shelvarr web settings to browse comics.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Settings')}>
          <Text style={styles.buttonText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!refreshing && volumes.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>No comics found.</Text>
      </View>
    );
  }

  /* istanbul ignore next -- columnWrapperStyle only applies when columns > 1 */
  const colWrapper = columns > 1 ? styles.row : undefined;

  const gridItems = volumes.map((v) => ({ id: String(v.id), volume: v }));

  return (
    <FlatList
      key={`comics-${columns}`}
      style={styles.container}
      data={padDataForGrid(gridItems, columns)}
      numColumns={columns}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) =>
        isPlaceholder(item) ? (
          <ComicCard volume={{} as KapowarrVolume} onPress={() => {}} fill placeholder />
        ) : (
          <ComicCard
            volume={(item as { volume: KapowarrVolume }).volume}
            fill
            onPress={() => {}}
          />
        )
      }
      contentContainerStyle={styles.list}
      columnWrapperStyle={colWrapper}
      ListHeaderComponent={
        refreshing ? (
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
    marginBottom: 24,
    lineHeight: 26,
  },
  errorText: {
    fontSize: 16,
    color: '#a33',
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#8b5e3c',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  list: { padding: 12 },
  row: { gap: 12 },
  inlineSpinner: { marginVertical: 8 },
});

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useSettingsStore } from '../stores/useSettingsStore';
import { cleanAllDownloads } from '../services/fileManager';
import { useUpdateStore } from '../stores/useUpdateStore';
import { APP_VERSION, BUILD_VERSION } from '../utils/constants';
import { testShelvarrConnection } from '../services/api/shelvarr';

export default function SettingsScreen() {
  const autoDelete = useSettingsStore((s) => s.autoDeleteAfterReading);
  const setAutoDelete = useSettingsStore((s) => s.setAutoDelete);
  const shelvarrUrl = useSettingsStore((s) => s.shelvarrUrl);
  const setShelvarrUrl = useSettingsStore((s) => s.setShelvarrUrl);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const [shelvarrUrlInput, setShelvarrUrlInput] = useState(shelvarrUrl);
  const [testing, setTesting] = useState(false);
  const updateStatus = useUpdateStore((s) => s.status);
  const availableUpdate = useUpdateStore((s) => s.update);
  const updateError = useUpdateStore((s) => s.error);
  const upToDate = useUpdateStore((s) => s.upToDate);
  const checkForUpdates = useUpdateStore((s) => s.check);
  const startUpdate = useUpdateStore((s) => s.startUpdate);
  const updateBusy = updateStatus === 'downloading' || updateStatus === 'installing';

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    setShelvarrUrlInput(shelvarrUrl);
  }, [shelvarrUrl]);

  const handleSaveShelvarrUrl = async () => {
    setTesting(true);
    const result = await testShelvarrConnection(shelvarrUrlInput);
    setTesting(false);
    if (!result.ok) {
      Alert.alert('Could not reach server', `${shelvarrUrlInput || '(empty)'}\n\n${result.error}`);
      return;
    }
    setShelvarrUrl(shelvarrUrlInput);
    Alert.alert('Saved', 'Shelvarr URL updated.');
  };

  const handleClearDownloads = () => {
    Alert.alert('Clear Downloads', 'Delete all downloaded books?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await cleanAllDownloads();
          Alert.alert('Done', 'All downloads cleared.');
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Server</Text>
      <TextInput
        style={styles.input}
        value={shelvarrUrlInput}
        onChangeText={setShelvarrUrlInput}
        placeholder="Shelvarr server URL (e.g. http://192.168.1.100:3000)"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <TouchableOpacity
        style={[styles.button, testing && styles.buttonDisabled]}
        onPress={handleSaveShelvarrUrl}
        disabled={testing}
      >
        {testing ? (
          <ActivityIndicator color="#333" />
        ) : (
          <Text style={styles.buttonText}>Save</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Reading</Text>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.label}>Auto-delete after reading</Text>
          <Text style={styles.description}>Remove downloaded files when you close the reader</Text>
        </View>
        <Switch
          value={autoDelete}
          onValueChange={setAutoDelete}
          trackColor={{ false: '#d5d0c8', true: '#8b5e3c' }}
          thumbColor="#fff"
        />
      </View>

      <Text style={styles.sectionTitle}>Storage</Text>
      <TouchableOpacity style={styles.button} onPress={handleClearDownloads}>
        <Text style={styles.buttonText}>Clear all downloads</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Updates</Text>
      {availableUpdate ? (
        <TouchableOpacity
          style={[styles.button, updateBusy && styles.buttonDisabled]}
          onPress={startUpdate}
          disabled={updateBusy}
        >
          {updateBusy ? (
            <ActivityIndicator color="#333" />
          ) : (
            <Text style={styles.buttonText}>Install version {availableUpdate.version}</Text>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.button, updateStatus === 'checking' && styles.buttonDisabled]}
          onPress={() => checkForUpdates()}
          disabled={updateStatus === 'checking'}
        >
          {updateStatus === 'checking' ? (
            <ActivityIndicator color="#333" />
          ) : (
            <Text style={styles.buttonText}>Check for updates</Text>
          )}
        </TouchableOpacity>
      )}
      {upToDate && <Text style={styles.updateNote}>You&apos;re on the latest version.</Text>}
      {updateStatus === 'error' && <Text style={styles.updateError}>{updateError}</Text>}

      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.aboutRow}>
        <Text style={styles.label}>Version</Text>
        <Text style={styles.aboutValue}>{APP_VERSION}</Text>
      </View>
      <View style={styles.aboutRow}>
        <Text style={styles.label}>Build</Text>
        <Text style={styles.aboutValueMono}>{BUILD_VERSION}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb', padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#777', marginTop: 24, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  rowText: { flex: 1, marginRight: 12 },
  label: { fontSize: 16, color: '#222' },
  description: { fontSize: 12, color: '#777', marginTop: 4 },
  button: {
    backgroundColor: '#e8e4de',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d5d0c8',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#333', fontSize: 15 },
  updateNote: { fontSize: 13, color: '#777', marginTop: 10 },
  updateError: { fontSize: 13, color: '#a03c2c', marginTop: 10 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d5d0c8',
    color: '#222',
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  aboutValue: { fontSize: 14, color: '#555' },
  aboutValueMono: {
    fontSize: 13,
    color: '#555',
    fontFamily: 'monospace',
  },
});

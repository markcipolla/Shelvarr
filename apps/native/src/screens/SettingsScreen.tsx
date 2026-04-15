import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useAuthStore } from '../stores/useAuthStore';
import { cleanAllDownloads } from '../services/fileManager';
import { resetApiClient } from '../services/api/client';

export default function SettingsScreen() {
  const autoDelete = useSettingsStore((s) => s.autoDeleteAfterReading);
  const setAutoDelete = useSettingsStore((s) => s.setAutoDelete);
  const shelvarrUrl = useSettingsStore((s) => s.shelvarrUrl);
  const setShelvarrUrl = useSettingsStore((s) => s.setShelvarrUrl);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const logout = useAuthStore((s) => s.logout);
  const serverUrl = useAuthStore((s) => s.credentials?.serverUrl);
  const [shelvarrUrlInput, setShelvarrUrlInput] = useState(shelvarrUrl);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    setShelvarrUrlInput(shelvarrUrl);
  }, [shelvarrUrl]);

  const handleSaveShelvarrUrl = () => {
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

  const handleLogout = () => {
    Alert.alert('Logout', 'Disconnect from server?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await cleanAllDownloads();
          resetApiClient();
          await logout();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
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

      <Text style={styles.sectionTitle}>Shelvarr</Text>
      <TextInput
        style={styles.input}
        value={shelvarrUrlInput}
        onChangeText={setShelvarrUrlInput}
        placeholder="Shelvarr server URL"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <TouchableOpacity style={styles.button} onPress={handleSaveShelvarrUrl}>
        <Text style={styles.buttonText}>Save</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Storage</Text>
      <TouchableOpacity style={styles.button} onPress={handleClearDownloads}>
        <Text style={styles.buttonText}>Clear all downloads</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Server</Text>
      <Text style={styles.serverUrl}>{serverUrl}</Text>
      <Text style={styles.description}>Reading status syncs automatically via the connected server</Text>
      <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={handleLogout}>
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>
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
  logoutButton: { borderColor: '#c0392b', marginTop: 8 },
  buttonText: { color: '#333', fontSize: 15 },
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
  serverUrl: { fontSize: 14, color: '#777', marginBottom: 12 },
});

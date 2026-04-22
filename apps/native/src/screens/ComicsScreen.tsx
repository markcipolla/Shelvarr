import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useSettingsStore } from '../stores/useSettingsStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Comics'>;

export default function ComicsScreen({ navigation }: Props) {
  const kapowarrUrl = useSettingsStore((s) => s.kapowarrUrl);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Comics</Text>
      {kapowarrUrl ? (
        <Text style={styles.body}>
          Connected to Kapowarr at {kapowarrUrl}.{'\n'}
          Comic browsing is not yet implemented.
        </Text>
      ) : (
        <>
          <Text style={styles.body}>
            Kapowarr is not configured.{'\n'}
            Add your Kapowarr server URL in Settings to browse comics.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate('Settings')}
          >
            <Text style={styles.buttonText}>Open Settings</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f1eb',
    padding: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#222',
    marginBottom: 16,
  },
  body: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 26,
  },
  button: {
    backgroundColor: '#8b5e3c',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '500' },
});

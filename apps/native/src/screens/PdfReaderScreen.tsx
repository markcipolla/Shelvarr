import React, { useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, StatusBar } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import Pdf from 'react-native-pdf';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useBookReader } from '../hooks/useBookReader';

type Props = NativeStackScreenProps<RootStackParamList, 'PdfReader'>;

export default function PdfReaderScreen({ route, navigation }: Props) {
  const { bookId, filePath, startPage, totalPages, kind, issueId } = route.params;
  const { onPageChange, onReaderExit, startReading } = useBookReader(
    bookId,
    kind === 'comic' && issueId !== undefined ? { kind: 'comic', issueId } : undefined
  );

  useEffect(() => {
    startReading(bookId, startPage, totalPages);
    navigation.setOptions({ headerShown: false });
    StatusBar.setHidden(true);
    NavigationBar.setVisibilityAsync('hidden');

    return () => {
      StatusBar.setHidden(false);
      NavigationBar.setVisibilityAsync('visible');
      onReaderExit();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Pdf
        source={{ uri: filePath }}
        page={startPage}
        onPageChanged={(page, numberOfPages) => {
          onPageChange(page, numberOfPages);
        }}
        onError={(error) => {
          console.error('PDF error:', error);
        }}
        style={styles.pdf}
        enablePaging
      />
      <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  pdf: { flex: 1 },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: { color: '#fff', fontSize: 18 },
});

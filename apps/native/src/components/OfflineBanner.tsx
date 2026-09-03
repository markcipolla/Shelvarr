import React from 'react';
import { StyleSheet, Text } from 'react-native';

/**
 * The one-line "this is a partial view" strip shown above a list that fell
 * back to what's on the device. Deliberately quiet: the list below it is
 * still useful, so this shouldn't read as an error.
 */
export default function OfflineBanner({ message }: { message?: string }) {
  return (
    <Text style={styles.banner}>
      {message ?? "You're offline — showing what's saved on this device."}
    </Text>
  );
}

const styles = StyleSheet.create({
  banner: {
    fontSize: 14,
    color: '#8b5e3c',
    textAlign: 'center',
    marginBottom: 8,
  },
});

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  /** Filled rather than outlined. At most one per state. */
  primary?: boolean;
}

interface EmptyStateProps {
  /** A single emoji, sized as artwork rather than text. */
  icon?: string;
  title: string;
  body?: string;
  actions?: EmptyStateAction[];
}

/**
 * The one centred "nothing here yet" panel.
 *
 * Every tab routes its empty, offline and signed-out states through this, so
 * the same situation reads the same way wherever you hit it.
 */
export default function EmptyState({ icon, title, body, actions = [] }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {actions.map((action) => (
        <TouchableOpacity
          key={action.label}
          style={[styles.button, action.primary ? styles.buttonPrimary : null]}
          onPress={action.onPress}
          activeOpacity={0.7}
        >
          <Text style={[styles.buttonText, action.primary ? styles.buttonPrimaryText : null]}>
            {action.label}
          </Text>
        </TouchableOpacity>
      ))}
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
  icon: { fontSize: 44, marginBottom: 16 },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#222',
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    maxWidth: 320,
  },
  button: {
    minWidth: 200,
    backgroundColor: '#e8e4de',
    borderWidth: 1,
    borderColor: '#d5d0c8',
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonPrimary: {
    backgroundColor: '#8b5e3c',
    borderColor: '#8b5e3c',
  },
  buttonText: { color: '#333', fontSize: 16, fontWeight: '600' },
  buttonPrimaryText: { color: '#fff' },
});

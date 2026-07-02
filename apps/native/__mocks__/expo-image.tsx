import React from 'react';
import { View } from 'react-native';

// Minimal test double for expo-image. Renders a plain View so component
// trees mount in jsdom without the native module. Props (source, placeholder,
// transition, cachePolicy, contentFit) are ignored.
export function Image(props: Record<string, unknown>) {
  return <View {...props} />;
}

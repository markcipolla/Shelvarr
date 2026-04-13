import React from 'react';
import { View } from 'react-native';

export const ReactNativeZoomableView = ({ children, ...props }: any) => {
  return <View testID="mock-zoomable-view" {...props}>{children}</View>;
};

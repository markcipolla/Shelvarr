import React from 'react';
import { View } from 'react-native';

const Pdf = (props: any) => {
  // Simulate page change on mount
  React.useEffect(() => {
    if (props.onPageChanged) {
      props.onPageChanged(props.page || 1, 10);
    }
  }, []);
  return <View testID="mock-pdf" />;
};

export default Pdf;

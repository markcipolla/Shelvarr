import React from 'react';
import { View, Text } from 'react-native';

const RenderHtml = (props: any) => {
  return (
    <View testID="mock-render-html">
      <Text>{props.source?.html ? 'HTML Content' : ''}</Text>
    </View>
  );
};

export default RenderHtml;

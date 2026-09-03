import React from 'react';
import { render } from '@testing-library/react-native';
import OfflineBanner from '../../src/components/OfflineBanner';

describe('OfflineBanner', () => {
  it('says what is being shown instead', () => {
    const { getByText } = render(<OfflineBanner />);

    expect(getByText("You're offline — showing what's saved on this device.")).toBeTruthy();
  });

  it('takes wording of its own', () => {
    const { getByText } = render(<OfflineBanner message="Showing downloaded issues." />);

    expect(getByText('Showing downloaded issues.')).toBeTruthy();
  });
});

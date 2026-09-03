import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import EmptyState from '../../src/components/EmptyState';

describe('EmptyState', () => {
  it('shows the artwork, the headline and the explanation', () => {
    const { getByText } = render(
      <EmptyState icon="📚" title="Nothing here" body="Try again later." />
    );

    expect(getByText('📚')).toBeTruthy();
    expect(getByText('Nothing here')).toBeTruthy();
    expect(getByText('Try again later.')).toBeTruthy();
  });

  it('gets by on a headline alone', () => {
    const { getByText, queryByText } = render(<EmptyState title="Nothing here" />);

    expect(getByText('Nothing here')).toBeTruthy();
    expect(queryByText('📚')).toBeNull();
  });

  it('runs the action that was tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <EmptyState title="Nothing here" actions={[{ label: 'Try again', onPress, primary: true }]} />
    );

    fireEvent.press(getByText('Try again'));

    expect(onPress).toHaveBeenCalled();
  });

  it('lists every action it was given', () => {
    const { getByText } = render(
      <EmptyState
        title="Nothing here"
        actions={[
          { label: 'Log in', onPress: jest.fn(), primary: true },
          { label: 'Sign up', onPress: jest.fn() },
        ]}
      />
    );

    expect(getByText('Log in')).toBeTruthy();
    expect(getByText('Sign up')).toBeTruthy();
  });
});

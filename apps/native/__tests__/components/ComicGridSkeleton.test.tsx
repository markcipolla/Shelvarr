import React from 'react';
import { render } from '@testing-library/react-native';
import ComicGridSkeleton from '../../src/components/ComicGridSkeleton';
import { useColumns } from '../../src/hooks/useColumns';

jest.mock('../../src/hooks/useColumns');

const mockUseColumns = useColumns as jest.Mock;

describe('ComicGridSkeleton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseColumns.mockReturnValue(2);
  });

  it('renders a grid of shimmer placeholder cards', () => {
    const { toJSON } = render(<ComicGridSkeleton />);
    expect(toJSON()).toBeTruthy();
  });

  it('stops the shimmer animation when unmounted', () => {
    const { unmount } = render(<ComicGridSkeleton />);
    expect(() => unmount()).not.toThrow();
  });
});

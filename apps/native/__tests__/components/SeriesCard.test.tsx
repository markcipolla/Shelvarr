import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SeriesCard from '../../src/components/SeriesCard';
import { useAuthHeaders } from '../../src/hooks/useAuthHeaders';
import { Series } from '../../src/types/api';

jest.mock('../../src/hooks/useAuthHeaders');
jest.mock('../../src/services/api/books', () => ({
  getSeriesThumbnailUrl: jest.fn().mockReturnValue('http://thumb/series1'),
}));

const mockUseAuthHeaders = useAuthHeaders as jest.Mock;

const makeSeries = (overrides: Partial<Series> = {}): Series => ({
  id: 's1',
  libraryId: 'lib1',
  name: 'Series Name',
  booksCount: 5,
  metadata: { title: 'Series Title', titleSort: '', summary: '', status: '', publisher: '' },
  ...overrides,
});

describe('SeriesCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthHeaders.mockReturnValue({ Authorization: 'Basic abc' });
  });

  it('renders placeholder when placeholder prop is true', () => {
    const { toJSON } = render(
      <SeriesCard series={makeSeries()} onPress={jest.fn()} placeholder />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders series title from metadata', () => {
    const { getByText } = render(
      <SeriesCard series={makeSeries()} onPress={jest.fn()} />
    );
    expect(getByText('Series Title')).toBeTruthy();
  });

  it('renders series name when metadata title is empty', () => {
    const s = makeSeries({ metadata: { title: '', titleSort: '', summary: '', status: '', publisher: '' } });
    const { getByText } = render(<SeriesCard series={s} onPress={jest.fn()} />);
    expect(getByText('Series Name')).toBeTruthy();
  });

  it('renders books count', () => {
    const { getByText } = render(
      <SeriesCard series={makeSeries()} onPress={jest.fn()} />
    );
    expect(getByText('5 books')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <SeriesCard series={makeSeries()} onPress={onPress} />
    );
    fireEvent.press(getByText('Series Title'));
    expect(onPress).toHaveBeenCalled();
  });
});

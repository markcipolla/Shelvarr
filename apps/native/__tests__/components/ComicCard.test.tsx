import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ComicCard from '../../src/components/ComicCard';
import type { ComicVolumeSummary } from '@shelvarr/types';

jest.mock('../../src/services/api/comics', () => ({
  getVolumeCoverUrl: jest.fn().mockReturnValue('http://cover/42'),
}));

const makeVolume = (overrides: Partial<ComicVolumeSummary> = {}): ComicVolumeSummary => ({
  id: 42,
  slug: 'the-volume-2020',
  comicvine_id: 1,
  title: 'The Volume',
  year: 2020,
  publisher: 'Publisher',
  volume_number: 1,
  description: '',
  monitored: true,
  monitor_new_issues: false,
  folder: '/comics',
  issue_count: 10,
  issue_count_monitored: 10,
  issues_downloaded: 4,
  issues_downloaded_monitored: 4,
  total_size: 1024,
  ...overrides,
});

describe('ComicCard', () => {
  it('renders placeholder when placeholder prop is true', () => {
    const { queryByText } = render(
      <ComicCard volume={makeVolume()} onPress={jest.fn()} placeholder />
    );
    expect(queryByText('The Volume')).toBeNull();
  });

  it('renders the volume title', () => {
    const { getByText } = render(<ComicCard volume={makeVolume()} onPress={jest.fn()} />);
    expect(getByText('The Volume')).toBeTruthy();
  });

  it('renders publisher · year subtitle when both present', () => {
    const { getByText } = render(<ComicCard volume={makeVolume()} onPress={jest.fn()} />);
    expect(getByText('Publisher · 2020')).toBeTruthy();
  });

  it('renders only publisher when year is null', () => {
    const { getByText, queryByText } = render(
      <ComicCard volume={makeVolume({ year: null })} onPress={jest.fn()} />
    );
    expect(getByText('Publisher')).toBeTruthy();
    expect(queryByText(/·/)).toBeNull();
  });

  it('renders only year when publisher is null', () => {
    const { getByText } = render(
      <ComicCard volume={makeVolume({ publisher: null })} onPress={jest.fn()} />
    );
    expect(getByText('2020')).toBeTruthy();
  });

  it('omits subtitle entirely when both publisher and year are missing', () => {
    const { queryByText } = render(
      <ComicCard volume={makeVolume({ publisher: null, year: null })} onPress={jest.fn()} />
    );
    expect(queryByText('·')).toBeNull();
    expect(queryByText('Publisher')).toBeNull();
  });

  it('shows a download-progress badge when issue_count > 0', () => {
    const { getByText } = render(<ComicCard volume={makeVolume()} onPress={jest.fn()} />);
    expect(getByText('4/10')).toBeTruthy();
  });

  it('hides the badge when issue_count is 0', () => {
    const { queryByText } = render(
      <ComicCard volume={makeVolume({ issue_count: 0, issues_downloaded: 0 })} onPress={jest.fn()} />
    );
    expect(queryByText('0/0')).toBeNull();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<ComicCard volume={makeVolume()} onPress={onPress} />);
    fireEvent.press(getByText('The Volume'));
    expect(onPress).toHaveBeenCalled();
  });

  it('renders with fill prop', () => {
    const { getByText } = render(<ComicCard volume={makeVolume()} onPress={jest.fn()} fill />);
    expect(getByText('The Volume')).toBeTruthy();
  });

  it('shows a remove button and calls onRemove when provided', () => {
    const onRemove = jest.fn();
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <ComicCard volume={makeVolume()} onPress={onPress} onRemove={onRemove} />
    );
    fireEvent.press(getByLabelText('Remove from Next Up'));
    expect(onRemove).toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('omits the remove button when onRemove is not provided', () => {
    const { queryByLabelText } = render(<ComicCard volume={makeVolume()} onPress={jest.fn()} />);
    expect(queryByLabelText('Remove from Next Up')).toBeNull();
  });
});

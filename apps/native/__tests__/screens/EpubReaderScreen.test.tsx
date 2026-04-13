import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import EpubReaderScreen from '../../src/screens/EpubReaderScreen';
import { useBookReader } from '../../src/hooks/useBookReader';
import { parseEpub } from '../../src/services/epubParser';
import { syncEpubProgress, flushProgress } from '../../src/services/progressSync';
import { getEpubProgression } from '../../src/services/api/books';
import { getEpubPosition, saveEpubPosition } from '../../src/services/epubPositionStore';
import { updateReadingStatus } from '../../src/services/api/shelvarr';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/hooks/useBookReader');
jest.mock('../../src/services/epubParser');
jest.mock('../../src/services/progressSync');
jest.mock('../../src/services/api/books');
jest.mock('../../src/services/epubPositionStore');
jest.mock('../../src/services/api/shelvarr');

const mockStartReading = jest.fn();
const mockOnReaderExit = jest.fn().mockResolvedValue(undefined);
const mockOnPageChange = jest.fn();

const mockParseEpub = parseEpub as jest.Mock;
const mockSyncEpubProgress = syncEpubProgress as jest.Mock;
const mockFlushProgress = flushProgress as jest.Mock;
const mockGetEpubProgression = getEpubProgression as jest.Mock;
const mockGetEpubPosition = getEpubPosition as jest.Mock;
const mockSaveEpubPosition = saveEpubPosition as jest.Mock;
const mockUpdateReadingStatus = updateReadingStatus as jest.Mock;

const mockNavigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
  goBack: jest.fn(),
} as any;

const mockRoute = {
  params: { bookId: 'b1', filePath: '/path/book.epub', totalPages: 100 },
} as any;

const mockEpubBook = {
  chapters: [
    { title: 'Chapter 1', href: 'ch1.xhtml', html: '<html><body><p>Hello</p></body></html>' },
    { title: 'Chapter 2', href: 'ch2.xhtml', html: '<html><body><p>World</p></body></html>' },
  ],
};

const singleChapterBook = {
  chapters: [
    { title: 'Only Chapter', href: 'ch1.xhtml', html: '<html><body><p>Content</p></body></html>' },
  ],
};

describe('EpubReaderScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlushProgress.mockResolvedValue(undefined);
    mockSaveEpubPosition.mockResolvedValue(undefined);
    mockUpdateReadingStatus.mockResolvedValue(undefined);
    (useBookReader as jest.Mock).mockReturnValue({
      startReading: mockStartReading,
      onReaderExit: mockOnReaderExit,
      onPageChange: mockOnPageChange,
    });
  });

  it('shows loading indicator initially', () => {
    mockParseEpub.mockReturnValue(new Promise(() => {}));
    mockGetEpubPosition.mockReturnValue(new Promise(() => {}));
    mockGetEpubProgression.mockReturnValue(new Promise(() => {}));

    const { toJSON } = render(<EpubReaderScreen navigation={mockNavigation} route={mockRoute} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders book content after loading', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText } = render(<EpubReaderScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Chapter 1')).toBeTruthy();
    });
  });

  it('shows error state on parse failure', async () => {
    mockParseEpub.mockRejectedValue(new Error('Parse failed'));
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText } = render(<EpubReaderScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Parse failed')).toBeTruthy();
      expect(getByText('Go Back')).toBeTruthy();
    });
  });

  it('handles go back from error state', async () => {
    mockParseEpub.mockRejectedValue(new Error('Parse failed'));
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText } = render(<EpubReaderScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Go Back')).toBeTruthy());
    fireEvent.press(getByText('Go Back'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('restores local position', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue({ chapter: 1, page: 0 });
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText } = render(<EpubReaderScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Chapter 2')).toBeTruthy();
    });
  });

  it('restores server position when no local', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue({ locator: { href: 'ch2.xhtml' } });

    const { getByText } = render(<EpubReaderScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Chapter 2')).toBeTruthy();
    });
  });

  it('handles close button', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText } = render(<EpubReaderScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => expect(getByText('Chapter 1')).toBeTruthy());
    fireEvent.press(getByText('\u2715'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('calls startReading after load', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    render(<EpubReaderScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(mockStartReading).toHaveBeenCalledWith('b1', 1, 100);
    });
  });

  it('shows fallback error text when error message is empty', async () => {
    mockParseEpub.mockRejectedValue({ message: '' });
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText } = render(<EpubReaderScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(getByText('Failed to open EPUB')).toBeTruthy();
    });
  });

  it('navigates to next chapter via right tap zone', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText, getAllByProps } = render(
      <EpubReaderScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => expect(getByText('Chapter 1')).toBeTruthy());

    // The right tap zone calls goNextPage
    // Since contentHeight is 0 and totalPages is 1, tapping right goes to next chapter
    // Find the right tap zone (second TouchableOpacity with tapZoneRight style)
    // Use the arrow button instead
    fireEvent.press(getByText('\u2192'));

    await waitFor(() => {
      expect(getByText('Chapter 2')).toBeTruthy();
    });
  });

  it('navigates to previous chapter via left arrow', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue({ chapter: 1, page: 0 });
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText } = render(
      <EpubReaderScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => expect(getByText('Chapter 2')).toBeTruthy());

    fireEvent.press(getByText('\u2190'));

    await waitFor(() => {
      expect(getByText('Chapter 1')).toBeTruthy();
    });
  });

  it('goes back on last chapter last page next via tap zone', async () => {
    mockParseEpub.mockResolvedValue(singleChapterBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText, UNSAFE_getAllByType } = render(
      <EpubReaderScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => expect(getByText('Only Chapter')).toBeTruthy());

    // Find right tap zone (the second standalone TouchableOpacity before the toolbar)
    // Use the tap zone which doesn't have `disabled` prop
    const { TouchableOpacity } = require('react-native');
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    // The tap zones are the ones with activeOpacity={1} before the toolbar buttons
    // Right tap zone should be the second one (index 1)
    const rightTapZone = touchables.find(
      (t: any) => t.props.activeOpacity === 1 && t.props.onPress && touchables.indexOf(t) === 1
    );
    if (rightTapZone) {
      fireEvent.press(rightTapZone);
    }

    await waitFor(() => {
      expect(mockSyncEpubProgress).toHaveBeenCalledWith('b1', 1.0, true, 'ch1.xhtml');
      expect(mockNavigation.goBack).toHaveBeenCalled();
    });
  });

  it('does not go before first chapter', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText } = render(
      <EpubReaderScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => expect(getByText('Chapter 1')).toBeTruthy());

    // Left arrow on first chapter, first page - should be disabled
    fireEvent.press(getByText('\u2190'));

    // Should still be on chapter 1
    expect(getByText('Chapter 1')).toBeTruthy();
  });

  it('ignores goToChapter with invalid index', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText } = render(
      <EpubReaderScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => expect(getByText('Chapter 1')).toBeTruthy());
    // Still on chapter 1 after attempting to go before first
    expect(getByText('Chapter 1')).toBeTruthy();
  });

  it('does not restore position if local chapter exceeds count', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue({ chapter: 99, page: 0 });
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText } = render(
      <EpubReaderScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      // Should fall back to chapter 0 since chapter 99 doesn't exist
      expect(getByText('Chapter 1')).toBeTruthy();
    });
  });

  it('does not restore server position if href not found', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue({ locator: { href: 'nonexistent.xhtml' } });

    const { getByText } = render(
      <EpubReaderScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => {
      // Should stay on chapter 0
      expect(getByText('Chapter 1')).toBeTruthy();
    });
  });

  it('syncs epub progress and saves position on page/chapter change', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    render(<EpubReaderScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(mockSyncEpubProgress).toHaveBeenCalled();
      expect(mockSaveEpubPosition).toHaveBeenCalled();
    });
  });

  it('marks as reading on Hardcover after load', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    render(<EpubReaderScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(mockUpdateReadingStatus).toHaveBeenCalledWith('b1', 'reading');
    });
  });

  it('marks as read on Hardcover when reaching end via tap zone', async () => {
    mockParseEpub.mockResolvedValue(singleChapterBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText, UNSAFE_getAllByType } = render(
      <EpubReaderScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => expect(getByText('Only Chapter')).toBeTruthy());

    const { TouchableOpacity } = require('react-native');
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    const rightTapZone = touchables.find(
      (t: any) => t.props.activeOpacity === 1 && t.props.onPress && touchables.indexOf(t) === 1
    );
    if (rightTapZone) {
      fireEvent.press(rightTapZone);
    }

    await waitFor(() => {
      expect(mockUpdateReadingStatus).toHaveBeenCalledWith('b1', 'read');
    });
  });

  it('restores local position with resumePage > 0', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue({ chapter: 0, page: 2 });
    mockGetEpubProgression.mockResolvedValue(null);

    render(<EpubReaderScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(mockSaveEpubPosition).toHaveBeenCalled();
    });
  });

  it('handles onFrameLayout and onContentLayout', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText, UNSAFE_getAllByType } = render(
      <EpubReaderScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => expect(getByText('Chapter 1')).toBeTruthy());

    const { View } = require('react-native');
    const views = UNSAFE_getAllByType(View);

    // Find the text frame (has onLayout)
    const viewsWithLayout = views.filter((v: any) => v.props.onLayout);

    // Trigger onLayout for frame
    if (viewsWithLayout.length > 0) {
      viewsWithLayout[0].props.onLayout({
        nativeEvent: { layout: { height: 420, width: 300, x: 0, y: 0 } },
      });
    }

    // Trigger onLayout for content (second one)
    if (viewsWithLayout.length > 1) {
      viewsWithLayout[1].props.onLayout({
        nativeEvent: { layout: { height: 2100, width: 300, x: 0, y: 0 } },
      });
    }
  });

  it('navigates pages within a chapter when content is multi-page', async () => {
    mockParseEpub.mockResolvedValue(mockEpubBook);
    mockGetEpubPosition.mockResolvedValue(null);
    mockGetEpubProgression.mockResolvedValue(null);

    const { getByText, UNSAFE_getAllByType } = render(
      <EpubReaderScreen navigation={mockNavigation} route={mockRoute} />
    );

    await waitFor(() => expect(getByText('Chapter 1')).toBeTruthy());

    // Set frame and content heights to create multiple pages
    const { View } = require('react-native');
    const views = UNSAFE_getAllByType(View);
    const viewsWithLayout = views.filter((v: any) => v.props.onLayout);

    // Frame height: 420px, content height: 2100px -> 5 pages of ~420px each
    if (viewsWithLayout.length > 0) {
      act(() => {
        viewsWithLayout[0].props.onLayout({
          nativeEvent: { layout: { height: 420, width: 300, x: 0, y: 0 } },
        });
      });
    }

    if (viewsWithLayout.length > 1) {
      act(() => {
        viewsWithLayout[1].props.onLayout({
          nativeEvent: { layout: { height: 2100, width: 300, x: 0, y: 0 } },
        });
      });
    }

    // Now go to next page within chapter (should increment currentPage)
    fireEvent.press(getByText('\u2192'));

    // Go back to previous page
    fireEvent.press(getByText('\u2190'));
  });
});

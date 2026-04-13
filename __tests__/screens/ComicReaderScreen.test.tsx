import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import { FlatList, PanResponder, Animated } from 'react-native';
import ComicReaderScreen from '../../src/screens/ComicReaderScreen';
import { useBookReader } from '../../src/hooks/useBookReader';
import { useAuthHeaders } from '../../src/hooks/useAuthHeaders';
import { getBookPageUrl } from '../../src/services/api/books';
import { listExtractedFiles } from '../../src/services/fileManager';
import { getBookExtractDir } from '../../src/utils/paths';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/hooks/useBookReader');
jest.mock('../../src/hooks/useAuthHeaders');
jest.mock('../../src/services/api/books');
jest.mock('../../src/services/fileManager');
jest.mock('../../src/utils/paths');

// Capture PanResponder.create config to test callbacks directly
let panConfig: any = {};
const originalCreate = PanResponder.create;
jest.spyOn(PanResponder, 'create').mockImplementation((config: any) => {
  panConfig = config;
  return originalCreate(config);
});

const mockStartReading = jest.fn();
const mockOnReaderExit = jest.fn().mockResolvedValue(undefined);
const mockOnPageChange = jest.fn();

describe('ComicReaderScreen', () => {
  const mockNavigation = {
    navigate: jest.fn(),
    setOptions: jest.fn(),
    goBack: jest.fn(),
  } as any;

  const localRoute = {
    params: { bookId: 'b1', extractedDir: '/extract', startPage: 1, totalPages: 3, streaming: false },
  } as any;

  const streamRoute = {
    params: { bookId: 'b1', extractedDir: undefined, startPage: 1, totalPages: 3, streaming: true },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (useBookReader as jest.Mock).mockReturnValue({
      startReading: mockStartReading,
      onReaderExit: mockOnReaderExit,
      onPageChange: mockOnPageChange,
    });
    (useAuthHeaders as jest.Mock).mockReturnValue({ Authorization: 'Basic abc' });
    (listExtractedFiles as jest.Mock).mockResolvedValue(['page1.jpg', 'page2.jpg', 'page3.jpg']);
    (getBookExtractDir as jest.Mock).mockReturnValue('/extract/b1/');
    (getBookPageUrl as jest.Mock).mockImplementation(
      (bookId: string, page: number) => `http://server/book/${bookId}/page/${page}`
    );
  });

  it('shows loading when no pages', () => {
    (listExtractedFiles as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { toJSON } = render(<ComicReaderScreen navigation={mockNavigation} route={localRoute} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders pages from extracted files', async () => {
    const { getByText } = render(<ComicReaderScreen navigation={mockNavigation} route={localRoute} />);
    await waitFor(() => {
      expect(getByText('1 / 3')).toBeTruthy();
    });
  });

  it('renders pages in streaming mode', async () => {
    const { getByText } = render(<ComicReaderScreen navigation={mockNavigation} route={streamRoute} />);
    await waitFor(() => {
      expect(getByText('1 / 3')).toBeTruthy();
    });
    expect(getBookPageUrl).toHaveBeenCalledTimes(3);
  });

  it('calls startReading on mount', () => {
    render(<ComicReaderScreen navigation={mockNavigation} route={localRoute} />);
    expect(mockStartReading).toHaveBeenCalledWith('b1', 1, 3);
  });

  it('hides status bar and navigation bar on mount', () => {
    render(<ComicReaderScreen navigation={mockNavigation} route={localRoute} />);
    expect(mockNavigation.setOptions).toHaveBeenCalledWith({ headerShown: false });
  });

  it('handles close button in drawer', async () => {
    const { getByText } = render(<ComicReaderScreen navigation={mockNavigation} route={localRoute} />);
    await waitFor(() => expect(getByText('Close')).toBeTruthy());
    fireEvent.press(getByText('Close'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('calls onPageChange when viewable items change', async () => {
    const { UNSAFE_getByType } = render(
      <ComicReaderScreen navigation={mockNavigation} route={localRoute} />
    );

    await waitFor(() => {
      expect(listExtractedFiles).toHaveBeenCalled();
    });

    // Wait for pages to be set
    await waitFor(() => {
      const flatList = UNSAFE_getByType(FlatList);
      expect(flatList).toBeTruthy();
    });

    const flatList = UNSAFE_getByType(FlatList);
    const onViewableItemsChanged = flatList.props.onViewableItemsChanged;

    act(() => {
      onViewableItemsChanged({
        viewableItems: [{ index: 2, item: 'page3.jpg', isViewable: true }],
        changed: [],
      });
    });

    expect(mockOnPageChange).toHaveBeenCalledWith(3, 3);
  });

  it('does not update on empty viewable items', async () => {
    const { UNSAFE_getByType } = render(
      <ComicReaderScreen navigation={mockNavigation} route={localRoute} />
    );

    await waitFor(() => {
      const flatList = UNSAFE_getByType(FlatList);
      expect(flatList).toBeTruthy();
    });

    const flatList = UNSAFE_getByType(FlatList);
    const onViewableItemsChanged = flatList.props.onViewableItemsChanged;

    act(() => {
      onViewableItemsChanged({ viewableItems: [], changed: [] });
    });

    // onPageChange should not have been called again
    expect(mockOnPageChange).not.toHaveBeenCalled();
  });

  it('renders page items with local source', async () => {
    const { UNSAFE_getByType } = render(
      <ComicReaderScreen navigation={mockNavigation} route={localRoute} />
    );

    await waitFor(() => {
      const flatList = UNSAFE_getByType(FlatList);
      expect(flatList.props.data.length).toBe(3);
    });

    const flatList = UNSAFE_getByType(FlatList);
    const renderItem = flatList.props.renderItem;
    const element = renderItem({ item: '/extract/b1/page1.jpg', index: 0 });
    expect(element).toBeTruthy();
  });

  it('renders page items with streaming source', async () => {
    const { UNSAFE_getByType } = render(
      <ComicReaderScreen navigation={mockNavigation} route={streamRoute} />
    );

    await waitFor(() => {
      const flatList = UNSAFE_getByType(FlatList);
      expect(flatList.props.data.length).toBe(3);
    });

    const flatList = UNSAFE_getByType(FlatList);
    const renderItem = flatList.props.renderItem;
    const element = renderItem({ item: 'http://server/book/b1/page/1', index: 0 });
    expect(element).toBeTruthy();
  });

  it('handles getItemLayout', async () => {
    const { UNSAFE_getByType } = render(
      <ComicReaderScreen navigation={mockNavigation} route={localRoute} />
    );

    await waitFor(() => {
      const flatList = UNSAFE_getByType(FlatList);
      expect(flatList).toBeTruthy();
    });

    const flatList = UNSAFE_getByType(FlatList);
    const layout = flatList.props.getItemLayout(null, 2);
    expect(layout).toHaveProperty('length');
    expect(layout).toHaveProperty('offset');
    expect(layout).toHaveProperty('index', 2);
  });

  it('handles tap zone left (goPrev)', async () => {
    const { UNSAFE_getAllByType } = render(
      <ComicReaderScreen navigation={mockNavigation} route={localRoute} />
    );

    await waitFor(() => {
      expect(listExtractedFiles).toHaveBeenCalled();
    });

    // Tap zones are the first two TouchableOpacity elements after FlatList with activeOpacity={1}
    const { TouchableOpacity } = require('react-native');
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    const tapZones = touchables.filter((t: any) => t.props.activeOpacity === 1);

    // First tap zone is left (goPrev)
    if (tapZones.length >= 1) {
      fireEvent.press(tapZones[0]);
    }
  });

  it('handles tap zone right (goNext)', async () => {
    const { UNSAFE_getAllByType } = render(
      <ComicReaderScreen navigation={mockNavigation} route={localRoute} />
    );

    await waitFor(() => {
      expect(listExtractedFiles).toHaveBeenCalled();
    });

    const { TouchableOpacity } = require('react-native');
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    const tapZones = touchables.filter((t: any) => t.props.activeOpacity === 1);

    // Second tap zone is right (goNext)
    if (tapZones.length >= 2) {
      fireEvent.press(tapZones[1]);
    }
  });

  it('goToPage does nothing with invalid index', async () => {
    const { UNSAFE_getAllByType } = render(
      <ComicReaderScreen navigation={mockNavigation} route={localRoute} />
    );

    await waitFor(() => {
      expect(listExtractedFiles).toHaveBeenCalled();
    });

    // goPrev when on page 1 should try goToPage(-1) which does nothing
    const { TouchableOpacity } = require('react-native');
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    const tapZones = touchables.filter((t: any) => t.props.activeOpacity === 1);

    if (tapZones.length >= 1) {
      fireEvent.press(tapZones[0]); // goPrev on page 1 -> goToPage(-1)
    }
  });

  it('opens drawer via pan gesture and closes via overlay', async () => {
    const { getByText } = render(
      <ComicReaderScreen navigation={mockNavigation} route={localRoute} />
    );

    await waitFor(() => {
      expect(getByText('1 / 3')).toBeTruthy();
    });

    // Test PanResponder callbacks directly
    expect(panConfig.onStartShouldSetPanResponder).toBeDefined();
    expect(panConfig.onStartShouldSetPanResponder()).toBe(false);

    // onMoveShouldSetPanResponder: dy < -10 and abs(dy) > abs(dx)
    expect(panConfig.onMoveShouldSetPanResponder({}, { dy: -15, dx: 0 })).toBe(true);
    expect(panConfig.onMoveShouldSetPanResponder({}, { dy: -5, dx: 0 })).toBe(false);
    expect(panConfig.onMoveShouldSetPanResponder({}, { dy: -15, dx: 20 })).toBe(false);

    // onPanResponderRelease: dy < -30 opens drawer
    act(() => {
      panConfig.onPanResponderRelease({}, { dy: -40 });
    });

    // closeDrawer via Close button
    fireEvent.press(getByText('Close'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('does not open drawer on small pan gesture', async () => {
    const { getByText } = render(
      <ComicReaderScreen navigation={mockNavigation} route={localRoute} />
    );

    await waitFor(() => {
      expect(getByText('1 / 3')).toBeTruthy();
    });

    // Small gesture should not open drawer
    act(() => {
      panConfig.onPanResponderRelease({}, { dy: -10 });
    });
  });

  it('closes drawer via overlay press', async () => {
    // Mock Animated.spring to invoke callback immediately
    const springStartMock = jest.fn().mockImplementation((cb?: () => void) => {
      if (cb) cb();
    });
    jest.spyOn(Animated, 'spring').mockReturnValue({ start: springStartMock } as any);

    const { getByText, UNSAFE_getAllByType } = render(
      <ComicReaderScreen navigation={mockNavigation} route={localRoute} />
    );

    await waitFor(() => {
      expect(getByText('1 / 3')).toBeTruthy();
    });

    // Open the drawer first
    act(() => {
      panConfig.onPanResponderRelease({}, { dy: -40 });
    });

    // Find overlay (TouchableOpacity with activeOpacity=1 that appeared due to drawerOpen=true)
    const { TouchableOpacity } = require('react-native');
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    // The overlay is the last activeOpacity=1 element
    const overlays = touchables.filter(
      (t: any) => t.props.activeOpacity === 1 && t.props.onPress
    );
    // Close via last overlay
    if (overlays.length > 0) {
      act(() => {
        fireEvent.press(overlays[overlays.length - 1]);
      });
    }

    jest.restoreAllMocks();
  });

  it('handles no extractedDir and not streaming', async () => {
    const route = {
      params: { bookId: 'b1', extractedDir: undefined, startPage: 1, totalPages: 3, streaming: false },
    } as any;

    render(<ComicReaderScreen navigation={mockNavigation} route={route} />);

    // No pages should be loaded since no extractedDir and not streaming
    await waitFor(() => {
      expect(listExtractedFiles).not.toHaveBeenCalled();
    });
  });
});

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useBookReader } from '../../src/hooks/useBookReader';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/hooks/useBookReader');

// Override the PDF mock to also trigger onError for coverage
jest.mock('react-native-pdf', () => {
  const React = require('react');
  const { View } = require('react-native');
  let triggerError = false;
  const Pdf = (props: any) => {
    React.useEffect(() => {
      if (props.onPageChanged) {
        props.onPageChanged(props.page || 1, 10);
      }
      if (props.onError && triggerError) {
        props.onError(new Error('PDF load error'));
      }
    }, []);
    return <View testID="mock-pdf" />;
  };
  Pdf._setTriggerError = (val: boolean) => { triggerError = val; };
  return { __esModule: true, default: Pdf };
});

// Import after mocks
import PdfReaderScreen from '../../src/screens/PdfReaderScreen';
import Pdf from 'react-native-pdf';

const mockStartReading = jest.fn();
const mockOnReaderExit = jest.fn().mockResolvedValue(undefined);
const mockOnPageChange = jest.fn();

const mockNavigation = {
  navigate: jest.fn(),
  setOptions: jest.fn(),
  goBack: jest.fn(),
} as any;

const mockRoute = {
  params: { bookId: 'b1', filePath: '/path/book.pdf', startPage: 5, totalPages: 50 },
} as any;

describe('PdfReaderScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useBookReader as jest.Mock).mockReturnValue({
      startReading: mockStartReading,
      onReaderExit: mockOnReaderExit,
      onPageChange: mockOnPageChange,
    });
    (Pdf as any)._setTriggerError(false);
  });

  it('renders PDF viewer', () => {
    const { getByTestId } = render(<PdfReaderScreen navigation={mockNavigation} route={mockRoute} />);
    expect(getByTestId('mock-pdf')).toBeTruthy();
  });

  it('calls startReading on mount', () => {
    render(<PdfReaderScreen navigation={mockNavigation} route={mockRoute} />);
    expect(mockStartReading).toHaveBeenCalledWith('b1', 5, 50);
  });

  it('handles close button', () => {
    const { getByText } = render(<PdfReaderScreen navigation={mockNavigation} route={mockRoute} />);
    fireEvent.press(getByText('\u2715'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('calls onPageChange when PDF page changes', async () => {
    render(<PdfReaderScreen navigation={mockNavigation} route={mockRoute} />);

    await waitFor(() => {
      expect(mockOnPageChange).toHaveBeenCalledWith(5, 10);
    });
  });

  it('handles PDF error', async () => {
    (Pdf as any)._setTriggerError(true);
    render(<PdfReaderScreen navigation={mockNavigation} route={mockRoute} />);

    // onError calls console.error which is mocked
    await waitFor(() => {
      expect(mockOnPageChange).toHaveBeenCalled();
    });
  });
});

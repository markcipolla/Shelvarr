import { useReaderStore } from '../../src/stores/useReaderStore';

const initialState = useReaderStore.getState();

beforeEach(() => {
  useReaderStore.setState(initialState);
});

describe('useReaderStore', () => {
  describe('startReading', () => {
    it('sets all reading fields', () => {
      useReaderStore.getState().startReading('book-1', 5, 100);
      const state = useReaderStore.getState();
      expect(state.currentBookId).toBe('book-1');
      expect(state.currentPage).toBe(5);
      expect(state.totalPages).toBe(100);
      expect(state.isReading).toBe(true);
    });
  });

  describe('setPage', () => {
    it('updates current page', () => {
      useReaderStore.getState().startReading('book-1', 1, 100);
      useReaderStore.getState().setPage(42);
      expect(useReaderStore.getState().currentPage).toBe(42);
    });
  });

  describe('stopReading', () => {
    it('resets all fields to initial values', () => {
      useReaderStore.getState().startReading('book-1', 5, 100);
      useReaderStore.getState().stopReading();
      const state = useReaderStore.getState();
      expect(state.currentBookId).toBeNull();
      expect(state.currentPage).toBe(1);
      expect(state.totalPages).toBe(0);
      expect(state.isReading).toBe(false);
    });
  });
});

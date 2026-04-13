import { create } from 'zustand';

interface ReaderState {
  currentBookId: string | null;
  currentPage: number;
  totalPages: number;
  isReading: boolean;

  startReading: (bookId: string, page: number, totalPages: number) => void;
  setPage: (page: number) => void;
  stopReading: () => void;
}

export const useReaderStore = create<ReaderState>((set) => ({
  currentBookId: null,
  currentPage: 1,
  totalPages: 0,
  isReading: false,

  startReading: (bookId, page, totalPages) =>
    set({ currentBookId: bookId, currentPage: page, totalPages, isReading: true }),

  setPage: (page) => set({ currentPage: page }),

  stopReading: () =>
    set({ currentBookId: null, currentPage: 1, totalPages: 0, isReading: false }),
}));

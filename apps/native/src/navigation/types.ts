import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Books: undefined;
  Comics: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Home: undefined;
  Comics: undefined;
  Library: { libraryId: string; libraryName: string };
  Series: { seriesId: string; seriesName: string };
  BookDetail: { bookId: string };
  EpubReader: { bookId: string; filePath: string; totalPages: number };
  PdfReader: { bookId: string; filePath: string; startPage: number; totalPages: number };
  ComicReader: {
    bookId: string;
    extractedDir?: string;
    startPage: number;
    totalPages: number;
    streaming: boolean;
  };
  Settings: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

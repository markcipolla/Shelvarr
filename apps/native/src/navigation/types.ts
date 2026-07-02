import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Home: undefined;
  Books: undefined;
  Comics: undefined;
  Wanted: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Home: undefined;
  Books: undefined;
  Comics: undefined;
  Wanted: undefined;
  WantedSearch: undefined;
  DownloadSearch: {
    wantedBookId: number;
    title: string;
    author?: string;
    isbn?: string;
  };
  Library: { libraryId: string; libraryName: string };
  Series: { seriesId: string; seriesName: string };
  BookDetail: { bookId: string };
  ComicDetail: { volumeId: number };
  IssueDetail: { volumeId: number; issueId: number; volumeTitle?: string };
  EpubReader: { bookId: string; filePath: string; totalPages: number };
  PdfReader: {
    bookId: string;
    filePath: string;
    startPage: number;
    totalPages: number;
    kind?: 'comic';
    issueId?: number;
  };
  ComicReader: {
    bookId: string;
    extractedDir?: string;
    startPage: number;
    totalPages: number;
    streaming: boolean;
    kind?: 'comic';
    issueId?: number;
  };
  Settings: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import RenderHtml from 'react-native-render-html';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useBookReader } from '../hooks/useBookReader';
import { parseEpub, EpubBook } from '../services/epubParser';
import { syncEpubProgress, flushProgress } from '../services/progressSync';
import { getEpubProgression } from '../services/api/books';
import { getEpubPosition, saveEpubPosition } from '../services/epubPositionStore';
import { updateReadingStatus } from '../services/api/shelvarr';

type Props = NativeStackScreenProps<RootStackParamList, 'EpubReader'>;

const TOOLBAR_HEIGHT = 52;
const LINE_HEIGHT = 42;
// Space between screen edge and text on all sides
const PADDING_HORIZONTAL = 28;
const PADDING_TOP = 48;
const PADDING_BOTTOM = 48;

export default function EpubReaderScreen({ route, navigation }: Props) {
  const { bookId, filePath, totalPages: komgaTotalPages } = route.params;
  const { onReaderExit, startReading } = useBookReader(bookId);
  const { width } = useWindowDimensions();
  const [book, setBook] = useState<EpubBook | null>(null);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The height of the visible text frame (measured via onLayout)
  const [frameHeight, setFrameHeight] = useState(0);
  // The full rendered height of the current chapter's content
  const [contentHeight, setContentHeight] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  // How many lines fit in the frame, and the exact pixel stride per page
  const linesPerPage = frameHeight > 0 ? Math.floor(frameHeight / LINE_HEIGHT) : 1;
  const stride = linesPerPage * LINE_HEIGHT;
  const totalPages = stride > 0 && contentHeight > 0 ? Math.max(1, Math.ceil(contentHeight / stride)) : 1;

  // The Y offset to shift the content up for the current page
  const offsetY = currentPage * stride;

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
    StatusBar.setHidden(true);
    NavigationBar.setVisibilityAsync('hidden');

    Promise.all([parseEpub(filePath, bookId), getEpubPosition(bookId), getEpubProgression(bookId)])
      .then(async ([parsed, localPos, serverPos]) => {
        setBook(parsed);
        startReading(bookId, 1, komgaTotalPages);

        // Restore position: prefer local, fall back to server
        let resumeChapter = 0;
        let resumePage = 0;
        if (localPos && localPos.chapter < parsed.chapters.length) {
          resumeChapter = localPos.chapter;
          resumePage = localPos.page;
        } else if (serverPos?.locator) {
          const idx = parsed.chapters.findIndex((c) => c.href === serverPos.locator.href);
          if (idx > 0) resumeChapter = idx;
        }

        if (resumeChapter > 0 || resumePage > 0) {
          setCurrentChapter(resumeChapter);
          setCurrentPage(resumePage);
        }

        // Sync current position
        /* istanbul ignore next */
        syncEpubProgress(bookId, 0, false, parsed.chapters[0]?.href ?? '');
        await flushProgress(bookId);

        // Fire-and-forget: mark as "currently reading" on Hardcover
        updateReadingStatus(bookId, 'reading');
      })
      .catch((err) => {
        console.error('EPUB parse error:', err);
        setError(err.message || 'Failed to open EPUB');
      })
      .finally(() => setLoading(false));

    return () => {
      StatusBar.setHidden(false);
      NavigationBar.setVisibilityAsync('visible');
      onReaderExit();
    };
  }, []);

  const goToChapter = useCallback(
    (index: number) => {
      /* istanbul ignore next */ if (!book || index < 0 || index >= book.chapters.length) return;
      setCurrentChapter(index);
      setCurrentPage(0);
      setContentHeight(0);
      const progress = (index + 1) / book.chapters.length;
      syncEpubProgress(bookId, progress, index >= book.chapters.length - 1, book.chapters[index].href);
    },
    [book, bookId]
  );

  const goNextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    } else if (book && currentChapter >= book.chapters.length - 1) {
      // Last page of last chapter — mark completed and exit
      /* istanbul ignore next */
      const lastHref = book.chapters[currentChapter]?.href ?? '';
      syncEpubProgress(bookId, 1.0, true, lastHref);
      // Fire-and-forget: mark as "read" on Hardcover
      updateReadingStatus(bookId, 'read');
      flushProgress(bookId).then(() => navigation.goBack());
    } else {
      goToChapter(currentChapter + 1);
    }
  }, [currentPage, totalPages, currentChapter, goToChapter, book, bookId, navigation]);

  /* istanbul ignore next */
  const goPrevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    } else if (currentChapter > 0) {
      goToChapter(currentChapter - 1);
    }
  }, [currentPage, currentChapter, goToChapter]);

  const onFrameLayout = useCallback((e: LayoutChangeEvent) => {
    setFrameHeight(e.nativeEvent.layout.height);
  }, []);

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    setContentHeight(e.nativeEvent.layout.height);
  }, []);

  // Sync progress to server + save locally
  useEffect(() => {
    if (!book) return;
    const isLastChapter = currentChapter >= book.chapters.length - 1;
    const isLastPage = currentPage >= totalPages - 1;
    const completed = isLastChapter && isLastPage;
    const chapterFraction = currentChapter / book.chapters.length;
    const pageFraction = totalPages > 1 ? currentPage / totalPages : 0;
    const overallProgress = chapterFraction + pageFraction / book.chapters.length;
    /* istanbul ignore next */
    const chapterHref = book.chapters[currentChapter]?.href ?? '';
    syncEpubProgress(bookId, completed ? 1.0 : overallProgress, completed, chapterHref);
    saveEpubPosition(bookId, currentChapter, currentPage);
  }, [currentChapter, currentPage, totalPages, book, bookId]);

  if (loading) {
    return (
      <View style={styles.centerLight}>
        <ActivityIndicator size="large" color="#555" />
        <Text style={styles.loadingText}>Opening EPUB...</Text>
      </View>
    );
  }

  if (error || !book) {
    /* istanbul ignore next */
    const errorMsg = error || 'Failed to load book';
    return (
      <View style={styles.centerLight}>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const chapter = book.chapters[currentChapter];
  const bodyHtml = stripEpubStyles(extractBody(chapter.html));

  return (
    <View style={styles.container}>
      {/* Top padding zone */}
      <View style={styles.topPadding} />

      {/* The visible text frame — overflow hidden clips content above/below */}
      <View style={styles.textFrame} onLayout={onFrameLayout}>
        <View style={{ transform: [{ translateY: -offsetY }] }} onLayout={onContentLayout}>
          <RenderHtml
            contentWidth={width - PADDING_HORIZONTAL * 2}
            source={{ html: bodyHtml }}
            baseStyle={baseStyle}
            tagsStyles={tagsStyles}
            ignoredStyles={IGNORED_STYLES}
            enableExperimentalMarginCollapsing
          />
        </View>
      </View>

      {/* Bottom padding zone */}
      <View style={styles.bottomPadding} />

      {/* Tap zones — cover the full reading area */}
      <TouchableOpacity
        style={styles.tapZoneLeft}
        onPress={goPrevPage}
        activeOpacity={1}
      />
      <TouchableOpacity
        style={styles.tapZoneRight}
        onPress={goNextPage}
        activeOpacity={1}
      />

      {/* Always-visible bottom toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.toolbarBtn, currentChapter === 0 && currentPage === 0 && styles.toolbarBtnDisabled]}
          onPress={goPrevPage}
          disabled={currentChapter === 0 && currentPage === 0}
        >
          <Text style={styles.toolbarBtnText}>←</Text>
        </TouchableOpacity>

        <View style={styles.toolbarInfo}>
          <Text style={styles.toolbarChapter} numberOfLines={1}>
            {chapter.title}
          </Text>
          <Text style={styles.toolbarPage}>
            Ch {currentChapter + 1}/{book.chapters.length}  ·  {currentPage + 1}/{totalPages}
          </Text>
        </View>

        <TouchableOpacity style={styles.toolbarBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.toolbarBtnText}>✕</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toolbarBtn,
            currentChapter >= book.chapters.length - 1 && currentPage >= totalPages - 1 && styles.toolbarBtnDisabled,
          ]}
          onPress={goNextPage}
          disabled={currentChapter >= book.chapters.length - 1 && currentPage >= totalPages - 1}
        >
          <Text style={styles.toolbarBtnText}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* istanbul ignore next */
function extractBody(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

function stripEpubStyles(html: string): string {
  let cleaned = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/\sstyle="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\sclass="[^"]*"/gi, '');
  return cleaned;
}

const IGNORED_STYLES = [
  'font-family',
  'font-size',
  'line-height',
  'color',
  'background-color',
  'background',
  'margin',
  'padding',
  'text-align',
  'text-indent',
] as any;

const baseStyle = {
  color: '#222',
  fontSize: 24,
  lineHeight: 42,
  fontFamily: 'Literata-Regular',
};

const tagsStyles: Record<string, any> = {
  p: { marginBottom: 18 },
  h1: { fontSize: 32, fontWeight: 'bold', fontFamily: 'Literata-Bold', color: '#111', marginBottom: 20, marginTop: 32 },
  h2: { fontSize: 28, fontWeight: 'bold', fontFamily: 'Literata-Bold', color: '#111', marginBottom: 16, marginTop: 28 },
  h3: { fontSize: 25, fontWeight: 'bold', fontFamily: 'Literata-Bold', color: '#222', marginBottom: 12, marginTop: 20 },
  h4: { fontSize: 24, fontWeight: 'bold', fontFamily: 'Literata-Bold', color: '#333', marginBottom: 10, marginTop: 16 },
  em: { fontStyle: 'italic', fontFamily: 'Literata-Italic' },
  strong: { fontWeight: 'bold', fontFamily: 'Literata-Bold', color: '#111' },
  a: { color: '#2563eb', textDecorationLine: 'none' },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#999',
    paddingLeft: 16,
    marginLeft: 0,
    fontStyle: 'italic',
    color: '#555',
    marginBottom: 18,
  },
  li: { marginBottom: 8 },
  img: { maxWidth: '100%' },
  hr: { borderTopWidth: 1, borderTopColor: '#ddd', marginVertical: 28 },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb' },
  centerLight: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f1eb',
  },
  loadingText: { color: '#888', marginTop: 12, fontSize: 14 },
  errorText: { color: '#c00', fontSize: 16, marginBottom: 16 },
  backButton: {
    backgroundColor: '#e8e4de',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: { color: '#333', fontSize: 15 },
  topPadding: {
    height: PADDING_TOP,
  },
  textFrame: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: PADDING_HORIZONTAL,
  },
  bottomPadding: {
    height: PADDING_BOTTOM,
  },
  tapZoneLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '30%',
    bottom: TOOLBAR_HEIGHT,
  },
  tapZoneRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '30%',
    bottom: TOOLBAR_HEIGHT,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TOOLBAR_HEIGHT,
    backgroundColor: '#e8e4de',
    borderTopWidth: 1,
    borderTopColor: '#d5d0c8',
    paddingHorizontal: 8,
  },
  toolbarBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbarBtnDisabled: { opacity: 0.25 },
  toolbarBtnText: { fontSize: 20, color: '#333' },
  toolbarInfo: { flex: 1, alignItems: 'center' },
  toolbarChapter: { fontSize: 12, color: '#555', fontWeight: '500' },
  toolbarPage: { fontSize: 11, color: '#888', marginTop: 1 },
});

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  Image,
  StyleSheet,
  Dimensions,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Animated,
  PanResponder,
} from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useBookReader } from '../hooks/useBookReader';
import { getBookPageUrl } from '../services/api/books';
import { listExtractedFiles } from '../services/fileManager';
import { getBookExtractDir } from '../utils/paths';
import { useAuthHeaders } from '../hooks/useAuthHeaders';

type Props = NativeStackScreenProps<RootStackParamList, 'ComicReader'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_HEIGHT = 80;

export default function ComicReaderScreen({ route, navigation }: Props) {
  const { bookId, extractedDir, startPage, totalPages, streaming } = route.params;
  const { onPageChange, onReaderExit, startReading } = useBookReader(bookId);
  const headers = useAuthHeaders();
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(startPage);
  const flatListRef = useRef<FlatList>(null);

  // Drawer
  const drawerY = useRef(new Animated.Value(DRAWER_HEIGHT)).current;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy < -10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderRelease: (_, gs) => {
        if (gs.dy < -30) openDrawer();
      },
    })
  ).current;

  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.spring(drawerY, { toValue: 0, useNativeDriver: true }).start();
  };

  const closeDrawer = () => {
    Animated.spring(drawerY, { toValue: DRAWER_HEIGHT, useNativeDriver: true }).start(() => {
      setDrawerOpen(false);
    });
  };

  useEffect(() => {
    startReading(bookId, startPage, totalPages);
    navigation.setOptions({ headerShown: false });
    StatusBar.setHidden(true);
    NavigationBar.setVisibilityAsync('hidden');

    if (streaming) {
      const urls = Array.from({ length: totalPages }, (_, i) =>
        getBookPageUrl(bookId, i + 1)
      );
      setPages(urls);
    } else if (extractedDir) {
      listExtractedFiles(bookId).then((files) => {
        setPages(files.map((f) => `${getBookExtractDir(bookId)}${f}`));
      });
    }

    return () => {
      StatusBar.setHidden(false);
      NavigationBar.setVisibilityAsync('visible');
      onReaderExit();
    };
  }, []);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: any) => {
      if (viewableItems.length > 0) {
        const page = viewableItems[0].index + 1;
        setCurrentPage(page);
        onPageChange(page, totalPages);
      }
    },
    [totalPages, onPageChange]
  );

  const goToPage = useCallback(
    (pageIndex: number) => {
      if (pageIndex < 0 || pageIndex >= pages.length) return;
      flatListRef.current?.scrollToIndex({ index: pageIndex, animated: true });
    },
    [pages.length]
  );

  const goNext = useCallback(() => goToPage(currentPage), [currentPage, goToPage]);
  const goPrev = useCallback(() => goToPage(currentPage - 2), [currentPage, goToPage]);

  const renderPage = useCallback(
    ({ item }: { item: string }) => {
      const source = streaming ? { uri: item, headers } : { uri: item };
      return (
        <ReactNativeZoomableView
          maxZoom={3}
          minZoom={1}
          initialZoom={1}
          bindToBorders
          style={styles.zoomView}
        >
          <Image source={source} style={styles.pageImage} resizeMode="contain" />
        </ReactNativeZoomableView>
      );
    },
    [streaming, headers]
  );

  if (pages.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#e94560" />
      </View>
    );
  }

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <FlatList
        ref={flatListRef}
        data={pages}
        horizontal
        pagingEnabled
        keyExtractor={(_, index) => index.toString()}
        renderItem={renderPage}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        initialScrollIndex={Math.max(0, startPage - 1)}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        showsHorizontalScrollIndicator={false}
      />

      {/* Tap zones */}
      <TouchableOpacity
        style={styles.tapZoneLeft}
        onPress={goPrev}
        activeOpacity={1}
      />
      <TouchableOpacity
        style={styles.tapZoneRight}
        onPress={goNext}
        activeOpacity={1}
      />

      {/* Page indicator */}
      <View style={styles.pageIndicator}>
        <Text style={styles.pageText}>
          {currentPage} / {totalPages}
        </Text>
      </View>

      {/* Pull-up drawer */}
      <Animated.View
        style={[styles.drawer, { transform: [{ translateY: drawerY }] }]}
      >
        <View style={styles.drawerHandle} />
        <View style={styles.drawerButtons}>
          <TouchableOpacity style={styles.drawerButton} onPress={() => navigation.goBack()}>
            <Text style={styles.drawerButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {drawerOpen && (
        <TouchableOpacity
          style={styles.overlay}
          onPress={closeDrawer}
          activeOpacity={1}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  zoomView: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  pageImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  pageIndicator: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  pageText: { color: '#888', fontSize: 11 },
  tapZoneLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '30%',
    bottom: 0,
  },
  tapZoneRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '30%',
    bottom: 0,
  },
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: '#16213e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    elevation: 10,
  },
  drawerHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 10,
  },
  drawerButtons: { flexDirection: 'row', gap: 8 },
  drawerButton: {
    flex: 1,
    backgroundColor: '#0f3460',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  drawerButtonText: { color: '#e0e0e0', fontSize: 14 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: DRAWER_HEIGHT,
  },
});

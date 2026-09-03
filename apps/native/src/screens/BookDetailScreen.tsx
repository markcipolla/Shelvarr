import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Book, Series } from '../types/api';
import { fetchBook, getBookThumbnailUrl, deleteReadProgress, updateReadProgress } from '../services/api/books';
import { fetchSeries } from '../services/api/series';
import { getMediaFormat, getFormatFromName } from '../utils/fileTypes';
import { useAuthHeaders } from '../hooks/useAuthHeaders';
import { useDownloadStore } from '../stores/useDownloadStore';
import { prepareBookForReading, downloadBook, removeDownloadedBook } from '../services/downloadManager';
import { updateReadingStatus, ReadingStatus } from '../services/api/shelvarr';

type Props = NativeStackScreenProps<RootStackParamList, 'BookDetail'>;

/**
 * Download button label. Shows a percentage once progress advances, but falls
 * back to an indeterminate "Downloading…" when the total size is unknown (the
 * server sent no Content-Length, so progress stays at 0).
 */
function DownloadingLabel({ progress, textStyle, color }: {
  progress: number;
  textStyle: object;
  color: string;
}) {
  return (
    <View style={styles.downloadingRow}>
      <ActivityIndicator color={color} />
      <Text style={textStyle}>
        {progress > 0 ? `Downloading... ${Math.round(progress * 100)}%` : 'Downloading...'}
      </Text>
    </View>
  );
}

export default function BookDetailScreen({ route, navigation }: Props) {
  const { bookId } = route.params;
  const [book, setBook] = useState<Book | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const headers = useAuthHeaders();
  const downloadProgress = useDownloadStore((s) => s.progress);
  const activeDownloadId = useDownloadStore((s) => s.activeDownloadId);
  const downloadedEntry = useDownloadStore((s) => s.downloads[bookId]);
  const isDownloaded = !!downloadedEntry;

  useEffect(() => {
    fetchBook(bookId)
      .then((b) => {
        setBook(b);
        return fetchSeries(b.seriesId).then(setSeries).catch(() => {});
      })
      .catch(() => {
        // Offline fallback: use the cached book stored alongside the download.
        if (downloadedEntry?.book) {
          setBook(downloadedEntry.book);
        } else {
          Alert.alert('Error', 'Failed to load book details');
        }
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  const handleRead = async () => {
    /* istanbul ignore next -- button only shown when book is loaded */
    if (!book) return;
    const format = getMediaFormat(book.media.mediaType) !== 'unknown'
      ? getMediaFormat(book.media.mediaType)
      : getFormatFromName(book.name);
    await downloadAndRead(book, format);
  };

  const downloadAndRead = async (book: Book, format: string) => {
    setPreparing(true);
    try {
      const result = await prepareBookForReading(book);
      /* istanbul ignore next */
      const startPage = book.readProgress?.page || 1;
      /* istanbul ignore next */
      const totalPages = book.media.pagesCount || 0;

      switch (format) {
        case 'epub':
          navigation.navigate('EpubReader', { bookId, filePath: result.filePath, totalPages });
          break;
        case 'pdf':
          navigation.navigate('PdfReader', { bookId, filePath: result.filePath, startPage, totalPages });
          break;
        case 'cbz':
        case 'cbr':
          navigation.navigate('ComicReader', {
            bookId,
            extractedDir: result.extractedDir,
            startPage,
            totalPages,
            streaming: false,
          });
          break;
        default:
          Alert.alert('Unsupported', `Format "${format}" is not supported yet.`);
      }
    } catch (err: any) {
      /* istanbul ignore next */
      Alert.alert('Error', err.message || 'Failed to prepare book');
    } finally {
      setPreparing(false);
    }
  };

  const handleDownload = async () => {
    if (!book) return;
    setDownloading(true);
    try {
      await downloadBook(book);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to download book');
    } finally {
      setDownloading(false);
    }
  };

  const handleRemoveDownload = async () => {
    if (!book) return;
    try {
      await removeDownloadedBook(book.id);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to remove download');
    }
  };

  const handleSetStatus = async (status: ReadingStatus, label: string) => {
    if (!book) return;
    try {
      await updateReadingStatus(book.id, status);
      Alert.alert('Hardcover', `Marked as ${label}`);
    } catch {
      Alert.alert('Error', 'Failed to sync to Hardcover');
    }
  };

  const handleMarkUnread = async () => {
    /* istanbul ignore next */
    if (!book) return;
    try {
      await deleteReadProgress(book.id);
      setBook({ ...book, readProgress: null });
    } catch {
      Alert.alert('Error', 'Failed to mark as unread');
    }
  };

  const handleMarkCompleted = async () => {
    /* istanbul ignore next */
    if (!book) return;
    try {
      await updateReadProgress(book.id, book.readProgress?.page ?? 0, true);
      setBook({
        ...book,
        readProgress: {
          page: book.readProgress?.page ?? 0,
          completed: true,
          readDate: book.readProgress?.readDate ?? '',
          created: book.readProgress?.created ?? '',
          lastModified: book.readProgress?.lastModified ?? '',
        },
      });
    } catch {
      Alert.alert('Error', 'Failed to mark as completed');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8b5e3c" />
      </View>
    );
  }

  if (!book) return null;

  const format = getMediaFormat(book.media.mediaType) !== 'unknown'
      ? getMediaFormat(book.media.mediaType)
      : getFormatFromName(book.name);
  const sizeMB = (book.sizeBytes / (1024 * 1024)).toFixed(1);
  const isDownloading = preparing && activeDownloadId === bookId;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Image
          source={{ uri: getBookThumbnailUrl(book.id), headers }}
          style={styles.cover}
          resizeMode="cover"
        />
        <View style={styles.meta}>
          <Text style={styles.title}>{book.metadata.title || book.name}</Text>
          {book.metadata.authors.length > 0 && (
            <Text style={styles.author}>
              {book.metadata.authors.map((a) => a.name).join(', ')}
            </Text>
          )}
          {/* istanbul ignore next */ series && (
            <TouchableOpacity
              onPress={() => navigation.navigate('Series', {
                seriesId: series.id,
                seriesName: series.metadata.title || series.name,
              })}
            >
              <Text style={styles.seriesLink}>{series.metadata.title || series.name} ›</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.detail}>Format: {format.toUpperCase()}</Text>
          <Text style={styles.detail}>Pages: {book.media.pagesCount}</Text>
          <Text style={styles.detail}>Size: {sizeMB} MB</Text>
          {book.readProgress && (
            <Text style={styles.detail}>
              Progress: {book.readProgress.completed ? 'Completed' : `Page ${book.readProgress.page}`}
            </Text>
          )}
        </View>
      </View>

      {book.metadata.summary ? (
        <Text style={styles.summary}>{book.metadata.summary}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.readButton, preparing && styles.readButtonDisabled]}
        onPress={handleRead}
        disabled={preparing}
      >
        {isDownloading ? (
          <DownloadingLabel progress={downloadProgress} textStyle={styles.readButtonText} color="#fff" />
        ) : preparing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.readButtonText}>
            {book.readProgress && !book.readProgress.completed ? 'Continue Reading' : 'Read'}
          </Text>
        )}
      </TouchableOpacity>

      {isDownloaded ? (
        <TouchableOpacity style={styles.secondaryButton} onPress={handleRemoveDownload}>
          <Text style={styles.secondaryButtonText}>Remove Download</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.secondaryButton, (downloading || isDownloading) && styles.readButtonDisabled]}
          onPress={handleDownload}
          disabled={downloading || isDownloading}
        >
          {downloading && activeDownloadId === bookId ? (
            <DownloadingLabel progress={downloadProgress} textStyle={styles.secondaryButtonText} color="#333" />
          ) : downloading ? (
            <ActivityIndicator color="#333" />
          ) : (
            <Text style={styles.secondaryButtonText}>Download</Text>
          )}
        </TouchableOpacity>
      )}

      {!book.readProgress?.completed && (
        <TouchableOpacity style={styles.secondaryButton} onPress={handleMarkCompleted}>
          <Text style={styles.secondaryButtonText}>Mark as Completed</Text>
        </TouchableOpacity>
      )}

      {book.readProgress && (
        <TouchableOpacity style={styles.secondaryButton} onPress={handleMarkUnread}>
          <Text style={styles.secondaryButtonText}>Mark as Unread</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.statusLabel}>Hardcover status</Text>
      <View style={styles.statusGrid}>
        <TouchableOpacity
          style={styles.statusButton}
          onPress={() => handleSetStatus('want-to-read', 'Want to Read')}
        >
          <Text style={styles.statusButtonText}>Want to Read</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.statusButton}
          onPress={() => handleSetStatus('reading', 'Reading')}
        >
          <Text style={styles.statusButtonText}>Reading</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.statusButton}
          onPress={() => handleSetStatus('read', 'Read')}
        >
          <Text style={styles.statusButtonText}>Read</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.statusButton}
          onPress={() => handleSetStatus('dnf', 'Did Not Finish')}
        >
          <Text style={styles.statusButtonText}>Did Not Finish</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f1eb' },
  header: { flexDirection: 'row', padding: 16 },
  cover: { width: 200, height: 290, borderRadius: 6, backgroundColor: '#e8e4de' },
  meta: { flex: 1, marginLeft: 16, justifyContent: 'center' },
  title: { fontSize: 27, fontWeight: '600', color: '#222', marginBottom: 10 },
  author: { fontSize: 21, color: '#555', marginBottom: 10 },
  seriesLink: { fontSize: 20, color: '#8b5e3c', marginBottom: 10, fontWeight: '500' },
  detail: { fontSize: 20, color: '#777', marginBottom: 6 },
  summary: { fontSize: 21, color: '#444', lineHeight: 30, padding: 16, paddingTop: 0 },
  readButton: {
    backgroundColor: '#8b5e3c',
    borderRadius: 8,
    padding: 16,
    margin: 16,
    alignItems: 'center',
  },
  readButtonDisabled: { opacity: 0.6 },
  readButtonText: { color: '#fff', fontSize: 24, fontWeight: '600' },
  downloadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secondaryButton: {
    backgroundColor: '#e8e4de',
    borderRadius: 8,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d5d0c8',
  },
  secondaryButtonText: { color: '#333', fontSize: 22 },
  statusLabel: {
    fontSize: 18,
    color: '#777',
    marginHorizontal: 16,
    marginBottom: 8,
    fontWeight: '600',
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  statusButton: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: '#e8e4de',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d5d0c8',
  },
  statusButtonText: { color: '#333', fontSize: 18, fontWeight: '500' },
});

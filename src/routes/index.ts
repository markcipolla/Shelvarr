import { Router, Request, Response } from 'express';
import { readdirSync, statSync, Dirent } from 'fs';
import { join, dirname, resolve } from 'path';
import config from '../config/index.js';

function parseIdParam(param: string | string[] | undefined): number {
  if (!param) return NaN;
  const str = Array.isArray(param) ? param[0] : param;
  return str ? parseInt(str, 10) : NaN;
}
import { getAllSettings, setSetting } from '../db/index.js';
import {
  getAllLibraries,
  getLibraryById,
  createLibrary,
  updateLibrary,
  deleteLibrary,
  getLibraryBookCount,
} from '../services/library/index.js';
import {
  scanLibrary,
  getBooks,
  getBookById,
  updateBook,
  deleteBook,
} from '../services/scanner/index.js';
import * as metadataService from '../services/metadata/index.js';
import type { HealthResponse, Settings } from '../types/index.js';

const router = Router();

// Health check endpoint
router.get('/health', (_req: Request, res: Response) => {
  const response: HealthResponse = {
    status: 'ok',
    version: '0.0.1',
    timestamp: new Date().toISOString(),
  };
  res.json(response);
});

// Settings endpoints
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await getAllSettings() as Settings;
    settings._config = {
      libraryRoot: config.libraryRoot,
      supportedExtensions: config.supportedExtensions,
      komgaConfigured: !!(config.komga.url && config.komga.username),
    };
    res.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.put('/settings', async (req: Request, res: Response) => {
  try {
    const { key, value } = req.body as { key?: string; value?: unknown };
    if (!key) {
      res.status(400).json({ error: 'Key is required' });
      return;
    }
    await setSetting(key, value);
    res.json({ success: true, key, value });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Libraries endpoints
router.get('/libraries', async (_req: Request, res: Response) => {
  try {
    const libraries = await getAllLibraries();
    const librariesWithCount = await Promise.all(
      libraries.map(async lib => ({
        ...lib,
        bookCount: await getLibraryBookCount(lib.id),
      }))
    );
    res.json({ libraries: librariesWithCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.get('/libraries/:id', async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid library ID' });
      return;
    }

    const library = await getLibraryById(id);
    if (!library) {
      res.status(404).json({ error: 'Library not found' });
      return;
    }

    res.json({
      ...library,
      bookCount: await getLibraryBookCount(library.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/libraries', async (req: Request, res: Response) => {
  try {
    const { name, path, komgaLibraryId } = req.body as {
      name?: string;
      path?: string;
      komgaLibraryId?: string;
    };

    if (!name || !path) {
      res.status(400).json({ error: 'Name and path are required' });
      return;
    }

    const result = await createLibrary({ name, path, komgaLibraryId });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.library);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.put('/libraries/:id', async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid library ID' });
      return;
    }

    const { name, komgaLibraryId } = req.body as {
      name?: string;
      komgaLibraryId?: string;
    };

    const result = await updateLibrary(id, { name, komgaLibraryId });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.library);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.delete('/libraries/:id', async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid library ID' });
      return;
    }

    const result = await deleteLibrary(id);

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/libraries/:id/scan', async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid library ID' });
      return;
    }

    const library = await getLibraryById(id);
    if (!library) {
      res.status(404).json({ error: 'Library not found' });
      return;
    }

    // For now, run scan synchronously
    // TODO: Move to background job queue in Phase 6
    const result = await scanLibrary(id);

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Books endpoints
router.get('/books', async (req: Request, res: Response) => {
  try {
    const libraryId = req.query['libraryId']
      ? parseInt(req.query['libraryId'] as string, 10)
      : undefined;
    const search = req.query['search'] as string | undefined;
    const page = req.query['page']
      ? parseInt(req.query['page'] as string, 10)
      : 1;
    const pageSize = req.query['pageSize']
      ? parseInt(req.query['pageSize'] as string, 10)
      : 20;

    const result = await getBooks({ libraryId, search, page, pageSize });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.get('/books/:id', async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid book ID' });
      return;
    }

    const book = await getBookById(id);
    if (!book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    res.json(book);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.put('/books/:id', async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid book ID' });
      return;
    }

    const updates = req.body as {
      title?: string;
      authors?: string;
      seriesName?: string;
      seriesNumber?: number;
      isbn?: string;
      publisher?: string;
      publishDate?: string;
      description?: string;
      coverUrl?: string;
    };

    const result = await updateBook(id, updates);

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json(result.book);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.delete('/books/:id', async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid book ID' });
      return;
    }

    const result = await deleteBook(id);

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Metadata search endpoints
router.get('/search/books', async (req: Request, res: Response) => {
  try {
    const query = req.query['q'] as string;
    if (!query) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const sources = req.query['sources'] as string | undefined;
    const sourceList = sources
      ? (sources.split(',') as ('googlebooks' | 'openlibrary')[])
      : undefined;

    const results = await metadataService.searchBooks(query, { sources: sourceList });
    res.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.get('/search/isbn/:isbn', async (req: Request, res: Response) => {
  try {
    const isbnParam = req.params['isbn'];
    const isbn = Array.isArray(isbnParam) ? isbnParam[0] : isbnParam;
    if (!isbn) {
      res.status(400).json({ error: 'ISBN is required' });
      return;
    }

    const result = await metadataService.searchByIsbn(isbn);
    if (!result) {
      res.status(404).json({ error: 'No book found for this ISBN' });
      return;
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Refresh book metadata from external sources
router.post('/books/:id/refresh', async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid book ID' });
      return;
    }

    const book = await getBookById(id);
    if (!book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    // Parse authors from JSON string
    let authorString: string | undefined;
    if (book.authors) {
      try {
        const authors = JSON.parse(book.authors);
        if (Array.isArray(authors) && authors.length > 0) {
          authorString = authors[0]; // Use first author for search
        }
      } catch {
        // If not valid JSON, use as-is
        authorString = book.authors;
      }
    }

    // Try to auto-match based on existing metadata
    const metadata = await metadataService.autoMatch(
      book.title || '',
      authorString,
      book.isbn || undefined
    );

    if (!metadata) {
      res.status(404).json({ error: 'No metadata found for this book' });
      return;
    }

    // Update book with found metadata
    const result = await updateBook(id, {
      title: metadata.title,
      authors: metadata.authors,
      publisher: metadata.publisher,
      publishDate: metadata.publishDate,
      description: metadata.description,
      isbn: metadata.isbn,
      coverUrl: metadata.coverUrl,
    });

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({
      book: result.book,
      source: metadata.source,
      sourceId: metadata.sourceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Apply metadata from search result to a book
router.post('/books/:id/apply-metadata', async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid book ID' });
      return;
    }

    const book = await getBookById(id);
    if (!book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    const { source, sourceId } = req.body as {
      source?: 'googlebooks' | 'openlibrary';
      sourceId?: string;
    };

    if (!source || !sourceId) {
      res.status(400).json({ error: 'source and sourceId are required' });
      return;
    }

    // Fetch the metadata from the source
    const metadata = await metadataService.getBookBySourceId(source, sourceId);
    if (!metadata) {
      res.status(404).json({ error: 'Metadata not found' });
      return;
    }

    // Update book with the metadata
    const result = await updateBook(id, {
      title: metadata.title,
      authors: metadata.authors,
      publisher: metadata.publisher,
      publishDate: metadata.publishDate,
      description: metadata.description,
      isbn: metadata.isbn,
      coverUrl: metadata.coverUrl,
    });

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({
      book: result.book,
      source: metadata.source,
      sourceId: metadata.sourceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Series - placeholder
router.get('/series', (_req: Request, res: Response) => {
  res.json({ series: [], message: 'Not yet implemented' });
});

// Tasks - placeholder
router.get('/tasks', (_req: Request, res: Response) => {
  res.json({ tasks: [], message: 'Not yet implemented' });
});

// Authors - placeholder
router.get('/authors', (_req: Request, res: Response) => {
  res.json({ authors: [], message: 'Not yet implemented' });
});

// Downloads - placeholder
router.get('/downloads', (_req: Request, res: Response) => {
  res.json({ downloads: [], message: 'Not yet implemented' });
});

// Duplicates - placeholder
router.get('/duplicates', (_req: Request, res: Response) => {
  res.json({ duplicates: [], message: 'Not yet implemented' });
});

// Browse server directories
router.get('/browse', (req: Request, res: Response) => {
  try {
    let requestedPath = (req.query['path'] as string) || config.libraryRoot || '/';

    // Resolve to absolute path
    let absPath = resolve(requestedPath);

    // Check if path exists and is a directory, fall back to root if not
    let stats;
    try {
      stats = statSync(absPath);
      if (!stats.isDirectory()) {
        // If it's not a directory, fall back to root
        absPath = '/';
        stats = statSync(absPath);
      }
    } catch {
      // If path doesn't exist, fall back to root
      absPath = '/';
      try {
        stats = statSync(absPath);
      } catch {
        res.status(404).json({ error: 'Path not found' });
        return;
      }
    }

    if (!stats.isDirectory()) {
      res.status(400).json({ error: 'Path is not a directory' });
      return;
    }

    // List directory contents
    const entries: Dirent[] = readdirSync(absPath, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: join(absPath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      current: absPath,
      parent: absPath !== '/' ? dirname(absPath) : null,
      directories,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;

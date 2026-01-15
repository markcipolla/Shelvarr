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
router.get('/settings', (_req: Request, res: Response) => {
  try {
    const settings = getAllSettings() as Settings;
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

router.put('/settings', (req: Request, res: Response) => {
  try {
    const { key, value } = req.body as { key?: string; value?: unknown };
    if (!key) {
      res.status(400).json({ error: 'Key is required' });
      return;
    }
    setSetting(key, value);
    res.json({ success: true, key, value });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Libraries endpoints
router.get('/libraries', (_req: Request, res: Response) => {
  try {
    const libraries = getAllLibraries();
    const librariesWithCount = libraries.map(lib => ({
      ...lib,
      bookCount: getLibraryBookCount(lib.id),
    }));
    res.json({ libraries: librariesWithCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.get('/libraries/:id', (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid library ID' });
      return;
    }

    const library = getLibraryById(id);
    if (!library) {
      res.status(404).json({ error: 'Library not found' });
      return;
    }

    res.json({
      ...library,
      bookCount: getLibraryBookCount(library.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/libraries', (req: Request, res: Response) => {
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

    const result = createLibrary({ name, path, komgaLibraryId });

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

router.put('/libraries/:id', (req: Request, res: Response) => {
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

    const result = updateLibrary(id, { name, komgaLibraryId });

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

router.delete('/libraries/:id', (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid library ID' });
      return;
    }

    const result = deleteLibrary(id);

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

    const library = getLibraryById(id);
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
router.get('/books', (req: Request, res: Response) => {
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

    const result = getBooks({ libraryId, search, page, pageSize });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.get('/books/:id', (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid book ID' });
      return;
    }

    const book = getBookById(id);
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

router.put('/books/:id', (req: Request, res: Response) => {
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

    const result = updateBook(id, updates);

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

router.delete('/books/:id', (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid book ID' });
      return;
    }

    const result = deleteBook(id);

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

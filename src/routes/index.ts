import { Router, Request, Response } from 'express';
import config from '../config/index.js';
import { getAllSettings, setSetting } from '../db/index.js';
import type { HealthResponse, Settings } from '../types/index.js';

const router = Router();

// Health check endpoint
router.get('/health', (_req: Request, res: Response) => {
  const response: HealthResponse = {
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  };
  res.json(response);
});

// Settings endpoints
router.get('/settings', (_req: Request, res: Response) => {
  try {
    const settings = getAllSettings() as Settings;
    // Add runtime config (non-sensitive)
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

// Placeholder routes - will be implemented in subsequent phases

// Libraries
router.get('/libraries', (_req: Request, res: Response) => {
  res.json({ libraries: [], message: 'Not yet implemented' });
});

router.post('/libraries', (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Not yet implemented' });
});

// Books
router.get('/books', (_req: Request, res: Response) => {
  res.json({ books: [], total: 0, page: 1, pageSize: 20, message: 'Not yet implemented' });
});

// Series
router.get('/series', (_req: Request, res: Response) => {
  res.json({ series: [], message: 'Not yet implemented' });
});

// Tasks
router.get('/tasks', (_req: Request, res: Response) => {
  res.json({ tasks: [], message: 'Not yet implemented' });
});

// Authors
router.get('/authors', (_req: Request, res: Response) => {
  res.json({ authors: [], message: 'Not yet implemented' });
});

// Downloads
router.get('/downloads', (_req: Request, res: Response) => {
  res.json({ downloads: [], message: 'Not yet implemented' });
});

// Duplicates
router.get('/duplicates', (_req: Request, res: Response) => {
  res.json({ duplicates: [], message: 'Not yet implemented' });
});

export default router;

import { Hono } from 'hono';
import { query } from '@shelvarr/db';
import { toKomgaLibrary } from '../adapters/komga-response';

const libraries = new Hono();

// GET /api/v1/libraries
libraries.get('/', (c) => {
  const rows = query<{
    id: number;
    name: string;
    path: string;
    type: string | null;
    komga_library_id: string | null;
    created_at: string;
  }>('SELECT * FROM libraries ORDER BY name');

  return c.json(rows.map(toKomgaLibrary));
});

export default libraries;

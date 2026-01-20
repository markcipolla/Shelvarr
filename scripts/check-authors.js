#!/usr/bin/env node
/**
 * Check if authors exist in the database
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find the database
const possiblePaths = [
  join(__dirname, '../data/shelvarr.db'),
  join(__dirname, '../shelvarr.db'),
  join(process.env.HOME || process.env.USERPROFILE || '', '.shelvarr', 'shelvarr.db'),
];

let dbPath = possiblePaths.find(p => existsSync(p));

if (!dbPath) {
  console.error('Database not found. Checked:');
  possiblePaths.forEach(p => console.error(`  - ${p}`));
  process.exit(1);
}

console.log(`Using database: ${dbPath}\n`);

const db = new Database(dbPath, { readonly: true });

// Check authors count
const authorCount = db.prepare('SELECT COUNT(*) as count FROM authors').get();
console.log(`Authors in database: ${authorCount.count}`);

if (authorCount.count > 0) {
  console.log('\nSample authors:');
  const authors = db.prepare('SELECT id, name FROM authors LIMIT 10').all();
  authors.forEach(a => console.log(`  ${a.id}: ${a.name}`));
} else {
  console.log('\n⚠️  No authors found in database!');
  console.log('\nTo populate authors, run a metadata fetch on your library:');
  console.log('  1. Go to Libraries page');
  console.log('  2. Click "Find Missing" or "Refresh All"');
  console.log('  3. Authors will be automatically created from book metadata');
}

db.close();

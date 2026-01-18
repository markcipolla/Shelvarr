module.exports = [
"[externals]/fs [external] (fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("fs", () => require("fs"));

module.exports = mod;
}),
"[externals]/url [external] (url, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("url", () => require("url"));

module.exports = mod;
}),
"[project]/lib/config/index.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
;
// Data directory - use environment variable or default
const dataDir = process.env['DATA_DIR'] || process.cwd() + '/data';
const config = {
    env: ("TURBOPACK compile-time value", "development") || 'development',
    port: parseInt(process.env['PORT'] || '3000', 10),
    // Data directory for config files
    dataDir,
    // Root path for library mounts
    libraryRoot: process.env['LIBRARY_ROOT'] || '/libraries',
    // SQLite database path
    dbPath: process.env['DB_PATH'] || '',
    // Komga integration (optional)
    komga: {
        url: process.env['KOMGA_URL'] || null,
        username: process.env['KOMGA_USERNAME'] || null,
        password: process.env['KOMGA_PASSWORD'] || null
    },
    // Supported file extensions
    supportedExtensions: [
        '.epub',
        '.pdf',
        '.mobi',
        '.azw',
        '.azw3'
    ],
    // Rate limiting for external APIs (requests per minute)
    rateLimits: {
        hardcover: 60
    },
    // API keys from environment
    hardcoverToken: process.env['HARDCOVER_API_TOKEN'] || null
};
// Derive dbPath if not explicitly set
config.dbPath = process.env['DB_PATH'] || (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["join"])(config.dataDir, 'shelvarr.db');
const __TURBOPACK__default__export__ = config;
}),
"[project]/lib/db/index.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "addWantedBook",
    ()=>addWantedBook,
    "closeDatabase",
    ()=>closeDatabase,
    "default",
    ()=>__TURBOPACK__default__export__,
    "deleteWantedBook",
    ()=>deleteWantedBook,
    "execute",
    ()=>execute,
    "getAllSettings",
    ()=>getAllSettings,
    "getDb",
    ()=>getDb,
    "getDownloadSourceConfig",
    ()=>getDownloadSourceConfig,
    "getDownloadSourceConfigs",
    ()=>getDownloadSourceConfigs,
    "getPool",
    ()=>getPool,
    "getSetting",
    ()=>getSetting,
    "getSourceStatus",
    ()=>getSourceStatus,
    "getSourceStatusCache",
    ()=>getSourceStatusCache,
    "getWantedBookById",
    ()=>getWantedBookById,
    "getWantedBooks",
    ()=>getWantedBooks,
    "initDatabase",
    ()=>initDatabase,
    "initDatabaseAsync",
    ()=>initDatabaseAsync,
    "insertReturning",
    ()=>insertReturning,
    "isBookWanted",
    ()=>isBookWanted,
    "isSourceEnabled",
    ()=>isSourceEnabled,
    "isStatusCacheStale",
    ()=>isStatusCacheStale,
    "query",
    ()=>query,
    "queryOne",
    ()=>queryOne,
    "setSetting",
    ()=>setSetting,
    "updateSourceStatus",
    ()=>updateSourceStatus,
    "updateWantedBook",
    ()=>updateWantedBook,
    "upsertDownloadSourceConfig",
    ()=>upsertDownloadSourceConfig
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$better$2d$sqlite3__$5b$external$5d$__$28$better$2d$sqlite3$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f$better$2d$sqlite3$29$__ = __turbopack_context__.i("[externals]/better-sqlite3 [external] (better-sqlite3, cjs, [project]/node_modules/better-sqlite3)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$url__$5b$external$5d$__$28$url$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/url [external] (url, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/config/index.ts [app-rsc] (ecmascript)");
const __TURBOPACK__import$2e$meta__ = {
    get url () {
        return `file://${__turbopack_context__.P("lib/db/index.ts")}`;
    }
};
;
;
;
;
;
// Get directory of this file
let __dbDirname;
try {
    const __filename = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$url__$5b$external$5d$__$28$url$2c$__cjs$29$__["fileURLToPath"])(__TURBOPACK__import$2e$meta__.url);
    __dbDirname = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["dirname"])(__filename);
} catch  {
    // Fallback for bundled environments
    __dbDirname = process.cwd();
}
let db = null;
/**
 * Find the schema.sql file in various possible locations
 */ function findSchemaPath() {
    const possiblePaths = [
        (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["join"])(__dbDirname, 'schema.sql'),
        (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["join"])(process.cwd(), 'lib', 'db', 'schema.sql'),
        (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["resolve"])('lib', 'db', 'schema.sql'),
        (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["join"])(process.cwd(), '.next', 'standalone', 'lib', 'db', 'schema.sql')
    ];
    for (const p of possiblePaths){
        if ((0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["existsSync"])(p)) {
            return p;
        }
    }
    throw new Error(`schema.sql not found. Tried: ${possiblePaths.join(', ')}`);
}
function initDatabase() {
    try {
        // Ensure data directory exists
        const dbDir = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["dirname"])(__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].dbPath);
        (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["mkdirSync"])(dbDir, {
            recursive: true
        });
        console.log(`Opening SQLite database at: ${__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].dbPath}`);
        // Create database connection
        db = new __TURBOPACK__imported__module__$5b$externals$5d2f$better$2d$sqlite3__$5b$external$5d$__$28$better$2d$sqlite3$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f$better$2d$sqlite3$29$__["default"](__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].dbPath);
        // Enable foreign keys and WAL mode for better performance
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        // Run schema
        const schemaPath = findSchemaPath();
        console.log(`Loading schema from: ${schemaPath}`);
        const schema = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["readFileSync"])(schemaPath, 'utf-8');
        db.exec(schema);
        // Run migrations for schema updates
        runMigrations(db);
        console.log('Database initialized successfully');
        return db;
    } catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
    }
}
/**
 * Run database migrations for schema updates
 */ function runMigrations(database) {
    // Check if libraries table has 'type' column
    const librariesInfo = database.prepare("PRAGMA table_info(libraries)").all();
    const hasTypeColumn = librariesInfo.some((col)=>col.name === 'type');
    if (!hasTypeColumn) {
        console.log('Running migration: adding type column to libraries');
        database.exec("ALTER TABLE libraries ADD COLUMN type TEXT DEFAULT 'book'");
    }
    // Check if books table has 'series' column (for multiple series support)
    const booksInfo = database.prepare("PRAGMA table_info(books)").all();
    const hasSeriesColumn = booksInfo.some((col)=>col.name === 'series');
    if (!hasSeriesColumn) {
        console.log('Running migration: adding series column to books');
        database.exec("ALTER TABLE books ADD COLUMN series TEXT");
    }
    // Check if author_works table has 'language' column
    const authorWorksInfo = database.prepare("PRAGMA table_info(author_works)").all();
    const hasLanguageColumn = authorWorksInfo.some((col)=>col.name === 'language');
    if (!hasLanguageColumn) {
        console.log('Running migration: adding language column to author_works');
        database.exec("ALTER TABLE author_works ADD COLUMN language TEXT");
    }
}
function getDb() {
    if (!db) {
        initDatabase();
    }
    return db;
}
function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}
function query(sql, params = []) {
    const stmt = getDb().prepare(sql);
    return stmt.all(...params);
}
function queryOne(sql, params = []) {
    const stmt = getDb().prepare(sql);
    const row = stmt.get(...params);
    return row || null;
}
function execute(sql, params = []) {
    const stmt = getDb().prepare(sql);
    const result = stmt.run(...params);
    return {
        rowCount: result.changes,
        lastInsertRowid: Number(result.lastInsertRowid)
    };
}
function insertReturning(sql, params = []) {
    // SQLite doesn't support RETURNING in older versions, so we do it manually
    // First, check if the SQL has RETURNING clause
    if (sql.toLowerCase().includes('returning')) {
        // Strip the RETURNING clause and get the table name
        const match = sql.match(/insert\s+into\s+(\w+)/i);
        const tableName = match?.[1];
        // Execute without RETURNING
        const sqlWithoutReturning = sql.replace(/\s+returning\s+.*/i, '');
        const result = execute(sqlWithoutReturning, params);
        if (tableName && result.lastInsertRowid) {
            return queryOne(`SELECT * FROM ${tableName} WHERE id = ?`, [
                result.lastInsertRowid
            ]);
        }
        return null;
    }
    // Regular insert
    const result = execute(sql, params);
    return {
        id: result.lastInsertRowid
    };
}
function getSetting(key, defaultValue = null) {
    const row = queryOne('SELECT value FROM settings WHERE key = ?', [
        key
    ]);
    if (!row) return defaultValue;
    try {
        return JSON.parse(row.value);
    } catch  {
        return row.value;
    }
}
function setSetting(key, value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    execute('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = ?', [
        key,
        serialized,
        serialized
    ]);
}
function getAllSettings() {
    const rows = query('SELECT key, value FROM settings');
    const settings = {};
    for (const row of rows){
        try {
            settings[row.key] = JSON.parse(row.value);
        } catch  {
            settings[row.key] = row.value;
        }
    }
    return settings;
}
function getWantedBooks(status) {
    if (status) {
        return query('SELECT * FROM wanted_books WHERE status = ? ORDER BY priority DESC, added_at DESC', [
            status
        ]);
    }
    return query('SELECT * FROM wanted_books ORDER BY priority DESC, added_at DESC');
}
function getWantedBookById(id) {
    return queryOne('SELECT * FROM wanted_books WHERE id = ?', [
        id
    ]);
}
function addWantedBook(data) {
    const result = execute(`INSERT INTO wanted_books (hardcover_id, title, author, isbn, cover_url, description, priority, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
        data.hardcover_id || null,
        data.title,
        data.author || null,
        data.isbn || null,
        data.cover_url || null,
        data.description || null,
        data.priority || 0,
        data.notes || null
    ]);
    return getWantedBookById(result.lastInsertRowid);
}
function updateWantedBook(id, data) {
    const fields = [];
    const values = [];
    if (data.status !== undefined) {
        fields.push('status = ?');
        values.push(data.status);
    }
    if (data.priority !== undefined) {
        fields.push('priority = ?');
        values.push(data.priority);
    }
    if (data.notes !== undefined) {
        fields.push('notes = ?');
        values.push(data.notes);
    }
    if (fields.length === 0) return false;
    values.push(id);
    const result = execute(`UPDATE wanted_books SET ${fields.join(', ')} WHERE id = ?`, values);
    return result.rowCount > 0;
}
function deleteWantedBook(id) {
    const result = execute('DELETE FROM wanted_books WHERE id = ?', [
        id
    ]);
    return result.rowCount > 0;
}
function isBookWanted(hardcoverId, isbn, title) {
    if (hardcoverId) {
        const result = queryOne('SELECT id FROM wanted_books WHERE hardcover_id = ?', [
            hardcoverId
        ]);
        if (result) return true;
    }
    if (isbn) {
        const result = queryOne('SELECT id FROM wanted_books WHERE isbn = ?', [
            isbn
        ]);
        if (result) return true;
    }
    if (title) {
        const result = queryOne('SELECT id FROM wanted_books WHERE title = ?', [
            title
        ]);
        if (result) return true;
    }
    return false;
}
function getDownloadSourceConfigs() {
    return query('SELECT * FROM download_source_config');
}
function getDownloadSourceConfig(source) {
    return queryOne('SELECT * FROM download_source_config WHERE source = ?', [
        source
    ]);
}
function upsertDownloadSourceConfig(source, enabled, credentials) {
    const credentialsJson = credentials ? JSON.stringify(credentials) : null;
    execute(`INSERT INTO download_source_config (source, enabled, credentials, last_checked)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (source) DO UPDATE SET enabled = ?, credentials = ?, last_checked = CURRENT_TIMESTAMP`, [
        source,
        enabled ? 1 : 0,
        credentialsJson,
        enabled ? 1 : 0,
        credentialsJson
    ]);
}
function isSourceEnabled(source) {
    const config = getDownloadSourceConfig(source);
    return config ? config.enabled === 1 : true; // Default to enabled if not configured
}
function getSourceStatusCache() {
    return query('SELECT * FROM source_status_cache');
}
function getSourceStatus(source) {
    return queryOne('SELECT * FROM source_status_cache WHERE source = ?', [
        source
    ]);
}
function updateSourceStatus(source, status, responseTime) {
    execute(`INSERT INTO source_status_cache (source, status, response_time, last_updated)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (source) DO UPDATE SET status = ?, response_time = ?, last_updated = CURRENT_TIMESTAMP`, [
        source,
        status,
        responseTime || null,
        status,
        responseTime || null
    ]);
}
function isStatusCacheStale(maxAgeMinutes = 5) {
    const result = queryOne(`SELECT MIN(last_updated) as oldest FROM source_status_cache`);
    if (!result?.oldest) return true;
    const lastUpdate = new Date(result.oldest);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
    return diffMinutes > maxAgeMinutes;
}
const getPool = getDb;
const initDatabaseAsync = initDatabase;
const __TURBOPACK__default__export__ = {
    initDatabase,
    getDb,
    getPool,
    closeDatabase,
    query,
    queryOne,
    execute,
    insertReturning,
    getSetting,
    setSetting,
    getAllSettings,
    // Wanted books
    getWantedBooks,
    getWantedBookById,
    addWantedBook,
    updateWantedBook,
    deleteWantedBook,
    isBookWanted,
    // Download source config
    getDownloadSourceConfigs,
    getDownloadSourceConfig,
    upsertDownloadSourceConfig,
    isSourceEnabled,
    // Source status cache
    getSourceStatusCache,
    getSourceStatus,
    updateSourceStatus,
    isStatusCacheStale
};
}),
"[project]/lib/services/metadata/hardcover.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getBookById",
    ()=>getBookById,
    "isConfigured",
    ()=>isConfigured,
    "searchBooks",
    ()=>searchBooks,
    "searchByIsbn",
    ()=>searchByIsbn
]);
/**
 * Hardcover.app API Service
 * https://docs.hardcover.app/api/getting-started/
 *
 * Simplified: Always fetch full book details for complete metadata.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/config/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db/index.ts [app-rsc] (ecmascript)");
;
;
const API_BASE = 'https://api.hardcover.app/v1/graphql';
// Rate limiting
let lastRequestTime = 0;
const minInterval = 1000 / (__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].rateLimits.hardcover / 60);
function getApiToken() {
    const dbToken = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSetting"])('hardcover_api_key', null);
    if (dbToken) {
        let cleaned = dbToken.trim().replace(/^["']|["']$/g, '');
        if (cleaned.toLowerCase().startsWith('bearer ')) {
            cleaned = cleaned.substring(7).trim();
        }
        return cleaned || null;
    }
    let envToken = __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].hardcoverToken?.trim() || null;
    if (envToken?.toLowerCase().startsWith('bearer ')) {
        envToken = envToken.substring(7).trim();
    }
    return envToken;
}
async function graphqlFetch(query, variables = {}) {
    const now = Date.now();
    if (now - lastRequestTime < minInterval) {
        await new Promise((resolve)=>setTimeout(resolve, minInterval - (now - lastRequestTime)));
    }
    lastRequestTime = Date.now();
    const token = getApiToken();
    if (!token) {
        console.error('Hardcover: No API token configured');
        return null;
    }
    try {
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                query,
                variables
            })
        });
        if (!response.ok) {
            console.error(`Hardcover API error: ${response.status}`);
            return null;
        }
        const data = await response.json();
        if (data.errors?.length) {
            console.error(`Hardcover error: ${data.errors[0]?.message}`);
            return null;
        }
        return data.data || null;
    } catch (error) {
        console.error('Hardcover fetch error:', error);
        return null;
    }
}
function safeParseField(field) {
    if (!field) return null;
    if (typeof field === 'string') {
        try {
            return JSON.parse(field);
        } catch  {
            return null;
        }
    }
    return field;
}
function bookToMetadata(book) {
    // Extract authors from various possible structures
    let authors = 'Unknown';
    const contributors = safeParseField(book.cached_contributors);
    if (contributors?.length) {
        const names = contributors.filter((c)=>c.author?.name).map((c)=>c.author.name);
        if (names.length) authors = names.join(', ');
    }
    if (authors === 'Unknown' && book.contributions?.length) {
        const names = book.contributions.filter((c)=>c.author?.name).map((c)=>c.author.name);
        if (names.length) authors = names.join(', ');
    }
    if (authors === 'Unknown' && book.author) {
        authors = book.author;
    }
    // Extract categories - handle various formats
    let categories = [];
    const rawTags = safeParseField(book.cached_tags);
    if (Array.isArray(rawTags)) {
        categories = rawTags.map((t)=>typeof t === 'string' ? t : t?.tag).filter((t)=>!!t);
    }
    // Extract all series (a book can belong to multiple series)
    const series = [];
    if (book.book_series?.length) {
        for (const bs of book.book_series){
            if (bs.series?.name) {
                series.push([
                    bs.series.name,
                    bs.position ?? null
                ]);
            }
        }
    }
    // Extract ISBN
    const primaryEdition = book.editions?.[0];
    const isbn = primaryEdition?.isbn_13 || primaryEdition?.isbn_10;
    return {
        title: book.subtitle ? `${book.title}: ${book.subtitle}` : book.title,
        authors,
        publishDate: book.release_date,
        description: book.description,
        isbn,
        coverUrl: book.image?.url,
        pageCount: book.pages,
        categories,
        series: series.length > 0 ? series : undefined,
        source: 'hardcover',
        sourceId: String(book.id)
    };
}
async function getBookById(id) {
    const query = `
    query GetBook($id: Int!) {
      books(where: { id: { _eq: $id } }) {
        id
        title
        subtitle
        release_date
        pages
        description
        image { url }
        cached_contributors
        cached_tags
        book_series {
          series { id name }
          position
        }
        editions(limit: 1) {
          isbn_13
          isbn_10
        }
      }
    }
  `;
    const data = await graphqlFetch(query, {
        id: parseInt(id, 10)
    });
    const book = data?.books?.[0];
    return book ? bookToMetadata(book) : null;
}
async function searchBooks(searchQuery, maxResults = 10) {
    if (!searchQuery.trim()) return [];
    const query = `
    query Search($query: String!, $perPage: Int!) {
      search(query: $query, query_type: "books", per_page: $perPage, page: 1) {
        results
      }
    }
  `;
    const data = await graphqlFetch(query, {
        query: searchQuery,
        perPage: maxResults
    });
    if (!data?.search?.results) {
        console.log('Hardcover search: No results in response');
        return [];
    }
    let results = [];
    const raw = data.search.results;
    if (typeof raw === 'string') {
        try {
            results = JSON.parse(raw);
        } catch  {
            return [];
        }
    } else if (Array.isArray(raw)) {
        results = raw;
    } else if (typeof raw === 'object' && raw !== null) {
        // Handle object wrapper formats like { hits: [...] } or { books: [...] }
        const obj = raw;
        if ('hits' in obj && Array.isArray(obj.hits)) {
            results = obj.hits;
        } else if ('books' in obj && Array.isArray(obj.books)) {
            results = obj.books.map((b)=>({
                    id: b.id
                }));
        } else if ('results' in obj && Array.isArray(obj.results)) {
            results = obj.results;
        } else {
            // Try to find any array property
            const arrayProp = Object.entries(obj).find(([, v])=>Array.isArray(v));
            if (arrayProp) {
                results = arrayProp[1];
            } else {
                return [];
            }
        }
    } else {
        return [];
    }
    const bookIds = results.map((r)=>{
        const doc = r.document;
        const hit = r.hit;
        const rawId = doc?.id || doc?.book_id || hit?.id || hit?.book_id || r.id;
        return typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;
    }).filter((id)=>typeof id === 'number' && !isNaN(id)).slice(0, maxResults);
    if (bookIds.length === 0) return [];
    // Fetch full details for all books in one query
    const booksQuery = `
    query GetBooks($ids: [Int!]!) {
      books(where: { id: { _in: $ids } }) {
        id
        title
        subtitle
        release_date
        pages
        description
        image { url }
        cached_contributors
        cached_tags
        book_series {
          series { id name }
          position
        }
        editions(limit: 1) {
          isbn_13
          isbn_10
        }
      }
    }
  `;
    const booksData = await graphqlFetch(booksQuery, {
        ids: bookIds
    });
    if (!booksData?.books) return [];
    // Maintain order from search results
    // Note: Ensure IDs are compared as numbers (API may return them as strings or numbers)
    const booksById = new Map(booksData.books.map((b)=>[
            Number(b.id),
            b
        ]));
    return bookIds.map((id)=>booksById.get(id)).filter((b)=>!!b).map(bookToMetadata);
}
async function searchByIsbn(isbn) {
    const results = await searchBooks(isbn.replace(/[-\s]/g, ''), 3);
    return results.find((r)=>r.isbn === isbn.replace(/[-\s]/g, '')) || results[0] || null;
}
function isConfigured() {
    return !!getApiToken();
}
}),
"[project]/lib/services/metadata/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "autoMatch",
    ()=>autoMatch,
    "getAllSourcesStatus",
    ()=>getAllSourcesStatus,
    "getBookBySourceId",
    ()=>getBookBySourceId,
    "isConfigured",
    ()=>isConfigured,
    "searchBooks",
    ()=>searchBooks,
    "searchByIsbn",
    ()=>searchByIsbn
]);
/**
 * Metadata Service - Hardcover only
 *
 * Simplified: searchBooks always returns full details, autoMatch picks the best result.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$hardcover$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/metadata/hardcover.ts [app-rsc] (ecmascript)");
;
function isConfigured() {
    return __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$hardcover$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isConfigured"]();
}
async function getAllSourcesStatus() {
    const configured = __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$hardcover$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isConfigured"]();
    return [
        {
            name: 'hardcover',
            displayName: 'Hardcover',
            enabled: configured,
            configured,
            requiresApiKey: true,
            apiKeyUrl: 'https://hardcover.app/account/api'
        }
    ];
}
async function searchBooks(query, options = {}) {
    if (!__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$hardcover$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isConfigured"]()) return [];
    const maxResults = options.maxResults || 10;
    return __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$hardcover$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["searchBooks"](query, maxResults);
}
async function searchByIsbn(isbn) {
    if (!__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$hardcover$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isConfigured"]()) return null;
    return __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$hardcover$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["searchByIsbn"](isbn);
}
async function getBookBySourceId(source, sourceId) {
    if (source !== 'hardcover') return null;
    return __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$hardcover$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getBookById"](sourceId);
}
async function autoMatch(title, author, isbn) {
    if (!__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$hardcover$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isConfigured"]()) return null;
    // Build search query
    const query = [
        title,
        author,
        isbn
    ].filter(Boolean).join(' ').trim();
    if (!query) return null;
    const results = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$hardcover$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["searchBooks"](query, 1);
    return results[0] || null;
}
;
}),
"[project]/lib/actions/wanted.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"406e9aa8493e8c043d8cee1122402296d5d0f9c8c3":"removeFromWanted","40816c53bda01a793f9d2b422dc1bdd295d6ec9d25":"getWantedBook","409f768f476b4acd642da40f15df6c90ce48fe0b1d":"getAuthorBooks","40c859b63dce52512b396fd0488e7342c6935f39c7":"getWantedBooks","40d8b25c2a5792d06fb5e8e47b3044fa4716921978":"addToWanted","40f905399dd029378f51ed4c09018f2466bf82f8e7":"searchHardcoverBooks","600f3b37e5875b8b73b3776ba0c8396f7e01a99c96":"updateWantedPriority","602256e32c6458989ba98ab5b1c3780b01e714c634":"updateWantedStatus","606379aae259df62acdbca901c1b60f06bce61c591":"updateWantedNotes","703088ebe4b272f19ad187e9483a1b5d5717d76982":"isBookWanted"},"",""] */ __turbopack_context__.s([
    "addToWanted",
    ()=>addToWanted,
    "getAuthorBooks",
    ()=>getAuthorBooks,
    "getWantedBook",
    ()=>getWantedBook,
    "getWantedBooks",
    ()=>getWantedBooks,
    "isBookWanted",
    ()=>isBookWanted,
    "removeFromWanted",
    ()=>removeFromWanted,
    "searchHardcoverBooks",
    ()=>searchHardcoverBooks,
    "updateWantedNotes",
    ()=>updateWantedNotes,
    "updateWantedPriority",
    ()=>updateWantedPriority,
    "updateWantedStatus",
    ()=>updateWantedStatus
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/cache.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/services/metadata/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
;
;
async function getWantedBooks(status) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getWantedBooks"])(status);
}
async function getWantedBook(id) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getWantedBookById"])(id);
}
async function addToWanted(data) {
    try {
        // Check if already wanted
        if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isBookWanted"])(data.hardcoverId, data.isbn, data.title)) {
            return {
                success: false,
                error: 'Book is already on wanted list'
            };
        }
        const book = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["addWantedBook"])({
            hardcover_id: data.hardcoverId,
            title: data.title,
            author: data.author,
            isbn: data.isbn,
            cover_url: data.coverUrl,
            description: data.description,
            priority: data.priority || 0,
            notes: data.notes
        });
        if (book) {
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/wanted');
            return {
                success: true,
                id: book.id
            };
        }
        return {
            success: false,
            error: 'Failed to add book'
        };
    } catch (error) {
        console.error('Error adding to wanted:', error);
        return {
            success: false,
            error: 'Failed to add book to wanted list'
        };
    }
}
async function removeFromWanted(id) {
    try {
        const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["deleteWantedBook"])(id);
        if (result) {
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/wanted');
            return {
                success: true
            };
        }
        return {
            success: false,
            error: 'Book not found'
        };
    } catch (error) {
        console.error('Error removing from wanted:', error);
        return {
            success: false,
            error: 'Failed to remove book'
        };
    }
}
async function updateWantedStatus(id, status) {
    try {
        const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateWantedBook"])(id, {
            status
        });
        if (result) {
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/wanted');
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])(`/wanted/${id}`);
            return {
                success: true
            };
        }
        return {
            success: false,
            error: 'Book not found'
        };
    } catch (error) {
        console.error('Error updating wanted status:', error);
        return {
            success: false,
            error: 'Failed to update status'
        };
    }
}
async function updateWantedPriority(id, priority) {
    try {
        const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateWantedBook"])(id, {
            priority
        });
        if (result) {
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/wanted');
            return {
                success: true
            };
        }
        return {
            success: false,
            error: 'Book not found'
        };
    } catch (error) {
        console.error('Error updating wanted priority:', error);
        return {
            success: false,
            error: 'Failed to update priority'
        };
    }
}
async function updateWantedNotes(id, notes) {
    try {
        const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateWantedBook"])(id, {
            notes
        });
        if (result) {
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/wanted');
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])(`/wanted/${id}`);
            return {
                success: true
            };
        }
        return {
            success: false,
            error: 'Book not found'
        };
    } catch (error) {
        console.error('Error updating wanted notes:', error);
        return {
            success: false,
            error: 'Failed to update notes'
        };
    }
}
async function isBookWanted(hardcoverId, isbn, title) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isBookWanted"])(hardcoverId, isbn, title);
}
async function searchHardcoverBooks(query) {
    try {
        const results = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["searchBooks"](query, {
            maxResults: 15
        });
        return {
            success: true,
            results: results.map((r)=>({
                    id: r.sourceId,
                    title: r.title,
                    author: r.authors,
                    isbn: r.isbn,
                    coverUrl: r.coverUrl,
                    description: r.description,
                    publishDate: r.publishDate
                }))
        };
    } catch (error) {
        console.error('Error searching Hardcover:', error);
        return {
            success: false,
            error: 'Search failed'
        };
    }
}
async function getAuthorBooks(authorName) {
    try {
        // Search for books by this author
        const results = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["searchBooks"](`author:${authorName}`, {
            maxResults: 30
        });
        // Check which ones are already wanted
        const resultsWithWantedStatus = await Promise.all(results.map(async (r)=>({
                id: r.sourceId,
                title: r.title,
                author: r.authors,
                isbn: r.isbn,
                coverUrl: r.coverUrl,
                description: r.description,
                publishDate: r.publishDate,
                isWanted: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isBookWanted"])(r.sourceId, r.isbn, r.title)
            })));
        return {
            success: true,
            results: resultsWithWantedStatus
        };
    } catch (error) {
        console.error('Error getting author books:', error);
        return {
            success: false,
            error: 'Failed to get author books'
        };
    }
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    getWantedBooks,
    getWantedBook,
    addToWanted,
    removeFromWanted,
    updateWantedStatus,
    updateWantedPriority,
    updateWantedNotes,
    isBookWanted,
    searchHardcoverBooks,
    getAuthorBooks
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getWantedBooks, "40c859b63dce52512b396fd0488e7342c6935f39c7", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getWantedBook, "40816c53bda01a793f9d2b422dc1bdd295d6ec9d25", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(addToWanted, "40d8b25c2a5792d06fb5e8e47b3044fa4716921978", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(removeFromWanted, "406e9aa8493e8c043d8cee1122402296d5d0f9c8c3", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(updateWantedStatus, "602256e32c6458989ba98ab5b1c3780b01e714c634", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(updateWantedPriority, "600f3b37e5875b8b73b3776ba0c8396f7e01a99c96", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(updateWantedNotes, "606379aae259df62acdbca901c1b60f06bce61c591", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(isBookWanted, "703088ebe4b272f19ad187e9483a1b5d5717d76982", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(searchHardcoverBooks, "40f905399dd029378f51ed4c09018f2466bf82f8e7", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getAuthorBooks, "409f768f476b4acd642da40f15df6c90ce48fe0b1d", null);
}),
"[project]/lib/services/downloads/zlibrary.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Z-Library Integration
 *
 * Z-Library requires authentication for downloads but search is available.
 * Reference: https://github.com/sertraline/zlibrary
 */ __turbopack_context__.s([
    "authenticateZLibrary",
    ()=>authenticateZLibrary,
    "default",
    ()=>__TURBOPACK__default__export__,
    "getZLibraryDomain",
    ()=>getZLibraryDomain,
    "getZLibrarySearchUrl",
    ()=>getZLibrarySearchUrl,
    "searchZLibrary",
    ()=>searchZLibrary
]);
// Z-Library domains (they change frequently)
const ZLIB_DOMAINS = [
    'z-lib.gs',
    'z-lib.gd',
    'zlibrary-global.se',
    'singlelogin.re'
];
function getZLibraryDomain() {
    return ZLIB_DOMAINS[0];
}
function getZLibrarySearchUrl(query) {
    const encoded = encodeURIComponent(query);
    return `https://${getZLibraryDomain()}/s/${encoded}`;
}
async function searchZLibrary(query, config) {
    const results = [];
    try {
        const searchUrl = `https://${getZLibraryDomain()}/s/${encodeURIComponent(query)}`;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml'
        };
        // Add auth cookies if provided
        if (config?.remix_userid && config?.remix_userkey) {
            headers['Cookie'] = `remix_userid=${config.remix_userid}; remix_userkey=${config.remix_userkey}`;
        }
        const response = await fetch(searchUrl, {
            headers
        });
        if (!response.ok) {
            console.warn(`Z-Library search failed: ${response.status}`);
            return results;
        }
        const html = await response.text();
        // Parse search results from HTML
        // Z-Library uses a specific HTML structure for book items
        const bookPattern = /<z-bookcard[^>]*data-id="(\d+)"[^>]*>[\s\S]*?<div class="title"[^>]*>([^<]+)<\/div>[\s\S]*?<div class="author"[^>]*>([^<]+)<\/div>/gi;
        let match;
        while((match = bookPattern.exec(html)) !== null){
            const [, idRaw, titleRaw, authorRaw] = match;
            const id = idRaw ?? '';
            const title = titleRaw ?? 'Unknown';
            const author = authorRaw ?? 'Unknown';
            if (!id) continue;
            results.push({
                id,
                title: title.trim(),
                author: author.trim(),
                extension: 'epub',
                size: 'Unknown',
                searchUrl: getZLibrarySearchUrl(query),
                downloadUrl: config?.remix_userid ? `https://${getZLibraryDomain()}/book/${id}` : undefined
            });
            if (results.length >= 10) break;
        }
        // Fallback: simpler pattern matching if structured parsing fails
        if (results.length === 0) {
            const simplePattern = /href="\/book\/(\d+)[^"]*"[^>]*>([^<]+)</gi;
            while((match = simplePattern.exec(html)) !== null){
                const [, idRaw, titleRaw] = match;
                const id = idRaw ?? '';
                const title = titleRaw ?? '';
                if (!id || title.length <= 5) continue;
                results.push({
                    id,
                    title: title.trim(),
                    author: 'Unknown',
                    extension: 'epub',
                    size: 'Unknown',
                    searchUrl: getZLibrarySearchUrl(query)
                });
                if (results.length >= 10) break;
            }
        }
    } catch (error) {
        console.error('Z-Library search error:', error);
    }
    return results;
}
async function authenticateZLibrary(email, password) {
    try {
        const loginUrl = `https://singlelogin.re/rpc.php`;
        const response = await fetch(loginUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: new URLSearchParams({
                isModal: 'true',
                email,
                password,
                site_mode: 'books',
                action: 'login',
                isSinglelogin: '1',
                redirectUrl: '',
                gg_json_mode: '1'
            })
        });
        if (!response.ok) {
            console.warn('Z-Library login failed:', response.status);
            return null;
        }
        // Extract cookies from response
        const cookies = response.headers.get('set-cookie');
        if (!cookies) return null;
        const useridMatch = cookies.match(/remix_userid=(\d+)/);
        const userkeyMatch = cookies.match(/remix_userkey=([^;]+)/);
        if (useridMatch?.[1] && userkeyMatch?.[1]) {
            return {
                remix_userid: useridMatch[1],
                remix_userkey: userkeyMatch[1]
            };
        }
        return null;
    } catch (error) {
        console.error('Z-Library authentication error:', error);
        return null;
    }
}
const __TURBOPACK__default__export__ = {
    searchZLibrary,
    getZLibrarySearchUrl,
    getZLibraryDomain,
    authenticateZLibrary
};
}),
"[project]/lib/services/downloads/annas.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Anna's Archive Integration
 *
 * Anna's Archive is a search engine for shadow libraries.
 * They have a public search interface.
 */ __turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__,
    "getAnnasDownloadLinks",
    ()=>getAnnasDownloadLinks,
    "getAnnasSearchUrl",
    ()=>getAnnasSearchUrl,
    "searchAnnas",
    ()=>searchAnnas
]);
const ANNAS_DOMAIN = 'annas-archive.org';
function getAnnasSearchUrl(query, fileType) {
    const params = new URLSearchParams({
        q: query
    });
    if (fileType) {
        params.set('ext', fileType);
    }
    return `https://${ANNAS_DOMAIN}/search?${params.toString()}`;
}
async function searchAnnas(query, options) {
    const results = [];
    try {
        const params = new URLSearchParams({
            q: query
        });
        if (options?.fileType) {
            params.set('ext', options.fileType);
        }
        if (options?.language) {
            params.set('lang', options.language);
        }
        const searchUrl = `https://${ANNAS_DOMAIN}/search?${params.toString()}`;
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml'
            }
        });
        if (!response.ok) {
            console.warn(`Anna's Archive search failed: ${response.status}`);
            return results;
        }
        const html = await response.text();
        // Parse search results from HTML
        // Anna's Archive has a specific structure for results
        // Each result is in a div with class containing "search-result" or similar
        // Pattern to match book entries (simplified)
        const bookPattern = /href="\/md5\/([a-f0-9]{32})"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>[\s\S]*?<div[^>]*>([^<]*)<\/div>/gi;
        let match;
        while((match = bookPattern.exec(html)) !== null){
            const [, md5Raw, titleRaw, meta] = match;
            const md5 = md5Raw ?? '';
            const title = titleRaw ?? 'Unknown';
            // Extract author from meta if available
            const authorMatch = meta?.match(/by\s+([^,]+)/i);
            const author = authorMatch?.[1]?.trim() ?? 'Unknown';
            // Extract extension from meta
            const extMatch = meta?.match(/\b(epub|pdf|mobi|azw3|djvu)\b/i);
            const extension = extMatch?.[1]?.toLowerCase() ?? 'unknown';
            // Extract size from meta
            const sizeMatch = meta?.match(/(\d+(?:\.\d+)?\s*(?:KB|MB|GB))/i);
            const size = sizeMatch?.[1] ?? 'Unknown';
            if (!md5) continue;
            results.push({
                id: md5,
                title: title.trim(),
                author,
                extension,
                size,
                source: 'annas',
                downloadUrl: `https://${ANNAS_DOMAIN}/md5/${md5}`,
                searchUrl: getAnnasSearchUrl(query)
            });
            if (results.length >= 15) break;
        }
        // Alternative pattern for newer page structure
        if (results.length === 0) {
            const altPattern = /data-md5="([a-f0-9]{32})"[\s\S]*?class="[^"]*title[^"]*"[^>]*>([^<]+)/gi;
            while((match = altPattern.exec(html)) !== null){
                const [, md5Raw, titleRaw] = match;
                const md5 = md5Raw ?? '';
                const title = titleRaw ?? 'Unknown';
                if (!md5) continue;
                results.push({
                    id: md5,
                    title: title.trim(),
                    author: 'Unknown',
                    extension: 'unknown',
                    size: 'Unknown',
                    source: 'annas',
                    downloadUrl: `https://${ANNAS_DOMAIN}/md5/${md5}`,
                    searchUrl: getAnnasSearchUrl(query)
                });
                if (results.length >= 15) break;
            }
        }
    } catch (error) {
        console.error("Anna's Archive search error:", error);
    }
    return results;
}
async function getAnnasDownloadLinks(md5) {
    const links = [];
    try {
        const detailUrl = `https://${ANNAS_DOMAIN}/md5/${md5}`;
        const response = await fetch(detailUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml'
            }
        });
        if (!response.ok) {
            return links;
        }
        const html = await response.text();
        // Extract download links
        const linkPattern = /href="(https?:\/\/[^"]+(?:download|get)[^"]*)"/gi;
        let match;
        while((match = linkPattern.exec(html)) !== null){
            const link = match[1];
            if (link) links.push(link);
        }
    } catch (error) {
        console.error("Anna's Archive download links error:", error);
    }
    return links;
}
const __TURBOPACK__default__export__ = {
    searchAnnas,
    getAnnasSearchUrl,
    getAnnasDownloadLinks
};
}),
"[project]/lib/services/downloads/libgen.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Library Genesis (LibGen) Integration
 *
 * LibGen has a JSON API for searching books.
 */ __turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__,
    "getLibGenDomain",
    ()=>getLibGenDomain,
    "getLibGenDownloadUrl",
    ()=>getLibGenDownloadUrl,
    "getLibGenSearchUrl",
    ()=>getLibGenSearchUrl,
    "searchLibGen",
    ()=>searchLibGen
]);
// LibGen mirrors
const LIBGEN_MIRRORS = [
    'libgen.is',
    'libgen.rs',
    'libgen.st'
];
const DOWNLOAD_MIRRORS = [
    'library.lol',
    'libgen.lc'
];
function getLibGenDomain() {
    return LIBGEN_MIRRORS[0];
}
function getLibGenSearchUrl(query) {
    const encoded = encodeURIComponent(query);
    return `https://${getLibGenDomain()}/search.php?req=${encoded}&lg_topic=libgen&open=0&view=simple&res=25&phrase=1&column=def`;
}
async function searchLibGen(query, options) {
    const results = [];
    try {
        // Use the JSON API if searching by ISBN
        if (options?.isbn) {
            const apiResults = await searchLibGenByIsbn(options.isbn);
            if (apiResults.length > 0) {
                return apiResults;
            }
        }
        // Otherwise use the search API
        const encoded = encodeURIComponent(query);
        // Get search results from the HTML search page
        const searchPageUrl = `https://${getLibGenDomain()}/search.php?req=${encoded}&lg_topic=libgen&open=0&view=simple&res=25&phrase=1&column=def`;
        const response = await fetch(searchPageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml'
            }
        });
        if (!response.ok) {
            console.warn(`LibGen search failed: ${response.status}`);
            return results;
        }
        const html = await response.text();
        // Parse book IDs from the search results page
        const idPattern = /href=['"]book\/index\.php\?md5=([a-f0-9]{32})['"]|md5=([a-f0-9]{32})/gi;
        const md5s = [];
        let match;
        while((match = idPattern.exec(html)) !== null){
            const md5 = match[1] || match[2];
            if (md5 && !md5s.includes(md5.toLowerCase())) {
                md5s.push(md5.toLowerCase());
            }
            if (md5s.length >= 15) break;
        }
        // For each MD5, create a result
        // Full details would require additional API calls
        // For now, parse from HTML table
        const rowPattern = /<tr[^>]*>[\s\S]*?<td[^>]*>(\d+)<\/td>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*>([^<]*)<\/a>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?md5=([a-f0-9]{32})/gi;
        while((match = rowPattern.exec(html)) !== null){
            const [, , authorRaw, titleRaw, publisherRaw, yearRaw, , extensionRaw, md5Raw] = match;
            const md5 = md5Raw ?? '';
            if (!md5) continue;
            results.push({
                id: md5,
                md5: md5.toLowerCase(),
                title: titleRaw?.trim() || 'Unknown',
                author: authorRaw?.trim() || 'Unknown',
                publisher: publisherRaw?.trim(),
                year: yearRaw?.trim(),
                extension: extensionRaw?.trim()?.toLowerCase() || 'pdf',
                size: 'Unknown',
                downloadUrl: getLibGenDownloadUrl(md5),
                searchUrl: getLibGenSearchUrl(query)
            });
            if (results.length >= 15) break;
        }
        // Simpler fallback pattern
        if (results.length === 0) {
            const simplePattern = /md5=([a-f0-9]{32})[^>]*>([^<]+)/gi;
            while((match = simplePattern.exec(html)) !== null){
                const [, md5Raw, titleRaw] = match;
                const md5 = md5Raw ?? '';
                const title = titleRaw ?? '';
                if (!md5) continue;
                if (title.length > 3 && !results.find((r)=>r.md5 === md5.toLowerCase())) {
                    results.push({
                        id: md5,
                        md5: md5.toLowerCase(),
                        title: title.trim(),
                        author: 'Unknown',
                        extension: 'pdf',
                        size: 'Unknown',
                        downloadUrl: getLibGenDownloadUrl(md5),
                        searchUrl: getLibGenSearchUrl(query)
                    });
                    if (results.length >= 15) break;
                }
            }
        }
    } catch (error) {
        console.error('LibGen search error:', error);
    }
    return results;
}
/**
 * Search LibGen by ISBN using JSON API
 */ async function searchLibGenByIsbn(isbn) {
    const results = [];
    try {
        const cleanIsbn = isbn.replace(/[-\s]/g, '');
        const apiUrl = `https://${getLibGenDomain()}/json.php?isbn=${cleanIsbn}&fields=*`;
        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });
        if (!response.ok) {
            return results;
        }
        const data = await response.json();
        if (Array.isArray(data)) {
            for (const book of data){
                results.push({
                    id: book.id || book.md5,
                    md5: book.md5?.toLowerCase() || '',
                    title: book.title || 'Unknown',
                    author: book.author || 'Unknown',
                    extension: book.extension?.toLowerCase() || 'pdf',
                    size: book.filesize ? formatFileSize(parseInt(book.filesize)) : 'Unknown',
                    year: book.year,
                    language: book.language,
                    pages: book.pages,
                    publisher: book.publisher,
                    isbn: book.identifier,
                    downloadUrl: getLibGenDownloadUrl(book.md5),
                    searchUrl: getLibGenSearchUrl(isbn)
                });
            }
        }
    } catch (error) {
        console.error('LibGen ISBN search error:', error);
    }
    return results;
}
function getLibGenDownloadUrl(md5) {
    return `https://${DOWNLOAD_MIRRORS[0]}/main/${md5}`;
}
/**
 * Format file size from bytes to human readable
 */ function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
const __TURBOPACK__default__export__ = {
    searchLibGen,
    getLibGenSearchUrl,
    getLibGenDownloadUrl,
    getLibGenDomain
};
}),
"[project]/lib/services/downloads/source-status.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "checkSourceHealth",
    ()=>checkSourceHealth,
    "default",
    ()=>__TURBOPACK__default__export__,
    "getSourceStatuses",
    ()=>getSourceStatuses,
    "refreshSourceStatuses",
    ()=>refreshSourceStatuses
]);
/**
 * Source Status Service
 *
 * Fetches availability status from open-slum.org and caches it.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db/index.ts [app-rsc] (ecmascript)");
;
// Known sources and their display names
const KNOWN_SOURCES = {
    zlibrary: {
        displayName: 'Z-Library',
        url: 'https://z-lib.gs'
    },
    annas: {
        displayName: "Anna's Archive",
        url: 'https://annas-archive.org'
    },
    libgen: {
        displayName: 'Library Genesis',
        url: 'https://libgen.is'
    },
    libgen_rs: {
        displayName: 'LibGen.rs',
        url: 'https://libgen.rs'
    },
    libgen_fiction: {
        displayName: 'LibGen Fiction',
        url: 'https://libgen.is/fiction'
    },
    sci_hub: {
        displayName: 'Sci-Hub',
        url: 'https://sci-hub.se'
    }
};
async function getSourceStatuses(forceRefresh = false) {
    // Check if cache is stale
    if (forceRefresh || (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isStatusCacheStale"])(5)) {
        await refreshSourceStatuses();
    }
    const cached = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSourceStatusCache"])();
    // Map cached data to SourceStatus format
    const statuses = cached.map((c)=>{
        const sourceInfo = KNOWN_SOURCES[c.source] || {
            displayName: c.source,
            url: '#'
        };
        return {
            name: c.source,
            displayName: sourceInfo.displayName,
            status: c.status,
            responseTime: c.response_time || undefined,
            lastChecked: new Date(c.last_updated),
            url: sourceInfo.url
        };
    });
    // Add any known sources that aren't in cache
    for (const [name, info] of Object.entries(KNOWN_SOURCES)){
        if (!statuses.find((s)=>s.name === name)) {
            statuses.push({
                name,
                displayName: info.displayName,
                status: 'unknown',
                lastChecked: new Date(),
                url: info.url
            });
        }
    }
    return statuses;
}
async function refreshSourceStatuses() {
    try {
        const response = await fetch('https://open-slum.org/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml'
            },
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) {
            console.warn(`open-slum.org fetch failed: ${response.status}`);
            return;
        }
        const html = await response.text();
        // Parse status from the page
        // The page typically shows status indicators for various sources
        parseAndUpdateStatuses(html);
    } catch (error) {
        console.error('Failed to refresh source statuses:', error);
        // On error, set all sources to unknown
        for (const source of Object.keys(KNOWN_SOURCES)){
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateSourceStatus"])(source, 'unknown');
        }
    }
}
/**
 * Parse the open-slum.org HTML and update status cache
 */ function parseAndUpdateStatuses(html) {
    // Map common names to our internal source names
    const nameMapping = {
        'z-library': 'zlibrary',
        'z-lib': 'zlibrary',
        'zlib': 'zlibrary',
        "anna's archive": 'annas',
        'annas archive': 'annas',
        'annas-archive': 'annas',
        'library genesis': 'libgen',
        'libgen': 'libgen',
        'libgen.is': 'libgen',
        'libgen.rs': 'libgen_rs',
        'sci-hub': 'sci_hub',
        'scihub': 'sci_hub'
    };
    // Pattern to match status entries from page structure
    const entryPattern = /<(?:div|li|tr)[^>]*class="[^"]*(?:site|service|source)[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)<[\s\S]*?<[^>]*class="[^"]*status[^"]*"[^>]*>([^<]+)</gi;
    let match;
    const foundSources = new Set();
    // Try to find status entries
    while((match = entryPattern.exec(html)) !== null){
        const [, rawName, rawStatus] = match;
        if (!rawName || !rawStatus) continue;
        const name = rawName.toLowerCase().trim();
        const status = rawStatus.toLowerCase().trim();
        const internalName = Object.entries(nameMapping).find(([key])=>name.includes(key))?.[1];
        if (internalName) {
            const parsedStatus = parseStatus(status);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateSourceStatus"])(internalName, parsedStatus);
            foundSources.add(internalName);
        }
    }
    // Fallback: try to parse by looking for keywords
    if (foundSources.size === 0) {
        for (const [keyword, internalName] of Object.entries(nameMapping)){
            const keywordPattern = new RegExp(`${escapeRegex(keyword)}[^]*?(up|down|online|offline|operational|degraded|slow)`, 'i');
            const keywordMatch = html.match(keywordPattern);
            if (keywordMatch && keywordMatch[1]) {
                const status = parseStatus(keywordMatch[1]);
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateSourceStatus"])(internalName, status);
                foundSources.add(internalName);
            }
        }
    }
    // For sources not found, mark as unknown
    for (const source of Object.keys(KNOWN_SOURCES)){
        if (!foundSources.has(source)) {
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateSourceStatus"])(source, 'unknown');
        }
    }
}
/**
 * Parse status text to our status type
 */ function parseStatus(statusText) {
    const text = statusText.toLowerCase();
    if (text.includes('up') || text.includes('online') || text.includes('operational')) {
        return 'up';
    }
    if (text.includes('down') || text.includes('offline') || text.includes('outage')) {
        return 'down';
    }
    if (text.includes('degraded') || text.includes('slow') || text.includes('issues')) {
        return 'degraded';
    }
    return 'up'; // Default to up if unclear
}
/**
 * Escape special regex characters
 */ function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
async function checkSourceHealth(source) {
    const sourceInfo = KNOWN_SOURCES[source];
    if (!sourceInfo) {
        return {
            name: source,
            displayName: source,
            status: 'unknown',
            lastChecked: new Date(),
            url: '#'
        };
    }
    try {
        const start = Date.now();
        const response = await fetch(sourceInfo.url, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: AbortSignal.timeout(5000)
        });
        const responseTime = Date.now() - start;
        let status;
        if (response.ok) {
            status = responseTime > 3000 ? 'degraded' : 'up';
        } else {
            status = 'down';
        }
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateSourceStatus"])(source, status, responseTime);
        return {
            name: source,
            displayName: sourceInfo.displayName,
            status,
            responseTime,
            lastChecked: new Date(),
            url: sourceInfo.url
        };
    } catch  {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateSourceStatus"])(source, 'down');
        return {
            name: source,
            displayName: sourceInfo.displayName,
            status: 'down',
            lastChecked: new Date(),
            url: sourceInfo.url
        };
    }
}
const __TURBOPACK__default__export__ = {
    getSourceStatuses,
    refreshSourceStatuses,
    checkSourceHealth
};
}),
"[project]/lib/services/downloads/index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__,
    "getSearchLinks",
    ()=>getSearchLinks,
    "searchAllSources",
    ()=>searchAllSources,
    "searchSource",
    ()=>searchSource
]);
/**
 * Unified Download Search Service
 *
 * Searches all enabled sources and returns combined results.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$zlibrary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/downloads/zlibrary.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$annas$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/downloads/annas.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$libgen$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/downloads/libgen.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$source$2d$status$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/downloads/source-status.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db/index.ts [app-rsc] (ecmascript)");
;
;
;
;
;
function getSearchLinks(query) {
    return {
        zlibrary: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$zlibrary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getZLibrarySearchUrl"])(query),
        annas: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$annas$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAnnasSearchUrl"])(query),
        libgen: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$libgen$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getLibGenSearchUrl"])(query)
    };
}
async function searchAllSources(query, options) {
    const results = [];
    const sourcesToSearch = options?.sources || [
        'zlibrary',
        'annas',
        'libgen'
    ];
    // Get current source statuses
    const statuses = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$source$2d$status$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSourceStatuses"])();
    const statusMap = new Map(statuses.map((s)=>[
            s.name,
            s.status
        ]));
    // Create search promises for enabled sources
    const searchPromises = [];
    if (sourcesToSearch.includes('zlibrary') && (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isSourceEnabled"])('zlibrary')) {
        const zlibConfig = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getDownloadSourceConfig"])('zlibrary');
        const credentials = zlibConfig?.credentials ? JSON.parse(zlibConfig.credentials) : undefined;
        searchPromises.push((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$zlibrary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["searchZLibrary"])(query, credentials).then((zlibResults)=>{
            for (const r of zlibResults){
                results.push({
                    id: `zlib-${r.id}`,
                    source: 'zlibrary',
                    title: r.title,
                    author: r.author,
                    extension: r.extension,
                    size: r.size,
                    year: r.year,
                    language: r.language,
                    downloadUrl: r.downloadUrl,
                    searchUrl: r.searchUrl,
                    sourceStatus: statusMap.get('zlibrary')
                });
            }
        }).catch((err)=>{
            console.error('Z-Library search failed:', err);
        }));
    }
    if (sourcesToSearch.includes('annas') && (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isSourceEnabled"])('annas')) {
        searchPromises.push((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$annas$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["searchAnnas"])(query).then((annasResults)=>{
            for (const r of annasResults){
                results.push({
                    id: `annas-${r.id}`,
                    source: 'annas',
                    title: r.title,
                    author: r.author,
                    extension: r.extension,
                    size: r.size,
                    downloadUrl: r.downloadUrl,
                    searchUrl: r.searchUrl,
                    sourceStatus: statusMap.get('annas')
                });
            }
        }).catch((err)=>{
            console.error("Anna's Archive search failed:", err);
        }));
    }
    if (sourcesToSearch.includes('libgen') && (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isSourceEnabled"])('libgen')) {
        searchPromises.push((0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$libgen$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["searchLibGen"])(query, {
            isbn: options?.isbn
        }).then((libgenResults)=>{
            for (const r of libgenResults){
                results.push({
                    id: `libgen-${r.id}`,
                    source: 'libgen',
                    title: r.title,
                    author: r.author,
                    extension: r.extension,
                    size: r.size,
                    year: r.year,
                    language: r.language,
                    downloadUrl: r.downloadUrl,
                    searchUrl: r.searchUrl,
                    sourceStatus: statusMap.get('libgen')
                });
            }
        }).catch((err)=>{
            console.error('LibGen search failed:', err);
        }));
    }
    // Wait for all searches to complete
    await Promise.all(searchPromises);
    // Sort results: prefer sources that are 'up', then by relevance (title match)
    results.sort((a, b)=>{
        // Status priority: up > degraded > down > unknown
        const statusPriority = {
            up: 0,
            degraded: 1,
            down: 2,
            unknown: 3
        };
        const aStatus = statusPriority[a.sourceStatus || 'unknown'];
        const bStatus = statusPriority[b.sourceStatus || 'unknown'];
        if (aStatus !== bStatus) {
            return aStatus - bStatus;
        }
        // Then by title containing the query
        const queryLower = query.toLowerCase();
        const aMatch = a.title.toLowerCase().includes(queryLower) ? 0 : 1;
        const bMatch = b.title.toLowerCase().includes(queryLower) ? 0 : 1;
        return aMatch - bMatch;
    });
    return results;
}
async function searchSource(source, query, options) {
    return searchAllSources(query, {
        ...options,
        sources: [
            source
        ]
    });
}
;
;
;
;
const __TURBOPACK__default__export__ = {
    searchAllSources,
    searchSource,
    getSearchLinks
};
}),
"[project]/lib/actions/downloads.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"0096be936f0aa1be04f028524ccbdedd3fcc88156d":"clearZLibraryCredentials","00d6cc61ec97570b4c2d0873e3287dd57d3d2a5594":"getDownloadConfigs","00fc3e4dc25e999e70ca49c93b2620d38a91874389":"refreshDownloadSourceStatuses","406b6188f674ce2990b3153bb95479c935e3e872ff":"getDownloadConfig","408f7dd8212a01c500571742795e22a2710dec76b1":"checkDownloadSourceHealth","40a4ca4eb478ffbba2bcbc9d73148492084f925917":"getDownloadSourceStatuses","40c4bb0acf99ec4c2659953a5f8bc0925c9f5c2955":"testDownloadSource","40ecf2568dbeb8e238d3e1388b5524f3b2bff56b7b":"getDownloadSearchLinks","6072e9ace546973be026a723e509e415477a590728":"toggleDownloadSource","60898cf24988024e8836d3a3a5d2251bd16f1e576d":"saveZLibraryCredentials","60ce704d8648d0791b8d1a15ceb31f82825a82dca4":"searchDownloads","701451440290300d7632d4dfa38b5e4e12c1816f75":"searchDownloadSource","70dafb3758d1d3d8e77b1835b0f8eb1796e8d47388":"updateDownloadConfig"},"",""] */ __turbopack_context__.s([
    "checkDownloadSourceHealth",
    ()=>checkDownloadSourceHealth,
    "clearZLibraryCredentials",
    ()=>clearZLibraryCredentials,
    "getDownloadConfig",
    ()=>getDownloadConfig,
    "getDownloadConfigs",
    ()=>getDownloadConfigs,
    "getDownloadSearchLinks",
    ()=>getDownloadSearchLinks,
    "getDownloadSourceStatuses",
    ()=>getDownloadSourceStatuses,
    "refreshDownloadSourceStatuses",
    ()=>refreshDownloadSourceStatuses,
    "saveZLibraryCredentials",
    ()=>saveZLibraryCredentials,
    "searchDownloadSource",
    ()=>searchDownloadSource,
    "searchDownloads",
    ()=>searchDownloads,
    "testDownloadSource",
    ()=>testDownloadSource,
    "toggleDownloadSource",
    ()=>toggleDownloadSource,
    "updateDownloadConfig",
    ()=>updateDownloadConfig
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/cache.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/services/downloads/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$source$2d$status$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/downloads/source-status.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$zlibrary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/downloads/zlibrary.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
;
;
;
async function searchDownloads(query, options) {
    try {
        const results = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["searchAllSources"])(query, options);
        return {
            success: true,
            results
        };
    } catch (error) {
        console.error('Error searching downloads:', error);
        return {
            success: false,
            error: 'Search failed'
        };
    }
}
async function searchDownloadSource(source, query, options) {
    try {
        const results = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["searchSource"])(source, query, options);
        return {
            success: true,
            results
        };
    } catch (error) {
        console.error(`Error searching ${source}:`, error);
        return {
            success: false,
            error: `Search on ${source} failed`
        };
    }
}
async function getDownloadSearchLinks(query) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getSearchLinks"])(query);
}
async function getDownloadSourceStatuses(forceRefresh = false) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$source$2d$status$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSourceStatuses"])(forceRefresh);
}
async function refreshDownloadSourceStatuses() {
    try {
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$source$2d$status$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["refreshSourceStatuses"])();
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/wanted');
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/settings');
        return {
            success: true
        };
    } catch (error) {
        console.error('Error refreshing source statuses:', error);
        return {
            success: false
        };
    }
}
async function checkDownloadSourceHealth(source) {
    const status = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$source$2d$status$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["checkSourceHealth"])(source);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/settings');
    return status;
}
async function getDownloadConfigs() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getDownloadSourceConfigs"])();
}
async function getDownloadConfig(source) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getDownloadSourceConfig"])(source);
}
async function updateDownloadConfig(source, enabled, credentials) {
    try {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["upsertDownloadSourceConfig"])(source, enabled, credentials);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/settings');
        return {
            success: true
        };
    } catch (error) {
        console.error('Error updating download config:', error);
        return {
            success: false,
            error: 'Failed to update configuration'
        };
    }
}
async function toggleDownloadSource(source, enabled) {
    try {
        const existing = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getDownloadSourceConfig"])(source);
        const credentials = existing?.credentials ? JSON.parse(existing.credentials) : undefined;
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["upsertDownloadSourceConfig"])(source, enabled, credentials);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/settings');
        return {
            success: true
        };
    } catch (error) {
        console.error('Error toggling download source:', error);
        return {
            success: false,
            error: 'Failed to toggle source'
        };
    }
}
async function saveZLibraryCredentials(email, password) {
    try {
        // Try to authenticate
        const authResult = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$zlibrary$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["authenticateZLibrary"])(email, password);
        if (authResult) {
            // Save credentials with session tokens
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["upsertDownloadSourceConfig"])('zlibrary', true, {
                email,
                password,
                remix_userid: authResult.remix_userid,
                remix_userkey: authResult.remix_userkey
            });
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/settings');
            return {
                success: true
            };
        }
        // Authentication failed, still save credentials but without tokens
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["upsertDownloadSourceConfig"])('zlibrary', true, {
            email,
            password
        });
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/settings');
        return {
            success: false,
            error: 'Authentication failed, credentials saved but downloads may not work'
        };
    } catch (error) {
        console.error('Error saving Z-Library credentials:', error);
        return {
            success: false,
            error: 'Failed to save credentials'
        };
    }
}
async function testDownloadSource(source) {
    try {
        const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$downloads$2f$source$2d$status$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["checkSourceHealth"])(source);
        return {
            success: result.status === 'up' || result.status === 'degraded',
            status: result.status,
            responseTime: result.responseTime
        };
    } catch (error) {
        console.error(`Error testing ${source}:`, error);
        return {
            success: false,
            error: `Failed to test ${source}`
        };
    }
}
async function clearZLibraryCredentials() {
    try {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["upsertDownloadSourceConfig"])('zlibrary', true, undefined);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/settings');
        return {
            success: true
        };
    } catch (error) {
        console.error('Error clearing Z-Library credentials:', error);
        return {
            success: false
        };
    }
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    searchDownloads,
    searchDownloadSource,
    getDownloadSearchLinks,
    getDownloadSourceStatuses,
    refreshDownloadSourceStatuses,
    checkDownloadSourceHealth,
    getDownloadConfigs,
    getDownloadConfig,
    updateDownloadConfig,
    toggleDownloadSource,
    saveZLibraryCredentials,
    testDownloadSource,
    clearZLibraryCredentials
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(searchDownloads, "60ce704d8648d0791b8d1a15ceb31f82825a82dca4", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(searchDownloadSource, "701451440290300d7632d4dfa38b5e4e12c1816f75", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getDownloadSearchLinks, "40ecf2568dbeb8e238d3e1388b5524f3b2bff56b7b", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getDownloadSourceStatuses, "40a4ca4eb478ffbba2bcbc9d73148492084f925917", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(refreshDownloadSourceStatuses, "00fc3e4dc25e999e70ca49c93b2620d38a91874389", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(checkDownloadSourceHealth, "408f7dd8212a01c500571742795e22a2710dec76b1", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getDownloadConfigs, "00d6cc61ec97570b4c2d0873e3287dd57d3d2a5594", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getDownloadConfig, "406b6188f674ce2990b3153bb95479c935e3e872ff", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(updateDownloadConfig, "70dafb3758d1d3d8e77b1835b0f8eb1796e8d47388", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(toggleDownloadSource, "6072e9ace546973be026a723e509e415477a590728", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(saveZLibraryCredentials, "60898cf24988024e8836d3a3a5d2251bd16f1e576d", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(testDownloadSource, "40c4bb0acf99ec4c2659953a5f8bc0925c9f5c2955", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(clearZLibraryCredentials, "0096be936f0aa1be04f028524ccbdedd3fcc88156d", null);
}),
"[project]/.next-internal/server/app/wanted/page/actions.js { ACTIONS_MODULE0 => \"[project]/lib/actions/wanted.ts [app-rsc] (ecmascript)\", ACTIONS_MODULE1 => \"[project]/lib/actions/downloads.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$wanted$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/wanted.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/downloads.ts [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
}),
"[project]/.next-internal/server/app/wanted/page/actions.js { ACTIONS_MODULE0 => \"[project]/lib/actions/wanted.ts [app-rsc] (ecmascript)\", ACTIONS_MODULE1 => \"[project]/lib/actions/downloads.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "0096be936f0aa1be04f028524ccbdedd3fcc88156d",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["clearZLibraryCredentials"],
    "00d6cc61ec97570b4c2d0873e3287dd57d3d2a5594",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getDownloadConfigs"],
    "00fc3e4dc25e999e70ca49c93b2620d38a91874389",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["refreshDownloadSourceStatuses"],
    "406b6188f674ce2990b3153bb95479c935e3e872ff",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getDownloadConfig"],
    "406e9aa8493e8c043d8cee1122402296d5d0f9c8c3",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$wanted$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["removeFromWanted"],
    "40816c53bda01a793f9d2b422dc1bdd295d6ec9d25",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$wanted$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getWantedBook"],
    "408f7dd8212a01c500571742795e22a2710dec76b1",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["checkDownloadSourceHealth"],
    "409f768f476b4acd642da40f15df6c90ce48fe0b1d",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$wanted$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAuthorBooks"],
    "40a4ca4eb478ffbba2bcbc9d73148492084f925917",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getDownloadSourceStatuses"],
    "40c4bb0acf99ec4c2659953a5f8bc0925c9f5c2955",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["testDownloadSource"],
    "40c859b63dce52512b396fd0488e7342c6935f39c7",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$wanted$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getWantedBooks"],
    "40d8b25c2a5792d06fb5e8e47b3044fa4716921978",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$wanted$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["addToWanted"],
    "40ecf2568dbeb8e238d3e1388b5524f3b2bff56b7b",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getDownloadSearchLinks"],
    "40f905399dd029378f51ed4c09018f2466bf82f8e7",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$wanted$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["searchHardcoverBooks"],
    "600f3b37e5875b8b73b3776ba0c8396f7e01a99c96",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$wanted$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateWantedPriority"],
    "602256e32c6458989ba98ab5b1c3780b01e714c634",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$wanted$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateWantedStatus"],
    "606379aae259df62acdbca901c1b60f06bce61c591",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$wanted$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateWantedNotes"],
    "6072e9ace546973be026a723e509e415477a590728",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["toggleDownloadSource"],
    "60898cf24988024e8836d3a3a5d2251bd16f1e576d",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["saveZLibraryCredentials"],
    "60ce704d8648d0791b8d1a15ceb31f82825a82dca4",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["searchDownloads"],
    "701451440290300d7632d4dfa38b5e4e12c1816f75",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["searchDownloadSource"],
    "703088ebe4b272f19ad187e9483a1b5d5717d76982",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$wanted$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isBookWanted"],
    "70dafb3758d1d3d8e77b1835b0f8eb1796e8d47388",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateDownloadConfig"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f2e$next$2d$internal$2f$server$2f$app$2f$wanted$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$lib$2f$actions$2f$wanted$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29222c$__ACTIONS_MODULE1__$3d3e$__$225b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/.next-internal/server/app/wanted/page/actions.js { ACTIONS_MODULE0 => "[project]/lib/actions/wanted.ts [app-rsc] (ecmascript)", ACTIONS_MODULE1 => "[project]/lib/actions/downloads.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$wanted$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/wanted.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$downloads$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/downloads.ts [app-rsc] (ecmascript)");
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__e70147bf._.js.map
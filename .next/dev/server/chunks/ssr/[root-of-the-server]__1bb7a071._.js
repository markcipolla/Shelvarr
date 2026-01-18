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
"[project]/lib/actions/authors.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"4007546e5b4f659ed3138a8471b80e3eb545df11b6":"getOrCreateAuthor","4038a13fe5f1311bfe02437b83b2d283aaadbc7389":"toggleWorkWanted","405173413693034ab29e7647dd06c98e1d8579c489":"getAuthorsFromBooks","40576a09ceddb019238846935bd9f51f7b0c4e6b58":"refreshAuthorOwnership","40702c7b484795658a92b15155e1fe46c8a5d98ed6":"getAuthor","40a960b6b496e3d7ccc5520e8d0f9290b73886dd93":"getOwnedBooksByAuthor","40b87b0ae7032d43b9956d3e102a0a9814097b28e6":"getAuthorByName","40c38bc40e0d51b3fd2dd38968ddc60a98b3cbc0d1":"fetchAuthorMetadata","40ddc6de0d26573f24176c7ac69cbaadf23c24fb23":"getAuthorWorks"},"",""] */ __turbopack_context__.s([
    "fetchAuthorMetadata",
    ()=>fetchAuthorMetadata,
    "getAuthor",
    ()=>getAuthor,
    "getAuthorByName",
    ()=>getAuthorByName,
    "getAuthorWorks",
    ()=>getAuthorWorks,
    "getAuthorsFromBooks",
    ()=>getAuthorsFromBooks,
    "getOrCreateAuthor",
    ()=>getOrCreateAuthor,
    "getOwnedBooksByAuthor",
    ()=>getOwnedBooksByAuthor,
    "refreshAuthorOwnership",
    ()=>refreshAuthorOwnership,
    "toggleWorkWanted",
    ()=>toggleWorkWanted
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
/**
 * Normalize a name for comparison
 * - Lowercase
 * - Remove punctuation
 * - Collapse whitespace
 * - Trim
 */ function normalizeName(name) {
    return name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}
/**
 * Check if two author names match (handles variations like "J.K. Rowling" vs "J K Rowling")
 */ function authorNamesMatch(name1, name2) {
    const norm1 = normalizeName(name1);
    const norm2 = normalizeName(name2);
    // Exact match after normalization
    if (norm1 === norm2) return true;
    // One contains the other (for cases like "Stephen King" vs "Stephen Edwin King")
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
    return false;
}
/**
 * Normalize a title for comparison
 * - Lowercase
 * - Remove punctuation
 * - Remove common subtitles after colons
 * - Trim whitespace
 */ function normalizeTitle(title) {
    return title.toLowerCase()// Remove content after colon (subtitles)
    .replace(/:.*$/, '')// Remove punctuation
    .replace(/[^\w\s]/g, '')// Collapse whitespace
    .replace(/\s+/g, ' ').trim();
}
/**
 * Check if two titles match using fuzzy matching
 */ function titlesMatch(title1, title2) {
    const norm1 = normalizeTitle(title1);
    const norm2 = normalizeTitle(title2);
    // Exact match after normalization
    if (norm1 === norm2) return true;
    // One contains the other (for cases like "The Book" vs "The Book: A Novel")
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
    // Check word overlap (at least 80% of words match)
    const words1 = new Set(norm1.split(' ').filter((w)=>w.length > 2));
    const words2 = new Set(norm2.split(' ').filter((w)=>w.length > 2));
    if (words1.size === 0 || words2.size === 0) return false;
    const intersection = [
        ...words1
    ].filter((w)=>words2.has(w));
    const minSize = Math.min(words1.size, words2.size);
    return intersection.length / minSize >= 0.8;
}
/**
 * Find best matching owned book for a bibliography work
 */ function findMatchingBook(workTitle, ownedBooks) {
    // Try exact match first (case-insensitive)
    let match = ownedBooks.find((b)=>b.title.toLowerCase() === workTitle.toLowerCase());
    if (match) return match;
    // Try normalized match
    match = ownedBooks.find((b)=>normalizeTitle(b.title) === normalizeTitle(workTitle));
    if (match) return match;
    // Try fuzzy match
    match = ownedBooks.find((b)=>titlesMatch(b.title, workTitle));
    if (match) return match;
    return null;
}
function mapAuthorRow(row) {
    return {
        id: row.id,
        name: row.name,
        openlibraryId: row.openlibrary_id,
        googleBooksId: row.google_books_id,
        totalWorks: row.total_works,
        lastSynced: row.last_synced,
        createdAt: row.created_at
    };
}
function mapAuthorWorkRow(row) {
    return {
        id: row.id,
        authorId: row.author_id,
        title: row.title,
        isbn: row.isbn,
        publishYear: row.publish_year,
        language: row.language,
        metadataSource: row.metadata_source,
        metadataId: row.metadata_id,
        owned: row.owned === 1,
        bookId: row.book_id,
        wanted: row.wanted === 1,
        createdAt: row.created_at
    };
}
async function getAuthorsFromBooks(search) {
    // Get unique authors from books table
    const books = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`
    SELECT DISTINCT authors FROM books
    WHERE authors IS NOT NULL AND authors != '[]'
  `, []);
    // Parse and count authors
    const authorCounts = new Map();
    for (const book of books){
        try {
            const authors = JSON.parse(book.authors);
            for (const author of authors){
                const name = author.trim();
                if (name && (!search || name.toLowerCase().includes(search.toLowerCase()))) {
                    authorCounts.set(name, (authorCounts.get(name) || 0) + 1);
                }
            }
        } catch  {
        // Skip invalid JSON
        }
    }
    // Get existing author records
    const existingAuthors = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`SELECT * FROM authors`, []);
    const authorMap = new Map(existingAuthors.map((a)=>[
            a.name.toLowerCase(),
            a
        ]));
    // Build result
    const result = Array.from(authorCounts.entries()).map(([name, bookCount])=>{
        const existing = authorMap.get(name.toLowerCase());
        return {
            name,
            bookCount,
            authorId: existing?.id || null,
            hasMetadata: existing?.last_synced !== null
        };
    });
    // Sort by book count descending
    result.sort((a, b)=>b.bookCount - a.bookCount);
    return result;
}
async function getOrCreateAuthor(name) {
    const existing = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`SELECT * FROM authors WHERE LOWER(name) = LOWER(?)`, [
        name
    ]);
    if (existing.length > 0) {
        return mapAuthorRow(existing[0]);
    }
    const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])(`INSERT INTO authors (name) VALUES (?)`, [
        name
    ]);
    return {
        id: result.lastInsertRowid,
        name,
        openlibraryId: null,
        googleBooksId: null,
        totalWorks: null,
        lastSynced: null,
        createdAt: new Date().toISOString()
    };
}
async function getAuthor(id) {
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`SELECT * FROM authors WHERE id = ?`, [
        id
    ]);
    return rows.length > 0 ? mapAuthorRow(rows[0]) : null;
}
async function getAuthorByName(name) {
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`SELECT * FROM authors WHERE LOWER(name) = LOWER(?)`, [
        name
    ]);
    return rows.length > 0 ? mapAuthorRow(rows[0]) : null;
}
async function getAuthorWorks(authorId) {
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`SELECT * FROM author_works WHERE author_id = ? ORDER BY publish_year ASC NULLS LAST, title`, [
        authorId
    ]);
    return rows.map(mapAuthorWorkRow);
}
async function getOwnedBooksByAuthor(authorName) {
    const books = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`
    SELECT id, title, isbn, authors FROM books
    WHERE authors IS NOT NULL
  `, []);
    const owned = [];
    for (const book of books){
        try {
            const authors = JSON.parse(book.authors);
            // Use fuzzy author name matching to handle variations
            if (authors.some((a)=>authorNamesMatch(a, authorName))) {
                owned.push({
                    id: book.id,
                    title: book.title || 'Unknown',
                    isbn: book.isbn
                });
            }
        } catch  {
        // Skip invalid JSON
        }
    }
    return owned;
}
async function fetchAuthorMetadata(authorId) {
    const author = await getAuthor(authorId);
    if (!author) {
        return {
            success: false,
            error: 'Author not found'
        };
    }
    try {
        // Search for author on OpenLibrary
        const searchUrl = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(author.name)}&limit=1`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        if (!searchData.docs || searchData.docs.length === 0) {
            return {
                success: false,
                error: 'Author not found on OpenLibrary'
            };
        }
        const olAuthor = searchData.docs[0];
        const olAuthorKey = olAuthor.key; // e.g., "OL123A"
        // Update author with OpenLibrary ID
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])(`UPDATE authors SET openlibrary_id = ?, total_works = ? WHERE id = ?`, [
            olAuthorKey,
            olAuthor.work_count || 0,
            authorId
        ]);
        // Use search API to get works with publication years
        // The works endpoint doesn't include dates, but search does
        const worksSearchUrl = `https://openlibrary.org/search.json?author=${encodeURIComponent(author.name)}&limit=500&fields=title,key,first_publish_year,language`;
        const worksSearchRes = await fetch(worksSearchUrl);
        const worksData = await worksSearchRes.json();
        if (!worksData.docs || worksData.docs.length === 0) {
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])(`UPDATE authors SET last_synced = ? WHERE id = ?`, [
                new Date().toISOString(),
                authorId
            ]);
            return {
                success: true,
                worksFound: 0
            };
        }
        // Get owned books for matching
        const ownedBooks = await getOwnedBooksByAuthor(author.name);
        // Clear existing works for this author
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])(`DELETE FROM author_works WHERE author_id = ?`, [
            authorId
        ]);
        // Language code to name mapping
        const languageNames = {
            eng: 'English',
            en: 'English',
            fre: 'French',
            fr: 'French',
            ger: 'German',
            de: 'German',
            spa: 'Spanish',
            es: 'Spanish',
            ita: 'Italian',
            it: 'Italian',
            por: 'Portuguese',
            pt: 'Portuguese',
            rus: 'Russian',
            ru: 'Russian',
            jpn: 'Japanese',
            ja: 'Japanese',
            chi: 'Chinese',
            zh: 'Chinese',
            ara: 'Arabic',
            ar: 'Arabic',
            hin: 'Hindi',
            hi: 'Hindi',
            kor: 'Korean',
            ko: 'Korean',
            dut: 'Dutch',
            nl: 'Dutch',
            pol: 'Polish',
            pl: 'Polish',
            swe: 'Swedish',
            sv: 'Swedish',
            dan: 'Danish',
            da: 'Danish',
            nor: 'Norwegian',
            no: 'Norwegian',
            fin: 'Finnish',
            fi: 'Finnish',
            gre: 'Greek',
            el: 'Greek',
            heb: 'Hebrew',
            he: 'Hebrew',
            tur: 'Turkish',
            tr: 'Turkish',
            cze: 'Czech',
            cs: 'Czech',
            hun: 'Hungarian',
            hu: 'Hungarian',
            rum: 'Romanian',
            ro: 'Romanian'
        };
        // Insert works
        let worksInserted = 0;
        const seenTitles = new Set();
        for (const work of worksData.docs){
            const title = work.title || 'Unknown';
            const normalizedTitle = title.toLowerCase().trim();
            // Skip duplicates (search can return multiple editions)
            if (seenTitles.has(normalizedTitle)) continue;
            seenTitles.add(normalizedTitle);
            const workKey = work.key?.replace('/works/', '') || null;
            const publishYear = work.first_publish_year || null;
            // Get language - search API returns array of language codes
            let language = null;
            if (work.language && Array.isArray(work.language) && work.language.length > 0) {
                const langCode = work.language[0];
                language = languageNames[langCode] || langCode?.toUpperCase() || null;
            }
            // Find matching owned book using fuzzy matching
            const matchedBook = findMatchingBook(title, ownedBooks);
            const isOwned = !!matchedBook;
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])(`
        INSERT INTO author_works (author_id, title, publish_year, language, metadata_source, metadata_id, owned, book_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
                authorId,
                title,
                publishYear,
                language,
                'openlibrary',
                workKey,
                isOwned ? 1 : 0,
                matchedBook?.id || null
            ]);
            worksInserted++;
        }
        // Update last synced
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])(`UPDATE authors SET last_synced = ?, total_works = ? WHERE id = ?`, [
            new Date().toISOString(),
            worksInserted,
            authorId
        ]);
        return {
            success: true,
            worksFound: worksInserted
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch metadata'
        };
    }
}
async function refreshAuthorOwnership(authorId) {
    const author = await getAuthor(authorId);
    if (!author) return;
    const ownedBooks = await getOwnedBooksByAuthor(author.name);
    const works = await getAuthorWorks(authorId);
    for (const work of works){
        // Use fuzzy matching to find matching owned book
        const matchedBook = findMatchingBook(work.title, ownedBooks);
        const isOwned = !!matchedBook;
        if (work.owned !== isOwned || work.bookId !== (matchedBook?.id || null)) {
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])(`UPDATE author_works SET owned = ?, book_id = ? WHERE id = ?`, [
                isOwned ? 1 : 0,
                matchedBook?.id || null,
                work.id
            ]);
        }
    }
}
async function toggleWorkWanted(workId) {
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`SELECT * FROM author_works WHERE id = ?`, [
        workId
    ]);
    if (rows.length === 0) {
        return {
            success: false
        };
    }
    const newWanted = rows[0].wanted === 1 ? 0 : 1;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])(`UPDATE author_works SET wanted = ? WHERE id = ?`, [
        newWanted,
        workId
    ]);
    return {
        success: true
    };
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    getAuthorsFromBooks,
    getOrCreateAuthor,
    getAuthor,
    getAuthorByName,
    getAuthorWorks,
    getOwnedBooksByAuthor,
    fetchAuthorMetadata,
    refreshAuthorOwnership,
    toggleWorkWanted
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getAuthorsFromBooks, "405173413693034ab29e7647dd06c98e1d8579c489", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getOrCreateAuthor, "4007546e5b4f659ed3138a8471b80e3eb545df11b6", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getAuthor, "40702c7b484795658a92b15155e1fe46c8a5d98ed6", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getAuthorByName, "40b87b0ae7032d43b9956d3e102a0a9814097b28e6", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getAuthorWorks, "40ddc6de0d26573f24176c7ac69cbaadf23c24fb23", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getOwnedBooksByAuthor, "40a960b6b496e3d7ccc5520e8d0f9290b73886dd93", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(fetchAuthorMetadata, "40c38bc40e0d51b3fd2dd38968ddc60a98b3cbc0d1", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(refreshAuthorOwnership, "40576a09ceddb019238846935bd9f51f7b0c4e6b58", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(toggleWorkWanted, "4038a13fe5f1311bfe02437b83b2d283aaadbc7389", null);
}),
"[project]/.next-internal/server/app/authors/page/actions.js { ACTIONS_MODULE0 => \"[project]/lib/actions/authors.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/authors.ts [app-rsc] (ecmascript)");
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
"[project]/.next-internal/server/app/authors/page/actions.js { ACTIONS_MODULE0 => \"[project]/lib/actions/authors.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "4007546e5b4f659ed3138a8471b80e3eb545df11b6",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getOrCreateAuthor"],
    "4038a13fe5f1311bfe02437b83b2d283aaadbc7389",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["toggleWorkWanted"],
    "405173413693034ab29e7647dd06c98e1d8579c489",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAuthorsFromBooks"],
    "40576a09ceddb019238846935bd9f51f7b0c4e6b58",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["refreshAuthorOwnership"],
    "40702c7b484795658a92b15155e1fe46c8a5d98ed6",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAuthor"],
    "40a960b6b496e3d7ccc5520e8d0f9290b73886dd93",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getOwnedBooksByAuthor"],
    "40b87b0ae7032d43b9956d3e102a0a9814097b28e6",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAuthorByName"],
    "40c38bc40e0d51b3fd2dd38968ddc60a98b3cbc0d1",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["fetchAuthorMetadata"],
    "40ddc6de0d26573f24176c7ac69cbaadf23c24fb23",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAuthorWorks"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f2e$next$2d$internal$2f$server$2f$app$2f$authors$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/.next-internal/server/app/authors/page/actions.js { ACTIONS_MODULE0 => "[project]/lib/actions/authors.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/authors.ts [app-rsc] (ecmascript)");
}),
"[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

/* eslint-disable import/no-extraneous-dependencies */ Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "registerServerReference", {
    enumerable: true,
    get: function() {
        return _server.registerServerReference;
    }
});
const _server = __turbopack_context__.r("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)"); //# sourceMappingURL=server-reference.js.map
}),
"[externals]/better-sqlite3 [external] (better-sqlite3, cjs, [project]/node_modules/better-sqlite3)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("better-sqlite3-90e2652d1716b047", () => require("better-sqlite3-90e2652d1716b047"));

module.exports = mod;
}),
"[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// This function ensures that all the exported values are valid server actions,
// during the runtime. By definition all actions are required to be async
// functions, but here we can only check that they are functions.
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "ensureServerEntryExports", {
    enumerable: true,
    get: function() {
        return ensureServerEntryExports;
    }
});
function ensureServerEntryExports(actions) {
    for(let i = 0; i < actions.length; i++){
        const action = actions[i];
        if (typeof action !== 'function') {
            throw Object.defineProperty(new Error(`A "use server" file can only export async functions, found ${typeof action}.\nRead more: https://nextjs.org/docs/messages/invalid-use-server-value`), "__NEXT_ERROR_CODE", {
                value: "E352",
                enumerable: false,
                configurable: true
            });
        }
    }
} //# sourceMappingURL=action-validate.js.map
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1bb7a071._.js.map
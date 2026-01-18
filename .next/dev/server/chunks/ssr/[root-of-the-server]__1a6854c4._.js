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
"[project]/lib/actions/series.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"400523bfc016e202c757d775bd49ae680b447018f9":"getSeriesInfo","402bcb002e424219a72aac2974ec4d71576421c17e":"getBooksBySeries","408efca71aae2ab0b7bb0f4519c67f2f3534a76b17":"getSeries"},"",""] */ __turbopack_context__.s([
    "getBooksBySeries",
    ()=>getBooksBySeries,
    "getSeries",
    ()=>getSeries,
    "getSeriesInfo",
    ()=>getSeriesInfo
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
function mapBookRow(row) {
    return {
        id: row.id,
        libraryId: row.library_id,
        filePath: row.file_path,
        fileHash: row.file_hash,
        fileSize: row.file_size,
        title: row.title,
        authors: row.authors,
        series: row.series,
        seriesName: row.series_name,
        seriesNumber: row.series_number,
        isbn: row.isbn,
        publisher: row.publisher,
        publishDate: row.publish_date,
        description: row.description,
        coverUrl: row.cover_url,
        metadataSource: row.metadata_source,
        metadataId: row.metadata_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}
async function getSeries(search) {
    // Get all books with series data (either primary or JSON)
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`
    SELECT series_name, series, authors FROM books
    WHERE series_name IS NOT NULL OR series IS NOT NULL
  `);
    // Extract all unique series from both columns
    const seriesMap = new Map();
    for (const row of rows){
        const seriesToAdd = [];
        // Add primary series
        if (row.series_name) {
            seriesToAdd.push(row.series_name);
        }
        // Add all series from JSON
        if (row.series) {
            try {
                const allSeries = JSON.parse(row.series);
                for (const [name] of allSeries){
                    if (name && !seriesToAdd.includes(name)) {
                        seriesToAdd.push(name);
                    }
                }
            } catch  {
            // Ignore parse errors
            }
        }
        // Update counts
        for (const name of seriesToAdd){
            const existing = seriesMap.get(name);
            if (existing) {
                existing.count++;
            } else {
                seriesMap.set(name, {
                    count: 1,
                    authors: row.authors
                });
            }
        }
    }
    // Convert to array and filter by search
    let result = Array.from(seriesMap.entries()).map(([name, data])=>({
            seriesName: name,
            bookCount: data.count,
            authors: data.authors
        }));
    if (search) {
        const searchLower = search.toLowerCase();
        result = result.filter((s)=>s.seriesName.toLowerCase().includes(searchLower));
    }
    // Sort by name
    return result.sort((a, b)=>a.seriesName.localeCompare(b.seriesName));
}
async function getBooksBySeries(seriesName) {
    // Search both series_name (primary) and series JSON column
    // The JSON format is: [["Series Name", position], ...]
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`
    SELECT * FROM books
    WHERE series_name = ?
       OR (series IS NOT NULL AND series LIKE ?)
  `, [
        seriesName,
        `%"${seriesName}"%`
    ]);
    // For books matched via JSON, extract the correct position
    const books = rows.map((row)=>{
        const book = mapBookRow(row);
        // If this book's primary series matches, use its position
        if (row.series_name === seriesName) {
            return book;
        }
        // Otherwise, find position from the series JSON
        if (row.series) {
            try {
                const allSeries = JSON.parse(row.series);
                const match = allSeries.find(([name])=>name === seriesName);
                if (match) {
                    return {
                        ...book,
                        seriesName: match[0],
                        seriesNumber: match[1]
                    };
                }
            } catch  {
            // Ignore parse errors
            }
        }
        return book;
    });
    // Sort by series position (nulls last), then by title
    return books.sort((a, b)=>{
        const posA = a.seriesNumber;
        const posB = b.seriesNumber;
        // Both have positions - sort numerically
        if (posA !== null && posB !== null) {
            return posA - posB;
        }
        // Only a has position - a comes first
        if (posA !== null) return -1;
        // Only b has position - b comes first
        if (posB !== null) return 1;
        // Neither has position - sort by title
        return (a.title || '').localeCompare(b.title || '');
    });
}
async function getSeriesInfo(seriesName) {
    // Count books that have this series (either as primary or in JSON)
    const countRow = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`
    SELECT COUNT(*) as book_count
    FROM books
    WHERE series_name = ?
       OR (series IS NOT NULL AND series LIKE ?)
  `, [
        seriesName,
        `%"${seriesName}"%`
    ]);
    if (!countRow[0] || countRow[0].book_count === 0) return null;
    // Get a sample author from books in this series
    const authorRow = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`
    SELECT authors FROM books
    WHERE series_name = ?
       OR (series IS NOT NULL AND series LIKE ?)
    LIMIT 1
  `, [
        seriesName,
        `%"${seriesName}"%`
    ]);
    return {
        seriesName,
        bookCount: countRow[0].book_count,
        authors: authorRow[0]?.authors ?? null
    };
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    getSeries,
    getBooksBySeries,
    getSeriesInfo
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getSeries, "408efca71aae2ab0b7bb0f4519c67f2f3534a76b17", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getBooksBySeries, "402bcb002e424219a72aac2974ec4d71576421c17e", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getSeriesInfo, "400523bfc016e202c757d775bd49ae680b447018f9", null);
}),
"[project]/.next-internal/server/app/series/page/actions.js { ACTIONS_MODULE0 => \"[project]/lib/actions/series.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$series$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/series.ts [app-rsc] (ecmascript)");
;
;
;
}),
"[project]/.next-internal/server/app/series/page/actions.js { ACTIONS_MODULE0 => \"[project]/lib/actions/series.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "400523bfc016e202c757d775bd49ae680b447018f9",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$series$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSeriesInfo"],
    "402bcb002e424219a72aac2974ec4d71576421c17e",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$series$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getBooksBySeries"],
    "408efca71aae2ab0b7bb0f4519c67f2f3534a76b17",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$series$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSeries"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f2e$next$2d$internal$2f$server$2f$app$2f$series$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$lib$2f$actions$2f$series$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/.next-internal/server/app/series/page/actions.js { ACTIONS_MODULE0 => "[project]/lib/actions/series.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$series$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/series.ts [app-rsc] (ecmascript)");
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

//# sourceMappingURL=%5Broot-of-the-server%5D__1a6854c4._.js.map
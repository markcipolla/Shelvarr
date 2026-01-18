module.exports = [
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/app/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/app/layout.tsx [app-rsc] (ecmascript)"));
}),
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
const __filename = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$url__$5b$external$5d$__$28$url$2c$__cjs$29$__["fileURLToPath"])(__TURBOPACK__import$2e$meta__.url);
const __dirname = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["dirname"])(__filename);
let db = null;
function initDatabase() {
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
    const schemaPath = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["join"])(__dirname, 'schema.sql');
    const schema = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["readFileSync"])(schemaPath, 'utf-8');
    db.exec(schema);
    // Run migrations for schema updates
    runMigrations(db);
    console.log('Database initialized successfully');
    return db;
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
"[project]/lib/services/library/index.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createLibrary",
    ()=>createLibrary,
    "deleteLibrary",
    ()=>deleteLibrary,
    "getAllLibraries",
    ()=>getAllLibraries,
    "getLibraryBookCount",
    ()=>getLibraryBookCount,
    "getLibraryById",
    ()=>getLibraryById,
    "getLibraryByPath",
    ()=>getLibraryByPath,
    "updateLibrary",
    ()=>updateLibrary
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
;
;
function rowToLibrary(row) {
    return {
        id: row.id,
        name: row.name,
        path: row.path,
        komgaLibraryId: row.komga_library_id,
        createdAt: row.created_at
    };
}
async function getAllLibraries() {
    const rows = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])('SELECT * FROM libraries ORDER BY name');
    return rows.map(rowToLibrary);
}
async function getLibraryById(id) {
    const row = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["queryOne"])('SELECT * FROM libraries WHERE id = ?', [
        id
    ]);
    return row ? rowToLibrary(row) : null;
}
async function getLibraryByPath(path) {
    const row = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["queryOne"])('SELECT * FROM libraries WHERE path = ?', [
        path
    ]);
    return row ? rowToLibrary(row) : null;
}
async function createLibrary(input) {
    const { name, path, komgaLibraryId } = input;
    // Validate name
    if (!name || name.trim().length === 0) {
        return {
            success: false,
            error: 'Library name is required'
        };
    }
    // Validate path
    if (!path || path.trim().length === 0) {
        return {
            success: false,
            error: 'Library path is required'
        };
    }
    // Check if path exists and is a directory
    if (!(0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["existsSync"])(path)) {
        return {
            success: false,
            error: `Path does not exist: ${path}`
        };
    }
    const stats = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["statSync"])(path);
    if (!stats.isDirectory()) {
        return {
            success: false,
            error: `Path is not a directory: ${path}`
        };
    }
    // Check for duplicate path
    const existing = await getLibraryByPath(path);
    if (existing) {
        return {
            success: false,
            error: `Library already exists for path: ${path}`
        };
    }
    try {
        const row = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["insertReturning"])('INSERT INTO libraries (name, path, komga_library_id) VALUES (?, ?, ?) RETURNING *', [
            name.trim(),
            path,
            komgaLibraryId || null
        ]);
        if (!row) {
            return {
                success: false,
                error: 'Failed to create library'
            };
        }
        return {
            success: true,
            library: rowToLibrary(row)
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            error: message
        };
    }
}
async function updateLibrary(id, updates) {
    const existing = await getLibraryById(id);
    if (!existing) {
        return {
            success: false,
            error: 'Library not found'
        };
    }
    const name = updates.name?.trim() || existing.name;
    const komgaLibraryId = updates.komgaLibraryId !== undefined ? updates.komgaLibraryId : existing.komgaLibraryId;
    try {
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])('UPDATE libraries SET name = ?, komga_library_id = ? WHERE id = ?', [
            name,
            komgaLibraryId,
            id
        ]);
        const library = await getLibraryById(id);
        return {
            success: true,
            library: library
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            error: message
        };
    }
}
async function deleteLibrary(id) {
    const existing = await getLibraryById(id);
    if (!existing) {
        return {
            success: false,
            error: 'Library not found'
        };
    }
    try {
        // Books will be cascade deleted due to FK constraint
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])('DELETE FROM libraries WHERE id = ?', [
            id
        ]);
        return {
            success: true
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            error: message
        };
    }
}
async function getLibraryBookCount(id) {
    const row = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["queryOne"])('SELECT COUNT(*) as count FROM books WHERE library_id = ?', [
        id
    ]);
    return parseInt(row?.count || '0', 10);
}
}),
"[project]/lib/utils/logger.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Simple structured logger utility
 */ __turbopack_context__.s([
    "createLogger",
    ()=>createLogger,
    "default",
    ()=>__TURBOPACK__default__export__,
    "logger",
    ()=>logger
]);
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};
const currentLevel = process.env['LOG_LEVEL'] || 'info';
function shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}
function formatLog(entry) {
    const parts = [
        entry.timestamp,
        `[${entry.level.toUpperCase()}]`,
        entry.context ? `[${entry.context}]` : '',
        entry.message
    ].filter(Boolean);
    let output = parts.join(' ');
    if (entry.data && Object.keys(entry.data).length > 0) {
        output += ` ${JSON.stringify(entry.data)}`;
    }
    return output;
}
function log(level, message, context, data) {
    if (!shouldLog(level)) return;
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        context,
        data
    };
    const output = formatLog(entry);
    if (level === 'error') {
        console.error(output);
    } else if (level === 'warn') {
        console.warn(output);
    } else {
        console.log(output);
    }
}
function createLogger(context) {
    return {
        debug: (message, data)=>log('debug', message, context, data),
        info: (message, data)=>log('info', message, context, data),
        warn: (message, data)=>log('warn', message, context, data),
        error: (message, data)=>log('error', message, context, data)
    };
}
const logger = {
    debug: (message, data)=>log('debug', message, undefined, data),
    info: (message, data)=>log('info', message, undefined, data),
    warn: (message, data)=>log('warn', message, undefined, data),
    error: (message, data)=>log('error', message, undefined, data)
};
const __TURBOPACK__default__export__ = logger;
}),
"[project]/lib/services/queue/index.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cancelTask",
    ()=>cancelTask,
    "cleanupOldTasks",
    ()=>cleanupOldTasks,
    "completeTask",
    ()=>completeTask,
    "createTask",
    ()=>createTask,
    "default",
    ()=>__TURBOPACK__default__export__,
    "enqueueTask",
    ()=>enqueueTask,
    "failTask",
    ()=>failTask,
    "getRecentTasks",
    ()=>getRecentTasks,
    "getRunningTasks",
    ()=>getRunningTasks,
    "getTask",
    ()=>getTask,
    "getTaskStats",
    ()=>getTaskStats,
    "getTasks",
    ()=>getTasks,
    "registerTaskHandler",
    ()=>registerTaskHandler,
    "runTask",
    ()=>runTask,
    "startTask",
    ()=>startTask,
    "updateTaskProgress",
    ()=>updateTaskProgress
]);
/**
 * Background Job Queue Service
 * Manages async tasks like library scans, metadata fetches, and file reorganization
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2f$logger$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/utils/logger.ts [app-rsc] (ecmascript)");
;
;
const log = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2f$logger$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createLogger"])('queue');
function rowToTask(row) {
    let data;
    if (row.result) {
        try {
            data = JSON.parse(row.result);
        } catch  {
        // Not JSON, leave as string
        }
    }
    return {
        id: row.id,
        type: row.type,
        status: row.status,
        progress: row.progress,
        total: row.total,
        result: row.result,
        error: row.error,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        data
    };
}
// In-memory queue for running tasks
const runningTasks = new Map();
const taskHandlers = new Map();
function registerTaskHandler(type, handler) {
    taskHandlers.set(type, handler);
}
function createTask(type, initialData) {
    const result = initialData ? JSON.stringify(initialData) : null;
    const row = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["insertReturning"])('INSERT INTO tasks (type, status, progress, result) VALUES (?, ?, ?, ?) RETURNING *', [
        type,
        'pending',
        0,
        result
    ]);
    if (!row) {
        throw new Error('Failed to create task');
    }
    return rowToTask(row);
}
function getTask(id) {
    const row = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["queryOne"])('SELECT * FROM tasks WHERE id = ?', [
        id
    ]);
    return row ? rowToTask(row) : null;
}
function getTasks(options = {}) {
    let whereClause = 'WHERE 1=1';
    const params = [];
    if (options.type) {
        whereClause += ' AND type = ?';
        params.push(options.type);
    }
    if (options.status) {
        whereClause += ' AND status = ?';
        params.push(options.status);
    }
    const countRow = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["queryOne"])(`SELECT COUNT(*) as count FROM tasks ${whereClause}`, params);
    const total = countRow?.count || 0;
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`SELECT * FROM tasks ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [
        ...params,
        limit,
        offset
    ]);
    return {
        tasks: rows.map(rowToTask),
        total
    };
}
function getRecentTasks(limit = 10) {
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?', [
        limit
    ]);
    return rows.map(rowToTask);
}
function getRunningTasks() {
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])("SELECT * FROM tasks WHERE status = 'running' ORDER BY created_at DESC", []);
    return rows.map(rowToTask);
}
function updateTaskProgress(id, progress, total) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])('UPDATE tasks SET progress = ?, total = ? WHERE id = ?', [
        progress,
        total,
        id
    ]);
}
function startTask(id) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])("UPDATE tasks SET status = 'running' WHERE id = ?", [
        id
    ]);
}
function completeTask(id, result) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])("UPDATE tasks SET status = 'completed', result = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?", [
        JSON.stringify(result),
        id
    ]);
    runningTasks.delete(id);
}
function failTask(id, error) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])("UPDATE tasks SET status = 'failed', error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?", [
        error,
        id
    ]);
    runningTasks.delete(id);
}
function cancelTask(id) {
    const running = runningTasks.get(id);
    if (running) {
        running.cancel();
        runningTasks.delete(id);
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])("UPDATE tasks SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('pending', 'running')", [
        id
    ]);
    return true;
}
function cleanupOldTasks(olderThanDays = 7) {
    const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])("DELETE FROM tasks WHERE status IN ('completed', 'failed', 'cancelled') AND created_at < datetime('now', ?)", [
        `-${olderThanDays} days`
    ]);
    return result.rowCount;
}
async function runTask(taskId) {
    const task = getTask(taskId);
    if (!task) {
        log.error('Task not found', {
            taskId
        });
        throw new Error(`Task ${taskId} not found`);
    }
    const handler = taskHandlers.get(task.type);
    if (!handler) {
        log.error('No handler for task type', {
            taskId,
            type: task.type
        });
        failTask(taskId, `No handler registered for task type: ${task.type}`);
        return;
    }
    log.info('Starting task', {
        taskId,
        type: task.type
    });
    // Create abort controller for cancellation
    const abortController = new AbortController();
    runningTasks.set(taskId, {
        cancel: ()=>abortController.abort()
    });
    startTask(taskId);
    try {
        const result = await handler(taskId, (current, total)=>updateTaskProgress(taskId, current, total), abortController.signal);
        log.info('Task completed', {
            taskId,
            type: task.type
        });
        completeTask(taskId, result);
    } catch (error) {
        if (abortController.signal.aborted) {
            log.info('Task cancelled', {
                taskId
            });
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])("UPDATE tasks SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ?", [
                taskId
            ]);
        } else {
            const message = error instanceof Error ? error.message : 'Unknown error';
            log.error('Task failed', {
                taskId,
                type: task.type,
                error: message
            });
            failTask(taskId, message);
        }
    }
}
function enqueueTask(type, initialData) {
    const task = createTask(type, initialData);
    // Run in background (don't await)
    runTask(task.id).catch((err)=>{
        console.error(`Task ${task.id} failed:`, err);
    });
    return task;
}
function getTaskStats() {
    const stats = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["queryOne"])(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
      COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0) as running,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed
    FROM tasks
  `, []);
    return stats || {
        total: 0,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0
    };
}
const __TURBOPACK__default__export__ = {
    registerTaskHandler,
    createTask,
    getTask,
    getTasks,
    getRecentTasks,
    getRunningTasks,
    updateTaskProgress,
    startTask,
    completeTask,
    failTask,
    cancelTask,
    cleanupOldTasks,
    runTask,
    enqueueTask,
    getTaskStats
};
}),
"[project]/app/page.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardPage,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$library$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/library/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/queue/index.ts [app-rsc] (ecmascript)");
;
;
;
;
const dynamic = 'force-dynamic';
async function getStats() {
    const libraries = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$library$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAllLibraries"])();
    let totalBooks = 0;
    for (const lib of libraries){
        totalBooks += await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$library$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getLibraryBookCount"])(lib.id);
    }
    const taskStats = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getTaskStats"])();
    const recentTasks = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getRecentTasks"])(5);
    return {
        libraryCount: libraries.length,
        bookCount: totalBooks,
        taskStats,
        recentTasks
    };
}
async function DashboardPage() {
    const stats = await getStats();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-6",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                    className: "text-2xl font-bold text-white",
                    children: "Dashboard"
                }, void 0, false, {
                    fileName: "[project]/app/page.tsx",
                    lineNumber: 32,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/page.tsx",
                lineNumber: 31,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                        href: "/libraries",
                        className: "bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 hover:border-shelvarr-primary transition-colors",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-shelvarr-text-muted text-sm",
                                children: "Libraries"
                            }, void 0, false, {
                                fileName: "[project]/app/page.tsx",
                                lineNumber: 41,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-3xl font-bold text-white mt-1",
                                children: stats.libraryCount
                            }, void 0, false, {
                                fileName: "[project]/app/page.tsx",
                                lineNumber: 42,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/page.tsx",
                        lineNumber: 37,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                        href: "/books",
                        className: "bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 hover:border-shelvarr-primary transition-colors",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-shelvarr-text-muted text-sm",
                                children: "Books"
                            }, void 0, false, {
                                fileName: "[project]/app/page.tsx",
                                lineNumber: 49,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-3xl font-bold text-white mt-1",
                                children: stats.bookCount
                            }, void 0, false, {
                                fileName: "[project]/app/page.tsx",
                                lineNumber: 50,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/page.tsx",
                        lineNumber: 45,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                        href: "/tasks",
                        className: "bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4 hover:border-shelvarr-primary transition-colors",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-shelvarr-text-muted text-sm",
                                children: "Running Tasks"
                            }, void 0, false, {
                                fileName: "[project]/app/page.tsx",
                                lineNumber: 57,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-3xl font-bold text-white mt-1",
                                children: stats.taskStats.running
                            }, void 0, false, {
                                fileName: "[project]/app/page.tsx",
                                lineNumber: 58,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/page.tsx",
                        lineNumber: 53,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-shelvarr-text-muted text-sm",
                                children: "Completed Tasks"
                            }, void 0, false, {
                                fileName: "[project]/app/page.tsx",
                                lineNumber: 62,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-3xl font-bold text-white mt-1",
                                children: stats.taskStats.completed
                            }, void 0, false, {
                                fileName: "[project]/app/page.tsx",
                                lineNumber: 63,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/page.tsx",
                        lineNumber: 61,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/page.tsx",
                lineNumber: 36,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-lg font-semibold text-white mb-4",
                        children: "Quick Actions"
                    }, void 0, false, {
                        fileName: "[project]/app/page.tsx",
                        lineNumber: 69,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-wrap gap-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                                href: "/libraries",
                                className: "bg-shelvarr-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors",
                                children: "Add Library"
                            }, void 0, false, {
                                fileName: "[project]/app/page.tsx",
                                lineNumber: 71,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                                href: "/books",
                                className: "bg-shelvarr-surface hover:bg-shelvarr-border text-shelvarr-text border border-shelvarr-border px-4 py-2 rounded-lg font-medium transition-colors",
                                children: "Browse Books"
                            }, void 0, false, {
                                fileName: "[project]/app/page.tsx",
                                lineNumber: 77,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/page.tsx",
                        lineNumber: 70,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/page.tsx",
                lineNumber: 68,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "bg-shelvarr-surface border border-shelvarr-border rounded-lg p-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-between mb-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                className: "text-lg font-semibold text-white",
                                children: "Recent Activity"
                            }, void 0, false, {
                                fileName: "[project]/app/page.tsx",
                                lineNumber: 89,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                                href: "/tasks",
                                className: "text-sm text-shelvarr-primary hover:underline",
                                children: "View All"
                            }, void 0, false, {
                                fileName: "[project]/app/page.tsx",
                                lineNumber: 90,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/page.tsx",
                        lineNumber: 88,
                        columnNumber: 9
                    }, this),
                    stats.recentTasks.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-shelvarr-text-muted",
                        children: "No recent activity"
                    }, void 0, false, {
                        fileName: "[project]/app/page.tsx",
                        lineNumber: 96,
                        columnNumber: 11
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-2",
                        children: stats.recentTasks.map((task)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center justify-between py-2 border-b border-shelvarr-border last:border-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-white",
                                                children: task.type
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.tsx",
                                                lineNumber: 105,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-shelvarr-text-muted ml-2 text-sm",
                                                children: task.status
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.tsx",
                                                lineNumber: 106,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.tsx",
                                        lineNumber: 104,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-shelvarr-text-muted text-sm",
                                        children: new Date(task.createdAt).toLocaleString()
                                    }, void 0, false, {
                                        fileName: "[project]/app/page.tsx",
                                        lineNumber: 110,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, task.id, true, {
                                fileName: "[project]/app/page.tsx",
                                lineNumber: 100,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/app/page.tsx",
                        lineNumber: 98,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/page.tsx",
                lineNumber: 87,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/page.tsx",
        lineNumber: 30,
        columnNumber: 5
    }, this);
}
}),
"[project]/app/page.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/app/page.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__222b039b._.js.map
module.exports = [
"[externals]/fs [external] (fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("fs", () => require("fs"));

module.exports = mod;
}),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

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
    "closeDatabase",
    ()=>closeDatabase,
    "default",
    ()=>__TURBOPACK__default__export__,
    "execute",
    ()=>execute,
    "getAllSettings",
    ()=>getAllSettings,
    "getDb",
    ()=>getDb,
    "getPool",
    ()=>getPool,
    "getSetting",
    ()=>getSetting,
    "initDatabase",
    ()=>initDatabase,
    "initDatabaseAsync",
    ()=>initDatabaseAsync,
    "insertReturning",
    ()=>insertReturning,
    "query",
    ()=>query,
    "queryOne",
    ()=>queryOne,
    "setSetting",
    ()=>setSetting
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
    getAllSettings
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
"[project]/lib/services/scanner/index.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "deleteBook",
    ()=>deleteBook,
    "getBookById",
    ()=>getBookById,
    "getBooks",
    ()=>getBooks,
    "scanLibrary",
    ()=>scanLibrary,
    "updateBook",
    ()=>updateBook
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/crypto [external] (crypto, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$library$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/library/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/config/index.ts [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
function rowToBook(row) {
    return {
        id: row.id,
        libraryId: row.library_id,
        filePath: row.file_path,
        fileHash: row.file_hash,
        fileSize: row.file_size ? Number(row.file_size) : null,
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
function parseFilename(filePath) {
    const filename = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["basename"])(filePath, (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["extname"])(filePath));
    // Common patterns:
    // "Author - Title"
    // "Title - Author"
    // "Author - Series #1 - Title"
    // Just "Title"
    const dashParts = filename.split(' - ').map((s)=>s.trim()).filter(Boolean);
    if (dashParts.length >= 2) {
        // Assume first part is author if it looks like a name (short, no numbers)
        const first = dashParts[0] ?? '';
        const last = dashParts[dashParts.length - 1] ?? '';
        const isLikelyAuthor = first.length < 50 && !/\d/.test(first);
        if (isLikelyAuthor && first) {
            return {
                authors: [
                    first
                ],
                title: dashParts.slice(1).join(' - ')
            };
        }
        // Otherwise treat last part as author
        if (last) {
            return {
                title: dashParts.slice(0, -1).join(' - '),
                authors: [
                    last
                ]
            };
        }
    }
    // Just use filename as title
    return {
        title: filename,
        authors: []
    };
}
function computeFileHash(filePath, sampleSize = 64 * 1024) {
    // Read first 64KB for quick hash (full hash would be slow for large files)
    const buffer = Buffer.alloc(sampleSize);
    const fd = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["readFileSync"])(filePath);
    const bytesToRead = Math.min(sampleSize, fd.length);
    fd.copy(buffer, 0, 0, bytesToRead);
    return (0, __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["createHash"])('md5').update(buffer.subarray(0, bytesToRead)).digest('hex');
}
function findBookFiles(dir, extensions) {
    const files = [];
    function walk(currentDir) {
        try {
            const entries = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["readdirSync"])(currentDir, {
                withFileTypes: true
            });
            for (const entry of entries){
                const fullPath = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["join"])(currentDir, entry.name);
                // Skip hidden files/directories
                if (entry.name.startsWith('.')) continue;
                if (entry.isDirectory()) {
                    walk(fullPath);
                } else if (entry.isFile()) {
                    const ext = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["extname"])(entry.name).toLowerCase();
                    if (extensions.includes(ext)) {
                        files.push(fullPath);
                    }
                }
            }
        } catch  {
            // Skip directories we can't read
            console.warn(`Cannot read directory: ${currentDir}`);
        }
    }
    walk(dir);
    return files;
}
async function scanLibrary(libraryId, onProgress) {
    const library = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$library$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getLibraryById"])(libraryId);
    if (!library) {
        return {
            success: false,
            libraryId,
            added: 0,
            updated: 0,
            removed: 0,
            total: 0,
            errors: [
                'Library not found'
            ]
        };
    }
    const result = {
        success: true,
        libraryId,
        added: 0,
        updated: 0,
        removed: 0,
        total: 0,
        errors: []
    };
    // Find all book files
    onProgress?.({
        phase: 'scanning',
        current: 0,
        total: 0
    });
    const files = findBookFiles(library.path, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$config$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].supportedExtensions);
    result.total = files.length;
    // Get existing books for this library
    const existingBooks = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])('SELECT id, file_path FROM books WHERE library_id = ?', [
        libraryId
    ]);
    const existingPaths = new Set(existingBooks.map((b)=>b.file_path));
    const foundPaths = new Set(files);
    // Process files
    for(let i = 0; i < files.length; i++){
        const filePath = files[i];
        if (!filePath) continue;
        onProgress?.({
            phase: 'processing',
            current: i + 1,
            total: files.length,
            currentFile: filePath
        });
        try {
            const stats = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["statSync"])(filePath);
            const fileSize = stats.size;
            const fileHash = computeFileHash(filePath);
            if (existingPaths.has(filePath)) {
                // Update existing book
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])('UPDATE books SET file_size = ?, file_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE file_path = ?', [
                    fileSize,
                    fileHash,
                    filePath
                ]);
                result.updated++;
            } else {
                // Add new book
                const parsed = parseFilename(filePath);
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])('INSERT INTO books (library_id, file_path, file_size, file_hash, title, authors) VALUES (?, ?, ?, ?, ?, ?)', [
                    libraryId,
                    filePath,
                    fileSize,
                    fileHash,
                    parsed.title,
                    JSON.stringify(parsed.authors)
                ]);
                result.added++;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(`Error processing ${filePath}: ${message}`);
        }
    }
    // Remove books that no longer exist
    for (const book of existingBooks){
        if (!foundPaths.has(book.file_path)) {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])('DELETE FROM books WHERE id = ?', [
                book.id
            ]);
            result.removed++;
        }
    }
    onProgress?.({
        phase: 'complete',
        current: files.length,
        total: files.length
    });
    return result;
}
async function getBooks(queryParams = {}) {
    const page = Math.max(1, queryParams.page || 1);
    const pageSize = Math.min(100, Math.max(1, queryParams.pageSize || 20));
    const offset = (page - 1) * pageSize;
    let whereClause = 'WHERE 1=1';
    const params = [];
    if (queryParams.libraryId) {
        whereClause += ' AND library_id = ?';
        params.push(queryParams.libraryId);
    }
    if (queryParams.search) {
        whereClause += ' AND (title LIKE ? OR authors LIKE ? OR file_path LIKE ?)';
        const searchTerm = `%${queryParams.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }
    // Get total count
    const countRow = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["queryOne"])(`SELECT COUNT(*) as count FROM books ${whereClause}`, params);
    const total = countRow?.count || 0;
    const totalPages = Math.ceil(total / pageSize);
    // Get paginated results
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["query"])(`SELECT * FROM books ${whereClause} ORDER BY COALESCE(title, file_path) LIMIT ? OFFSET ?`, [
        ...params,
        pageSize,
        offset
    ]);
    return {
        books: rows.map(rowToBook),
        total,
        page,
        pageSize,
        totalPages
    };
}
async function getBookById(id) {
    const row = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["queryOne"])('SELECT * FROM books WHERE id = ?', [
        id
    ]);
    return row ? rowToBook(row) : null;
}
async function updateBook(id, updates) {
    const existing = await getBookById(id);
    if (!existing) {
        return {
            success: false,
            error: 'Book not found'
        };
    }
    const fields = [];
    const values = [];
    if (updates.title !== undefined) {
        fields.push('title = ?');
        values.push(updates.title);
    }
    if (updates.authors !== undefined) {
        fields.push('authors = ?');
        values.push(updates.authors);
    }
    if (updates.series !== undefined) {
        fields.push('series = ?');
        values.push(updates.series);
    }
    if (updates.seriesName !== undefined) {
        fields.push('series_name = ?');
        values.push(updates.seriesName);
    }
    if (updates.seriesNumber !== undefined) {
        fields.push('series_number = ?');
        values.push(updates.seriesNumber);
    }
    if (updates.isbn !== undefined) {
        fields.push('isbn = ?');
        values.push(updates.isbn);
    }
    if (updates.publisher !== undefined) {
        fields.push('publisher = ?');
        values.push(updates.publisher);
    }
    if (updates.publishDate !== undefined) {
        fields.push('publish_date = ?');
        values.push(updates.publishDate);
    }
    if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
    }
    if (updates.coverUrl !== undefined) {
        fields.push('cover_url = ?');
        values.push(updates.coverUrl);
    }
    if (updates.metadataSource !== undefined) {
        fields.push('metadata_source = ?');
        values.push(updates.metadataSource);
    }
    if (updates.metadataId !== undefined) {
        fields.push('metadata_id = ?');
        values.push(updates.metadataId);
    }
    if (fields.length === 0) {
        return {
            success: true,
            book: existing
        };
    }
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    try {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])(`UPDATE books SET ${fields.join(', ')} WHERE id = ?`, values);
        const book = await getBookById(id);
        return {
            success: true,
            book: book
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            error: message
        };
    }
}
async function deleteBook(id) {
    const existing = await getBookById(id);
    if (!existing) {
        return {
            success: false,
            error: 'Book not found'
        };
    }
    try {
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["execute"])('DELETE FROM books WHERE id = ?', [
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
"[project]/lib/actions/books.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"403ca0478082364d2db4eb11f26293f95614756cb4":"getBooks","40603ff412383a187c5d4a6b1461085f929dc5c541":"deleteBook","408c8cbe1510f07a17f3c38dd064a81d0748d188ee":"searchMetadata","40ccc4370f07f21135827370266484e80cfbe4c279":"getBook","60278ca28cbe3516018df73677f68b502c6f024c13":"updateBook","70864a645cd7d8205632fdfbaa18f2af3d8eefc278":"applyMetadata"},"",""] */ __turbopack_context__.s([
    "applyMetadata",
    ()=>applyMetadata,
    "deleteBook",
    ()=>deleteBook,
    "getBook",
    ()=>getBook,
    "getBooks",
    ()=>getBooks,
    "searchMetadata",
    ()=>searchMetadata,
    "updateBook",
    ()=>updateBook
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/cache.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$scanner$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/scanner/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/services/metadata/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/authors.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
;
;
;
async function getBooks(params = {}) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$scanner$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getBooks"])({
        page: params.page || 1,
        pageSize: params.pageSize || 24,
        libraryId: params.libraryId,
        search: params.search
    });
}
async function getBook(id) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$scanner$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getBookById"])(id);
}
async function updateBook(id, data) {
    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$scanner$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateBook"])(id, data);
    if (result.success) {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/books');
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])(`/books/${id}`);
    }
    return result;
}
async function deleteBook(id) {
    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$scanner$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["deleteBook"])(id);
    if (result.success) {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/books');
    }
    return result;
}
/**
 * Apply metadata to a book and process authors
 */ async function applyMetadataToBook(bookId, metadata) {
    // Extract primary series (first in the array) for backwards compatibility
    const primarySeries = metadata.series?.[0];
    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$scanner$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateBook"])(bookId, {
        title: metadata.title,
        authors: JSON.stringify(metadata.authors.split(', ')),
        publisher: metadata.publisher,
        publishDate: metadata.publishDate,
        description: metadata.description,
        isbn: metadata.isbn,
        coverUrl: metadata.coverUrl,
        series: metadata.series ? JSON.stringify(metadata.series) : null,
        seriesName: primarySeries?.[0] ?? null,
        seriesNumber: primarySeries?.[1] ?? null,
        metadataSource: metadata.source,
        metadataId: metadata.sourceId
    });
    if (result.success) {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/books');
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])(`/books/${bookId}`);
        // Process authors in background
        processAuthors(metadata.authors).catch(()=>{});
    }
    return result;
}
/**
 * Create author records and fetch bibliography for new authors
 */ async function processAuthors(authorsString) {
    for (const name of authorsString.split(', ').filter((a)=>a.trim())){
        const existing = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAuthorByName"])(name);
        if (!existing?.lastSynced) {
            const author = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getOrCreateAuthor"])(name);
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["fetchAuthorMetadata"])(author.id).catch(()=>{});
        }
    }
}
/**
 * Score results for relevance to search query
 */ function scoreResult(result, query) {
    let score = 0;
    const q = query.toLowerCase();
    const t = result.title.toLowerCase();
    // Title match scoring
    if (t === q) score += 50;
    else if (t.startsWith(q) || q.startsWith(t)) score += 40;
    else if (t.includes(q) || q.includes(t)) score += 30;
    else {
        const qWords = q.split(/\s+/).filter((w)=>w.length > 2);
        const tWords = t.split(/\s+/).filter((w)=>w.length > 2);
        const matches = qWords.filter((qw)=>tWords.some((tw)=>tw.includes(qw) || qw.includes(tw)));
        if (qWords.length) score += Math.min(25, matches.length / qWords.length * 25);
    }
    // Completeness scoring
    if (result.coverUrl) score += 10;
    if (result.description?.length && result.description.length > 50) score += 10;
    if (result.series?.length) score += 8;
    if (result.authors && result.authors !== 'Unknown') score += 5;
    if (result.publisher) score += 2;
    if (result.publishDate) score += 2;
    if (result.isbn) score += 2;
    return score;
}
async function searchMetadata(query) {
    const results = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["searchBooks"](query, {
        maxResults: 15
    });
    // Sort by relevance
    return results.map((r)=>({
            result: r,
            score: scoreResult(r, query)
        })).sort((a, b)=>b.score - a.score).map((sr)=>sr.result);
}
async function applyMetadata(bookId, source, sourceId) {
    // Fetch full details (should already be complete, but ensures freshness)
    const metadata = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getBookBySourceId"](source, sourceId);
    if (!metadata) {
        return {
            success: false,
            error: 'Metadata not found'
        };
    }
    return applyMetadataToBook(bookId, metadata);
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    getBooks,
    getBook,
    updateBook,
    deleteBook,
    searchMetadata,
    applyMetadata
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getBooks, "403ca0478082364d2db4eb11f26293f95614756cb4", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getBook, "40ccc4370f07f21135827370266484e80cfbe4c279", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(updateBook, "60278ca28cbe3516018df73677f68b502c6f024c13", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(deleteBook, "40603ff412383a187c5d4a6b1461085f929dc5c541", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(searchMetadata, "408c8cbe1510f07a17f3c38dd064a81d0748d188ee", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(applyMetadata, "70864a645cd7d8205632fdfbaa18f2af3d8eefc278", null);
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
"[project]/lib/actions/libraries.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"00e2b6d0431db28f3bf2c7ee6e0748ebafbbc5bf19":"getLibraries","401388761bafecab0b84dc64ca6a5000de08832c52":"scanLibrary","405d5bea904b32833eba008858e011e584386ee1eb":"deleteLibrary","40755c92df6b3491ed86a7566c49a2571390378974":"createLibrary","60f4f8c0941f81843e2c6e702642f08b03cabf9f01":"fetchLibraryMetadata"},"",""] */ __turbopack_context__.s([
    "createLibrary",
    ()=>createLibrary,
    "deleteLibrary",
    ()=>deleteLibrary,
    "fetchLibraryMetadata",
    ()=>fetchLibraryMetadata,
    "getLibraries",
    ()=>getLibraries,
    "scanLibrary",
    ()=>scanLibrary
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/cache.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$library$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/library/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$scanner$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/scanner/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/services/queue/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/lib/services/metadata/index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
;
;
;
;
async function getLibraries() {
    const libraries = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$library$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAllLibraries"])();
    return Promise.all(libraries.map(async (lib)=>({
            ...lib,
            bookCount: await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$library$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getLibraryBookCount"])(lib.id)
        })));
}
/**
 * Apply metadata from a search result to a book
 */ function applyMetadataToBook(bookId, metadata) {
    // Extract primary series (first in the array) for backwards compatibility
    const primarySeries = metadata.series?.[0];
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$scanner$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateBook"])(bookId, {
        title: metadata.title,
        authors: JSON.stringify(metadata.authors.split(', ')),
        publisher: metadata.publisher,
        publishDate: metadata.publishDate,
        description: metadata.description,
        isbn: metadata.isbn,
        coverUrl: metadata.coverUrl,
        series: metadata.series ? JSON.stringify(metadata.series) : null,
        seriesName: primarySeries?.[0] ?? null,
        seriesNumber: primarySeries?.[1] ?? null,
        metadataSource: metadata.source,
        metadataId: metadata.sourceId
    });
}
/**
 * Fetch and apply metadata for books in a library
 */ async function fetchMetadataForLibrary(libraryId, unmatchedOnly, taskId) {
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["startTask"])(taskId);
    const { books } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$scanner$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getBooks"])({
        libraryId,
        pageSize: 10000
    });
    let processed = 0;
    let matched = 0;
    for (const book of books){
        // Skip if already matched (when unmatchedOnly)
        if (unmatchedOnly && book.metadataSource) continue;
        // Skip books without a title
        if (!book.title) continue;
        try {
            const author = book.authors ? JSON.parse(book.authors)[0] : undefined;
            const metadata = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["autoMatch"](book.title, author, book.isbn || undefined);
            if (metadata) {
                await applyMetadataToBook(book.id, metadata);
                matched++;
            }
        } catch  {
        // Continue on individual failures
        }
        processed++;
    }
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["completeTask"])(taskId, {
        processed,
        matched
    });
    return {
        processed,
        matched
    };
}
async function createLibrary(formData) {
    const name = formData.get('name');
    const path = formData.get('path');
    if (!name || !path) {
        return {
            error: 'Name and path are required'
        };
    }
    try {
        const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$library$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createLibrary"])({
            name,
            path
        });
        if (!result.success) {
            return {
                error: result.error || 'Failed to create library'
            };
        }
        if (result.library) {
            const libraryId = result.library.id;
            // Run scan + metadata fetch in background
            (async ()=>{
                const scanTask = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createTask"])('scan', {
                    libraryId,
                    libraryName: name
                });
                try {
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["startTask"])(scanTask.id);
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$scanner$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["scanLibrary"])(libraryId);
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["completeTask"])(scanTask.id, {
                        booksScanned: true
                    });
                    // After scan, fetch metadata for all books
                    const metaTask = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createTask"])('metadata', {
                        libraryId,
                        libraryName: name,
                        unmatchedOnly: true
                    });
                    await fetchMetadataForLibrary(libraryId, true, metaTask.id);
                } catch (error) {
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["failTask"])(scanTask.id, error instanceof Error ? error.message : 'Failed');
                }
            })();
        }
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/libraries');
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/');
        return {
            success: true,
            library: result.library
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : 'Failed to create library'
        };
    }
}
async function deleteLibrary(id) {
    try {
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$library$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["deleteLibrary"])(id);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/libraries');
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/');
        return {
            success: true
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : 'Failed to delete library'
        };
    }
}
async function scanLibrary(id) {
    const library = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$library$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getLibraryById"])(id);
    if (!library) {
        return {
            error: 'Library not found'
        };
    }
    const task = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createTask"])('scan', {
        libraryId: id,
        libraryName: library.name
    });
    (async ()=>{
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["startTask"])(task.id);
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$scanner$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["scanLibrary"])(id);
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["completeTask"])(task.id, {
                booksScanned: true
            });
        } catch (error) {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["failTask"])(task.id, error instanceof Error ? error.message : 'Scan failed');
        }
    })();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/libraries');
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/books');
    return {
        success: true,
        taskId: task.id
    };
}
async function fetchLibraryMetadata(id, unmatchedOnly = true) {
    const library = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$library$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getLibraryById"])(id);
    if (!library) {
        return {
            error: 'Library not found'
        };
    }
    const task = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createTask"])('metadata', {
        libraryId: id,
        libraryName: library.name,
        unmatchedOnly
    });
    (async ()=>{
        try {
            await fetchMetadataForLibrary(id, unmatchedOnly, task.id);
        } catch (error) {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$queue$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["failTask"])(task.id, error instanceof Error ? error.message : 'Metadata fetch failed');
        }
    })();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/libraries');
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/books');
    return {
        success: true,
        taskId: task.id
    };
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    getLibraries,
    createLibrary,
    deleteLibrary,
    scanLibrary,
    fetchLibraryMetadata
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getLibraries, "00e2b6d0431db28f3bf2c7ee6e0748ebafbbc5bf19", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(createLibrary, "40755c92df6b3491ed86a7566c49a2571390378974", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(deleteLibrary, "405d5bea904b32833eba008858e011e584386ee1eb", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(scanLibrary, "401388761bafecab0b84dc64ca6a5000de08832c52", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(fetchLibraryMetadata, "60f4f8c0941f81843e2c6e702642f08b03cabf9f01", null);
}),
"[project]/.next-internal/server/app/books/page/actions.js { ACTIONS_MODULE0 => \"[project]/lib/actions/books.ts [app-rsc] (ecmascript)\", ACTIONS_MODULE1 => \"[project]/lib/actions/libraries.ts [app-rsc] (ecmascript)\", ACTIONS_MODULE2 => \"[project]/lib/actions/authors.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$books$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/books.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$libraries$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/libraries.ts [app-rsc] (ecmascript)");
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
"[project]/.next-internal/server/app/books/page/actions.js { ACTIONS_MODULE0 => \"[project]/lib/actions/books.ts [app-rsc] (ecmascript)\", ACTIONS_MODULE1 => \"[project]/lib/actions/libraries.ts [app-rsc] (ecmascript)\", ACTIONS_MODULE2 => \"[project]/lib/actions/authors.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "00e2b6d0431db28f3bf2c7ee6e0748ebafbbc5bf19",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$libraries$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getLibraries"],
    "4007546e5b4f659ed3138a8471b80e3eb545df11b6",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getOrCreateAuthor"],
    "401388761bafecab0b84dc64ca6a5000de08832c52",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$libraries$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["scanLibrary"],
    "4038a13fe5f1311bfe02437b83b2d283aaadbc7389",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["toggleWorkWanted"],
    "403ca0478082364d2db4eb11f26293f95614756cb4",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$books$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getBooks"],
    "405173413693034ab29e7647dd06c98e1d8579c489",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAuthorsFromBooks"],
    "40576a09ceddb019238846935bd9f51f7b0c4e6b58",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["refreshAuthorOwnership"],
    "405d5bea904b32833eba008858e011e584386ee1eb",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$libraries$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["deleteLibrary"],
    "40603ff412383a187c5d4a6b1461085f929dc5c541",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$books$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["deleteBook"],
    "40702c7b484795658a92b15155e1fe46c8a5d98ed6",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAuthor"],
    "40755c92df6b3491ed86a7566c49a2571390378974",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$libraries$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createLibrary"],
    "408c8cbe1510f07a17f3c38dd064a81d0748d188ee",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$books$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["searchMetadata"],
    "40a960b6b496e3d7ccc5520e8d0f9290b73886dd93",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getOwnedBooksByAuthor"],
    "40b87b0ae7032d43b9956d3e102a0a9814097b28e6",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAuthorByName"],
    "40c38bc40e0d51b3fd2dd38968ddc60a98b3cbc0d1",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["fetchAuthorMetadata"],
    "40ccc4370f07f21135827370266484e80cfbe4c279",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$books$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getBook"],
    "40ddc6de0d26573f24176c7ac69cbaadf23c24fb23",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAuthorWorks"],
    "60278ca28cbe3516018df73677f68b502c6f024c13",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$books$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["updateBook"],
    "60f4f8c0941f81843e2c6e702642f08b03cabf9f01",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$libraries$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["fetchLibraryMetadata"],
    "70864a645cd7d8205632fdfbaa18f2af3d8eefc278",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$books$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["applyMetadata"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f2e$next$2d$internal$2f$server$2f$app$2f$books$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$lib$2f$actions$2f$books$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29222c$__ACTIONS_MODULE1__$3d3e$__$225b$project$5d2f$lib$2f$actions$2f$libraries$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29222c$__ACTIONS_MODULE2__$3d3e$__$225b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/.next-internal/server/app/books/page/actions.js { ACTIONS_MODULE0 => "[project]/lib/actions/books.ts [app-rsc] (ecmascript)", ACTIONS_MODULE1 => "[project]/lib/actions/libraries.ts [app-rsc] (ecmascript)", ACTIONS_MODULE2 => "[project]/lib/actions/authors.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$books$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/books.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$libraries$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/libraries.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$authors$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/authors.ts [app-rsc] (ecmascript)");
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__ee37bce1._.js.map
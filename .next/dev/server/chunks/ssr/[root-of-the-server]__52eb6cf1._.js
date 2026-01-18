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
"[project]/lib/actions/settings.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"0082a5b33e6c8774b86d9226c05cd4bb786971eba9":"testKomgaConnection","0085749176169a3cc71aca78ca729ca4e1400befd6":"getSettings","008ab097d10a354e8ee7f13230519a020c2e46d88a":"getKomgaSettings","00f1d5679f564daf73ecca1f08bf39eb71a1850377":"getSourcesStatus","40a122d8ba483f79197ecdcf57c7219b320f5dcc9f":"getApiKey","40c277ee077d87994b7d5d878bf6e006d750de00a8":"testSourceConnection","6022e473293d939a8bc1098fe83d03e38bbfaf5d4f":"setApiKey","6058ff93cd3c2b061b6b4a62c06d30774d83c20438":"toggleSource","70d80204694692279cc3415ba48df961ff167b8f7c":"setKomgaSettings"},"",""] */ __turbopack_context__.s([
    "getApiKey",
    ()=>getApiKey,
    "getKomgaSettings",
    ()=>getKomgaSettings,
    "getSettings",
    ()=>getSettings,
    "getSourcesStatus",
    ()=>getSourcesStatus,
    "setApiKey",
    ()=>setApiKey,
    "setKomgaSettings",
    ()=>setKomgaSettings,
    "testKomgaConnection",
    ()=>testKomgaConnection,
    "testSourceConnection",
    ()=>testSourceConnection,
    "toggleSource",
    ()=>toggleSource
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
async function getSettings() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAllSettings"])();
}
async function getSourcesStatus() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getAllSourcesStatus"])();
}
async function toggleSource(source, enabled) {
    const currentSettings = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSetting"])('metadata_sources', {}) || {};
    currentSettings[source] = {
        enabled
    };
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["setSetting"])('metadata_sources', currentSettings);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/settings');
    return {
        success: true
    };
}
async function setApiKey(source, apiKey) {
    const key = `${source}_api_key`;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["setSetting"])(key, apiKey);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/settings');
    return {
        success: true
    };
}
async function getApiKey(source) {
    const key = `${source}_api_key`;
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSetting"])(key, null);
}
async function testSourceConnection(source) {
    if (source !== 'hardcover') {
        return {
            success: false,
            error: 'Unknown source'
        };
    }
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$services$2f$metadata$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["isConfigured"])()) {
        return {
            success: false,
            error: 'Hardcover API key not configured'
        };
    }
    // TODO: Add actual connection test for Hardcover
    return {
        success: true
    };
}
async function getKomgaSettings() {
    return {
        url: await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSetting"])('komga_url', null),
        username: await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSetting"])('komga_username', null),
        hasPassword: !!await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSetting"])('komga_password', null)
    };
}
async function setKomgaSettings(url, username, password) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["setSetting"])('komga_url', url);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["setSetting"])('komga_username', username);
    if (password) {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["setSetting"])('komga_password', password);
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])('/settings');
    return {
        success: true
    };
}
async function testKomgaConnection() {
    const url = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSetting"])('komga_url', null);
    const username = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSetting"])('komga_username', null);
    const password = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSetting"])('komga_password', null);
    if (!url || !username || !password) {
        return {
            success: false,
            error: 'Komga settings incomplete'
        };
    }
    try {
        const response = await fetch(`${url}/api/v1/libraries`, {
            headers: {
                Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
            }
        });
        if (response.ok) {
            return {
                success: true
            };
        } else {
            return {
                success: false,
                error: `HTTP ${response.status}`
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Connection failed'
        };
    }
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    getSettings,
    getSourcesStatus,
    toggleSource,
    setApiKey,
    getApiKey,
    testSourceConnection,
    getKomgaSettings,
    setKomgaSettings,
    testKomgaConnection
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getSettings, "0085749176169a3cc71aca78ca729ca4e1400befd6", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getSourcesStatus, "00f1d5679f564daf73ecca1f08bf39eb71a1850377", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(toggleSource, "6058ff93cd3c2b061b6b4a62c06d30774d83c20438", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(setApiKey, "6022e473293d939a8bc1098fe83d03e38bbfaf5d4f", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getApiKey, "40a122d8ba483f79197ecdcf57c7219b320f5dcc9f", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(testSourceConnection, "40c277ee077d87994b7d5d878bf6e006d750de00a8", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getKomgaSettings, "008ab097d10a354e8ee7f13230519a020c2e46d88a", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(setKomgaSettings, "70d80204694692279cc3415ba48df961ff167b8f7c", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(testKomgaConnection, "0082a5b33e6c8774b86d9226c05cd4bb786971eba9", null);
}),
"[project]/.next-internal/server/app/settings/page/actions.js { ACTIONS_MODULE0 => \"[project]/lib/actions/settings.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$settings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/settings.ts [app-rsc] (ecmascript)");
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
"[project]/.next-internal/server/app/settings/page/actions.js { ACTIONS_MODULE0 => \"[project]/lib/actions/settings.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "0082a5b33e6c8774b86d9226c05cd4bb786971eba9",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$settings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["testKomgaConnection"],
    "0085749176169a3cc71aca78ca729ca4e1400befd6",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$settings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSettings"],
    "008ab097d10a354e8ee7f13230519a020c2e46d88a",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$settings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getKomgaSettings"],
    "00f1d5679f564daf73ecca1f08bf39eb71a1850377",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$settings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSourcesStatus"],
    "40a122d8ba483f79197ecdcf57c7219b320f5dcc9f",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$settings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getApiKey"],
    "40c277ee077d87994b7d5d878bf6e006d750de00a8",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$settings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["testSourceConnection"],
    "6022e473293d939a8bc1098fe83d03e38bbfaf5d4f",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$settings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["setApiKey"],
    "6058ff93cd3c2b061b6b4a62c06d30774d83c20438",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$settings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["toggleSource"],
    "70d80204694692279cc3415ba48df961ff167b8f7c",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$settings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["setKomgaSettings"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f2e$next$2d$internal$2f$server$2f$app$2f$settings$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$lib$2f$actions$2f$settings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/.next-internal/server/app/settings/page/actions.js { ACTIONS_MODULE0 => "[project]/lib/actions/settings.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$settings$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/actions/settings.ts [app-rsc] (ecmascript)");
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__52eb6cf1._.js.map
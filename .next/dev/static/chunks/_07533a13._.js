(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/lib/utils/sanitize.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "containsHtml",
    ()=>containsHtml,
    "sanitizeHtml",
    ()=>sanitizeHtml
]);
/**
 * Sanitize HTML to allow only safe tags
 */ const ALLOWED_TAGS = [
    'b',
    'i',
    'em',
    'strong',
    'br',
    'p',
    'ul',
    'ol',
    'li'
];
function sanitizeHtml(html) {
    // Replace allowed tags with placeholders
    let result = html;
    // Create a map of allowed tag patterns
    const tagPatterns = ALLOWED_TAGS.map((tag)=>({
            open: new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi'),
            close: new RegExp(`</${tag}>`, 'gi'),
            openReplace: `<${tag}>`,
            closeReplace: `</${tag}>`
        }));
    // Handle self-closing br tags
    result = result.replace(/<br\s*\/?>/gi, '\n__BR__\n');
    // Temporarily replace allowed tags
    const placeholders = [];
    let placeholderIndex = 0;
    for (const pattern of tagPatterns){
        if (pattern.openReplace === '<br>') continue; // Already handled
        result = result.replace(pattern.open, ()=>{
            const placeholder = `__TAG_OPEN_${placeholderIndex}__`;
            placeholders.push({
                placeholder,
                replacement: pattern.openReplace
            });
            placeholderIndex++;
            return placeholder;
        });
        result = result.replace(pattern.close, ()=>{
            const placeholder = `__TAG_CLOSE_${placeholderIndex}__`;
            placeholders.push({
                placeholder,
                replacement: pattern.closeReplace
            });
            placeholderIndex++;
            return placeholder;
        });
    }
    // Strip all remaining HTML tags
    result = result.replace(/<[^>]*>/g, '');
    // Restore allowed tags
    for (const { placeholder, replacement } of placeholders){
        result = result.replace(new RegExp(placeholder, 'g'), replacement);
    }
    // Restore br tags
    result = result.replace(/\n?__BR__\n?/g, '<br>');
    return result;
}
function containsHtml(text) {
    return /<[^>]+>/.test(text);
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/books/BookDetails.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BookDetails",
    ()=>BookDetails
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2f$sanitize$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/utils/sanitize.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
function BookDetails({ book, library }) {
    _s();
    const [showRawData, setShowRawData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const authors = book.authors ? JSON.parse(book.authors).join(', ') : null;
    const filename = book.filePath.split(/[/\\]/).pop() || book.filePath;
    // Parse all series from JSON
    const allSeries = book.series ? JSON.parse(book.series) : book.seriesName ? [
        [
            book.seriesName,
            book.seriesNumber
        ]
    ] : [];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "bg-shelvarr-surface border border-shelvarr-border rounded-lg p-6 space-y-6",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "text-2xl font-bold text-white",
                        children: book.title || filename.replace(/\.[^.]+$/, '')
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 28,
                        columnNumber: 9
                    }, this),
                    authors && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-lg text-shelvarr-text-muted mt-1",
                        children: authors
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 32,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 27,
                columnNumber: 7
            }, this),
            allSeries.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-wrap gap-2",
                children: allSeries.map(([name, position], i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        href: `/series/${encodeURIComponent(name)}`,
                        className: "flex items-center gap-2 text-shelvarr-primary hover:text-shelvarr-primary/80 transition-colors",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SeriesIcon, {}, void 0, false, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 44,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    name,
                                    position ? ` #${position}` : ''
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 45,
                                columnNumber: 15
                            }, this)
                        ]
                    }, i, true, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 39,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 37,
                columnNumber: 9
            }, this),
            book.description && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-sm font-semibold text-shelvarr-text-muted uppercase tracking-wide mb-2",
                        children: "Description"
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 56,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-white leading-relaxed overflow-hidden [&_br]:block [&_br]:mb-2",
                        style: {
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word'
                        },
                        dangerouslySetInnerHTML: {
                            __html: (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$utils$2f$sanitize$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["sanitizeHtml"])(book.description)
                        }
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 59,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 55,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-2 gap-4",
                children: [
                    book.publisher && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataField, {
                        label: "Publisher",
                        value: book.publisher
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 69,
                        columnNumber: 11
                    }, this),
                    book.publishDate && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataField, {
                        label: "Published",
                        value: book.publishDate
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 72,
                        columnNumber: 11
                    }, this),
                    book.isbn && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataField, {
                        label: "ISBN",
                        value: book.isbn
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 74,
                        columnNumber: 23
                    }, this),
                    library && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataField, {
                        label: "Library",
                        value: library.name
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 75,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 67,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pt-4 border-t border-shelvarr-border",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-sm font-semibold text-shelvarr-text-muted uppercase tracking-wide mb-3",
                        children: "File Information"
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 79,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-2 text-sm",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex justify-between",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-shelvarr-text-muted",
                                        children: "Filename"
                                    }, void 0, false, {
                                        fileName: "[project]/components/books/BookDetails.tsx",
                                        lineNumber: 84,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-white font-mono text-right max-w-[60%] truncate",
                                        children: filename
                                    }, void 0, false, {
                                        fileName: "[project]/components/books/BookDetails.tsx",
                                        lineNumber: 85,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 83,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex justify-between",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-shelvarr-text-muted",
                                        children: "Path"
                                    }, void 0, false, {
                                        fileName: "[project]/components/books/BookDetails.tsx",
                                        lineNumber: 90,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-white font-mono text-right max-w-[60%] truncate",
                                        title: book.filePath,
                                        children: book.filePath
                                    }, void 0, false, {
                                        fileName: "[project]/components/books/BookDetails.tsx",
                                        lineNumber: 91,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 89,
                                columnNumber: 11
                            }, this),
                            book.fileSize && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex justify-between",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-shelvarr-text-muted",
                                        children: "Size"
                                    }, void 0, false, {
                                        fileName: "[project]/components/books/BookDetails.tsx",
                                        lineNumber: 97,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-white",
                                        children: formatFileSize(book.fileSize)
                                    }, void 0, false, {
                                        fileName: "[project]/components/books/BookDetails.tsx",
                                        lineNumber: 98,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 96,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 82,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 78,
                columnNumber: 7
            }, this),
            book.metadataSource && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pt-4 border-t border-shelvarr-border",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-sm font-semibold text-shelvarr-text-muted uppercase tracking-wide mb-3",
                        children: "Metadata Source"
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 106,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "px-2 py-1 bg-green-600/20 text-green-400 text-sm rounded",
                                children: book.metadataSource
                            }, void 0, false, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 110,
                                columnNumber: 13
                            }, this),
                            book.metadataId && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-shelvarr-text-muted text-sm font-mono",
                                children: book.metadataId
                            }, void 0, false, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 114,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 109,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 105,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pt-4 border-t border-shelvarr-border",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setShowRawData(!showRawData),
                        className: "flex items-center gap-2 text-sm text-shelvarr-text-muted hover:text-white transition-colors",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ChevronIcon, {
                                expanded: showRawData
                            }, void 0, false, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 127,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "Raw Data"
                            }, void 0, false, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 128,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 123,
                        columnNumber: 9
                    }, this),
                    showRawData && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                        className: "mt-3 p-3 bg-shelvarr-bg rounded-lg text-xs text-shelvarr-text overflow-x-auto whitespace-pre-wrap break-words",
                        children: JSON.stringify(book, null, 2)
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 131,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 122,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/books/BookDetails.tsx",
        lineNumber: 26,
        columnNumber: 5
    }, this);
}
_s(BookDetails, "QYy8T2vIH+T6vKyNdFi0v/JWZwU=");
_c = BookDetails;
function MetadataField({ label, value }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("dt", {
                className: "text-xs text-shelvarr-text-muted uppercase tracking-wide",
                children: label
            }, void 0, false, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 143,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("dd", {
                className: "text-white mt-0.5",
                children: value
            }, void 0, false, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 146,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/books/BookDetails.tsx",
        lineNumber: 142,
        columnNumber: 5
    }, this);
}
_c1 = MetadataField;
function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
function SeriesIcon() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        className: "w-5 h-5",
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: 2,
            d: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        }, void 0, false, {
            fileName: "[project]/components/books/BookDetails.tsx",
            lineNumber: 161,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/books/BookDetails.tsx",
        lineNumber: 160,
        columnNumber: 5
    }, this);
}
_c2 = SeriesIcon;
function ChevronIcon({ expanded }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        className: `w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`,
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: 2,
            d: "M9 5l7 7-7 7"
        }, void 0, false, {
            fileName: "[project]/components/books/BookDetails.tsx",
            lineNumber: 179,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/books/BookDetails.tsx",
        lineNumber: 173,
        columnNumber: 5
    }, this);
}
_c3 = ChevronIcon;
var _c, _c1, _c2, _c3;
__turbopack_context__.k.register(_c, "BookDetails");
__turbopack_context__.k.register(_c1, "MetadataField");
__turbopack_context__.k.register(_c2, "SeriesIcon");
__turbopack_context__.k.register(_c3, "ChevronIcon");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/actions/data:90e3a0 [app-client] (ecmascript) <text/javascript>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "deleteBook",
    ()=>$$RSC_SERVER_ACTION_3
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper.js [app-client] (ecmascript)");
/* __next_internal_action_entry_do_not_use__ [{"40603ff412383a187c5d4a6b1461085f929dc5c541":"deleteBook"},"lib/actions/books.ts",""] */ "use turbopack no side effects";
;
const $$RSC_SERVER_ACTION_3 = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createServerReference"])("40603ff412383a187c5d4a6b1461085f929dc5c541", __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["callServer"], void 0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["findSourceMapURL"], "deleteBook");
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
 //# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4vYm9va3MudHMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzZXJ2ZXInO1xuXG5pbXBvcnQgeyByZXZhbGlkYXRlUGF0aCB9IGZyb20gJ25leHQvY2FjaGUnO1xuaW1wb3J0IHtcbiAgZ2V0Qm9va3MgYXMgZ2V0Qm9va3NGcm9tRGIsXG4gIGdldEJvb2tCeUlkLFxuICB1cGRhdGVCb29rIGFzIHVwZGF0ZUJvb2tJbkRiLFxuICBkZWxldGVCb29rIGFzIGRlbGV0ZUJvb2tGcm9tRGIsXG59IGZyb20gJ0AvbGliL3NlcnZpY2VzL3NjYW5uZXInO1xuaW1wb3J0ICogYXMgbWV0YWRhdGFTZXJ2aWNlIGZyb20gJ0AvbGliL3NlcnZpY2VzL21ldGFkYXRhJztcbmltcG9ydCB7IGdldE9yQ3JlYXRlQXV0aG9yLCBmZXRjaEF1dGhvck1ldGFkYXRhLCBnZXRBdXRob3JCeU5hbWUgfSBmcm9tICdAL2xpYi9hY3Rpb25zL2F1dGhvcnMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEdldEJvb2tzUGFyYW1zIHtcbiAgcGFnZT86IG51bWJlcjtcbiAgcGFnZVNpemU/OiBudW1iZXI7XG4gIGxpYnJhcnlJZD86IG51bWJlcjtcbiAgc2VhcmNoPzogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Qm9va3MocGFyYW1zOiBHZXRCb29rc1BhcmFtcyA9IHt9KSB7XG4gIHJldHVybiBnZXRCb29rc0Zyb21EYih7XG4gICAgcGFnZTogcGFyYW1zLnBhZ2UgfHwgMSxcbiAgICBwYWdlU2l6ZTogcGFyYW1zLnBhZ2VTaXplIHx8IDI0LFxuICAgIGxpYnJhcnlJZDogcGFyYW1zLmxpYnJhcnlJZCxcbiAgICBzZWFyY2g6IHBhcmFtcy5zZWFyY2gsXG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Qm9vayhpZDogbnVtYmVyKSB7XG4gIHJldHVybiBnZXRCb29rQnlJZChpZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1cGRhdGVCb29rKGlkOiBudW1iZXIsIGRhdGE6IHtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGF1dGhvcnM/OiBzdHJpbmc7XG4gIHNlcmllcz86IHN0cmluZyB8IG51bGw7XG4gIHNlcmllc05hbWU/OiBzdHJpbmcgfCBudWxsO1xuICBzZXJpZXNOdW1iZXI/OiBudW1iZXIgfCBudWxsO1xuICBpc2JuPzogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGlzaGVyPzogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGlzaERhdGU/OiBzdHJpbmcgfCBudWxsO1xuICBkZXNjcmlwdGlvbj86IHN0cmluZyB8IG51bGw7XG4gIGNvdmVyVXJsPzogc3RyaW5nIHwgbnVsbDtcbn0pIHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdXBkYXRlQm9va0luRGIoaWQsIGRhdGEpO1xuICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICByZXZhbGlkYXRlUGF0aCgnL2Jvb2tzJyk7XG4gICAgcmV2YWxpZGF0ZVBhdGgoYC9ib29rcy8ke2lkfWApO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxldGVCb29rKGlkOiBudW1iZXIpIHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGVsZXRlQm9va0Zyb21EYihpZCk7XG4gIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgIHJldmFsaWRhdGVQYXRoKCcvYm9va3MnKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEFwcGx5IG1ldGFkYXRhIHRvIGEgYm9vayBhbmQgcHJvY2VzcyBhdXRob3JzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGFwcGx5TWV0YWRhdGFUb0Jvb2soYm9va0lkOiBudW1iZXIsIG1ldGFkYXRhOiBtZXRhZGF0YVNlcnZpY2UuQm9va01ldGFkYXRhKSB7XG4gIC8vIEV4dHJhY3QgcHJpbWFyeSBzZXJpZXMgKGZpcnN0IGluIHRoZSBhcnJheSkgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGNvbnN0IHByaW1hcnlTZXJpZXMgPSBtZXRhZGF0YS5zZXJpZXM/LlswXTtcblxuICBjb25zdCByZXN1bHQgPSBhd2FpdCB1cGRhdGVCb29rSW5EYihib29rSWQsIHtcbiAgICB0aXRsZTogbWV0YWRhdGEudGl0bGUsXG4gICAgYXV0aG9yczogSlNPTi5zdHJpbmdpZnkobWV0YWRhdGEuYXV0aG9ycy5zcGxpdCgnLCAnKSksXG4gICAgcHVibGlzaGVyOiBtZXRhZGF0YS5wdWJsaXNoZXIsXG4gICAgcHVibGlzaERhdGU6IG1ldGFkYXRhLnB1Ymxpc2hEYXRlLFxuICAgIGRlc2NyaXB0aW9uOiBtZXRhZGF0YS5kZXNjcmlwdGlvbixcbiAgICBpc2JuOiBtZXRhZGF0YS5pc2JuLFxuICAgIGNvdmVyVXJsOiBtZXRhZGF0YS5jb3ZlclVybCxcbiAgICBzZXJpZXM6IG1ldGFkYXRhLnNlcmllcyA/IEpTT04uc3RyaW5naWZ5KG1ldGFkYXRhLnNlcmllcykgOiBudWxsLFxuICAgIHNlcmllc05hbWU6IHByaW1hcnlTZXJpZXM/LlswXSA/PyBudWxsLFxuICAgIHNlcmllc051bWJlcjogcHJpbWFyeVNlcmllcz8uWzFdID8/IG51bGwsXG4gICAgbWV0YWRhdGFTb3VyY2U6IG1ldGFkYXRhLnNvdXJjZSxcbiAgICBtZXRhZGF0YUlkOiBtZXRhZGF0YS5zb3VyY2VJZCxcbiAgfSk7XG5cbiAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgcmV2YWxpZGF0ZVBhdGgoJy9ib29rcycpO1xuICAgIHJldmFsaWRhdGVQYXRoKGAvYm9va3MvJHtib29rSWR9YCk7XG5cbiAgICAvLyBQcm9jZXNzIGF1dGhvcnMgaW4gYmFja2dyb3VuZFxuICAgIHByb2Nlc3NBdXRob3JzKG1ldGFkYXRhLmF1dGhvcnMpLmNhdGNoKCgpID0+IHt9KTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ3JlYXRlIGF1dGhvciByZWNvcmRzIGFuZCBmZXRjaCBiaWJsaW9ncmFwaHkgZm9yIG5ldyBhdXRob3JzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NBdXRob3JzKGF1dGhvcnNTdHJpbmc6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBmb3IgKGNvbnN0IG5hbWUgb2YgYXV0aG9yc1N0cmluZy5zcGxpdCgnLCAnKS5maWx0ZXIoYSA9PiBhLnRyaW0oKSkpIHtcbiAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IGdldEF1dGhvckJ5TmFtZShuYW1lKTtcbiAgICBpZiAoIWV4aXN0aW5nPy5sYXN0U3luY2VkKSB7XG4gICAgICBjb25zdCBhdXRob3IgPSBhd2FpdCBnZXRPckNyZWF0ZUF1dGhvcihuYW1lKTtcbiAgICAgIGZldGNoQXV0aG9yTWV0YWRhdGEoYXV0aG9yLmlkKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogU2NvcmUgcmVzdWx0cyBmb3IgcmVsZXZhbmNlIHRvIHNlYXJjaCBxdWVyeVxuICovXG5mdW5jdGlvbiBzY29yZVJlc3VsdChyZXN1bHQ6IG1ldGFkYXRhU2VydmljZS5Cb29rTWV0YWRhdGEsIHF1ZXJ5OiBzdHJpbmcpOiBudW1iZXIge1xuICBsZXQgc2NvcmUgPSAwO1xuICBjb25zdCBxID0gcXVlcnkudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgdCA9IHJlc3VsdC50aXRsZS50b0xvd2VyQ2FzZSgpO1xuXG4gIC8vIFRpdGxlIG1hdGNoIHNjb3JpbmdcbiAgaWYgKHQgPT09IHEpIHNjb3JlICs9IDUwO1xuICBlbHNlIGlmICh0LnN0YXJ0c1dpdGgocSkgfHwgcS5zdGFydHNXaXRoKHQpKSBzY29yZSArPSA0MDtcbiAgZWxzZSBpZiAodC5pbmNsdWRlcyhxKSB8fCBxLmluY2x1ZGVzKHQpKSBzY29yZSArPSAzMDtcbiAgZWxzZSB7XG4gICAgY29uc3QgcVdvcmRzID0gcS5zcGxpdCgvXFxzKy8pLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMik7XG4gICAgY29uc3QgdFdvcmRzID0gdC5zcGxpdCgvXFxzKy8pLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMik7XG4gICAgY29uc3QgbWF0Y2hlcyA9IHFXb3Jkcy5maWx0ZXIocXcgPT4gdFdvcmRzLnNvbWUodHcgPT4gdHcuaW5jbHVkZXMocXcpIHx8IHF3LmluY2x1ZGVzKHR3KSkpO1xuICAgIGlmIChxV29yZHMubGVuZ3RoKSBzY29yZSArPSBNYXRoLm1pbigyNSwgKG1hdGNoZXMubGVuZ3RoIC8gcVdvcmRzLmxlbmd0aCkgKiAyNSk7XG4gIH1cblxuICAvLyBDb21wbGV0ZW5lc3Mgc2NvcmluZ1xuICBpZiAocmVzdWx0LmNvdmVyVXJsKSBzY29yZSArPSAxMDtcbiAgaWYgKHJlc3VsdC5kZXNjcmlwdGlvbj8ubGVuZ3RoICYmIHJlc3VsdC5kZXNjcmlwdGlvbi5sZW5ndGggPiA1MCkgc2NvcmUgKz0gMTA7XG4gIGlmIChyZXN1bHQuc2VyaWVzPy5sZW5ndGgpIHNjb3JlICs9IDg7XG4gIGlmIChyZXN1bHQuYXV0aG9ycyAmJiByZXN1bHQuYXV0aG9ycyAhPT0gJ1Vua25vd24nKSBzY29yZSArPSA1O1xuICBpZiAocmVzdWx0LnB1Ymxpc2hlcikgc2NvcmUgKz0gMjtcbiAgaWYgKHJlc3VsdC5wdWJsaXNoRGF0ZSkgc2NvcmUgKz0gMjtcbiAgaWYgKHJlc3VsdC5pc2JuKSBzY29yZSArPSAyO1xuXG4gIHJldHVybiBzY29yZTtcbn1cblxuLyoqXG4gKiBTZWFyY2ggZm9yIG1ldGFkYXRhIC0gcmV0dXJucyByZXN1bHRzIHNvcnRlZCBieSByZWxldmFuY2VcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNlYXJjaE1ldGFkYXRhKHF1ZXJ5OiBzdHJpbmcpIHtcbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IG1ldGFkYXRhU2VydmljZS5zZWFyY2hCb29rcyhxdWVyeSwgeyBtYXhSZXN1bHRzOiAxNSB9KTtcblxuICAvLyBTb3J0IGJ5IHJlbGV2YW5jZVxuICByZXR1cm4gcmVzdWx0c1xuICAgIC5tYXAociA9PiAoeyByZXN1bHQ6IHIsIHNjb3JlOiBzY29yZVJlc3VsdChyLCBxdWVyeSkgfSkpXG4gICAgLnNvcnQoKGEsIGIpID0+IGIuc2NvcmUgLSBhLnNjb3JlKVxuICAgIC5tYXAoc3IgPT4gc3IucmVzdWx0KTtcbn1cblxuLyoqXG4gKiBBcHBseSBtZXRhZGF0YSBmcm9tIGEgc2VsZWN0ZWQgc2VhcmNoIHJlc3VsdCB0byBhIGJvb2tcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFwcGx5TWV0YWRhdGEoYm9va0lkOiBudW1iZXIsIHNvdXJjZTogc3RyaW5nLCBzb3VyY2VJZDogc3RyaW5nKSB7XG4gIC8vIEZldGNoIGZ1bGwgZGV0YWlscyAoc2hvdWxkIGFscmVhZHkgYmUgY29tcGxldGUsIGJ1dCBlbnN1cmVzIGZyZXNobmVzcylcbiAgY29uc3QgbWV0YWRhdGEgPSBhd2FpdCBtZXRhZGF0YVNlcnZpY2UuZ2V0Qm9va0J5U291cmNlSWQoc291cmNlLCBzb3VyY2VJZCk7XG4gIGlmICghbWV0YWRhdGEpIHtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdNZXRhZGF0YSBub3QgZm91bmQnIH07XG4gIH1cbiAgcmV0dXJuIGFwcGx5TWV0YWRhdGFUb0Jvb2soYm9va0lkLCBtZXRhZGF0YSk7XG59XG5cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoibVJBb0RzQix1TEFBQSJ9
}),
"[project]/lib/actions/data:52555f [app-client] (ecmascript) <text/javascript>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "searchMetadata",
    ()=>$$RSC_SERVER_ACTION_4
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper.js [app-client] (ecmascript)");
/* __next_internal_action_entry_do_not_use__ [{"408c8cbe1510f07a17f3c38dd064a81d0748d188ee":"searchMetadata"},"lib/actions/books.ts",""] */ "use turbopack no side effects";
;
const $$RSC_SERVER_ACTION_4 = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createServerReference"])("408c8cbe1510f07a17f3c38dd064a81d0748d188ee", __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["callServer"], void 0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["findSourceMapURL"], "searchMetadata");
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
 //# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4vYm9va3MudHMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzZXJ2ZXInO1xuXG5pbXBvcnQgeyByZXZhbGlkYXRlUGF0aCB9IGZyb20gJ25leHQvY2FjaGUnO1xuaW1wb3J0IHtcbiAgZ2V0Qm9va3MgYXMgZ2V0Qm9va3NGcm9tRGIsXG4gIGdldEJvb2tCeUlkLFxuICB1cGRhdGVCb29rIGFzIHVwZGF0ZUJvb2tJbkRiLFxuICBkZWxldGVCb29rIGFzIGRlbGV0ZUJvb2tGcm9tRGIsXG59IGZyb20gJ0AvbGliL3NlcnZpY2VzL3NjYW5uZXInO1xuaW1wb3J0ICogYXMgbWV0YWRhdGFTZXJ2aWNlIGZyb20gJ0AvbGliL3NlcnZpY2VzL21ldGFkYXRhJztcbmltcG9ydCB7IGdldE9yQ3JlYXRlQXV0aG9yLCBmZXRjaEF1dGhvck1ldGFkYXRhLCBnZXRBdXRob3JCeU5hbWUgfSBmcm9tICdAL2xpYi9hY3Rpb25zL2F1dGhvcnMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEdldEJvb2tzUGFyYW1zIHtcbiAgcGFnZT86IG51bWJlcjtcbiAgcGFnZVNpemU/OiBudW1iZXI7XG4gIGxpYnJhcnlJZD86IG51bWJlcjtcbiAgc2VhcmNoPzogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Qm9va3MocGFyYW1zOiBHZXRCb29rc1BhcmFtcyA9IHt9KSB7XG4gIHJldHVybiBnZXRCb29rc0Zyb21EYih7XG4gICAgcGFnZTogcGFyYW1zLnBhZ2UgfHwgMSxcbiAgICBwYWdlU2l6ZTogcGFyYW1zLnBhZ2VTaXplIHx8IDI0LFxuICAgIGxpYnJhcnlJZDogcGFyYW1zLmxpYnJhcnlJZCxcbiAgICBzZWFyY2g6IHBhcmFtcy5zZWFyY2gsXG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Qm9vayhpZDogbnVtYmVyKSB7XG4gIHJldHVybiBnZXRCb29rQnlJZChpZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1cGRhdGVCb29rKGlkOiBudW1iZXIsIGRhdGE6IHtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGF1dGhvcnM/OiBzdHJpbmc7XG4gIHNlcmllcz86IHN0cmluZyB8IG51bGw7XG4gIHNlcmllc05hbWU/OiBzdHJpbmcgfCBudWxsO1xuICBzZXJpZXNOdW1iZXI/OiBudW1iZXIgfCBudWxsO1xuICBpc2JuPzogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGlzaGVyPzogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGlzaERhdGU/OiBzdHJpbmcgfCBudWxsO1xuICBkZXNjcmlwdGlvbj86IHN0cmluZyB8IG51bGw7XG4gIGNvdmVyVXJsPzogc3RyaW5nIHwgbnVsbDtcbn0pIHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdXBkYXRlQm9va0luRGIoaWQsIGRhdGEpO1xuICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICByZXZhbGlkYXRlUGF0aCgnL2Jvb2tzJyk7XG4gICAgcmV2YWxpZGF0ZVBhdGgoYC9ib29rcy8ke2lkfWApO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxldGVCb29rKGlkOiBudW1iZXIpIHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGVsZXRlQm9va0Zyb21EYihpZCk7XG4gIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgIHJldmFsaWRhdGVQYXRoKCcvYm9va3MnKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEFwcGx5IG1ldGFkYXRhIHRvIGEgYm9vayBhbmQgcHJvY2VzcyBhdXRob3JzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGFwcGx5TWV0YWRhdGFUb0Jvb2soYm9va0lkOiBudW1iZXIsIG1ldGFkYXRhOiBtZXRhZGF0YVNlcnZpY2UuQm9va01ldGFkYXRhKSB7XG4gIC8vIEV4dHJhY3QgcHJpbWFyeSBzZXJpZXMgKGZpcnN0IGluIHRoZSBhcnJheSkgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGNvbnN0IHByaW1hcnlTZXJpZXMgPSBtZXRhZGF0YS5zZXJpZXM/LlswXTtcblxuICBjb25zdCByZXN1bHQgPSBhd2FpdCB1cGRhdGVCb29rSW5EYihib29rSWQsIHtcbiAgICB0aXRsZTogbWV0YWRhdGEudGl0bGUsXG4gICAgYXV0aG9yczogSlNPTi5zdHJpbmdpZnkobWV0YWRhdGEuYXV0aG9ycy5zcGxpdCgnLCAnKSksXG4gICAgcHVibGlzaGVyOiBtZXRhZGF0YS5wdWJsaXNoZXIsXG4gICAgcHVibGlzaERhdGU6IG1ldGFkYXRhLnB1Ymxpc2hEYXRlLFxuICAgIGRlc2NyaXB0aW9uOiBtZXRhZGF0YS5kZXNjcmlwdGlvbixcbiAgICBpc2JuOiBtZXRhZGF0YS5pc2JuLFxuICAgIGNvdmVyVXJsOiBtZXRhZGF0YS5jb3ZlclVybCxcbiAgICBzZXJpZXM6IG1ldGFkYXRhLnNlcmllcyA/IEpTT04uc3RyaW5naWZ5KG1ldGFkYXRhLnNlcmllcykgOiBudWxsLFxuICAgIHNlcmllc05hbWU6IHByaW1hcnlTZXJpZXM/LlswXSA/PyBudWxsLFxuICAgIHNlcmllc051bWJlcjogcHJpbWFyeVNlcmllcz8uWzFdID8/IG51bGwsXG4gICAgbWV0YWRhdGFTb3VyY2U6IG1ldGFkYXRhLnNvdXJjZSxcbiAgICBtZXRhZGF0YUlkOiBtZXRhZGF0YS5zb3VyY2VJZCxcbiAgfSk7XG5cbiAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgcmV2YWxpZGF0ZVBhdGgoJy9ib29rcycpO1xuICAgIHJldmFsaWRhdGVQYXRoKGAvYm9va3MvJHtib29rSWR9YCk7XG5cbiAgICAvLyBQcm9jZXNzIGF1dGhvcnMgaW4gYmFja2dyb3VuZFxuICAgIHByb2Nlc3NBdXRob3JzKG1ldGFkYXRhLmF1dGhvcnMpLmNhdGNoKCgpID0+IHt9KTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ3JlYXRlIGF1dGhvciByZWNvcmRzIGFuZCBmZXRjaCBiaWJsaW9ncmFwaHkgZm9yIG5ldyBhdXRob3JzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NBdXRob3JzKGF1dGhvcnNTdHJpbmc6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBmb3IgKGNvbnN0IG5hbWUgb2YgYXV0aG9yc1N0cmluZy5zcGxpdCgnLCAnKS5maWx0ZXIoYSA9PiBhLnRyaW0oKSkpIHtcbiAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IGdldEF1dGhvckJ5TmFtZShuYW1lKTtcbiAgICBpZiAoIWV4aXN0aW5nPy5sYXN0U3luY2VkKSB7XG4gICAgICBjb25zdCBhdXRob3IgPSBhd2FpdCBnZXRPckNyZWF0ZUF1dGhvcihuYW1lKTtcbiAgICAgIGZldGNoQXV0aG9yTWV0YWRhdGEoYXV0aG9yLmlkKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogU2NvcmUgcmVzdWx0cyBmb3IgcmVsZXZhbmNlIHRvIHNlYXJjaCBxdWVyeVxuICovXG5mdW5jdGlvbiBzY29yZVJlc3VsdChyZXN1bHQ6IG1ldGFkYXRhU2VydmljZS5Cb29rTWV0YWRhdGEsIHF1ZXJ5OiBzdHJpbmcpOiBudW1iZXIge1xuICBsZXQgc2NvcmUgPSAwO1xuICBjb25zdCBxID0gcXVlcnkudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgdCA9IHJlc3VsdC50aXRsZS50b0xvd2VyQ2FzZSgpO1xuXG4gIC8vIFRpdGxlIG1hdGNoIHNjb3JpbmdcbiAgaWYgKHQgPT09IHEpIHNjb3JlICs9IDUwO1xuICBlbHNlIGlmICh0LnN0YXJ0c1dpdGgocSkgfHwgcS5zdGFydHNXaXRoKHQpKSBzY29yZSArPSA0MDtcbiAgZWxzZSBpZiAodC5pbmNsdWRlcyhxKSB8fCBxLmluY2x1ZGVzKHQpKSBzY29yZSArPSAzMDtcbiAgZWxzZSB7XG4gICAgY29uc3QgcVdvcmRzID0gcS5zcGxpdCgvXFxzKy8pLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMik7XG4gICAgY29uc3QgdFdvcmRzID0gdC5zcGxpdCgvXFxzKy8pLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMik7XG4gICAgY29uc3QgbWF0Y2hlcyA9IHFXb3Jkcy5maWx0ZXIocXcgPT4gdFdvcmRzLnNvbWUodHcgPT4gdHcuaW5jbHVkZXMocXcpIHx8IHF3LmluY2x1ZGVzKHR3KSkpO1xuICAgIGlmIChxV29yZHMubGVuZ3RoKSBzY29yZSArPSBNYXRoLm1pbigyNSwgKG1hdGNoZXMubGVuZ3RoIC8gcVdvcmRzLmxlbmd0aCkgKiAyNSk7XG4gIH1cblxuICAvLyBDb21wbGV0ZW5lc3Mgc2NvcmluZ1xuICBpZiAocmVzdWx0LmNvdmVyVXJsKSBzY29yZSArPSAxMDtcbiAgaWYgKHJlc3VsdC5kZXNjcmlwdGlvbj8ubGVuZ3RoICYmIHJlc3VsdC5kZXNjcmlwdGlvbi5sZW5ndGggPiA1MCkgc2NvcmUgKz0gMTA7XG4gIGlmIChyZXN1bHQuc2VyaWVzPy5sZW5ndGgpIHNjb3JlICs9IDg7XG4gIGlmIChyZXN1bHQuYXV0aG9ycyAmJiByZXN1bHQuYXV0aG9ycyAhPT0gJ1Vua25vd24nKSBzY29yZSArPSA1O1xuICBpZiAocmVzdWx0LnB1Ymxpc2hlcikgc2NvcmUgKz0gMjtcbiAgaWYgKHJlc3VsdC5wdWJsaXNoRGF0ZSkgc2NvcmUgKz0gMjtcbiAgaWYgKHJlc3VsdC5pc2JuKSBzY29yZSArPSAyO1xuXG4gIHJldHVybiBzY29yZTtcbn1cblxuLyoqXG4gKiBTZWFyY2ggZm9yIG1ldGFkYXRhIC0gcmV0dXJucyByZXN1bHRzIHNvcnRlZCBieSByZWxldmFuY2VcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNlYXJjaE1ldGFkYXRhKHF1ZXJ5OiBzdHJpbmcpIHtcbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IG1ldGFkYXRhU2VydmljZS5zZWFyY2hCb29rcyhxdWVyeSwgeyBtYXhSZXN1bHRzOiAxNSB9KTtcblxuICAvLyBTb3J0IGJ5IHJlbGV2YW5jZVxuICByZXR1cm4gcmVzdWx0c1xuICAgIC5tYXAociA9PiAoeyByZXN1bHQ6IHIsIHNjb3JlOiBzY29yZVJlc3VsdChyLCBxdWVyeSkgfSkpXG4gICAgLnNvcnQoKGEsIGIpID0+IGIuc2NvcmUgLSBhLnNjb3JlKVxuICAgIC5tYXAoc3IgPT4gc3IucmVzdWx0KTtcbn1cblxuLyoqXG4gKiBBcHBseSBtZXRhZGF0YSBmcm9tIGEgc2VsZWN0ZWQgc2VhcmNoIHJlc3VsdCB0byBhIGJvb2tcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFwcGx5TWV0YWRhdGEoYm9va0lkOiBudW1iZXIsIHNvdXJjZTogc3RyaW5nLCBzb3VyY2VJZDogc3RyaW5nKSB7XG4gIC8vIEZldGNoIGZ1bGwgZGV0YWlscyAoc2hvdWxkIGFscmVhZHkgYmUgY29tcGxldGUsIGJ1dCBlbnN1cmVzIGZyZXNobmVzcylcbiAgY29uc3QgbWV0YWRhdGEgPSBhd2FpdCBtZXRhZGF0YVNlcnZpY2UuZ2V0Qm9va0J5U291cmNlSWQoc291cmNlLCBzb3VyY2VJZCk7XG4gIGlmICghbWV0YWRhdGEpIHtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdNZXRhZGF0YSBub3QgZm91bmQnIH07XG4gIH1cbiAgcmV0dXJuIGFwcGx5TWV0YWRhdGFUb0Jvb2soYm9va0lkLCBtZXRhZGF0YSk7XG59XG5cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoidVJBNElzQiwyTEFBQSJ9
}),
"[project]/lib/actions/data:6adce2 [app-client] (ecmascript) <text/javascript>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "applyMetadata",
    ()=>$$RSC_SERVER_ACTION_5
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper.js [app-client] (ecmascript)");
/* __next_internal_action_entry_do_not_use__ [{"70864a645cd7d8205632fdfbaa18f2af3d8eefc278":"applyMetadata"},"lib/actions/books.ts",""] */ "use turbopack no side effects";
;
const $$RSC_SERVER_ACTION_5 = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createServerReference"])("70864a645cd7d8205632fdfbaa18f2af3d8eefc278", __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["callServer"], void 0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["findSourceMapURL"], "applyMetadata");
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
 //# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4vYm9va3MudHMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzZXJ2ZXInO1xuXG5pbXBvcnQgeyByZXZhbGlkYXRlUGF0aCB9IGZyb20gJ25leHQvY2FjaGUnO1xuaW1wb3J0IHtcbiAgZ2V0Qm9va3MgYXMgZ2V0Qm9va3NGcm9tRGIsXG4gIGdldEJvb2tCeUlkLFxuICB1cGRhdGVCb29rIGFzIHVwZGF0ZUJvb2tJbkRiLFxuICBkZWxldGVCb29rIGFzIGRlbGV0ZUJvb2tGcm9tRGIsXG59IGZyb20gJ0AvbGliL3NlcnZpY2VzL3NjYW5uZXInO1xuaW1wb3J0ICogYXMgbWV0YWRhdGFTZXJ2aWNlIGZyb20gJ0AvbGliL3NlcnZpY2VzL21ldGFkYXRhJztcbmltcG9ydCB7IGdldE9yQ3JlYXRlQXV0aG9yLCBmZXRjaEF1dGhvck1ldGFkYXRhLCBnZXRBdXRob3JCeU5hbWUgfSBmcm9tICdAL2xpYi9hY3Rpb25zL2F1dGhvcnMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEdldEJvb2tzUGFyYW1zIHtcbiAgcGFnZT86IG51bWJlcjtcbiAgcGFnZVNpemU/OiBudW1iZXI7XG4gIGxpYnJhcnlJZD86IG51bWJlcjtcbiAgc2VhcmNoPzogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Qm9va3MocGFyYW1zOiBHZXRCb29rc1BhcmFtcyA9IHt9KSB7XG4gIHJldHVybiBnZXRCb29rc0Zyb21EYih7XG4gICAgcGFnZTogcGFyYW1zLnBhZ2UgfHwgMSxcbiAgICBwYWdlU2l6ZTogcGFyYW1zLnBhZ2VTaXplIHx8IDI0LFxuICAgIGxpYnJhcnlJZDogcGFyYW1zLmxpYnJhcnlJZCxcbiAgICBzZWFyY2g6IHBhcmFtcy5zZWFyY2gsXG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Qm9vayhpZDogbnVtYmVyKSB7XG4gIHJldHVybiBnZXRCb29rQnlJZChpZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1cGRhdGVCb29rKGlkOiBudW1iZXIsIGRhdGE6IHtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGF1dGhvcnM/OiBzdHJpbmc7XG4gIHNlcmllcz86IHN0cmluZyB8IG51bGw7XG4gIHNlcmllc05hbWU/OiBzdHJpbmcgfCBudWxsO1xuICBzZXJpZXNOdW1iZXI/OiBudW1iZXIgfCBudWxsO1xuICBpc2JuPzogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGlzaGVyPzogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGlzaERhdGU/OiBzdHJpbmcgfCBudWxsO1xuICBkZXNjcmlwdGlvbj86IHN0cmluZyB8IG51bGw7XG4gIGNvdmVyVXJsPzogc3RyaW5nIHwgbnVsbDtcbn0pIHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdXBkYXRlQm9va0luRGIoaWQsIGRhdGEpO1xuICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICByZXZhbGlkYXRlUGF0aCgnL2Jvb2tzJyk7XG4gICAgcmV2YWxpZGF0ZVBhdGgoYC9ib29rcy8ke2lkfWApO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxldGVCb29rKGlkOiBudW1iZXIpIHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGVsZXRlQm9va0Zyb21EYihpZCk7XG4gIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgIHJldmFsaWRhdGVQYXRoKCcvYm9va3MnKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEFwcGx5IG1ldGFkYXRhIHRvIGEgYm9vayBhbmQgcHJvY2VzcyBhdXRob3JzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGFwcGx5TWV0YWRhdGFUb0Jvb2soYm9va0lkOiBudW1iZXIsIG1ldGFkYXRhOiBtZXRhZGF0YVNlcnZpY2UuQm9va01ldGFkYXRhKSB7XG4gIC8vIEV4dHJhY3QgcHJpbWFyeSBzZXJpZXMgKGZpcnN0IGluIHRoZSBhcnJheSkgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGNvbnN0IHByaW1hcnlTZXJpZXMgPSBtZXRhZGF0YS5zZXJpZXM/LlswXTtcblxuICBjb25zdCByZXN1bHQgPSBhd2FpdCB1cGRhdGVCb29rSW5EYihib29rSWQsIHtcbiAgICB0aXRsZTogbWV0YWRhdGEudGl0bGUsXG4gICAgYXV0aG9yczogSlNPTi5zdHJpbmdpZnkobWV0YWRhdGEuYXV0aG9ycy5zcGxpdCgnLCAnKSksXG4gICAgcHVibGlzaGVyOiBtZXRhZGF0YS5wdWJsaXNoZXIsXG4gICAgcHVibGlzaERhdGU6IG1ldGFkYXRhLnB1Ymxpc2hEYXRlLFxuICAgIGRlc2NyaXB0aW9uOiBtZXRhZGF0YS5kZXNjcmlwdGlvbixcbiAgICBpc2JuOiBtZXRhZGF0YS5pc2JuLFxuICAgIGNvdmVyVXJsOiBtZXRhZGF0YS5jb3ZlclVybCxcbiAgICBzZXJpZXM6IG1ldGFkYXRhLnNlcmllcyA/IEpTT04uc3RyaW5naWZ5KG1ldGFkYXRhLnNlcmllcykgOiBudWxsLFxuICAgIHNlcmllc05hbWU6IHByaW1hcnlTZXJpZXM/LlswXSA/PyBudWxsLFxuICAgIHNlcmllc051bWJlcjogcHJpbWFyeVNlcmllcz8uWzFdID8/IG51bGwsXG4gICAgbWV0YWRhdGFTb3VyY2U6IG1ldGFkYXRhLnNvdXJjZSxcbiAgICBtZXRhZGF0YUlkOiBtZXRhZGF0YS5zb3VyY2VJZCxcbiAgfSk7XG5cbiAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgcmV2YWxpZGF0ZVBhdGgoJy9ib29rcycpO1xuICAgIHJldmFsaWRhdGVQYXRoKGAvYm9va3MvJHtib29rSWR9YCk7XG5cbiAgICAvLyBQcm9jZXNzIGF1dGhvcnMgaW4gYmFja2dyb3VuZFxuICAgIHByb2Nlc3NBdXRob3JzKG1ldGFkYXRhLmF1dGhvcnMpLmNhdGNoKCgpID0+IHt9KTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ3JlYXRlIGF1dGhvciByZWNvcmRzIGFuZCBmZXRjaCBiaWJsaW9ncmFwaHkgZm9yIG5ldyBhdXRob3JzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NBdXRob3JzKGF1dGhvcnNTdHJpbmc6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBmb3IgKGNvbnN0IG5hbWUgb2YgYXV0aG9yc1N0cmluZy5zcGxpdCgnLCAnKS5maWx0ZXIoYSA9PiBhLnRyaW0oKSkpIHtcbiAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IGdldEF1dGhvckJ5TmFtZShuYW1lKTtcbiAgICBpZiAoIWV4aXN0aW5nPy5sYXN0U3luY2VkKSB7XG4gICAgICBjb25zdCBhdXRob3IgPSBhd2FpdCBnZXRPckNyZWF0ZUF1dGhvcihuYW1lKTtcbiAgICAgIGZldGNoQXV0aG9yTWV0YWRhdGEoYXV0aG9yLmlkKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogU2NvcmUgcmVzdWx0cyBmb3IgcmVsZXZhbmNlIHRvIHNlYXJjaCBxdWVyeVxuICovXG5mdW5jdGlvbiBzY29yZVJlc3VsdChyZXN1bHQ6IG1ldGFkYXRhU2VydmljZS5Cb29rTWV0YWRhdGEsIHF1ZXJ5OiBzdHJpbmcpOiBudW1iZXIge1xuICBsZXQgc2NvcmUgPSAwO1xuICBjb25zdCBxID0gcXVlcnkudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgdCA9IHJlc3VsdC50aXRsZS50b0xvd2VyQ2FzZSgpO1xuXG4gIC8vIFRpdGxlIG1hdGNoIHNjb3JpbmdcbiAgaWYgKHQgPT09IHEpIHNjb3JlICs9IDUwO1xuICBlbHNlIGlmICh0LnN0YXJ0c1dpdGgocSkgfHwgcS5zdGFydHNXaXRoKHQpKSBzY29yZSArPSA0MDtcbiAgZWxzZSBpZiAodC5pbmNsdWRlcyhxKSB8fCBxLmluY2x1ZGVzKHQpKSBzY29yZSArPSAzMDtcbiAgZWxzZSB7XG4gICAgY29uc3QgcVdvcmRzID0gcS5zcGxpdCgvXFxzKy8pLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMik7XG4gICAgY29uc3QgdFdvcmRzID0gdC5zcGxpdCgvXFxzKy8pLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMik7XG4gICAgY29uc3QgbWF0Y2hlcyA9IHFXb3Jkcy5maWx0ZXIocXcgPT4gdFdvcmRzLnNvbWUodHcgPT4gdHcuaW5jbHVkZXMocXcpIHx8IHF3LmluY2x1ZGVzKHR3KSkpO1xuICAgIGlmIChxV29yZHMubGVuZ3RoKSBzY29yZSArPSBNYXRoLm1pbigyNSwgKG1hdGNoZXMubGVuZ3RoIC8gcVdvcmRzLmxlbmd0aCkgKiAyNSk7XG4gIH1cblxuICAvLyBDb21wbGV0ZW5lc3Mgc2NvcmluZ1xuICBpZiAocmVzdWx0LmNvdmVyVXJsKSBzY29yZSArPSAxMDtcbiAgaWYgKHJlc3VsdC5kZXNjcmlwdGlvbj8ubGVuZ3RoICYmIHJlc3VsdC5kZXNjcmlwdGlvbi5sZW5ndGggPiA1MCkgc2NvcmUgKz0gMTA7XG4gIGlmIChyZXN1bHQuc2VyaWVzPy5sZW5ndGgpIHNjb3JlICs9IDg7XG4gIGlmIChyZXN1bHQuYXV0aG9ycyAmJiByZXN1bHQuYXV0aG9ycyAhPT0gJ1Vua25vd24nKSBzY29yZSArPSA1O1xuICBpZiAocmVzdWx0LnB1Ymxpc2hlcikgc2NvcmUgKz0gMjtcbiAgaWYgKHJlc3VsdC5wdWJsaXNoRGF0ZSkgc2NvcmUgKz0gMjtcbiAgaWYgKHJlc3VsdC5pc2JuKSBzY29yZSArPSAyO1xuXG4gIHJldHVybiBzY29yZTtcbn1cblxuLyoqXG4gKiBTZWFyY2ggZm9yIG1ldGFkYXRhIC0gcmV0dXJucyByZXN1bHRzIHNvcnRlZCBieSByZWxldmFuY2VcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNlYXJjaE1ldGFkYXRhKHF1ZXJ5OiBzdHJpbmcpIHtcbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IG1ldGFkYXRhU2VydmljZS5zZWFyY2hCb29rcyhxdWVyeSwgeyBtYXhSZXN1bHRzOiAxNSB9KTtcblxuICAvLyBTb3J0IGJ5IHJlbGV2YW5jZVxuICByZXR1cm4gcmVzdWx0c1xuICAgIC5tYXAociA9PiAoeyByZXN1bHQ6IHIsIHNjb3JlOiBzY29yZVJlc3VsdChyLCBxdWVyeSkgfSkpXG4gICAgLnNvcnQoKGEsIGIpID0+IGIuc2NvcmUgLSBhLnNjb3JlKVxuICAgIC5tYXAoc3IgPT4gc3IucmVzdWx0KTtcbn1cblxuLyoqXG4gKiBBcHBseSBtZXRhZGF0YSBmcm9tIGEgc2VsZWN0ZWQgc2VhcmNoIHJlc3VsdCB0byBhIGJvb2tcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFwcGx5TWV0YWRhdGEoYm9va0lkOiBudW1iZXIsIHNvdXJjZTogc3RyaW5nLCBzb3VyY2VJZDogc3RyaW5nKSB7XG4gIC8vIEZldGNoIGZ1bGwgZGV0YWlscyAoc2hvdWxkIGFscmVhZHkgYmUgY29tcGxldGUsIGJ1dCBlbnN1cmVzIGZyZXNobmVzcylcbiAgY29uc3QgbWV0YWRhdGEgPSBhd2FpdCBtZXRhZGF0YVNlcnZpY2UuZ2V0Qm9va0J5U291cmNlSWQoc291cmNlLCBzb3VyY2VJZCk7XG4gIGlmICghbWV0YWRhdGEpIHtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdNZXRhZGF0YSBub3QgZm91bmQnIH07XG4gIH1cbiAgcmV0dXJuIGFwcGx5TWV0YWRhdGFUb0Jvb2soYm9va0lkLCBtZXRhZGF0YSk7XG59XG5cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoic1JBeUpzQiwwTEFBQSJ9
}),
"[project]/lib/actions/data:bff7da [app-client] (ecmascript) <text/javascript>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "isHardcoverConfigured",
    ()=>$$RSC_SERVER_ACTION_6
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper.js [app-client] (ecmascript)");
/* __next_internal_action_entry_do_not_use__ [{"00f2bf1342b242da83d8d5a56eb8bf8de583768f35":"isHardcoverConfigured"},"lib/actions/settings.ts",""] */ "use turbopack no side effects";
;
const $$RSC_SERVER_ACTION_6 = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createServerReference"])("00f2bf1342b242da83d8d5a56eb8bf8de583768f35", __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["callServer"], void 0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["findSourceMapURL"], "isHardcoverConfigured");
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
 //# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4vc2V0dGluZ3MudHMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzZXJ2ZXInO1xuXG5pbXBvcnQgeyByZXZhbGlkYXRlUGF0aCB9IGZyb20gJ25leHQvY2FjaGUnO1xuaW1wb3J0IHsgZ2V0U2V0dGluZywgc2V0U2V0dGluZywgZ2V0QWxsU2V0dGluZ3MgfSBmcm9tICdAL2xpYi9kYic7XG5pbXBvcnQgeyBnZXRBbGxTb3VyY2VzU3RhdHVzLCBpc0NvbmZpZ3VyZWQgfSBmcm9tICdAL2xpYi9zZXJ2aWNlcy9tZXRhZGF0YSc7XG5cbi8vIE9ubHkgSGFyZGNvdmVyIGlzIHN1cHBvcnRlZFxudHlwZSBNZXRhZGF0YVNvdXJjZSA9ICdoYXJkY292ZXInO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKSB7XG4gIHJldHVybiBnZXRBbGxTZXR0aW5ncygpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0U291cmNlc1N0YXR1cygpIHtcbiAgcmV0dXJuIGdldEFsbFNvdXJjZXNTdGF0dXMoKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRvZ2dsZVNvdXJjZShzb3VyY2U6IE1ldGFkYXRhU291cmNlLCBlbmFibGVkOiBib29sZWFuKSB7XG4gIGNvbnN0IGN1cnJlbnRTZXR0aW5ncyA9IGF3YWl0IGdldFNldHRpbmc8UmVjb3JkPHN0cmluZywgeyBlbmFibGVkOiBib29sZWFuIH0+PihcbiAgICAnbWV0YWRhdGFfc291cmNlcycsXG4gICAge31cbiAgKSB8fCB7fTtcblxuICBjdXJyZW50U2V0dGluZ3Nbc291cmNlXSA9IHsgZW5hYmxlZCB9O1xuICBzZXRTZXR0aW5nKCdtZXRhZGF0YV9zb3VyY2VzJywgY3VycmVudFNldHRpbmdzKTtcblxuICByZXZhbGlkYXRlUGF0aCgnL3NldHRpbmdzJyk7XG4gIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldEFwaUtleShzb3VyY2U6IE1ldGFkYXRhU291cmNlLCBhcGlLZXk6IHN0cmluZykge1xuICBjb25zdCBrZXkgPSBgJHtzb3VyY2V9X2FwaV9rZXlgO1xuICBzZXRTZXR0aW5nKGtleSwgYXBpS2V5KTtcblxuICByZXZhbGlkYXRlUGF0aCgnL3NldHRpbmdzJyk7XG4gIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEFwaUtleShzb3VyY2U6IE1ldGFkYXRhU291cmNlKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gIGNvbnN0IGtleSA9IGAke3NvdXJjZX1fYXBpX2tleWA7XG4gIHJldHVybiBnZXRTZXR0aW5nPHN0cmluZz4oa2V5LCBudWxsKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRlc3RTb3VyY2VDb25uZWN0aW9uKHNvdXJjZTogTWV0YWRhdGFTb3VyY2UpIHtcbiAgaWYgKHNvdXJjZSAhPT0gJ2hhcmRjb3ZlcicpIHtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdVbmtub3duIHNvdXJjZScgfTtcbiAgfVxuXG4gIGlmICghaXNDb25maWd1cmVkKCkpIHtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdIYXJkY292ZXIgQVBJIGtleSBub3QgY29uZmlndXJlZCcgfTtcbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBhY3R1YWwgY29ubmVjdGlvbiB0ZXN0IGZvciBIYXJkY292ZXJcbiAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xufVxuXG4vKipcbiAqIENoZWNrIGlmIEhhcmRjb3ZlciBBUEkgaXMgY29uZmlndXJlZFxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaXNIYXJkY292ZXJDb25maWd1cmVkKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICByZXR1cm4gaXNDb25maWd1cmVkKCk7XG59XG5cbi8vIEtvbWdhIHNldHRpbmdzXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0S29tZ2FTZXR0aW5ncygpIHtcbiAgcmV0dXJuIHtcbiAgICB1cmw6IGF3YWl0IGdldFNldHRpbmc8c3RyaW5nPigna29tZ2FfdXJsJywgbnVsbCksXG4gICAgdXNlcm5hbWU6IGF3YWl0IGdldFNldHRpbmc8c3RyaW5nPigna29tZ2FfdXNlcm5hbWUnLCBudWxsKSxcbiAgICBoYXNQYXNzd29yZDogISEoYXdhaXQgZ2V0U2V0dGluZzxzdHJpbmc+KCdrb21nYV9wYXNzd29yZCcsIG51bGwpKSxcbiAgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldEtvbWdhU2V0dGluZ3ModXJsOiBzdHJpbmcsIHVzZXJuYW1lOiBzdHJpbmcsIHBhc3N3b3JkPzogc3RyaW5nKSB7XG4gIHNldFNldHRpbmcoJ2tvbWdhX3VybCcsIHVybCk7XG4gIHNldFNldHRpbmcoJ2tvbWdhX3VzZXJuYW1lJywgdXNlcm5hbWUpO1xuICBpZiAocGFzc3dvcmQpIHtcbiAgICBzZXRTZXR0aW5nKCdrb21nYV9wYXNzd29yZCcsIHBhc3N3b3JkKTtcbiAgfVxuXG4gIHJldmFsaWRhdGVQYXRoKCcvc2V0dGluZ3MnKTtcbiAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdGVzdEtvbWdhQ29ubmVjdGlvbigpIHtcbiAgY29uc3QgdXJsID0gYXdhaXQgZ2V0U2V0dGluZzxzdHJpbmc+KCdrb21nYV91cmwnLCBudWxsKTtcbiAgY29uc3QgdXNlcm5hbWUgPSBhd2FpdCBnZXRTZXR0aW5nPHN0cmluZz4oJ2tvbWdhX3VzZXJuYW1lJywgbnVsbCk7XG4gIGNvbnN0IHBhc3N3b3JkID0gYXdhaXQgZ2V0U2V0dGluZzxzdHJpbmc+KCdrb21nYV9wYXNzd29yZCcsIG51bGwpO1xuXG4gIGlmICghdXJsIHx8ICF1c2VybmFtZSB8fCAhcGFzc3dvcmQpIHtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdLb21nYSBzZXR0aW5ncyBpbmNvbXBsZXRlJyB9O1xuICB9XG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3VybH0vYXBpL3YxL2xpYnJhcmllc2AsIHtcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogYEJhc2ljICR7QnVmZmVyLmZyb20oYCR7dXNlcm5hbWV9OiR7cGFzc3dvcmR9YCkudG9TdHJpbmcoJ2Jhc2U2NCcpfWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9YCB9O1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnQ29ubmVjdGlvbiBmYWlsZWQnLFxuICAgIH07XG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiaVNBMkRzQixrTUFBQSJ9
}),
"[project]/components/books/MetadataSearchModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MetadataSearchModal",
    ()=>MetadataSearchModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$52555f__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__ = __turbopack_context__.i("[project]/lib/actions/data:52555f [app-client] (ecmascript) <text/javascript>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$6adce2__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__ = __turbopack_context__.i("[project]/lib/actions/data:6adce2 [app-client] (ecmascript) <text/javascript>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$bff7da__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__ = __turbopack_context__.i("[project]/lib/actions/data:bff7da [app-client] (ecmascript) <text/javascript>");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function MetadataSearchModal({ book, initialQuery: providedQuery, onClose }) {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const authors = book.authors ? JSON.parse(book.authors).join(' ') : '';
    const defaultQuery = book.title ? `${book.title} ${authors}`.trim() : '';
    const [query, setQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(providedQuery ?? defaultQuery);
    const [results, setResults] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [applying, setApplying] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [isConfigured, setIsConfigured] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    // Check if Hardcover is configured
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MetadataSearchModal.useEffect": ()=>{
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$bff7da__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__["isHardcoverConfigured"])().then(setIsConfigured);
        }
    }["MetadataSearchModal.useEffect"], []);
    // Request ID to prevent race conditions
    const requestIdRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const handleSearch = async (e)=>{
        e.preventDefault();
        if (!query.trim()) return;
        const currentRequestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);
        try {
            const searchResults = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$52555f__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__["searchMetadata"])(query);
            // Only update if this is still the latest request
            if (currentRequestId === requestIdRef.current) {
                setResults(searchResults);
                if (searchResults.length === 0) {
                    setError('No results found');
                }
            }
        } catch  {
            if (currentRequestId === requestIdRef.current) {
                setError('Search failed. Please try again.');
            }
        } finally{
            if (currentRequestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    };
    const handleApply = async (metadata)=>{
        setApplying(metadata.sourceId);
        const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$6adce2__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__["applyMetadata"])(book.id, metadata.source, metadata.sourceId);
        setApplying(null);
        if (result.error) {
            alert(result.error);
        } else {
            router.refresh();
            onClose();
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-50 flex items-center justify-center",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed inset-0 bg-black/50",
                onClick: onClose
            }, void 0, false, {
                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                lineNumber: 87,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative bg-shelvarr-surface border border-shelvarr-border rounded-lg w-full max-w-3xl max-h-[80vh] overflow-hidden z-50",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "p-4 border-b border-shelvarr-border",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                className: "text-lg font-semibold text-white",
                                children: "Search Metadata"
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 91,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-sm text-shelvarr-text-muted mt-1",
                                children: "Search for book metadata from Hardcover"
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 92,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 90,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "p-4 border-b border-shelvarr-border",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                            onSubmit: handleSearch,
                            className: "flex gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    type: "text",
                                    value: query,
                                    onChange: (e)=>setQuery(e.target.value),
                                    placeholder: "Search by title, author, ISBN...",
                                    className: "flex-1 bg-shelvarr-bg border border-shelvarr-border rounded-lg px-3 py-2 text-white placeholder-shelvarr-text-muted focus:outline-none focus:border-blue-500"
                                }, void 0, false, {
                                    fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                    lineNumber: 99,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "submit",
                                    disabled: loading || !query.trim(),
                                    className: "bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50",
                                    children: loading ? 'Searching...' : 'Search'
                                }, void 0, false, {
                                    fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                    lineNumber: 106,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/books/MetadataSearchModal.tsx",
                            lineNumber: 98,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 97,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "overflow-y-auto max-h-[50vh]",
                        children: [
                            isConfigured === false && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "m-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-start gap-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                            className: "w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5",
                                            fill: "none",
                                            viewBox: "0 0 24 24",
                                            stroke: "currentColor",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                strokeLinecap: "round",
                                                strokeLinejoin: "round",
                                                strokeWidth: 2,
                                                d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                            }, void 0, false, {
                                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                                lineNumber: 121,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                            lineNumber: 120,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-yellow-500 font-medium",
                                                    children: "Hardcover API key not configured"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                                    lineNumber: 124,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-sm text-shelvarr-text-muted mt-1",
                                                    children: "To search for book metadata, you need to add your Hardcover API key in settings."
                                                }, void 0, false, {
                                                    fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                                    lineNumber: 125,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                    href: "/settings",
                                                    className: "inline-block mt-2 text-sm text-blue-400 hover:text-blue-300",
                                                    onClick: onClose,
                                                    children: "Go to Settings →"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                                    lineNumber: 128,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                            lineNumber: 123,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                    lineNumber: 119,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 118,
                                columnNumber: 13
                            }, this),
                            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "p-4 text-center text-shelvarr-text-muted",
                                children: error
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 141,
                                columnNumber: 13
                            }, this),
                            results.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "divide-y divide-shelvarr-border",
                                children: results.map((result, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataResult, {
                                        metadata: result,
                                        onApply: ()=>handleApply(result),
                                        applying: applying === result.sourceId
                                    }, `${result.source}-${result.sourceId}-${index}`, false, {
                                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                        lineNumber: 147,
                                        columnNumber: 17
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 145,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 116,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "p-4 border-t border-shelvarr-border flex justify-end",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: onClose,
                            className: "px-4 py-2 text-shelvarr-text-muted hover:text-white transition-colors",
                            children: "Cancel"
                        }, void 0, false, {
                            fileName: "[project]/components/books/MetadataSearchModal.tsx",
                            lineNumber: 159,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 158,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                lineNumber: 89,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/books/MetadataSearchModal.tsx",
        lineNumber: 86,
        columnNumber: 5
    }, this);
}
_s(MetadataSearchModal, "H82T5y8Bmk5UVvkgcJ7pWLVgK8E=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c = MetadataSearchModal;
function MetadataResult({ metadata, onApply, applying }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "p-4 flex gap-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "w-16 h-24 bg-shelvarr-bg rounded flex-shrink-0",
                children: metadata.coverUrl ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                    src: metadata.coverUrl,
                    alt: metadata.title,
                    className: "w-full h-full object-cover rounded"
                }, void 0, false, {
                    fileName: "[project]/components/books/MetadataSearchModal.tsx",
                    lineNumber: 184,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-full h-full flex items-center justify-center text-shelvarr-text-muted",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(BookIcon, {}, void 0, false, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 191,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/components/books/MetadataSearchModal.tsx",
                    lineNumber: 190,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                lineNumber: 182,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 min-w-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-start justify-between gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        className: "text-white font-medium line-clamp-1",
                                        children: metadata.title
                                    }, void 0, false, {
                                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                        lineNumber: 199,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm text-shelvarr-text-muted",
                                        children: metadata.authors
                                    }, void 0, false, {
                                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                        lineNumber: 200,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 198,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "flex-shrink-0 text-xs px-2 py-0.5 bg-shelvarr-bg rounded text-shelvarr-text-muted",
                                children: metadata.source
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 202,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 197,
                        columnNumber: 9
                    }, this),
                    metadata.series && metadata.series.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-sm text-shelvarr-primary mt-1",
                        children: metadata.series.map(([name, pos], i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    i > 0 && ' • ',
                                    name,
                                    pos ? ` #${pos}` : ''
                                ]
                            }, i, true, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 210,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 208,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm text-shelvarr-text-muted line-clamp-2 mt-2",
                        children: metadata.description || 'No description available'
                    }, void 0, false, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 218,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-2 flex items-center gap-4 text-xs text-shelvarr-text-muted",
                        children: [
                            metadata.publishDate && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: metadata.publishDate
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 223,
                                columnNumber: 36
                            }, this),
                            metadata.publisher && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: metadata.publisher
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 224,
                                columnNumber: 34
                            }, this),
                            metadata.isbn && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    "ISBN: ",
                                    metadata.isbn
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 225,
                                columnNumber: 29
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 222,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                lineNumber: 196,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: onApply,
                disabled: applying,
                className: "flex-shrink-0 self-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50",
                children: applying ? 'Applying...' : 'Apply'
            }, void 0, false, {
                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                lineNumber: 229,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/books/MetadataSearchModal.tsx",
        lineNumber: 181,
        columnNumber: 5
    }, this);
}
_c1 = MetadataResult;
function BookIcon() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        className: "w-8 h-8",
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: 1.5,
            d: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        }, void 0, false, {
            fileName: "[project]/components/books/MetadataSearchModal.tsx",
            lineNumber: 243,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/books/MetadataSearchModal.tsx",
        lineNumber: 242,
        columnNumber: 5
    }, this);
}
_c2 = BookIcon;
var _c, _c1, _c2;
__turbopack_context__.k.register(_c, "MetadataSearchModal");
__turbopack_context__.k.register(_c1, "MetadataResult");
__turbopack_context__.k.register(_c2, "BookIcon");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/books/BookActions.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BookActions",
    ()=>BookActions
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$90e3a0__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__ = __turbopack_context__.i("[project]/lib/actions/data:90e3a0 [app-client] (ecmascript) <text/javascript>");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$books$2f$MetadataSearchModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/books/MetadataSearchModal.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
function getFilenameFromPath(filePath) {
    const parts = filePath.split(/[/\\]/);
    const filename = parts[parts.length - 1] || filePath;
    return filename.replace(/\.[^.]+$/, '');
}
function BookActions({ book }) {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [showMetadataSearch, setShowMetadataSearch] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const hasMatch = !!book.metadataSource;
    const handleDelete = async ()=>{
        if (!confirm('Delete this book from the database? The file will not be deleted.')) {
            return;
        }
        setLoading(true);
        const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$90e3a0__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__["deleteBook"])(book.id);
        setLoading(false);
        if (result.error) {
            alert(result.error);
        } else {
            router.push('/books');
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setShowMetadataSearch(true),
                        disabled: loading,
                        className: "w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50",
                        children: hasMatch ? 'Fix Match' : 'Search Match'
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookActions.tsx",
                        lineNumber: 45,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: handleDelete,
                        disabled: loading,
                        className: "w-full bg-shelvarr-surface hover:bg-red-900/20 text-red-400 border border-shelvarr-border px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50",
                        children: loading ? 'Deleting...' : 'Delete from Database'
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookActions.tsx",
                        lineNumber: 53,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookActions.tsx",
                lineNumber: 44,
                columnNumber: 7
            }, this),
            showMetadataSearch && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$books$2f$MetadataSearchModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MetadataSearchModal"], {
                book: book,
                initialQuery: hasMatch ? getFilenameFromPath(book.filePath) : undefined,
                onClose: ()=>setShowMetadataSearch(false)
            }, void 0, false, {
                fileName: "[project]/components/books/BookActions.tsx",
                lineNumber: 63,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true);
}
_s(BookActions, "2b/KnJKGCMPznsehMhSNt/fhivc=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c = BookActions;
var _c;
__turbopack_context__.k.register(_c, "BookActions");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

// This file must be bundled in the app's client layer, it shouldn't be directly
// imported by the server.
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    callServer: null,
    createServerReference: null,
    findSourceMapURL: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    callServer: function() {
        return _appcallserver.callServer;
    },
    createServerReference: function() {
        return _client.createServerReference;
    },
    findSourceMapURL: function() {
        return _appfindsourcemapurl.findSourceMapURL;
    }
});
const _appcallserver = __turbopack_context__.r("[project]/node_modules/next/dist/client/app-call-server.js [app-client] (ecmascript)");
const _appfindsourcemapurl = __turbopack_context__.r("[project]/node_modules/next/dist/client/app-find-source-map-url.js [app-client] (ecmascript)");
const _client = __turbopack_context__.r("[project]/node_modules/next/dist/compiled/react-server-dom-turbopack/client.js [app-client] (ecmascript)"); //# sourceMappingURL=action-client-wrapper.js.map
}),
]);

//# sourceMappingURL=_07533a13._.js.map
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
                        lineNumber: 21,
                        columnNumber: 9
                    }, this),
                    authors && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-lg text-shelvarr-text-muted mt-1",
                        children: authors
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 25,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 20,
                columnNumber: 7
            }, this),
            book.seriesName && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                href: `/series/${encodeURIComponent(book.seriesName)}`,
                className: "flex items-center gap-2 text-shelvarr-primary hover:text-shelvarr-primary/80 transition-colors",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SeriesIcon, {}, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 34,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: [
                            book.seriesName,
                            book.seriesNumber ? ` #${book.seriesNumber}` : ''
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 35,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 30,
                columnNumber: 9
            }, this),
            book.description && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-sm font-semibold text-shelvarr-text-muted uppercase tracking-wide mb-2",
                        children: "Description"
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 44,
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
                        lineNumber: 47,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 43,
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
                        lineNumber: 57,
                        columnNumber: 11
                    }, this),
                    book.publishDate && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataField, {
                        label: "Published",
                        value: book.publishDate
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 60,
                        columnNumber: 11
                    }, this),
                    book.isbn && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataField, {
                        label: "ISBN",
                        value: book.isbn
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 62,
                        columnNumber: 23
                    }, this),
                    library && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetadataField, {
                        label: "Library",
                        value: library.name
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 63,
                        columnNumber: 21
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 55,
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
                        lineNumber: 67,
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
                                        lineNumber: 72,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-white font-mono text-right max-w-[60%] truncate",
                                        children: filename
                                    }, void 0, false, {
                                        fileName: "[project]/components/books/BookDetails.tsx",
                                        lineNumber: 73,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 71,
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
                                        lineNumber: 78,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-white font-mono text-right max-w-[60%] truncate",
                                        title: book.filePath,
                                        children: book.filePath
                                    }, void 0, false, {
                                        fileName: "[project]/components/books/BookDetails.tsx",
                                        lineNumber: 79,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 77,
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
                                        lineNumber: 85,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-white",
                                        children: formatFileSize(book.fileSize)
                                    }, void 0, false, {
                                        fileName: "[project]/components/books/BookDetails.tsx",
                                        lineNumber: 86,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 84,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 70,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 66,
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
                        lineNumber: 94,
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
                                lineNumber: 98,
                                columnNumber: 13
                            }, this),
                            book.metadataId && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-shelvarr-text-muted text-sm font-mono",
                                children: book.metadataId
                            }, void 0, false, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 102,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 97,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 93,
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
                                lineNumber: 115,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "Raw Data"
                            }, void 0, false, {
                                fileName: "[project]/components/books/BookDetails.tsx",
                                lineNumber: 116,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 111,
                        columnNumber: 9
                    }, this),
                    showRawData && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                        className: "mt-3 p-3 bg-shelvarr-bg rounded-lg text-xs text-shelvarr-text overflow-x-auto whitespace-pre-wrap break-words",
                        children: JSON.stringify(book, null, 2)
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookDetails.tsx",
                        lineNumber: 119,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 110,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/books/BookDetails.tsx",
        lineNumber: 19,
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
                lineNumber: 131,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("dd", {
                className: "text-white mt-0.5",
                children: value
            }, void 0, false, {
                fileName: "[project]/components/books/BookDetails.tsx",
                lineNumber: 134,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/books/BookDetails.tsx",
        lineNumber: 130,
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
            lineNumber: 149,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/books/BookDetails.tsx",
        lineNumber: 148,
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
            lineNumber: 167,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/books/BookDetails.tsx",
        lineNumber: 161,
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
"[project]/lib/actions/data:8972c4 [app-client] (ecmascript) <text/javascript>", ((__turbopack_context__) => {
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
 //# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4vYm9va3MudHMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzZXJ2ZXInO1xuXG5pbXBvcnQgeyByZXZhbGlkYXRlUGF0aCB9IGZyb20gJ25leHQvY2FjaGUnO1xuaW1wb3J0IHtcbiAgZ2V0Qm9va3MgYXMgZ2V0Qm9va3NGcm9tRGIsXG4gIGdldEJvb2tCeUlkLFxuICB1cGRhdGVCb29rIGFzIHVwZGF0ZUJvb2tJbkRiLFxuICBkZWxldGVCb29rIGFzIGRlbGV0ZUJvb2tGcm9tRGIsXG59IGZyb20gJ0AvbGliL3NlcnZpY2VzL3NjYW5uZXInO1xuaW1wb3J0ICogYXMgbWV0YWRhdGFTZXJ2aWNlIGZyb20gJ0AvbGliL3NlcnZpY2VzL21ldGFkYXRhJztcbmltcG9ydCB7IGdldE9yQ3JlYXRlQXV0aG9yLCBmZXRjaEF1dGhvck1ldGFkYXRhLCBnZXRBdXRob3JCeU5hbWUgfSBmcm9tICdAL2xpYi9hY3Rpb25zL2F1dGhvcnMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEdldEJvb2tzUGFyYW1zIHtcbiAgcGFnZT86IG51bWJlcjtcbiAgcGFnZVNpemU/OiBudW1iZXI7XG4gIGxpYnJhcnlJZD86IG51bWJlcjtcbiAgc2VhcmNoPzogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Qm9va3MocGFyYW1zOiBHZXRCb29rc1BhcmFtcyA9IHt9KSB7XG4gIHJldHVybiBnZXRCb29rc0Zyb21EYih7XG4gICAgcGFnZTogcGFyYW1zLnBhZ2UgfHwgMSxcbiAgICBwYWdlU2l6ZTogcGFyYW1zLnBhZ2VTaXplIHx8IDI0LFxuICAgIGxpYnJhcnlJZDogcGFyYW1zLmxpYnJhcnlJZCxcbiAgICBzZWFyY2g6IHBhcmFtcy5zZWFyY2gsXG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Qm9vayhpZDogbnVtYmVyKSB7XG4gIHJldHVybiBnZXRCb29rQnlJZChpZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1cGRhdGVCb29rKGlkOiBudW1iZXIsIGRhdGE6IHtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGF1dGhvcnM/OiBzdHJpbmc7XG4gIHNlcmllcz86IHN0cmluZyB8IG51bGw7XG4gIHNlcmllc05hbWU/OiBzdHJpbmcgfCBudWxsO1xuICBzZXJpZXNOdW1iZXI/OiBudW1iZXIgfCBudWxsO1xuICBpc2JuPzogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGlzaGVyPzogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGlzaERhdGU/OiBzdHJpbmcgfCBudWxsO1xuICBkZXNjcmlwdGlvbj86IHN0cmluZyB8IG51bGw7XG4gIGNvdmVyVXJsPzogc3RyaW5nIHwgbnVsbDtcbn0pIHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdXBkYXRlQm9va0luRGIoaWQsIGRhdGEpO1xuICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICByZXZhbGlkYXRlUGF0aCgnL2Jvb2tzJyk7XG4gICAgcmV2YWxpZGF0ZVBhdGgoYC9ib29rcy8ke2lkfWApO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxldGVCb29rKGlkOiBudW1iZXIpIHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGVsZXRlQm9va0Zyb21EYihpZCk7XG4gIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgIHJldmFsaWRhdGVQYXRoKCcvYm9va3MnKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEFwcGx5IG1ldGFkYXRhIHRvIGEgYm9vayBhbmQgcHJvY2VzcyBhdXRob3JzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGFwcGx5TWV0YWRhdGFUb0Jvb2soYm9va0lkOiBudW1iZXIsIG1ldGFkYXRhOiBtZXRhZGF0YVNlcnZpY2UuQm9va01ldGFkYXRhKSB7XG4gIC8vIEV4dHJhY3QgcHJpbWFyeSBzZXJpZXMgKGZpcnN0IGluIHRoZSBhcnJheSkgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGNvbnN0IHByaW1hcnlTZXJpZXMgPSBtZXRhZGF0YS5zZXJpZXM/LlswXTtcblxuICBjb25zdCByZXN1bHQgPSBhd2FpdCB1cGRhdGVCb29rSW5EYihib29rSWQsIHtcbiAgICB0aXRsZTogbWV0YWRhdGEudGl0bGUsXG4gICAgYXV0aG9yczogSlNPTi5zdHJpbmdpZnkobWV0YWRhdGEuYXV0aG9ycy5zcGxpdCgnLCAnKSksXG4gICAgcHVibGlzaGVyOiBtZXRhZGF0YS5wdWJsaXNoZXIsXG4gICAgcHVibGlzaERhdGU6IG1ldGFkYXRhLnB1Ymxpc2hEYXRlLFxuICAgIGRlc2NyaXB0aW9uOiBtZXRhZGF0YS5kZXNjcmlwdGlvbixcbiAgICBpc2JuOiBtZXRhZGF0YS5pc2JuLFxuICAgIGNvdmVyVXJsOiBtZXRhZGF0YS5jb3ZlclVybCxcbiAgICBzZXJpZXM6IG1ldGFkYXRhLnNlcmllcyA/IEpTT04uc3RyaW5naWZ5KG1ldGFkYXRhLnNlcmllcykgOiBudWxsLFxuICAgIHNlcmllc05hbWU6IHByaW1hcnlTZXJpZXM/LlswXSA/PyBudWxsLFxuICAgIHNlcmllc051bWJlcjogcHJpbWFyeVNlcmllcz8uWzFdID8/IG51bGwsXG4gICAgbWV0YWRhdGFTb3VyY2U6IG1ldGFkYXRhLnNvdXJjZSxcbiAgICBtZXRhZGF0YUlkOiBtZXRhZGF0YS5zb3VyY2VJZCxcbiAgfSk7XG5cbiAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgcmV2YWxpZGF0ZVBhdGgoJy9ib29rcycpO1xuICAgIHJldmFsaWRhdGVQYXRoKGAvYm9va3MvJHtib29rSWR9YCk7XG5cbiAgICAvLyBQcm9jZXNzIGF1dGhvcnMgaW4gYmFja2dyb3VuZFxuICAgIHByb2Nlc3NBdXRob3JzKG1ldGFkYXRhLmF1dGhvcnMpLmNhdGNoKCgpID0+IHt9KTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ3JlYXRlIGF1dGhvciByZWNvcmRzIGFuZCBmZXRjaCBiaWJsaW9ncmFwaHkgZm9yIG5ldyBhdXRob3JzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NBdXRob3JzKGF1dGhvcnNTdHJpbmc6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBmb3IgKGNvbnN0IG5hbWUgb2YgYXV0aG9yc1N0cmluZy5zcGxpdCgnLCAnKS5maWx0ZXIoYSA9PiBhLnRyaW0oKSkpIHtcbiAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IGdldEF1dGhvckJ5TmFtZShuYW1lKTtcbiAgICBpZiAoIWV4aXN0aW5nPy5sYXN0U3luY2VkKSB7XG4gICAgICBjb25zdCBhdXRob3IgPSBhd2FpdCBnZXRPckNyZWF0ZUF1dGhvcihuYW1lKTtcbiAgICAgIGZldGNoQXV0aG9yTWV0YWRhdGEoYXV0aG9yLmlkKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogU2NvcmUgcmVzdWx0cyBmb3IgcmVsZXZhbmNlIHRvIHNlYXJjaCBxdWVyeVxuICovXG5mdW5jdGlvbiBzY29yZVJlc3VsdChyZXN1bHQ6IG1ldGFkYXRhU2VydmljZS5Cb29rTWV0YWRhdGEsIHF1ZXJ5OiBzdHJpbmcpOiBudW1iZXIge1xuICBsZXQgc2NvcmUgPSAwO1xuICBjb25zdCBxID0gcXVlcnkudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgdCA9IHJlc3VsdC50aXRsZS50b0xvd2VyQ2FzZSgpO1xuXG4gIC8vIFRpdGxlIG1hdGNoIHNjb3JpbmdcbiAgaWYgKHQgPT09IHEpIHNjb3JlICs9IDUwO1xuICBlbHNlIGlmICh0LnN0YXJ0c1dpdGgocSkgfHwgcS5zdGFydHNXaXRoKHQpKSBzY29yZSArPSA0MDtcbiAgZWxzZSBpZiAodC5pbmNsdWRlcyhxKSB8fCBxLmluY2x1ZGVzKHQpKSBzY29yZSArPSAzMDtcbiAgZWxzZSB7XG4gICAgY29uc3QgcVdvcmRzID0gcS5zcGxpdCgvXFxzKy8pLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMik7XG4gICAgY29uc3QgdFdvcmRzID0gdC5zcGxpdCgvXFxzKy8pLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMik7XG4gICAgY29uc3QgbWF0Y2hlcyA9IHFXb3Jkcy5maWx0ZXIocXcgPT4gdFdvcmRzLnNvbWUodHcgPT4gdHcuaW5jbHVkZXMocXcpIHx8IHF3LmluY2x1ZGVzKHR3KSkpO1xuICAgIGlmIChxV29yZHMubGVuZ3RoKSBzY29yZSArPSBNYXRoLm1pbigyNSwgKG1hdGNoZXMubGVuZ3RoIC8gcVdvcmRzLmxlbmd0aCkgKiAyNSk7XG4gIH1cblxuICAvLyBDb21wbGV0ZW5lc3Mgc2NvcmluZ1xuICBpZiAocmVzdWx0LmNvdmVyVXJsKSBzY29yZSArPSAxMDtcbiAgaWYgKHJlc3VsdC5kZXNjcmlwdGlvbj8ubGVuZ3RoICYmIHJlc3VsdC5kZXNjcmlwdGlvbi5sZW5ndGggPiA1MCkgc2NvcmUgKz0gMTA7XG4gIGlmIChyZXN1bHQuc2VyaWVzPy5sZW5ndGgpIHNjb3JlICs9IDg7XG4gIGlmIChyZXN1bHQuYXV0aG9ycyAmJiByZXN1bHQuYXV0aG9ycyAhPT0gJ1Vua25vd24nKSBzY29yZSArPSA1O1xuICBpZiAocmVzdWx0LnB1Ymxpc2hlcikgc2NvcmUgKz0gMjtcbiAgaWYgKHJlc3VsdC5wdWJsaXNoRGF0ZSkgc2NvcmUgKz0gMjtcbiAgaWYgKHJlc3VsdC5pc2JuKSBzY29yZSArPSAyO1xuXG4gIHJldHVybiBzY29yZTtcbn1cblxuLyoqXG4gKiBTZWFyY2ggZm9yIG1ldGFkYXRhIC0gcmV0dXJucyByZXN1bHRzIHNvcnRlZCBieSByZWxldmFuY2VcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNlYXJjaE1ldGFkYXRhKHF1ZXJ5OiBzdHJpbmcpIHtcbiAgY29uc29sZS5sb2coJ3NlYXJjaE1ldGFkYXRhOiBTZWFyY2hpbmcgZm9yOicsIHF1ZXJ5KTtcbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IG1ldGFkYXRhU2VydmljZS5zZWFyY2hCb29rcyhxdWVyeSwgeyBtYXhSZXN1bHRzOiAxNSB9KTtcbiAgY29uc29sZS5sb2coJ3NlYXJjaE1ldGFkYXRhOiBHb3QnLCByZXN1bHRzLmxlbmd0aCwgJ3Jlc3VsdHMnKTtcblxuICAvLyBTb3J0IGJ5IHJlbGV2YW5jZVxuICBjb25zdCBzb3J0ZWQgPSByZXN1bHRzXG4gICAgLm1hcChyID0+ICh7IHJlc3VsdDogciwgc2NvcmU6IHNjb3JlUmVzdWx0KHIsIHF1ZXJ5KSB9KSlcbiAgICAuc29ydCgoYSwgYikgPT4gYi5zY29yZSAtIGEuc2NvcmUpXG4gICAgLm1hcChzciA9PiBzci5yZXN1bHQpO1xuXG4gIGNvbnNvbGUubG9nKCdzZWFyY2hNZXRhZGF0YTogUmV0dXJuaW5nJywgc29ydGVkLmxlbmd0aCwgJ3NvcnRlZCByZXN1bHRzJyk7XG4gIHJldHVybiBzb3J0ZWQ7XG59XG5cbi8qKlxuICogQXBwbHkgbWV0YWRhdGEgZnJvbSBhIHNlbGVjdGVkIHNlYXJjaCByZXN1bHQgdG8gYSBib29rXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseU1ldGFkYXRhKGJvb2tJZDogbnVtYmVyLCBzb3VyY2U6IHN0cmluZywgc291cmNlSWQ6IHN0cmluZykge1xuICAvLyBGZXRjaCBmdWxsIGRldGFpbHMgKHNob3VsZCBhbHJlYWR5IGJlIGNvbXBsZXRlLCBidXQgZW5zdXJlcyBmcmVzaG5lc3MpXG4gIGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgbWV0YWRhdGFTZXJ2aWNlLmdldEJvb2tCeVNvdXJjZUlkKHNvdXJjZSwgc291cmNlSWQpO1xuICBpZiAoIW1ldGFkYXRhKSB7XG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTWV0YWRhdGEgbm90IGZvdW5kJyB9O1xuICB9XG4gIHJldHVybiBhcHBseU1ldGFkYXRhVG9Cb29rKGJvb2tJZCwgbWV0YWRhdGEpO1xufVxuXG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Im1SQW9Ec0IsdUxBQUEifQ==
}),
"[project]/lib/actions/data:c8243c [app-client] (ecmascript) <text/javascript>", ((__turbopack_context__) => {
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
 //# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4vYm9va3MudHMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzZXJ2ZXInO1xuXG5pbXBvcnQgeyByZXZhbGlkYXRlUGF0aCB9IGZyb20gJ25leHQvY2FjaGUnO1xuaW1wb3J0IHtcbiAgZ2V0Qm9va3MgYXMgZ2V0Qm9va3NGcm9tRGIsXG4gIGdldEJvb2tCeUlkLFxuICB1cGRhdGVCb29rIGFzIHVwZGF0ZUJvb2tJbkRiLFxuICBkZWxldGVCb29rIGFzIGRlbGV0ZUJvb2tGcm9tRGIsXG59IGZyb20gJ0AvbGliL3NlcnZpY2VzL3NjYW5uZXInO1xuaW1wb3J0ICogYXMgbWV0YWRhdGFTZXJ2aWNlIGZyb20gJ0AvbGliL3NlcnZpY2VzL21ldGFkYXRhJztcbmltcG9ydCB7IGdldE9yQ3JlYXRlQXV0aG9yLCBmZXRjaEF1dGhvck1ldGFkYXRhLCBnZXRBdXRob3JCeU5hbWUgfSBmcm9tICdAL2xpYi9hY3Rpb25zL2F1dGhvcnMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEdldEJvb2tzUGFyYW1zIHtcbiAgcGFnZT86IG51bWJlcjtcbiAgcGFnZVNpemU/OiBudW1iZXI7XG4gIGxpYnJhcnlJZD86IG51bWJlcjtcbiAgc2VhcmNoPzogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Qm9va3MocGFyYW1zOiBHZXRCb29rc1BhcmFtcyA9IHt9KSB7XG4gIHJldHVybiBnZXRCb29rc0Zyb21EYih7XG4gICAgcGFnZTogcGFyYW1zLnBhZ2UgfHwgMSxcbiAgICBwYWdlU2l6ZTogcGFyYW1zLnBhZ2VTaXplIHx8IDI0LFxuICAgIGxpYnJhcnlJZDogcGFyYW1zLmxpYnJhcnlJZCxcbiAgICBzZWFyY2g6IHBhcmFtcy5zZWFyY2gsXG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Qm9vayhpZDogbnVtYmVyKSB7XG4gIHJldHVybiBnZXRCb29rQnlJZChpZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1cGRhdGVCb29rKGlkOiBudW1iZXIsIGRhdGE6IHtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGF1dGhvcnM/OiBzdHJpbmc7XG4gIHNlcmllcz86IHN0cmluZyB8IG51bGw7XG4gIHNlcmllc05hbWU/OiBzdHJpbmcgfCBudWxsO1xuICBzZXJpZXNOdW1iZXI/OiBudW1iZXIgfCBudWxsO1xuICBpc2JuPzogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGlzaGVyPzogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGlzaERhdGU/OiBzdHJpbmcgfCBudWxsO1xuICBkZXNjcmlwdGlvbj86IHN0cmluZyB8IG51bGw7XG4gIGNvdmVyVXJsPzogc3RyaW5nIHwgbnVsbDtcbn0pIHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdXBkYXRlQm9va0luRGIoaWQsIGRhdGEpO1xuICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICByZXZhbGlkYXRlUGF0aCgnL2Jvb2tzJyk7XG4gICAgcmV2YWxpZGF0ZVBhdGgoYC9ib29rcy8ke2lkfWApO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxldGVCb29rKGlkOiBudW1iZXIpIHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGVsZXRlQm9va0Zyb21EYihpZCk7XG4gIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgIHJldmFsaWRhdGVQYXRoKCcvYm9va3MnKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEFwcGx5IG1ldGFkYXRhIHRvIGEgYm9vayBhbmQgcHJvY2VzcyBhdXRob3JzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGFwcGx5TWV0YWRhdGFUb0Jvb2soYm9va0lkOiBudW1iZXIsIG1ldGFkYXRhOiBtZXRhZGF0YVNlcnZpY2UuQm9va01ldGFkYXRhKSB7XG4gIC8vIEV4dHJhY3QgcHJpbWFyeSBzZXJpZXMgKGZpcnN0IGluIHRoZSBhcnJheSkgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGNvbnN0IHByaW1hcnlTZXJpZXMgPSBtZXRhZGF0YS5zZXJpZXM/LlswXTtcblxuICBjb25zdCByZXN1bHQgPSBhd2FpdCB1cGRhdGVCb29rSW5EYihib29rSWQsIHtcbiAgICB0aXRsZTogbWV0YWRhdGEudGl0bGUsXG4gICAgYXV0aG9yczogSlNPTi5zdHJpbmdpZnkobWV0YWRhdGEuYXV0aG9ycy5zcGxpdCgnLCAnKSksXG4gICAgcHVibGlzaGVyOiBtZXRhZGF0YS5wdWJsaXNoZXIsXG4gICAgcHVibGlzaERhdGU6IG1ldGFkYXRhLnB1Ymxpc2hEYXRlLFxuICAgIGRlc2NyaXB0aW9uOiBtZXRhZGF0YS5kZXNjcmlwdGlvbixcbiAgICBpc2JuOiBtZXRhZGF0YS5pc2JuLFxuICAgIGNvdmVyVXJsOiBtZXRhZGF0YS5jb3ZlclVybCxcbiAgICBzZXJpZXM6IG1ldGFkYXRhLnNlcmllcyA/IEpTT04uc3RyaW5naWZ5KG1ldGFkYXRhLnNlcmllcykgOiBudWxsLFxuICAgIHNlcmllc05hbWU6IHByaW1hcnlTZXJpZXM/LlswXSA/PyBudWxsLFxuICAgIHNlcmllc051bWJlcjogcHJpbWFyeVNlcmllcz8uWzFdID8/IG51bGwsXG4gICAgbWV0YWRhdGFTb3VyY2U6IG1ldGFkYXRhLnNvdXJjZSxcbiAgICBtZXRhZGF0YUlkOiBtZXRhZGF0YS5zb3VyY2VJZCxcbiAgfSk7XG5cbiAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgcmV2YWxpZGF0ZVBhdGgoJy9ib29rcycpO1xuICAgIHJldmFsaWRhdGVQYXRoKGAvYm9va3MvJHtib29rSWR9YCk7XG5cbiAgICAvLyBQcm9jZXNzIGF1dGhvcnMgaW4gYmFja2dyb3VuZFxuICAgIHByb2Nlc3NBdXRob3JzKG1ldGFkYXRhLmF1dGhvcnMpLmNhdGNoKCgpID0+IHt9KTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ3JlYXRlIGF1dGhvciByZWNvcmRzIGFuZCBmZXRjaCBiaWJsaW9ncmFwaHkgZm9yIG5ldyBhdXRob3JzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NBdXRob3JzKGF1dGhvcnNTdHJpbmc6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBmb3IgKGNvbnN0IG5hbWUgb2YgYXV0aG9yc1N0cmluZy5zcGxpdCgnLCAnKS5maWx0ZXIoYSA9PiBhLnRyaW0oKSkpIHtcbiAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IGdldEF1dGhvckJ5TmFtZShuYW1lKTtcbiAgICBpZiAoIWV4aXN0aW5nPy5sYXN0U3luY2VkKSB7XG4gICAgICBjb25zdCBhdXRob3IgPSBhd2FpdCBnZXRPckNyZWF0ZUF1dGhvcihuYW1lKTtcbiAgICAgIGZldGNoQXV0aG9yTWV0YWRhdGEoYXV0aG9yLmlkKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogU2NvcmUgcmVzdWx0cyBmb3IgcmVsZXZhbmNlIHRvIHNlYXJjaCBxdWVyeVxuICovXG5mdW5jdGlvbiBzY29yZVJlc3VsdChyZXN1bHQ6IG1ldGFkYXRhU2VydmljZS5Cb29rTWV0YWRhdGEsIHF1ZXJ5OiBzdHJpbmcpOiBudW1iZXIge1xuICBsZXQgc2NvcmUgPSAwO1xuICBjb25zdCBxID0gcXVlcnkudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgdCA9IHJlc3VsdC50aXRsZS50b0xvd2VyQ2FzZSgpO1xuXG4gIC8vIFRpdGxlIG1hdGNoIHNjb3JpbmdcbiAgaWYgKHQgPT09IHEpIHNjb3JlICs9IDUwO1xuICBlbHNlIGlmICh0LnN0YXJ0c1dpdGgocSkgfHwgcS5zdGFydHNXaXRoKHQpKSBzY29yZSArPSA0MDtcbiAgZWxzZSBpZiAodC5pbmNsdWRlcyhxKSB8fCBxLmluY2x1ZGVzKHQpKSBzY29yZSArPSAzMDtcbiAgZWxzZSB7XG4gICAgY29uc3QgcVdvcmRzID0gcS5zcGxpdCgvXFxzKy8pLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMik7XG4gICAgY29uc3QgdFdvcmRzID0gdC5zcGxpdCgvXFxzKy8pLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMik7XG4gICAgY29uc3QgbWF0Y2hlcyA9IHFXb3Jkcy5maWx0ZXIocXcgPT4gdFdvcmRzLnNvbWUodHcgPT4gdHcuaW5jbHVkZXMocXcpIHx8IHF3LmluY2x1ZGVzKHR3KSkpO1xuICAgIGlmIChxV29yZHMubGVuZ3RoKSBzY29yZSArPSBNYXRoLm1pbigyNSwgKG1hdGNoZXMubGVuZ3RoIC8gcVdvcmRzLmxlbmd0aCkgKiAyNSk7XG4gIH1cblxuICAvLyBDb21wbGV0ZW5lc3Mgc2NvcmluZ1xuICBpZiAocmVzdWx0LmNvdmVyVXJsKSBzY29yZSArPSAxMDtcbiAgaWYgKHJlc3VsdC5kZXNjcmlwdGlvbj8ubGVuZ3RoICYmIHJlc3VsdC5kZXNjcmlwdGlvbi5sZW5ndGggPiA1MCkgc2NvcmUgKz0gMTA7XG4gIGlmIChyZXN1bHQuc2VyaWVzPy5sZW5ndGgpIHNjb3JlICs9IDg7XG4gIGlmIChyZXN1bHQuYXV0aG9ycyAmJiByZXN1bHQuYXV0aG9ycyAhPT0gJ1Vua25vd24nKSBzY29yZSArPSA1O1xuICBpZiAocmVzdWx0LnB1Ymxpc2hlcikgc2NvcmUgKz0gMjtcbiAgaWYgKHJlc3VsdC5wdWJsaXNoRGF0ZSkgc2NvcmUgKz0gMjtcbiAgaWYgKHJlc3VsdC5pc2JuKSBzY29yZSArPSAyO1xuXG4gIHJldHVybiBzY29yZTtcbn1cblxuLyoqXG4gKiBTZWFyY2ggZm9yIG1ldGFkYXRhIC0gcmV0dXJucyByZXN1bHRzIHNvcnRlZCBieSByZWxldmFuY2VcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNlYXJjaE1ldGFkYXRhKHF1ZXJ5OiBzdHJpbmcpIHtcbiAgY29uc29sZS5sb2coJ3NlYXJjaE1ldGFkYXRhOiBTZWFyY2hpbmcgZm9yOicsIHF1ZXJ5KTtcbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IG1ldGFkYXRhU2VydmljZS5zZWFyY2hCb29rcyhxdWVyeSwgeyBtYXhSZXN1bHRzOiAxNSB9KTtcbiAgY29uc29sZS5sb2coJ3NlYXJjaE1ldGFkYXRhOiBHb3QnLCByZXN1bHRzLmxlbmd0aCwgJ3Jlc3VsdHMnKTtcblxuICAvLyBTb3J0IGJ5IHJlbGV2YW5jZVxuICBjb25zdCBzb3J0ZWQgPSByZXN1bHRzXG4gICAgLm1hcChyID0+ICh7IHJlc3VsdDogciwgc2NvcmU6IHNjb3JlUmVzdWx0KHIsIHF1ZXJ5KSB9KSlcbiAgICAuc29ydCgoYSwgYikgPT4gYi5zY29yZSAtIGEuc2NvcmUpXG4gICAgLm1hcChzciA9PiBzci5yZXN1bHQpO1xuXG4gIGNvbnNvbGUubG9nKCdzZWFyY2hNZXRhZGF0YTogUmV0dXJuaW5nJywgc29ydGVkLmxlbmd0aCwgJ3NvcnRlZCByZXN1bHRzJyk7XG4gIHJldHVybiBzb3J0ZWQ7XG59XG5cbi8qKlxuICogQXBwbHkgbWV0YWRhdGEgZnJvbSBhIHNlbGVjdGVkIHNlYXJjaCByZXN1bHQgdG8gYSBib29rXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseU1ldGFkYXRhKGJvb2tJZDogbnVtYmVyLCBzb3VyY2U6IHN0cmluZywgc291cmNlSWQ6IHN0cmluZykge1xuICAvLyBGZXRjaCBmdWxsIGRldGFpbHMgKHNob3VsZCBhbHJlYWR5IGJlIGNvbXBsZXRlLCBidXQgZW5zdXJlcyBmcmVzaG5lc3MpXG4gIGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgbWV0YWRhdGFTZXJ2aWNlLmdldEJvb2tCeVNvdXJjZUlkKHNvdXJjZSwgc291cmNlSWQpO1xuICBpZiAoIW1ldGFkYXRhKSB7XG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTWV0YWRhdGEgbm90IGZvdW5kJyB9O1xuICB9XG4gIHJldHVybiBhcHBseU1ldGFkYXRhVG9Cb29rKGJvb2tJZCwgbWV0YWRhdGEpO1xufVxuXG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6InVSQTRJc0IsMkxBQUEifQ==
}),
"[project]/lib/actions/data:0072e6 [app-client] (ecmascript) <text/javascript>", ((__turbopack_context__) => {
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
 //# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4vYm9va3MudHMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzZXJ2ZXInO1xuXG5pbXBvcnQgeyByZXZhbGlkYXRlUGF0aCB9IGZyb20gJ25leHQvY2FjaGUnO1xuaW1wb3J0IHtcbiAgZ2V0Qm9va3MgYXMgZ2V0Qm9va3NGcm9tRGIsXG4gIGdldEJvb2tCeUlkLFxuICB1cGRhdGVCb29rIGFzIHVwZGF0ZUJvb2tJbkRiLFxuICBkZWxldGVCb29rIGFzIGRlbGV0ZUJvb2tGcm9tRGIsXG59IGZyb20gJ0AvbGliL3NlcnZpY2VzL3NjYW5uZXInO1xuaW1wb3J0ICogYXMgbWV0YWRhdGFTZXJ2aWNlIGZyb20gJ0AvbGliL3NlcnZpY2VzL21ldGFkYXRhJztcbmltcG9ydCB7IGdldE9yQ3JlYXRlQXV0aG9yLCBmZXRjaEF1dGhvck1ldGFkYXRhLCBnZXRBdXRob3JCeU5hbWUgfSBmcm9tICdAL2xpYi9hY3Rpb25zL2F1dGhvcnMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEdldEJvb2tzUGFyYW1zIHtcbiAgcGFnZT86IG51bWJlcjtcbiAgcGFnZVNpemU/OiBudW1iZXI7XG4gIGxpYnJhcnlJZD86IG51bWJlcjtcbiAgc2VhcmNoPzogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Qm9va3MocGFyYW1zOiBHZXRCb29rc1BhcmFtcyA9IHt9KSB7XG4gIHJldHVybiBnZXRCb29rc0Zyb21EYih7XG4gICAgcGFnZTogcGFyYW1zLnBhZ2UgfHwgMSxcbiAgICBwYWdlU2l6ZTogcGFyYW1zLnBhZ2VTaXplIHx8IDI0LFxuICAgIGxpYnJhcnlJZDogcGFyYW1zLmxpYnJhcnlJZCxcbiAgICBzZWFyY2g6IHBhcmFtcy5zZWFyY2gsXG4gIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Qm9vayhpZDogbnVtYmVyKSB7XG4gIHJldHVybiBnZXRCb29rQnlJZChpZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1cGRhdGVCb29rKGlkOiBudW1iZXIsIGRhdGE6IHtcbiAgdGl0bGU/OiBzdHJpbmc7XG4gIGF1dGhvcnM/OiBzdHJpbmc7XG4gIHNlcmllcz86IHN0cmluZyB8IG51bGw7XG4gIHNlcmllc05hbWU/OiBzdHJpbmcgfCBudWxsO1xuICBzZXJpZXNOdW1iZXI/OiBudW1iZXIgfCBudWxsO1xuICBpc2JuPzogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGlzaGVyPzogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGlzaERhdGU/OiBzdHJpbmcgfCBudWxsO1xuICBkZXNjcmlwdGlvbj86IHN0cmluZyB8IG51bGw7XG4gIGNvdmVyVXJsPzogc3RyaW5nIHwgbnVsbDtcbn0pIHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdXBkYXRlQm9va0luRGIoaWQsIGRhdGEpO1xuICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICByZXZhbGlkYXRlUGF0aCgnL2Jvb2tzJyk7XG4gICAgcmV2YWxpZGF0ZVBhdGgoYC9ib29rcy8ke2lkfWApO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxldGVCb29rKGlkOiBudW1iZXIpIHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGVsZXRlQm9va0Zyb21EYihpZCk7XG4gIGlmIChyZXN1bHQuc3VjY2Vzcykge1xuICAgIHJldmFsaWRhdGVQYXRoKCcvYm9va3MnKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEFwcGx5IG1ldGFkYXRhIHRvIGEgYm9vayBhbmQgcHJvY2VzcyBhdXRob3JzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGFwcGx5TWV0YWRhdGFUb0Jvb2soYm9va0lkOiBudW1iZXIsIG1ldGFkYXRhOiBtZXRhZGF0YVNlcnZpY2UuQm9va01ldGFkYXRhKSB7XG4gIC8vIEV4dHJhY3QgcHJpbWFyeSBzZXJpZXMgKGZpcnN0IGluIHRoZSBhcnJheSkgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGNvbnN0IHByaW1hcnlTZXJpZXMgPSBtZXRhZGF0YS5zZXJpZXM/LlswXTtcblxuICBjb25zdCByZXN1bHQgPSBhd2FpdCB1cGRhdGVCb29rSW5EYihib29rSWQsIHtcbiAgICB0aXRsZTogbWV0YWRhdGEudGl0bGUsXG4gICAgYXV0aG9yczogSlNPTi5zdHJpbmdpZnkobWV0YWRhdGEuYXV0aG9ycy5zcGxpdCgnLCAnKSksXG4gICAgcHVibGlzaGVyOiBtZXRhZGF0YS5wdWJsaXNoZXIsXG4gICAgcHVibGlzaERhdGU6IG1ldGFkYXRhLnB1Ymxpc2hEYXRlLFxuICAgIGRlc2NyaXB0aW9uOiBtZXRhZGF0YS5kZXNjcmlwdGlvbixcbiAgICBpc2JuOiBtZXRhZGF0YS5pc2JuLFxuICAgIGNvdmVyVXJsOiBtZXRhZGF0YS5jb3ZlclVybCxcbiAgICBzZXJpZXM6IG1ldGFkYXRhLnNlcmllcyA/IEpTT04uc3RyaW5naWZ5KG1ldGFkYXRhLnNlcmllcykgOiBudWxsLFxuICAgIHNlcmllc05hbWU6IHByaW1hcnlTZXJpZXM/LlswXSA/PyBudWxsLFxuICAgIHNlcmllc051bWJlcjogcHJpbWFyeVNlcmllcz8uWzFdID8/IG51bGwsXG4gICAgbWV0YWRhdGFTb3VyY2U6IG1ldGFkYXRhLnNvdXJjZSxcbiAgICBtZXRhZGF0YUlkOiBtZXRhZGF0YS5zb3VyY2VJZCxcbiAgfSk7XG5cbiAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgcmV2YWxpZGF0ZVBhdGgoJy9ib29rcycpO1xuICAgIHJldmFsaWRhdGVQYXRoKGAvYm9va3MvJHtib29rSWR9YCk7XG5cbiAgICAvLyBQcm9jZXNzIGF1dGhvcnMgaW4gYmFja2dyb3VuZFxuICAgIHByb2Nlc3NBdXRob3JzKG1ldGFkYXRhLmF1dGhvcnMpLmNhdGNoKCgpID0+IHt9KTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ3JlYXRlIGF1dGhvciByZWNvcmRzIGFuZCBmZXRjaCBiaWJsaW9ncmFwaHkgZm9yIG5ldyBhdXRob3JzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NBdXRob3JzKGF1dGhvcnNTdHJpbmc6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBmb3IgKGNvbnN0IG5hbWUgb2YgYXV0aG9yc1N0cmluZy5zcGxpdCgnLCAnKS5maWx0ZXIoYSA9PiBhLnRyaW0oKSkpIHtcbiAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IGdldEF1dGhvckJ5TmFtZShuYW1lKTtcbiAgICBpZiAoIWV4aXN0aW5nPy5sYXN0U3luY2VkKSB7XG4gICAgICBjb25zdCBhdXRob3IgPSBhd2FpdCBnZXRPckNyZWF0ZUF1dGhvcihuYW1lKTtcbiAgICAgIGZldGNoQXV0aG9yTWV0YWRhdGEoYXV0aG9yLmlkKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogU2NvcmUgcmVzdWx0cyBmb3IgcmVsZXZhbmNlIHRvIHNlYXJjaCBxdWVyeVxuICovXG5mdW5jdGlvbiBzY29yZVJlc3VsdChyZXN1bHQ6IG1ldGFkYXRhU2VydmljZS5Cb29rTWV0YWRhdGEsIHF1ZXJ5OiBzdHJpbmcpOiBudW1iZXIge1xuICBsZXQgc2NvcmUgPSAwO1xuICBjb25zdCBxID0gcXVlcnkudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgdCA9IHJlc3VsdC50aXRsZS50b0xvd2VyQ2FzZSgpO1xuXG4gIC8vIFRpdGxlIG1hdGNoIHNjb3JpbmdcbiAgaWYgKHQgPT09IHEpIHNjb3JlICs9IDUwO1xuICBlbHNlIGlmICh0LnN0YXJ0c1dpdGgocSkgfHwgcS5zdGFydHNXaXRoKHQpKSBzY29yZSArPSA0MDtcbiAgZWxzZSBpZiAodC5pbmNsdWRlcyhxKSB8fCBxLmluY2x1ZGVzKHQpKSBzY29yZSArPSAzMDtcbiAgZWxzZSB7XG4gICAgY29uc3QgcVdvcmRzID0gcS5zcGxpdCgvXFxzKy8pLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMik7XG4gICAgY29uc3QgdFdvcmRzID0gdC5zcGxpdCgvXFxzKy8pLmZpbHRlcih3ID0+IHcubGVuZ3RoID4gMik7XG4gICAgY29uc3QgbWF0Y2hlcyA9IHFXb3Jkcy5maWx0ZXIocXcgPT4gdFdvcmRzLnNvbWUodHcgPT4gdHcuaW5jbHVkZXMocXcpIHx8IHF3LmluY2x1ZGVzKHR3KSkpO1xuICAgIGlmIChxV29yZHMubGVuZ3RoKSBzY29yZSArPSBNYXRoLm1pbigyNSwgKG1hdGNoZXMubGVuZ3RoIC8gcVdvcmRzLmxlbmd0aCkgKiAyNSk7XG4gIH1cblxuICAvLyBDb21wbGV0ZW5lc3Mgc2NvcmluZ1xuICBpZiAocmVzdWx0LmNvdmVyVXJsKSBzY29yZSArPSAxMDtcbiAgaWYgKHJlc3VsdC5kZXNjcmlwdGlvbj8ubGVuZ3RoICYmIHJlc3VsdC5kZXNjcmlwdGlvbi5sZW5ndGggPiA1MCkgc2NvcmUgKz0gMTA7XG4gIGlmIChyZXN1bHQuc2VyaWVzPy5sZW5ndGgpIHNjb3JlICs9IDg7XG4gIGlmIChyZXN1bHQuYXV0aG9ycyAmJiByZXN1bHQuYXV0aG9ycyAhPT0gJ1Vua25vd24nKSBzY29yZSArPSA1O1xuICBpZiAocmVzdWx0LnB1Ymxpc2hlcikgc2NvcmUgKz0gMjtcbiAgaWYgKHJlc3VsdC5wdWJsaXNoRGF0ZSkgc2NvcmUgKz0gMjtcbiAgaWYgKHJlc3VsdC5pc2JuKSBzY29yZSArPSAyO1xuXG4gIHJldHVybiBzY29yZTtcbn1cblxuLyoqXG4gKiBTZWFyY2ggZm9yIG1ldGFkYXRhIC0gcmV0dXJucyByZXN1bHRzIHNvcnRlZCBieSByZWxldmFuY2VcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNlYXJjaE1ldGFkYXRhKHF1ZXJ5OiBzdHJpbmcpIHtcbiAgY29uc29sZS5sb2coJ3NlYXJjaE1ldGFkYXRhOiBTZWFyY2hpbmcgZm9yOicsIHF1ZXJ5KTtcbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IG1ldGFkYXRhU2VydmljZS5zZWFyY2hCb29rcyhxdWVyeSwgeyBtYXhSZXN1bHRzOiAxNSB9KTtcbiAgY29uc29sZS5sb2coJ3NlYXJjaE1ldGFkYXRhOiBHb3QnLCByZXN1bHRzLmxlbmd0aCwgJ3Jlc3VsdHMnKTtcblxuICAvLyBTb3J0IGJ5IHJlbGV2YW5jZVxuICBjb25zdCBzb3J0ZWQgPSByZXN1bHRzXG4gICAgLm1hcChyID0+ICh7IHJlc3VsdDogciwgc2NvcmU6IHNjb3JlUmVzdWx0KHIsIHF1ZXJ5KSB9KSlcbiAgICAuc29ydCgoYSwgYikgPT4gYi5zY29yZSAtIGEuc2NvcmUpXG4gICAgLm1hcChzciA9PiBzci5yZXN1bHQpO1xuXG4gIGNvbnNvbGUubG9nKCdzZWFyY2hNZXRhZGF0YTogUmV0dXJuaW5nJywgc29ydGVkLmxlbmd0aCwgJ3NvcnRlZCByZXN1bHRzJyk7XG4gIHJldHVybiBzb3J0ZWQ7XG59XG5cbi8qKlxuICogQXBwbHkgbWV0YWRhdGEgZnJvbSBhIHNlbGVjdGVkIHNlYXJjaCByZXN1bHQgdG8gYSBib29rXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseU1ldGFkYXRhKGJvb2tJZDogbnVtYmVyLCBzb3VyY2U6IHN0cmluZywgc291cmNlSWQ6IHN0cmluZykge1xuICAvLyBGZXRjaCBmdWxsIGRldGFpbHMgKHNob3VsZCBhbHJlYWR5IGJlIGNvbXBsZXRlLCBidXQgZW5zdXJlcyBmcmVzaG5lc3MpXG4gIGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgbWV0YWRhdGFTZXJ2aWNlLmdldEJvb2tCeVNvdXJjZUlkKHNvdXJjZSwgc291cmNlSWQpO1xuICBpZiAoIW1ldGFkYXRhKSB7XG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTWV0YWRhdGEgbm90IGZvdW5kJyB9O1xuICB9XG4gIHJldHVybiBhcHBseU1ldGFkYXRhVG9Cb29rKGJvb2tJZCwgbWV0YWRhdGEpO1xufVxuXG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6InNSQThKc0IsMExBQUEifQ==
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
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$c8243c__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__ = __turbopack_context__.i("[project]/lib/actions/data:c8243c [app-client] (ecmascript) <text/javascript>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$0072e6__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__ = __turbopack_context__.i("[project]/lib/actions/data:0072e6 [app-client] (ecmascript) <text/javascript>");
;
var _s = __turbopack_context__.k.signature();
'use client';
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
    // Request ID to prevent race conditions
    const requestIdRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const handleSearch = async (e)=>{
        e.preventDefault();
        if (!query.trim()) return;
        const currentRequestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);
        try {
            const searchResults = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$c8243c__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__["searchMetadata"])(query);
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
        const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$0072e6__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__["applyMetadata"])(book.id, metadata.source, metadata.sourceId);
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
                lineNumber: 79,
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
                                lineNumber: 83,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-sm text-shelvarr-text-muted mt-1",
                                children: "Search for book metadata from Hardcover"
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 84,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 82,
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
                                    lineNumber: 91,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "submit",
                                    disabled: loading || !query.trim(),
                                    className: "bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50",
                                    children: loading ? 'Searching...' : 'Search'
                                }, void 0, false, {
                                    fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                    lineNumber: 98,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/books/MetadataSearchModal.tsx",
                            lineNumber: 90,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 89,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "overflow-y-auto max-h-[50vh]",
                        children: [
                            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "p-4 text-center text-shelvarr-text-muted",
                                children: error
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 110,
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
                                        lineNumber: 116,
                                        columnNumber: 17
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 114,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 108,
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
                            lineNumber: 128,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 127,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                lineNumber: 81,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/books/MetadataSearchModal.tsx",
        lineNumber: 78,
        columnNumber: 5
    }, this);
}
_s(MetadataSearchModal, "mSRrOxf9s9Unt7W9AUpID2HTYH0=", false, function() {
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
                    lineNumber: 153,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-full h-full flex items-center justify-center text-shelvarr-text-muted",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(BookIcon, {}, void 0, false, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 160,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/components/books/MetadataSearchModal.tsx",
                    lineNumber: 159,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                lineNumber: 151,
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
                                        lineNumber: 168,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm text-shelvarr-text-muted",
                                        children: metadata.authors
                                    }, void 0, false, {
                                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                        lineNumber: 169,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 167,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "flex-shrink-0 text-xs px-2 py-0.5 bg-shelvarr-bg rounded text-shelvarr-text-muted",
                                children: metadata.source
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 171,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 166,
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
                                lineNumber: 179,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 177,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm text-shelvarr-text-muted line-clamp-2 mt-2",
                        children: metadata.description || 'No description available'
                    }, void 0, false, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 187,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-2 flex items-center gap-4 text-xs text-shelvarr-text-muted",
                        children: [
                            metadata.publishDate && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: metadata.publishDate
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 192,
                                columnNumber: 36
                            }, this),
                            metadata.publisher && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: metadata.publisher
                            }, void 0, false, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 193,
                                columnNumber: 34
                            }, this),
                            metadata.isbn && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    "ISBN: ",
                                    metadata.isbn
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                                lineNumber: 194,
                                columnNumber: 29
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/books/MetadataSearchModal.tsx",
                        lineNumber: 191,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                lineNumber: 165,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: onApply,
                disabled: applying,
                className: "flex-shrink-0 self-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50",
                children: applying ? 'Applying...' : 'Apply'
            }, void 0, false, {
                fileName: "[project]/components/books/MetadataSearchModal.tsx",
                lineNumber: 198,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/books/MetadataSearchModal.tsx",
        lineNumber: 150,
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
            lineNumber: 212,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/books/MetadataSearchModal.tsx",
        lineNumber: 211,
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
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$8972c4__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__ = __turbopack_context__.i("[project]/lib/actions/data:8972c4 [app-client] (ecmascript) <text/javascript>");
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
    const [initialSearchQuery, setInitialSearchQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])();
    const hasMatch = !!book.metadataSource;
    const handleSearchMatch = ()=>{
        setInitialSearchQuery(undefined);
        setShowMetadataSearch(true);
    };
    const handleFixMatch = ()=>{
        setInitialSearchQuery(getFilenameFromPath(book.filePath));
        setShowMetadataSearch(true);
    };
    const handleDelete = async ()=>{
        if (!confirm('Delete this book from the database? The file will not be deleted.')) {
            return;
        }
        setLoading(true);
        const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$actions$2f$data$3a$8972c4__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__["deleteBook"])(book.id);
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
                        onClick: handleSearchMatch,
                        disabled: loading,
                        className: "w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50",
                        children: hasMatch ? 'Fix Match' : 'Search Match'
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookActions.tsx",
                        lineNumber: 56,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: handleDelete,
                        disabled: loading,
                        className: "w-full bg-shelvarr-surface hover:bg-red-900/20 text-red-400 border border-shelvarr-border px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50",
                        children: loading ? 'Deleting...' : 'Delete from Database'
                    }, void 0, false, {
                        fileName: "[project]/components/books/BookActions.tsx",
                        lineNumber: 64,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/books/BookActions.tsx",
                lineNumber: 55,
                columnNumber: 7
            }, this),
            showMetadataSearch && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$books$2f$MetadataSearchModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MetadataSearchModal"], {
                book: book,
                initialQuery: hasMatch ? getFilenameFromPath(book.filePath) : undefined,
                onClose: ()=>setShowMetadataSearch(false)
            }, void 0, false, {
                fileName: "[project]/components/books/BookActions.tsx",
                lineNumber: 74,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true);
}
_s(BookActions, "b8t6a1spxS6v4jDjSZBbt/m3znU=", false, function() {
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

//# sourceMappingURL=_21f5ffda._.js.map
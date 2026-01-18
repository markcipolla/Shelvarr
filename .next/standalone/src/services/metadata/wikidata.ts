/**
 * Wikidata SPARQL API Service
 * https://query.wikidata.org/
 *
 * Structured data about books with series relationships.
 * No API key required.
 * Properties: P212 (ISBN-13), P957 (ISBN-10), P179 (part of series), P50 (author)
 */

import config from '../../config/index.js';

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

export interface WikidataResult {
  book: { value: string };
  bookLabel: { value: string };
  authorLabel?: { value: string };
  publisherLabel?: { value: string };
  publicationDate?: { value: string };
  isbn13?: { value: string };
  isbn10?: { value: string };
  seriesLabel?: { value: string };
  seriesOrdinal?: { value: string };
  genreLabel?: { value: string };
  description?: { value: string };
}

export interface WikidataSparqlResponse {
  results: {
    bindings: WikidataResult[];
  };
}

export interface BookMetadata {
  title: string;
  authors: string;
  publisher?: string;
  publishDate?: string;
  description?: string;
  isbn?: string;
  coverUrl?: string;
  pageCount?: number;
  categories?: string[];
  language?: string;
  seriesName?: string;
  seriesNumber?: number;
  source: 'wikidata';
  sourceId: string;
}

// Rate limiting
let lastRequestTime = 0;
const minInterval = 1000 / (config.rateLimits.wikidata / 60);

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < minInterval) {
    await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
  return fetch(url, {
    headers: {
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'Shelvarr/1.0 (https://github.com/markcipolla/Shelvarr)',
    },
  });
}

/**
 * Execute a SPARQL query
 */
async function executeSparql(query: string): Promise<WikidataResult[]> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;

  try {
    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new Error(`Wikidata SPARQL error: ${response.status}`);
    }

    const data = await response.json() as WikidataSparqlResponse;
    return data.results.bindings;
  } catch (error) {
    console.error('Wikidata SPARQL error:', error);
    throw error;
  }
}

/**
 * Search for books by title
 */
export async function searchBooks(query: string, maxResults = 10): Promise<BookMetadata[]> {
  if (!query.trim()) {
    return [];
  }

  // Escape special characters in the search query
  const escapedQuery = query.replace(/['"\\]/g, '\\$&').toLowerCase();

  const sparqlQuery = `
    SELECT DISTINCT ?book ?bookLabel ?authorLabel ?publisherLabel ?publicationDate ?isbn13 ?isbn10 ?seriesLabel ?seriesOrdinal ?genreLabel WHERE {
      ?book wdt:P31/wdt:P279* wd:Q7725634 .
      ?book rdfs:label ?bookLabel .
      FILTER(LANG(?bookLabel) = "en")
      FILTER(CONTAINS(LCASE(?bookLabel), "${escapedQuery}"))

      OPTIONAL { ?book wdt:P50 ?author . ?author rdfs:label ?authorLabel . FILTER(LANG(?authorLabel) = "en") }
      OPTIONAL { ?book wdt:P123 ?publisher . ?publisher rdfs:label ?publisherLabel . FILTER(LANG(?publisherLabel) = "en") }
      OPTIONAL { ?book wdt:P577 ?publicationDate }
      OPTIONAL { ?book wdt:P212 ?isbn13 }
      OPTIONAL { ?book wdt:P957 ?isbn10 }
      OPTIONAL {
        ?book p:P179 ?seriesStatement .
        ?seriesStatement ps:P179 ?series .
        ?series rdfs:label ?seriesLabel .
        FILTER(LANG(?seriesLabel) = "en")
        OPTIONAL { ?seriesStatement pq:P1545 ?seriesOrdinal }
      }
      OPTIONAL { ?book wdt:P136 ?genre . ?genre rdfs:label ?genreLabel . FILTER(LANG(?genreLabel) = "en") }
    }
    LIMIT ${maxResults}
  `;

  try {
    const results = await executeSparql(sparqlQuery);
    return deduplicateAndConvert(results);
  } catch (error) {
    console.error('Wikidata search error:', error);
    return [];
  }
}

/**
 * Search by ISBN
 */
export async function searchByIsbn(isbn: string): Promise<BookMetadata | null> {
  const cleanIsbn = isbn.replace(/[-\s]/g, '');

  // Determine if ISBN-10 or ISBN-13
  const isIsbn13 = cleanIsbn.length === 13;
  const property = isIsbn13 ? 'P212' : 'P957';

  const sparqlQuery = `
    SELECT DISTINCT ?book ?bookLabel ?authorLabel ?publisherLabel ?publicationDate ?isbn13 ?isbn10 ?seriesLabel ?seriesOrdinal ?genreLabel WHERE {
      ?book wdt:${property} "${cleanIsbn}" .
      ?book rdfs:label ?bookLabel .
      FILTER(LANG(?bookLabel) = "en")

      OPTIONAL { ?book wdt:P50 ?author . ?author rdfs:label ?authorLabel . FILTER(LANG(?authorLabel) = "en") }
      OPTIONAL { ?book wdt:P123 ?publisher . ?publisher rdfs:label ?publisherLabel . FILTER(LANG(?publisherLabel) = "en") }
      OPTIONAL { ?book wdt:P577 ?publicationDate }
      OPTIONAL { ?book wdt:P212 ?isbn13 }
      OPTIONAL { ?book wdt:P957 ?isbn10 }
      OPTIONAL {
        ?book p:P179 ?seriesStatement .
        ?seriesStatement ps:P179 ?series .
        ?series rdfs:label ?seriesLabel .
        FILTER(LANG(?seriesLabel) = "en")
        OPTIONAL { ?seriesStatement pq:P1545 ?seriesOrdinal }
      }
      OPTIONAL { ?book wdt:P136 ?genre . ?genre rdfs:label ?genreLabel . FILTER(LANG(?genreLabel) = "en") }
    }
    LIMIT 1
  `;

  try {
    const results = await executeSparql(sparqlQuery);
    const metadata = deduplicateAndConvert(results);
    return metadata[0] || null;
  } catch (error) {
    console.error('Wikidata ISBN search error:', error);
    return null;
  }
}

/**
 * Search by title and author
 */
export async function searchByTitleAuthor(title: string, author?: string): Promise<BookMetadata[]> {
  const query = author ? `${title} ${author}` : title;
  return searchBooks(query);
}

/**
 * Get book by Wikidata entity ID (e.g., Q11692023)
 */
export async function getBookById(id: string): Promise<BookMetadata | null> {
  // Ensure ID has Q prefix
  const entityId = id.startsWith('Q') ? id : `Q${id}`;

  const sparqlQuery = `
    SELECT DISTINCT ?book ?bookLabel ?authorLabel ?publisherLabel ?publicationDate ?isbn13 ?isbn10 ?seriesLabel ?seriesOrdinal ?genreLabel ?description WHERE {
      BIND(wd:${entityId} AS ?book)
      ?book rdfs:label ?bookLabel .
      FILTER(LANG(?bookLabel) = "en")

      OPTIONAL { ?book wdt:P50 ?author . ?author rdfs:label ?authorLabel . FILTER(LANG(?authorLabel) = "en") }
      OPTIONAL { ?book wdt:P123 ?publisher . ?publisher rdfs:label ?publisherLabel . FILTER(LANG(?publisherLabel) = "en") }
      OPTIONAL { ?book wdt:P577 ?publicationDate }
      OPTIONAL { ?book wdt:P212 ?isbn13 }
      OPTIONAL { ?book wdt:P957 ?isbn10 }
      OPTIONAL {
        ?book p:P179 ?seriesStatement .
        ?seriesStatement ps:P179 ?series .
        ?series rdfs:label ?seriesLabel .
        FILTER(LANG(?seriesLabel) = "en")
        OPTIONAL { ?seriesStatement pq:P1545 ?seriesOrdinal }
      }
      OPTIONAL { ?book wdt:P136 ?genre . ?genre rdfs:label ?genreLabel . FILTER(LANG(?genreLabel) = "en") }
      OPTIONAL { ?book schema:description ?description . FILTER(LANG(?description) = "en") }
    }
    LIMIT 1
  `;

  try {
    const results = await executeSparql(sparqlQuery);
    const metadata = deduplicateAndConvert(results);
    return metadata[0] || null;
  } catch (error) {
    console.error('Wikidata get book error:', error);
    return null;
  }
}

/**
 * Deduplicate results and convert to our metadata format
 * (Wikidata can return multiple rows for the same book with different values)
 */
function deduplicateAndConvert(results: WikidataResult[]): BookMetadata[] {
  const bookMap = new Map<string, BookMetadata>();

  for (const result of results) {
    const entityId = result.book.value.split('/').pop() || '';

    if (!bookMap.has(entityId)) {
      // Parse publication date
      let publishDate: string | undefined;
      if (result.publicationDate?.value) {
        const match = result.publicationDate.value.match(/(\d{4})/);
        if (match) {
          publishDate = match[1];
        }
      }

      // Parse series number
      let seriesNumber: number | undefined;
      if (result.seriesOrdinal?.value) {
        const num = parseFloat(result.seriesOrdinal.value);
        if (!isNaN(num)) {
          seriesNumber = num;
        }
      }

      bookMap.set(entityId, {
        title: result.bookLabel.value,
        authors: result.authorLabel?.value || 'Unknown',
        publisher: result.publisherLabel?.value,
        publishDate,
        description: result.description?.value,
        isbn: result.isbn13?.value || result.isbn10?.value,
        categories: result.genreLabel ? [result.genreLabel.value] : undefined,
        seriesName: result.seriesLabel?.value,
        seriesNumber,
        source: 'wikidata',
        sourceId: entityId,
      });
    } else {
      // Merge additional data (e.g., multiple genres)
      const existing = bookMap.get(entityId)!;
      if (result.genreLabel?.value && existing.categories) {
        if (!existing.categories.includes(result.genreLabel.value)) {
          existing.categories.push(result.genreLabel.value);
        }
      }
    }
  }

  return Array.from(bookMap.values());
}

/**
 * Check if this provider is configured (always true - no API key needed)
 */
export function isConfigured(): boolean {
  return true;
}

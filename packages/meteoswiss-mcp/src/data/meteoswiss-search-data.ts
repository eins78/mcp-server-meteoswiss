import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJson, HttpRequestError } from '../support/http-communication.js';
import { debugData } from '../support/logging.js';
import type {
  SearchMeteoSwissContentInput,
  SearchResultItem,
  SearchResults,
} from '../schemas/meteoswiss-search.js';

export type { SearchResultItem, SearchResults } from '../schemas/meteoswiss-search.js';

// Solr response types
interface SolrDocument {
  path?: string;
  id?: string;
  title?: string;
  lead?: string;
  description?: string;
  pageType?: string;
  modificationDate?: string;
  publicationDate?: string;
  content?: string;
}

interface SolrResponse {
  response?: {
    numFound?: number;
    docs?: SolrDocument[];
  };
}

// Language to domain mapping for MeteoSwiss
const LANGUAGE_DOMAIN_MAP: Record<string, string> = {
  de: 'https://www.meteoschweiz.admin.ch',
  fr: 'https://www.meteosuisse.admin.ch',
  it: 'https://www.meteosvizzera.admin.ch',
  en: 'https://www.meteoswiss.admin.ch',
};

// Base path for the search API
const SEARCH_API_PATH = '/api/search';

// Test fixtures location
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_FIXTURES_DEV_PATH = path.resolve(__dirname, '../../test/__fixtures__/search');
const TEST_FIXTURES_PROD_PATH = path.resolve(__dirname, '../test/__fixtures__/search');
const TEST_FIXTURES_ROOT = existsSync(TEST_FIXTURES_DEV_PATH)
  ? TEST_FIXTURES_DEV_PATH
  : TEST_FIXTURES_PROD_PATH;

const USE_TEST_FIXTURES = process.env.USE_TEST_FIXTURES === 'true';

/**
 * The upstream MeteoSwiss Solr search API ignores the `rows` parameter and
 * always returns exactly 10 documents per request (verified against the live
 * API: `rows=3` and `rows=30` both return 10 of N results). We mirror that
 * fixed page size exactly rather than expose a `pageSize` knob that upstream
 * doesn't honor — see GitHub issue #110, DECISION-1.
 */
const UPSTREAM_PAGE_SIZE = 10;

/**
 * Search MeteoSwiss content
 *
 * @param params Search parameters
 * @returns Search results
 */
export async function searchMeteoSwissContent(
  params: SearchMeteoSwissContentInput
): Promise<SearchResults> {
  const { query, language = 'de', contentType, page = 1, sort = 'relevance' } = params;

  debugData('searchMeteoSwissContent called with params: %o', {
    query,
    language,
    contentType,
    page,
    sort,
  });

  if (USE_TEST_FIXTURES) {
    debugData('Using test fixtures for search');
    return searchFromTestFixtures(query, language, contentType, page, sort);
  }

  debugData('Using live API for search');
  return searchFromApi(query, language, contentType, page, sort);
}

/**
 * Search from the live API
 */
async function searchFromApi(
  query: string,
  language: string,
  contentType?: string,
  page: number = 1,
  sort: string = 'relevance'
): Promise<SearchResults> {
  const tenant = 'mchweb';
  const pageGroup = 'project';
  const languageCode = `public-${language}`;

  // Build the URL
  const baseDomain = LANGUAGE_DOMAIN_MAP[language] || LANGUAGE_DOMAIN_MAP.de;
  const url = new URL(`${baseDomain}${SEARCH_API_PATH}/${languageCode}/search/results.json`);

  // The MeteoSwiss API doesn't handle URL-encoded spaces properly in multi-word queries.
  // It returns 400 errors for queries with spaces, even when properly encoded.
  // However, it accepts '+' as a literal character to search for multiple terms.
  // So we replace spaces with '+' to make the API search for all terms.
  const processedQuery = query.replace(/\s+/g, '+');
  url.searchParams.append('fullText', processedQuery);
  url.searchParams.append('tenant', tenant);
  url.searchParams.append('pageGroup', pageGroup);
  // Upstream ignores `rows` and always returns UPSTREAM_PAGE_SIZE docs, but it
  // does honor `start` — so the offset must be computed from the fixed page
  // size, not a requested one, for `page` navigation to be consistent.
  url.searchParams.append('rows', String(UPSTREAM_PAGE_SIZE));
  url.searchParams.append('start', String((page - 1) * UPSTREAM_PAGE_SIZE));

  // Always set content type, defaulting to 'content' to exclude application pages
  // Only allow specific content types that are relevant
  const allowedContentTypes = ['content', 'press-release', 'blog-article', 'publication'];
  if (contentType && allowedContentTypes.includes(contentType)) {
    url.searchParams.append('type', contentType);
  } else {
    // Default to 'content' type to exclude application pages and other irrelevant types
    url.searchParams.append('type', 'content');
  }

  // Map sort parameter to API format
  const sortMap: Record<string, string> = {
    relevance: 'score desc',
    'date-desc': 'publicationDate desc,sortTitle asc',
    'date-asc': 'publicationDate asc,sortTitle asc',
  };
  const sortValue = sortMap[sort] || 'score desc';
  url.searchParams.append('sort', sortValue);

  try {
    debugData('Searching MeteoSwiss API: %s', url.toString());
    const response = await fetchJson<SolrResponse>(url.toString());

    debugData('API response received: %d documents found', response.response?.numFound || 0);

    // Transform the Solr response to our format
    const results: SearchResultItem[] =
      response.response?.docs?.map((doc) => ({
        id: doc.path ? `${baseDomain}${doc.path}` : doc.id || '',
        title: doc.title || 'Untitled',
        url: doc.path ? `${baseDomain}${doc.path}` : '',
        description: doc.lead || doc.description || '',
        contentType: doc.pageType || 'content',
        lastModified: doc.modificationDate || doc.publicationDate,
        path: doc.path,
        lead: doc.lead,
        publicationDate: doc.publicationDate,
      })) || [];

    debugData('Transformed %d search results', results.length);

    return {
      totalResults: response.response?.numFound || 0,
      page,
      // Report what upstream actually delivered, not a requested value it
      // ignores — see UPSTREAM_PAGE_SIZE comment above.
      pageSize: results.length,
      results,
    };
  } catch (error) {
    debugData('Search API error: %o', error);
    if (error instanceof HttpRequestError) {
      throw new Error(
        `Failed to search MeteoSwiss content: HTTP error ${error.statusCode || 'unknown'}`,
        { cause: error }
      );
    }
    throw new Error(
      `Failed to search MeteoSwiss content: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

/**
 * Search from test fixtures
 */
async function searchFromTestFixtures(
  query: string,
  language: string,
  contentType?: string,
  page: number = 1,
  sort: string = 'relevance'
): Promise<SearchResults> {
  // Get the base domain for this language
  const baseDomain = LANGUAGE_DOMAIN_MAP[language] || LANGUAGE_DOMAIN_MAP.de;
  // Replace spaces with hyphens for fixture filename, consistent with how we name fixture files
  const fixtureFile = path.join(
    TEST_FIXTURES_ROOT,
    language,
    `${query
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '-')}-results.json`
  );

  debugData('Looking for test fixture: %s', fixtureFile);

  // Try exact match first
  if (existsSync(fixtureFile)) {
    debugData('Loading test fixture from: %s', fixtureFile);
    const data = await fs.readFile(fixtureFile, 'utf-8');
    const response = JSON.parse(data) as SolrResponse;

    // Transform fixture data to our format
    const results: SearchResultItem[] =
      response.response?.docs?.map((doc) => ({
        id: doc.path ? `${baseDomain}${doc.path}` : doc.id || '',
        title: doc.title || 'Untitled',
        url: doc.path ? `${baseDomain}${doc.path}` : '',
        description: doc.lead || doc.description || '',
        contentType: doc.pageType || 'content',
        lastModified: doc.modificationDate || doc.publicationDate,
        path: doc.path,
        lead: doc.lead,
        publicationDate: doc.publicationDate,
      })) || [];

    // Apply sorting
    if (sort === 'date-desc') {
      results.sort((a, b) => {
        const dateA = new Date(a.lastModified || a.publicationDate || 0).getTime();
        const dateB = new Date(b.lastModified || b.publicationDate || 0).getTime();
        return dateB - dateA;
      });
    } else if (sort === 'date-asc') {
      results.sort((a, b) => {
        const dateA = new Date(a.lastModified || a.publicationDate || 0).getTime();
        const dateB = new Date(b.lastModified || b.publicationDate || 0).getTime();
        return dateA - dateB;
      });
    }

    // Mirror the live API's fixed upstream page size (see UPSTREAM_PAGE_SIZE).
    const startIndex = (page - 1) * UPSTREAM_PAGE_SIZE;
    const paginatedResults = results.slice(startIndex, startIndex + UPSTREAM_PAGE_SIZE);

    return {
      totalResults: response.response?.numFound || 0,
      page,
      pageSize: paginatedResults.length,
      results: paginatedResults,
    };
  }

  // Try to find any fixture file for the language
  const langDir = path.join(TEST_FIXTURES_ROOT, language);
  if (existsSync(langDir)) {
    const files = await fs.readdir(langDir);
    if (files.length > 0 && files[0]) {
      const firstFile = files[0];
      const data = await fs.readFile(path.join(langDir, firstFile), 'utf-8');
      const response = JSON.parse(data) as SolrResponse;

      // Filter results by query in fixtures
      const allDocs = response.response?.docs || [];
      const filteredDocs = allDocs.filter(
        (doc: SolrDocument) =>
          doc.title?.toLowerCase().includes(query.toLowerCase()) ||
          doc.lead?.toLowerCase().includes(query.toLowerCase()) ||
          doc.content?.toLowerCase().includes(query.toLowerCase())
      );

      const baseDomain = LANGUAGE_DOMAIN_MAP[language] || LANGUAGE_DOMAIN_MAP.de;
      const results: SearchResultItem[] = filteredDocs.map((doc: SolrDocument) => ({
        id: doc.path ? `${baseDomain}${doc.path}` : doc.id || '',
        title: doc.title || 'Untitled',
        url: doc.path ? `${baseDomain}${doc.path}` : '',
        description: doc.lead || doc.description || '',
        contentType: doc.pageType || 'content',
        lastModified: doc.modificationDate || doc.publicationDate,
        path: doc.path,
        lead: doc.lead,
        publicationDate: doc.publicationDate,
      }));

      // Mirror the live API's fixed upstream page size (see UPSTREAM_PAGE_SIZE).
      const startIndex = (page - 1) * UPSTREAM_PAGE_SIZE;
      const paginatedResults = results.slice(startIndex, startIndex + UPSTREAM_PAGE_SIZE);

      return {
        totalResults: results.length,
        page,
        pageSize: paginatedResults.length,
        results: paginatedResults,
      };
    }
  }

  // Return empty results if no fixtures found
  return {
    totalResults: 0,
    page,
    pageSize: 0,
    results: [],
  };
}

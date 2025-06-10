import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJson, HttpRequestError } from '../support/http-communication.js';
import { debugData } from '../support/logging.js';
import type { SearchMeteoSwissContentInput } from '../schemas/meteoswiss-search.js';

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
 * Search result item from the API
 */
export interface SearchResultItem {
  id: string;
  title: string;
  url: string;
  description?: string;
  contentType?: string;
  lastModified?: string;
  path?: string;
  lead?: string;
  publicationDate?: string;
}

/**
 * Search results response
 */
export interface SearchResults {
  totalResults: number;
  page: number;
  pageSize: number;
  results: SearchResultItem[];
}

/**
 * Search MeteoSwiss content
 *
 * @param params Search parameters
 * @returns Search results
 */
export async function searchMeteoSwissContent(
  params: SearchMeteoSwissContentInput
): Promise<SearchResults> {
  const {
    query,
    language = 'de',
    contentType,
    page = 1,
    pageSize = 12,
    sort = 'relevance',
  } = params;

  if (USE_TEST_FIXTURES) {
    return searchFromTestFixtures(query, language, contentType, page, pageSize, sort);
  }

  return searchFromApi(query, language, contentType, page, pageSize, sort);
}

/**
 * Search from the live API
 */
async function searchFromApi(
  query: string,
  language: string,
  contentType?: string,
  page: number = 1,
  pageSize: number = 12,
  sort: string = 'relevance'
): Promise<SearchResults> {
  const tenant = 'mchweb';
  const pageGroup = 'project';
  const languageCode = `public-${language}`;

  // Build the URL
  const baseDomain = LANGUAGE_DOMAIN_MAP[language] || LANGUAGE_DOMAIN_MAP.de;
  const url = new URL(`${baseDomain}${SEARCH_API_PATH}/${languageCode}/search/results.json`);
  url.searchParams.append('fullText', query);
  url.searchParams.append('tenant', tenant);
  url.searchParams.append('pageGroup', pageGroup);
  url.searchParams.append('rows', String(pageSize));
  url.searchParams.append('start', String((page - 1) * pageSize));

  if (contentType) {
    url.searchParams.append('type', contentType);
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

    return {
      totalResults: response.response?.numFound || 0,
      page,
      pageSize,
      results,
    };
  } catch (error) {
    if (error instanceof HttpRequestError) {
      throw new Error(
        `Failed to search MeteoSwiss content: HTTP error ${error.statusCode || 'unknown'}`
      );
    }
    throw new Error(
      `Failed to search MeteoSwiss content: ${error instanceof Error ? error.message : String(error)}`
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
  pageSize: number = 12,
  sort: string = 'relevance'
): Promise<SearchResults> {
  // Get the base domain for this language
  const baseDomain = LANGUAGE_DOMAIN_MAP[language] || LANGUAGE_DOMAIN_MAP.de;
  const fixtureFile = path.join(
    TEST_FIXTURES_ROOT,
    language,
    `${query.toLowerCase().replace(/[^a-z0-9]/g, '-')}-results.json`
  );

  // Try exact match first
  if (existsSync(fixtureFile)) {
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

    // Apply pagination
    const startIndex = (page - 1) * pageSize;
    const paginatedResults = results.slice(startIndex, startIndex + pageSize);

    return {
      totalResults: response.response?.numFound || 0,
      page,
      pageSize,
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

      // Apply pagination
      const startIndex = (page - 1) * pageSize;
      const paginatedResults = results.slice(startIndex, startIndex + pageSize);

      return {
        totalResults: results.length,
        page,
        pageSize,
        results: paginatedResults,
      };
    }
  }

  // Return empty results if no fixtures found
  return {
    totalResults: 0,
    page: 1,
    pageSize: 12,
    results: [],
  };
}

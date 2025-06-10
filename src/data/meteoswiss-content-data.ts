import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { fetchHtml, HttpRequestError } from '../support/http-communication.js';
import { debugData } from '../support/logging.js';
import type { FetchMeteoSwissContentInput } from '../schemas/meteoswiss-fetch.js';

// Test fixtures location
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_FIXTURES_DEV_PATH = path.resolve(__dirname, '../../test/__fixtures__/content');
const TEST_FIXTURES_PROD_PATH = path.resolve(__dirname, '../test/__fixtures__/content');
const TEST_FIXTURES_ROOT = existsSync(TEST_FIXTURES_DEV_PATH)
  ? TEST_FIXTURES_DEV_PATH
  : TEST_FIXTURES_PROD_PATH;

const USE_TEST_FIXTURES = process.env.USE_TEST_FIXTURES === 'true';

// Get Document type from JSDOM
type Document = InstanceType<typeof JSDOM>['window']['document'];

// Allowed MeteoSwiss domains
const ALLOWED_DOMAINS = [
  'www.meteoschweiz.admin.ch',
  'www.meteosuisse.admin.ch',
  'www.meteosvizzera.admin.ch',
  'www.meteoswiss.admin.ch',
  'meteoschweiz.admin.ch',
  'meteosuisse.admin.ch',
  'meteosvizzera.admin.ch',
  'meteoswiss.admin.ch',
];

// Initialize Turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

// Add GFM plugin for better markdown support (tables, strikethrough, task lists)
turndownService.use(gfm);

/**
 * Content response structure
 */
export interface ContentResponse {
  id: string;
  title?: string;
  content: string;
  format: 'markdown' | 'text';
  metadata?: {
    url: string;
    language?: string;
    lastModified?: string;
    contentType?: string;
    keywords?: string[];
    description?: string;
  };
}

/**
 * Fetch MeteoSwiss content by ID
 *
 * @param params Fetch parameters
 * @returns Content response
 */
export async function fetchMeteoSwissContent(
  params: FetchMeteoSwissContentInput
): Promise<ContentResponse> {
  const { id, format = 'markdown', includeMetadata = true } = params;

  if (USE_TEST_FIXTURES) {
    return fetchFromTestFixtures(id, format, includeMetadata);
  }

  return fetchFromWeb(id, format, includeMetadata);
}

/**
 * Fetch content from the web
 */
async function fetchFromWeb(
  id: string,
  format: 'markdown' | 'text',
  includeMetadata: boolean
): Promise<ContentResponse> {
  // The ID should now be a full URL from the search tool
  const url = id.startsWith('http')
    ? id
    : `https://www.meteoswiss.admin.ch${id.startsWith('/') ? id : '/' + id}`; // Fallback for backward compatibility

  // Validate the URL is from an allowed MeteoSwiss domain
  try {
    const parsedUrl = new URL(url);
    if (!ALLOWED_DOMAINS.includes(parsedUrl.hostname)) {
      throw new Error(
        `Invalid domain: ${parsedUrl.hostname}. Only MeteoSwiss domains are allowed.`
      );
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid URL: ${url}`);
    }
    throw error;
  }

  try {
    debugData('Fetching content from: %s', url);
    const html = await fetchHtml(url);

    return processHtmlContent(html, id, url, format, includeMetadata);
  } catch (error) {
    if (error instanceof HttpRequestError && error.statusCode === 404) {
      throw new Error(`Content not found: ${id}`);
    }
    throw new Error(
      `Failed to fetch content: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Fetch content from test fixtures
 */
async function fetchFromTestFixtures(
  id: string,
  format: 'markdown' | 'text',
  includeMetadata: boolean
): Promise<ContentResponse> {
  // Extract language from URL if it's a full URL
  let detectedLang = 'de';
  let urlPath = id;

  if (id.startsWith('http')) {
    const url = new URL(id);
    urlPath = url.pathname;

    // Detect language from domain
    if (url.hostname.includes('meteoschweiz')) {
      detectedLang = 'de';
    } else if (url.hostname.includes('meteosuisse')) {
      detectedLang = 'fr';
    } else if (url.hostname.includes('meteosvizzera')) {
      detectedLang = 'it';
    } else if (url.hostname.includes('meteoswiss')) {
      detectedLang = 'en';
    }
  }

  // Extract filename from path
  const fileName = urlPath.split('/').pop() || 'index.html';
  const baseName = fileName.replace(/\.[^.]+$/, '');

  // Try to find the fixture file
  const languages = [detectedLang, 'de', 'fr', 'it', 'en'];
  for (const lang of languages) {
    const fixtureFile = path.join(TEST_FIXTURES_ROOT, lang, `${baseName}.html`);
    if (existsSync(fixtureFile)) {
      const html = await fs.readFile(fixtureFile, 'utf-8');
      const url = id.startsWith('http') ? id : `https://www.meteoswiss.admin.ch${id}`;

      return processHtmlContent(html, id, url, format, includeMetadata);
    }
  }

  throw new Error(`Content not found: ${id}`);
}

/**
 * Process HTML content and convert to requested format
 */
function processHtmlContent(
  html: string,
  id: string,
  url: string,
  format: 'markdown' | 'text',
  includeMetadata: boolean
): ContentResponse {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Extract main content
  const mainContent = extractMainContent(document);

  // Extract title
  const title =
    document.querySelector('h1')?.textContent?.trim() ||
    document.querySelector('title')?.textContent?.trim() ||
    'Untitled';

  // Extract metadata
  const metadata = includeMetadata
    ? {
        url,
        language: detectLanguage(document),
        lastModified: extractLastModified(document),
        contentType: extractContentType(document),
        keywords: extractKeywords(document),
        description: extractDescription(document),
      }
    : undefined;

  // Convert content to requested format
  let content: string;
  switch (format) {
    case 'markdown':
      content = turndownService.turndown(mainContent);
      break;
    case 'text':
      content = extractTextContent(mainContent);
      break;
    default:
      throw new Error(`Invalid format: ${format}`);
  }

  return {
    id,
    title,
    content,
    format,
    metadata,
  };
}

/**
 * Extract main content from the page
 */
function extractMainContent(document: Document): string {
  // Try different selectors for main content
  const selectors = [
    'main',
    '[role="main"]',
    '.main-content',
    '.content',
    'article',
    '.mch-article',
    '#content',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element.innerHTML;
    }
  }

  // Fallback to body content
  const body = document.querySelector('body');
  if (body) {
    // Remove navigation, header, footer
    const toRemove = body.querySelectorAll('nav, header, footer, script, style');
    toRemove.forEach((el) => el.remove());
    return body.innerHTML;
  }

  return '';
}

/**
 * Extract text content from HTML
 */
function extractTextContent(html: string): string {
  const tempDom = new JSDOM(html);
  const text = tempDom.window.document.body.textContent || '';

  // Clean up whitespace
  return text
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)
    .join('\n');
}

/**
 * Detect language from the document
 */
function detectLanguage(document: Document): string {
  const lang =
    document.documentElement.getAttribute('lang') ||
    document.querySelector('meta[property="og:locale"]')?.getAttribute('content') ||
    'de';

  return lang.substring(0, 2).toLowerCase();
}

/**
 * Extract last modified date
 */
function extractLastModified(document: Document): string | undefined {
  const lastModified =
    document.querySelector('meta[property="article:modified_time"]')?.getAttribute('content') ||
    document.querySelector('meta[name="DC.date.modified"]')?.getAttribute('content');

  return lastModified || undefined;
}

/**
 * Extract content type
 */
function extractContentType(document: Document): string {
  const type =
    document.querySelector('meta[property="og:type"]')?.getAttribute('content') ||
    document.querySelector('meta[name="DC.type"]')?.getAttribute('content') ||
    'article';

  return type;
}

/**
 * Extract keywords
 */
function extractKeywords(document: Document): string[] {
  const keywordsStr =
    document.querySelector('meta[name="keywords"]')?.getAttribute('content') ||
    document.querySelector('meta[property="article:tag"]')?.getAttribute('content') ||
    '';

  return keywordsStr
    .split(',')
    .map((k: string) => k.trim())
    .filter((k: string) => k.length > 0);
}

/**
 * Extract description
 */
function extractDescription(document: Document): string | undefined {
  const description =
    document.querySelector('meta[name="description"]')?.getAttribute('content') ||
    document.querySelector('meta[property="og:description"]')?.getAttribute('content');

  return description || undefined;
}

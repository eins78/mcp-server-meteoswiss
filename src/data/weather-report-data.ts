import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import type { WeatherReport } from '../schemas/weather-report.js';
import { fetchHtml, fetchJson, HttpRequestError } from '../support/http-communication.js';

// Base URL for the MeteoSwiss product output
const BASE_URL = 'https://www.meteoswiss.admin.ch/product/output/weather-report';

// In test mode, use test fixtures instead of HTTP
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Look for test fixtures in both development and production paths
const TEST_FIXTURES_DEV_PATH = path.resolve(__dirname, '../../test/__fixtures__/weather-report');
const TEST_FIXTURES_PROD_PATH = path.resolve(__dirname, '../test/__fixtures__/weather-report');
// Try the development path first, then fall back to production path
const TEST_FIXTURES_ROOT = existsSync(TEST_FIXTURES_DEV_PATH)
  ? TEST_FIXTURES_DEV_PATH
  : TEST_FIXTURES_PROD_PATH;

// Environment variable to use test fixtures instead of HTTP (for testing only)
const USE_TEST_FIXTURES = process.env.USE_TEST_FIXTURES === 'true';

/**
 * Gets the latest weather report version for a specific region and language
 *
 * @param region - The region to get the report for (north, south, west)
 * @param language - The language to get the report in (de, fr, it, en)
 * @returns The weather report data
 */
export async function getLatestWeatherReport(
  region: string,
  language: string
): Promise<WeatherReport> {
  // Map language code to directory
  const languageMap: Record<string, string> = {
    en: 'de', // English reports are in the German directory with _en suffix
    de: 'de',
    fr: 'fr',
    it: 'it',
  };

  const languageDir = languageMap[language] || 'de';

  // Use test fixtures if USE_TEST_FIXTURES is set to true, regardless of NODE_ENV
  if (USE_TEST_FIXTURES) {
    return fetchWeatherReportFromTestFixtures(region, language, languageDir);
  }

  // In normal mode, fetch from HTTP
  return fetchWeatherReportFromHttp(region, language, languageDir);
}

/**
 * Fetches weather report data from the HTTP endpoint
 *
 * @param region - The region to get the report for
 * @param language - The language to get the report in
 * @param languageDir - The language directory to use
 * @returns The weather report data
 */
async function fetchWeatherReportFromHttp(
  region: string,
  language: string,
  languageDir: string
): Promise<WeatherReport> {
  // Construct the URL for the versions.json file
  const versionsUrl = `${BASE_URL}/${languageDir}/${region}/versions.json`;

  try {
    // Fetch the versions.json file to get the latest version
    const versions = await fetchJson<{ currentVersionDirectory: string }>(versionsUrl);
    const currentVersionDir = versions.currentVersionDirectory;

    // Determine which file to read based on language
    const fileSuffix = language === 'en' ? '_en' : `_${language}`;
    const reportUrl = `${BASE_URL}/${languageDir}/${region}/${currentVersionDir}/textproduct${fileSuffix}.xhtml`;

    // Fetch the report HTML
    const reportHtml = await fetchHtml(reportUrl);
    return parseWeatherReportHtml(reportHtml, region, language);
  } catch (error) {
    if (error instanceof HttpRequestError) {
      throw new Error(
        `Failed to fetch weather report for ${region} in ${language}: HTTP error ${error.statusCode || 'unknown'}`
      );
    }
    throw new Error(
      `Failed to fetch weather report for ${region} in ${language}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Fetches weather report data from test fixtures
 *
 * @param region - The region to get the report for
 * @param language - The language to get the report in
 * @param languageDir - The language directory to use
 * @returns The weather report data
 */
async function fetchWeatherReportFromTestFixtures(
  region: string,
  language: string,
  languageDir: string
): Promise<WeatherReport> {
  const reportPath = path.join(TEST_FIXTURES_ROOT, languageDir, region);

  try {
    // Check if the directory exists
    try {
      await fs.access(reportPath);
    } catch (error) {
      throw new Error(
        `Test fixture directory not found: ${reportPath}. Please ensure test fixtures are properly installed.`
      );
    }

    // Read versions.json to get the latest version
    const versionsFilePath = path.join(reportPath, 'versions.json');
    let versionsData;
    try {
      versionsData = await fs.readFile(versionsFilePath, 'utf-8');
    } catch (error) {
      throw new Error(
        `versions.json not found in ${reportPath}. Full path tried: ${versionsFilePath}`
      );
    }

    let versions;
    try {
      versions = JSON.parse(versionsData);
    } catch (error) {
      throw new Error(
        `Invalid JSON in versions.json: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const currentVersionDir = versions.currentVersionDirectory;

    // Determine which file to read based on language
    const fileSuffix = language === 'en' ? '_en' : `_${language}`;
    const reportFilePath = path.join(
      reportPath,
      currentVersionDir,
      `textproduct${fileSuffix}.xhtml`
    );

    // Read and parse the report HTML
    let reportHtml;
    try {
      reportHtml = await fs.readFile(reportFilePath, 'utf-8');
    } catch (error) {
      throw new Error(
        `Report file not found: ${reportFilePath}. Please ensure all test fixtures are properly installed.`
      );
    }

    return parseWeatherReportHtml(reportHtml, region, language);
  } catch (error) {
    console.error(`Error reading test fixture for ${region} in ${language}:`, error);
    throw new Error(
      `Failed to get test fixture for ${region} in ${language}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Parses the weather report HTML into a structured object
 *
 * @param html - The HTML content of the report
 * @param region - The region of the report
 * @param language - The language of the report
 * @returns Structured weather report data
 */
function parseWeatherReportHtml(html: string, region: string, language: string): WeatherReport {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Extract the title - fallback to empty if not found
  const h3Element = document.querySelector('h3');
  const title = h3Element?.textContent?.trim() || 'Weather Report';

  // Extract the update time - fallback to current time if not found
  const pElement = document.querySelector('p');
  const updatedAt = pElement?.textContent?.trim() || new Date().toISOString();

  // Extract the forecast by day with validation
  const forecast: { day: string; description: string; temperature?: string }[] = [];

  const dayElements = document.querySelectorAll('h4');
  if (dayElements.length === 0) {
    // If no forecast elements found, create a minimal entry
    console.error('Warning: No forecast elements (h4) found in weather report HTML');
  }
  
  dayElements.forEach((dayElement) => {
    const day = dayElement.textContent?.trim();
    if (!day) return; // Skip if no day text
    
    const nextElement = dayElement.nextElementSibling;
    const description = nextElement?.textContent?.trim() || 'No description available';
    
    const tempElement = nextElement?.nextElementSibling;
    const temperature = tempElement?.textContent?.trim();

    forecast.push({
      day,
      description,
      temperature: temperature || undefined,
    });
  });

  // Create the full content (useful for showing the entire report)
  const contentElement = document.querySelector('.textFCK');
  const content = contentElement?.textContent?.trim() || 
    `${title}\n${updatedAt}\n${forecast.map(f => `${f.day}: ${f.description}`).join('\n')}`;

  // Validate region and language enums
  const validRegions = ['north', 'south', 'west'] as const;
  const validLanguages = ['de', 'fr', 'it', 'en'] as const;
  
  if (!validRegions.includes(region as any)) {
    throw new Error(`Invalid region: ${region}. Must be one of: ${validRegions.join(', ')}`);
  }
  
  if (!validLanguages.includes(language as any)) {
    throw new Error(`Invalid language: ${language}. Must be one of: ${validLanguages.join(', ')}`);
  }

  return {
    region: region as 'north' | 'south' | 'west',
    language: language as 'de' | 'fr' | 'it' | 'en',
    title,
    updatedAt,
    content,
    forecast,
    source: 'meteoswiss',
  };
}

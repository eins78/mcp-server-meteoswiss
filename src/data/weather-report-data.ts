import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import type { WeatherReport } from '../schemas/weather-report.js';
import { fetchHtml, fetchJson, HttpRequestError } from '../support/http-communication.js';
import { debugData } from '../support/logging.js';
import { validateLanguage, validateRegion } from '../types/meteoswiss.js';

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
        `Test fixture directory not found: ${reportPath}. Please ensure test fixtures are properly installed.
        ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Read versions.json to get the latest version
    const versionsFilePath = path.join(reportPath, 'versions.json');
    let versionsData;
    try {
      versionsData = await fs.readFile(versionsFilePath, 'utf-8');
    } catch (error) {
      throw new Error(
        `versions.json not found in ${reportPath}. Full path tried: ${versionsFilePath}.
        ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const versions = JSON.parse(versionsData);
    debugData('Parsed versions data: %O', versions);
    const currentVersionDir = versions.currentVersionDirectory;
    debugData('Current version directory from fixture: %s', currentVersionDir);

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
        `Report file not found: ${reportFilePath}. Please ensure all test fixtures are properly installed.
        ${error instanceof Error ? error.message : String(error)}`
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

  // Extract the title
  const h3Element = document.querySelector('h3');
  const title = h3Element ? h3Element.textContent || '' : '';

  // Extract the update time
  const pElement = document.querySelector('p');
  const updatedAt = pElement && pElement.textContent ? pElement.textContent.trim() : '';

  // Extract the forecast by day
  const forecast: { day: string; description: string; temperature?: string }[] = [];

  const dayElements = document.querySelectorAll('h4');
  dayElements.forEach((dayElement) => {
    const day = dayElement.textContent || '';
    const nextElement = dayElement.nextElementSibling;
    const description = nextElement && nextElement.textContent ? nextElement.textContent : '';
    const tempElement = nextElement && nextElement.nextElementSibling;
    const temperature = tempElement && tempElement.textContent ? tempElement.textContent : '';

    forecast.push({
      day,
      description,
      temperature: temperature || undefined,
    });
  });

  // Create the full content (useful for showing the entire report)
  const contentElement = document.querySelector('.textFCK');
  const content =
    contentElement && contentElement.textContent ? contentElement.textContent.trim() : '';

  return {
    region: validateRegion(region),
    language: validateLanguage(language),
    title,
    updatedAt,
    content,
    forecast,
    source: 'meteoswiss',
  };
}

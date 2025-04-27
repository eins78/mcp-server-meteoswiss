import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import type { WeatherReport } from '../schemas/weather-report.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(
  __dirname,
  '../../test/__fixtures__/product-output/data-2025-03-26/weather-report'
);

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
  const reportPath = path.join(DATA_ROOT, languageDir, region);

  try {
    // Read versions.json to get the latest version
    const versionsData = await fs.readFile(path.join(reportPath, 'versions.json'), 'utf-8');
    const versions = JSON.parse(versionsData);
    const currentVersionDir = versions.currentVersionDirectory;

    // Determine which file to read based on language
    const fileSuffix = language === 'en' ? '_en' : `_${language}`;
    const reportFilePath = path.join(
      reportPath,
      currentVersionDir,
      `textproduct${fileSuffix}.xhtml`
    );

    // Read and parse the report HTML
    const reportHtml = await fs.readFile(reportFilePath, 'utf-8');
    return parseWeatherReportHtml(reportHtml, region, language);
  } catch (error) {
    console.error(`Error reading weather report for ${region} in ${language}:`, error);
    throw new Error(`Failed to get weather report for ${region} in ${language}`);
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
  const title = document.querySelector('h3')?.textContent || '';

  // Extract the update time
  const updatedAt = document.querySelector('p')?.textContent?.trim() || '';

  // Extract the forecast by day
  const forecast: { day: string; description: string; temperature?: string }[] = [];

  const dayElements = document.querySelectorAll('h4');
  dayElements.forEach((dayElement) => {
    const day = dayElement.textContent || '';
    const description = dayElement.nextElementSibling?.textContent || '';
    const temperature = dayElement.nextElementSibling?.nextElementSibling?.textContent || '';

    forecast.push({
      day,
      description,
      temperature: temperature || undefined,
    });
  });

  // Create the full content (useful for showing the entire report)
  const content = document.querySelector('.textFCK')?.textContent?.trim() || '';

  return {
    region: region as any,
    language: language as any,
    title,
    updatedAt,
    content,
    forecast,
  };
}

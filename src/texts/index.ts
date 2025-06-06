/**
 * Central index for all text content
 * Loads markdown files and exports their content
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Loads content from a markdown file, extracting text after the "---" separator
 */
const loadTextFromFile = async (filename: string): Promise<string> => {
  const filepath = resolve(__dirname, filename);
  const content = await readFile(filepath, 'utf-8');
  
  // Find the separator line
  const lines = content.split('\n');
  const separatorIndex = lines.findIndex(line => line.trim() === '---');
  
  if (separatorIndex === -1) {
    throw new Error(`Text file ${filename} is missing the '---' separator`);
  }
  
  // Return everything after the separator (excluding the separator itself)
  return lines.slice(separatorIndex + 1).join('\n').trim();
}

// Load all text files
export const texts = {
  'server-description':  await loadTextFromFile('./server-description.md'),
  'meteoswiss-weather-report-tool-description': await loadTextFromFile('./meteoswiss-weather-report-tool-description.md'),
  'region-parameter-description': await loadTextFromFile('./region-parameter-description.md'),
  'language-parameter-description': await loadTextFromFile('./language-parameter-description.md'),
  'api-description': await loadTextFromFile('./api-description.md'),
  'prompt-wetter-nordschweiz-user': await loadTextFromFile('./prompt-wetter-nordschweiz-user.md'),
  'prompt-wetter-nordschweiz-assistant': await loadTextFromFile('./prompt-wetter-nordschweiz-assistant.md'),
  'prompt-meteo-suisse-romande-user': await loadTextFromFile('./prompt-meteo-suisse-romande-user.md'),
  'prompt-meteo-suisse-romande-assistant': await loadTextFromFile('./prompt-meteo-suisse-romande-assistant.md'),
  'prompt-meteo-ticino-user': await loadTextFromFile('./prompt-meteo-ticino-user.md'),
  'prompt-meteo-ticino-assistant': await loadTextFromFile('./prompt-meteo-ticino-assistant.md'),
  'prompt-wetter-schweiz-user': await loadTextFromFile('./prompt-wetter-schweiz-user.md'),
  'prompt-wetter-schweiz-assistant': await loadTextFromFile('./prompt-wetter-schweiz-assistant.md'),
} as const;

// Type for text keys
export type TextKey = keyof typeof texts;

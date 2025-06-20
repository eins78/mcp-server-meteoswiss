/**
 * Version management module
 * Loads package.json once at module load time
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load package.json once at module load time
const packageJson = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')) as {
  version: string;
  name: string;
  description?: string;
};

/**
 * Get the application version from package.json
 */
export function getVersion(): string {
  return packageJson.version;
}

/**
 * Get the application name from package.json
 */
export function getAppName(): string {
  return packageJson.name;
}

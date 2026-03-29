/**
 * Test fixture support for OGD data.
 * When USE_TEST_FIXTURES=true, provides fixture file paths instead of live HTTP URLs.
 */

import * as path from 'node:path';
import { existsSync } from 'node:fs';

export const USE_TEST_FIXTURES = process.env.USE_TEST_FIXTURES === 'true';

const FIXTURES_DEV = path.resolve(process.cwd(), 'test/__fixtures__/ogd');
const FIXTURES_PROD = path.resolve(process.cwd(), '../../test/__fixtures__/ogd');

/** Root directory for OGD test fixtures */
export const OGD_FIXTURES_ROOT = existsSync(FIXTURES_DEV) ? FIXTURES_DEV : FIXTURES_PROD;

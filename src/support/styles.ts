import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export const mainCss = await fs.readFile(require.resolve('@eins78/styles/cloud-docs.css'), 'utf8');

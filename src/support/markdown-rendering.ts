import fs from 'node:fs/promises';
import path from 'node:path';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { validateEnv } from './environment-validation.js';
import { getMcpEndpointUrl, getServiceBaseUrl } from './url-generation.js';
import { mainCss } from './styles.js';

/**
 * Renders markdown files into HTML for the homepage
 */
export async function renderHomepage(): Promise<string> {
  const docsPath = path.join(process.cwd(), 'src', 'views', 'homepage');
  const config = validateEnv();

  // Files to include in order
  const files = ['overview.md', 'installation.md', 'tools.md'];

  // Read all markdown files
  const contents = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await fs.readFile(path.join(docsPath, file), 'utf-8');
        return content;
      } catch (error) {
        console.error(`Failed to read ${file}:`, error);
        return '';
      }
    })
  );

  // Combine with section dividers
  let markdown = contents.filter((content) => content.length > 0).join('\n\n---\n\n');

  // Replace template variables
  const baseUrl = getServiceBaseUrl(config);
  const mcpUrl = getMcpEndpointUrl(config);

  markdown = markdown
    .replace(/\$\$\$___TEMPLATE_BASE_URL___\$\$\$/g, baseUrl)
    .replace(/\$\$\$___TEMPLATE_MCP_URL___\$\$\$/g, mcpUrl);

  // Convert to HTML using micromark with GFM support
  const html = micromark(markdown, {
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });

  // Wrap in a basic HTML template
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MeteoSwiss MCP Server</title>
  <style>${mainCss}</style>
</head>
<body>
  <div class="container">
    <div class="endpoint-info">
      <strong>MCP Endpoint:</strong> <code>${getMcpEndpointUrl(config)}</code><br>
      <strong>Health Check:</strong> <a href="/health">/health</a><br>
      <strong>API Version:</strong> 1.0.0
    </div>
    ${html}
  </div>
</body>
</html>`;
}

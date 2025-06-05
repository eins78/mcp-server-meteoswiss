import fs from 'node:fs/promises';
import path from 'node:path';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';

/**
 * Renders markdown files into HTML for the homepage
 */
export async function renderHomepage(): Promise<string> {
  const docsPath = path.join(process.cwd(), 'docs', 'homepage');
  
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
  const markdown = contents
    .filter(content => content.length > 0)
    .join('\n\n---\n\n');
  
  // Convert to HTML using micromark with GFM support
  const html = micromark(markdown, {
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()]
  });
  
  // Wrap in a basic HTML template
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MeteoSwiss MCP Server</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1, h2, h3 {
      color: #2c3e50;
    }
    h1 {
      border-bottom: 2px solid #3498db;
      padding-bottom: 10px;
    }
    h2 {
      margin-top: 30px;
    }
    pre {
      background: #f4f4f4;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 15px;
      overflow-x: auto;
    }
    code {
      background: #f4f4f4;
      padding: 2px 4px;
      border-radius: 3px;
      font-family: 'Consolas', 'Monaco', monospace;
    }
    pre code {
      background: none;
      padding: 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 20px 0;
    }
    table th, table td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    table th {
      background-color: #f4f4f4;
      font-weight: bold;
    }
    hr {
      border: none;
      border-top: 1px solid #eee;
      margin: 40px 0;
    }
    a {
      color: #3498db;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    ul, ol {
      padding-left: 30px;
    }
    .endpoint-info {
      background: #e8f4f8;
      border: 1px solid #b8dae8;
      border-radius: 4px;
      padding: 15px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="endpoint-info">
      <strong>MCP Endpoint:</strong> <code>${process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || '3000'}`}/mcp</code><br>
      <strong>Health Check:</strong> <a href="/health">/health</a><br>
      <strong>API Version:</strong> 1.0.0
    </div>
    ${html}
  </div>
</body>
</html>`;
}


import fs from 'node:fs/promises';
import path from 'node:path';

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
  
  // Convert to simple HTML (basic conversion without external libraries)
  const html = convertMarkdownToHtml(markdown);
  
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
      <strong>MCP Endpoint:</strong> <code>http://localhost:${process.env.PORT || '3000'}/mcp</code><br>
      <strong>Health Check:</strong> <a href="/health">/health</a><br>
      <strong>API Version:</strong> 1.0.0
    </div>
    ${html}
  </div>
</body>
</html>`;
}

/**
 * Basic markdown to HTML converter
 */
function convertMarkdownToHtml(markdown: string): string {
  let html = markdown;
  
  // Convert headers
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  
  // Convert bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Convert inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  
  // Convert code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="${lang || ''}">${escapeHtml(code.trim())}</code></pre>`;
  });
  
  // Convert links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Convert line breaks and paragraphs
  html = html.split('\n\n').map(paragraph => {
    // Check if it's already an HTML element
    if (paragraph.trim().startsWith('<')) {
      return paragraph;
    }
    // Check if it's a list
    if (paragraph.trim().match(/^[-*] /)) {
      const items = paragraph.split('\n')
        .map(line => line.replace(/^[-*] (.*)$/, '<li>$1</li>'))
        .join('\n');
      return `<ul>\n${items}\n</ul>`;
    }
    // Check if it's a table
    if (paragraph.includes('|') && paragraph.includes('---')) {
      return convertTable(paragraph);
    }
    // Regular paragraph
    return paragraph.trim() ? `<p>${paragraph.trim()}</p>` : '';
  }).join('\n\n');
  
  return html;
}

/**
 * Convert markdown table to HTML
 */
function convertTable(tableMarkdown: string): string {
  const lines = tableMarkdown.trim().split('\n');
  if (lines.length < 3) return tableMarkdown; // Not a valid table
  
  const headers = lines[0]?.split('|').map(h => h.trim()).filter(h => h) || [];
  const rows = lines.slice(2).map(line => 
    line.split('|').map(cell => cell.trim()).filter(cell => cell)
  );
  
  let html = '<table>\n<thead>\n<tr>\n';
  headers.forEach(header => {
    html += `<th>${header}</th>\n`;
  });
  html += '</tr>\n</thead>\n<tbody>\n';
  
  rows.forEach(row => {
    html += '<tr>\n';
    row.forEach(cell => {
      html += `<td>${cell}</td>\n`;
    });
    html += '</tr>\n';
  });
  
  html += '</tbody>\n</table>';
  return html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, m => map[m] || m);
}
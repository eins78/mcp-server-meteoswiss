/**
 * Expands MeteoSwiss custom web components into standard HTML.
 *
 * The MeteoSwiss website uses Stencil.js web components that store content
 * in HTML attributes (e.g., `<mch-text html="<p>...</p>">`). Since JSDOM
 * cannot render shadow DOM, the content is invisible to Turndown.
 * This module replaces custom elements with standard HTML equivalents
 * so that the content can be converted to markdown.
 *
 * Security note: innerHTML is used intentionally here. The content comes from
 * MeteoSwiss's CMS-generated HTML attributes, not from user input. This runs
 * server-side in JSDOM — there is no browser execution context.
 */

import { debugData } from '../support/logging.js';

import type { JSDOM } from 'jsdom';

/** Minimal Document interface compatible with JSDOM */
type DomDocument = InstanceType<typeof JSDOM>['window']['document'];

/**
 * Replace a custom element with a div wrapper containing the given inner HTML.
 */
function replaceWithHtml(document: DomDocument, element: globalThis.Element, html: string): void {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  element.parentNode?.replaceChild(wrapper, element);
}

/**
 * Expand `<mch-text html="<p>content</p>">` → injected HTML content.
 *
 * The `html` attribute contains pre-rendered HTML (headings, paragraphs, lists)
 * that the browser would normally inject into shadow DOM.
 */
function expandMchText(document: DomDocument): void {
  const elements = document.querySelectorAll('mch-text[html]');
  let count = 0;
  for (const el of elements) {
    const html = el.getAttribute('html');
    if (!html) continue;
    replaceWithHtml(document, el, html);
    count++;
  }
  if (count > 0) debugData('[web-components] Expanded %d mch-text elements', count);
}

/**
 * Expand `<mch-page-intro heading="Title" text="Lead...">` → `<h1>` + `<p>`.
 */
function expandPageIntro(document: DomDocument): void {
  const elements = document.querySelectorAll('mch-page-intro');
  for (const el of elements) {
    const heading = el.getAttribute('heading');
    const text = el.getAttribute('text');
    if (!heading && !text) continue;

    let html = '';
    if (heading) html += `<h1>${heading}</h1>`;
    if (text) html += `<p>${text}</p>`;
    replaceWithHtml(document, el, html);
    debugData('[web-components] Expanded mch-page-intro: %s', heading);
  }
}

/**
 * Expand `<mch-image-component alt="..." caption="..." src="...">` → `<figure>`.
 */
function expandImageComponents(document: DomDocument): void {
  const elements = document.querySelectorAll('mch-image-component');
  let count = 0;
  for (const el of elements) {
    const alt = el.getAttribute('alt') ?? '';
    const caption = el.getAttribute('caption') ?? '';
    const src = el.getAttribute('src') ?? '';
    if (!alt && !caption && !src) continue;

    let html = '<figure>';
    if (src) html += `<img alt="${alt}" src="${src}">`;
    if (caption) html += `<figcaption>${caption}</figcaption>`;
    html += '</figure>';
    replaceWithHtml(document, el, html);
    count++;
  }
  if (count > 0) debugData('[web-components] Expanded %d mch-image-component elements', count);
}

/**
 * Expand `<mch-link-download-list links='[...]'>` → `<ul>` with links.
 */
function expandLinkDownloadLists(document: DomDocument): void {
  const elements = document.querySelectorAll('mch-link-download-list[links]');
  let count = 0;
  for (const el of elements) {
    const linksJson = el.getAttribute('links');
    if (!linksJson) continue;

    try {
      const links = JSON.parse(linksJson) as Array<{ href?: string; label?: string }>;
      if (!Array.isArray(links) || links.length === 0) continue;

      const title = el.getAttribute('title');
      let html = '';
      if (title) html += `<h3>${title}</h3>`;
      html += '<ul>';
      for (const link of links) {
        if (link.href && link.label) {
          html += `<li><a href="${link.href}">${link.label}</a></li>`;
        }
      }
      html += '</ul>';
      replaceWithHtml(document, el, html);
      count++;
    } catch {
      debugData('[web-components] Failed to parse links JSON for mch-link-download-list');
    }
  }
  if (count > 0) debugData('[web-components] Expanded %d mch-link-download-list elements', count);
}

/**
 * Expand `<mch-accordion-panel title="...">` → `<h3>` + children.
 */
function expandAccordionPanels(document: DomDocument): void {
  const elements = document.querySelectorAll('mch-accordion-panel[title]');
  let count = 0;
  for (const el of elements) {
    const title = el.getAttribute('title');
    if (!title) continue;

    const html = `<h3>${title}</h3>${el.innerHTML}`;
    replaceWithHtml(document, el, html);
    count++;
  }
  if (count > 0) debugData('[web-components] Expanded %d mch-accordion-panel elements', count);
}

/**
 * Expand `<mch-title level="N">Text</mch-title>` → `<hN>Text</hN>`.
 */
function expandTitles(document: DomDocument): void {
  const elements = document.querySelectorAll('mch-title');
  let count = 0;
  for (const el of elements) {
    const level = el.getAttribute('level') ?? '2';
    const text = el.textContent?.trim();
    if (!text) continue;

    const tag = `h${Math.min(Math.max(Number(level) || 2, 1), 6)}`;
    replaceWithHtml(document, el, `<${tag}>${text}</${tag}>`);
    count++;
  }
  if (count > 0) debugData('[web-components] Expanded %d mch-title elements', count);
}

/**
 * Expand `<mch-video src="...">` → link to video.
 */
function expandVideos(document: DomDocument): void {
  const elements = document.querySelectorAll('mch-video[src]');
  for (const el of elements) {
    const src = el.getAttribute('src');
    if (!src) continue;
    replaceWithHtml(document, el, `<p><a href="${src}">Video</a></p>`);
  }
}

/**
 * Remove non-content structural elements that add noise to the extracted text.
 * `qs-shadow-template` elements are unwrapped (children preserved) rather than
 * removed, because `<main>` and other content elements are nested inside them.
 */
function removeNonContentElements(document: DomDocument): void {
  // Unwrap qs-shadow-template: keep children, remove wrapper
  const shadowTemplates = document.querySelectorAll('qs-shadow-template');
  for (const el of shadowTemplates) {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
    }
  }

  // Fully remove non-content elements
  const selectorsToRemove = [
    'mch-header',
    'mch-footer',
    'mch-breadcrumb',
    'mch-skiplinks',
    'mch-go-to-top',
    // Decorative icons (chevrons, arrows, social icons). Each wraps a nested
    // <wb-icon><svg><title>{name}</title>...</svg></wb-icon> whose <title>
    // text (e.g. "chevron-small-right") is otherwise picked up as visible
    // page text by Turndown/textContent extraction (issue #110, BUG-6).
    'mch-icon',
  ];

  for (const selector of selectorsToRemove) {
    document.querySelectorAll(selector).forEach((el) => el.remove());
  }
}

/**
 * Content-type custom elements that should be inside `<main>`.
 */
const CONTENT_ELEMENT_TAGS = new Set([
  'MCH-TEXT',
  'MCH-BOX',
  'MCH-IMAGE-COMPONENT',
  'MCH-LINK-DOWNLOAD-LIST',
  'MCH-ACCORDION',
  'MCH-VIDEO',
]);

/**
 * Structural elements that must NOT be moved into `<main>`.
 */
const STRUCTURAL_ELEMENT_TAGS = new Set([
  'MAIN',
  'MCH-HEADER',
  'MCH-FOOTER',
  'MCH-BREADCRUMB',
  'MCH-PAGE-INTRO',
  'MCH-GO-TO-TOP',
  'MCH-SKIPLINKS',
  'MCH-LAYOUT',
  'STYLE',
  'SCRIPT',
  'LINK',
]);

/**
 * Move content elements into `<main>`.
 *
 * MeteoSwiss pages use shadow DOM slots: content elements (mch-text, mch-box, etc.)
 * are children of `<mch-detail-page>` but siblings of `<main>` in the flat DOM.
 * In a browser, shadow DOM would project them into `<slot name="main">` inside `<main>`.
 * Since JSDOM doesn't support slot projection, we relocate them manually.
 */
function relocateSlottedContent(document: DomDocument): void {
  const main = document.querySelector('main');
  if (!main) return;

  const detailPage = document.querySelector('mch-detail-page');
  if (!detailPage) return;

  // Collect children to move (snapshot the list since we'll modify it)
  const toMove: globalThis.Element[] = [];
  for (const child of Array.from(detailPage.children)) {
    const tag = child.tagName ?? '';

    // Skip structural elements and <main> itself
    if (STRUCTURAL_ELEMENT_TAGS.has(tag)) continue;

    // Move if element has slot="main" OR is a known content element
    if (child.getAttribute('slot') === 'main' || CONTENT_ELEMENT_TAGS.has(tag)) {
      toMove.push(child);
    }
  }

  for (const el of toMove) {
    main.appendChild(el);
  }
  if (toMove.length > 0) {
    debugData('[web-components] Relocated %d content elements into <main>', toMove.length);
  }
}

/**
 * Expand all MeteoSwiss web components in the document into standard HTML.
 * Mutates the DOM in place. Must be called before content extraction.
 *
 * @param document - JSDOM document to process
 */
export function expandWebComponents(document: DomDocument): void {
  debugData('[web-components] Expanding MeteoSwiss web components...');

  // Remove structural noise first
  removeNonContentElements(document);

  // Relocate slot="main" elements into <main> (shadow DOM slot projection)
  relocateSlottedContent(document);

  // Expand content components (order matters: page-intro before titles
  // so the intro heading is created before mch-title processing)
  expandPageIntro(document);
  expandMchText(document);
  expandImageComponents(document);
  expandLinkDownloadLists(document);
  expandAccordionPanels(document);
  expandVideos(document);
  expandTitles(document);

  debugData('[web-components] Web component expansion complete');
}

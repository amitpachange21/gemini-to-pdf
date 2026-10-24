/*
 * Gemini Chat to PDF - conversation extractor
 *
 * Runs inside the isolated content-script world on gemini.google.com.
 * Converts the currently rendered conversation into a small, safe data model
 * that can be stored and rendered into a PDF. It never keeps raw HTML.
 */
(function () {
  'use strict';

  if (globalThis.GeminiPdfExtractor) return;

  const SCHEMA_VERSION = 1;

  const ROOT_SELECTORS = [
    '#chat-history',
    'infinite-scroller[data-test-id="chat-history-container"]',
    '.chat-history-scroll-container',
    'main'
  ];

  const SKIP_SELECTOR = [
    'script',
    'style',
    'noscript',
    'template',
    'link',
    'meta',
    'button',
    '[role="button"]',
    'svg',
    'img',
    'picture',
    'canvas',
    'video',
    'audio',
    'iframe',
    'object',
    'embed',
    'input',
    'textarea',
    'select',
    'mat-icon',
    'mat-menu',
    'mat-toolbar',
    'mat-progress-spinner',
    'mat-spinner',
    'message-actions',
    'copy-button',
    'thumb-up-button',
    'thumb-down-button',
    'regenerate-button',
    'model-thoughts',
    '.thoughts',
    '.thoughts-container',
    '.thinking-content',
    '.response-container-header',
    '.response-container-header-controls',
    '.response-container-header-status',
    '.response-tts-container',
    '.menu-button-wrapper',
    '.more-menu-button-container',
    '.code-block-decoration',
    '.response-footer',
    '.user-query-file-preview',
    '.file-chip',
    '.attachment-container',
    '.cdk-visually-hidden',
    '.mat-mdc-visually-hidden',
    '.visually-hidden',
    '.screen-reader-only',
    '.sr-only',
    '[aria-hidden="true"]',
    '[hidden]'
  ].join(',');

  const INLINE_TAGS = new Set([
    'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn',
    'em', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span',
    'strike', 'strong', 'sub', 'sup', 'time', 'u', 'var'
  ]);

  const BLOCK_TAGS = new Set([
    'address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'dd',
    'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'li',
    'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'ul'
  ]);

  const BULLETS = ['\u2022', '\u25E6', '\u25AA'];

  function normalizeInlineText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/\s+/g, ' ');
  }

  function cleanLabel(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isElement(node) {
    return node && node.nodeType === 1;
  }

  function isText(node) {
    return node && node.nodeType === 3;
  }

  function shouldSkip(element) {
    if (!isElement(element)) return false;
    try {
      if (element.matches(SKIP_SELECTOR)) return true;
    } catch (_) {
      // Ignore selector support issues.
    }
    return false;
  }

  function cloneRuns(runs) {
    return runs.map(function (run) {
      return Object.assign({}, run);
    });
  }

  function addRun(runs, text, style) {
    if (!text) return;
    const next = { text: text };
    if (style && style.bold) next.bold = true;
    if (style && style.italic) next.italic = true;
    if (style && style.code) next.code = true;
    if (style && style.link) next.link = style.link;
    runs.push(next);
  }

  function sameStyle(a, b) {
    return Boolean(a.bold) === Boolean(b.bold) &&
      Boolean(a.italic) === Boolean(b.italic) &&
      Boolean(a.code) === Boolean(b.code) &&
      (a.link || '') === (b.link || '');
  }

  function tidyRuns(input) {
    const runs = [];
    for (const run of input) {
      if (!run || !run.text) continue;
      const text = run.text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
      if (!text) continue;
      const next = Object.assign({}, run, { text: text });
      const previous = runs[runs.length - 1];
      if (previous && sameStyle(previous, next)) {
        previous.text += next.text;
      } else {
        runs.push(next);
      }
    }

    if (runs.length) {
      runs[0].text = runs[0].text.replace(/^[\s\n]+/, '');
      const last = runs[runs.length - 1];
      last.text = last.text.replace(/[\s\n]+$/, '');
    }

    for (const run of runs) {
      run.text = run.text
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
    }

    return runs.filter(function (run) { return run.text.length > 0; });
  }

  function hasVisibleText(runs) {
    return runs.some(function (run) {
      return run.text.replace(/\s+/g, '').length > 0;
    });
  }

  function runsToPlainText(runs) {
    return (runs || []).map(function (run) { return run.text; }).join('');
  }

  function resolveLink(element) {
    const raw = element.getAttribute('href');
    if (!raw || raw.charAt(0) === '#') return null;
    try {
      const url = new URL(raw, document.baseURI);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (_) {
      // Invalid URL.
    }
    return null;
  }

  function extractRuns(node, inheritedStyle) {
    const style = inheritedStyle || {};
    const runs = [];

    function walk(current, currentStyle) {
      if (isText(current)) {
        addRun(runs, normalizeInlineText(current.nodeValue), currentStyle);
        return;
      }
      if (!isElement(current) || shouldSkip(current)) return;

      const tag = current.tagName.toLowerCase();

      if (tag === 'br') {
        addRun(runs, '\n', currentStyle);
        return;
      }

      let nextStyle = currentStyle;

      if (tag === 'strong' || tag === 'b') {
        nextStyle = Object.assign({}, currentStyle, { bold: true });
      } else if (tag === 'em' || tag === 'i') {
        nextStyle = Object.assign({}, currentStyle, { italic: true });
      } else if (tag === 'del' || tag === 's' || tag === 'strike') {
        nextStyle = Object.assign({}, currentStyle);
      } else if (tag === 'code' || tag === 'kbd' || tag === 'samp') {
        nextStyle = Object.assign({}, currentStyle, { code: true });
      } else if (tag === 'a') {
        const link = resolveLink(current);
        if (link) nextStyle = Object.assign({}, currentStyle, { link: link });
      }

      for (const child of Array.from(current.childNodes)) {
        walk(child, nextStyle);
      }
    }

    for (const child of Array.from(node.childNodes)) {
      walk(child, style);
    }

    return tidyRuns(runs);
  }

  function extractFlowRuns(node) {
    const runs = [];

    function walk(current, style) {
      if (isText(current)) {
        addRun(runs, normalizeInlineText(current.nodeValue), style);
        return;
      }
      if (!isElement(current) || shouldSkip(current)) return;

      const tag = current.tagName.toLowerCase();
      if (tag === 'br') {
        addRun(runs, '\n', style);
        return;
      }

      let nextStyle = style;
      if (tag === 'strong' || tag === 'b') {
        nextStyle = Object.assign({}, style, { bold: true });
      } else if (tag === 'em' || tag === 'i') {
        nextStyle = Object.assign({}, style, { italic: true });
      } else if (tag === 'code' || tag === 'kbd' || tag === 'samp') {
        nextStyle = Object.assign({}, style, { code: true });
      } else if (tag === 'a') {
        const link = resolveLink(current);
        if (link) nextStyle = Object.assign({}, style, { link: link });
      }

      const isBlock = BLOCK_TAGS.has(tag) ||
        current.classList.contains('code-block') ||
        tag === 'code-block';

      if (isBlock) addRun(runs, '\n', style);

      for (const child of Array.from(current.childNodes)) {
        walk(child, nextStyle);
      }

      if (isBlock) addRun(runs, '\n', style);
    }

    walk(node, {});
    return tidyRuns(runs);
  }

  function headingLevel(element) {
    const tag = element.tagName.toLowerCase();
    const match = /^h([1-6])$/.exec(tag);
    if (match) return Number(match[1]);
    const aria = element.getAttribute('aria-level');
    const level = parseInt(aria, 10);
    if (level >= 1 && level <= 6) return level;
    return 3;
  }

  function isHeading(element) {
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return true;
    return element.getAttribute('role') === 'heading';
  }

  function isCodeContainer(element) {
    const tag = element.tagName.toLowerCase();
    if (tag === 'pre' || tag === 'code-block') return true;
    if (element.classList.contains('code-block')) return true;
    if (element.classList.contains('code-block-container') && element.querySelector('pre')) return true;
    return false;
  }

  function findCodeContents(element) {
    const candidates = [
      element.querySelector('pre code'),
      element.querySelector('code'),
      element.querySelector('pre')
    ].filter(Boolean);
    return candidates[0] || element;
  }

  function findLanguage(element) {
    const labels = Array.from(
      element.querySelectorAll('.code-block-decoration, [class*="decoration"], [data-test-id="code-language"], [data-language]')
    );
    for (const label of labels) {
      if (label.closest('pre, code')) continue;
      const text = cleanLabel(label.textContent);
      if (!text || text.length > 24) continue;
      if (!/^[A-Za-z0-9+#_.\- ]{1,24}$/.test(text)) continue;
      if (/^(copy|copy code|code|plain text|text)$/i.test(text)) continue;
      return text;
    }

    const dataLanguage = element.getAttribute('data-language');
    if (dataLanguage && dataLanguage.length <= 24) return cleanLabel(dataLanguage);

    const code = findCodeContents(element);
    const className = String((code && code.className) || '') + ' ' +
      String(element.className || '');
    const match = /(?:language|lang)-([A-Za-z0-9+#_.-]{1,24})/i.exec(className);
    if (match) return match[1];
    return null;
  }

  function extractCodeBlock(element) {
    const codeElement = findCodeContents(element);
    let text = String(codeElement.textContent || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/\t/g, '    ');

    text = text.split('\n').map(function (line) {
      return line.replace(/[ \t]+$/, '');
    }).join('\n').replace(/^\n+|\n+$/g, '');

    if (!text.trim()) return null;

    return {
      type: 'code',
      language: findLanguage(element),
      text: text
    };
  }

  function cellText(cell) {
    const clone = cell.cloneNode(true);
    clone.querySelectorAll(SKIP_SELECTOR).forEach(function (node) { node.remove(); });
    const text = clone.innerText || clone.textContent || '';
    return String(text).replace(/\s+/g, ' ').trim();
  }

  function extractTableBlock(table) {
    const allRows = Array.from(table.querySelectorAll('tr')).filter(function (row) {
      return row.closest('table') === table;
    });

    const rows = [];
    for (const row of allRows) {
      const cells = Array.from(row.cells || []).filter(function (cell) {
        return cell.closest('table') === table;
      });
      if (!cells.length) continue;
      rows.push(cells.map(cellText));
    }

    if (!rows.length) return null;
    const maxColumns = Math.max.apply(null, rows.map(function (row) { return row.length; }));
    if (!maxColumns) return null;

    for (const row of rows) {
      while (row.length < maxColumns) row.push('');
    }

    const firstRow = allRows[0];
    const hasHeader = Boolean(table.tHead) ||
      Boolean(firstRow && firstRow.querySelector('th'));
    const headerRows = hasHeader ? 1 : 0;

    return {
      type: 'table',
      headerRows: headerRows,
      rows: rows
    };
  }

  function bulletFor(level) {
    return BULLETS[Math.min(level, BULLETS.length - 1)];
  }

  function extractListItems(list, level, output) {
    const ordered = list.tagName.toLowerCase() === 'ol';
    let index = parseInt(list.getAttribute('start'), 10);
    if (!Number.isFinite(index) || index < 1) index = 1;

    for (const item of Array.from(list.children)) {
      if (item.tagName.toLowerCase() !== 'li') continue;

      const nestedLists = Array.from(item.querySelectorAll('ul, ol')).filter(function (listElement) {
        return listElement.closest('li') === item;
      });

      const clone = item.cloneNode(true);
      clone.querySelectorAll('ul, ol').forEach(function (node) { node.remove(); });
      const runs = extractFlowRuns(clone);

      if (hasVisibleText(runs)) {
        output.push({
          level: level,
          marker: ordered ? index + '.' : bulletFor(level),
          runs: runs
        });
      }

      for (const nested of nestedLists) {
        extractListItems(nested, level + 1, output);
      }

      const value = parseInt(item.getAttribute('value'), 10);
      if (Number.isFinite(value)) {
        index = value + 1;
      } else {
        index += 1;
      }
    }
  }

  function addParagraph(blocks, runs) {
    if (!hasVisibleText(runs)) return;
    blocks.push({ type: 'paragraph', runs: runs });
  }

  function buildBlocks(root) {
    const blocks = [];

    function processContainer(parent) {
      let pending = [];

      function flush() {
        if (!pending.length) return;
        const runs = tidyRuns(pending);
        pending = [];
        addParagraph(blocks, runs);
      }

      for (const node of Array.from(parent.childNodes)) {
        if (isText(node)) {
          const text = normalizeInlineText(node.nodeValue);
          if (text) pending.push({ text: text });
          continue;
        }

        if (!isElement(node) || shouldSkip(node)) continue;

        const element = node;
        const tag = element.tagName.toLowerCase();

        if (isCodeContainer(element)) {
          flush();
          const code = extractCodeBlock(element);
          if (code) blocks.push(code);
          continue;
        }

        if (tag === 'table') {
          flush();
          const table = extractTableBlock(element);
          if (table) blocks.push(table);
          continue;
        }

        if (tag === 'ul' || tag === 'ol') {
          flush();
          const items = [];
          extractListItems(element, 0, items);
          if (items.length) blocks.push({ type: 'list', items: items });
          continue;
        }

        if (tag === 'p') {
          flush();
          addParagraph(blocks, extractRuns(element));
          continue;
        }

        if (isHeading(element)) {
          flush();
          const runs = extractRuns(element);
          if (hasVisibleText(runs)) {
            blocks.push({
              type: 'heading',
              level: headingLevel(element),
              runs: runs
            });
          }
          continue;
        }

        if (tag === 'blockquote') {
          flush();
          const runs = extractFlowRuns(element);
          if (hasVisibleText(runs)) {
            blocks.push({ type: 'quote', runs: runs });
          }
          continue;
        }

        if (tag === 'hr') {
          flush();
          blocks.push({ type: 'divider' });
          continue;
        }

        if (tag === 'br') {
          pending.push({ text: '\n' });
          continue;
        }

        if (INLINE_TAGS.has(tag)) {
          pending.push.apply(pending, extractRuns(element));
          continue;
        }

        if (BLOCK_TAGS.has(tag) || tag.indexOf('-') !== -1) {
          flush();
          processContainer(element);
          continue;
        }

        pending.push.apply(pending, extractRuns(element));
      }

      flush();
    }

    processContainer(root);
    return blocks;
  }

  function findRoot() {
    for (const selector of ROOT_SELECTORS) {
      const element = document.querySelector(selector);
      if (element && element.querySelector('user-query, model-response')) return element;
    }
    return document.querySelector('main') || document.body;
  }

  function compareDocumentOrder(a, b) {
    if (a === b) return 0;
    const position = a.compareDocumentPosition(b);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }

  function findMessageElements(root) {
    let elements = Array.from(root.querySelectorAll('user-query, model-response'));

    if (!elements.length) {
      const containers = Array.from(root.querySelectorAll('.conversation-container'));
      elements = containers.flatMap(function (container) {
        return Array.from(container.querySelectorAll('user-query, model-response'));
      });
    }

    elements = elements.filter(function (element) {
      return !elements.some(function (other) {
        return other !== element && other.contains(element);
      });
    });

    return elements.sort(compareDocumentOrder);
  }

  function findMessageContent(element, role) {
    if (role === 'user') {
      return element.querySelector('.query-text') ||
        element.querySelector('.user-query-content') ||
        element;
    }

    const markdownCandidates = Array.from(element.querySelectorAll('.markdown')).filter(function (candidate) {
      return !candidate.closest('model-thoughts, .thoughts, .thinking-content, .response-tts-container');
    });

    if (markdownCandidates.length) {
      let best = markdownCandidates[0];
      let bestLength = String(best.textContent || '').length;
      for (const candidate of markdownCandidates.slice(1)) {
        const length = String(candidate.textContent || '').length;
        if (length > bestLength) {
          best = candidate;
          bestLength = length;
        }
      }
      return best;
    }

    return element.querySelector('.response-content') ||
      element.querySelector('message-content') ||
      element;
  }

  function findTimestamp(element) {
    const time = element.querySelector('time');
    if (time) {
      const text = cleanLabel(time.textContent);
      if (text) return text.slice(0, 80);
      const datetime = cleanLabel(time.getAttribute('datetime'));
      if (datetime) return datetime.slice(0, 80);
    }

    const timePattern = /(\b\d{1,2}:\d{2}\b)|(\b\d{1,2}\s*(?:AM|PM)\b)/i;
    const labelled = Array.from(element.querySelectorAll('[aria-label]')).slice(0, 40);
    for (const item of labelled) {
      const label = cleanLabel(item.getAttribute('aria-label'));
      if (label && label.length <= 80 && timePattern.test(label)) return label;
    }
    return null;
  }

  function blocksToPlainText(blocks) {
    const parts = [];

    for (const block of blocks || []) {
      if (!block) continue;

      if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote') {
        parts.push(runsToPlainText(block.runs));
      } else if (block.type === 'list') {
        for (const item of block.items || []) {
          parts.push(new Array((item.level || 0) + 1).join('  ') + item.marker + ' ' + runsToPlainText(item.runs));
        }
      } else if (block.type === 'code') {
        parts.push(block.text);
      } else if (block.type === 'table') {
        for (const row of block.rows || []) parts.push(row.join(' | '));
      } else if (block.type === 'divider') {
        parts.push('\u2014');
      }
    }

    return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function findTitle(messages) {
    const selectors = [
      '.conversation-title',
      '[data-test-id="conversation-title"]',
      '.chat-title',
      '[data-test-id="chat-title"]',
      '.conversation-title-text'
    ];

    const sidebarSelector = [
      'nav',
      '[role="navigation"]',
      'bard-sidenav',
      'side-navigation',
      '.side-navigation',
      '.sidenav',
      '.sidebar',
      'mat-sidenav',
      'mat-sidenav-container',
      '.chat-history-list',
      '.conversation-list'
    ].join(',');

    function scoreCandidate(element) {
      let score = 0;
      if (element.closest(sidebarSelector)) score -= 8;
      if (element.closest('main, [role="main"], bard-sidenav-content, .conversation-container, .chat-container')) score += 3;
      if (element.closest('header, .top-bar, top-bar, .conversation-header')) score += 2;
      if (element.closest('[aria-current="page"]')) score += 4;
      try {
        score += element.getClientRects().length ? 2 : -4;
      } catch (_) {
        score -= 4;
      }
      return score;
    }

    let bestTitle = null;
    let bestScore = -Infinity;
    for (const selector of selectors) {
      for (const element of Array.from(document.querySelectorAll(selector))) {
        const text = cleanLabel(element.textContent);
        if (!text || text.length > 160) continue;
        if (/^(gemini|google gemini|new chat|untitled)$/i.test(text)) continue;
        const score = scoreCandidate(element);
        if (score > bestScore) {
          bestTitle = text;
          bestScore = score;
        }
      }
    }
    if (bestTitle && bestScore >= 0) return bestTitle;

    let title = cleanLabel(document.title)
      .replace(/\s*[-\u2013|]\s*(Google\s+)?Gemini.*$/i, '')
      .trim();

    if (!title || /^(gemini|google gemini|new chat|untitled)$/i.test(title)) {
      const firstUser = messages.find(function (message) { return message.role === 'user'; });
      if (firstUser) {
        title = blocksToPlainText(firstUser.blocks).replace(/\s+/g, ' ').trim();
        if (title.length > 90) {
          title = title.slice(0, 90).replace(/\s+\S*$/, '') + '\u2026';
        }
      }
    }

    if (!title) title = 'Gemini conversation';
    return title.slice(0, 160);
  }

  function extractConversation() {
    const root = findRoot();
    const elements = findMessageElements(root);
    const messages = [];

    for (const element of elements) {
      const tag = element.tagName.toLowerCase();
      const role = tag === 'user-query' ? 'user' : 'assistant';
      const content = findMessageContent(element, role);
      const blocks = buildBlocks(content);

      if (!blocks.length) continue;

      const plainText = blocksToPlainText(blocks);
      if (!plainText.replace(/\s+/g, '')) continue;

      messages.push({
        id: 'message-' + (messages.length + 1),
        role: role,
        timestamp: findTimestamp(element),
        blocks: blocks
      });
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      title: findTitle(messages),
      sourceUrl: location.href,
      exportedAt: new Date().toISOString(),
      generator: 'Gemini Chat to PDF',
      messages: messages
    };
  }

  globalThis.GeminiPdfExtractor = {
    schemaVersion: SCHEMA_VERSION,
    extractConversation: extractConversation,
    blocksToPlainText: blocksToPlainText
  };
})();

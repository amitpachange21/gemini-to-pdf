'use strict';

(function () {
  const EXPORT_PREFIX = 'g2pdf:export:';

  const status = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const documentRoot = document.getElementById('document');
  const printAgainButton = document.getElementById('printAgainButton');
  const closeButton = document.getElementById('closeButton');

  let autoPrintStarted = false;

  function storageGet(key) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.get(key, function (items) {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(items || {});
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function safeLink(value) {
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (_) {
      // Invalid link.
    }
    return null;
  }

  function appendRuns(parent, runs) {
    for (const run of runs || []) {
      if (!run || !run.text) continue;

      let node = document.createTextNode(run.text);

      if (run.code) {
        const code = document.createElement('code');
        code.appendChild(node);
        node = code;
      }
      if (run.italic) {
        const emphasis = document.createElement('em');
        emphasis.appendChild(node);
        node = emphasis;
      }
      if (run.bold) {
        const strong = document.createElement('strong');
        strong.appendChild(node);
        node = strong;
      }
      if (run.link) {
        const href = safeLink(run.link);
        if (href) {
          const link = document.createElement('a');
          link.href = href;
          link.target = '_blank';
          link.rel = 'noreferrer noopener';
          link.appendChild(node);
          node = link;
        }
      }

      parent.appendChild(node);
    }
  }

  function runsText(runs) {
    return (runs || []).map(function (run) { return run.text || ''; }).join('');
  }

  function blockTextLength(block) {
    if (!block) return 0;
    if (block.type === 'code') return (block.text || '').length;
    if (block.type === 'table') {
      let total = 0;
      for (const row of block.rows || []) {
        for (const cell of row) total += String(cell || '').length;
      }
      return total;
    }
    if (block.type === 'list') {
      let total = 0;
      for (const item of block.items || []) total += runsText(item.runs).length;
      return total;
    }
    return runsText(block.runs).length;
  }

  function blocksTextLength(blocks) {
    let total = 0;
    for (const block of blocks || []) total += blockTextLength(block);
    return total;
  }

  function renderBlocks(container, blocks) {
    for (const block of blocks || []) {
      if (!block) continue;

      if (block.type === 'paragraph') {
        if (!block.runs || !block.runs.length) continue;
        const paragraph = createElement('p', 'para');
        appendRuns(paragraph, block.runs);
        container.appendChild(paragraph);
      } else if (block.type === 'heading') {
        if (!block.runs || !block.runs.length) continue;
        const tag = block.level <= 2 ? 'h2' : (block.level === 3 ? 'h3' : 'h4');
        const heading = createElement(tag, 'heading');
        appendRuns(heading, block.runs);
        container.appendChild(heading);
      } else if (block.type === 'list') {
        const list = createElement('div', 'list');
        for (const item of block.items || []) {
          if (!item || !item.runs || !item.runs.length) continue;
          const row = createElement('div', 'list-row');
          row.style.paddingLeft = Math.min(8, item.level || 0) * 14 + 'px';

          const marker = createElement('span', 'list-marker', item.marker || '\u2022');
          const text = createElement('span', 'list-text');
          appendRuns(text, item.runs);
          row.appendChild(marker);
          row.appendChild(text);
          list.appendChild(row);
        }
        if (list.childNodes.length) container.appendChild(list);
      } else if (block.type === 'code') {
        if (!block.text || !block.text.trim()) continue;
        const wrapper = createElement('div', 'code-block');
        if ((block.text.split('\n').length <= 30) && block.text.length < 5000) {
          wrapper.classList.add('short');
        }
        if (block.language) {
          wrapper.appendChild(createElement('div', 'code-label', String(block.language).toUpperCase()));
        }
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = block.text;
        pre.appendChild(code);
        wrapper.appendChild(pre);
        container.appendChild(wrapper);
      } else if (block.type === 'table') {
        const rows = block.rows || [];
        if (!rows.length) continue;

        const table = createElement('table', 'data-table');
        const columns = Math.max.apply(null, rows.map(function (row) { return row.length; }));
        const headerRows = Math.min(block.headerRows || 0, rows.length);

        let section = table;
        if (headerRows > 0) {
          const thead = document.createElement('thead');
          table.appendChild(thead);
          section = thead;
        }

        rows.forEach(function (row, rowIndex) {
          if (headerRows > 0 && rowIndex === headerRows) {
            const tbody = document.createElement('tbody');
            table.appendChild(tbody);
            section = tbody;
          }
          const tr = document.createElement('tr');
          for (let column = 0; column < columns; column += 1) {
            const cellTag = rowIndex < headerRows ? 'th' : 'td';
            const cell = document.createElement(cellTag, '', row[column] == null ? '' : String(row[column]));
            tr.appendChild(cell);
          }
          section.appendChild(tr);
        });

        container.appendChild(table);
      } else if (block.type === 'quote') {
        if (!block.runs || !block.runs.length) continue;
        const quote = createElement('blockquote', 'quote');
        const paragraph = createElement('p', 'para');
        appendRuns(paragraph, block.runs);
        quote.appendChild(paragraph);
        container.appendChild(quote);
      } else if (block.type === 'divider') {
        container.appendChild(createElement('hr', 'divider'));
      }
    }
  }

  function formatDate(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }).format(date);
    } catch (_) {
      return date.toISOString().slice(0, 10);
    }
  }

  function makeFilename(title) {
    let base = String(title || 'Gemini chat')
      .replace(/[\u0000-\u001F\u007F<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (base.length > 110) base = base.slice(0, 110).replace(/\s+\S*$/, '');
    return (base || 'Gemini chat') + ' - Gemini.pdf';
  }

  function renderCover(model) {
    const cover = createElement('header', 'cover');
    cover.appendChild(createElement('div', 'cover-bar'));
    cover.appendChild(createElement('div', 'cover-eyebrow', 'Gemini conversation'));

    const title = createElement('h1', 'cover-title', model.title || 'Gemini conversation');
    cover.appendChild(title);

    const meta = createElement('div', 'cover-meta');
    const count = model.messages.length;
    meta.appendChild(createElement('span', '', count + (count === 1 ? ' message' : ' messages')));
    meta.appendChild(createElement('span', '', 'Exported ' + formatDate(model.exportedAt)));
    cover.appendChild(meta);

    const safe = safeLink(model.sourceUrl);
    if (safe) {
      const link = createElement('a', 'cover-link', 'Original conversation on gemini.google.com');
      link.href = safe;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      cover.appendChild(link);
    }

    cover.appendChild(createElement('div', 'cover-rule'));
    return cover;
  }

  function renderMessage(message) {
    const section = createElement('section', 'message ' + message.role);

    const header = createElement('div', 'msg-head');
    header.appendChild(createElement('span', 'msg-dot'));
    header.appendChild(createElement('span', 'msg-role', message.role === 'user' ? 'You' : 'Gemini'));
    if (message.timestamp) {
      header.appendChild(createElement('span', 'msg-time', message.timestamp));
    }
    section.appendChild(header);

    if (message.role === 'user') {
      const panel = createElement('div', 'user-panel');
      if (blocksTextLength(message.blocks) < 1600) panel.classList.add('short');
      renderBlocks(panel, message.blocks);
      section.appendChild(panel);
    } else {
      const responses = createElement('div', 'responses');
      renderBlocks(responses, message.blocks);
      section.appendChild(responses);
    }

    return section;
  }

  function renderDocument(model) {
    documentRoot.textContent = '';
    documentRoot.appendChild(renderCover(model));

    if (!model.messages.length) {
      documentRoot.appendChild(createElement('p', 'empty-note', 'There are no messages to print.'));
      return;
    }

    for (const message of model.messages) {
      documentRoot.appendChild(renderMessage(message));
    }
  }

  function printDocument() {
    window.print();
  }

  async function startAutoPrint() {
    if (autoPrintStarted) return;
    autoPrintStarted = true;
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch (_) {
      // Continue even if fonts are not ready.
    }
    setTimeout(printDocument, 350);
  }

  async function init() {
    closeButton.addEventListener('click', function () { window.close(); });
    printAgainButton.addEventListener('click', printDocument);

    const params = new URLSearchParams(location.search);
    const id = params.get('id');

    if (!id || !/^[A-Za-z0-9_-]{8,100}$/.test(id)) {
      statusText.textContent = 'This print link is invalid. Return to the PDF preview and try again.';
      status.querySelector('.status-spinner').hidden = true;
      return;
    }

    let stored;
    try {
      stored = await storageGet(EXPORT_PREFIX + id);
    } catch (_) {
      statusText.textContent = 'The conversation could not be read from browser storage.';
      status.querySelector('.status-spinner').hidden = true;
      return;
    }

    const entry = stored[EXPORT_PREFIX + id];
    const model = entry && entry.model;

    if (!model || !Array.isArray(model.messages) || !model.messages.length) {
      statusText.textContent = 'This export has expired. Return to Gemini and create a new PDF.';
      status.querySelector('.status-spinner').hidden = true;
      return;
    }

    document.title = makeFilename(model.title);
    renderDocument(model);

    status.hidden = true;
    documentRoot.hidden = false;
    printAgainButton.disabled = false;
    await startAutoPrint();
  }

  init().catch(function (error) {
    console.error('[Gemini Chat to PDF] Print view failed:', error);
    statusText.textContent = 'The print view could not be prepared. Close this tab and try again.';
    const spinner = status.querySelector('.status-spinner');
    if (spinner) spinner.hidden = true;
  });
})();

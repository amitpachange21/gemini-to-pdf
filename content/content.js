/*
 * Gemini Chat to PDF - in-page message selector
 */
(function () {
  'use strict';

  if (globalThis.__g2pdfContentLoaded) return;
  globalThis.__g2pdfContentLoaded = true;

  const HOST_ID = 'g2pdf-selector-root';
  const EXPORT_PREFIX = 'g2pdf:export:';
  const MAX_STORED_BYTES = 7 * 1024 * 1024;

  const SPARKLE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="M12 2.5c.38 4.67 2.83 7.12 7.5 7.5-4.67.38-7.12 2.83-7.5 7.5-.38-4.67-2.83-7.12-7.5-7.5 4.67-.38 7.12-2.83 7.5-7.5Z" fill="currentColor"/><path d="M18.7 15.6c.18 2.2 1.33 3.35 3.53 3.53-2.2.18-3.35 1.33-3.53 3.53-.18-2.2-1.33-3.35-3.53-3.53 2.2-.18 3.35-1.33 3.53-3.53Z" fill="currentColor" opacity=".65"/></svg>';
  const USER_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M5.8 19c.7-3.4 3-5.1 6.2-5.1s5.5 1.7 6.2 5.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const CLOSE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ARROW_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const DOC_SVG = '<svg viewBox="0 0 48 48" width="42" height="42" fill="none" aria-hidden="true"><path d="M13 5h14l9 9v27a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M27 5v9h9M18 24h12M18 30h12M18 36h7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const CSS = `
    :host {
      all: initial;
    }
    :host::backdrop {
      background: transparent;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    [hidden] {
      display: none !important;
    }
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 22px;
      background: rgba(10, 15, 28, 0.58);
      -webkit-backdrop-filter: blur(8px);
      backdrop-filter: blur(8px);
      color: #182230;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      animation: g2pdf-fade 140ms ease-out;
    }
    .dialog {
      position: relative;
      display: flex;
      flex-direction: column;
      width: min(700px, 100%);
      max-height: min(820px, calc(100vh - 44px));
      overflow: hidden;
      background: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.55);
      border-radius: 20px;
      box-shadow: 0 32px 80px rgba(4, 10, 30, 0.34), 0 4px 16px rgba(4, 10, 30, 0.12);
      outline: none;
      animation: g2pdf-rise 170ms cubic-bezier(.2,.8,.2,1);
    }
    .dialog::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #4285f4, #8b5cf6 55%, #d946ef);
    }
    .head {
      flex: none;
      padding: 22px 24px 16px;
      background: linear-gradient(180deg, rgba(248, 250, 255, 0.9), #ffffff);
    }
    .head-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: #64748b;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.13em;
      text-transform: uppercase;
    }
    .eyebrow svg {
      color: #7c3aed;
    }
    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      color: #64748b;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 9px;
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease;
    }
    .icon-btn:hover {
      color: #0f172a;
      background: #f1f5f9;
    }
    .icon-btn:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
    }
    .title-row {
      display: flex;
      gap: 13px;
      align-items: flex-start;
    }
    .brand-mark {
      display: grid;
      place-items: center;
      flex: none;
      width: 42px;
      height: 42px;
      color: #ffffff;
      background: linear-gradient(135deg, #4285f4, #8b5cf6 58%, #c026d3);
      border-radius: 13px;
      box-shadow: 0 8px 20px rgba(99, 102, 241, 0.28);
    }
    h2 {
      margin: 1px 0 3px;
      color: #101828;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.25;
    }
    .subtitle {
      max-width: 510px;
      margin: 0;
      overflow: hidden;
      color: #667085;
      font-size: 12.5px;
      line-height: 1.45;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .toolbar {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 11px 24px;
      background: #f8fafc;
      border-top: 1px solid #eaecf0;
      border-bottom: 1px solid #eaecf0;
    }
    .check-all {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      color: #344054;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
    }
    input[type="checkbox"] {
      width: 17px;
      height: 17px;
      margin: 0;
      accent-color: #6366f1;
      cursor: pointer;
    }
    input[type="checkbox"]:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
    }
    .count {
      color: #667085;
      font-size: 11.5px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .list {
      flex: 1 1 auto;
      min-height: 120px;
      padding: 10px 14px 14px;
      overflow-y: auto;
      overscroll-behavior: contain;
      background: #ffffff;
      scrollbar-width: thin;
      scrollbar-color: #cbd5e1 transparent;
    }
    .list::-webkit-scrollbar {
      width: 9px;
    }
    .list::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      background-clip: content-box;
      border: 3px solid transparent;
      border-radius: 99px;
    }
    .msg {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin: 3px 0;
      padding: 11px 12px;
      border: 1px solid transparent;
      border-radius: 12px;
      cursor: pointer;
      transition: background 110ms ease, border-color 110ms ease;
    }
    .msg:hover {
      background: #f8fafc;
      border-color: #eef2f7;
    }
    .msg:has(input:checked) {
      background: #fbfcff;
    }
    .msg:has(input:focus-visible) {
      border-color: #a5b4fc;
    }
    .msg-icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 30px;
      height: 30px;
      margin-top: 1px;
      border-radius: 9px;
    }
    .msg-icon.user {
      color: #2563eb;
      background: #eff6ff;
    }
    .msg-icon.assistant {
      color: #7c3aed;
      background: #f5f3ff;
    }
    .msg-body {
      flex: 1 1 auto;
      min-width: 0;
    }
    .msg-meta {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 3px;
    }
    .role {
      color: #344054;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .role.user {
      color: #1d4ed8;
    }
    .role.assistant {
      color: #6d28d9;
    }
    .timestamp {
      color: #98a2b3;
      font-size: 10.5px;
    }
    .snippet {
      display: -webkit-box;
      overflow: hidden;
      color: #475467;
      font-size: 12.5px;
      line-height: 1.5;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      word-break: break-word;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 6px;
    }
    .tag {
      padding: 1.5px 6px;
      color: #7c3aed;
      font-size: 9.5px;
      font-weight: 600;
      background: #f5f3ff;
      border-radius: 4px;
    }
    .msg > input {
      flex: none;
      margin-top: 8px;
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 280px;
      padding: 36px 24px;
      text-align: center;
    }
    .empty-icon {
      display: grid;
      place-items: center;
      width: 72px;
      height: 72px;
      margin-bottom: 17px;
      color: #8b5cf6;
      background: #f5f3ff;
      border-radius: 22px;
    }
    .empty h3 {
      margin: 0 0 6px;
      color: #101828;
      font-size: 15px;
      font-weight: 700;
    }
    .empty p {
      max-width: 360px;
      margin: 0;
      color: #667085;
      font-size: 12.5px;
      line-height: 1.6;
    }
    .foot {
      flex: none;
      padding: 13px 24px 16px;
      background: #ffffff;
      border-top: 1px solid #eaecf0;
    }
    .error {
      margin: 0 0 10px;
      padding: 8px 10px;
      color: #b42318;
      font-size: 12px;
      line-height: 1.45;
      background: #fef3f2;
      border: 1px solid #fee4e2;
      border-radius: 8px;
    }
    .foot-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .hint {
      color: #98a2b3;
      font-size: 10.5px;
      white-space: nowrap;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: 38px;
      padding: 0 15px;
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 650;
      border-radius: 9px;
      cursor: pointer;
      transition: transform 90ms ease, background 120ms ease, opacity 120ms ease;
    }
    .btn:active:not(:disabled) {
      transform: translateY(1px);
    }
    .btn:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
    }
    .btn:disabled {
      cursor: default;
      opacity: 0.55;
    }
    .btn.ghost {
      color: #475467;
      background: #ffffff;
      border: 1px solid #d0d5dd;
    }
    .btn.ghost:hover:not(:disabled) {
      background: #f9fafb;
    }
    .btn.primary {
      color: #ffffff;
      background: linear-gradient(135deg, #4f7cff, #7c3aed);
      border: 1px solid rgba(80, 70, 229, 0.5);
      box-shadow: 0 5px 12px rgba(79, 70, 229, 0.2);
    }
    .btn.primary:hover:not(:disabled) {
      background: linear-gradient(135deg, #446ff5, #6d28d9);
    }
    .spinner {
      display: none;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.38);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: g2pdf-spin 650ms linear infinite;
    }
    .btn[data-busy="true"] .spinner {
      display: inline-block;
    }
    .btn[data-busy="true"] .arrow {
      display: none;
    }
    @keyframes g2pdf-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes g2pdf-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes g2pdf-rise {
      from { opacity: 0; transform: translateY(8px) scale(0.99); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (prefers-color-scheme: dark) {
      .backdrop {
        color: #e5e7eb;
        background: rgba(3, 7, 18, 0.7);
      }
      .dialog {
        background: #161a22;
        border-color: rgba(255, 255, 255, 0.08);
        box-shadow: 0 32px 90px rgba(0, 0, 0, 0.55);
      }
      .head {
        background: linear-gradient(180deg, #191e28, #161a22);
      }
      .eyebrow {
        color: #94a3b8;
      }
      .icon-btn {
        color: #94a3b8;
      }
      .icon-btn:hover {
        color: #f8fafc;
        background: #232a36;
      }
      h2 {
        color: #f8fafc;
      }
      .subtitle,
      .count,
      .timestamp {
        color: #94a3b8;
      }
      .toolbar {
        background: #1a1f29;
        border-color: #2a3240;
      }
      .check-all {
        color: #d0d5dd;
      }
      .list {
        background: #161a22;
        scrollbar-color: #465063 transparent;
      }
      .msg:hover {
        background: #1c2230;
        border-color: #283243;
      }
      .msg:has(input:checked) {
        background: #1a2030;
      }
      .msg-icon.user {
        color: #93b4ff;
        background: rgba(37, 99, 235, 0.18);
      }
      .msg-icon.assistant {
        color: #c4b5fd;
        background: rgba(124, 58, 237, 0.2);
      }
      .role {
        color: #e4e7ec;
      }
      .role.user {
        color: #93c5fd;
      }
      .role.assistant {
        color: #c4b5fd;
      }
      .snippet {
        color: #b6c0cf;
      }
      .tag {
        color: #c4b5fd;
        background: rgba(124, 58, 237, 0.16);
      }
      .empty h3 {
        color: #f8fafc;
      }
      .empty p {
        color: #94a3b8;
      }
      .empty-icon {
        color: #c4b5fd;
        background: rgba(124, 58, 237, 0.16);
      }
      .foot {
        background: #161a22;
        border-color: #2a3240;
      }
      .btn.ghost {
        color: #d0d5dd;
        background: #1c222d;
        border-color: #344054;
      }
      .btn.ghost:hover:not(:disabled) {
        background: #232a36;
      }
      .error {
        color: #fecdca;
        background: rgba(180, 35, 24, 0.16);
        border-color: rgba(240, 68, 56, 0.32);
      }
    }
    @media (max-width: 560px) {
      .backdrop { padding: 10px; }
      .dialog { max-height: calc(100vh - 20px); border-radius: 15px; }
      .head { padding: 18px 18px 14px; }
      .toolbar { padding: 10px 18px; }
      .list { padding: 8px 8px 10px; }
      .foot { padding: 12px 18px 14px; }
      .hint { display: none; }
      .foot-row { justify-content: flex-end; }
      .msg { padding: 10px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .backdrop, .dialog { animation: none; }
      .btn, .icon-btn, .msg { transition: none; }
    }
  `;

  let activeHost = null;
  let activeShadow = null;
  let previousHtmlOverflow = '';
  let globalKeyHandler = null;

  function makeId() {
    if (globalThis.crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'export-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function storageSet(value) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.set(value, function () {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageRemove(key) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.remove(key, function () { resolve(); });
      } catch (_) {
        resolve();
      }
    });
  }

  function storageGetAll() {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.get(null, function (items) {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(items || {});
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function clearStoredExports() {
    try {
      const all = await storageGetAll();
      const keys = Object.keys(all).filter(function (key) {
        return key.indexOf(EXPORT_PREFIX) === 0;
      });
      if (keys.length) {
        await new Promise(function (resolve) {
          chrome.storage.local.remove(keys, function () { resolve(); });
        });
      }
    } catch (_) {
      // Not fatal: the write below will surface any real storage problem.
    }
  }

  function sendMessage(message) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.runtime.sendMessage(message, function (response) {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function messageTags(blocks) {
    let code = 0;
    let tables = 0;
    for (const block of blocks || []) {
      if (!block) continue;
      if (block.type === 'code') code += 1;
      if (block.type === 'table') tables += 1;
    }
    const tags = [];
    if (code) tags.push(code + (code === 1 ? ' code block' : ' code blocks'));
    if (tables) tags.push(tables + (tables === 1 ? ' table' : ' tables'));
    return tags;
  }

  function closeOverlay() {
    if (!activeHost) return;
    if (globalKeyHandler) {
      window.removeEventListener('keydown', globalKeyHandler, true);
      globalKeyHandler = null;
    }
    document.documentElement.style.overflow = previousHtmlOverflow;
    try {
      if (typeof activeHost.close === 'function' && activeHost.open) {
        activeHost.close();
      }
    } catch (_) {
      // Removing the element below is enough.
    }
    activeHost.remove();
    activeHost = null;
    activeShadow = null;
  }

  function buildMessageRow(message, extractor) {
    const plain = extractor.blocksToPlainText(message.blocks).replace(/\s+/g, ' ').trim();
    const snippet = plain.length > 300 ? plain.slice(0, 300).replace(/\s+\S*$/, '') + '\u2026' : plain;
    const isUser = message.role === 'user';

    const label = document.createElement('label');
    label.className = 'msg';

    const icon = document.createElement('span');
    icon.className = 'msg-icon ' + (isUser ? 'user' : 'assistant');
    icon.innerHTML = isUser ? USER_SVG : SPARKLE_SVG;

    const body = document.createElement('span');
    body.className = 'msg-body';

    const meta = document.createElement('span');
    meta.className = 'msg-meta';

    const role = document.createElement('span');
    role.className = 'role ' + (isUser ? 'user' : 'assistant');
    role.textContent = isUser ? 'You' : 'Gemini';
    meta.appendChild(role);

    if (message.timestamp) {
      const time = document.createElement('span');
      time.className = 'timestamp';
      time.textContent = message.timestamp;
      meta.appendChild(time);
    }

    const text = document.createElement('span');
    text.className = 'snippet';
    text.textContent = snippet || 'No text content';

    body.appendChild(meta);
    body.appendChild(text);

    const tags = messageTags(message.blocks);
    if (tags.length) {
      const tagWrap = document.createElement('span');
      tagWrap.className = 'tags';
      for (const tag of tags) {
        const chip = document.createElement('span');
        chip.className = 'tag';
        chip.textContent = tag;
        tagWrap.appendChild(chip);
      }
      body.appendChild(tagWrap);
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.value = message.id;
    checkbox.setAttribute('aria-label', 'Include ' + (isUser ? 'your message' : 'Gemini response') + ' in the PDF');
    checkbox.dataset.messageId = message.id;

    label.appendChild(icon);
    label.appendChild(body);
    label.appendChild(checkbox);
    return label;
  }

  function showEmpty(dialog, title, message) {
    const list = dialog.querySelector('[data-role="list"]');
    const toolbar = dialog.querySelector('.toolbar');
    const done = dialog.querySelector('[data-action="done"]');
    const cancel = dialog.querySelector('[data-action="cancel"]');
    const hint = dialog.querySelector('.hint');
    const subtitle = dialog.querySelector('[data-role="subtitle"]');
    const count = dialog.querySelector('[data-role="count"]');

    list.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '<div class="empty-icon">' + DOC_SVG + '</div><h3></h3><p></p>';
    empty.querySelector('h3').textContent = title;
    empty.querySelector('p').textContent = message;
    list.appendChild(empty);

    toolbar.hidden = true;
    done.hidden = true;
    cancel.textContent = 'Close';
    hint.textContent = '';
    count.textContent = '';
    subtitle.textContent = 'Gemini Chat to PDF';
  }

  function openSelector() {
    if (activeHost) {
      const dialog = activeShadow && activeShadow.querySelector('.dialog');
      if (dialog) dialog.focus();
      return;
    }

    let model;
    let extractionError = null;
    try {
      if (!globalThis.GeminiPdfExtractor) {
        throw new Error('The extractor did not load.');
      }
      model = globalThis.GeminiPdfExtractor.extractConversation();
    } catch (error) {
      extractionError = error;
      console.error('[Gemini Chat to PDF] Extraction failed:', error);
    }

    const host = document.createElement('dialog');
    host.id = HOST_ID;
    host.setAttribute('aria-label', 'Export conversation');
    host.style.cssText = [
      'position: fixed',
      'inset: 0',
      'width: 100vw',
      'height: 100vh',
      'max-width: none',
      'max-height: none',
      'margin: 0',
      'padding: 0',
      'border: 0',
      'background: transparent',
      'overflow: visible',
      'z-index: 2147483647',
      'display: block'
    ].join(';');

    const root = document.createElement('div');
    root.id = 'g2pdf-selector-shadow';
    root.style.cssText = 'display: block; width: 100%; height: 100%;';

    const shadow = root.attachShadow({ mode: 'open' });

    let stylesApplied = false;
    try {
      if (typeof CSSStyleSheet === 'function' && 'adoptedStyleSheets' in shadow) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(CSS);
        shadow.adoptedStyleSheets = [sheet];
        stylesApplied = true;
      }
    } catch (_) {
      stylesApplied = false;
    }
    if (!stylesApplied) {
      const style = document.createElement('style');
      style.textContent = CSS;
      shadow.appendChild(style);
    }

    const ui = document.createElement('div');
    ui.innerHTML = `
      <div class="backdrop" data-role="backdrop">
        <div class="dialog" tabindex="-1">
          <header class="head">
            <div class="head-top">
              <span class="eyebrow">${SPARKLE_SVG} Gemini export</span>
              <button type="button" class="icon-btn" data-action="close" aria-label="Close export dialog">${CLOSE_SVG}</button>
            </div>
            <div class="title-row">
              <span class="brand-mark">${SPARKLE_SVG}</span>
              <div>
                <h2 id="g2pdf-dialog-title">Export conversation</h2>
                <p class="subtitle" data-role="subtitle">Select the messages you want in your PDF.</p>
              </div>
            </div>
          </header>
          <div class="toolbar">
            <label class="check-all">
              <input type="checkbox" data-role="select-all" checked>
              <span>Select all</span>
            </label>
            <span class="count" data-role="count"></span>
          </div>
          <div class="list" data-role="list"></div>
          <footer class="foot">
            <div class="error" role="alert" data-role="error" hidden></div>
            <div class="foot-row">
              <span class="hint">Everything stays in your browser</span>
              <div class="actions">
                <button type="button" class="btn ghost" data-action="cancel">Cancel</button>
                <button type="button" class="btn primary" data-action="done">
                  <span class="spinner" aria-hidden="true"></span>
                  <span data-role="done-label">Done</span>
                  <span class="arrow">${ARROW_SVG}</span>
                </button>
              </div>
            </div>
          </footer>
        </div>
      </div>
    `;
    shadow.appendChild(ui);
    host.appendChild(root);

    const dialog = shadow.querySelector('.dialog');
    const backdrop = shadow.querySelector('[data-role="backdrop"]');
    const list = shadow.querySelector('[data-role="list"]');
    const selectAll = shadow.querySelector('[data-role="select-all"]');
    const count = shadow.querySelector('[data-role="count"]');
    const subtitle = shadow.querySelector('[data-role="subtitle"]');
    const doneButton = shadow.querySelector('[data-action="done"]');
    const cancelButton = shadow.querySelector('[data-action="cancel"]');
    const errorBox = shadow.querySelector('[data-role="error"]');
    const doneLabel = shadow.querySelector('[data-role="done-label"]');
    let preparing = false;

    activeHost = host;
    activeShadow = shadow;
    previousHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.appendChild(host);

    try {
      if (typeof host.showModal === 'function') {
        host.showModal();
      }
    } catch (error) {
      console.warn('[Gemini Chat to PDF] Could not open the modal selector:', error);
    }

    host.addEventListener('cancel', function (event) {
      event.preventDefault();
      if (!preparing) closeOverlay();
    });

    function getCheckboxes() {
      return Array.from(shadow.querySelectorAll('[data-role="list"] input[type="checkbox"]'));
    }

    function updateSelectionState() {
      const checkboxes = getCheckboxes();
      const checked = checkboxes.filter(function (box) { return box.checked; }).length;
      const total = checkboxes.length;

      selectAll.checked = total > 0 && checked === total;
      selectAll.indeterminate = checked > 0 && checked < total;
      count.textContent = `${checked} of ${total} selected`;
      doneButton.disabled = checked === 0 || preparing;
    }

    function onListChange(event) {
      if (!event.target || event.target.type !== 'checkbox') return;
      errorBox.hidden = true;
      updateSelectionState();
    }

    function onSelectAllChange() {
      const target = selectAll.checked;
      for (const box of getCheckboxes()) box.checked = target;
      errorBox.hidden = true;
      updateSelectionState();
    }

    async function onDone() {
      if (preparing) return;
      const selectedIds = new Set(
        getCheckboxes().filter(function (box) { return box.checked; }).map(function (box) { return box.value; })
      );

      if (!selectedIds.size) {
        showError('Select at least one message to continue.');
        return;
      }

      const selectedMessages = model.messages.filter(function (message) {
        return selectedIds.has(message.id);
      });

      if (!selectedMessages.length) {
        showError('Select at least one message to continue.');
        return;
      }

      const exportModel = Object.assign({}, model, {
        messages: selectedMessages,
        exportedAt: new Date().toISOString()
      });

      let json;
      try {
        json = JSON.stringify(exportModel);
      } catch (_) {
        showError('This conversation could not be prepared. Please try again.');
        return;
      }

      const bytes = new Blob([json]).size;
      if (bytes > MAX_STORED_BYTES) {
        showError('That selection is too large (over 7 MB). Select fewer messages and try again.');
        return;
      }

      setPreparing(true);
      errorBox.hidden = true;

      const id = makeId();
      const key = EXPORT_PREFIX + id;

      try {
        await clearStoredExports();
        await storageSet({ [key]: { createdAt: Date.now(), model: exportModel } });
        const response = await sendMessage({ type: 'OPEN_PREVIEW', id: id });

        if (!response || !response.ok) {
          await storageRemove(key);
          throw new Error((response && response.error) || 'The preview tab could not be opened.');
        }

        closeOverlay();
      } catch (error) {
        await storageRemove(key);
        setPreparing(false);
        const message = String((error && error.message) || error || '');
        if (/quota|QUOTA_BYTES/i.test(message)) {
          showError('Browser storage is full. Try selecting fewer messages.');
        } else if (/context invalidated|receiving end does not exist|message port closed/i.test(message)) {
          showError('The extension was updated. Refresh this Gemini tab, then try again.');
        } else {
          showError('Could not create the PDF preview. ' + message);
        }
      }
    }

    function showError(message) {
      errorBox.textContent = message;
      errorBox.hidden = false;
      dialog.querySelector('.foot').scrollIntoView({ block: 'nearest' });
    }

    function setPreparing(value) {
      preparing = value;
      const allInputs = Array.from(shadow.querySelectorAll('input, button'));
      for (const input of allInputs) {
        input.disabled = value;
      }
      doneButton.dataset.busy = value ? 'true' : 'false';
      doneLabel.textContent = value ? 'Preparing PDF\u2026' : 'Done';
      dialog.setAttribute('aria-busy', value ? 'true' : 'false');
      if (!value) updateSelectionState();
    }

    if (extractionError || !model || !model.messages || !model.messages.length) {
      showEmpty(
        dialog,
        'No conversation found',
        extractionError
          ? 'The page could not be read. Refresh Gemini, open a conversation, and try again.'
          : 'Open a Gemini conversation that has at least one message, then click Export chat again.'
      );
    } else {
      subtitle.textContent = model.title || 'Gemini conversation';
      subtitle.title = model.title || '';
      const fragment = document.createDocumentFragment();
      for (const message of model.messages) {
        fragment.appendChild(buildMessageRow(message, globalThis.GeminiPdfExtractor));
      }
      list.appendChild(fragment);
      updateSelectionState();
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!preparing) closeOverlay();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        shadow.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]')
      ).filter(function (element) {
        return element.getClientRects().length > 0;
      });
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = shadow.activeElement;

      if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (current === first || current === dialog)) {
        event.preventDefault();
        last.focus();
      }
    }

    shadow.addEventListener('change', function (event) {
      if (event.target === selectAll) onSelectAllChange();
      else onListChange(event);
    });

    shadow.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const actionElement = target.closest('[data-action]');
      if (!actionElement) return;
      const action = actionElement.getAttribute('data-action');
      if (action === 'close' || action === 'cancel') {
        if (!preparing) closeOverlay();
      } else if (action === 'done') {
        onDone();
      }
    });

    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop && !preparing) closeOverlay();
    });

    shadow.addEventListener('keydown', onKeyDown);

    globalKeyHandler = function (event) {
      if (event.key === 'Escape' && !preparing) {
        event.preventDefault();
        closeOverlay();
      }
    };
    window.addEventListener('keydown', globalKeyHandler, true);

    requestAnimationFrame(function () {
      dialog.focus();
    });
  }

  try {
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'PING') {
        sendResponse({ ok: true, version: '1.0.0' });
        return;
      }
      if (message.type === 'OPEN_SELECTOR') {
        try {
          openSelector();
          sendResponse({ ok: true });
        } catch (error) {
          console.error('[Gemini Chat to PDF] Could not open selector:', error);
          sendResponse({ ok: false, error: String((error && error.message) || error) });
        }
      }
    });
  } catch (error) {
    console.error('[Gemini Chat to PDF] Could not register message listener:', error);
  }
})();

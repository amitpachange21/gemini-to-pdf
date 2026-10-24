'use strict';

(function () {
  const status = document.getElementById('status');
  const statusTitle = document.getElementById('statusTitle');
  const statusDetail = document.getElementById('statusDetail');
  const exportButton = document.getElementById('exportButton');
  const exportLabel = document.getElementById('exportLabel');
  const openButton = document.getElementById('openButton');
  const errorBox = document.getElementById('error');

  let activeTab = null;
  let supported = false;
  let busy = false;

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function isGeminiUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'gemini.google.com';
    } catch (_) {
      return false;
    }
  }

  function displayTitle(title) {
    const cleaned = String(title || '')
      .replace(/\s*[-\u2013|]\s*(Google\s+)?Gemini.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || /^(gemini|google gemini)$/i.test(cleaned)) return '';
    return cleaned;
  }

  function setStatus(state, title, detail, wrap) {
    status.dataset.state = state;
    statusTitle.textContent = title;
    statusDetail.textContent = detail;
    statusDetail.classList.toggle('wrap', Boolean(wrap));
  }

  function setBusy(value) {
    busy = value;
    exportButton.classList.toggle('loading', value);
    exportButton.disabled = value || !supported;
    exportLabel.textContent = value ? 'Opening selector…' : 'Export chat';
    if (value) errorBox.hidden = true;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  async function init() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTab = tabs && tabs[0] ? tabs[0] : null;
    } catch (_) {
      activeTab = null;
    }

    supported = Boolean(activeTab && isGeminiUrl(activeTab.url));
    exportButton.disabled = !supported;

    if (supported) {
      const title = displayTitle(activeTab.title);
      setStatus(
        'ready',
        'Ready to export',
        title || 'Gemini conversation detected. Click Export chat to choose messages.'
      );
      openButton.hidden = true;
    } else {
      setStatus(
        'waiting',
        'This isn\'t a Gemini tab',
        'Open a conversation on gemini.google.com, then click Export chat.',
        true
      );
      openButton.hidden = false;
    }
  }

  async function sendToTab(tabId, message) {
    return chrome.tabs.sendMessage(tabId, message);
  }

  async function ensureContentScript(tabId) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await sendToTab(tabId, { type: 'PING' });
        if (response && response.ok) return;
      } catch (_) {
        // The content script is not ready yet.
      }

      if (attempt === 0) {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content/extractor.js', 'content/content.js']
        });
        await delay(60);
      }
    }
    throw new Error('The page could not be reached.');
  }

  async function startExport() {
    if (busy || !supported || !activeTab || typeof activeTab.id !== 'number') return;

    setBusy(true);
    try {
      await ensureContentScript(activeTab.id);
      const response = await sendToTab(activeTab.id, { type: 'OPEN_SELECTOR' });
      if (!response || !response.ok) {
        throw new Error((response && response.error) || 'The selector could not be opened.');
      }
      window.close();
    } catch (error) {
      const message = String((error && error.message) || error || '');
      if (/cannot access|missing host permission|no tab with id|frame with id/i.test(message)) {
        showError('This tab can\'t be read. Open a Gemini conversation and try again.');
      } else if (/context invalidated|receiving end does not exist|message port closed/i.test(message)) {
        showError('Gemini was updated or the extension was reloaded. Refresh the Gemini tab, then try again.');
      } else if (/could not be reached/i.test(message)) {
        showError('Could not reach this Gemini page. Refresh it once, then try again.');
      } else {
        showError('Could not start the export. ' + message);
      }
      setStatus('error', 'Export didn\'t start', 'Refresh the Gemini tab and try again.', true);
      setBusy(false);
    }
  }

  exportButton.addEventListener('click', startExport);

  openButton.addEventListener('click', function () {
    chrome.tabs.create({ url: 'https://gemini.google.com/app' });
    window.close();
  });

  init().catch(function (error) {
    console.error('[Gemini Chat to PDF] Popup failed:', error);
    setStatus('error', 'Something went wrong', 'Close this popup and try again.', true);
  });
})();

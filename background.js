/*
 * Gemini Chat to PDF - service worker
 *
 * The content script stores a prepared export in chrome.storage.local and
 * asks us to open the preview tab. We validate the request, keep storage
 * tidy, and create the extension page.
 */
const EXPORT_PREFIX = 'g2pdf:export:';
const EXPORT_TTL = 7 * 24 * 60 * 60 * 1000;
const KEEP_EXPORTS = 4;

function isGeminiSender(sender) {
  try {
    const url = new URL(sender.tab && sender.tab.url ? sender.tab.url : '');
    return url.protocol === 'https:' && url.hostname === 'gemini.google.com';
  } catch (_) {
    return false;
  }
}

function isValidId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(id);
}

async function pruneExports(keepId) {
  try {
    const all = await chrome.storage.local.get(null);
    const entries = Object.keys(all)
      .filter(function (key) { return key.indexOf(EXPORT_PREFIX) === 0; })
      .map(function (key) { return [key, all[key] || {}]; });

    entries.sort(function (a, b) {
      return (b[1].createdAt || 0) - (a[1].createdAt || 0);
    });

    const keepKeys = new Set();
    if (keepId) keepKeys.add(EXPORT_PREFIX + keepId);
    for (const entry of entries) {
      if (keepKeys.size >= KEEP_EXPORTS) break;
      keepKeys.add(entry[0]);
    }

    const now = Date.now();
    const remove = entries
      .filter(function (entry) {
        return !keepKeys.has(entry[0]) || (now - (entry[1].createdAt || 0)) > EXPORT_TTL;
      })
      .map(function (entry) { return entry[0]; });

    if (remove.length) await chrome.storage.local.remove(remove);
  } catch (error) {
    console.warn('[Gemini Chat to PDF] Could not prune old exports:', error);
  }
}

async function openPreview(message, sender) {
  if (!isGeminiSender(sender)) {
    return { ok: false, error: 'Exports can only be started from gemini.google.com.' };
  }
  if (!isValidId(message.id)) {
    return { ok: false, error: 'The export request was invalid.' };
  }

  const key = EXPORT_PREFIX + message.id;
  let stored;
  try {
    stored = await chrome.storage.local.get(key);
  } catch (_) {
    return { ok: false, error: 'The prepared export could not be read.' };
  }

  if (!stored[key] || !stored[key].model) {
    return { ok: false, error: 'The prepared export was not found. Please try again.' };
  }

  await pruneExports(message.id);

  const url = chrome.runtime.getURL('preview/preview.html') +
    '?id=' + encodeURIComponent(message.id);

  try {
    await chrome.tabs.create({
      url: url,
      active: true,
      openerTabId: sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : undefined,
      index: sender.tab && typeof sender.tab.index === 'number' ? sender.tab.index + 1 : undefined
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: 'The preview tab could not be opened.' };
  }
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== 'OPEN_PREVIEW') return;

  openPreview(message, sender)
    .then(sendResponse)
    .catch(function (error) {
      console.error('[Gemini Chat to PDF] Preview failed:', error);
      sendResponse({ ok: false, error: 'Something went wrong while opening the preview.' });
    });

  return true;
});

chrome.runtime.onInstalled.addListener(function () {
  pruneExports();
});

chrome.runtime.onStartup.addListener(function () {
  pruneExports();
});

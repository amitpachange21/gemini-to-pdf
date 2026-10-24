'use strict';

(function () {
  const EXPORT_PREFIX = 'g2pdf:export:';
  const PAGE_RATIO_DEFAULT = 595.28 / 841.89;

  const els = {
    loading: document.getElementById('loading'),
    loadingText: document.getElementById('loadingText'),
    progressBar: document.getElementById('progressBar'),
    viewer: document.getElementById('viewer'),
    pages: document.getElementById('pages'),
    endNote: document.getElementById('endNote'),
    errorPanel: document.getElementById('errorPanel'),
    errorTitle: document.getElementById('errorTitle'),
    errorText: document.getElementById('errorText'),
    errorActions: document.getElementById('errorActions'),
    docTitle: document.getElementById('docTitle'),
    docMeta: document.getElementById('docMeta'),
    sourceLink: document.getElementById('sourceLink'),
    printButton: document.getElementById('printButton'),
    saveButton: document.getElementById('saveButton'),
    toast: document.getElementById('toast')
  };

  const state = {
    id: null,
    model: null,
    pdfBlob: null,
    pdfDoc: null,
    observer: null,
    pageStates: new Map(),
    queue: [],
    pumping: false,
    toastTimer: null
  };

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

  function nextPaint() {
    return new Promise(function (resolve) {
      setTimeout(resolve, 28);
    });
  }

  function setProgress(percent, text) {
    els.progressBar.style.width = Math.max(6, Math.min(100, percent)) + '%';
    if (text) els.loadingText.textContent = text;
  }

  function enableOutputButtons() {
    els.saveButton.disabled = !state.pdfBlob;
    els.printButton.disabled = !state.model;
  }

  function showToast(message) {
    if (state.toastTimer) clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    state.toastTimer = setTimeout(function () {
      els.toast.hidden = true;
      state.toastTimer = null;
    }, 2800);
  }

  function openGemini() {
    chrome.tabs.create({ url: 'https://gemini.google.com/app' });
  }

  function openPrintPage() {
    if (!state.id) return;
    chrome.tabs.create({
      url: chrome.runtime.getURL('print/print.html') + '?id=' + encodeURIComponent(state.id)
    });
  }

  function savePdf() {
    if (!state.pdfBlob) return;
    const filename = globalThis.GeminiPdfBuilder.sanitizeFilename(
      state.model && state.model.title ? state.model.title : 'Gemini chat'
    );
    const url = URL.createObjectURL(state.pdfBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    showToast('Download started');
  }

  function showError(title, message, actions) {
    els.loading.hidden = true;
    els.viewer.hidden = true;
    els.errorPanel.hidden = false;
    els.errorTitle.textContent = title;
    els.errorText.textContent = message;
    els.errorActions.textContent = '';

    for (const action of actions || []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn ' + (action.primary ? 'primary' : 'ghost');
      button.textContent = action.label;
      button.addEventListener('click', action.onClick);
      els.errorActions.appendChild(button);
    }
  }

  function isValidModel(model) {
    return Boolean(
      model &&
      Array.isArray(model.messages) &&
      model.messages.length &&
      model.messages.every(function (message) {
        return message && (message.role === 'user' || message.role === 'assistant') &&
          Array.isArray(message.blocks);
      })
    );
  }

  function applyModelToPage(model) {
    const title = String(model.title || 'Gemini conversation').trim() || 'Gemini conversation';
    document.title = title + ' - Gemini PDF';
    els.docTitle.textContent = title;
    els.docTitle.title = title;
    els.docMeta.textContent = model.messages.length +
      (model.messages.length === 1 ? ' message' : ' messages') +
      ' · preparing PDF';

    try {
      const url = new URL(model.sourceUrl);
      if (url.protocol === 'https:' && url.hostname === 'gemini.google.com') {
        els.sourceLink.href = url.href;
        els.sourceLink.hidden = false;
      }
    } catch (_) {
      // Ignore an unavailable source URL.
    }
  }

  function makePageElement(pageNumber, ratio) {
    const page = document.createElement('div');
    page.className = 'page';
    page.dataset.page = String(pageNumber);

    const skeleton = document.createElement('div');
    skeleton.className = 'page-skeleton';
    skeleton.setAttribute('aria-hidden', 'true');

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Page ' + pageNumber);

    const badge = document.createElement('span');
    badge.className = 'page-badge';
    badge.textContent = 'Page ' + pageNumber;

    page.appendChild(skeleton);
    page.appendChild(canvas);
    page.appendChild(badge);
    page.style.setProperty('--page-ratio', String(ratio));
    return page;
  }

  function clearPage(page) {
    const pageState = state.pageStates.get(page);
    if (!pageState || pageState.rendering) return;
    const canvas = page.querySelector('canvas');
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    page.classList.remove('is-rendered');
    pageState.rendered = false;
  }

  function enqueuePage(page) {
    const pageState = state.pageStates.get(page);
    if (!pageState || pageState.rendered || pageState.rendering || pageState.queued) return;
    pageState.queued = true;
    state.queue.push(page);
    pumpQueue();
  }

  async function pumpQueue() {
    if (state.pumping) return;
    state.pumping = true;

    while (state.queue.length) {
      const page = state.queue.shift();
      const pageState = state.pageStates.get(page);
      if (!pageState) continue;
      pageState.queued = false;

      if (!pageState.visible || !page.isConnected) continue;

      try {
        await renderPage(page);
      } catch (error) {
        console.warn('[Gemini Chat to PDF] Could not render page:', error);
        const canvas = page.querySelector('canvas');
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
    }

    state.pumping = false;
  }

  async function renderPage(page) {
    const pageState = state.pageStates.get(page);
    if (!pageState || pageState.rendered || pageState.rendering) return;

    pageState.rendering = true;
    try {
      const pageNumber = Number(page.dataset.page);
      const pdfPage = await state.pdfDoc.getPage(pageNumber);
      const baseViewport = pdfPage.getViewport({ scale: 1 });
      const cssWidth = page.clientWidth || Math.min(840, window.innerWidth - 40);
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const scale = (cssWidth / baseViewport.width) * dpr;
      const viewport = pdfPage.getViewport({ scale: scale });

      const canvas = page.querySelector('canvas');
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas is unavailable.');

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await pdfPage.render({
        canvasContext: context,
        viewport: viewport,
        background: '#FFFFFF'
      }).promise;
    } finally {
      pageState.rendering = false;
    }

    if (!pageState.visible || !page.isConnected) {
      clearPage(page);
      return;
    }

    pageState.rendered = true;
    page.classList.add('is-rendered');
  }

  async function showDocument() {
    const firstPage = await state.pdfDoc.getPage(1);
    const baseViewport = firstPage.getViewport({ scale: 1 });
    const ratio = baseViewport.width / baseViewport.height || PAGE_RATIO_DEFAULT;

    els.pages.textContent = '';
    state.pageStates.clear();
    state.queue.length = 0;

    const fragment = document.createDocumentFragment();
    for (let pageNumber = 1; pageNumber <= state.pdfDoc.numPages; pageNumber += 1) {
      const page = makePageElement(pageNumber, ratio);
      state.pageStates.set(page, {
        visible: false,
        queued: false,
        rendering: false,
        rendered: false
      });
      fragment.appendChild(page);
    }
    els.pages.appendChild(fragment);

    els.docMeta.textContent = state.pdfDoc.numPages +
      (state.pdfDoc.numPages === 1 ? ' page' : ' pages') + ' · ' +
      state.model.messages.length +
      (state.model.messages.length === 1 ? ' message' : ' messages');

    els.loading.hidden = true;
    els.errorPanel.hidden = true;
    els.viewer.hidden = false;
    els.endNote.hidden = false;
    document.body.classList.add('is-ready');
    enableOutputButtons();

    requestAnimationFrame(function () {
      if (typeof IntersectionObserver !== 'function') {
        for (const page of state.pageStates.keys()) {
          const pageState = state.pageStates.get(page);
          pageState.visible = true;
          enqueuePage(page);
        }
        return;
      }

      state.observer = new IntersectionObserver(function (entries) {
        for (const entry of entries) {
          const page = entry.target;
          const pageState = state.pageStates.get(page);
          if (!pageState) continue;
          pageState.visible = entry.isIntersecting;

          if (entry.isIntersecting) {
            enqueuePage(page);
          } else if (pageState.rendered) {
            clearPage(page);
          }
        }
      }, { rootMargin: '900px 0px' });

      for (const page of state.pageStates.keys()) {
        state.observer.observe(page);
      }
    });
  }

  async function init() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');

    if (!id || !/^[A-Za-z0-9_-]{8,100}$/.test(id)) {
      showError('This export link is invalid', 'Go back to Gemini and start a new export.', [
        { label: 'Open Gemini', primary: true, onClick: openGemini }
      ]);
      return;
    }

    state.id = id;
    setProgress(8, 'Reading the selected conversation…');

    let stored;
    try {
      stored = await storageGet(EXPORT_PREFIX + id);
    } catch (error) {
      showError('The export could not be read', 'Chrome storage was unavailable. Please try again.', [
        { label: 'Try again', primary: true, onClick: function () { location.reload(); } }
      ]);
      return;
    }

    const entry = stored[EXPORT_PREFIX + id];
    if (!entry || !isValidModel(entry.model)) {
      showError(
        'This export is no longer available',
        'Exports are kept temporarily in this browser. Go back to Gemini and create a new PDF.',
        [
          { label: 'Open Gemini', primary: true, onClick: openGemini },
          { label: 'Try again', onClick: function () { location.reload(); } }
        ]
      );
      return;
    }

    state.model = entry.model;
    applyModelToPage(state.model);

    try {
      setProgress(24, 'Formatting the conversation…');
      await nextPaint();

      const definition = globalThis.GeminiPdfBuilder.buildDocDefinition(state.model);
      setProgress(42, 'Laying out pages…');
      await nextPaint();

      state.pdfBlob = await globalThis.GeminiPdfBuilder.createPdfBlob(definition);
      setProgress(68, 'Rendering the PDF preview…');
      await nextPaint();

      if (!globalThis.pdfjsLib) throw new Error('The PDF preview library did not load.');

      globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc =
        chrome.runtime.getURL('vendor/pdf.worker.min.js');

      const bytes = new Uint8Array(await state.pdfBlob.arrayBuffer());
      state.pdfDoc = await globalThis.pdfjsLib.getDocument({
        data: bytes,
        isEvalSupported: false
      }).promise;

      setProgress(94, 'Almost ready…');
      await nextPaint();
      await showDocument();
      setProgress(100, 'Ready');
    } catch (error) {
      console.error('[Gemini Chat to PDF] Could not build preview:', error);
      enableOutputButtons();

      if (state.pdfBlob) {
        els.docMeta.textContent = state.model.messages.length +
          (state.model.messages.length === 1 ? ' message' : ' messages') +
          ' · PDF ready';
        showError(
          'The preview could not be displayed',
          'Your PDF was generated successfully, so you can still save or print it.',
          [
            { label: 'Save PDF', primary: true, onClick: savePdf },
            { label: 'Print instead', onClick: openPrintPage }
          ]
        );
      } else {
        showError(
          'The PDF could not be created',
          'Try exporting again with fewer messages. If the problem continues, use Print instead for a browser-made PDF.',
          [
            { label: 'Print instead', primary: true, onClick: openPrintPage },
            { label: 'Open Gemini', onClick: openGemini }
          ]
        );
      }
    }
  }

  els.saveButton.addEventListener('click', savePdf);
  els.printButton.addEventListener('click', openPrintPage);

  window.addEventListener('pagehide', function () {
    if (state.observer) state.observer.disconnect();
    if (state.pdfDoc && typeof state.pdfDoc.destroy === 'function') {
      state.pdfDoc.destroy();
      state.pdfDoc = null;
    }
  });

  init().catch(function (error) {
    console.error('[Gemini Chat to PDF] Preview failed:', error);
    showError('Something went wrong', 'Close this tab and start a new export.', [
      { label: 'Open Gemini', primary: true, onClick: openGemini }
    ]);
  });
})();

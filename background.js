const STORAGE_KEYS = {
  ITEMS: 'reelsLibrary.items',
  SETTINGS: 'reelsLibrary.settings'
};

async function getItems() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.ITEMS);
  return data[STORAGE_KEYS.ITEMS] || [];
}

async function setItems(items) {
  await chrome.storage.local.set({ [STORAGE_KEYS.ITEMS]: items });
}

function asDataUrl(content, mime = 'application/json') {
  return `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
}

function toCsv(items) {
  const headers = [
    'capturedAt', 'type', 'status', 'project', 'title', 'description', 'url', 'canonical', 'thumbnail', 'notes', 'authorizedByUser'
  ];
  const escape = (value) => {
    const str = String(value ?? '');
    return `"${str.replaceAll('"', '""')}"`;
  };
  return [headers.join(','), ...items.map((item) => headers.map((h) => escape(item[h])).join(','))].join('\n');
}

function isAllowedDownloadUrl(url) {
  return /^https?:\/\//i.test(url || '') || /^data:/i.test(url || '');
}

function safeFilename(filename) {
  const fallback = `instagram/media-${Date.now()}.bin`;
  const raw = String(filename || fallback)
    .replace(/[\\:*?"<>|]/g, '-')
    .replace(/\/+/g, '/');
  return raw.includes('.') ? raw : `${raw}.bin`;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === 'GET_ITEMS') {
        sendResponse({ ok: true, items: await getItems() });
        return;
      }

      if (message?.type === 'SAVE_ITEM') {
        const items = await getItems();
        const incoming = message.item;
        const id = incoming.id || crypto.randomUUID();
        const normalized = { ...incoming, id, updatedAt: new Date().toISOString() };
        const existingIndex = items.findIndex((item) => item.id === id || item.canonical === incoming.canonical || item.url === incoming.url);

        if (existingIndex >= 0) items[existingIndex] = { ...items[existingIndex], ...normalized };
        else items.unshift(normalized);

        await setItems(items.slice(0, 500));
        sendResponse({ ok: true, item: normalized, total: items.length });
        return;
      }

      if (message?.type === 'DELETE_ITEM') {
        const items = await getItems();
        await setItems(items.filter((item) => item.id !== message.id));
        sendResponse({ ok: true });
        return;
      }

      if (message?.type === 'DOWNLOAD_MEDIA') {
        const media = message.media || {};
        if (!media.url || !isAllowedDownloadUrl(media.url)) {
          sendResponse({ ok: false, error: 'URL de mídia inválida ou não baixável.' });
          return;
        }
        const downloadId = await chrome.downloads.download({
          url: media.url,
          filename: safeFilename(message.filename),
          saveAs: true,
          conflictAction: 'uniquify'
        });
        sendResponse({ ok: true, downloadId });
        return;
      }

      if (message?.type === 'EXPORT_JSON') {
        const items = await getItems();
        await chrome.downloads.download({
          url: asDataUrl(JSON.stringify(items, null, 2), 'application/json'),
          filename: `reels-library-${new Date().toISOString().slice(0, 10)}.json`,
          saveAs: true
        });
        sendResponse({ ok: true });
        return;
      }

      if (message?.type === 'EXPORT_CSV') {
        const items = await getItems();
        await chrome.downloads.download({
          url: asDataUrl(toCsv(items), 'text/csv'),
          filename: `reels-library-${new Date().toISOString().slice(0, 10)}.csv`,
          saveAs: true
        });
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: 'Ação não reconhecida.' });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || 'Erro inesperado.' });
    }
  })();
  return true;
});

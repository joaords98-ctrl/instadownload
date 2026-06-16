let currentData = null;
let currentMedia = [];
let bestMedia = null;

const SETTINGS_KEY = 'reelsLibrary.settings';

const $ = (id) => document.getElementById(id);

function setStatus(text, isError = false) {
  const desc = $('desc');
  desc.textContent = text;
  desc.className = isError ? 'err' : '';
}

function setMediaStatus(text, isError = false) {
  const el = $('mediaStatus');
  el.textContent = text;
  el.className = isError ? 'err' : '';
}

function truncate(text, size = 110) {
  if (!text) return '';
  return text.length > size ? `${text.slice(0, size - 1)}…` : text;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToContent(type) {
  const tab = await getActiveTab();
  if (!tab?.url?.includes('instagram.com')) {
    throw new Error('Abra um post, Reel ou foto do Instagram primeiro.');
  }

  return chrome.tabs.sendMessage(tab.id, { type }).catch(async () => {
    await chrome.scripting?.executeScript?.({ target: { tabId: tab.id }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tab.id, { type });
  });
}

async function capturePage() {
  try {
    const response = await sendToContent('GET_INSTAGRAM_PAGE_DATA');

    if (!response?.ok) {
      setStatus(response?.error || 'Não foi possível capturar a página.', true);
      return;
    }

    currentData = response.data;
    currentMedia = currentData.mediaCandidates || [];
    bestMedia = currentData.bestMedia || null;
    renderCurrent(currentData);
    renderMedia(currentMedia, bestMedia);
  } catch (error) {
    setStatus(error?.message || 'Erro ao capturar página.', true);
  }
}

function renderCurrent(data) {
  $('pageType').textContent = data.type || 'post';
  $('title').textContent = data.title || 'Instagram';
  $('desc').textContent = data.description || data.canonical || data.url;

  const thumbBox = $('thumbBox');
  thumbBox.innerHTML = '';
  if (data.thumbnail) {
    const img = document.createElement('img');
    img.src = data.thumbnail;
    img.alt = 'Capa do conteúdo';
    thumbBox.appendChild(img);
  } else {
    thumbBox.innerHTML = '<span>Sem capa</span>';
  }
}

async function detectMedia() {
  try {
    const response = await sendToContent('GET_MEDIA_CANDIDATES');
    if (!response?.ok) {
      setMediaStatus(response?.error || 'Não foi possível detectar mídia.', true);
      return;
    }
    currentMedia = response.data?.candidates || [];
    bestMedia = response.data?.best || null;
    renderMedia(currentMedia, bestMedia);
  } catch (error) {
    setMediaStatus(error?.message || 'Erro ao detectar mídia.', true);
  }
}

function mediaHumanType(media) {
  if (media.type === 'video') return 'vídeo';
  if (media.type === 'image') return 'foto';
  return 'mídia';
}

function qualityLabel(media) {
  const dim = media.width && media.height ? `${media.width}x${media.height}` : 'qualidade original exposta';
  return `${mediaHumanType(media)} · ${dim} · ${media.source || 'página'}`;
}

function renderMedia(list, best) {
  const mediaList = $('mediaList');
  mediaList.innerHTML = '';
  $('mediaCount').textContent = String(list?.length || 0);

  if (!list?.length) {
    setMediaStatus('Nenhuma mídia detectada ainda. Clique em detectar ou recarregue o post/Reel.', true);
    return;
  }

  const downloadable = list.filter((item) => item.downloadable);
  if (downloadable.length) {
    const bestText = best ? ` Melhor opção: ${mediaHumanType(best)}.` : '';
    setMediaStatus(`${downloadable.length} arquivo(s) baixável(is) detectado(s).${bestText}`);
  } else {
    setMediaStatus('A página detectou mídia, mas não expôs um link direto baixável. Em Reels isso pode ocorrer por stream/blob.', true);
  }

  list.slice(0, 8).forEach((media) => {
    const row = document.createElement('div');
    row.className = 'media-row';
    const reason = media.reason ? ` · ${media.reason}` : '';
    row.innerHTML = `
      <div>
        <p class="media-title">${escapeHtml(media.label || 'Mídia')}</p>
        <p class="media-meta">${escapeHtml(qualityLabel(media) + reason)}</p>
      </div>
      <button ${media.downloadable ? '' : 'disabled'} data-media-id="${escapeAttr(media.id)}">Baixar</button>
    `;
    mediaList.appendChild(row);
  });

  mediaList.querySelectorAll('[data-media-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const media = currentMedia.find((item) => item.id === btn.dataset.mediaId);
      await downloadMedia(media);
    });
  });
}

function ensureAuthorized() {
  if (!$('authorized').checked) {
    setMediaStatus('Marque a autorização antes de baixar/reutilizar o conteúdo.', true);
    return false;
  }
  return true;
}

function extensionFromMedia(media) {
  if (media?.type === 'video') return 'mp4';
  if (media?.type === 'image') return 'jpg';
  return 'bin';
}

function slugify(text) {
  return String(text || 'instagram-media')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 55)
    .toLowerCase() || 'instagram-media';
}

async function downloadMedia(media) {
  if (!ensureAuthorized()) return;
  if (!media?.downloadable || !media?.url) {
    setMediaStatus(media?.reason || 'Essa mídia não possui link direto baixável.', true);
    return;
  }

  const title = currentData?.title || currentData?.profile || 'instagram';
  const filename = `instagram/${slugify(title)}-${Date.now()}.${extensionFromMedia(media)}`;
  const response = await chrome.runtime.sendMessage({ type: 'DOWNLOAD_MEDIA', media, filename });
  if (!response?.ok) {
    setMediaStatus(response?.error || 'Erro ao iniciar download.', true);
    return;
  }
  setMediaStatus(`Download iniciado: ${mediaHumanType(media)} em melhor qualidade disponível.`);
}

async function downloadBest() {
  if (!bestMedia || !bestMedia.downloadable) await detectMedia();
  if (!bestMedia || !bestMedia.downloadable) {
    setMediaStatus('Não achei link direto para baixar. Em alguns Reels o Instagram entrega como stream/blob.', true);
    return;
  }
  await downloadMedia(bestMedia);
}

async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return data[SETTINGS_KEY] || { backendUrl: 'http://localhost:3000' };
}

function normalizeBackendUrl(url) {
  return String(url || 'http://localhost:3000').trim().replace(/\/$/, '') || 'http://localhost:3000';
}

async function downloadViaOfficialApi() {
  if (!ensureAuthorized()) return;
  if (!currentData) await capturePage();
  if (!currentData?.canonical && !currentData?.url) {
    setMediaStatus('Abra um post/Reel do Instagram e capture a página primeiro.', true);
    return;
  }

  const settings = await getSettings();
  const backendUrl = normalizeBackendUrl(settings.backendUrl);
  const permalink = currentData.canonical || currentData.url;

  try {
    setMediaStatus('Consultando backend/API oficial. Se a conta for dona/autorizada, o download sai sem recompressão.');
    const endpoint = `${backendUrl}/api/instagram/resolve?permalink=${encodeURIComponent(permalink)}`;
    const res = await fetch(endpoint);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      setMediaStatus(data.error || 'Backend não conseguiu resolver essa mídia pela API oficial.', true);
      return;
    }

    const files = Array.isArray(data.files) ? data.files : [];
    if (!files.length) {
      setMediaStatus('A API encontrou o post, mas não retornou arquivo baixável. Pode ser conteúdo com restrição/copyright ou não pertencente à conta conectada.', true);
      return;
    }

    for (const file of files) {
      const response = await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_MEDIA',
        media: { url: file.downloadUrl, type: file.type || 'media' },
        filename: file.filename || `instagram/${Date.now()}.${file.extension || 'bin'}`
      });
      if (!response?.ok) {
        setMediaStatus(response?.error || 'Erro ao iniciar um dos downloads.', true);
        return;
      }
    }

    setMediaStatus(`${files.length} arquivo(s) baixado(s) via API oficial, sem recompressão.`);
  } catch (error) {
    setMediaStatus(`Não consegui falar com o backend (${backendUrl}). Abra a pasta backend e rode npm start.`, true);
  }
}

async function saveCurrent() {
  if (!currentData) await capturePage();
  if (!currentData) return;

  const authorized = $('authorized').checked;
  const item = {
    ...currentData,
    mediaCandidates: currentMedia,
    bestMedia,
    project: $('project').value.trim(),
    status: $('status').value,
    notes: $('notes').value.trim(),
    authorizedByUser: authorized,
    savedAt: new Date().toISOString()
  };

  const response = await chrome.runtime.sendMessage({ type: 'SAVE_ITEM', item });
  if (!response?.ok) {
    setStatus(response?.error || 'Erro ao salvar.', true);
    return;
  }

  setStatus('Salvo na biblioteca local. Exporta depois que o caos vira planilha.');
  await loadItems();
}

async function loadItems() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_ITEMS' });
  const items = response?.items || [];
  const container = $('items');
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = '<div class="empty">Nenhum conteúdo salvo ainda.</div>';
    return;
  }

  for (const item of items.slice(0, 10)) {
    const el = document.createElement('article');
    el.className = 'item';
    el.innerHTML = `
      <div class="item-top">
        <div>
          <p class="item-title">${escapeHtml(truncate(item.title || item.url, 80))}</p>
          <p class="item-meta">${escapeHtml(item.project || 'Sem projeto')} · ${escapeHtml(item.status || 'referencia')} · ${item.authorizedByUser ? 'autorizado' : 'sem autorização marcada'}</p>
        </div>
      </div>
      <div class="item-actions">
        <button data-open="${escapeAttr(item.url)}">Abrir</button>
        <button data-copy="${escapeAttr(item.url)}">Copiar</button>
        <button class="danger" data-delete="${escapeAttr(item.id)}">Excluir</button>
      </div>
    `;
    container.appendChild(el);
  }

  container.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => chrome.tabs.create({ url: btn.dataset.open }));
  });
  container.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(btn.dataset.copy);
      setStatus('Link copiado.');
    });
  });
  container.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'DELETE_ITEM', id: btn.dataset.delete });
      await loadItems();
    });
  });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll('`', '&#096;');
}

$('captureBtn').addEventListener('click', capturePage);
$('detectMediaBtn').addEventListener('click', detectMedia);
$('downloadBestBtn').addEventListener('click', downloadBest);
$('apiDownloadBtn').addEventListener('click', downloadViaOfficialApi);
$('saveBtn').addEventListener('click', saveCurrent);
$('copyBtn').addEventListener('click', async () => {
  if (!currentData) await capturePage();
  if (currentData?.url) {
    await navigator.clipboard.writeText(currentData.url);
    setStatus('Link copiado.');
  }
});
$('exportCsvBtn').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'EXPORT_CSV' }));
$('exportJsonBtn').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'EXPORT_JSON' }));
$('optionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());

document.addEventListener('DOMContentLoaded', async () => {
  await loadItems();
  capturePage().catch(() => {});
});

function textContent(selector) {
  const el = document.querySelector(selector);
  return el ? el.textContent.trim() : '';
}

function metaContent(selector) {
  const el = document.querySelector(selector);
  return el ? (el.getAttribute('content') || '').trim() : '';
}

function inferType(url) {
  try {
    const u = new URL(url);
    if (u.pathname.includes('/reel/')) return 'reel';
    if (u.pathname.includes('/p/')) return 'post';
    if (u.pathname.includes('/tv/')) return 'video';
    return 'pagina';
  } catch (_) {
    return 'pagina';
  }
}

function cleanDescription(raw) {
  if (!raw) return '';
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^.*?on Instagram:\s*/i, '')
    .trim()
    .slice(0, 1200);
}

function extractVisibleCaption() {
  const candidates = [
    'article h1',
    'article div[role="button"] span',
    'article span',
    'main article span'
  ];

  const all = [];
  for (const selector of candidates) {
    document.querySelectorAll(selector).forEach((el) => {
      const text = (el.textContent || '').trim();
      if (text.length > 20 && text.length < 1500) all.push(text);
    });
  }
  return all.sort((a, b) => b.length - a.length)[0] || '';
}

function normalizeUrl(url) {
  if (!url) return '';
  return String(url).replaceAll('&amp;', '&').trim();
}

function isHttpUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

function pickLargestFromSrcset(srcset) {
  if (!srcset) return '';
  const candidates = srcset
    .split(',')
    .map((part) => {
      const pieces = part.trim().split(/\s+/);
      const url = normalizeUrl(pieces[0]);
      const sizeRaw = pieces[1] || '';
      const width = Number((sizeRaw.match(/(\d+)w/) || [])[1] || 0);
      const density = Number((sizeRaw.match(/([\d.]+)x/) || [])[1] || 0);
      return { url, score: width || density * 1000 || 1 };
    })
    .filter((item) => isHttpUrl(item.url));

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url || '';
}

function addCandidate(map, candidate) {
  const url = normalizeUrl(candidate?.url || '');
  const key = url || `${candidate.type}:${candidate.source}:${candidate.label}`;
  if (!key || map.has(key)) return;
  map.set(key, {
    id: `m_${map.size + 1}`,
    type: candidate.type || 'media',
    url,
    label: candidate.label || 'Mídia detectada',
    source: candidate.source || 'page',
    width: candidate.width || 0,
    height: candidate.height || 0,
    downloadable: Boolean(url && isHttpUrl(url)),
    reason: candidate.reason || ''
  });
}

function getMediaCandidates() {
  const media = new Map();

  const ogVideo = metaContent('meta[property="og:video"]') ||
    metaContent('meta[property="og:video:secure_url"]') ||
    metaContent('meta[name="twitter:player:stream"]');

  if (ogVideo) {
    addCandidate(media, {
      type: 'video',
      url: ogVideo,
      label: 'Vídeo principal detectado',
      source: 'meta og:video'
    });
  }

  const ogImage = metaContent('meta[property="og:image"]') || metaContent('meta[name="twitter:image"]');
  if (ogImage) {
    addCandidate(media, {
      type: 'image',
      url: ogImage,
      label: 'Imagem/capa principal',
      source: 'meta og:image'
    });
  }

  document.querySelectorAll('article video, main video, video').forEach((video, index) => {
    const src = normalizeUrl(video.currentSrc || video.src || video.getAttribute('src') || '');
    if (isHttpUrl(src)) {
      addCandidate(media, {
        type: 'video',
        url: src,
        label: `Vídeo ${index + 1}`,
        source: 'video element',
        width: video.videoWidth || 0,
        height: video.videoHeight || 0
      });
    } else if (src.startsWith('blob:') || video.querySelector('source')?.src?.startsWith('blob:')) {
      addCandidate(media, {
        type: 'video',
        url: '',
        label: `Vídeo ${index + 1}`,
        source: 'blob/stream',
        downloadable: false,
        reason: 'O vídeo está em stream/blob. A extensão não baixa stream protegido nem burla a página.'
      });
    }
  });

  const imageNodes = Array.from(document.querySelectorAll('article img, main img'));
  const images = imageNodes.map((img, index) => {
    const fromSrcset = pickLargestFromSrcset(img.getAttribute('srcset') || '');
    const url = fromSrcset || normalizeUrl(img.currentSrc || img.src || img.getAttribute('src') || '');
    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    const alt = (img.getAttribute('alt') || '').trim();
    const score = width * height;
    return { img, index, url, width, height, alt, score };
  }).filter((item) => {
    if (!isHttpUrl(item.url)) return false;
    // Evita avatar, ícones e miniaturas muito pequenas.
    if (item.width && item.height && (item.width < 250 || item.height < 250)) return false;
    if (/profile picture|foto do perfil|avatar/i.test(item.alt)) return false;
    return true;
  }).sort((a, b) => b.score - a.score);

  images.slice(0, 10).forEach((item, i) => {
    addCandidate(media, {
      type: 'image',
      url: item.url,
      label: i === 0 ? 'Foto em melhor resolução detectada' : `Foto ${i + 1}`,
      source: item.url.includes('scontent') || item.url.includes('cdninstagram') ? 'img srcset/cdn' : 'img element',
      width: item.width,
      height: item.height
    });
  });

  const candidates = Array.from(media.values());
  const bestVideo = candidates.find((item) => item.type === 'video' && item.downloadable);
  const bestImage = candidates.find((item) => item.type === 'image' && item.downloadable);

  return {
    candidates,
    best: bestVideo || bestImage || candidates[0] || null,
    foundDownloadable: candidates.some((item) => item.downloadable)
  };
}

function getPageData() {
  const url = location.href;
  const title = metaContent('meta[property="og:title"]') || document.title || 'Instagram';
  const description = cleanDescription(
    metaContent('meta[property="og:description"]') ||
    metaContent('meta[name="description"]') ||
    extractVisibleCaption()
  );
  const thumbnail = metaContent('meta[property="og:image"]') || '';
  const canonical = document.querySelector('link[rel="canonical"]')?.href || url;
  const profile = textContent('header h2') || '';
  const hasVideoElement = Boolean(document.querySelector('video'));
  const mediaResult = getMediaCandidates();

  return {
    url,
    canonical,
    title,
    description,
    thumbnail,
    profile,
    type: inferType(url),
    hasVideoElement,
    mediaCandidates: mediaResult.candidates,
    bestMedia: mediaResult.best,
    capturedAt: new Date().toISOString(),
    source: 'instagram'
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_INSTAGRAM_PAGE_DATA') {
    try {
      sendResponse({ ok: true, data: getPageData() });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || 'Erro ao capturar página.' });
    }
  }

  if (message?.type === 'GET_MEDIA_CANDIDATES') {
    try {
      sendResponse({ ok: true, data: getMediaCandidates() });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || 'Erro ao detectar mídia.' });
    }
  }

  return true;
});

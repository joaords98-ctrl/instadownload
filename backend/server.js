/*
  IG Media Backend - modo oficial/autorizado
  Baixa mídia própria/autorizada via Instagram/Meta Graph API sem recompressão.

  Requisitos:
  - Node 18+
  - Conta Instagram profissional/criador conectada e autorizada
  - IG_USER_ID e IG_ACCESS_TOKEN no ambiente
*/

const http = require('http');
const { URL } = require('url');
const { Readable } = require('stream');

const PORT = Number(process.env.PORT || 3000);
const GRAPH_VERSION = process.env.GRAPH_VERSION || 'v21.0';
const IG_USER_ID = process.env.IG_USER_ID || '';
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || '';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function requireConfig() {
  if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
    throw new Error('Backend sem IG_USER_ID ou IG_ACCESS_TOKEN. Configure o arquivo .env ou as variáveis de ambiente.');
  }
}

function normalizePermalink(value) {
  try {
    const u = new URL(String(value || '').trim());
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch (_) {
    return String(value || '').trim().replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/$/, '');
  }
}

function shortcodeFromPermalink(value) {
  const text = String(value || '');
  const match = text.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/i);
  return match ? match[1] : '';
}

function slugify(text) {
  return String(text || 'instagram-media')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase() || 'instagram-media';
}

function extensionFor(file) {
  if (file.media_type === 'VIDEO') return 'mp4';
  if (file.media_type === 'IMAGE') return 'jpg';
  return 'bin';
}

function absoluteDownloadUrl(req, mediaId, index) {
  const host = req.headers.host || `localhost:${PORT}`;
  const proto = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'http';
  return `${proto}://${host}/api/instagram/download?media_id=${encodeURIComponent(mediaId)}&index=${encodeURIComponent(index)}`;
}

async function graphGet(pathOrUrl, params = {}) {
  requireConfig();
  const url = pathOrUrl.startsWith('http') ? new URL(pathOrUrl) : new URL(`${GRAPH_BASE}${pathOrUrl}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  url.searchParams.set('access_token', IG_ACCESS_TOKEN);

  const response = await fetch(url);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = json?.error?.message || `Erro Graph API ${response.status}`;
    throw new Error(msg);
  }
  return json;
}

async function findMediaByPermalink(permalink) {
  const target = normalizePermalink(permalink);
  const targetShortcode = shortcodeFromPermalink(permalink);
  let url = `${GRAPH_BASE}/${IG_USER_ID}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url,permalink}&limit=100`;
  let page = 0;

  while (url && page < 15) {
    page += 1;
    const json = await graphGet(url);
    const data = Array.isArray(json.data) ? json.data : [];

    for (const item of data) {
      const current = normalizePermalink(item.permalink || '');
      const currentShortcode = shortcodeFromPermalink(item.permalink || '');
      if ((target && current && current === target) || (targetShortcode && currentShortcode === targetShortcode)) {
        return item;
      }
    }

    url = json?.paging?.next || '';
  }

  return null;
}

async function getMediaById(mediaId) {
  return graphGet(`/${encodeURIComponent(mediaId)}`, {
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url,permalink}'
  });
}

async function getChildren(mediaId) {
  const json = await graphGet(`/${encodeURIComponent(mediaId)}/children`, {
    fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp',
    limit: '50'
  });
  return Array.isArray(json.data) ? json.data : [];
}

async function filesFromMedia(media, req) {
  let rawFiles = [];

  if (media.media_type === 'CAROUSEL_ALBUM') {
    rawFiles = media?.children?.data || [];
    if (!rawFiles.length) rawFiles = await getChildren(media.id);
  } else {
    rawFiles = [media];
  }

  const baseName = slugify(media.caption || media.permalink || media.id);
  return rawFiles.map((item, index) => {
    const mediaUrl = item.media_url || '';
    const ext = extensionFor(item);
    return {
      index,
      media_id: media.id,
      child_id: item.id || null,
      type: item.media_type === 'VIDEO' ? 'video' : item.media_type === 'IMAGE' ? 'image' : 'media',
      media_type: item.media_type,
      has_media_url: Boolean(mediaUrl),
      thumbnail_url: item.thumbnail_url || '',
      filename: `instagram/${baseName}-${index + 1}.${ext}`,
      extension: ext,
      downloadUrl: absoluteDownloadUrl(req, media.id, index)
    };
  }).filter((file) => file.has_media_url);
}

async function resolveHandler(req, res, parsedUrl) {
  const permalink = parsedUrl.searchParams.get('permalink') || '';
  if (!permalink) return sendJson(res, 400, { ok: false, error: 'Informe permalink.' });

  const media = await findMediaByPermalink(permalink);
  if (!media) {
    return sendJson(res, 404, {
      ok: false,
      error: 'Não encontrei esse post/Reel entre as mídias da conta autorizada. Para baixar vídeo sem perder qualidade, a conta conectada precisa ser dona ou ter autorização válida via API.'
    });
  }

  const files = await filesFromMedia(media, req);
  if (!files.length) {
    return sendJson(res, 422, {
      ok: false,
      error: 'A API encontrou a mídia, mas não retornou media_url baixável. Isso pode acontecer com conteúdo restrito, com copyright/áudio protegido ou permissão insuficiente.'
    });
  }

  return sendJson(res, 200, { ok: true, media: { id: media.id, type: media.media_type, permalink: media.permalink }, files });
}

async function downloadHandler(req, res, parsedUrl) {
  const mediaId = parsedUrl.searchParams.get('media_id') || '';
  const index = Number(parsedUrl.searchParams.get('index') || 0);
  if (!mediaId) return sendJson(res, 400, { ok: false, error: 'Informe media_id.' });

  const media = await getMediaById(mediaId);
  let rawFiles = media.media_type === 'CAROUSEL_ALBUM' ? (media?.children?.data || []) : [media];
  if (media.media_type === 'CAROUSEL_ALBUM' && !rawFiles.length) rawFiles = await getChildren(media.id);

  const file = rawFiles[index];
  if (!file?.media_url) {
    return sendJson(res, 404, { ok: false, error: 'Arquivo não disponível para download pela API oficial.' });
  }

  const ext = extensionFor(file);
  const filename = `${slugify(media.caption || media.permalink || media.id)}-${index + 1}.${ext}`;
  const upstream = await fetch(file.media_url);

  if (!upstream.ok || !upstream.body) {
    return sendJson(res, upstream.status || 502, { ok: false, error: 'Falha ao baixar arquivo da URL oficial.' });
  }

  res.writeHead(200, {
    'Content-Type': upstream.headers.get('content-type') || (ext === 'mp4' ? 'video/mp4' : 'image/jpeg'),
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });

  Readable.fromWeb(upstream.body).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    if (parsedUrl.pathname === '/health') {
      return sendJson(res, 200, { ok: true, configured: Boolean(IG_USER_ID && IG_ACCESS_TOKEN), graphVersion: GRAPH_VERSION });
    }

    if (parsedUrl.pathname === '/api/instagram/resolve') return await resolveHandler(req, res, parsedUrl);
    if (parsedUrl.pathname === '/api/instagram/download') return await downloadHandler(req, res, parsedUrl);

    return sendJson(res, 404, { ok: false, error: 'Rota não encontrada.' });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
});

server.listen(PORT, () => {
  console.log(`IG Media Backend rodando em http://localhost:${PORT}`);
  console.log(`Configurado: ${IG_USER_ID && IG_ACCESS_TOKEN ? 'sim' : 'não - preencha IG_USER_ID e IG_ACCESS_TOKEN'}`);
});

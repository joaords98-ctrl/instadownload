function normalizeUrl(value) {
  try {
    const u = new URL(String(value || "").trim());
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch (_) {
    return String(value || "").trim();
  }
}

function getMeta(prop) {
  return document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.content || "";
}

function parseSrcset(srcset) {
  return String(srcset || "")
    .split(",")
    .map((part) => {
      const [url, descriptor] = part.trim().split(/\s+/);
      const width = descriptor?.endsWith("w") ? Number(descriptor.replace("w", "")) : 0;
      return { url, width };
    })
    .filter((x) => x.url)
    .sort((a, b) => b.width - a.width);
}

function guessFilename(url, fallback) {
  try {
    const u = new URL(url);
    const name = u.pathname.split("/").filter(Boolean).pop() || fallback;
    return `instagram/${name.split("?")[0] || fallback}`;
  } catch (_) {
    return `instagram/${fallback}`;
  }
}

function addUnique(files, file) {
  if (!file?.url) return;
  if (files.some((x) => x.url === file.url)) return;
  files.push(file);
}

function collectInstagramMedia() {
  const permalink = normalizeUrl(location.href);
  const title = document.title.replace(/\s*•\s*Instagram\s*$/i, "").trim();
  const caption = getMeta("og:description") || "";
  const thumbnail = getMeta("og:image") || "";
  const files = [];

  if (thumbnail) {
    addUnique(files, {
      label: "Imagem/capa principal",
      kind: "image",
      type: "image",
      url: thumbnail,
      filename: guessFilename(thumbnail, "capa-instagram.jpg")
    });
  }

  const ogVideo = getMeta("og:video") || getMeta("og:video:secure_url") || getMeta("twitter:player:stream");
  if (ogVideo) {
    addUnique(files, {
      label: "Vídeo exposto pela página",
      kind: "video",
      type: "video",
      url: ogVideo,
      filename: guessFilename(ogVideo, "video-instagram.mp4")
    });
  }

  document.querySelectorAll("video").forEach((video, index) => {
    const src = video.currentSrc || video.src || video.querySelector("source")?.src || "";
    if (!src) return;
    addUnique(files, {
      label: `Vídeo ${index + 1}`,
      kind: "video",
      type: "video",
      url: src,
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
      filename: guessFilename(src, `video-${index + 1}.mp4`),
      note: src.startsWith("blob:") ? "stream/blob" : "url direta"
    });
  });

  const images = [...document.querySelectorAll("img")]
    .map((img, index) => {
      const srcsetBest = parseSrcset(img.getAttribute("srcset"))[0]?.url || "";
      const src = srcsetBest || img.currentSrc || img.src || "";
      return {
        label: index === 0 ? "Foto em melhor resolução detectada" : `Foto ${index + 1}`,
        kind: "image",
        type: "image",
        url: src,
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
        filename: guessFilename(src, `foto-${index + 1}.jpg`)
      };
    })
    .filter((x) => x.url && !x.url.startsWith("data:"))
    .filter((x) => (x.width || 0) >= 250 || (x.height || 0) >= 250)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));

  images.slice(0, 8).forEach((img) => addUnique(files, img));

  const type = permalink.includes("/reel/") ? "reel" : permalink.includes("/p/") ? "post" : "instagram";

  return {
    permalink,
    title: title || "Instagram",
    caption,
    thumbnail,
    type,
    files,
    capturedAt: new Date().toISOString()
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "collect") {
    sendResponse({ ok: true, payload: collectInstagramMedia() });
  }
});

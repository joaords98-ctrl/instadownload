const STORAGE_KEY = "instadownload_pessoal_library_v1";
const $ = (id) => document.getElementById(id);

const state = {
  items: loadItems(),
  query: "",
  status: "all"
};

function uid() {
  return `ig_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

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

function shortcodeFromUrl(value) {
  const match = String(value || "").match(/instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/i);
  return match ? match[1] : "";
}

function titleFromItem(item) {
  if (item.title) return item.title;
  const sc = shortcodeFromUrl(item.permalink);
  if (sc) return `Instagram ${sc}`;
  return "Referência Instagram";
}

function addOrMergeItem(raw) {
  const permalink = normalizeUrl(raw.permalink || raw.url || "");
  if (!permalink) return null;

  const existing = state.items.find((item) => normalizeUrl(item.permalink) === permalink);
  const files = Array.isArray(raw.files) ? raw.files : [];

  if (existing) {
    existing.title = raw.title || existing.title;
    existing.caption = raw.caption || existing.caption;
    existing.thumbnail = raw.thumbnail || existing.thumbnail;
    existing.type = raw.type || existing.type;
    existing.files = mergeFiles(existing.files || [], files);
    existing.updatedAt = new Date().toISOString();
    saveItems();
    return existing;
  }

  const item = {
    id: uid(),
    permalink,
    title: raw.title || "",
    caption: raw.caption || "",
    thumbnail: raw.thumbnail || "",
    type: raw.type || "referencia",
    project: raw.project || "",
    status: raw.status || "referencia",
    notes: raw.notes || "",
    files,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.items.unshift(item);
  saveItems();
  return item;
}

function mergeFiles(current, next) {
  const map = new Map();
  [...current, ...next].forEach((file) => {
    const key = file.url || file.src || file.downloadUrl || JSON.stringify(file);
    if (key && !map.has(key)) map.set(key, file);
  });
  return [...map.values()];
}

function filteredItems() {
  const q = state.query.toLowerCase().trim();
  return state.items.filter((item) => {
    const matchesStatus = state.status === "all" || item.status === state.status;
    const hay = [item.permalink, item.title, item.caption, item.project, item.notes, item.type]
      .join(" ")
      .toLowerCase();
    return matchesStatus && (!q || hay.includes(q));
  });
}

function render() {
  const library = $("library");
  library.innerHTML = "";
  const items = filteredItems();

  if (!items.length) {
    library.innerHTML = `<div class="empty"><h2>Nenhum item salvo ainda.</h2><p>Cole um link ou use a extensão em uma página do Instagram.</p></div>`;
    return;
  }

  const template = $("itemTemplate");
  items.forEach((item) => {
    const node = template.content.cloneNode(true);
    const article = node.querySelector(".item");
    const preview = node.querySelector(".mediaPreview");
    const title = node.querySelector(".itemTitle");
    const permalink = node.querySelector(".permalink");
    const pill = node.querySelector(".typePill");
    const projectInput = node.querySelector(".projectInput");
    const statusInput = node.querySelector(".statusInput");
    const notesInput = node.querySelector(".notesInput");
    const filesBox = node.querySelector(".detectedFiles");

    article.dataset.id = item.id;
    title.textContent = titleFromItem(item);
    permalink.href = item.permalink;
    permalink.textContent = item.permalink;
    pill.textContent = item.type || "ref";
    projectInput.value = item.project || "";
    statusInput.value = item.status || "referencia";
    notesInput.value = item.notes || item.caption || "";

    renderPreview(preview, item);
    renderFiles(filesBox, item);

    node.querySelector(".saveItemBtn").addEventListener("click", () => {
      item.project = projectInput.value.trim();
      item.status = statusInput.value;
      item.notes = notesInput.value.trim();
      item.updatedAt = new Date().toISOString();
      saveItems();
      toast("Edição salva.");
      render();
    });

    node.querySelector(".copyLinkBtn").addEventListener("click", async () => {
      await navigator.clipboard.writeText(item.permalink);
      toast("Link copiado.");
    });

    node.querySelector(".removeItemBtn").addEventListener("click", () => {
      if (!confirm("Remover este item da biblioteca?")) return;
      state.items = state.items.filter((x) => x.id !== item.id);
      saveItems();
      render();
    });

    library.appendChild(node);
  });
}

function renderPreview(preview, item) {
  const image = item.thumbnail || firstImageUrl(item);
  const video = firstVideoUrl(item);

  if (video && !video.startsWith("blob:")) {
    preview.innerHTML = `<video controls src="${escapeAttr(video)}"></video>`;
    return;
  }

  if (image) {
    preview.innerHTML = `<img src="${escapeAttr(image)}" alt="Prévia" referrerpolicy="no-referrer" />`;
    return;
  }

  preview.innerHTML = `<div class="placeholder">Sem prévia<br><small>Abra no Instagram e use a extensão para detectar mídia exposta.</small></div>`;
}

function renderFiles(filesBox, item) {
  const files = Array.isArray(item.files) ? item.files : [];
  if (!files.length) {
    filesBox.innerHTML = `<div class="fileRow"><div><b>Nenhum arquivo detectado</b><div class="fileMeta">Use a extensão na página do Instagram para capturar fotos/capas expostas.</div></div></div>`;
    return;
  }

  filesBox.innerHTML = "";
  files.forEach((file, index) => {
    const url = file.url || file.src || file.downloadUrl || "";
    const isBlob = url.startsWith("blob:");
    const row = document.createElement("div");
    row.className = "fileRow";
    row.innerHTML = `
      <div>
        <b>${escapeHtml(file.label || file.type || `Arquivo ${index + 1}`)}</b>
        <div class="fileMeta">${escapeHtml(file.kind || file.media_type || "mídia")} ${file.width && file.height ? `• ${file.width}x${file.height}` : ""} ${isBlob ? "• stream/blob" : ""}</div>
      </div>
      <div></div>
    `;

    const actions = row.lastElementChild;
    if (url && !isBlob) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.download = file.filename || `instagram-${index + 1}`;
      a.innerHTML = `<button>Baixar/Abrir</button>`;
      actions.appendChild(a);
    } else {
      const btn = document.createElement("button");
      btn.disabled = true;
      btn.textContent = "Indisponível";
      actions.appendChild(btn);
    }

    filesBox.appendChild(row);
  });
}

function firstImageUrl(item) {
  const file = (item.files || []).find((f) => (f.kind || f.type || "").toLowerCase().includes("image") || (f.url || "").match(/\.(jpg|jpeg|png|webp)(\?|$)/i));
  return file?.url || file?.src || "";
}

function firstVideoUrl(item) {
  const file = (item.files || []).find((f) => (f.kind || f.type || "").toLowerCase().includes("video") || (f.url || "").match(/\.(mp4|mov|webm)(\?|$)/i));
  return file?.url || file?.src || "";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(items) {
  const rows = [["permalink", "title", "type", "project", "status", "notes", "files", "createdAt"]];
  items.forEach((item) => {
    rows.push([
      item.permalink,
      titleFromItem(item),
      item.type || "",
      item.project || "",
      item.status || "",
      item.notes || "",
      (item.files || []).map((f) => f.url || f.src || f.downloadUrl || "").filter(Boolean).join(" | "),
      item.createdAt || ""
    ]);
  });
  return rows.map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function handleImportFromQuery() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("import");
  if (!raw) return;

  try {
    const json = decodeURIComponent(escape(atob(raw)));
    const payload = JSON.parse(json);
    const item = addOrMergeItem(payload);
    if (item) toast("Importado da extensão.");
  } catch (error) {
    console.error(error);
    toast("Não consegui importar os dados da extensão.");
  }
}

function bindEvents() {
  $("saveLinkBtn").addEventListener("click", () => {
    const url = normalizeUrl($("igUrl").value);
    if (!url || !url.includes("instagram.com")) {
      toast("Cole um link válido do Instagram.");
      return;
    }
    addOrMergeItem({ permalink: url, type: url.includes("/reel/") ? "reel" : "post" });
    $("igUrl").value = "";
    render();
    toast("Referência salva.");
  });

  $("copyDashboardUrl").addEventListener("click", async () => {
    const cleanUrl = `${location.origin}${location.pathname}`;
    await navigator.clipboard.writeText(cleanUrl);
    toast("URL do painel copiada.");
  });

  $("clearImportQuery").addEventListener("click", () => {
    history.replaceState({}, "", `${location.origin}${location.pathname}`);
    toast("URL limpa.");
  });

  $("exportJsonBtn").addEventListener("click", () => {
    downloadBlob("instadownload-biblioteca.json", JSON.stringify(state.items, null, 2), "application/json;charset=utf-8");
  });

  $("exportCsvBtn").addEventListener("click", () => {
    downloadBlob("instadownload-biblioteca.csv", toCsv(state.items), "text/csv;charset=utf-8");
  });

  $("clearAllBtn").addEventListener("click", () => {
    if (!confirm("Limpar toda a biblioteca local?")) return;
    state.items = [];
    saveItems();
    render();
  });

  $("searchInput").addEventListener("input", (e) => {
    state.query = e.target.value;
    render();
  });

  $("statusFilter").addEventListener("change", (e) => {
    state.status = e.target.value;
    render();
  });
}

handleImportFromQuery();
bindEvents();
render();

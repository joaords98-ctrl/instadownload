let currentPayload = null;

const filesEl = document.getElementById("files");
const summaryEl = document.getElementById("summary");
const authorizedEl = document.getElementById("authorized");

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
}

function activeTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

function b64Json(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)));
}

function renderPayload(payload) {
  currentPayload = payload;
  const files = payload.files || [];
  summaryEl.innerHTML = `<b>${escapeHtml(payload.title || "Instagram")}</b><br><small>${escapeHtml(payload.permalink || "")}</small><br><small>${files.length} mídia(s) detectada(s).</small>`;
  filesEl.innerHTML = "";

  if (!files.length) {
    filesEl.innerHTML = `<div class="file"><div><b>Nada detectado</b><small>A página não expôs arquivos baixáveis.</small></div></div>`;
    return;
  }

  files.forEach((file, index) => {
    const url = file.url || "";
    const isBlob = url.startsWith("blob:");
    const row = document.createElement("div");
    row.className = "file";
    row.innerHTML = `
      <div>
        <b>${escapeHtml(file.label || `Arquivo ${index + 1}`)}</b>
        <small>${escapeHtml(file.kind || file.type || "mídia")} ${file.width && file.height ? `• ${file.width}x${file.height}` : ""} ${isBlob ? "• blob/stream" : ""}</small>
        ${isBlob ? `<small class="warn">Vídeo em stream/blob: esta versão não contorna a página.</small>` : ""}
      </div>
      <button ${isBlob ? "disabled" : ""}>Baixar</button>
    `;

    row.querySelector("button").addEventListener("click", () => {
      if (!authorizedEl.checked) {
        alert("Marque a autorização antes de baixar/reutilizar.");
        return;
      }
      chrome.runtime.sendMessage({ type: "download", url, filename: file.filename || undefined }, (response) => {
        if (!response?.ok) alert(response?.error || "Falha ao iniciar download.");
      });
    });

    filesEl.appendChild(row);
  });
}

async function detect() {
  const tab = await activeTab();
  if (!tab?.url?.includes("instagram.com")) {
    summaryEl.textContent = "Abra um post/Reel do Instagram antes de detectar.";
    return;
  }

  const response = await sendToTab(tab.id, { type: "collect" });
  if (!response?.ok) {
    summaryEl.textContent = "Não consegui acessar a página. Recarregue o Instagram e tente de novo.";
    return;
  }
  renderPayload(response.payload);
}

async function sendPanel() {
  if (!currentPayload) await detect();
  if (!currentPayload) return;

  chrome.storage.sync.get({ dashboardUrl: "http://localhost:5173" }, (data) => {
    const base = String(data.dashboardUrl || "http://localhost:5173").replace(/\/$/, "");
    const url = `${base}/?import=${encodeURIComponent(b64Json(currentPayload))}`;
    chrome.tabs.create({ url });
  });
}

document.getElementById("detectBtn").addEventListener("click", detect);
document.getElementById("sendBtn").addEventListener("click", sendPanel);
document.getElementById("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());

detect();

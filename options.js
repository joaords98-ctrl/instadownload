const SETTINGS_KEY = 'reelsLibrary.settings';

async function load() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = data[SETTINGS_KEY] || {};
  document.getElementById('backendUrl').value = settings.backendUrl || 'http://localhost:3000';
}

async function save() {
  const backendUrl = document.getElementById('backendUrl').value.trim().replace(/\/$/, '');
  await chrome.storage.local.set({ [SETTINGS_KEY]: { backendUrl } });
  document.getElementById('status').textContent = 'Configurações salvas.';
}

document.getElementById('saveBtn').addEventListener('click', save);
document.addEventListener('DOMContentLoaded', load);

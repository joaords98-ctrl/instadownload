chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "download" && message.url) {
    chrome.downloads.download({
      url: message.url,
      filename: message.filename || undefined,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true, downloadId });
    });
    return true;
  }
});

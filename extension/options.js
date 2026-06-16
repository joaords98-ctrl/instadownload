const input = document.getElementById("dashboardUrl");
const msg = document.getElementById("msg");

chrome.storage.sync.get({ dashboardUrl: "http://localhost:5173" }, (data) => {
  input.value = data.dashboardUrl;
});

document.getElementById("saveBtn").addEventListener("click", () => {
  const dashboardUrl = input.value.trim().replace(/\/$/, "");
  chrome.storage.sync.set({ dashboardUrl }, () => {
    msg.textContent = "Configuração salva.";
  });
});

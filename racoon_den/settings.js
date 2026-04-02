document.addEventListener("DOMContentLoaded", function () {
  const chatgptButton = document.getElementById("chatgpt");
  const geminiButton = document.getElementById("gemini");
  const deepseekButton = document.getElementById("deepseek");
  const statusMessage = document.getElementById("status-message");
  const statusContainer = document.getElementById("status-container");
  const currentVersionElement = document.getElementById("current-version");

  // Set version text
  const currentVersion = chrome.runtime.getManifest().version;
  if (currentVersionElement) {
    currentVersionElement.textContent = currentVersion;
  }

  // Load saved settings
  chrome.storage.sync.get("aiModel", function (data) {
    const currentModel = data.aiModel || "chatgpt";
    updateActiveButton(currentModel);
    checkStatus(currentModel);
  });

  // Click handlers
  chatgptButton.addEventListener("click", () => setModel("chatgpt"));
  geminiButton.addEventListener("click", () => setModel("gemini"));
  deepseekButton.addEventListener("click", () => setModel("deepseek"));

  function setModel(model) {
    chrome.storage.sync.set({ aiModel: model }, function () {
      updateActiveButton(model);
      checkStatus(model);
    });
  }

  function updateActiveButton(model) {
    // Reset all
    chatgptButton.classList.remove("active");
    geminiButton.classList.remove("active");
    deepseekButton.classList.remove("active");

    // Set active
    if (model === "chatgpt") chatgptButton.classList.add("active");
    else if (model === "gemini") geminiButton.classList.add("active");
    else if (model === "deepseek") deepseekButton.classList.add("active");
  }

  function checkStatus(model) {
    statusMessage.textContent = "Checking connection...";
    statusMessage.className = "";
    statusContainer.className = "status-bar";

    const urls = {
      chatgpt: "https://chatgpt.com/*",
      gemini: "https://gemini.google.com/*",
      deepseek: "https://chat.deepseek.com/*"
    };

    if (!urls[model]) return;

    chrome.tabs.query({ url: urls[model] }, (tabs) => {
      if (tabs.length > 0) {
        statusMessage.textContent = "System Ready";
        statusContainer.className = "status-bar success";
      } else {
        statusMessage.textContent = `Please open ${model} in a new tab`;
        statusContainer.className = "status-bar error";
      }
    });
  }

  // Periodic check
  setInterval(() => {
    chrome.storage.sync.get("aiModel", function (data) {
      checkStatus(data.aiModel || "chatgpt");
    });
  }, 2500);
});

const { contextBridge, ipcRenderer } = require("electron");

const CHANNELS = Object.freeze({
  status: "visionqa:runtime-status",
  capabilities: "visionqa:capabilities",
  providerSettingsGet: "visionqa:provider-settings:get",
  providerSettingsCheck: "visionqa:provider-settings:check",
  providerSettingsSave: "visionqa:provider-settings:save",
  providerSettingsClear: "visionqa:provider-settings:clear",
  providerSettingsRestart: "visionqa:provider-settings:restart",
  exportReview: "visionqa:export-review",
});

contextBridge.exposeInMainWorld("visionqaDesktop", Object.freeze({
  runtime: Object.freeze({
    getStatus: () => ipcRenderer.invoke(CHANNELS.status),
    getCapabilities: () => ipcRenderer.invoke(CHANNELS.capabilities),
  }),
  provider: Object.freeze({
    getSettings: () => ipcRenderer.invoke(CHANNELS.providerSettingsGet),
    check: () => ipcRenderer.invoke(CHANNELS.providerSettingsCheck),
    saveSettings: (input) => ipcRenderer.invoke(CHANNELS.providerSettingsSave, input),
    clearKey: () => ipcRenderer.invoke(CHANNELS.providerSettingsClear),
    restart: () => ipcRenderer.invoke(CHANNELS.providerSettingsRestart),
  }),
  exportReview: (request) => ipcRenderer.invoke(CHANNELS.exportReview, request),
}));

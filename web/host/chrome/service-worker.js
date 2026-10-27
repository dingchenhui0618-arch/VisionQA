// Keep the review surface beside the page instead of making it a one-shot
// JSON popup. Chrome remembers the side-panel width and its open state.
async function openVisionQASidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

chrome.runtime.onInstalled.addListener(() => { void openVisionQASidePanel(); });
chrome.runtime.onStartup.addListener(() => { void openVisionQASidePanel(); });
void openVisionQASidePanel();

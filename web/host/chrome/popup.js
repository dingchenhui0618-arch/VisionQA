const resultNode = document.querySelector("#result");
const reviewButton = document.querySelector("#review");
const goalNode = document.querySelector("#goal");

async function collectDomContext() {
  const clean = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  const root = document.body;
  const declared = window.__VISIONQA_HOST_CONTEXT__ || {};
  let pageUrl = location.origin;
  try {
    const url = new URL(location.href);
    // Query strings and hashes frequently carry tokens, search terms, or
    // customer identifiers. The visual reviewer only needs the stable route.
    url.search = "";
    url.hash = "";
    pageUrl = url.toString();
  } catch {
    // Keep the origin-only fallback for non-standard browser pages.
  }
  const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4"))
    .map((node) => clean(node.textContent, 180)).filter(Boolean).slice(0, 80);
  const landmarks = Array.from(document.querySelectorAll("main,nav,header,footer,aside,section"))
    .map((node) => node.getAttribute("aria-label") || node.tagName.toLowerCase()).slice(0, 40);
  const buttons = Array.from(document.querySelectorAll("button,[role=button],a"))
    .map((node) => clean(node.textContent || node.getAttribute("aria-label"), 100)).filter(Boolean).slice(0, 32);
  const cssEscape = (value) => {
    const text = String(value || "");
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(text);
    return text.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  };
  const selectorFor = (node) => {
    if (!(node instanceof Element)) return "";
    if (node.id) return `#${cssEscape(node.id)}`;
    const parts = [];
    let current = node;
    while (current && current instanceof Element && current !== document.body && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      const classes = Array.from(current.classList).filter(Boolean).slice(0, 2);
      if (classes.length) part += classes.map((name) => `.${cssEscape(name)}`).join("");
      const siblings = current.parentElement ? Array.from(current.parentElement.children).filter((item) => item.tagName === current.tagName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(" > ");
  };
  const rectFor = (node) => {
    const rect = node.getBoundingClientRect();
    return { x: Number(rect.x.toFixed(2)), y: Number(rect.y.toFixed(2)), width: Number(rect.width.toFixed(2)), height: Number(rect.height.toFixed(2)) };
  };
  const computedStyleFor = (node) => {
    const style = getComputedStyle(node);
    return {
      display: style.display,
      position: style.position,
      color: style.color,
      background_color: style.backgroundColor,
      font_family: style.fontFamily,
      font_size: style.fontSize,
      font_weight: style.fontWeight,
      line_height: style.lineHeight,
      letter_spacing: style.letterSpacing,
      border_radius: style.borderRadius,
      opacity: style.opacity,
      visibility: style.visibility,
      z_index: style.zIndex,
    };
  };
  const evidenceNodes = Array.from(document.querySelectorAll("h1,h2,h3,main,nav,header,footer,aside,section,button,[role=button],a"))
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).slice(0, 64);
  const elements = evidenceNodes.map((node, index) => ({
    id: `dom-${index + 1}`,
    selector: selectorFor(node),
    tag: node.tagName.toLowerCase(),
    role: node.getAttribute("role") || undefined,
    text: clean(node.textContent || node.getAttribute("aria-label"), 300) || undefined,
    rect: rectFor(node),
    computed_style: computedStyleFor(node),
    selected: node.hasAttribute("data-visionqa-selected") || node === document.activeElement,
  })).filter((item) => item.selector);
  const selectedElement = elements.find((item) => item.selected);
  const revisionInput = JSON.stringify({ url: pageUrl, title: document.title, text: clean(root?.innerText, 12000), elements });
  let revisionId = "unknown";
  try {
    if (crypto?.subtle && typeof TextEncoder !== "undefined") {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(revisionInput));
      revisionId = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
    }
  } catch {
    revisionId = "unknown";
  }
  const conversation = Array.isArray(declared.conversation) ? declared.conversation.slice(0, 24).map((message) => ({
    role: ["user", "assistant", "system"].includes(message?.role) ? message.role : "user",
    content: clean(message?.content, 4000),
  })).filter((message) => message.content) : [];
  return {
    title: document.title,
    url: pageUrl,
    revision_id: revisionId,
    revision_source: revisionId === "unknown" ? "unknown" : "url-dom-summary",
    viewport: { width: window.innerWidth, height: window.innerHeight, device_scale_factor: window.devicePixelRatio || 1 },
    text: clean(root?.innerText, 12000),
    headings,
    landmarks,
    interactive_summary: `交互元素：${buttons.join(" / ") || "未发现"}`,
    elements,
    selected_element: selectedElement,
    conversation,
  };
}

async function compressScreenshot(dataUrl) {
  // `captureVisibleTab` can return a multi-megabyte PNG on a HiDPI display.
  // Keep enough detail for layout review while staying below the local bridge
  // body limit. The original is used only when compression would grow it.
  const image = new Image();
  image.src = dataUrl;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("当前页面截图无法读取。"));
  });
  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  const compressed = canvas.toDataURL("image/jpeg", 0.82);
  return compressed.length < dataUrl.length ? compressed : dataUrl;
}

async function reviewCurrentTab() {
  reviewButton.disabled = true;
  resultNode.hidden = false;
  resultNode.textContent = "正在读取当前标签页…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.windowId) throw new Error("没有找到当前标签页。");
    if (/^(chrome|edge|about|devtools):\/\//i.test(tab.url || "")) {
      throw new Error("当前页面是浏览器内部页面，Chrome 不允许扩展读取它。请切换到普通网页后再评审，例如 localhost:6300/plugin。");
    }
    const [dom] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectDomContext });
    const rawScreenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const screenshot = await compressScreenshot(rawScreenshot);
    const screenshotMime = screenshot.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png";
    const capture = {
      schema_version: "visionqa-host-capture-v0.2",
      capture_id: crypto.randomUUID(),
      conversation_id: `chrome-${tab.id}`,
      host: { type: "chrome-extension", adapter_version: "0.2.0" },
      page: { url: dom.result.url, title: dom.result.title, revision_id: dom.result.revision_id, revision_source: dom.result.revision_source, viewport: dom.result.viewport },
      dom: { text: dom.result.text, headings: dom.result.headings, landmarks: dom.result.landmarks, interactive_summary: dom.result.interactive_summary, elements: dom.result.elements, selected_element: dom.result.selected_element },
      conversation: dom.result.conversation,
      intent: { goal: goalNode.value.trim() || "检查当前页面的视觉完成度", must_keep: [] },
      images: [{ role: "candidate", name: `current-visible-tab.${screenshotMime === "image/jpeg" ? "jpg" : "png"}`, mime_type: screenshotMime, data_url: screenshot }],
      permissions: { can_call_model: true, can_read_source: false, can_write_source: false },
    };
    const response = await fetch("http://localhost:6300/api/visual-review/host", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": capture.capture_id },
      body: JSON.stringify({ provider: "mock", capture }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "本次宿主评审没有完成。");
    resultNode.textContent = JSON.stringify({ decision: payload.contract?.decision, summary: payload.contract?.summary, issues: payload.contract?.issues?.length || 0, provider: payload.provider?.providerId, model: payload.provider?.modelSnapshot }, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : "本次宿主评审没有完成。";
    resultNode.textContent = message.includes("Cannot access a chrome:// URL")
      ? "当前页面是浏览器内部页面，Chrome 不允许扩展读取它。请切换到普通网页后再评审。"
      : message;
  } finally {
    reviewButton.disabled = false;
  }
}

reviewButton.addEventListener("click", reviewCurrentTab);

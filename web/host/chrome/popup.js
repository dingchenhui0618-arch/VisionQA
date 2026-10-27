const resultNode = document.querySelector("#result");
const reviewButton = document.querySelector("#review");
const settingsButton = document.querySelector("#settings");
const goalNode = document.querySelector("#goal");
let reviewedTabId = null;
let lastCaptureSnapshot = null;

const decisionLabels = {
  PASS: "可以继续",
  NEEDS_REVISION: "建议处理一下",
  MANUAL_REVIEW: "需要你确认",
  BLOCKED: "暂时不能判断",
  NEEDS_CONTEXT: "还缺少一些信息",
  NOT_ASSESSABLE: "暂时不能评估",
};

const categoryLabels = {
  hierarchy: "层级不够清楚",
  readability: "阅读不够顺畅",
  alignment: "对齐关系需要调整",
  contrast: "对比度需要确认",
  spacing: "间距关系需要调整",
  interaction: "交互提示不够明显",
  responsive: "不同屏幕下需要确认",
  provider: "当前还缺少可判断的证据",
};

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

async function digestText(value) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") return "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function humanErrorMessage(message) {
  const text = String(message || "");
  if (text.includes("真实宿主评审") || text.includes("localhost 模型调用门控") || text.includes("视觉模型尚未开启") || text.includes("local Qwen") || text.includes("local canary") || text.includes("服务端配置")) {
    return "当前没有开启可用的视觉模型，所以这次没有形成判断。请在 VisionQA 桌面设置中开启模型后再试；当前页面没有被修改。";
  }
  if (text.includes("Provider") || text.includes("多模态 API")) {
    return "视觉模型暂时没有完成这次判断。请检查桌面端模型配置后再试；当前页面没有被修改。";
  }
  if (text.includes("浏览器内部页面") || text.includes("Chrome 不允许扩展读取")) {
    return "当前页面不允许扩展读取。请切换到普通网页后再评审；当前页面没有被修改。";
  }
  return "本次检查没有完成。请稍后再试；当前页面没有被修改。";
}

function humanErrorAction(message) {
  const text = String(message || "");
  return text.includes("Provider") || text.includes("多模态 API") || text.includes("模型") || text.includes("local Qwen") || text.includes("local canary") || text.includes("服务端配置")
    ? "settings"
    : "retry";
}

async function focusEvidence(selector) {
  if (!reviewedTabId || !selector) return;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: reviewedTabId },
      args: [selector],
      func: (targetSelector) => {
        const node = document.querySelector(targetSelector);
        if (!node) return { found: false };
        node.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        const previousOutline = node.style.outline;
        const previousOffset = node.style.outlineOffset;
        node.style.outline = "2px solid currentColor";
        node.style.outlineOffset = "3px";
        window.setTimeout(() => {
          node.style.outline = previousOutline;
          node.style.outlineOffset = previousOffset;
        }, 1800);
        return { found: true };
      },
    });
    if (!result?.result?.found) throw new Error("页面中没有找到这处位置，可能页面已经发生变化。");
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法定位页面位置。";
    const notice = document.createElement("p");
    notice.className = "meta";
    notice.textContent = message;
    resultNode.appendChild(notice);
  }
}

function describeRevision(currentSnapshot) {
  if (!lastCaptureSnapshot) return "首次检查";
  if (lastCaptureSnapshot.revision_id === currentSnapshot.revision_id) return "当前可见区域的截图和结构摘要未变化";
  const changes = [];
  if (lastCaptureSnapshot.screenshot_digest && currentSnapshot.screenshot_digest && lastCaptureSnapshot.screenshot_digest !== currentSnapshot.screenshot_digest) changes.push("当前可见截图有变化");
  if (lastCaptureSnapshot.viewport && currentSnapshot.viewport && (lastCaptureSnapshot.viewport.width !== currentSnapshot.viewport.width || lastCaptureSnapshot.viewport.height !== currentSnapshot.viewport.height || lastCaptureSnapshot.viewport.device_scale_factor !== currentSnapshot.viewport.device_scale_factor)) changes.push("当前视口尺寸有变化");
  if (lastCaptureSnapshot.headings.join(" / ") !== currentSnapshot.headings.join(" / ")) changes.push("标题有变化");
  const elementDelta = currentSnapshot.elements.length - lastCaptureSnapshot.elements.length;
  if (elementDelta) changes.push("页面布局有变化");
  if (lastCaptureSnapshot.interactive_summary !== currentSnapshot.interactive_summary) changes.push("页面操作入口有变化");
  const previousBySelector = new Map(lastCaptureSnapshot.elements.map((element) => [element.selector, element]));
  const moved = currentSnapshot.elements.filter((element) => {
    const previous = previousBySelector.get(element.selector);
    if (!previous) return false;
    return ["x", "y", "width", "height"].some((key) => Math.abs(Number(element.rect?.[key] || 0) - Number(previous.rect?.[key] || 0)) > 1);
  }).length;
  if (moved) changes.push(`${moved} 个页面位置发生变化`);
  const styleChanged = currentSnapshot.elements.filter((element) => {
    const previous = previousBySelector.get(element.selector);
    if (!previous) return false;
    return JSON.stringify(element.computed_style || {}) !== JSON.stringify(previous.computed_style || {});
  }).length;
  if (styleChanged) changes.push(`${styleChanged} 个元素的样式发生变化`);
  return `当前可见区域或页面结构有变化${changes.length ? `：${changes.join("、")}` : ""}`;
}

function renderResult(payload, capturedRevisionId, currentSnapshot, screenshotDataUrl) {
  const contract = payload?.contract;
  if (!contract) {
    resultNode.className = "result is-error";
    resultNode.innerHTML = `<strong>没有形成判断</strong><p>当前页面的评审结果不完整，请重新检查。</p>`;
    return;
  }
  const ui = payload.ui_result;
  const issues = Array.isArray(ui?.issues) ? ui.issues.slice(0, 3) : Array.isArray(contract.issues) ? contract.issues.slice(0, 3).map((issue) => ({ title: categoryLabels[issue.category] || "有一处视觉问题需要看一下", summary: issue.evidence?.[0]?.description || "当前证据指出这里需要进一步确认。", nextStep: issue.suggested_fix, evidence: issue.evidence?.slice(0, 1).map((item) => ({ description: item.description })) || [] })) : [];
  const revision = capturedRevisionId || ui?.revision_id || payload.host_capture?.page_revision_id || contract.revision_id || "当前页面";
  const revisionMessage = describeRevision(currentSnapshot);
  const issueHtml = issues.map((issue) => {
    const evidence = issue.evidence?.[0];
    const locateButton = evidence?.selector ? `<button class="evidence-link" type="button" data-selector="${escapeHtml(evidence.selector)}">定位页面位置</button>` : "";
    return `<div class="issue"><strong>${escapeHtml(issue.title || "有一处视觉问题需要看一下")}</strong>${issue.summary ? `<p class="summary">${escapeHtml(issue.summary)}</p>` : ""}<p class="next-step">下一步：${escapeHtml(issue.nextStep || "先确认这处问题，再决定下一步。")}</p>${evidence ? `<small>${escapeHtml(evidence.label || "证据")} · ${escapeHtml(evidence.description)}</small>` : ""}${locateButton}</div>`;
  }).join("");
  const previewOnly = ui?.preview_only || payload.provider?.warnings?.some((warning) => String(warning).includes("FIXTURE"));
  resultNode.className = `result${previewOnly ? " is-preview" : ""}`;
  resultNode.innerHTML = `<figure class="capture-preview"><img alt="本次检查的当前页面截图" /><figcaption>${escapeHtml(currentSnapshot.title || "当前页面")}</figcaption></figure><h2>${escapeHtml(decisionLabels[ui?.decision] || decisionLabels[contract.decision] || "检查完成")}</h2><p>${escapeHtml(ui?.summary || contract.summary)}</p><div class="meta">已读取当前页面截图和页面内容 · ${escapeHtml(revisionMessage)}</div>${issueHtml || `<p>当前没有单独列出的视觉问题。</p>`}<div class="next"><strong>下一步</strong><br />${escapeHtml(ui?.next_step || contract.repair_plan?.operations?.[0]?.action || "请结合当前页面确认结果；插件不会自动修改页面。")}<br />${previewOnly ? "当前只确认了输入，没有形成正式视觉判断。" : ""}<button class="evidence-link" type="button" data-action="review">重新评审当前页面</button></div><details class="technical-details"><summary>查看检查依据</summary><small>页面识别记录：${escapeHtml(revision)}<br />评审依据：当前页面截图、页面内容和已声明的上下文</small></details>`;
  const previewImage = resultNode.querySelector(".capture-preview img");
  if (previewImage && screenshotDataUrl) previewImage.src = screenshotDataUrl;
  resultNode.querySelectorAll("[data-selector]").forEach((button) => button.addEventListener("click", () => focusEvidence(button.dataset.selector)));
  resultNode.querySelector('[data-action="review"]')?.addEventListener("click", reviewCurrentTab);
  lastCaptureSnapshot = currentSnapshot;
}

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
    resultNode.className = "result";
    resultNode.textContent = "正在读取当前页面…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.windowId) throw new Error("没有找到当前标签页。");
    reviewedTabId = tab.id;
    if (/^(chrome|edge|about|devtools):\/\//i.test(tab.url || "")) {
      throw new Error("当前页面是浏览器内部页面，Chrome 不允许扩展读取它。请切换到普通网页后再评审，例如 localhost:6300/plugin。");
    }
    const [dom] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectDomContext });
    const rawScreenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const screenshot = await compressScreenshot(rawScreenshot);
    const screenshotDigest = await digestText(screenshot);
    const combinedRevisionId = await digestText(JSON.stringify({
      dom_revision_id: dom.result.revision_id,
      viewport: dom.result.viewport,
      screenshot_digest: screenshotDigest,
    }));
    const revisionSource = combinedRevisionId === "unknown" ? "unknown" : "url-dom-summary+viewport+image-digest";
    const screenshotMime = screenshot.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png";
    const capture = {
      schema_version: "visionqa-host-capture-v0.2",
      capture_id: crypto.randomUUID(),
      conversation_id: `chrome-${tab.id}`,
      host: { type: "chrome-extension", adapter_version: "0.2.0" },
      page: { url: dom.result.url, title: dom.result.title, revision_id: combinedRevisionId, revision_source: revisionSource, viewport: dom.result.viewport },
      dom: { text: dom.result.text, headings: dom.result.headings, landmarks: dom.result.landmarks, interactive_summary: dom.result.interactive_summary, elements: dom.result.elements, selected_element: dom.result.selected_element },
      conversation: dom.result.conversation,
      intent: { goal: goalNode.value.trim() || "检查当前页面的视觉完成度", must_keep: [] },
      images: [{ role: "candidate", name: `current-visible-tab.${screenshotMime === "image/jpeg" ? "jpg" : "png"}`, mime_type: screenshotMime, data_url: screenshot }],
      permissions: { can_call_model: true, can_read_source: false, can_write_source: false },
    };
    let response;
    let lastError;
    for (const base of ["http://localhost:6300", "http://localhost:6301"]) {
      try {
        const candidateResponse = await fetch(`${base}/api/visual-review/host`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-request-id": capture.capture_id },
          body: JSON.stringify({ provider: "auto", capture }),
        });
        if (candidateResponse.ok || candidateResponse.status >= 400 && candidateResponse.status !== 404) {
          response = candidateResponse;
          break;
        }
        lastError = new Error(`本地服务 ${base} 没有提供评审接口。`);
      } catch (error) {
        lastError = error;
      }
    }
    if (!response) throw lastError || new Error("本地服务没有响应，请确认 VisionQA 已启动。");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "本次宿主评审没有完成。");
    renderResult(payload, combinedRevisionId, { title: dom.result.title, revision_id: combinedRevisionId, headings: dom.result.headings, elements: dom.result.elements, interactive_summary: dom.result.interactive_summary, viewport: dom.result.viewport, screenshot_digest: screenshotDigest }, screenshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "本次宿主评审没有完成。";
    resultNode.className = "result is-error";
    const action = humanErrorAction(message);
    resultNode.innerHTML = `<strong>这次没有完成</strong><p>${escapeHtml(message.includes("Cannot access a chrome:// URL")
      ? "当前页面是浏览器内部页面，Chrome 不允许扩展读取它。请切换到普通网页后再评审。"
      : humanErrorMessage(message))}</p><button class="evidence-link" type="button" data-action="${action}">${action === "settings" ? "查看本机设置说明" : "重新试一次"}</button>`;
    resultNode.querySelector('[data-action="retry"]')?.addEventListener("click", reviewCurrentTab);
    resultNode.querySelector('[data-action="settings"]')?.addEventListener("click", () => settingsButton?.click());
  } finally {
    reviewButton.disabled = false;
  }
}

reviewButton.addEventListener("click", reviewCurrentTab);
settingsButton?.addEventListener("click", () => {
  chrome.tabs.create({ url: "http://localhost:6300/plugin?tab=settings" });
});

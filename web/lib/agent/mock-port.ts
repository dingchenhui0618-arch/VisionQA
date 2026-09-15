import { applyMock, emptyMock, MOCK_SCHEMA, type ConversationPort, type MockSnapshot } from "./mock-contract.ts";
import { createMockProviderRuntime } from "./provider-runtime.ts";

// Deliberately separate from beta cookies, server assets, wallets and all providers.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("visionqa-conversation-mock-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("浏览器无法打开模拟存储。请允许本站使用浏览器存储后刷新，不会清空原工作台数据。"));
  });
}
export function createMockPort(): ConversationPort {
  let observedRevision = 0;
  return {
    mode: "mock",
    async load() {
      const db = await database();
      try {
        return await new Promise<MockSnapshot>((resolve, reject) => {
          const request = db.transaction("state").objectStore("state").get("snapshot");
          request.onsuccess = () => {
            const state = request.result;
            if (state && (state.schema !== MOCK_SCHEMA || !Array.isArray(state.conversations) || !Array.isArray(state.receipts))) reject(new Error("模拟记录版本不兼容，已保留原记录，请联系开发者。"));
            else { observedRevision = state?.storageRevision ?? 0; resolve(state ?? emptyMock()); }
          };
          request.onerror = () => reject(new Error("读取模拟记录失败，请刷新重试。"));
        });
      } finally { db.close(); }
    },
    async save(state) {
      const db = await database();
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction("state", "readwrite");
          const objectStore = transaction.objectStore("state");
          const read = objectStore.get("snapshot");
          let conflict = false;
          const revision = observedRevision + 1;
          read.onsuccess = () => {
            if ((read.result?.storageRevision ?? 0) !== observedRevision) { conflict = true; transaction.abort(); return; }
            objectStore.put({ ...state, storageRevision: revision }, "snapshot");
          };
          transaction.oncomplete = () => { observedRevision = revision; state.storageRevision = revision; resolve(); };
          transaction.onerror = transaction.onabort = () => reject(new Error(conflict ? "另一个标签页已更新模拟记录。本次没有覆盖，请刷新后继续。" : "模拟记录未保存，可能是浏览器空间不足。本次操作未确认，请减少图片大小后重试。"));
        });
      } finally { db.close(); }
    },
    async execute(state, conversationId, commandId, command) {
      // The mock uses the same provider contract as live execution, with a
      // deterministic in-process executor and no network or model SDK.
      if (command.kind === "screen" || command.kind === "repair") {
        const runtime = createMockProviderRuntime({ respond: () => {
          if (command.kind === "repair" && command.fail) throw { code: "NETWORK", message: "simulated connection failure", retryable: true };
          return { mode: "MOCK_ONLY", command: command.kind };
        } });
        const result = await runtime.dispatch({
          request: `mock-${command.kind}:${commandId}`,
          project: conversationId ? `mock-project:${conversationId}` : null,
          conversation: conversationId,
          operation: command.kind === "repair" ? "IMAGE" : "SCREENING",
          idempotency: commandId,
          confirmed: command.kind !== "repair" || !command.fail,
        });
        if (!result.ok && !(command.kind === "repair" && command.fail)) throw new Error(result.error.message);
        await new Promise(resolve => setTimeout(resolve, 650));
      }
      const next = applyMock(state, conversationId, commandId, command);
      await this.save(next);
      return next;
    },
  };
}

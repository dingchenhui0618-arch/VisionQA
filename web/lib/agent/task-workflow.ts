import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const taskInput = z.object({
  objective: z.string().trim().min(1).max(2000),
  skuName: z.string().trim().min(1).max(100),
});
const output = z.object({ projectId: z.string().nullable(), stopped: z.boolean() });

// Only the trusted server supplies tools. Text/model output cannot select arbitrary code.
export async function createVisualTaskWorkflow(createProject: (name: string) => Promise<string>) {
  const storageId = crypto.randomUUID();
  const directory = path.resolve("work/agent-snapshots");
  await mkdir(directory, { recursive: true });
  const storage = new LibSQLStore({ id: storageId, url: pathToFileURL(path.join(directory, `${storageId}.db`)).href });
  await storage.init();
  const approval = createStep({
    id: "confirm-project",
    inputSchema: taskInput,
    outputSchema: taskInput.extend({ approved: z.boolean() }),
    resumeSchema: z.object({ approved: z.boolean() }),
    suspendSchema: z.object({ objective: z.string(), action: z.string() }),
    execute: async ({ inputData, resumeData, suspend }) => {
      if (!resumeData) return suspend({ objective: inputData.objective, action: "建立本地 SKU 项目；不调用模型、不扣额度" });
      return { ...inputData, approved: resumeData.approved };
    },
  });
  const execute = createStep({
    id: "create-project",
    inputSchema: taskInput.extend({ approved: z.boolean() }),
    outputSchema: output,
    execute: async ({ inputData }) => {
      if (!inputData.approved) return { projectId: null, stopped: true };
      return { projectId: await createProject(inputData.skuName), stopped: false };
    },
  });
  const workflow = createWorkflow({ id: "visual-task-v1", inputSchema: taskInput, outputSchema: output })
    .then(approval).then(execute).commit();
  // Local proof only: snapshots survive page refresh, not server restart.
  const mastra = new Mastra({
    workflows: { visualTask: workflow },
    storage,
    logger: false,
  });
  // Workflow has a .then() builder method: never return it bare from an async
  // function, where Promise resolution would treat it as a thenable.
  return { workflow: mastra.getWorkflow("visualTask") };
}

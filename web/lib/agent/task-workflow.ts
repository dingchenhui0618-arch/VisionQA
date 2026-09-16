import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

export const taskInput = z.object({
  objective: z.string().trim().min(1).max(2000),
  skuName: z.string().trim().min(1).max(100),
});
const output = z.object({ projectId: z.string().nullable(), stopped: z.boolean() });

// Only the trusted server supplies tools. Text/model output cannot select arbitrary code.
export async function createVisualTaskWorkflow(createProject: (name: string) => Promise<string>, databasePath?: string) {
  const storageId = crypto.randomUUID();
  const database = databasePath ?? path.resolve("work/agent-snapshots", `${storageId}.db`);
  const directory = path.dirname(database);
  await mkdir(directory, { recursive: true });
  const storage = new LibSQLStore({ id: storageId, url: pathToFileURL(database).href });
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
  // Stable database/run identity is supplied by the local task adapter below.
  const mastra = new Mastra({
    workflows: { visualTask: workflow },
    storage,
    logger: false,
  });
  // Workflow has a .then() builder method: never return it bare from an async
  // function, where Promise resolution would treat it as a thenable.
  return { workflow: mastra.getWorkflow("visualTask"), close: () => storage.close() };
}

// Local single-process adapter. Owner is supplied by authenticated server code,
// taskId identifies a plan revision; conversationId alone would replay old plans.
export async function preparePersistentVisualTask(
  input: { owner: string; taskId: string; skuName: string; objective: string },
  createProject: (name: string) => Promise<string>,
  directory = path.resolve("work/agent-snapshots"),
) {
  const payload = taskInput.parse(input);
  const runId = createHash("sha256").update(JSON.stringify([input.owner, input.taskId])).digest("hex");
  const database = path.join(directory, `${runId}.db`);
  const access = async (approved?: boolean) => {
    const { workflow, close } = await createVisualTaskWorkflow(createProject, database);
    try {
      let state = await workflow.getWorkflowRunById(runId);
      const run = await workflow.createRun({ runId });
      if (!state) {
        if (approved !== undefined) throw new Error("Missing approval snapshot");
        const started = await run.start({ inputData: payload });
        if (started.status !== "suspended") throw new Error("Workflow did not suspend");
        state = await workflow.getWorkflowRunById(runId);
      }
      if (!state || JSON.stringify(state.payload) !== JSON.stringify(payload)) throw new Error("Workflow input mismatch");
      if (state.status === "success") return output.parse(state.result);
      if (state.status !== "suspended") throw new Error("Workflow requires manual recovery");
      if (approved === undefined) return;
      const result = await run.resume({ step: "confirm-project", resumeData: { approved } });
      if (result.status !== "success") throw new Error("Workflow did not complete");
      return output.parse(result.result);
    } finally { await close(); }
  };
  await access();
  return { approve: async (approved: boolean) => {
    const result = await access(approved);
    if (!result) throw new Error("Missing workflow result");
    return result;
  } };
}

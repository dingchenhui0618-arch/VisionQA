import { requireBetaSessionFromRequest } from "../../../../lib/beta/auth";
import { getBetaService } from "../../../../lib/beta/service";
import { TaskSessions, TaskSessionError } from "../../../../lib/agent/task-session";

const tasks = new TaskSessions();
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
function localOnly(request: Request) {
  if (process.env.NODE_ENV === "production") return false;
  const url = new URL(request.url);
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && (!request.headers.get("origin") || request.headers.get("origin") === url.origin);
}
export async function GET(request: Request) {
  if (!localOnly(request)) return respond({ error: "此入口仅供本地开发。" }, 404);
  try {
    const session = await requireBetaSessionFromRequest(request);
    return respond({ tasks: tasks.list(`${session.tenantId}:${session.userId}`) });
  } catch { return respond({ error: "请先登录本地体验账号，再返回这里。" }, 401); }
}
export async function POST(request: Request) {
  if (!localOnly(request)) return respond({ error: "此入口仅供本地开发。" }, 404);
  let session;
  try { session = await requireBetaSessionFromRequest(request); }
  catch { return respond({ error: "请先登录本地体验账号，再返回这里。" }, 401); }
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 5000) return respond({ error: "任务描述太长，请控制在 2000 字以内。" }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch { return respond({ error: "任务格式不正确。" }, 400); }
  const owner = `${session.tenantId}:${session.userId}`;
  try {
    if (body.action === "create") {
      if (typeof body.objective !== "string" || typeof body.skuName !== "string" || (body.parentId !== undefined && typeof body.parentId !== "string")) {
        return respond({ error: "请填写 SKU 名称和任务目标。" }, 400);
      }
      const task = await tasks.create(owner, body, {
        plan: async input => {
          const { planWithDeepSeek } = await import("../../../../lib/agent/conversation-planner");
          return planWithDeepSeek(input);
        },
        prepare: async input => {
          const { createVisualTaskWorkflow } = await import("../../../../lib/agent/task-workflow");
          const { workflow } = await createVisualTaskWorkflow(async name => getBetaService().createProject(session, name).id);
          const run = await workflow.createRun();
          const result = await run.start({ inputData: input });
          if (result.status !== "suspended") throw new Error("Workflow did not suspend");
          return { approve: async approved => {
            const result = await run.resume({ step: "confirm-project", resumeData: { approved } });
            if (result.status !== "success") throw new Error("Workflow did not complete");
            return result.result;
          } };
        },
      });
      return respond({ task });
    }
    if (body.action !== "approve" && body.action !== "stop") return respond({ error: "不支持这个操作。" }, 400);
    return respond({ task: await tasks.act(owner, body.id, body.action) });
  } catch (error) {
    return error instanceof TaskSessionError ? respond({ error: error.message }, error.status)
      : respond({ error: "任务未完成，请刷新后查看任务状态。" }, 500);
  }
}

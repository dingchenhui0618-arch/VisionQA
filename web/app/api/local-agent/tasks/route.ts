import { requireBetaSessionFromRequest } from "../../../../lib/beta/auth";
import { getBetaService } from "../../../../lib/beta/service";
import { TaskSessions, TaskSessionError } from "../../../../lib/agent/task-session";
import { localStateStore } from "../../../../lib/beta/local-state";
import { CustomerVisibleError } from "../../../../lib/beta/contracts";

let taskSessions: TaskSessions | undefined;
function sessions() {
  return taskSessions ??= new TaskSessions(process.env.VISIONQA_AGENT_LOCAL === "true" && process.env.NODE_ENV !== "production" ? localStateStore("conversations") : undefined);
}
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const sessionFailure = (error: unknown) => error instanceof CustomerVisibleError && error.status === 401
  ? respond({ error: "请先登录本地体验账号，再返回这里。" }, 401)
  : respond({ error: "本地数据暂时无法读取，请检查存储后重启服务；不要重复提交任务。" }, 503);
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
    return respond({ tasks: sessions().list(`${session.tenantId}:${session.userId}`) });
  } catch (error) { return sessionFailure(error); }
}
export async function POST(request: Request) {
  if (!localOnly(request)) return respond({ error: "此入口仅供本地开发。" }, 404);
  let session;
  try { session = await requireBetaSessionFromRequest(request); }
  catch (error) { return sessionFailure(error); }
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 5000) return respond({ error: "任务描述太长，请控制在 2000 字以内。" }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch { return respond({ error: "任务格式不正确。" }, 400); }
  const owner = `${session.tenantId}:${session.userId}`;
  const prepare = async (input: { skuName: string; objective: string; conversationId: string }) => {
    const { createVisualTaskWorkflow } = await import("../../../../lib/agent/task-workflow");
    const { workflow } = await createVisualTaskWorkflow(async name => getBetaService().createProjectForConversation(session, name, input.conversationId).id);
    const run = await workflow.createRun();
    const result = await run.start({ inputData: { skuName: input.skuName, objective: input.objective } });
    if (result.status !== "suspended") throw new Error("Workflow did not suspend");
    return { approve: async (approved: boolean) => {
      const result = await run.resume({ step: "confirm-project", resumeData: { approved } });
      if (result.status !== "success") throw new Error("Workflow did not complete");
      return result.result;
    } };
  };
  try {
    if (body.action === "create") {
      if (typeof body.objective !== "string" || typeof body.skuName !== "string" || (body.parentId !== undefined && typeof body.parentId !== "string")) {
        return respond({ error: "请填写 SKU 名称和任务目标。" }, 400);
      }
      const task = await sessions().create(owner, body, {
        plan: async input => {
          const { planWithDeepSeek } = await import("../../../../lib/agent/conversation-planner");
          return planWithDeepSeek(input);
        },
        prepare,
      });
      return respond({ task });
    }
    if (body.action !== "approve" && body.action !== "stop") return respond({ error: "不支持这个操作。" }, 400);
    return respond({ task: await sessions().act(owner, body.id, body.action, prepare) });
  } catch (error) {
    return error instanceof TaskSessionError ? respond({ error: error.message }, error.status)
      : respond({ error: "任务未完成，请刷新后查看任务状态。" }, 500);
  }
}

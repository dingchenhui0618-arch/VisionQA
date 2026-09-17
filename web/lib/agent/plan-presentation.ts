import type { TaskView } from "./conversation-contract.ts";

/** Display guidance only: never authorizes execution or infers image completion. */
export function planPresentation(task: Pick<TaskView, "status" | "projectId">) {
  const states: Record<TaskView["status"], { label: string; next: string }> = {
    STARTING: { label: "正在整理", next: "等待需求整理完成，不会自动执行修图。" },
    NEEDS_INPUT: { label: "需要补充", next: "先回答对话中的问题，再确认处理范围。" },
    UNSUPPORTED: { label: "暂不支持", next: "当前不能执行这项需求，可以在对话中调整目标。" },
    AWAITING_APPROVAL: { label: "待你确认", next: task.projectId ? "确认本轮范围后，继续使用已有商品素材。" : "确认后建立商品项目，再添加参考图和待检查图。" },
    PROJECT_READY: { label: "计划已确认", next: "进入商品工作区，检查素材或继续修图与选版。图片尚需独立执行与复验。" },
    STOPPED: { label: "本轮已停止", next: "这份计划不再执行；可以在对话中提出新的需求。" },
    SUPERSEDED: { label: "旧计划", next: "请以最新一轮计划为准；旧计划仅保留供回看。" },
    FAILED: { label: "计划未完成", next: "保留原需求，可重试规划；这不是图片处理结论。" },
  };
  return { ...states[task.status], canApprove: task.status === "AWAITING_APPROVAL", canOpenWorkspace: Boolean(task.projectId) };
}

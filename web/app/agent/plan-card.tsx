import type { TaskView } from "../../lib/agent/conversation-contract";
import { planPresentation } from "../../lib/agent/plan-presentation";

export function PlanCard({ task, working, hasDraft, onApprove, onStop, onRevise }: {
  task: TaskView; working: boolean; hasDraft: boolean;
  onApprove: () => void; onStop: () => void; onRevise: () => void;
}) {
  if (!task.plan) return null;
  const view = planPresentation(task);
  return <details className="agent-lab__plan" open={view.canApprove || task.status === "NEEDS_INPUT"}>
    <summary>本轮处理计划 <span>{view.label}</span></summary>
    <div className="agent-plan__scope">
      <section><h3>这次要完成</h3>{task.plan.changes.length ? <ul>{task.plan.changes.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>处理目标尚未明确，请先补充需求。</p>}</section>
      <section><h3>这些保持不变</h3>{task.plan.preserve.length ? <ul>{task.plan.preserve.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>尚未指定。修图前请结合商品参考确认。</p>}</section>
    </div>
    {task.plan.decision === "READY" && <><h3>执行后在哪里看结果</h3>
    <dl className="agent-plan__outputs">
      <div><dt>检查结果</dt><dd>提交筛查后，逐张查看问题与证据。</dd></div>
      <div><dt>修图与版本</dt><dd>另行确认修图后，对比候选、继续修改或下载。</dd></div>
    </dl></>}
    <p className="agent-plan__boundary">这是处理计划，不是已检查或已修好的结果。确认计划不发送图片、不扣修图额度；筛查另行确认，修图成功返回并通过基础检查后扣 1 次。</p>
    <p role="status"><strong>下一步：</strong>{view.next}</p>
    <div className="agent-lab__actions">
      {view.canApprove && <><button disabled={working || hasDraft} onClick={onApprove}>{task.projectId ? "确认本轮计划" : "确认计划，添加图片"}</button><button className="secondary" disabled={working} onClick={onStop}>暂不执行</button></>}
      <button className="secondary" disabled={working} onClick={onRevise}>补充或调整要求</button>
      {view.canOpenWorkspace && !view.canApprove && <button className="secondary" onClick={() => { const workspace = document.getElementById("agent-product-workspace"); workspace?.scrollIntoView({ block: "start" }); workspace?.focus({ preventScroll: true }); }}>查看商品工作区</button>}
    </div>
    {view.canApprove && hasDraft && <p role="status">输入框里还有未发送的补充，请先发送，避免确认旧计划。</p>}
  </details>;
}

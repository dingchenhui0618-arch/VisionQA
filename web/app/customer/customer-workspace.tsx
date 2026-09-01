"use client";

import { useState } from "react";
import type { BetaProject, CreditBalance, BetaSessionView } from "../../lib/beta/contracts";
import { CustomerShell } from "./customer-shell";

export function CustomerWorkspace({
  session,
  initialCredits,
  initialProjects,
}: {
  session: BetaSessionView;
  initialCredits: CreditBalance;
  initialProjects: BetaProject[];
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function createProject() {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "新 SKU 检查批次" }),
      });
      const payload = (await response.json()) as { project?: BetaProject; error?: { message?: string } };
      if (!response.ok || !payload.project) throw new Error(payload.error?.message ?? "项目没有建立成功。");
      window.location.assign(`/workspace/projects/${payload.project.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "项目没有建立成功。");
      setCreating(false);
    }
  }

  const pendingCount = initialProjects.reduce((total, project) => total + project.attentionCount, 0);
  const completedCount = initialProjects.reduce((total, project) => total + project.repairedCount, 0);

  return (
    <CustomerShell session={session} credits={initialCredits}>
      <main className="customer-dashboard">
        <section className="customer-dashboard__intro">
          <div>
            <p className="customer-eyebrow">你的商品图工作区</p>
            <h1>先建立一个 SKU 检查批次。</h1>
            <p>上传商品真值和同用途候选图，系统会先免费筛出最需要处理的图片。</p>
          </div>
          <button className="customer-primary" type="button" onClick={createProject} disabled={creating}>
            {creating ? "正在建立…" : "新建检查批次"}<span aria-hidden>→</span>
          </button>
        </section>

        {error ? <div className="customer-message is-error" role="alert">{error}</div> : null}

        <section className="customer-dashboard__summary" aria-label="工作区概况">
          <div><span>内测额度</span><strong>{initialCredits.available}</strong><small>修图成功后扣次</small></div>
          <div><span>待处理图片</span><strong>{pendingCount}</strong><small>来自最近筛查</small></div>
          <div><span>已完成修正版</span><strong>{completedCount}</strong><small>等待或已经下载</small></div>
        </section>

        <section className="customer-dashboard__recent" aria-labelledby="recent-title">
          <div className="customer-section-head">
            <div>
              <p className="customer-eyebrow">最近 SKU</p>
              <h2 id="recent-title">从上次停下的位置继续</h2>
            </div>
            <span>{initialProjects.length} 个项目</span>
          </div>
          {initialProjects.length ? (
            <div className="customer-project-list">
              {initialProjects.map((project) => (
                <a key={project.id} href={`/workspace/projects/${project.id}`} className="customer-project-row">
                  <div>
                    <strong>{project.name}</strong>
                    <span>{project.isExample ? "示例 SKU · " : ""}{project.candidateCount ? `${project.candidateCount} 张候选` : "尚未上传候选图"}</span>
                  </div>
                  <div className="customer-project-row__state">
                    <span><i className={`is-${project.status.toLowerCase()}`} aria-hidden />{projectStatus(project.status)}</span>
                    <small>{formatDate(project.updatedAt)}</small>
                  </div>
                  <span aria-hidden>→</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="customer-empty">
              <strong>还没有检查批次</strong>
              <p>建立后，项目会自动保存。刷新或重新登录不会让你回到错误的深层步骤。</p>
            </div>
          )}
        </section>

        <aside className="customer-next-card">
          <span className="customer-next-card__mark" aria-hidden>→</span>
          <div><strong>下一步</strong><p>点击“新建检查批次”，先准备 1–4 张商品真值图和最多 10 张同用途候选图。</p></div>
        </aside>
      </main>
    </CustomerShell>
  );
}

function projectStatus(status: BetaProject["status"]): string {
  return { DRAFT: "待上传", SCREENING: "筛查中", REPAIRING: "待修正", COMPLETED: "已完成" }[status];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
